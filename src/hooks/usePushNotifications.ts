"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    deletePushSubscription,
    getPushRegistrationStatus,
    savePushSubscription,
    sendTestPush,
} from "@/actions/push";

/**
 * ============================================================================
 * PUSH NOTIFICATION SUBSCRIPTION (client half)
 *
 * Owns the browser-side lifecycle: capability detection, the permission
 * prompt, PushManager subscribe/unsubscribe, and keeping the server's copy of
 * the endpoint in step with the browser's.
 *
 * The re-sync on mount is not redundant. A browser may silently rotate a
 * subscription while the app is closed; the service worker re-subscribes but
 * cannot reach a server action to persist the new endpoint (see the
 * pushsubscriptionchange note in src/app/sw.ts). Pushing the current
 * subscription up on every mount is what closes that loop, and it is cheap
 * because savePushSubscription upserts on the endpoint.
 * ============================================================================
 */

export type PushState =
    /** Still working out what this browser can do. */
    | "loading"
    /** No service worker / PushManager — e.g. a desktop browser in private mode. */
    | "unsupported"
    /** iOS Safari, not installed to the home screen. Push is impossible until it is. */
    | "needs-install"
    /** Server has no VAPID keys; nothing the user can do. */
    | "not-configured"
    /** Supported and available, but this device isn't registered. */
    | "off"
    /** Registered and receiving. */
    | "on"
    /** The user (or their OS) blocked notifications; must be undone in browser settings. */
    | "blocked";

/** VAPID keys are base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(normalised);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

/** True on an iPhone/iPad that has NOT been added to the home screen. */
function isIosBrowserTab(): boolean {
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
    if (!isIos) return false;
    const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return !standalone;
}

/** Flattens a browser PushSubscription into the shape the server stores. */
function serialise(sub: PushSubscription) {
    const json = sub.toJSON();
    return {
        endpoint: sub.endpoint,
        keys: {
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
        },
    };
}

export function usePushNotifications() {
    const [state, setState] = useState<PushState>("loading");
    const [deviceCount, setDeviceCount] = useState(0);
    const [busy, setBusy] = useState(false);
    const publicKeyRef = useRef<string | null>(null);
    /** Guards against a state update after unmount during the async bootstrap. */
    const aliveRef = useRef(true);

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    const bootstrap = useCallback(async () => {
        // Capability first — these checks are free and rule out most of the
        // states without a round trip.
        if (typeof window === "undefined") return;
        if (isIosBrowserTab()) {
            setState("needs-install");
            return;
        }
        if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
            setState("unsupported");
            return;
        }

        let status: Awaited<ReturnType<typeof getPushRegistrationStatus>>;
        try {
            status = await getPushRegistrationStatus();
        } catch {
            if (aliveRef.current) setState("unsupported");
            return;
        }
        if (!aliveRef.current) return;

        publicKeyRef.current = status.publicKey;
        setDeviceCount(status.deviceCount);

        if (!status.configured || !status.publicKey) {
            setState("not-configured");
            return;
        }
        if (Notification.permission === "denied") {
            setState("blocked");
            return;
        }

        // In development the service worker is disabled (see next.config.ts),
        // so getRegistration() resolves undefined and push genuinely is
        // unavailable. Reporting "unsupported" is honest — testing this feature
        // requires `npm run build && npm start`.
        const registration = await navigator.serviceWorker.getRegistration();
        if (!aliveRef.current) return;
        if (!registration) {
            setState("unsupported");
            return;
        }

        const existing = await registration.pushManager.getSubscription();
        if (!aliveRef.current) return;

        if (!existing) {
            setState("off");
            return;
        }

        // Registered locally — make sure the server agrees. This repairs an
        // endpoint the browser rotated while the app was closed.
        const result = await savePushSubscription(serialise(existing));
        if (!aliveRef.current) return;
        if (result.success) setDeviceCount(result.data.deviceCount);
        setState("on");
    }, []);

    useEffect(() => {
        void bootstrap();
    }, [bootstrap]);

    const enable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        setBusy(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                setState(permission === "denied" ? "blocked" : "off");
                return { ok: false, error: "Notification permission was not granted." };
            }

            const registration = await navigator.serviceWorker.ready;
            const key = publicKeyRef.current;
            if (!key) return { ok: false, error: "Server is missing its notification keys." };

            // Reuse an existing browser subscription rather than minting a
            // second one for the same device.
            const sub =
                (await registration.pushManager.getSubscription()) ??
                (await registration.pushManager.subscribe({
                    // Required by Chrome: every push MUST result in a visible
                    // notification. Our service worker always shows one.
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
                }));

            const result = await savePushSubscription(serialise(sub));
            if (!result.success) {
                // Don't leave a browser subscription the server doesn't know
                // about — it would receive nothing and look enabled.
                await sub.unsubscribe().catch(() => undefined);
                setState("off");
                return { ok: false, error: result.error };
            }

            setDeviceCount(result.data.deviceCount);
            setState("on");
            return { ok: true };
        } catch (err) {
            setState("off");
            return { ok: false, error: err instanceof Error ? err.message : "Could not enable notifications." };
        } finally {
            setBusy(false);
        }
    }, []);

    const disable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        setBusy(true);
        try {
            const registration = await navigator.serviceWorker.ready;
            const sub = await registration.pushManager.getSubscription();
            if (sub) {
                // Server first: if the local unsubscribe succeeds but the row
                // survives, we keep pushing at a dead endpoint. The reverse
                // just means one redundant re-sync on next mount.
                const result = await deletePushSubscription(sub.endpoint);
                await sub.unsubscribe().catch(() => undefined);
                if (result.success) setDeviceCount(result.data.deviceCount);
            }
            setState("off");
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : "Could not turn notifications off." };
        } finally {
            setBusy(false);
        }
    }, []);

    const test = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        setBusy(true);
        try {
            const result = await sendTestPush();
            return result.success ? { ok: true } : { ok: false, error: result.error };
        } finally {
            setBusy(false);
        }
    }, []);

    return { state, deviceCount, busy, enable, disable, test };
}
