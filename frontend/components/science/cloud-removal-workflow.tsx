"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Cloud,
  CloudOff,
  Scan,
  Eye,
  Layers,
  ArrowRight,
  ArrowDown,
  Upload,
  Satellite,
  MapPin,
  CheckCircle2,
  CircleDashed,
  BarChart3,
  Download,
  type LucideIcon,
} from "lucide-react";
import { LocationSearch } from "./location-cloud-cover";
import { SatelliteAreaPanel } from "./satellite-area-panel";
import { LissAreaPanel } from "./liss-area-panel";

const GeoMap = dynamic(() => import("./geo-map"), { ssr: false });

type Point = [number, number];
type Stage = "select" | "detect" | "reconstruct" | "analyze";

const STAGES: {
  id: Stage;
  step: number;
  icon: LucideIcon;
  title: string;
  detail: string;
  color: string;
}[] = [
  {
    id: "select",
    step: 1,
    icon: MapPin,
    title: "Choose area",
    detail: "Pick a satellite-covered location on the map or search by name.",
    color: "#27d8e8",
  },
  {
    id: "detect",
    step: 2,
    icon: Scan,
    title: "Detect clouds",
    detail:
      "The AI classifier marks cloud pixels (classes 8, 9, 10) and shadows (class 3) from the Sentinel-2 scene classification.",
    color: "#a78bfa",
  },
  {
    id: "reconstruct",
    step: 3,
    icon: CloudOff,
    title: "Remove & reconstruct",
    detail:
      "Spatial interpolation or temporal reference fills each masked pixel while preserving every clear observation exactly.",
    color: "#34d399",
  },
  {
    id: "analyze",
    step: 4,
    icon: BarChart3,
    title: "Analyse area",
    detail:
      "Inspect spectral values, NDVI, cloud fraction, and download georeferenced GeoTIFF outputs with full provenance.",
    color: "#fb923c",
  },
];

function StageIndicator({
  current,
  done,
}: {
  current: Stage;
  done: Stage[];
}) {
  return (
    <nav
      className="se-workflow-stages"
      aria-label="Cloud removal stages"
    >
      {STAGES.map((s, i) => {
        const active = s.id === current;
        const completed = done.includes(s.id);
        const Icon = s.icon;
        return (
          <div key={s.id} className="se-workflow-stage-item">
            <div
              className={
                "se-workflow-stage-dot" +
                (active ? " active" : "") +
                (completed ? " done" : "")
              }
              style={{ borderColor: active || completed ? s.color : undefined }}
              aria-current={active ? "step" : undefined}
            >
              {completed ? (
                <CheckCircle2 size={14} style={{ color: s.color }} />
              ) : active ? (
                <Icon size={14} style={{ color: s.color }} />
              ) : (
                <CircleDashed size={14} />
              )}
            </div>
            <div className="se-workflow-stage-label">
              <small>0{s.step}</small>
              <span>{s.title}</span>
            </div>
            {i < STAGES.length - 1 && (
              <ArrowRight
                size={12}
                className="se-workflow-stage-arrow"
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

function HowItWorks() {
  return (
    <section className="se-panel se-how-it-works" aria-label="How AI cloud removal works">
      <p className="se-eyebrow">AI PIPELINE OVERVIEW</p>
      <h2>From cloudy satellite image to reconstructed area</h2>
      <p>
        The pipeline combines a pixel-level cloud classifier with a spatial or
        temporal reconstruction engine. Every clear pixel is preserved exactly;
        only masked pixels are estimated.
      </p>

      <div className="se-pipeline-flow">
        {/* Step boxes */}
        {[
          {
            icon: Satellite,
            color: "#27d8e8",
            label: "Raw optical observation",
            desc: "Sentinel-2 L2A · dated · georeferenced · multi-band",
          },
          {
            icon: Cloud,
            color: "#a78bfa",
            label: "AI cloud & shadow detection",
            desc: "Scene-classification mask · cirrus · thick cloud · shadow",
          },
          {
            icon: Layers,
            color: "#34d399",
            label: "Conditional reconstruction",
            desc: "Spatial interpolation or temporal reference fills masked pixels",
          },
          {
            icon: Eye,
            color: "#fb923c",
            label: "Traceable surface estimate",
            desc: "GeoTIFF output · NDVI · comparison · provenance JSON",
          },
        ].map(({ icon: Icon, color, label, desc }, i, arr) => (
          <div key={label} className="se-pipeline-step-wrap">
            <article className="se-pipeline-step">
              <div
                className="se-pipeline-icon"
                style={{ background: color + "22", border: `1.5px solid ${color}44` }}
              >
                <Icon size={22} style={{ color }} />
              </div>
              <div>
                <strong>{label}</strong>
                <p>{desc}</p>
              </div>
            </article>
            {i < arr.length - 1 && (
              <ArrowDown
                size={16}
                className="se-pipeline-arrow"
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>

      <div className="se-method-options">
        <article className="se-method-card">
          <Layers size={20} style={{ color: "#27d8e8" }} />
          <div>
            <strong>Spatial reconstruction</strong>
            <p>
              Estimates hidden pixels from nearby clear observations using
              multi-scale mean interpolation. Works with a single date; accuracy
              drops for large cloudy regions.
            </p>
          </div>
        </article>
        <article className="se-method-card">
          <Satellite size={20} style={{ color: "#34d399" }} />
          <div>
            <strong>Temporal reconstruction</strong>
            <p>
              Replaces masked pixels with calibrated observations from a second
              clear-sky capture. Reveals actual ground conditions on that
              reference date.
            </p>
          </div>
        </article>
        <article className="se-method-card">
          <Upload size={20} style={{ color: "#fb923c" }} />
          <div>
            <strong>Upload your own imagery</strong>
            <p>
              Upload LISS-IV GeoTIFFs with acquisition dates and band mapping.
              Processed locally; no file leaves your browser.
            </p>
          </div>
        </article>
      </div>

      <div className="se-pipeline-note">
        <p className="se-meta">
          <strong>Spatial and temporal methods</strong> are non-trained
          baselines that run entirely in the browser — no Python service or GPU
          required. Neural reconstruction (ResUNet, cGAN, DDPM) requires trained
          weights and the optional Python inference service.
        </p>
      </div>
    </section>
  );
}

export default function CloudRemovalWorkflow() {
  const [stage, setStage] = useState<Stage>("select");
  const [done, setDone] = useState<Stage[]>([]);
  const [point, setPoint] = useState<Point | null>(null);
  const [center, setCenter] = useState<Point | undefined>();
  const [locationName, setLocationName] = useState("");
  const [sensor, setSensor] = useState("ground");
  const reportRef = useRef<HTMLDivElement>(null);

  // Advance stage automatically based on selections
  useEffect(() => {
    if (point && stage === "select") {
      setDone((d) => (d.includes("select") ? d : [...d, "select"]));
      setStage("detect");
    }
  }, [point, stage]);

  function scrollToReport() {
    reportRef.current?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  function selectMapPoint(next: Point) {
    setPoint(next);
    if (sensor === "ground") setCenter(next);
    setLocationName("");
  }

  function selectSearchLocation(next: Point, name: string) {
    setPoint(next);
    setCenter(next);
    setLocationName(name);
  }

  function activateSentinel() {
    setSensor("sentinel");
    setDone((d) => (d.includes("detect") ? d : [...d, "detect"]));
    setStage("reconstruct");
    setTimeout(scrollToReport, 100);
  }

  return (
    <>
      {/* ── Page header ── */}
      <div className="se-title">
        <div>
          <p className="se-eyebrow">AI CLOUD REMOVAL & RECONSTRUCTION</p>
          <h1>Remove clouds. Reconstruct the surface.</h1>
          <p>
            Choose a location, detect cloud and shadow pixels in a real
            satellite observation, run spatial or temporal reconstruction, and
            export the result — all in the browser.
          </p>
        </div>
        <div className="se-title-actions">
          <Link className="se-button primary" href="/analysis/new">
            <Upload size={15} />
            Upload imagery
          </Link>
          <Link className="se-button" href="/reconstructions">
            <Download size={15} />
            Past results
          </Link>
        </div>
      </div>

      {/* ── Stage indicator ── */}
      <StageIndicator current={stage} done={done} />

      {/* ── Step 1 / 2 — Map + search ── */}
      <section
        id="cr-location"
        className="se-cloud-map-layout"
        aria-label="Choose a location and satellite image"
      >
        <div className="se-cloud-map-main">
          {/* Controls */}
          <div className="se-panel se-cloud-map-search">
            <div className="se-satellite-panel se-satellite-controls se-map-source">
              <label>
                Imagery source
                <select
                  value={sensor}
                  onChange={(e) => {
                    setSensor(e.target.value);
                    if (e.target.value === "ground" && point) setCenter(point);
                  }}
                >
                  <option value="ground">Detailed aerial view · recorded imagery</option>
                  <option value="liss">LISS-IV · your uploaded scenes</option>
                  <option value="sentinel">Sentinel-2 · public satellite imagery</option>
                </select>
              </label>
            </div>
            <LocationSearch onSelect={selectSearchLocation} />
            <p className="se-meta">
              {sensor === "ground"
                ? "Search or tap the map to choose an area. Switch to Sentinel-2 to see cloud percentages and run reconstruction."
                : "Tap anywhere on the map to analyse that location. Cloud detection and reconstruction controls appear below."}
            </p>

            {/* Quick action: go straight to Sentinel-2 reconstruction */}
            {point && sensor === "ground" && (
              <div className="se-cr-quick-actions">
                <button
                  className="se-button primary"
                  onClick={activateSentinel}
                >
                  <Cloud size={15} />
                  Detect clouds &amp; reconstruct area
                </button>
                <button
                  className="se-button"
                  onClick={() => {
                    setSensor("liss");
                    scrollToReport();
                  }}
                >
                  Analyse LISS-IV imagery
                </button>
              </div>
            )}
          </div>

          {/* Map */}
          <GeoMap
            key={sensor === "ground" ? "ground" : "analysis"}
            initialBasemap="satellite"
            focusZoom={sensor === "ground" ? 18 : undefined}
            center={center}
            selectedPoint={point || undefined}
            onPoint={selectMapPoint}
            height={560}
          />
        </div>

        {/* Report panel */}
        <div ref={reportRef} className="se-cloud-map-report">
          {sensor === "ground" ? (
            /* Ground view info + call-to-action */
            <section
              className="se-panel se-cloud-check se-ground-report"
              aria-label="Ground area info"
            >
              <p className="se-eyebrow">REAL AERIAL & SATELLITE IMAGERY</p>
              <h2>See the area up close</h2>
              <p>
                {point
                  ? `${locationName || "Selected location"} · ${point[1].toFixed(5)}°, ${point[0].toFixed(5)}°`
                  : "Choose a place or tap the map to see the area up close."}
              </p>

              {/* AI removal CTA */}
              <div className="se-cr-cta-box">
                <div className="se-cr-cta-icon">
                  <CloudOff size={28} style={{ color: "#27d8e8" }} />
                </div>
                <div>
                  <strong>AI cloud removal ready</strong>
                  <p>
                    Switch to Sentinel-2 to fetch a dated satellite observation
                    for this area. The built-in classifier will highlight clouds
                    and you can run reconstruction with one click.
                  </p>
                </div>
              </div>

              <div className="se-liss-actions">
                <button className="se-button primary" onClick={activateSentinel} disabled={!point}>
                  <Cloud size={15} />
                  Remove clouds &amp; reconstruct this area
                </button>
                <button className="se-button" onClick={() => { setSensor("liss"); scrollToReport(); }}>
                  Analyse LISS-IV imagery
                </button>
              </div>

              {!point && (
                <p className="se-satellite-notice">
                  Select a location on the map first, then click the button above.
                </p>
              )}

              <dl className="se-ground-facts">
                <div><dt>Image source</dt><dd>Esri World Imagery</dd></div>
                <div><dt>Capture date</dt><dd>Varies by location · unavailable here</dd></div>
                <div><dt>Image status</dt><dd>Recorded imagery · not live video</dd></div>
              </dl>
              <p className="se-meta">
                Buildings, roads and tree cover may be visible. Zooming in
                cannot add detail that the source did not capture.
              </p>
            </section>
          ) : sensor === "liss" ? (
            <LissAreaPanel point={point} locationName={locationName} />
          ) : (
            /* Sentinel-2: cloud detection + reconstruction controls */
            <div>
              {/* Stage callout */}
              <div className="se-cr-stage-callout">
                <div className="se-cr-stage-number">
                  <Scan size={16} style={{ color: "#a78bfa" }} />
                  <span>Step 2 of 4 — AI cloud detection active</span>
                </div>
                <p className="se-meta">
                  The classifier scans the selected Sentinel-2 capture. White
                  highlights mark clouds and cirrus. Choose a date, check the
                  cloud percentage, then scroll down to run reconstruction.
                </p>
              </div>
              <SatelliteAreaPanel
                point={point}
                locationName={locationName}
              />
            </div>
          )}

          {point && (
            <a className="se-button se-cloud-return" href="#cr-location">
              ← Choose another location
            </a>
          )}
        </div>
      </section>

      {/* ── How it works ── */}
      <HowItWorks />

      {/* ── Upload path ── */}
      <section className="se-panel se-upload-path" aria-label="Upload your own imagery">
        <div className="se-upload-path-copy">
          <p className="se-eyebrow">UPLOAD YOUR OWN IMAGERY</p>
          <h2>Bring LISS-IV or any GeoTIFF</h2>
          <p>
            Upload georeferenced imagery (uint8 / uint16, 1–8 bands, WGS84 or
            Web Mercator, up to 32 MB / 2 Mpx). Map green, red and NIR to the
            correct bands and run cloud removal with the same built-in processor.
          </p>
          <ul className="se-upload-checklist">
            <li>LISS-IV GeoTIFF with acquisition date and band metadata</li>
            <li>Optional: supply your own cloud / shadow class mask</li>
            <li>Supports uint8, uint16, int8, int16, float32</li>
            <li>Processing runs in the browser — no upload to a server</li>
          </ul>
        </div>
        <div className="se-upload-path-action">
          <Link className="se-button primary" href="/analysis/new">
            <Upload size={16} />
            Upload imagery &amp; start
          </Link>
          <Link className="se-button" href="/analysis/new?sensor=LISS-IV">
            Upload LISS-IV scene
          </Link>
        </div>
      </section>
    </>
  );
}
