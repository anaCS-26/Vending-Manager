"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Activity, PackageOpen, AlertCircle, Store } from "lucide-react";

// Fix for default Leaflet icon paths in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
    iconUrl: '/leaflet/marker-icon.png',
    shadowUrl: '/leaflet/marker-shadow.png',
});

// Custom glowing maker for Dark Mode
const customIcon = L.divIcon({
    className: "custom-glowing-marker",
    html: `
        <div style="
            width: 20px;
            height: 20px;
            background-color: #00f0ff;
            border-radius: 50%;
            border: 2px solid #ffffff;
            box-shadow: 0 0 15px #00f0ff, inset 0 0 5px rgba(255,255,255,0.8);
            transform: translate(-50%, -50%);
        "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [0, 0]
});

const criticalIcon = L.divIcon({
    className: "custom-critical-marker",
    html: `
        <div style="
            width: 20px;
            height: 20px;
            background-color: #ec4899;
            border-radius: 50%;
            border: 2px solid #ffffff;
            box-shadow: 0 0 15px #ec4899, inset 0 0 5px rgba(255,255,255,0.8);
            transform: translate(-50%, -50%);
            animation: pulse 1.5s infinite;
        "></div>
        <style>
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(236,72,153, 0.7); }
                70% { box-shadow: 0 0 0 15px rgba(236,72,153, 0); }
                100% { box-shadow: 0 0 0 0 rgba(236,72,153, 0); }
            }
        </style>
    `,
    iconSize: [20, 20],
    iconAnchor: [0, 0]
});


const warehouseIcon = L.divIcon({
    className: "custom-warehouse-marker",
    html: `
        <div style="
            width: 22px;
            height: 22px;
            background-color: #a855f7;
            border-radius: 4px;
            border: 2px solid #ffffff;
            box-shadow: 0 0 15px #a855f7, inset 0 0 5px rgba(255,255,255,0.8);
            transform: translate(-50%, -50%);
        "></div>
    `,
    iconSize: [22, 22],
    iconAnchor: [0, 0]
});


function MapBounds({ coords }: { coords: [number, number][] }) {
    const map = useMap();

    useEffect(() => {
        if (coords.length > 0) {
            const bounds = L.latLngBounds(coords);
            try {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            } catch (e) {
                // Ignore leaflet errors
            }
        }
    }, [coords, map]);

    return null;
}

export default function MapVisual({ machines, predictions = [], warehouses = [] }: { machines: any[], predictions?: any[], warehouses?: any[] }) {
    const [isMounted, setIsMounted] = useState(false);
    const { resolvedTheme } = useTheme();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return (
        <div className="w-full h-full min-h-[400px] flex items-center justify-center bg-slate-100 dark:bg-black/20 rounded-3xl animate-pulse">
            <span className="text-slate-500 font-mono tracking-widest text-sm">INITIALIZING MAP SYSTEM...</span>
        </div>
    );

    // Filter coordinates
    const mappedMachines = machines.filter(m => m.latitude && m.longitude);
    const mappedWarehouses = warehouses.filter(w => w.latitude && w.longitude);

    const allCoords: [number, number][] = [
        ...mappedMachines.map(m => [m.latitude, m.longitude] as [number, number]),
        ...mappedWarehouses.map(w => [w.latitude, w.longitude] as [number, number])
    ];

    const center: [number, number] = allCoords.length > 0
        ? [allCoords[0][0], allCoords[0][1]]
        : [26.3045, 50.1481];

    return (
        <div className="w-full h-[450px] rounded-3xl overflow-hidden relative z-0 border border-slate-200 dark:border-white/10 group shadow-2xl">
            {/* Adding a custom inner shadow overlay using absolute borders to blend map with Dark Mode */}
            <div className="absolute inset-0 pointer-events-none border-[12px] border-slate-100/50 dark:border-black/10 z-[400] mix-blend-overlay"></div>

            {/* Map Legend */}
            <div className="absolute bottom-6 left-6 z-[500] bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-white/10 p-3 rounded-xl shadow-2xl flex flex-col gap-2 pointer-events-none">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-900 dark:text-white tracking-widest uppercase">
                    <div className="w-3 h-3 rounded-sm bg-[#a855f7] shadow-[0_0_8px_#a855f7] border border-white" />
                    Warehouse
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-900 dark:text-white tracking-widest uppercase">
                    <div className="w-3 h-3 rounded-full bg-[#00f0ff] shadow-[0_0_8px_#00f0ff] border border-white" />
                    Healthy Machine
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-accent-pink tracking-widest uppercase">
                    <div className="w-3 h-3 rounded-full bg-[#ec4899] shadow-[0_0_8px_#ec4899] border border-white animate-pulse" />
                    Critical Machine
                </div>
            </div>

            <MapContainer
                center={center}
                zoom={12}
                className="w-full h-full z-10"
                scrollWheelZoom={true}
                zoomControl={true}
            >
                {/* Bounds automatically adjust the viewport zoom/center */}
                <MapBounds coords={allCoords} />

                {/* Custom dark map layer (CartoDB Dark Matter) */}
                <TileLayer
                    url={resolvedTheme === 'dark'
                        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    }
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                {/* Warehouses rendered first so machines overlay them if close */}
                {warehouses.filter(w => w.latitude && w.longitude).map(warehouse => {
                    return (
                        <Marker
                            key={`wh-${warehouse.id}`}
                            position={[warehouse.latitude, warehouse.longitude]}
                            icon={warehouseIcon}
                        >
                            <Popup className="custom-popup" offset={[0, -10]}>
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-4 rounded-xl shadow-xl -m-[11px] min-w-[200px]">
                                    <h4 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                                        <Store className="w-4 h-4 text-[#a855f7]" />
                                        {warehouse.name}
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono border-b border-slate-200 dark:border-white/5 pb-2 mb-2 break-words">
                                        {warehouse.address || warehouse.location || "Central Facility"}
                                    </p>
                                    <div className="space-y-2 mt-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                        Distribution Center
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    )
                })}

                {mappedMachines.map(machine => {
                    // Get all predictions for this specific machine
                    const machinePredictions = predictions.filter((p: any) => p.machineId === machine.id && p.predictedHoursUntilEmpty !== null);
                    // It is critical if any item runs out in <= 24 hours
                    const criticalItems = machinePredictions.filter((p: any) => p.predictedHoursUntilEmpty <= 24);
                    const isCritical = criticalItems.length > 0;

                    // Find the shortest depletion time for the tooltip
                    const shortestDepletion = machinePredictions.length > 0
                        ? Math.min(...machinePredictions.map((p: any) => p.predictedHoursUntilEmpty))
                        : null;

                    const fillCount = machine.RefillLogs?.reduce((acc: number, curr: any) => acc + curr.quantity_refilled, 0) || 0;

                    return (
                        <Marker
                            key={machine.id}
                            position={[machine.latitude, machine.longitude]}
                            icon={isCritical ? criticalIcon : customIcon}
                        >
                            <Popup
                                className="custom-popup"
                                offset={[0, -10]}
                            >
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-4 rounded-xl shadow-xl -m-[11px] min-w-[200px]">
                                    <h4 className="font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                                        {isCritical ? <AlertCircle className="w-4 h-4 text-accent-pink" /> : <Activity className="w-4 h-4 text-accent-blue" />}
                                        {machine.location_name}
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono border-b border-slate-200 dark:border-white/5 pb-2 mb-2">
                                        ID: {machine.terminalId || `M-${machine.id.toString().padStart(4, '0')}`}
                                    </p>

                                    <div className="space-y-2 mt-3">
                                        <div className="flex justify-between items-center bg-slate-100 dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-white/5">
                                            <span className="text-[10px] uppercase text-slate-500 font-bold flex items-center gap-1">
                                                <PackageOpen className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                                Total Delivered
                                            </span>
                                            <span className="font-mono font-bold text-slate-900 dark:text-white">{fillCount}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-slate-100 dark:bg-black/20 p-2 rounded border border-slate-200 dark:border-white/5">
                                            <span className="text-[10px] uppercase text-slate-500 font-bold flex items-center gap-1">
                                                <Activity className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                                Health
                                            </span>
                                            <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${isCritical ? 'bg-accent-pink/20 text-accent-pink' : 'bg-accent-green/20 text-accent-green'}`}>
                                                {isCritical && shortestDepletion !== null ? `DEPLETES IN <${Math.ceil(shortestDepletion)}H` : 'HEALTHY'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    )
                })}
            </MapContainer>

            {/* Global style overrides for Leaflet Popups to match dark mode */}
            <style jsx global>{`
                .leaflet-popup-content-wrapper {
                    background: transparent;
                    box-shadow: none;
                    padding: 0;
                }
                .leaflet-popup-tip-container {
                    display: none;
                }
                .leaflet-container {
                    font-family: inherit;
                }
            `}</style>
        </div>
    )
}
