"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Title } from "./primitives";
import { LocationSearch, CloudCoverPanel } from "./location-cloud-cover";
import { SatelliteAreaPanel } from "./satellite-area-panel";
import { LissAreaPanel } from "./liss-area-panel";

const GeoMap = dynamic(() => import("./geo-map"), { ssr: false });
type Point = [number, number];

export default function Explorer() {
  const [point, setPoint] = useState<Point | null>(null);
  const [center, setCenter] = useState<Point>();
  const [locationName, setLocationName] = useState("");
  const [sensor, setSensor] = useState("ground");
  const report = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      sensor === "ground" ||
      !point ||
      !window.matchMedia?.("(max-width: 1100px)").matches
    )
      return;
    report.current?.scrollIntoView?.({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }, [point, sensor]);

  function selectMapPoint(nextPoint: Point) {
    setPoint(nextPoint);
    if (sensor === "ground") setCenter(nextPoint);
    setLocationName("");
  }

  function selectSearchLocation(nextPoint: Point, name: string) {
    setPoint(nextPoint);
    setCenter(nextPoint);
    setLocationName(name);
  }

  return (
    <>
      <Title
        title="Cloud removal & reconstruction"
        description="Choose an area, detect clouds in a dated satellite image, reconstruct the obscured regions and inspect the analysis report."
      />
      <section
        className="se-panel se-reconstruction-entry"
        aria-label="Cloud removal workflow"
      >
        <div>
          <p className="se-eyebrow">YOUR CLOUD REMOVAL PROJECT</p>
          <h2>From cloudy image to reconstructed area</h2>
          <ol className="se-workflow-steps">
            <li>Choose an area</li>
            <li>Inspect clouds</li>
            <li>Run reconstruction</li>
            <li>Compare &amp; analyse</li>
          </ol>
          <p className="se-meta">
            Processing uses the dated satellite observation. Your result
            includes the original image, cloud mask, reconstructed image and
            vegetation analysis.
          </p>
        </div>
        <div className="se-reconstruction-entry-actions">
          <button
            className="se-button primary"
            disabled={!point}
            onClick={() => {
              setSensor("sentinel");
              report.current?.scrollIntoView?.({ block: "start" });
            }}
          >
            Choose image &amp; remove clouds
          </button>
          {!point && (
            <p className="se-meta">Select a location on the map first.</p>
          )}
          <Link className="se-button" href="/analysis/new?sensor=LISS-IV">
            Upload LISS-IV for cloud removal
          </Link>
          <Link className="se-text-link" href="/reconstructions">
            View reconstruction results
          </Link>
        </div>
      </section>
      <div className="se-cloud-map-layout">
        <section
          id="cloud-map-location"
          className="se-cloud-map-main"
          aria-label="Choose a location"
        >
          <div className="se-panel se-cloud-map-search">
            <div className="se-satellite-panel se-satellite-controls se-map-source">
              <label>
                Imagery source
                <select
                  value={sensor}
                  onChange={(event) => {
                    setSensor(event.target.value);
                    if (event.target.value === "ground" && point)
                      setCenter(point);
                  }}
                >
                  <option value="ground">
                    Detailed aerial view · recorded imagery
                  </option>
                  <option value="liss">LISS-IV · your uploaded scenes</option>
                  <option value="sentinel">
                    Sentinel-2 · public satellite imagery
                  </option>
                </select>
              </label>
            </div>
            <LocationSearch onSelect={selectSearchLocation} />
            <p className="se-meta">
              {sensor === "ground"
                ? "Search for a place or tap the map to zoom into its real aerial image. Pan and zoom to explore nearby buildings, roads and vegetation."
                : "Tap anywhere on the map to analyse that location. The report updates automatically when you choose another point."}
            </p>
          </div>
          <GeoMap
            key={sensor === "ground" ? "ground" : "analysis"}
            initialBasemap="satellite"
            focusZoom={sensor === "ground" ? 18 : undefined}
            center={center}
            selectedPoint={point || undefined}
            onPoint={selectMapPoint}
            height={600}
          />
        </section>
        <div ref={report} className="se-cloud-map-report">
          {sensor === "ground" ? (
            <section
              className="se-panel se-cloud-check se-ground-report"
              aria-label="Detailed area imagery"
            >
              <p className="se-eyebrow">REAL AERIAL & SATELLITE IMAGERY</p>
              <h2>Explore the ground</h2>
              <p>
                {point
                  ? `${locationName || "Selected location"} · ${point[1].toFixed(5)}°, ${point[0].toFixed(5)}°`
                  : "Choose a place or tap the map to see the area up close."}
              </p>
              <dl className="se-ground-facts">
                <div>
                  <dt>Image source</dt>
                  <dd>Esri World Imagery</dd>
                </div>
                <div>
                  <dt>Capture date</dt>
                  <dd>Varies by location · unavailable here</dd>
                </div>
                <div>
                  <dt>Image status</dt>
                  <dd>Recorded imagery · not live video</dd>
                </div>
              </dl>
              <p className="se-meta">
                Buildings, roads and tree cover may be visible. Small details
                such as cars depend on the image resolution at this location.
                Zooming in cannot add detail that the source did not capture.
              </p>
              <p className="se-meta">
                Weather updates describe current forecast-grid conditions. They
                do not change the clouds or objects in this recorded image.
              </p>
              <div className="se-liss-actions">
                <button
                  className="se-button primary"
                  onClick={() => setSensor("sentinel")}
                >
                  Remove clouds &amp; analyse this area
                </button>
                <button className="se-button" onClick={() => setSensor("liss")}>
                  Analyse LISS-IV imagery
                </button>
              </div>
              <details className="se-satellite-method">
                <summary>Image detail and sources</summary>
                <p className="se-meta">
                  Aerial imagery can show finer ground detail than LISS-IV.
                  LISS-IV has 5.8 m pixels and dated acquisitions; it is
                  intended for area analysis rather than identifying individual
                  cars.
                </p>
                <a
                  href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9"
                  target="_blank"
                  rel="noreferrer"
                >
                  Esri imagery information
                </a>
                {" · "}
                <a
                  href="https://www.isro.gov.in/RESOURCESAT-2A.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  ISRO LISS-IV specifications
                </a>
              </details>
            </section>
          ) : sensor === "liss" ? (
            <LissAreaPanel point={point} locationName={locationName} />
          ) : (
            <SatelliteAreaPanel point={point} locationName={locationName} />
          )}
          <CloudCoverPanel
            point={point}
            locationName={locationName}
            title="Current weather estimate"
            autoRefresh={true}
          />
          {point && (
            <a className="se-button se-cloud-return" href="#cloud-map-location">
              Choose another location
            </a>
          )}
        </div>
      </div>
    </>
  );
}
