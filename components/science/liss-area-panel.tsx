"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useResource } from "@/lib/science/client";
import type { Raster } from "@/lib/science/types";
import { compatibleLissReference } from "@/lib/analysis-prefill";
import {
  acquisitionDay,
  lissImagesAt,
  otherDateLissImages,
  type LissCloudObservation,
} from "@/lib/liss-imagery";
import { Failure, Loading } from "./primitives";

type Point = [number, number];
const uploadUrl = "/analysis/new?sensor=LISS-IV";
const dateLabel = (image: Raster) =>
  acquisitionDay(image) || "Date not recorded";
const imageLabel = (image: Raster) => `${dateLabel(image)} · ${image.name}`;

export function LissAreaPanel({
  point,
  locationName,
}: {
  point: Point | null;
  locationName?: string;
}) {
  return (
    <section
      className="se-panel se-cloud-check se-satellite-panel se-liss-panel"
      aria-label="LISS-IV imagery report"
    >
      <p className="se-eyebrow">RESOURCESAT · LISS-IV</p>
      <h2>Clouds, clear views & other dates</h2>
      <p className="se-meta">
        {point
          ? `${locationName || "Selected location"} · ${point[1].toFixed(4)}°, ${point[0].toFixed(4)}°`
          : "Choose a location on the map to find your LISS-IV images covering that area."}
      </p>
      {point ? (
        <LissLocation key={point.join(",")} point={point} />
      ) : (
        <p className="se-meta">
          Upload georeferenced LISS-IV scenes with their acquisition dates to
          view clouds and compare observations.
        </p>
      )}
    </section>
  );
}

function LissLocation({ point }: { point: Point }) {
  const images = useResource<Raster[]>("/images");
  const [selectedId, setSelectedId] = useState("");
  const matches = lissImagesAt(images.data || [], point);
  const source = matches.find((item) => item.id === selectedId) || matches[0];

  if (images.loading) return <Loading />;
  if (images.error)
    return <Failure message={images.error} retry={images.refresh} />;
  if (!source)
    return (
      <div className="se-liss-empty">
        <h3>No uploaded LISS-IV scene covers this location</h3>
        <p>
          The image and cloud percentage appear after you upload a LISS-IV
          GeoTIFF covering this point. Add a second date to see an actual
          observation of the same area on another day.
        </p>
        <div className="se-liss-actions">
          <Link className="se-button primary" href={uploadUrl}>
            Upload LISS-IV imagery
          </Link>
          <button className="se-button" onClick={images.refresh}>
            Refresh images
          </button>
        </div>
        <p className="se-meta">
          Obtain scenes through{" "}
          <a
            href="https://bhoonidhi.nrsc.gov.in/bhoonidhi/index.html"
            target="_blank"
            rel="noreferrer"
          >
            NRSC Bhoonidhi
          </a>
          . This view uses your uploaded observations.
        </p>
      </div>
    );
  return (
    <>
      <div className="se-satellite-controls">
        <label>
          Observation date
          <select
            value={source.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {matches.map((item) => (
              <option key={item.id} value={item.id}>
                {imageLabel(item)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <LissComparison
        key={source.id}
        source={source}
        images={images.data || []}
        point={point}
      />
    </>
  );
}

function LissComparison({
  source,
  images,
  point,
}: {
  source: Raster;
  images: Raster[];
  point: Point;
}) {
  const alternatives = otherDateLissImages(images, source, point);
  const [otherId, setOtherId] = useState("");
  const other = alternatives.find((item) => item.id === otherId);
  const sourceQuery = new URLSearchParams({
    sensor: "LISS-IV",
    image: source.id,
  });
  const removeUrl = `/analysis/new?${sourceQuery}&model=spatial-baseline`;
  const temporalUrl =
    other && compatibleLissReference(source, other)
      ? `/analysis/new?${sourceQuery}&temporal=${encodeURIComponent(other.id)}&model=temporal-baseline`
      : null;

  return (
    <>
      <p className="se-meta">
        Report area: the full uploaded scene containing your point. Cloud cover
        is measured across its valid pixels, not a small circle around the map
        pin.
      </p>
      <LissObservation
        key={source.id}
        image={source}
        title="Selected observation"
      />
      <div className="se-liss-actions">
        <Link className="se-button primary" href={removeUrl}>
          Remove clouds…
        </Link>
        <a className="se-button" href="#liss-other-date">
          View another date
        </a>
      </div>
      <p className="se-meta">
        Cloud removal creates a reconstructed estimate. Review the settings,
        then run the analysis to see the original and reconstructed images.
      </p>

      <div id="liss-other-date" className="se-liss-other-date">
        <h3>Actual image from another date</h3>
        <p className="se-meta">
          Compare a separate satellite observation of this location. Ground
          conditions and scene extents can differ between dates.
        </p>
        {alternatives.length > 0 ? (
          <>
            <label className="se-satellite-capture">
              Comparison date
              <select
                value={other?.id || ""}
                onChange={(event) => setOtherId(event.target.value)}
              >
                <option value="">Choose another observation</option>
                {alternatives.map((item) => (
                  <option key={item.id} value={item.id}>
                    {imageLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            {other && (
              <LissObservation
                key={other.id}
                image={other}
                title="Other-date observation"
              />
            )}
            {temporalUrl && (
              <>
                <Link className="se-button primary" href={temporalUrl}>
                  Remove clouds using this date…
                </Link>
                <p className="se-meta">
                  Review this image for clear coverage first. Reconstruction
                  uses valid pixels from this other date to fill masked areas.
                  Clouds in the reference image are not screened out or removed.
                  The result is an estimate for the selected date.
                </p>
              </>
            )}
            {other && !temporalUrl && (
              <p className="se-satellite-notice">
                You can view this observation, but reconstruction requires the
                same sensor label and matching band calibration as the selected
                scene. Upload a compatible acquisition to use this method.
              </p>
            )}
          </>
        ) : (
          <p className="se-satellite-notice">
            {acquisitionDay(source)
              ? "No other dated LISS-IV upload covers this point yet. Upload another acquisition to compare it."
              : "This scene has no acquisition date. Upload it with its date to enable comparison with other days."}
          </p>
        )}
        <Link
          className="se-button"
          href={`${uploadUrl}&image=${encodeURIComponent(source.id)}&role=temporal`}
        >
          Upload another date
        </Link>
      </div>
    </>
  );
}

function LissObservation({ image, title }: { image: Raster; title: string }) {
  const [result, setResult] = useState<LissCloudObservation | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [photoState, setPhotoState] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [photoRetry, setPhotoRetry] = useState(0);
  const [highlight, setHighlight] = useState(true);
  const preview = `/api/science/images/${encodeURIComponent(image.id)}/preview`;

  useEffect(() => {
    const controller = new AbortController();
    api<LissCloudObservation>(
      `/images/${encodeURIComponent(image.id)}/clouds`,
      { signal: controller.signal },
    )
      .then((observation) => {
        if (!controller.signal.aborted && observation.image_id === image.id)
          setResult(observation);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Cloud analysis unavailable",
          );
      });
    return () => controller.abort();
  }, [image.id, retry]);

  const percent = result
    ? result.cloud_pixels > 0 && result.cloud_percent < 0.1
      ? "<0.1"
      : result.cloud_percent.toFixed(1)
    : null;
  return (
    <article
      className="se-liss-observation"
      aria-label={`${title} ${dateLabel(image)}`}
    >
      <h3>
        {title} · {dateLabel(image)}
      </h3>
      {result ? (
        <div className="se-satellite-cloud-summary" aria-live="polite">
          <div className="se-cloud-reading">
            <strong>{percent}%</strong>
            <span>estimated cloud cover</span>
          </div>
          <div
            className="se-cloud-meter"
            role="meter"
            aria-label={`${title} cloud cover`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={result.cloud_percent}
          >
            <span style={{ width: `${result.cloud_percent}%` }} />
          </div>
          <p>
            {result.cloud_pixels === 0
              ? "No clouds detected by this brightness-based estimate."
              : "Suspected clouds are highlighted in white on the image."}{" "}
            {result.valid_percent.toFixed(1)}% of the scene has valid image
            data.
          </p>
        </div>
      ) : error ? (
        <Failure
          message={error}
          retry={() => {
            setError("");
            setRetry((value) => value + 1);
          }}
        />
      ) : (
        <p role="status" className="se-meta">
          Estimating clouds in this observation…
        </p>
      )}

      <figure className="se-satellite-figure">
        <div
          className="se-satellite-photo se-liss-photo"
          style={{
            aspectRatio: `${image.metadata.width} / ${image.metadata.height}`,
          }}
        >
          {photoState !== "error" && (
            <img
              src={`${preview}?retry=${photoRetry}`}
              alt={`LISS-IV false-colour image, ${image.name}, ${dateLabel(image)}`}
              onLoad={() => setPhotoState("loaded")}
              onError={() => setPhotoState("error")}
            />
          )}
          {photoState === "loaded" && highlight && result?.overlay_data_url && (
            <img
              className="se-satellite-cloud-overlay"
              src={result.overlay_data_url}
              alt=""
              aria-hidden="true"
            />
          )}
          {photoState !== "loaded" && (
            <div className="se-satellite-photo-status" role="status">
              {photoState === "loading" ? (
                "Loading the actual observation…"
              ) : (
                <>
                  <p>Image preview unavailable.</p>
                  <button
                    className="se-button"
                    onClick={() => {
                      setPhotoState("loading");
                      setPhotoRetry((value) => value + 1);
                    }}
                  >
                    Retry image
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <figcaption>
          {image.name} · LISS-IV · NIR / red / green false colour. This is a
          preview of the uploaded observation; LISS-IV does not provide a blue
          band for natural-colour imagery.
        </figcaption>
      </figure>
      {photoState === "loaded" && (
        <div className="se-satellite-overlay-controls">
          {result && (
            <label>
              <input
                type="checkbox"
                checked={highlight}
                onChange={(event) => setHighlight(event.target.checked)}
              />
              Highlight suspected clouds in white
            </label>
          )}
          <a href={preview} target="_blank" rel="noreferrer">
            Open original image
          </a>
        </div>
      )}
      {result && (
        <details className="se-satellite-method">
          <summary>How this estimate is calculated</summary>
          <p className="se-meta">
            {result.method} Brightness threshold: {result.brightness_threshold}.{" "}
            {result.scope}
          </p>
          <p className="se-meta">{result.limitations.join(" ")}</p>
        </details>
      )}
    </article>
  );
}
