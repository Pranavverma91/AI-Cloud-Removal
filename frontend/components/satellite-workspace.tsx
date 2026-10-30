"use client";
import { useRef, useState } from "react";
import { CalendarDays, Cloud, RefreshCw, Satellite, ScanLine, LoaderCircle } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import ObservationMap, { defaultPoint, type MapPoint } from "./observation-map";
import { AnalysisResult } from "./analysis-workspace";
import type { Analysis, AnalysisType } from "@/lib/types";
import type { Scene } from "@/lib/satellite";
const date = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export default function SatelliteWorkspace({ type, point: initial, onSaved }: {
    type: AnalysisType;
    point: MapPoint | null;
    onSaved: (a: Analysis) => void;
}) {
    const [point, setPoint] = useState(initial || defaultPoint), [size, setSize] = useState("5"), [cloud, setCloud] = useState("40"), [end, setEnd] = useState(""), [scenes, setScenes] = useState<Scene[]>([]), [selected, setSelected] = useState(""), [before, setBefore] = useState(""), [phase, setPhase] = useState<"idle" | "search" | "analyze">("idle"), [error, setError] = useState(""), [searched, setSearched] = useState(false), [imageError, setImageError] = useState(false), [result, setResult] = useState<Analysis | null>(null);
    const lock = useRef(false), generation = useRef(0);
    const scene = scenes.find(s => s.id === selected), prior = scenes.filter(s => scene && s.capturedAt < scene.capturedAt), busy = phase !== "idle";
    function invalidate() { generation.current++; setScenes([]); setSelected(""); setBefore(""); setSearched(false); setResult(null); setError(""); }
    async function find() { if (lock.current)
        return; lock.current = true; const gen = ++generation.current; setPhase("search"); setError(""); setResult(null); setScenes([]); setSelected(""); setImageError(false); setSearched(false); try {
        const q = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng), size, cloud, end });
        const r = await fetch("/api/satellite/scenes?" + q);
        const d = await r.json() as {
            error?: string;
            scenes: Scene[];
        };
        if (!r.ok)
            throw new Error(d.error || "Could not search for satellite captures.");
        if (gen !== generation.current)
            return;
        const list = d.scenes as Scene[];
        setScenes(list);
        setSelected(list[0]?.id || "");
        setBefore(list.find(s => new Date(s.capturedAt).getTime() < new Date(list[0]?.capturedAt).getTime() - 25 * 86400000)?.id || list[1]?.id || "");
        setSearched(true);
    }
    catch (e) {
        if (gen === generation.current)
            setError(e instanceof Error ? e.message : "The satellite service is unavailable.");
    }
    finally {
        lock.current = false;
        setPhase("idle");
    } }
    async function run() { if (lock.current || !selected)
        return; lock.current = true; setPhase("analyze"); setError(""); try {
        const r = await fetch("/api/satellite/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: point.lat, lng: point.lng, size: Number(size), location: point.name, scene: selected, before, type }) });
        const d = await r.json() as Analysis & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error || "The capture could not be analyzed.");
        setResult(d);
        onSaved(d);
        toast.success("Satellite observation saved to your archive.");
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Could not analyze this capture.");
    }
    finally {
        lock.current = false;
        setPhase("idle");
    } }
    const image = selected ? "/api/satellite/image?" + new URLSearchParams({ scene: selected, lat: String(point.lat), lng: String(point.lng), size }) : "";
    return <div className="satellite-layout"><section className="satellite-controls panel"><div className="panel-heading"><h3>01 <span>Choose your area</span></h3><Satellite size={18}/></div><fieldset disabled={busy} className="map-fieldset"><ObservationMap compact selected={point} sizeKm={Number(size)} onSelect={p => { if (p.lat !== point.lat || p.lng !== point.lng)
        invalidate(); setPoint(p); }}/></fieldset><div className="satellite-form"><div className="satellite-fields"><div className="field"><label>Area width</label><Select value={size} onValueChange={v => { setSize(v); invalidate(); }} disabled={busy}><SelectTrigger aria-label="Analysis area width"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 5, 10].map(n => <SelectItem key={n} value={String(n)}>{n} × {n} km</SelectItem>)}</SelectContent></Select></div><div className="field"><label>Scene cloud limit</label><Select value={cloud} onValueChange={v => { setCloud(v); invalidate(); }} disabled={busy}><SelectTrigger aria-label="Maximum scene cloud cover"><SelectValue /></SelectTrigger><SelectContent>{[10, 20, 40, 70, 100].map(n => <SelectItem key={n} value={String(n)}>Up to {n}%</SelectItem>)}</SelectContent></Select></div></div><div className="field"><label htmlFor="capture-end">Captured on or before <span className="muted">(optional)</span></label><input id="capture-end" type="date" min="2017-01-01" max={new Date().toISOString().slice(0, 10)} value={end} disabled={busy} onChange={e => { setEnd(e.target.value); invalidate(); }}/></div><button className="btn btn-primary" onClick={find} disabled={busy}>{phase === "search" ? <LoaderCircle className="loading-orbit"/> : <RefreshCw />}{phase === "search" ? "Searching satellite captures…" : "Find latest imagery"}</button><p className="method-note">Latest available Sentinel-2 captures, newest first. Satellite passes and cloud cover determine availability; images are not a live video feed.</p>
 {searched && !scenes.length && <p className="error-box">No captures matched in the preceding year. Increase the cloud limit, change the date, or choose another area.</p>}
 {scenes.length > 0 && <div className="scene-picker"><h3>02 <span>Choose a capture</span></h3><Select value={selected} onValueChange={id => { setSelected(id); setResult(null); setImageError(false); const s = scenes.find(s => s.id === id); if (s && !scenes.find(p => p.id === before && p.capturedAt < s.capturedAt))
            setBefore(scenes.find(p => p.capturedAt < s.capturedAt)?.id || ""); }} disabled={busy}><SelectTrigger aria-label="Satellite capture date"><SelectValue /></SelectTrigger><SelectContent>{scenes.map((s, i) => <SelectItem value={s.id} key={s.id}>{date(s.capturedAt)} · {s.cloudCover.toFixed(1)}% cloud{i === 0 ? " · latest match" : ""}</SelectItem>)}</SelectContent></Select>
 {type === "forest" && <div className="field"><label>Compare with an earlier capture</label><Select value={before} onValueChange={v => { setBefore(v); setResult(null); }} disabled={busy || !prior.length}><SelectTrigger aria-label="Before capture date"><SelectValue placeholder="Choose an earlier date"/></SelectTrigger><SelectContent>{prior.map(s => <SelectItem value={s.id} key={s.id}>{date(s.capturedAt)} · {s.cloudCover.toFixed(1)}% cloud</SelectItem>)}</SelectContent></Select>{!prior.length && <p className="method-note">Choose a newer capture above or broaden the search to include an earlier date.</p>}</div>}
 <button className="btn btn-lime" onClick={run} disabled={busy || !selected || (type === "forest" && !before)}>{phase === "analyze" ? <LoaderCircle className="loading-orbit"/> : <ScanLine />}{phase === "analyze" ? "Reading spectral bands…" : "Analyze this capture"}</button></div>}
 {error && <div className="error-box" role="alert">{error}</div>}</div></section>
 <div className="satellite-output">{phase === "analyze" ? <section className="panel results-empty" aria-live="polite"><div className="big-icon"><Satellite className="loading-orbit"/></div><h3>Measuring your landscape</h3><p>Retrieving spectral bands, excluding cloud and shadow, and saving your result. This can take up to a minute.</p></section> : result ? <AnalysisResult analysis={result}/> : scene ? <section className="panel capture-preview"><div className="results-head"><div><span className="eyebrow">ACTUAL SATELLITE CAPTURE</span><h3>{point.name}</h3></div><span className="source-badge">{scene.platform}</span></div><div className="capture-facts"><span><CalendarDays size={15}/>{date(scene.capturedAt)}</span><span><Cloud size={15}/>{scene.cloudCover.toFixed(1)}% scene cloud</span></div>{imageError ? <div className="results-empty"><p>The capture preview could not load.</p><button className="btn" onClick={() => { setImageError(false); }}>Retry preview</button></div> : <img key={image} className="actual-capture" src={image} alt={`Satellite image of ${point.name}, captured ${date(scene.capturedAt)}`} onError={() => setImageError(true)}/>}<p className="method-note">Copernicus Sentinel-2 L2A via Microsoft Planetary Computer. This is the selected {size} × {size} km area. Run the analysis to see the classified image and measurements.</p></section> : <section className="panel results-empty"><div className="big-icon"><Satellite /></div><span className="eyebrow">YOUR NEXT OBSERVATION</span><h3>A real place. A real capture.</h3><p>Select an area and find its latest satellite imagery. Your original image, measured result, and capture date will appear here.</p><div className="signal-types"><span>NDVI · Vegetation</span><span>NDWI · Water</span></div></section>}</div></div>;
}
