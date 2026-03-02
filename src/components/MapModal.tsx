"use client";

import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, X, Map as MapIcon, Loader2 } from "lucide-react";

// Fix Leaflet's default icon path issues in Next.js
const customIcon = new L.Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Component to handle map clicks for the Drop Pin feature
function LocationMarker({ position, setPosition, setAddressName }: { position: L.LatLng | null, setPosition: (p: L.LatLng) => void, setAddressName: (s: string) => void }) {
    useMapEvents({
        click(e) {
            setPosition(e.latlng);
            setAddressName(`Custom Pin: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
        },
    });

    return position === null ? null : (
        <Marker position={position} icon={customIcon} />
    );
}

// Component to handle recentering when user allows location access
function LocationFlyTo({ position }: { position: L.LatLng | null }) {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.flyTo(position, 15);
        }
    }, [position, map]);
    return null;
}

type Props = {
    onClose: () => void;
    onConfirm: (address: string, lat: number, lon: number) => void;
};

export default function MapModal({ onClose, onConfirm }: Props) {
    const [mapPosition, setMapPosition] = useState<L.LatLng | null>(new L.LatLng(26.3045, 50.1481)); // Default to Dhahran
    const [mapAddressName, setMapAddressName] = useState("");
    const [userLocating, setUserLocating] = useState(false);

    const locateMe = () => {
        setUserLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const latlng = new L.LatLng(pos.coords.latitude, pos.coords.longitude);
                setMapPosition(latlng);
                setMapAddressName(`Custom Pin: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`);
                setUserLocating(false);
            },
            (err) => {
                console.error(err);
                setUserLocating(false);
                alert("Could not get your location. Please drop the pin manually.");
            },
            { enableHighAccuracy: true }
        );
    };

    const confirmPin = () => {
        if (mapPosition) {
            const finalName = mapAddressName || `Custom Pin: ${mapPosition.lat.toFixed(5)}, ${mapPosition.lng.toFixed(5)}`;
            onConfirm(finalName, mapPosition.lat, mapPosition.lng);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-3xl bg-slate-200 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
                <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-black/20">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-accent-pink" />
                            Drop a Pin
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Click anywhere on the map to pinpoint the exact location.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 relative">
                    {/* Inner Shadow overlay */}
                    <div className="absolute inset-0 pointer-events-none border-[8px] border-black/10 z-[400] mix-blend-overlay"></div>

                    {/* Geolocation Button overlay */}
                    <div className="absolute top-4 left-4 z-[500]">
                        <button
                            onClick={locateMe}
                            disabled={userLocating}
                            className="px-4 py-2 bg-slate-200 dark:bg-slate-900/90 backdrop-blur border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white rounded-xl shadow-xl hover:bg-black transition-colors font-bold text-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            {userLocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapIcon className="w-4 h-4 text-brand-400" />}
                            {userLocating ? 'Locating...' : 'Use My GPS Location'}
                        </button>
                    </div>

                    <MapContainer
                        center={[26.3045, 50.1481]}
                        zoom={13}
                        className="w-full h-full z-10"
                        scrollWheelZoom={true}
                        zoomControl={false}
                    >
                        <TileLayer
                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                        />

                        <LocationMarker position={mapPosition} setPosition={setMapPosition} setAddressName={setMapAddressName} />
                        <LocationFlyTo position={mapPosition} />
                    </MapContainer>
                </div>

                <div className="p-4 bg-black/40 border-t border-slate-200 dark:border-white/10 flex items-center justify-between">
                    <div className="flex-1 mr-4">
                        {mapPosition ? (
                            <>
                                <div className="text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">Selected Coordinates</div>
                                <div className="text-sm font-mono text-brand-400 bg-brand-500/10 px-3 py-1.5 rounded-lg border border-brand-500/20 inline-block">
                                    {mapPosition.lat.toFixed(5)}, {mapPosition.lng.toFixed(5)}
                                </div>
                            </>
                        ) : (
                            <div className="text-sm text-slate-500 dark:text-slate-400 italic">No location selected yet. Click the map to drop a pin.</div>
                        )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-white/10 text-slate-900 dark:text-white font-medium rounded-xl transition-colors">Cancel</button>
                        <button
                            onClick={confirmPin}
                            disabled={!mapPosition}
                            className="px-5 py-2.5 bg-accent-pink hover:bg-pink-600 text-slate-900 dark:text-white font-bold rounded-xl transition-colors shadow-[0_0_20px_rgba(236,72,153,0.3)] disabled:opacity-50 disabled:shadow-none"
                        >
                            Confirm Pin Placement
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
