"use client";

import React from "react";
import { WifiOff, RotateCcw } from "lucide-react";
export default function OfflineFallback() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 text-center">
            <div className="w-24 h-24 rounded-full bg-slate-800/50 flex items-center justify-center mb-6 ring-1 ring-slate-700/50 shadow-inner">
                <WifiOff className="w-10 h-10 text-slate-400" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-100 mb-3">
                You are currently offline
            </h1>
            
            <p className="text-slate-400 max-w-sm mb-8">
                It looks like you've lost your internet connection. 
                Don't worry, the app is still running locally. Please reconnect to sync any pending inventory logs.
            </p>

            <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium transition-colors bg-accent-blue hover:bg-accent-blue/90 text-white rounded-xl shadow-lg shadow-accent-blue/20 ring-1 ring-accent-blue/50"
            >
                <RotateCcw className="w-4 h-4" />
                Refresh Page
            </button>
        </div>
    );
}
