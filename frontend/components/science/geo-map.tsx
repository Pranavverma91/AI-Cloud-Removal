"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibre from "maplibre-gl";
import type * as GeoJSON from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import { SelectBox } from "./primitives";
type View = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};
type Props = {
  center?: [number, number];
  initialBasemap?: "street" | "satellite";
  focusZoom?: number;
  selectedPoint?: [number, number];
  bounds?: [number, number, number, number];
  analysisId?: string;
  personal?: boolean;
  product?: string;
  aoi?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
  onAOI?: (value: GeoJSON.Polygon) => void;
  onPoint?: (point: [number, number]) => void;
  view?: View;
  onView?: (value: View) => void;
  height?: number;
};
function normalizePoint(point: [number, number]): [number, number] {
  return [
    ((((point[0] + 180) % 360) + 360) % 360) - 180,
    Math.max(-90, Math.min(90, point[1])),
  ];
}
export default function GeoMap(props: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<maplibre.Map | null>(null),
    marker = useRef<maplibre.Marker | null>(null),
    latest = useRef(props),
    vertices = useRef<[number, number][]>([]);
  const [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [revision, setRevision] = useState(0),
    [clickedPoint, setClickedPoint] = useState<[number, number]>(),
    [mode, setMode] = useState("inspect"),
    [count, setCount] = useState(0),
    [satellite, setSatellite] = useState(props.initialBasemap === "satellite"),
    [globe, setGlobe] = useState(false),
    [terrain, setTerrain] = useState(false);
  const drawMode = useRef(mode);
  const satelliteEnabled = useRef(satellite);
  const focusZoom = Number.isFinite(props.focusZoom)
    ? Math.min(20, Math.max(0, props.focusZoom!))
    : undefined;
  const selected =
    "selectedPoint" in props ? props.selectedPoint : clickedPoint;
  useEffect(() => {
    latest.current = props;
    drawMode.current = mode;
    satelliteEnabled.current = satellite;
  }, [props, mode, satellite]);
  useEffect(() => {
    let active = true;
    let resize: ResizeObserver | undefined;
    const frame = requestAnimationFrame(() => {
      if (!container.current) return;
      try {
        const m = new maplibre.Map({
          container: container.current,
          center: latest.current.center || [78, 22],
          zoom:
            latest.current.center && Number.isFinite(latest.current.focusZoom)
              ? Math.min(20, Math.max(0, latest.current.focusZoom!))
              : latest.current.bounds
                ? 7
                : 3.6,
          maxZoom: 20,
          attributionControl: { compact: false },
          style: {
            version: 8,
            sources: {
              base: {
                type: "raster",
                // Direct browser requests preserve normal caching and Referer.
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                maxzoom: 19,
                attribution:
                  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
              },
              satellite: {
                type: "raster",
                tiles: [
                  // Same-origin requests preserve missing-tile 404s; Esri's 404
                  // omits CORS headers. MapLibre can then load the real parent.
                  `${location.origin}/api/map-imagery/{z}/{x}/{y}`,
                ],
                tileSize: 256,
                attribution:
                  'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a>, Maxar, Earthstar Geographics',
              },
              aoi: {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
              },
            },
            layers: [
              {
                id: "base",
                source: "base",
                type: "raster",
                layout: {
                  visibility: satelliteEnabled.current ? "none" : "visible",
                },
              },
              {
                id: "satellite",
                source: "satellite",
                type: "raster",
                layout: {
                  visibility: satelliteEnabled.current ? "visible" : "none",
                },
              },
              {
                id: "aoi-fill",
                type: "fill",
                source: "aoi",
                paint: { "fill-color": "#24d8e9", "fill-opacity": 0.12 },
              },
              {
                id: "aoi-outline",
                type: "line",
                source: "aoi",
                paint: { "line-color": "#24d8e9", "line-width": 2 },
              },
            ],
          },
        });
        map.current = m;
        m.addControl(new maplibre.NavigationControl(), "top-right");
        m.addControl(new maplibre.ScaleControl(), "bottom-left");
        // Controls and selection need the style, not successful remote tiles.
        m.on("style.load", () => {
          if (active) setReady(true);
        });
        m.on("error", (event) => {
          if (!active) return;
          const sourceId = (
            event as maplibre.ErrorEvent & { sourceId?: string }
          ).sourceId;
          const layer =
            sourceId === "base"
              ? "The street map"
              : sourceId === "satellite"
                ? "Satellite imagery"
                : sourceId === "terrain"
                  ? "Terrain"
                  : sourceId === "result"
                    ? "The analysis layer"
                    : "A map layer";
          setError(
            `${layer} could not load. Check your connection and retry the map.`,
          );
        });
        m.on("click", (e) => {
          if (!active) return;
          const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          if (drawMode.current === "inspect") {
            if (latest.current.onPoint) {
              const selectedPoint = normalizePoint(point);
              setClickedPoint(selectedPoint);
              latest.current.onPoint(selectedPoint);
            }
            return;
          }
          if (!m.getSource("aoi")) return;
          vertices.current.push(point);
          setCount(vertices.current.length);
          let polygon: GeoJSON.Polygon | undefined;
          if (
            drawMode.current === "rectangle" &&
            vertices.current.length >= 2
          ) {
            const [a, b] = vertices.current;
            polygon = {
              type: "Polygon",
              coordinates: [
                [
                  [a[0], a[1]],
                  [b[0], a[1]],
                  [b[0], b[1]],
                  [a[0], b[1]],
                  [a[0], a[1]],
                ],
              ],
            };
            vertices.current = [];
            setCount(0);
            latest.current.onAOI?.(polygon);
          } else if (vertices.current.length >= 3) {
            polygon = {
              type: "Polygon",
              coordinates: [[...vertices.current, vertices.current[0]]],
            };
          }
          if (polygon)
            (m.getSource("aoi") as maplibre.GeoJSONSource).setData({
              type: "Feature",
              geometry: polygon,
              properties: {},
            });
        });
        m.on("moveend", () => {
          if (!active) return;
          const c = m.getCenter();
          latest.current.onView?.({
            center: [c.lng, c.lat],
            zoom: m.getZoom(),
            bearing: m.getBearing(),
            pitch: m.getPitch(),
          });
        });
        if (typeof ResizeObserver !== "undefined") {
          resize = new ResizeObserver(() => m.resize());
          resize.observe(container.current);
        }
      } catch {
        if (active)
          setError(
            "This browser cannot initialize the geographic map. WebGL is required.",
          );
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      marker.current?.remove();
      marker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, [revision]);
  const longitude = props.center?.[0],
    latitude = props.center?.[1];
  useEffect(() => {
    if (
      ready &&
      longitude !== undefined &&
      latitude !== undefined &&
      map.current
    )
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: focusZoom ?? Math.max(10, map.current.getZoom()),
      });
  }, [longitude, latitude, focusZoom, ready]);
  const west = props.bounds?.[0],
    south = props.bounds?.[1],
    east = props.bounds?.[2],
    north = props.bounds?.[3];
  useEffect(() => {
    if (
      ready &&
      west !== undefined &&
      south !== undefined &&
      east !== undefined &&
      north !== undefined
    )
      map.current?.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 30, maxZoom: 16 },
      );
  }, [west, south, east, north, ready]);
  const selectedLongitude = selected?.[0],
    selectedLatitude = selected?.[1];
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (selectedLongitude === undefined || selectedLatitude === undefined) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const point = normalizePoint([selectedLongitude, selectedLatitude]);
    if (!marker.current)
      marker.current = new maplibre.Marker({ color: "#0891b2" })
        .setLngLat(point)
        .addTo(m);
    else marker.current.setLngLat(point);
    marker.current.getElement().setAttribute("aria-label", "Selected location");
  }, [selectedLongitude, selectedLatitude, ready]);
  useEffect(() => {
    const m = map.current;
    if (ready && m?.getSource("aoi"))
      (m.getSource("aoi") as maplibre.GeoJSONSource).setData(
        props.aoi
          ? { type: "Feature", geometry: props.aoi, properties: {} }
          : { type: "FeatureCollection", features: [] },
      );
  }, [props.aoi, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (m.getLayer("result")) m.removeLayer("result");
    if (m.getSource("result")) m.removeSource("result");
    if (!props.analysisId) return;
    const hasBounds =
      west !== undefined &&
      south !== undefined &&
      east !== undefined &&
      north !== undefined;
    m.addSource(
      "result",
      props.personal && hasBounds
        ? {
            type: "image",
            url: `/api/science/analyses/${props.analysisId}/preview/${props.product || "reconstruction"}?map=1`,
            coordinates: [
              [west, north],
              [east, north],
              [east, south],
              [west, south],
            ],
          }
        : {
            type: "raster",
            tiles: [
              `${location.origin}/api/science/analyses/${props.analysisId}/tiles/${props.product || "reconstruction"}/{z}/{x}/{y}.png`,
            ],
            tileSize: 256,
          },
    );
    m.addLayer(
      {
        id: "result",
        type: "raster",
        source: "result",
        paint: { "raster-opacity": 0.92 },
      },
      "aoi-fill",
    );
  }, [
    props.product,
    props.analysisId,
    props.personal,
    west,
    south,
    east,
    north,
    ready,
  ]);
  useEffect(() => {
    const m = map.current,
      v = props.view;
    if (!ready || !m || !v) return;
    const c = m.getCenter();
    if (
      Math.abs(c.lng - v.center[0]) +
        Math.abs(c.lat - v.center[1]) +
        Math.abs(m.getZoom() - v.zoom) +
        Math.abs(m.getBearing() - v.bearing) +
        Math.abs(m.getPitch() - v.pitch) >
      0.0001
    )
      m.jumpTo(v);
  }, [props.view, ready]);
  useEffect(() => {
    if (!ready) return;
    map.current?.setLayoutProperty(
      "base",
      "visibility",
      satellite ? "none" : "visible",
    );
    map.current?.setLayoutProperty(
      "satellite",
      "visibility",
      satellite ? "visible" : "none",
    );
  }, [satellite, ready]);
  useEffect(() => {
    if (ready)
      map.current?.setProjection({ type: globe ? "globe" : "mercator" });
  }, [globe, ready]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (terrain && !m.getSource("terrain"))
      m.addSource("terrain", {
        type: "raster-dem",
        url: "https://demotiles.maplibre.org/terrain-tiles/tiles.json",
        tileSize: 256,
      });
    m.setTerrain(terrain ? { source: "terrain", exaggeration: 1 } : null);
    if (terrain) m.easeTo({ pitch: 55 });
  }, [terrain, ready]);
  useEffect(() => {
    if (ready && map.current)
      map.current.getCanvas().style.cursor =
        props.onPoint || mode !== "inspect" ? "crosshair" : "";
  }, [ready, mode, props.onPoint]);
  return (
    <div className="se-map-wrap">
      <div className="se-map-tools">
        <button
          type="button"
          className="se-button"
          disabled={!ready}
          aria-pressed={satellite}
          onClick={() => setSatellite(!satellite)}
        >
          {satellite ? "Aerial imagery" : "Street map"}
        </button>
        {selected && (
          <button
            type="button"
            className="se-button"
            disabled={!ready}
            onClick={() =>
              map.current?.flyTo({
                center: normalizePoint(selected),
                zoom: 18,
              })
            }
          >
            Zoom to selected area
          </button>
        )}
        <button
          type="button"
          className="se-button"
          disabled={!ready}
          onClick={() => setGlobe(!globe)}
        >
          {globe ? "Globe" : "2D map"}
        </button>
        <button
          type="button"
          className="se-button"
          disabled={!ready}
          onClick={() => {
            if (terrain) map.current?.easeTo({ pitch: 0 });
            setTerrain(!terrain);
          }}
        >
          Terrain {terrain ? "on" : "off"}
        </button>
        {props.onAOI && (
          <SelectBox
            label="Drawing mode"
            value={mode}
            onChange={(value) => {
              setMode(value);
              vertices.current = [];
              setCount(0);
            }}
            options={["inspect", "rectangle", "polygon"].map((value) => ({
              value,
              label: value === "inspect" ? "Inspect point" : `Draw ${value}`,
            }))}
          />
        )}
        {mode === "polygon" && count >= 3 && (
          <button
            type="button"
            className="se-button primary"
            onClick={() => {
              props.onAOI?.({
                type: "Polygon",
                coordinates: [[...vertices.current, vertices.current[0]]],
              });
              vertices.current = [];
              setCount(0);
              setMode("inspect");
            }}
          >
            Finish area
          </button>
        )}
      </div>
      <div
        ref={container}
        className="se-map"
        aria-label="Interactive geographic map"
        style={{ height: props.height || 460 }}
      />
      {!ready && !error && (
        <p className="se-meta" role="status">
          Loading map…
        </p>
      )}
      {error && (
        <div className="se-map-error" role="status">
          {error}{" "}
          <button
            type="button"
            className="se-button"
            onClick={() => {
              setError("");
              setReady(false);
              vertices.current = [];
              setCount(0);
              setRevision((value) => value + 1);
            }}
          >
            Retry map
          </button>
        </div>
      )}
      {mode !== "inspect" && (
        <p className="se-meta">
          {mode === "rectangle"
            ? "Click two opposite corners."
            : "Click at least three vertices, then finish the area."}
        </p>
      )}
      <p className="se-map-credit">
        {satellite
          ? "Recorded aerial/satellite imagery; capture date varies and is not provided here. Zooming beyond available detail enlarges the existing image. Not live video or current cloud coverage."
          : "Reference satellite imagery is not live cloud coverage. Analysis layers come from your completed jobs."}
      </p>
    </div>
  );
}
