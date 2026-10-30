"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Scene } from "@/lib/satellite";
import type { Analysis } from "@/lib/science/types";
import { startAnalysis } from "@/lib/personal/runner";

type Point = [number, number];
type Method = "spatial-baseline" | "temporal-baseline";
const captureDate = (scene: Scene) => scene.capturedAt.slice(0, 10);

export function SatelliteReconstructionControls({
  point,
  size,
  scene,
  scenes,
  locationName,
  ready,
  cloudPercent,
}: {
  point: Point;
  size: number;
  scene: Scene;
  scenes: Scene[];
  locationName?: string;
  ready: boolean;
  cloudPercent: number | null;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("spatial-baseline");
  const [referenceId, setReferenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  const request = useRef<AbortController | null>(null);
  const references = scenes.filter(
    (candidate) =>
      candidate.id !== scene.id &&
      captureDate(candidate) !== captureDate(scene),
  );
  const reference = references.find(
    (candidate) => candidate.id === referenceId,
  );

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current?.abort();
    };
  }, []);

  async function reconstruct() {
    if (
      !ready ||
      request.current ||
      (method === "temporal-baseline" && !reference)
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/satellite/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Space-Eye": "1" },
        signal: controller.signal,
        body: JSON.stringify({
          lat: point[1],
          lng: point[0],
          size,
          scene: scene.id,
          method,
          ...(method === "temporal-baseline" && reference
            ? { referenceScene: reference.id }
            : {}),
          ...(locationName ? { location: locationName } : {}),
        }),
      });
      const data = (await response.json()) as Analysis & { error?: string };
      if (!response.ok)
        throw new Error(
          data.error ||
            "Unable to prepare this reconstruction. Try another date.",
        );
      if (!data.id || data.engine !== "browser")
        throw new Error(
          "The reconstruction service returned an unreadable job. Check analysis history before trying again.",
        );
      if (!active.current || controller.signal.aborted) return;
      void startAnalysis(data);
      router.push(`/analysis/${encodeURIComponent(data.id)}`);
    } catch (cause) {
      if (active.current && !controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Reconstruction is unavailable. Please retry.",
        );
    } finally {
      if (request.current === controller) request.current = null;
      if (active.current) setBusy(false);
    }
  }

  return (
    <section
      className="se-reconstruction-controls"
      aria-label="Reconstruct selected satellite area"
    >
      <h3>Remove clouds &amp; reconstruct</h3>
      <p className="se-meta">
        Replace the detected cloud and shadow pixels, preserve clear pixels,
        then compare the original and reconstruction. The saved result includes
        the cloud mask and NDVI area analysis.
      </p>
      <div className="se-satellite-controls">
        <label>
          Reconstruction method
          <select
            value={method}
            disabled={busy}
            onChange={(event) => {
              setMethod(event.target.value as Method);
              setError("");
            }}
          >
            <option value="spatial-baseline">
              Spatial reconstruction · nearby clear pixels
            </option>
            <option value="temporal-baseline">
              Temporal reconstruction · another date
            </option>
          </select>
        </label>
        {method === "temporal-baseline" && (
          <label>
            Clearer reference date
            <select
              value={reference?.id || ""}
              disabled={busy}
              onChange={(event) => {
                setReferenceId(event.target.value);
                setError("");
              }}
            >
              <option value="">Choose another capture</option>
              {references.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {captureDate(candidate)} · {candidate.cloudCover.toFixed(1)}%
                  whole-scene cloud
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {method === "temporal-baseline" ? (
        <>
          {reference && (
            <ReferencePreview
              key={reference.id}
              point={point}
              size={size}
              scene={reference}
            />
          )}
          <p className="se-meta">
            Choose a date with clear pixels over the masked area. Reference
            clouds and shadows are excluded; processing stops if clear reference
            coverage is insufficient. Whole-scene cloud percentage may differ
            from this selected crop.
          </p>
          {!references.length && (
            <p className="se-satellite-notice">
              No other capture dates are available for this area. Try a
              different location or use an uploaded temporal reference.
            </p>
          )}
        </>
      ) : (
        <p className="se-meta">
          Spatial interpolation estimates masked pixels from nearby clear
          values. Large cloudy regions can look smooth; this method cannot
          reveal the actual hidden buildings or trees.
        </p>
      )}
      {method === "spatial-baseline" &&
        cloudPercent !== null &&
        cloudPercent >= 99.9 && (
          <p className="se-satellite-notice">
            This crop is almost fully cloudy. Use another date if there are no
            clear pixels available for spatial reconstruction.
          </p>
        )}
      {!ready && (
        <p className="se-meta">
          Wait for this capture’s image and cloud report before starting.
        </p>
      )}
      {error && (
        <p className="se-satellite-notice" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="se-meta" role="status">
          Preparing the selected bands and cloud mask… Keep this page open.
        </p>
      )}
      <button
        className="se-button primary"
        disabled={
          !ready || busy || (method === "temporal-baseline" && !reference)
        }
        onClick={() => void reconstruct()}
      >
        {busy
          ? "Preparing reconstruction…"
          : "Remove clouds & reconstruct area"}
      </button>
      <p className="se-meta">
        Uses a 384 × 384 resampled satellite crop. Saved comparisons use NIR /
        red / green false colour. Reconstructed pixels are estimates, not a
        newly observed image.
      </p>
      <p className="se-meta">
        These available methods are non-trained baselines.{" "}
        <Link href="/models">
          Trained AI models require model weights and an inference service
        </Link>
        .
      </p>
    </section>
  );
}

function ReferencePreview({
  point,
  size,
  scene,
}: {
  point: Point;
  size: number;
  scene: Scene;
}) {
  const [failed, setFailed] = useState(false);
  const query = new URLSearchParams({
    lat: String(point[1]),
    lng: String(point[0]),
    size: String(size),
    scene: scene.id,
  });
  return (
    <figure className="se-satellite-figure">
      {failed ? (
        <p className="se-satellite-notice" role="alert">
          This reference preview could not load. Select another date or retry
          the imagery search.
        </p>
      ) : (
        <div className="se-satellite-photo">
          {/* The service supplies the actual selected-date crop. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/satellite/image?${query}`}
            width={384}
            height={384}
            alt={`Reference Sentinel-2 observation captured ${captureDate(scene)}`}
            onError={() => setFailed(true)}
          />
        </div>
      )}
      <figcaption>
        Actual reference observation · {captureDate(scene)} · {size} × {size}{" "}
        km. Land conditions may have changed between acquisitions.
      </figcaption>
    </figure>
  );
}
