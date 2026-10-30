"use client";
import { useRef, useState } from "react";
import { Search, MapPin, LoaderCircle } from "lucide-react";
export type MapPoint = {
    lat: number;
    lng: number;
    name: string;
};
export default function PlaceSearch({ onSelect, disabled = false }: {
    onSelect: (p: MapPoint) => void;
    disabled?: boolean;
}) {
    const [query, setQuery] = useState(""), [items, setItems] = useState<MapPoint[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
    const lock = useRef(false);
    async function search(e: React.FormEvent) { e.preventDefault(); if (query.trim().length < 2 || lock.current)
        return; lock.current = true; setBusy(true); setItems([]); setError(""); try {
        const r = await fetch("/api/places?q=" + encodeURIComponent(query.trim()));
        const data = await r.json() as {
            error?: string;
            places: MapPoint[];
        };
        if (!r.ok)
            throw new Error(data.error || "Place search is unavailable.");
        setItems(data.places);
        if (!data.places.length)
            setError("No matching place. Try a nearby town or select it on the map.");
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Place search is unavailable.");
    }
    finally {
        setBusy(false);
        lock.current = false;
    } }
    return <div className="place-search"><form onSubmit={search}><Search size={17}/><input aria-label="Search a real place" placeholder="Search a town, river, forest…" value={query} onChange={e => setQuery(e.target.value)} disabled={disabled} maxLength={160}/><button className="btn btn-primary" disabled={disabled || busy || query.trim().length < 2}>{busy ? <LoaderCircle className="loading-orbit" size={16}/> : "Find"}</button></form>{items.length > 0 && <ul className="place-results" aria-label="Matching places">{items.map((p, i) => <li key={i}><button onClick={() => { onSelect(p); setItems([]); setQuery(p.name.split(",")[0]); }}><MapPin size={16}/><span>{p.name}</span></button></li>)}</ul>}{error && <p className="place-error" role="status">{error}</p>}</div>;
}
