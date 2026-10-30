"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, ArrowRight, ArrowLeftRight, Download, ScanLine, Orbit, Sprout, Droplets, Trees, FlaskConical } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { modules, type AnalysisType, type Analysis } from "@/lib/types";
import type { MapPoint } from "./observation-map";
import SatelliteWorkspace from "./satellite-workspace";
export const ModuleIcon = ({ type }: {
    type: AnalysisType;
}) => type === "agriculture" ? <Sprout /> : type === "water" ? <Droplets /> : <Trees />;
async function prepareImage(file: File): Promise<{
    blob: Blob;
    width: number;
    height: number;
}> {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Choose a JPG, PNG, or WebP image.");
    if (file.size > 12 * 1024 * 1024)
        throw new Error("Choose an image smaller than 12 MB.");
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    }
    catch {
        throw new Error("This file could not be opened as an image.");
    }
    try {
        if (bitmap.width < 16 || bitmap.height < 16)
            throw new Error("Images must be at least 16 × 16 pixels.");
        const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height)), width = Math.round(bitmap.width * scale), height = Math.round(bitmap.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("Your browser could not prepare the image.");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Could not prepare this image.")), "image/jpeg", .91));
        return { blob, width, height };
    }
    finally {
        bitmap.close();
    }
}
function ImageDrop({ file, onChange, label, disabled }: {
    file: File | null;
    onChange: (f: File) => void;
    label: string;
    disabled: boolean;
}) {
    const [url, setUrl] = useState(""), [dragging, setDragging] = useState(false);
    useEffect(() => { if (!file) {
        setUrl("");
        return;
    } const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);
    return <label className={"drop-area" + (dragging ? " dragging" : "")} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled && e.dataTransfer.files[0])
        onChange(e.dataTransfer.files[0]); }}>
  {url ? <img src={url} alt={label + " preview"}/> : <Upload />}<strong>{file ? file.name : label}</strong><span>{file ? "Click to replace image" : "Drop an image or browse files"}</span>{!file && <span>JPG, PNG, WebP · up to 12 MB</span>}
  <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={label} disabled={disabled} onChange={e => { const f = e.target.files?.[0]; if (f)
        onChange(f); e.target.value = ""; }}/>
 </label>;
}
export function AnalysisResult({ analysis: a }: { analysis: Analysis }) {
    const [split, setSplit] = useState([50]), [mode, setMode] = useState("classified");
    const right = mode === "before-after" && a.images.before ? a.images.original : a.images.overlay, left = mode === "before-after" && a.images.before ? a.images.before : a.images.original;
    return <section className="panel results-panel" aria-label="Analysis results">
  <div className="results-head"><div><h3>{a.location}</h3><p>{a.width} × {a.height} px · {modules[a.type].title}</p></div><span className="source-badge">{a.source?.kind === "sentinel-2" ? "SENTINEL-2" : "YOUR IMAGE"}</span></div>
  {a.source?.capturedAt && <div className="capture-details"><span>Captured <strong>{new Date(a.source.capturedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</strong></span>{a.source.beforeCapturedAt && <span>Compared with {new Date(a.source.beforeCapturedAt).toLocaleDateString("en-GB")}</span>}<span>{a.source.cloudCover}% scene cloud · {a.source.validPercent}% usable area · {a.source.sizeKm} × {a.source.sizeKm} km</span></div>}
  {a.images.before && <Tabs value={mode} onValueChange={setMode} style={{ marginBottom: 15 }}><TabsList className="tabs-list"><TabsTrigger className="tabs-trigger" value="classified">Change overlay</TabsTrigger><TabsTrigger className="tabs-trigger" value="before-after">Before / after</TabsTrigger></TabsList></Tabs>}
  <div className="image-comparison"><img src={right} alt={mode === "before-after" ? "After observation" : "Classification overlay"}/><img src={left} alt={mode === "before-after" ? "Before observation" : "Original image"} style={{ clipPath: `inset(0 ${100 - split[0]}% 0 0)` }}/><div className="comparison-divider" style={{ left: split[0] + "%" }}><span><ArrowLeftRight size={15}/></span></div><span className="image-label left">{mode === "before-after" ? "BEFORE" : "ORIGINAL"}</span><span className="image-label right">{mode === "before-after" ? "AFTER" : "CLASSIFIED"}</span></div>
  <Slider className="comparison-slider" aria-label="Image comparison divider" value={split} onValueChange={setSplit} min={0} max={100} step={1}/><div className="slider-caption"><span>Slide to compare</span><span className="mono">{a.source?.kind === "sentinel-2" ? (a.type === "water" ? "NDWI" : "NDVI") : "RGB PROXY"}</span></div>
  <div className="result-stats">{a.metrics.map(m => <div className="result-stat" key={m.label}><span>{m.label}</span><strong style={{ color: m.color }}>{m.value.toLocaleString("en-IN")}<small style={{ fontSize: 13, marginLeft: 3 }}>{m.unit || "%"}</small></strong></div>)}</div>
  <div className="distribution" aria-label="Classification distribution">{a.distribution.map(d => <span key={d.label} style={{ width: d.value + "%", background: d.color }}/>)}</div><div className="legend">{a.distribution.map(d => <span key={d.label}><i style={{ background: d.color }}/>{d.label} {d.value}%</span>)}</div>
  <p className="result-summary">{a.summary}</p>
  <div className="result-actions"><a className="btn" href={`/api/analyses/${a.id}/report`} download><Download />Download report</a><a className="btn btn-quiet" href={a.images.original} download="satellite-capture.jpg"><Download />Original image</a></div>{a.source?.kind === "sentinel-2" && <p className="method-note">{a.source.provider}. Gray pixels are excluded. {a.source.nativeResolution}; resampled to {a.width} × {a.height}. <a href={"https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/" + a.source.sceneId} target="_blank" rel="noreferrer">Scene metadata ↗</a></p>}
 </section>;
}
function UploadWorkspace({ type, point, onSaved }: {
    type: AnalysisType;
    point: MapPoint | null;
    onSaved: (a: Analysis) => void;
}) {
    const [file, setFile] = useState<File | null>(null), [before, setBefore] = useState<File | null>(null), [location, setLocation] = useState(point?.name || ""), [latitude, setLatitude] = useState(point ? String(point.lat) : ""), [longitude, setLongitude] = useState(point ? String(point.lng) : "");
    const [error, setError] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState<Analysis | null>(null);
    const lock = useRef(false), info = modules[type];
    const select = (f: File, b = false) => { if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        setError("Choose a JPG, PNG, or WebP image.");
        return;
    } if (f.size > 12 * 1024 * 1024) {
        setError("Choose an image smaller than 12 MB.");
        return;
    } setError(""); if (b)
        setBefore(f);
    else
        setFile(f); };
    const run = async () => {
        if (lock.current)
            return;
        if (!file || (type === "forest" && !before)) {
            setError(type === "forest" ? "Choose both a before and an after image." : "Choose an image to analyze.");
            return;
        }
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            let source = file!, prior = before;
            const prepared = await prepareImage(source), fd = new FormData();
            fd.set("image", prepared.blob, "observation.jpg");
            fd.set("type", type);
            fd.set("location", location.trim() || "Untitled location");
            if (type === "forest" && prior) {
                const b = await prepareImage(prior);
                if (b.width !== prepared.width || b.height !== prepared.height)
                    throw new Error("Use before and after images with matching dimensions. Align them to the same area before uploading.");
                fd.set("before", b.blob, "before.jpg");
            }
            fd.set("latitude", latitude);
            fd.set("longitude", longitude);
            const r = await fetch("/api/analyses", { method: "POST", body: fd });
            const data = await r.json() as Analysis & {
                error?: string;
            };
            if (!r.ok)
                throw new Error(data.error || "Analysis could not be completed.");
            setResult(data);
            onSaved(data);
            toast.success("Observation analyzed and saved.");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Analysis could not be completed.");
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return <div className="analysis-layout">
  <section className="panel input-panel"><h3>Your observation starts here</h3><p>{info.long}</p>
   <div>{type === "forest" && <ImageDrop file={before} onChange={f => select(f, true)} label="Upload before image" disabled={busy}/>}<ImageDrop file={file} onChange={f => select(f)} label={type === "forest" ? "Upload after image" : "Upload satellite image"} disabled={busy}/>
   <div className="field"><label htmlFor="location-name">Location name <span className="muted">(optional)</span></label><input id="location-name" value={location} maxLength={100} onChange={e => setLocation(e.target.value)} placeholder="e.g. Meerut agricultural belt"/></div><div className="coords-fields"><div className="field"><label htmlFor="latitude">Latitude</label><input id="latitude" type="number" step="any" min="-90" max="90" value={latitude} onChange={e => setLatitude(e.target.value)} placeholder="Optional"/></div><div className="field"><label htmlFor="longitude">Longitude</label><input id="longitude" type="number" step="any" min="-180" max="180" value={longitude} onChange={e => setLongitude(e.target.value)} placeholder="Optional"/></div></div></div>
   <div className="action-stack"><button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? <Orbit className="loading-orbit"/> : <ScanLine />}{busy ? "Analyzing your imagery…" : "Run analysis"}{!busy && <ArrowRight />}</button>{busy && <div className="loading-line" role="progressbar" aria-label="Analyzing image" aria-valuetext="Processing"/>}</div>
   {error && <div className="error-box" role="alert">{error}{error.startsWith("Sign in") && <><br /><a href="/login?return_to=/workspace" target="_top">Open personal workspace</a></>}</div>}
   <p className="method-note">RGB images are resized to a maximum of 900 px. This is a color-based research method, not true NDVI/NDWI or a trained AI model.</p>
  </section>
  {busy ? <section className="panel results-empty" aria-live="polite"><div className="big-icon"><Orbit className="loading-orbit"/></div><h3>Reading the landscape</h3><p>Preparing the image, measuring pixel signals, and saving your observation.</p></section> : result ? <AnalysisResult analysis={result}/> : <section className="panel results-empty"><div className="big-icon"><ModuleIcon type={type}/></div><h3>Your image, measured.</h3><p>Upload your imagery to compare the original image with its measured RGB classification.</p></section>}
 </div>;
}

export default function AnalysisWorkspace(props: {type: AnalysisType; point: MapPoint | null; onSaved: (a: Analysis) => void}) {
 const [mode,setMode]=useState("satellite");
 return <><Tabs value={mode} onValueChange={setMode} className="source-tabs"><TabsList className="tabs-list"><TabsTrigger className="tabs-trigger" value="satellite">Satellite captures</TabsTrigger><TabsTrigger className="tabs-trigger" value="upload">Upload my images</TabsTrigger></TabsList></Tabs>{mode==="satellite"?<SatelliteWorkspace {...props}/>:<UploadWorkspace {...props}/>}</>;
}
