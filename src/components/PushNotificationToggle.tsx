"use client";

import { Bell, BellOff, Loader2, RefreshCw, Send, Share, ShieldAlert, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { usePushNotifications, type PushState } from "@/hooks/usePushNotifications";

/**
 * Enable/disable this device for push notifications.
 *
 * Shared by the driver portal (/driver/settings) and the admin profile modal —
 * the mechanics are identical for both roles, only the copy describing WHAT
 * they'll be notified about differs, so that's the one prop.
 *
 * Every non-actionable state gets its own explanation rather than a disabled
 * switch. "Notifications are off" with a dead toggle is the single most common
 * way this feature wastes a support call: the user can't tell whether they
 * denied permission six months ago, are in a browser that can't do push, or are
 * on an iPhone that needs the app installed first. Those are three different
 * fixes and only one of them is the user's to make.
 */
export function PushNotificationToggle({ audience }: { audience: "driver" | "admin" }) {
    const { state, deviceCount, busy, enable, disable, test } = usePushNotifications();

    const blurb =
        audience === "driver"
            ? "Get alerted the moment stock is assigned to you, so you don't have to keep checking the app."
            : "Get alerted when a driver disputes a delivery and when machines are about to run dry.";

    const handleEnable = async () => {
        const result = await enable();
        if (result.ok) {
            toast.success("Notifications on", { description: "This device will now receive alerts." });
        } else {
            toast.error("Could not turn notifications on", { description: result.error });
        }
    };

    const handleDisable = async () => {
        const result = await disable();
        if (result.ok) toast.success("Notifications off for this device");
        else toast.error("Could not turn notifications off", { description: result.error });
    };

    const handleTest = async () => {
        const result = await test();
        if (result.ok) {
            toast.success("Test sent", { description: "It should arrive in a few seconds." });
        } else {
            toast.error("Test failed", { description: result.error });
        }
    };

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30 p-5">
            <div className="flex items-start gap-3">
                <div
                    className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                        state === "on"
                            ? "bg-accent-green/10 text-accent-green"
                            : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400"
                    }`}
                >
                    {state === "on" ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Push notifications</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{blurb}</p>

                    <div className="mt-4">
                        <StateBody
                            state={state}
                            deviceCount={deviceCount}
                            busy={busy}
                            onEnable={handleEnable}
                            onDisable={handleDisable}
                            onTest={handleTest}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function StateBody({
    state,
    deviceCount,
    busy,
    onEnable,
    onDisable,
    onTest,
}: {
    state: PushState;
    deviceCount: number;
    busy: boolean;
    onEnable: () => void;
    onDisable: () => void;
    onTest: () => void;
}) {
    if (state === "loading") {
        return (
            <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking this device…
            </p>
        );
    }

    if (state === "needs-install") {
        return (
            <Notice icon={<Share className="w-4 h-4" />} tone="info">
                On iPhone and iPad, notifications only work once the app is installed. Tap{" "}
                <span className="font-semibold">Share → Add to Home Screen</span>, then open it from there and come
                back to this page.
            </Notice>
        );
    }

    if (state === "unsupported") {
        return (
            <Notice icon={<Smartphone className="w-4 h-4" />} tone="muted">
                This browser can&apos;t receive push notifications. Try Chrome or Safari on your phone, or install the
                app to your home screen.
            </Notice>
        );
    }

    if (state === "no-service-worker") {
        return (
            <Notice icon={<RefreshCw className="w-4 h-4" />} tone="muted">
                The app&apos;s background worker isn&apos;t running on this page, so notifications can&apos;t be
                delivered yet. On a local dev server that&apos;s expected — it&apos;s switched off there, so use{" "}
                <span className="font-mono">npm run build &amp;&amp; npm start</span> to test this. On the live site,
                reload the page once and it should register.
            </Notice>
        );
    }

    if (state === "error") {
        return (
            <Notice icon={<RefreshCw className="w-4 h-4" />} tone="warn">
                Couldn&apos;t check the notification status for this device — that&apos;s a connection or server
                problem, not your browser. Reload the page to try again.
            </Notice>
        );
    }

    if (state === "not-configured") {
        return (
            <Notice icon={<ShieldAlert className="w-4 h-4" />} tone="warn">
                Notifications aren&apos;t set up on the server yet. Ask an administrator to configure the VAPID keys.
            </Notice>
        );
    }

    if (state === "blocked") {
        return (
            <Notice icon={<ShieldAlert className="w-4 h-4" />} tone="warn">
                Notifications are blocked for this site. Re-allow them in your browser&apos;s site settings, then
                reload this page — we can&apos;t re-ask on your behalf once they&apos;ve been denied.
            </Notice>
        );
    }

    if (state === "off") {
        return (
            <button
                onClick={onEnable}
                disabled={busy}
                className="flex items-center justify-center gap-2 bg-accent-blue text-white font-bold text-sm py-3 px-5 rounded-xl shadow-lg shadow-accent-blue/20 hover:bg-accent-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                Turn on notifications
            </button>
        );
    }

    // state === "on"
    return (
        <div className="space-y-3">
            <p className="text-xs text-accent-green font-semibold">
                On for this device
                {deviceCount > 1 ? ` · ${deviceCount} devices registered` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={onTest}
                    disabled={busy}
                    className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-50"
                >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send a test
                </button>
                <button
                    onClick={onDisable}
                    disabled={busy}
                    className="flex items-center gap-2 text-accent-pink hover:bg-accent-pink/10 text-xs font-bold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-50"
                >
                    <BellOff className="w-3.5 h-3.5" />
                    Turn off
                </button>
            </div>
        </div>
    );
}

function Notice({
    icon,
    tone,
    children,
}: {
    icon: React.ReactNode;
    tone: "info" | "warn" | "muted";
    children: React.ReactNode;
}) {
    const toneClass =
        tone === "warn"
            ? "bg-accent-orange/10 text-accent-orange"
            : tone === "info"
              ? "bg-accent-blue/10 text-accent-blue"
              : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400";

    return (
        <div className={`flex gap-2.5 rounded-xl p-3 text-xs leading-relaxed ${toneClass}`}>
            <span className="shrink-0 mt-0.5">{icon}</span>
            <p>{children}</p>
        </div>
    );
}
