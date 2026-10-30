"use client";
import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
export default function Comparison({ id }: { id: string }) {
  const [split, setSplit] = useState(50),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [blink, setBlink] = useState(false),
    [showOriginal, setShowOriginal] = useState(true),
    [error, setError] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  useEffect(() => {
    if (!blink) return;
    const timer = setInterval(() => setShowOriginal((v) => !v), 650);
    return () => clearInterval(timer);
  }, [blink]);
  const transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
  return (
    <section className="se-comparison">
      <div className="se-comparison-bar">
        <span>
          {blink ? (
            "Blink comparison"
          ) : (
            <>Original <b>↔</b> Reconstructed estimate</>
          )}
        </span>
        <div>
          <button
            onClick={() => setZoom((z) => Math.min(6, z + 0.5))}
            aria-label="Zoom in"
          >
            ＋
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Reset view
          </button>
          <button
            aria-pressed={blink}
            onClick={() => {
              setShowOriginal(true);
              setBlink((v) => !v);
            }}
          >
            Blink {blink ? "on" : "off"}
          </button>
        </div>
      </div>
      <div
        className="se-comparison-viewport"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setPan({
              x: drag.current.px + e.clientX - drag.current.x,
              y: drag.current.py + e.clientY - drag.current.y,
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <img
          draggable={false}
          style={{ transform }}
          src={`/api/science/analyses/${id}/preview/reconstruction`}
          alt="Reconstructed false-color estimate"
          aria-hidden={blink ? showOriginal : split === 100}
          onError={() => setError(true)}
        />
        {!blink && split < 100 && (
          <span
            className="se-image-label"
            style={{ top: 16, bottom: "auto", left: "auto", right: 16 }}
          >
            Reconstructed estimate
          </span>
        )}
        <div
          className="se-comparison-overlay"
          style={{
            clipPath: `inset(0 ${blink ? (showOriginal ? 0 : 100) : 100 - split}% 0 0)`,
          }}
        >
          <img
            draggable={false}
            style={{ transform }}
            src={`/api/science/analyses/${id}/preview/original`}
            alt="Original false-color observation"
            aria-hidden={blink ? !showOriginal : split === 0}
            onError={() => setError(true)}
          />
          {!blink && split > 0 && (
            <span
              className="se-image-label"
              style={{ top: 16, bottom: "auto", left: 16 }}
            >
              Original
            </span>
          )}
        </div>
        {!blink && (
          <div className="se-swipe-line" style={{ left: split + "%" }} />
        )}
        <span className="se-image-label">
          {blink
            ? showOriginal
              ? "Original"
              : "Reconstructed estimate"
            : "Shared grid · shared stretch"}
        </span>
        {error && (
          <p className="se-map-error">
            Preview unavailable. Check the service and completed products.
          </p>
        )}
      </div>
      <Slider
        aria-label="Comparison divider"
        min={0}
        max={100}
        step={1}
        value={[split]}
        disabled={blink}
        onValueChange={(v) => setSplit(v[0])}
      />
      <p className="se-meta">
        Drag to pan; controls zoom both previews together. Display previews
        may be downsampled. Export GeoTIFFs for the source pixel grid.
      </p>
    </section>
  );
}
