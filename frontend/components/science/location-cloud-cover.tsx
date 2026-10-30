"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Cloud, Download, MapPin, Search } from "lucide-react";
import { api } from "@/lib/science/client";
import type { CloudCoverResult } from "@/lib/cloud-cover";
import {
  cloudCondition,
  cloudReport,
  cloudReportHtml,
} from "@/lib/cloud-report";

type Point = [number, number];
type Place = {
  properties: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  geometry: { coordinates: Point };
};

export function LocationSearch({
  onSelect,
}: {
  onSelect: (point: Point, name: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPlaces([]);
    setError("");
    setBusy(false);
    const value = query.trim();
    // A pair of numeric values is always longitude, latitude.
    const parts = value.split(",").map((part) => part.trim());
    if (
      parts.length === 2 &&
      parts.every((part) => part !== "" && Number.isFinite(Number(part)))
    ) {
      const point = parts.map(Number) as Point;
      if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 85) {
        setError(
          "Use longitude −180 to 180 and latitude −85 to 85 for the map.",
        );
        return;
      }
      onSelect(point, "");
      return;
    }
    if (value.length < 2) {
      setError("Enter a place name or longitude, latitude.");
      return;
    }
    setBusy(true);
    try {
      const matches = await api<Place[]>(
        "/geography/places?q=" + encodeURIComponent(value),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setPlaces(matches);
      if (!matches.length)
        setError("No matching place. Try a nearby town or click the map.");
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Place search is unavailable. You can still click the map.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="se-location-search">
      <form onSubmit={search} className="se-location-form">
        <label htmlFor={id}>
          Place or longitude, latitude
          <input
            id={id}
            value={query}
            placeholder="Meerut or 77.7, 28.98"
            maxLength={160}
            required
            onChange={(event) => {
              request.current?.abort();
              setBusy(false);
              setQuery(event.target.value);
              setPlaces([]);
              setError("");
            }}
          />
        </label>
        <button className="se-button" disabled={busy}>
          <Search size={16} /> {busy ? "Finding…" : "Find location"}
        </button>
      </form>
      {places.length > 0 && (
        <ul className="se-location-results" aria-label="Matching places">
          {places.map((place, index) => {
            const name = [
              ...new Set(
                [
                  place.properties.name,
                  place.properties.city,
                  place.properties.state,
                  place.properties.country,
                ].filter(Boolean),
              ),
            ].join(", ");
            return (
              <li key={index}>
                <button
                  className="se-place"
                  onClick={() => {
                    onSelect(place.geometry.coordinates, name);
                    setQuery(name);
                    setPlaces([]);
                  }}
                >
                  <MapPin size={15} /> {name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="se-meta" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function CloudCoverPanel({
  point,
  locationName,
  title = "Cloud analysis report",
  autoRefresh = false,
}: {
  point: Point | null;
  locationName?: string;
  title?: string;
  autoRefresh?: boolean;
}) {
  const [refresh, setRefresh] = useState(0);
  const [refreshEnabled, setRefreshEnabled] = useState(autoRefresh);
  const longitude = point?.[0],
    latitude = point?.[1];
  useEffect(() => {
    if (!refreshEnabled || longitude === undefined || latitude === undefined)
      return;
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === "visible")
          setRefresh((value) => value + 1);
      },
      10 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [refreshEnabled, longitude, latitude]);
  return (
    <section className="se-cloud-check" aria-label={title}>
      <div className="se-panel-heading">
        <h3>
          <Cloud size={19} /> {title}
        </h3>
        {point && (
          <button
            className="se-button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh report
          </button>
        )}
      </div>
      {point ? (
        <>
          <p className="se-cloud-location">
            <MapPin size={14} /> {locationName ? `${locationName} · ` : ""}
            {point[1].toFixed(4)}° latitude, {point[0].toFixed(4)}° longitude
          </p>
          <CloudReading
            key={`${point[0]},${point[1]},${refresh}`}
            point={point}
            locationName={locationName}
          />
          <div className="se-satellite-overlay-controls">
            <label>
              <input
                type="checkbox"
                checked={refreshEnabled}
                onChange={(event) => setRefreshEnabled(event.target.checked)}
              />
              Auto-refresh weather every 10 minutes
            </label>
            {refreshEnabled && (
              <p className="se-meta">
                Weather estimates refresh while this page is visible. The
                recorded imagery does not update with the weather report.
              </p>
            )}
          </div>
        </>
      ) : (
        <p>
          Tap or click a location on the map to generate its cloud analysis
          report. You can also search for a place above.
        </p>
      )}
    </section>
  );
}

function CloudReading({
  point,
  locationName,
}: {
  point: Point;
  locationName?: string;
}) {
  const [reading, setReading] = useState<CloudCoverResult | null>(null);
  const [error, setError] = useState("");
  const [longitude, latitude] = point;
  useEffect(() => {
    const controller = new AbortController();
    // Avoid unnecessary requests while the user is choosing nearby points.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/cloud-cover?lat=${latitude}&lng=${longitude}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const result = (await response.json()) as CloudCoverResult & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            result.error || "Cloud cover is temporarily unavailable.",
          );
        if (!controller.signal.aborted) setReading(result as CloudCoverResult);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Cloud cover is temporarily unavailable.",
          );
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [latitude, longitude]);

  if (error)
    return (
      <div role="alert">
        <p>Cloud cover unavailable</p>
        <p className="se-meta">{error} Use “Refresh report” to try again.</p>
      </div>
    );
  if (!reading)
    return <p role="status">Analyzing cloud cover at the selected location…</p>;
  function download(format: "html" | "json") {
    if (!reading) return;
    const content =
      format === "html"
        ? cloudReportHtml(reading, locationName)
        : JSON.stringify(cloudReport(reading, locationName), null, 2);
    const url = URL.createObjectURL(
      new Blob([content], {
        type:
          format === "html" ? "text/html;charset=utf-8" : "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `cloud-report-${latitude.toFixed(4)}-${longitude.toFixed(4)}-${reading.observedAt.slice(0, 16).replace(/[:T]/g, "-")}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div role="status">
      <div className="se-cloud-reading">
        <strong>
          {reading.cloudCover.toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}
          %
        </strong>
        <span>
          {cloudCondition(reading.cloudCover)}
          <small>Estimated sky covered by clouds</small>
        </span>
      </div>
      <div
        className="se-cloud-meter"
        role="meter"
        aria-label="Estimated cloud cover"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={reading.cloudCover}
      >
        <span style={{ width: `${reading.cloudCover}%` }} />
      </div>
      <p className="se-cloud-summary">
        {reading.cloudCover === 0
          ? "The weather model estimates clear sky near this location."
          : `The weather model estimates clouds over ${reading.cloudCover.toLocaleString(undefined, { maximumFractionDigits: 1 })}% of the sky near this location.`}
      </p>
      <dl className="se-cloud-facts">
        <dt>Sky without cloud</dt>
        <dd>
          {(100 - reading.cloudCover).toLocaleString(undefined, {
            maximumFractionDigits: 1,
          })}
          % estimated
        </dd>
        <dt>Coverage</dt>
        <dd>Nearest forecast grid cell</dd>
        {reading.intervalSeconds && (
          <>
            <dt>Time step</dt>
            <dd>{reading.intervalSeconds / 60} minutes</dd>
          </>
        )}
        {reading.modelLatitude !== undefined &&
          reading.modelLongitude !== undefined && (
            <>
              <dt>Model grid location</dt>
              <dd>
                {reading.modelLatitude.toFixed(4)}°,{" "}
                {reading.modelLongitude.toFixed(4)}°
              </dd>
            </>
          )}
      </dl>
      <p className="se-meta">
        Estimate for{" "}
        <time dateTime={reading.observedAt}>
          {new Date(reading.observedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>{" "}
        · local time
      </p>
      <p className="se-meta">
        Weather-model estimate near the selected point from{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        . Conditions can vary within the forecast grid cell. The basemap itself
        is not a live cloud image.
      </p>
      <div className="se-cloud-downloads">
        <button className="se-button primary" onClick={() => download("html")}>
          <Download size={15} /> Download report
        </button>
        <button className="se-button" onClick={() => download("json")}>
          Download data
        </button>
      </div>
      <p className="se-meta">
        Report: HTML, ready to open or print. Data: JSON.
      </p>
    </div>
  );
}
