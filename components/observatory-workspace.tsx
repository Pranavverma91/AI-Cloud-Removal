"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutDashboard, Map, History, BookOpen, ChevronRight, ArrowUpRight, Plus, Orbit, Sprout, Droplets, Trees, FlaskConical, Satellite as SatelliteMark, ScanLine, ArrowRight, Search, Maximize2, ShieldCheck, MapPin, LogOut } from "lucide-react";
import { SidebarProvider, Sidebar, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import ObservationMap, { type MapPoint } from "@/components/observation-map";
import AnalysisWorkspace, { AnalysisResult, ModuleIcon } from "@/components/analysis-workspace";
import { modules, type Analysis, type AnalysisType } from "@/lib/types";
type View = "overview" | "map" | "history" | "methodology" | AnalysisType;
const views: View[] = ["overview", "map", "history", "methodology", "agriculture", "water", "forest"];
const names: Record<View, string> = { overview: "Dashboard", map: "Map explorer", history: "Saved analyses", methodology: "Data & methods", agriculture: "Crop health", water: "Water detection", forest: "Forest change" };
function SidebarNav({ view, navigate, name, onAccount }: {
    view: View;
    navigate: (v: View) => void;
    name: string;
    onAccount: () => void;
}) {
    const { setOpenMobile } = useSidebar();
    const go = (v: View) => { navigate(v); setOpenMobile(false); };
    const link = (v: View, icon: React.ReactNode) => <SidebarMenuItem key={v}><SidebarMenuButton className={"nav-item " + (view === v ? "active" : "")} onClick={() => go(v)} isActive={view === v}>{icon}<span>{names[v]}</span>{view === v && <span className="nav-dot"/>}</SidebarMenuButton></SidebarMenuItem>;
    return <Sidebar className="shell-sidebar"><a href="/" className="brand" ><div className="brand-mark"><Orbit size={28} strokeWidth={1.4}/></div><div><h1>AI-Based Cloud Removal and Reconstruction</h1><span>EARTH. UNDERSTOOD.</span></div></a>
  <SidebarContent><div className="side-label">WORKSPACE</div><SidebarMenu style={{ padding: "0 15px", gap: 5 }}>{link("overview", <LayoutDashboard />)}{link("map", <Map />)}</SidebarMenu>
   <div className="side-label" style={{ marginTop: 30 }}>OBSERVATION TOOLS</div><SidebarMenu style={{ padding: "0 15px", gap: 5 }}>{link("agriculture", <Sprout />)}{link("water", <Droplets />)}{link("forest", <Trees />)}</SidebarMenu>
   <div style={{ height: 1, background: "#2c3b2c", margin: "24px 24px 5px" }}/><SidebarMenu style={{ padding: "0 15px", gap: 5 }}>{link("history", <History />)}{link("methodology", <BookOpen />)}</SidebarMenu>
  </SidebarContent>
  <SidebarFooter className="sidebar-bottom"><div className="research-label"><div className="tiny-title"><ShieldCheck size={15}/>Your personal observatory</div><p>Your locations, imagery<br />and observations.</p></div><button className="account" onClick={onAccount} style={{ textAlign: "left", width: "100%" }} aria-label="Open workspace information"><span className="avatar">{name.slice(0, 2).toUpperCase()}</span><div>{name.length > 19 ? name.slice(0, 18) + "…" : name}<small>Personal workspace</small></div><ChevronRight size={15} className="chevron"/></button></SidebarFooter>
 </Sidebar>;
}
function ModuleCard({ type, onClick }: {
    type: AnalysisType;
    onClick: () => void;
}) { return <button className={"module-card " + type} onClick={onClick}><span className="module-icon"><ModuleIcon type={type}/></span><div><h4>{modules[type].title}</h4><p>{modules[type].description}</p></div><ArrowUpRight className="arrow"/></button>; }
function AnalysisTable({ items, onOpen }: {
    items: Analysis[];
    onOpen: (a: Analysis) => void;
}) {
    return <div className="panel"><Table className="analysis-table"><TableHeader><TableRow><TableHead>OBSERVATION</TableHead><TableHead>ANALYSIS TYPE</TableHead><TableHead>KEY MEASUREMENT</TableHead><TableHead>CREATED</TableHead><TableHead><span className="sr-only">Open observation</span></TableHead></TableRow></TableHeader><TableBody>{items.map(a => <TableRow key={a.id}><TableCell><button className={"table-name " + a.type} onClick={() => onOpen(a)} style={{ textAlign: "left" }}><span className="module-icon"><ModuleIcon type={a.type}/></span><div>{a.location}<small>{a.latitude !== null ? `${a.latitude.toFixed(3)}°, ${a.longitude?.toFixed(3)}°` : "Uploaded imagery"}</small></div></button></TableCell><TableCell><span className={"type-tag " + a.type}>{modules[a.type].title}</span></TableCell><TableCell><strong style={{ fontWeight: 500 }}>{a.metrics[0].value}{a.metrics[0].unit || "%"}</strong><span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>{a.metrics[0].label.toLowerCase()}</span></TableCell><TableCell className="muted" style={{ fontSize: 12 }}>{new Date(a.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</TableCell><TableCell><button className="icon-btn" aria-label={"Open " + a.location} onClick={() => onOpen(a)}><ArrowUpRight size={15}/></button></TableCell></TableRow>)}</TableBody></Table></div>;
}
function Methodology() {
 const contents=[{type:"agriculture" as const,title:"Vegetation, measured",formula:"NDVI = (NIR − Red) / (NIR + Red)",body:"Sentinel-2 bands B08 and B04 measure vegetation greenness. High greenness does not establish crop health or diagnose disease.",items:["High vegetation: NDVI ≥ 0.6","Moderate: 0.3 ≤ NDVI < 0.6","Low: NDVI < 0.3"]},{type:"water" as const,title:"A spectral water signal",formula:"NDWI = (Green − NIR) / (Green + NIR)",body:"Bands B03 and B08 separate a positive water signal from other surfaces. Reflective roofs, shadows, and turbid water can affect classification.",items:["Water signal: NDWI > 0","Reports mean NDWI and valid pixels","Uses 10 m source spectral bands"]},{type:"forest" as const,title:"Change between captures",formula:"ΔNDVI = NDVI after − NDVI before",body:"Two captures are sampled on the same geographic grid. Only pixels usable in both dates enter the comparison.",items:["Vegetation decrease: ΔNDVI < −0.2","Vegetation increase: ΔNDVI > 0.2","Dense vegetation cover: NDVI ≥ 0.6"]}];
 return <><div className="method-grid">{contents.map(c=><section className={"panel method-card "+c.type} key={c.type}><span className="module-icon"><ModuleIcon type={c.type}/></span><h3>{c.title}</h3><p>{c.body}</p><div className="formula">{c.formula}</div><ul>{c.items.map(i=><li key={i}>{i}</li>)}</ul></section>)}</div><section className="panel limitations"><h3>Where your results come from</h3><p>Satellite captures come from Copernicus Sentinel-2 Level-2A through Microsoft Planetary Computer. Search returns the newest matching dates available in the preceding year. Every result retains the actual capture date, scene identifier, coordinates, cloud cover, and selected area. Satellite imagery is updated after acquisition and processing, not continuously in real time.</p><p>Reflectance digital numbers are corrected by −1000 for processing baseline 04.00 and later, then scaled by 10000. Scene classification classes 4, 5, 6, and 7 are retained. Cloud, shadow, snow, invalid values, and no-data are excluded. Areas with less than 5% usable coverage are rejected. Images are sampled on a 384 × 384 grid; percentages describe usable pixels, not surveyed land area.</p><p>NDVI is a vegetation indicator, not a forest or crop species classifier. Crops and seasonal changes can produce the same signals as forest change. Compare similar seasons and verify unusual results on the ground. Uploaded ordinary images use a separate RGB color proxy, which is labeled in the results.</p><p>The map is an Esri reference basemap with place labels. Search and nearby place names use OpenStreetMap data through Photon. A name identifies the nearest mapped feature; the selection coordinates define the analyzed area.</p><div className="method-links"><a href="https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a" target="_blank" rel="noreferrer">Satellite source ↗</a><a href="https://sentiwiki.copernicus.eu/web/s2-processing" target="_blank" rel="noreferrer">Sentinel-2 processing ↗</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Map attribution ↗</a></div></section></>;
}
type ModelContext = {
    registerTool: (t: {
        name: string;
        description: string;
        inputSchema: object;
        annotations: {
            readOnlyHint: boolean;
        };
        execute: (input: unknown) => unknown;
    }, opts: {
        signal: AbortSignal;
    }) => Promise<void> | void;
};
export default function ObservatoryWorkspace({ profile, personalMode }: { profile: {name: string; email: string}; personalMode: boolean }) {
    const [view, setView] = useState<View>("overview"), [analyses, setAnalyses] = useState<Analysis[]>([]), [counts, setCounts] = useState<Record<string, number>>({}), [loading, setLoading] = useState(true), [error, setError] = useState("");
    const [name, setName] = useState(profile.name), [email, setEmail] = useState<string | null>(profile.email), [newOpen, setNewOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false), [detail, setDetail] = useState<Analysis | null>(null), [point, setPoint] = useState<MapPoint | null>(null), [filter, setFilter] = useState("all"), [query, setQuery] = useState("");
    const latest = useRef({ analyses, view });
    latest.current = { analyses, view };
    const navigate = useCallback((v: View) => { setView(v); setDetail(null); const url = new URL(window.location.href); if (v === "overview")
        url.searchParams.delete("view");
    else
        url.searchParams.set("view", v); window.history.pushState({}, "", url); window.scrollTo({ top: 0, behavior: "instant" }); }, []);
    const refresh = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const r = await fetch("/api/analyses");
            const data = await r.json() as {
                analyses: Analysis[];
                counts: Record<string, number>;
                error?: string;
            };
            if (r.status === 401 && !personalMode) { window.location.assign("/login?return_to=" + encodeURIComponent(window.location.pathname + window.location.search)); return; }
            if (!r.ok)
                throw new Error(data.error || "The observation archive could not be loaded.");
            setAnalyses(data.analyses);
            setCounts(data.counts);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not load observations.");
        }
        finally {
            setLoading(false);
        }
    }, [personalMode]);
    useEffect(() => {
        const readView = () => { const v = new URLSearchParams(window.location.search).get("view") as View; setView(views.includes(v) ? v : "overview"); };
        readView();
        window.addEventListener("popstate", readView);
        void refresh();
        fetch("/api/profile").then(async (r) => r.ok ? await r.json() as {
            name: string;
            email: string | null;
        } : null).then(x => { if (x) {
            setName(x.name);
            setEmail(x.email);
        } }).catch(() => { });
        return () => window.removeEventListener("popstate", readView);
    }, [refresh]);
    useEffect(() => {
        const ctx = (document as Document & {
            modelContext?: ModelContext;
        }).modelContext;
        if (!ctx?.registerTool)
            return;
        const lifecycle = new AbortController();
        const tools = [{ name: "navigate_observation_workspace", description: "Open the overview, map, saved analyses, methodology, or a specific analysis workspace. This does not run or save an analysis.", inputSchema: { type: "object", properties: { view: { type: "string", enum: views } }, required: ["view"], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: async (input: unknown) => { const v = (input as {
                    view?: View;
                })?.view; if (!v || !views.includes(v))
                    throw new Error("Unknown workspace view."); navigate(v); await new Promise(r => requestAnimationFrame(r)); return { view: v, title: names[v] }; } }, { name: "list_saved_observations", description: "Read the observations currently loaded in this user's archive.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => ({ observations: latest.current.analyses.map(a => ({ id: a.id, type: a.type, location: a.location, createdAt: a.createdAt, capturedAt: a.source?.capturedAt })), view: latest.current.view }) }];
        for (const tool of tools) {
            try {
                void Promise.resolve(ctx.registerTool(tool, { signal: lifecycle.signal })).catch(() => { });
            }
            catch { }
        }
        return () => lifecycle.abort();
    }, [navigate]);
    const onSaved = (a: Analysis) => { setAnalyses(prev => [a, ...prev]); setCounts(prev => ({ ...prev, [a.type]: (prev[a.type] || 0) + 1 })); };
    const total = Object.values(counts).reduce((a, b) => a + b, 0), filtered = analyses.filter(a => (filter === "all" || a.type === filter) && (a.location + " " + modules[a.type].title).toLowerCase().includes(query.toLowerCase()));
    const isModule = ["agriculture", "water", "forest"].includes(view), title = view === "overview" ? "Your personal observatory." : view === "map" ? "Explore the bigger picture." : view === "history" ? "Your observation archive." : view === "methodology" ? "Every result, explained." : modules[view as AnalysisType]?.title;
    const subtitle = view === "overview" ? "Find your place on Earth. Read its latest satellite signals." : view === "map" ? "Search a real place. Select an area. Inspect its satellite captures." : view === "history" ? "Revisit your imagery, measured results, and reports." : view === "methodology" ? "Transparent methods. Measurable signals. No black boxes." : modules[view as AnalysisType]?.description;
    return <SidebarProvider style={{ "--sidebar-width": "232px" } as React.CSSProperties}><SidebarNav view={view} navigate={navigate} name={name} onAccount={() => setAccountOpen(true)}/><main className="main-shell">
  <header className="topbar"><div className="breadcrumb"><SidebarTrigger className="mobile-trigger"/><span>Workspace</span><ChevronRight size={13}/><strong>{names[view]}</strong></div><div className="top-meta"><span className="academic-tag"><ShieldCheck size={13}/>Personal workspace</span></div></header>
  <div className="workspace">
   <div className="page-heading"><div><div className="eyebrow">{isModule ? "OBSERVATION / " + modules[view as AnalysisType].code : "EARTH OBSERVATION WORKSPACE"}</div><h2>{title}</h2><p>{subtitle}</p></div><button className="btn btn-primary" onClick={() => { setPoint(null); setNewOpen(true); }}><Plus /><span>New <span className="optional">analysis</span></span></button></div>
   {error && <div className="error-box" role="alert" style={{ marginBottom: 20 }}>{error} {!personalMode && error.startsWith("Sign in") ? <a href="/login?return_to=/workspace" target="_top">Log in →</a> : <button onClick={refresh} style={{ textDecoration: "underline", marginLeft: 8 }}>Retry</button>}</div>}
   {view === "overview" && <>
    <div className="stats-row">{[{ label: "Total observations", value: total, icon: <ScanLine />, note: "in your archive" }, { label: "Crop health", value: counts.agriculture || 0, icon: <Sprout />, note: "analyses" }, { label: "Water detection", value: counts.water || 0, icon: <Droplets />, note: "analyses" }, { label: "Forest change", value: counts.forest || 0, icon: <Trees />, note: "comparisons" }].map(s => <div className="stat-card" key={s.label}><div className="stat-top">{s.label}{s.icon}</div><div className="stat-bottom">{loading ? <Skeleton className="h-8 w-12"/> : <span className="stat-number">{error ? "—" : String(s.value).padStart(2, "0")}</span>}<span>{s.note}</span></div></div>)}</div>
    <div className="observatory-grid"><div><section className="panel" style={{ overflow: "visible", borderBottom: 0, background: "transparent" }}><div className="panel-heading" ><h3>Earth from above <span className="type-tag" style={{ marginLeft: 10 }}>SATELLITE</span></h3><button className="btn btn-quiet" style={{ fontSize: 12 }} onClick={() => navigate("map")}>Explore map <Maximize2 size={13}/></button></div><ObservationMap analyses={analyses} onAnalyze={p => { setPoint(p); setNewOpen(true); }} onOpen={setDetail}/></section></div>
     <aside className="toolkit"><h3>What will you observe?</h3>{(["agriculture", "water", "forest"] as AnalysisType[]).map(t => <ModuleCard key={t} type={t} onClick={() => { setPoint(null); navigate(t); }}/>)}<div className="capture-note"><SatelliteMark/><div><strong>Fresh from orbit</strong><p>Choose a capture date and see the exact image behind every result.</p></div></div></aside>
    </div>
    <section className="recent"><div className="section-heading"><h3>Recent observations <span>{total > 0 ? total + " in your archive" : ""}</span></h3><button className="btn btn-quiet" onClick={() => navigate("history")}>View archive <ArrowRight /></button></div>{loading ? <Skeleton className="h-28 w-full"/> : analyses.length ? <AnalysisTable items={analyses.slice(0, 4)} onOpen={setDetail}/> : <div className="panel empty-history"><span className="module-icon"><ScanLine /></span><div><h4>Your observations will appear here.</h4><p>Analyze a real capture to save its imagery, measurements, and report.</p></div><button className="btn" onClick={() => navigate("agriculture")}>Find satellite imagery <ArrowUpRight /></button></div>}</section>
   </>}
   {view === "map" && <section className="panel" style={{ overflow: "visible", background: "transparent", borderBottom: 0 }}><div className="panel-heading" ><h3>Map explorer</h3><span className="eyebrow">{analyses.filter(a => a.latitude !== null && !a.demo).length} SAVED LOCATIONS</span></div><ObservationMap full analyses={analyses} onOpen={setDetail} onAnalyze={p => { setPoint(p); setNewOpen(true); }}/></section>}
   {isModule && <AnalysisWorkspace key={view + (point ? point.lat + "," + point.lng : "")} type={view as AnalysisType} point={point} onSaved={onSaved}/>}
   {view === "history" && <><div className="filter-row"><Tabs value={filter} onValueChange={setFilter}><TabsList className="tabs-list"><TabsTrigger className="tabs-trigger" value="all">All observations</TabsTrigger><TabsTrigger className="tabs-trigger" value="agriculture">Crops</TabsTrigger><TabsTrigger className="tabs-trigger" value="water">Water</TabsTrigger><TabsTrigger className="tabs-trigger" value="forest">Forest</TabsTrigger></TabsList></Tabs><div className="search-wrap"><Search /><input className="search-input" aria-label="Search saved observations" placeholder="Search observations…" value={query} onChange={e => setQuery(e.target.value)}/></div></div>{loading ? <Skeleton className="h-52 w-full"/> : filtered.length ? <AnalysisTable items={filtered} onOpen={setDetail}/> : <div className="panel empty-history history-empty"><span className="big-icon"><History /></span><h4>{analyses.length ? "No matching observations" : "The beginning of your archive."}</h4><p>{analyses.length ? "Try another search or analysis type." : "Every analysis you run is saved here, with its imagery and report."}</p><button className="btn" onClick={() => analyses.length ? (setQuery(""), setFilter("all")) : setNewOpen(true)}>{analyses.length ? "Clear filters" : "Create an observation"}<ArrowRight /></button></div>}{analyses.length >= 200 && <p className="method-note">Showing your 200 most recent observations.</p>}</>}
   {view === "methodology" && <Methodology />}
   <footer className="page-footer"><span><ShieldCheck />Copernicus Sentinel-2 · Your observation archive</span><span className="footer-logo">AI-Based Cloud Removal and Reconstruction <span style={{ color: "#a5ae98" }}>/</span> A NEW PERSPECTIVE</span></footer>
  </div>
 </main>
 <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogContent><DialogHeader><div className="eyebrow" style={{ marginBottom: 8 }}>A NEW PERSPECTIVE</div><DialogTitle className="dialog-title-custom">What would you like to explore?</DialogTitle><DialogDescription>{point ? "Selected location: " + point.name + " · " + point.lat.toFixed(4) + ", " + point.lng.toFixed(4) : "Choose an observation tool to begin."}</DialogDescription></DialogHeader><div className="dialog-modules">{(["agriculture", "water", "forest"] as AnalysisType[]).map(t => <ModuleCard key={t} type={t} onClick={() => { setNewOpen(false); navigate(t); }}/>)}</div></DialogContent></Dialog>
 <Dialog open={!!detail} onOpenChange={o => { if (!o)
        setDetail(null); }}><DialogContent className="detail-dialog"><DialogHeader><DialogTitle className="sr-only">Saved observation details</DialogTitle><DialogDescription className="sr-only">Compare the imagery, review measured results, and download the observation report.</DialogDescription></DialogHeader>{detail && <AnalysisResult key={detail.id} analysis={detail}/>}</DialogContent></Dialog>
 <Dialog open={accountOpen} onOpenChange={setAccountOpen}><DialogContent><DialogHeader><DialogTitle className="dialog-title-custom">Your personal workspace</DialogTitle><DialogDescription>{personalMode ? "Observations and uploaded imagery are saved in this workspace." : "Observations and uploaded imagery belong to your signed-in account."}</DialogDescription></DialogHeader><p style={{ fontSize: 18 }}>{name}</p>{!personalMode && email && <p className="muted" style={{ fontSize: 14, overflowWrap: "anywhere" }}>{email}</p>}<p className="method-note">Your archive includes {total} saved observation{total === 1 ? "" : "s"}.</p>{!personalMode && <button className="btn" onClick={async()=>{await fetch("/api/science/auth/logout",{method:"POST",headers:{"X-Space-Eye":"1"}});window.location.href="/"}}><LogOut size={15}/>Sign out</button>}</DialogContent></Dialog>
 <Toaster position="bottom-right" richColors/>
 </SidebarProvider>;
}
