"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { changeDriverPin } from "@/actions/auth";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { useDriverStore } from "@/stores/useDriverStore";
import type { RefillEntryMode } from "@/types";

type Props = { driverName: string };

export default function DriverSettingsForm({ driverName }: Props) {
    const [currentPin, setCurrentPin] = useState("");
    const [newPin, setNewPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [showPins, setShowPins] = useState(false);
    const [isPending, startTransition] = useTransition();

    const submit = () => {
        if (!currentPin || !newPin || !confirmPin) {
            toast.error("All three fields are required.");
            return;
        }
        if (newPin !== confirmPin) {
            toast.error("New PIN and confirmation do not match.");
            return;
        }
        startTransition(async () => {
            const result = await changeDriverPin(currentPin, newPin);
            if (result.success) {
                toast.success("PIN updated", {
                    description: "Use your new PIN the next time you sign in.",
                });
                setCurrentPin("");
                setNewPin("");
                setConfirmPin("");
            } else {
                toast.error("Could not update PIN", { description: result.error });
            }
        });
    };

    return (
        <div className="bg-slate-50 dark:bg-[#121214] min-h-[100dvh] sm:min-h-[90vh] sm:rounded-[2.5rem] shadow-2xl shadow-black/50 overflow-visible sm:overflow-hidden relative flex flex-col border-0 sm:border border-slate-200 dark:border-white/10">

            {/* Header — same status-bar inset treatment as the refill screen, so
                the two driver routes line up when installed to the home screen. */}
            <div className="bg-white/80 dark:bg-black/40 backdrop-blur-3xl pt-[calc(env(safe-area-inset-top,0px)+3.25rem)] sm:pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] pb-6 sm:pb-8 px-5 sm:px-8 rounded-b-[2rem] border-b border-slate-200 dark:border-white/10 shrink-0 relative">
                <Link
                    href="/driver"
                    className="absolute top-[calc(env(safe-area-inset-top,0px)+0.75rem)] left-3 sm:left-4 p-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors shadow-sm bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10"
                    title="Back"
                >
                    <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </Link>
                <p className="text-accent-blue text-xs font-semibold mb-2 flex items-center gap-2 uppercase tracking-wider">
                    <ShieldCheck className="w-3 h-3 text-accent-blue" /> Account
                </p>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-none truncate">
                    {driverName}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                    Manage notifications and the PIN you use to sign in.
                </p>
            </div>

            <div className="flex-1 px-5 sm:px-6 py-6 sm:py-8 space-y-8 pb-safe" style={{ ["--safe-extra" as string]: "1.5rem" }}>
                {/* Notifications — first because it's the control a driver
                    actually returns to; PINs get changed roughly never. */}
                <PushNotificationToggle audience="driver" />

                <RefillModeChooser />

                {/* PIN */}
                <div className="space-y-5">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Change PIN
                    </h2>
                    <PinField
                        label="Current PIN"
                        value={currentPin}
                        onChange={setCurrentPin}
                        show={showPins}
                        onToggle={() => setShowPins(s => !s)}
                    />
                    <PinField
                        label="New PIN"
                        value={newPin}
                        onChange={setNewPin}
                        show={showPins}
                        onToggle={() => setShowPins(s => !s)}
                    />
                    <PinField
                        label="Confirm new PIN"
                        value={confirmPin}
                        onChange={setConfirmPin}
                        show={showPins}
                        onToggle={() => setShowPins(s => !s)}
                    />

                    <button
                        onClick={submit}
                        disabled={isPending}
                        className="w-full mt-2 flex items-center justify-center gap-2 bg-accent-blue text-white font-bold py-4 px-6 rounded-2xl shadow-lg shadow-accent-blue/20 hover:bg-accent-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
                        {isPending ? "Updating..." : "Update PIN"}
                    </button>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center pt-2 leading-relaxed">
                        For your safety, you'll be asked to use the new PIN on your next sign-in.
                    </p>
                </div>
            </div>
        </div>
    );
}

/**
 * Which way the refill sheet fills its quantity boxes.
 *
 * Both styles are shipped and the driver picks — the two disagree about a real
 * trade-off (fewer taps vs. fewer numbers to read) and the people doing 8 stops
 * a day are better placed to settle it than anyone reading a spec. Stored on the
 * device with the offline queue, so it needs no round trip and works in a
 * basement car park.
 */
function RefillModeChooser() {
    const refillMode = useDriverStore((s) => s.refillMode);
    const setRefillMode = useDriverStore((s) => s.setRefillMode);

    const options: { value: RefillEntryMode; title: string; blurb: string }[] = [
        {
            value: "quick",
            title: "Quick entry",
            blurb: "Boxes start empty. Items the machine looks low on come first, and each one offers last visit's amount as a one-tap button.",
        },
        {
            value: "prefill",
            title: "Prefilled",
            blurb: "Boxes arrive already holding last visit's amount. You change what's different, then check the list once before saving.",
        },
    ];

    return (
        <div className="space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Refill screen
            </h2>
            <div role="radiogroup" aria-label="Refill entry style" className="space-y-2">
                {options.map((opt) => {
                    const active = refillMode === opt.value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setRefillMode(opt.value)}
                            className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                                active
                                    ? "bg-accent-blue/5 border-accent-blue/50"
                                    : "bg-white dark:bg-black/20 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20"
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${active ? "border-accent-blue" : "border-slate-300 dark:border-slate-600"}`}>
                                    {active && <span className="w-2 h-2 rounded-full bg-accent-blue" />}
                                </span>
                                <span className="font-bold text-sm text-slate-900 dark:text-white">{opt.title}</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug pl-6">{opt.blurb}</p>
                        </button>
                    );
                })}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
                Either way, what you enter is recorded as sold — so the numbers still have to match what you actually loaded.
            </p>
        </div>
    );
}

function PinField({
    label,
    value,
    onChange,
    show,
    onToggle,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggle: () => void;
}) {
    return (
        <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block">
                {label}
            </label>
            <div className="flex items-center bg-white dark:bg-black/30 border border-slate-300 dark:border-white/10 rounded-2xl overflow-hidden focus-within:border-accent-blue/60 transition-all">
                <input
                    type={show ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={12}
                    value={value}
                    onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
                    className="flex-1 bg-transparent border-none outline-none px-4 py-4 text-lg font-mono tracking-widest text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    placeholder="••••"
                />
                <button
                    type="button"
                    onClick={onToggle}
                    className="px-4 py-4 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    title={show ? "Hide PIN" : "Show PIN"}
                >
                    {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
            </div>
        </div>
    );
}
