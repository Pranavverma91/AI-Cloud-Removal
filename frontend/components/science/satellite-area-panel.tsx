"use client";

import { useEffect, useId, useState } from "react";
import { Satellite } from "lucide-react";
import type { Scene } from "@/lib/satellite";
import type { SatelliteCloudResult } from "@/lib/satellite-cloud";
import { SatelliteReconstructionControls } from "./satellite-reconstruction-controls";

type Point = [number, number];
const captureTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
const queryFor = (point: Point, size: number) =>
  new URLSearchParams({
    lat: String(point[1]),
    lng: String(point[0]),
    size: String(size),
  });

export function SatelliteAreaPanel({
  point,
  locationName,
}: {
  point: Point | null;
  locationName?: string;
}) {
  const [size, setSize] = useState(5);
  const [attempt, setAttempt] = useState(0);
  const id = useId();
  return (
    <section
      className="se-cloud-check se-satellite-panel"
      aria-label="Satellite image of selected area"
    >
      <div className="se-panel-heading">
        <h3>
          <Satellite size={19} /> Satellite image &amp; clouds
        </h3>
      </div>
      <p className="se-meta">
        Real Sentinel-2 imagery, with clouds kept visible.
      </p>
      {point ? (
        <>
          <p className="se-cloud-location">
            {locationName ? `${locationName} · ` : ""}
            {point[1].toFixed(4)}° latitude, {point[0].toFixed(4)}° longitude
          </p>
          <div className="se-satellite-controls">
            <label htmlFor={id}>
              Area around the selected point
              <select
                id={id}
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
              >
                {[1, 2, 5, 10].map((value) => (
                  <option key={value} value={value}>
                    {value} × {value} km
                  </option>
                ))}
              </select>
            </label>
            <button
              className="se-button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Refresh imagery
            </button>
          </div>
          <AreaCaptures
            key={`${point.join(",")}:${size}:${attempt}`}
            point={point}
            size={size}
            locationName={locationName}
          />
        </>
      ) : (
        <p>
          Choose a location on the map to see a satellite photograph and the
          cloud percentage in that image.
        </p>
      )}
    </section>
  );
}

function AreaCaptures({
  point,
  size,
  locationName,
}: {
  point: Point;
  size: number;
  locationName?: string;
}) {
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const query = queryFor(point, size);
        // Keep cloudy captures: this view is for inspecting clouds, not hiding them.
        query.set("cloud", "100");
        const response = await fetch(`/api/satellite/scenes?${query}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await response.json()) as {
          scenes: Scene[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            data.error || "Satellite imagery is temporarily unavailable.",
          );
        if (!Array.isArray(data.scenes))
          throw new Error(
            "The satellite catalogue returned an unreadable result.",
          );
        if (controller.signal.aborted) return;
        setScenes(data.scenes);
        setSelected(data.scenes[0]?.id || "");
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Satellite imagery is temporarily unavailable.",
          );
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [point, size]);
  if (error)
    return (
      <p className="se-satellite-notice" role="alert">
        {error} Use “Refresh imagery” to try again.
      </p>
    );
  if (!scenes)
    return (
      <div className="se-satellite-placeholder" role="status">
        Finding recent satellite captures…
      </div>
    );
  if (!scenes.length)
    return (
      <p className="se-satellite-notice" role="status">
        No Sentinel-2 captures cover this area in the past year. Try a nearby
        land location.
      </p>
    );
  const scene = scenes.find((candidate) => candidate.id === selected)!;
  return (
    <>
      <label className="se-satellite-capture" htmlFor={id}>
        Capture date
        <select
          id={id}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {scenes.map((capture, index) => (
            <option key={capture.id} value={capture.id}>
              {captureTime(capture.capturedAt)}
              {index === 0 ? " · latest available" : ""}
            </option>
          ))}
        </select>
      </label>
      <Capture
        key={scene.id}
        point={point}
        size={size}
        scene={scene}
        scenes={scenes}
        locationName={locationName}
      />
    </>
  );
}

function Capture({
  point,
  size,
  scene,
  scenes,
  locationName,
}: {
  point: Point;
  size: number;
  scene: Scene;
  scenes: Scene[];
  locationName?: string;
}) {
  const [imageState, setImageState] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [highlightClouds, setHighlightClouds] = useState(true);
  const [overlayFailed, setOverlayFailed] = useState(false);
  const { result, error } = useImageClouds(point, size, scene);
  const params = queryFor(point, size);
  params.set("scene", scene.id);
  if (attempt) params.set("retry", String(attempt));
  const imageUrl = `/api/satellite/image?${params}`;
  const canHighlight =
    imageState === "loaded" &&
    result?.cloudPercent !== null &&
    !!result?.cloudMaskDataUrl &&
    !overlayFailed;
  return (
    <>
      <CloudSummary result={result} error={error} size={size} />
      <div className="se-satellite-overlay-controls">
        <label>
          <input
            type="checkbox"
            checked={highlightClouds}
            disabled={!canHighlight}
            onChange={(event) => setHighlightClouds(event.target.checked)}
          />
          Highlight detected clouds
        </label>
        <span className="se-satellite-overlay-legend">
          {highlightClouds ? (
            <>
              <i aria-hidden="true" /> White = detected clouds, including cirrus
            </>
          ) : (
            "Original satellite image"
          )}
        </span>
      </div>
      <figure className="se-satellite-figure">
        <div className="se-satellite-photo">
          {imageState !== "error" && (
            <>
              {/* The same-origin endpoint supplies a dated satellite crop, not an optimized static asset. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={imageUrl}
                src={imageUrl}
                width={384}
                height={384}
                alt={`Sentinel-2 true-colour satellite image of the ${size} km area centred at ${point[1].toFixed(4)}°, ${point[0].toFixed(4)}°, captured ${captureTime(scene.capturedAt)}`}
                onLoad={() => setImageState("loaded")}
                onError={() => setImageState("error")}
              />
              {imageState === "loaded" && (
                <>
                  {canHighlight && highlightClouds && (
                    // This transparent layer comes from the same capture and crop as the photograph.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="se-satellite-cloud-overlay"
                      src={result!.cloudMaskDataUrl}
                      alt=""
                      aria-hidden="true"
                      width={result!.width}
                      height={result!.height}
                      onError={() => setOverlayFailed(true)}
                    />
                  )}
                  <span className="se-satellite-north" aria-hidden="true">
                    ↑ N
                  </span>
                  <span className="se-satellite-point" aria-hidden="true" />
                  {result?.cloudPercent !== null && result && (
                    <span
                      className="se-satellite-cloud-badge"
                      aria-hidden="true"
                    >
                      {cloudPercentLabel(result)} cloud{" "}
                      <small>at capture time</small>
                    </span>
                  )}
                </>
              )}
            </>
          )}
          {imageState === "loading" && (
            <p className="se-satellite-photo-status" role="status">
              Loading the satellite photograph…
            </p>
          )}
          {imageState === "error" && (
            <div className="se-satellite-photo-status" role="alert">
              <p>This capture’s image could not load.</p>
              <button
                className="se-button"
                onClick={() => {
                  setImageState("loading");
                  setAttempt((value) => value + 1);
                }}
              >
                Retry image
              </button>
              <p>Or choose another capture date.</p>
            </div>
          )}
        </div>
        <figcaption>
          Captured{" "}
          <time dateTime={scene.capturedAt}>
            {captureTime(scene.capturedAt)}
          </time>
          <br />
          {size} × {size} km · selected point at centre
        </figcaption>
      </figure>
      {overlayFailed && (
        <p className="se-satellite-notice" role="alert">
          Cloud highlighting could not load. The percentage and original
          photograph are still available.
        </p>
      )}
      {imageState === "loaded" && (
        <a
          className="se-button"
          href={imageUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open full image
        </a>
      )}
      <SatelliteReconstructionControls
        point={point}
        size={size}
        scene={scene}
        scenes={scenes}
        locationName={locationName}
        ready={
          imageState === "loaded" && !!result && result.cloudPercent !== null
        }
        cloudPercent={result?.cloudPercent ?? null}
      />
      {result && <ImageCloudDetails result={result} />}
      <p className="se-meta">
        Satellite captures are not live. Compare the capture date with the
        current weather estimate below.
      </p>
      <p className="se-meta">
        Imagery:{" "}
        <a
          href="https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a"
          target="_blank"
          rel="noreferrer"
        >
          Copernicus Sentinel-2 L2A / Microsoft Planetary Computer
        </a>
        . True colour; no cloud removal applied.
      </p>
    </>
  );
}

function useImageClouds(point: Point, size: number, scene: Scene) {
  const [result, setResult] = useState<SatelliteCloudResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = queryFor(point, size);
    params.set("scene", scene.id);
    (async () => {
      try {
        const response = await fetch(`/api/satellite/clouds?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await response.json()) as SatelliteCloudResult & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            data.error || "Cloud classification is temporarily unavailable.",
          );
        if (!controller.signal.aborted) setResult(data);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Cloud classification is temporarily unavailable.",
          );
      }
    })();
    return () => controller.abort();
  }, [point, size, scene]);
  return { result, error };
}

function cloudPercentLabel(result: SatelliteCloudResult) {
  return result.cloudPercent === 0 && result.cloudPixelCount > 0
    ? "<0.1%"
    : `${result.cloudPercent}%`;
}

function CloudSummary({
  result,
  error,
  size,
}: {
  result: SatelliteCloudResult | null;
  error: string;
  size: number;
}) {
  if (error)
    return (
      <p className="se-satellite-notice" role="alert">
        Image cloud percentage unavailable. {error} You can still inspect the
        photograph or choose another date.
      </p>
    );
  if (!result)
    return (
      <p role="status" className="se-meta">
        Measuring cloud cover in this image…
      </p>
    );
  return (
    <section
      className="se-satellite-cloud-summary"
      aria-label="Cloud coverage in selected area"
      aria-live="polite"
    >
      {result.cloudPercent === null ? (
        <p className="se-satellite-notice">
          Cloud percentage unavailable: this crop has no classified pixels.
        </p>
      ) : (
        <>
          <div className="se-cloud-reading">
            <strong>{cloudPercentLabel(result)}</strong>
            <span>
              Cloud cover in this area
              <small>
                From this satellite capture · {size} × {size} km
              </small>
            </span>
          </div>
          <div
            className="se-cloud-meter"
            role="meter"
            aria-label="Satellite image cloud cover"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={result.cloudPercent}
            aria-valuetext={cloudPercentLabel(result)}
          >
            <span style={{ width: `${result.cloudPercent}%` }} />
          </div>
          {result.cloudPixelCount === 0 ? (
            <p>No clouds detected in the classified part of this area.</p>
          ) : (
            <p>
              {cloudPercentLabel(result)} of classified pixels are cloud or
              cirrus. White highlighting shows where they are.
            </p>
          )}
        </>
      )}
      <p className="se-meta">
        {result.coveragePercent}% of the selected area is classified.
        {result.coveragePercent < 100
          ? " Missing, defective and unclassified pixels are excluded from the cloud percentage."
          : ""}
      </p>
    </section>
  );
}

function ImageCloudDetails({ result }: { result: SatelliteCloudResult }) {
  return (
    <div
      className="se-satellite-analysis"
      aria-label="Satellite classification details"
    >
      <dl className="se-cloud-facts">
        <dt>Area classified</dt>
        <dd>{result.coveragePercent}% of this crop</dd>
        <dt>Cloud shadow</dt>
        <dd>
          {result.cloudShadowPercent === null
            ? "Unavailable"
            : `${result.cloudShadowPercent}% of classified pixels`}
        </dd>
        <dt>Snow / ice</dt>
        <dd>
          {result.snowIcePercent === null
            ? "Unavailable"
            : `${result.snowIcePercent}% of classified pixels`}
        </dd>
      </dl>
      {result.coveragePercent < 95 && (
        <p className="se-satellite-notice">
          Partial coverage: missing or unclassified pixels are excluded. The
          cloud percentage does not describe the whole crop.
        </p>
      )}
      <details className="se-satellite-method">
        <summary>How this percentage is measured</summary>
        <p className="se-meta">{result.method}</p>
        <p className="se-meta">
          Automated classification can confuse bright surfaces, snow, haze or
          cloud edges. Unclassified pixels: {result.unclassifiedPercent}% of the
          crop.
        </p>
      </details>
    </div>
  );
}
