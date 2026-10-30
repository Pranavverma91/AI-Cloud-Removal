"use client";
import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Satellite, LocateFixed } from "lucide-react";
import PlaceSearch, { type MapPoint } from "./place-search";
import type { Analysis } from "@/lib/types";
import type { Map, LayerGroup, CircleMarker, Rectangle } from "leaflet";
export type { MapPoint } from "./place-search";
export const defaultPoint: MapPoint = { lat: 28.9845, lng: 77.7064, name: "Meerut, Uttar Pradesh, India" };
export default function ObservationMap({ full = false, compact = false, analyses = [], onAnalyze, onOpen, selected, onSelect, sizeKm = 5 }: {
    full?: boolean;
    compact?: boolean;
    analyses?: Analysis[];
    onAnalyze?: (p: MapPoint) => void;
    onOpen?: (a: Analysis) => void;
    selected?: MapPoint;
    onSelect?: (p: MapPoint) => void;
    sizeKm?: number;
}) {
    const node = useRef<HTMLDivElement>(null), map = useRef<Map | null>(null), markers = useRef<LayerGroup | null>(null), pin = useRef<CircleMarker | null>(null), area = useRef<Rectangle | null>(null), actions = useRef({ onAnalyze, onOpen, onSelect });
    actions.current = { onAnalyze, onOpen, onSelect };
    const [point, setPoint] = useState(selected || defaultPoint), [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [locating, setLocating] = useState(false), [nameError, setNameError] = useState("");
    const reverse = useRef<AbortController | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    function choose(p: MapPoint, fly = true) { reverse.current?.abort(); clearTimeout(timer.current); setLocating(false); setNameError(""); setPoint(p); actions.current.onSelect?.(p); pin.current?.setLatLng([p.lat, p.lng]); if (fly)
        map.current?.flyTo([p.lat, p.lng], 12, { duration: .7 }); }
    useEffect(() => {
        let cancelled = false;
        let observer: ResizeObserver | undefined;
        import("leaflet").then(L => {
            if (cancelled || !node.current)
                return;
            const p = selected || defaultPoint, m = L.map(node.current, { zoomControl: false, scrollWheelZoom: full || compact, minZoom: 2, maxZoom: 18 }).setView([p.lat, p.lng], 12);
            map.current = m;
            L.control.zoom({ position: "bottomright" }).addTo(m);
            const tiles = L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Imagery © Esri, Maxar, Earthstar Geographics", maxZoom: 18 }).addTo(m);
            let errors = 0, loaded = 0;
            tiles.on("tileload", () => { loaded++; setFailed(false); });
            tiles.on("tileerror", () => { errors++; if (errors >= 4 && !loaded)
                setFailed(true); });
            L.tileLayer("https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { attribution: 'Place names © Esri · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>', maxZoom: 18, pane: "overlayPane" }).addTo(m);
            markers.current = L.layerGroup().addTo(m);
            pin.current = L.circleMarker([p.lat, p.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#8ce8d1", fillOpacity: 1 }).addTo(m);
            area.current = L.rectangle([[p.lat - .02, p.lng - .025], [p.lat + .02, p.lng + .025]], { color: "#8ce8d1", weight: 1.5, fillOpacity: .07, dashArray: "5 5", interactive: false }).addTo(m);
            m.on("click", e => { const lat = e.latlng.lat, lng = ((e.latlng.lng + 180) % 360 + 360) % 360 - 180; const fallback = { lat, lng, name: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°` }; choose(fallback, false); setLocating(true); timer.current = setTimeout(async () => { const ctrl = new AbortController(); reverse.current = ctrl; try {
                const r = await fetch(`/api/places?lat=${lat}&lng=${lng}`, { signal: ctrl.signal });
                const d = await r.json() as {
                    places: MapPoint[];
                };
                if (!r.ok)
                    throw new Error();
                if (!ctrl.signal.aborted) {
                    if (d.places[0]) {
                        const next = { ...fallback, name: d.places[0].name };
                        setPoint(next);
                        actions.current.onSelect?.(next);
                    }
                    else
                        setNameError("No mapped place name here; coordinates are retained.");
                }
            }
            catch {
                if (!ctrl.signal.aborted)
                    setNameError("Place name unavailable; coordinates are retained.");
            }
            finally {
                if (!ctrl.signal.aborted)
                    setLocating(false);
            } }, 650); });
            observer = new ResizeObserver(() => m.invalidateSize());
            observer.observe(node.current);
            setReady(true);
        }).catch(() => setFailed(true));
        return () => { cancelled = true; reverse.current?.abort(); clearTimeout(timer.current); observer?.disconnect(); map.current?.remove(); map.current = null; };
    }, [full, compact]);
    useEffect(() => { if (selected) {
        setPoint(selected);
        pin.current?.setLatLng([selected.lat, selected.lng]);
    } }, [selected]);
    useEffect(() => { if (!ready)
        return; const dy = sizeKm / 2 / 111.32, dx = dy / Math.cos(point.lat * Math.PI / 180); area.current?.setBounds([[point.lat - dy, point.lng - dx], [point.lat + dy, point.lng + dx]]); }, [point, sizeKm, ready]);
    useEffect(() => { if (!ready || !markers.current)
        return; const group = markers.current; group.clearLayers(); import("leaflet").then(L => { for (const a of analyses) {
        if (a.latitude === null || a.longitude === null || a.demo)
            continue;
        const m = L.circleMarker([a.latitude, a.longitude], { radius: 8, color: "#fff", fillColor: "#8ce8d1", fillOpacity: .9, weight: 2 });
        const label = document.createElement("span");
        label.textContent = a.location;
        m.bindTooltip(label);
        m.on("click", e => { L.DomEvent.stopPropagation(e); actions.current.onOpen?.(a); });
        group.addLayer(m);
    } }); }, [analyses, ready]);
    return <><div className={"map-wrap" + (full ? " full" : "") + (compact ? " compact" : "")}><div ref={node} className="map-canvas" role="region" aria-label="Satellite map with real place names; click to select an area"/>
 <div className="map-tool-row"><PlaceSearch onSelect={p => choose(p)}/><button className="icon-btn" aria-label="Center selected location" onClick={() => map.current?.flyTo([point.lat, point.lng], 12)}><LocateFixed size={18}/></button></div>
 {failed && <div className="map-unavailable"><Satellite size={32}/><strong>Map imagery could not load</strong><button className="btn" onClick={() => { setFailed(false); map.current?.eachLayer(l => { if ("redraw" in l)
        (l as {
            redraw: () => void;
        }).redraw(); }); }}>Retry map</button></div>}
 <div className="map-corner"><div className="eyebrow"><MapPin size={12}/> {locating ? "FINDING PLACE NAME" : "SELECTED AREA"}</div><p>{point.name}</p><small>{point.lat.toFixed(4)}°, {point.lng.toFixed(4)}° · {sizeKm} × {sizeKm} km</small>{nameError && <small className="place-error">{nameError}</small>}{onAnalyze && <button className="btn btn-lime" onClick={() => onAnalyze(point)} disabled={locating}>Use this location <Crosshair size={15}/></button>}</div></div><div className="map-footer"><span><Crosshair />Click to select an area</span><span>Reference map · capture dates appear with results</span></div></>;
}
