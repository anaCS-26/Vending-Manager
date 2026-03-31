"use client";

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, Loader2, X, Map as MapIcon } from "lucide-react";

import dynamic from "next/dynamic";

const MapModal = dynamic(() => import('./MapModal'), {
    ssr: false,
    loading: () => (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
    )
});

type AddressResult = {
    place_id: string;
    lat: number;
    lon: number;
    formatted: string;
};

type Props = {
    value: string;
    onChange: (address: string, lat?: number, lon?: number) => void;
    placeholder?: string;
    className?: string;
};



export default function AddressAutocomplete({ value, onChange, placeholder = "Search for an address...", className = "" }: Props) {
    // Autocomplete State
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<AddressResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Map Modal State
    const [showMapModal, setShowMapModal] = useState(false);

    // Update query if parent value changes externally
    useEffect(() => {
        setQuery(value);
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const searchAddress = async (searchQuery: string) => {
        if (!searchQuery || searchQuery.trim().length < 3) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        setIsLoading(true);
        try {
            const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
            // Bias directly around the Dhahran / Khobar metropolis
            const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(searchQuery)}&format=json&filter=countrycode:sa&bias=proximity:50.1345,26.2695&limit=10&apiKey=${apiKey}`);
            const data = await res.json();
            const fetchedResults = data.results || [];
            setResults(fetchedResults);
            setIsOpen(true); // Always show dropdown even if empty, so we can show "Drop Pin" button
        } catch (error) {
            console.error("Failed to fetch address suggestions:", error);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setQuery(newValue);
        onChange(newValue); // Update parent with raw text immediately

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = setTimeout(() => {
            searchAddress(newValue);
        }, 500);
    };

    const handleSelect = (result: AddressResult) => {
        setQuery(result.formatted);
        onChange(result.formatted, result.lat, result.lon);
        setIsOpen(false);
    };

    const handleClear = () => {
        setQuery("");
        onChange("");
        setResults([]);
        setIsOpen(false);
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };

    // --- Map Modal Handlers ---

    const openMapModal = () => {
        setIsOpen(false);
        setShowMapModal(true);
    };

    const handleConfirmPin = (finalName: string, lat: number, lon: number) => {
        setQuery(finalName);
        onChange(finalName, lat, lon);
        setShowMapModal(false);
    };

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative flex items-center">
                <Search className="absolute left-3 w-4 h-4 text-slate-600 dark:text-slate-400" />
                <input
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => { if (query.length >= 3) setIsOpen(true); }}
                    placeholder={placeholder}
                    className={`w-full bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-9 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none ${className}`}
                />

                {isLoading ? (
                    <Loader2 className="absolute right-3 w-4 h-4 text-brand-500 animate-spin" />
                ) : query ? (
                    <button
                        onClick={handleClear}
                        className="absolute right-3 p-1 rounded-full text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-white/10 transition-colors"
                        type="button"
                    >
                        <X className="w-3 h-3" />
                    </button>
                ) : null}
            </div>

            {isOpen && (
                <div className="absolute z-[100] w-full mt-1 bg-slate-200 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden transform origin-top animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col">
                    {results.length > 0 ? (
                        <ul className="py-1 max-h-60 overflow-y-auto hidden-scrollbar">
                            {results.map((result) => (
                                <li key={result.place_id}>
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(result)}
                                        className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-start gap-4 group"
                                    >
                                        <MapPin className="w-5 h-5 text-slate-400 dark:text-slate-500 mt-0.5 group-hover:text-brand-400 flex-shrink-0" />
                                        <span className="text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white leading-tight">
                                            {result.formatted}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="p-4 text-center border-b border-slate-200 dark:border-white/5">
                            <span className="text-xs text-slate-600 dark:text-slate-400">No exact matches found.</span>
                        </div>
                    )}

                    {/* The ultimate fallback: Drop Pin Button always at bottom of dropdown */}
                    <div className="p-2 bg-black/50 border-t border-slate-200 dark:border-white/5">
                        <button
                            type="button"
                            onClick={openMapModal}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 text-brand-400 dark:text-brand-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-all text-sm font-bold"
                        >
                            <MapIcon className="w-4 h-4" />
                            Drop Pin on Map Instead
                        </button>
                    </div>
                </div>
            )}

            {/* Map Modal Overlay */}
            {showMapModal && (
                <MapModal
                    onClose={() => setShowMapModal(false)}
                    onConfirm={handleConfirmPin}
                />
            )}
        </div>
    );
}
