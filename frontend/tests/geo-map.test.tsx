import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Point = [number, number];
  type MapOptions = {
    center: [number, number];
    zoom: number;
    style: {
      sources: Record<string, { tiles?: string[]; attribution?: string }>;
      layers: { id: string; layout?: { visibility: string } }[];
    };
    attributionControl: { compact: boolean };
  };
  class Map {
    static instances: Map[] = [];
    events: Record<string, (event?: unknown) => void> = {};
    sources: Record<string, { setData: ReturnType<typeof vi.fn> }> = {};
    layers: Record<string, unknown> = {};
    options: MapOptions;
    canvas = { style: { cursor: "" } };
    constructor(options: MapOptions) {
      this.options = options;
      this.sources.aoi = { setData: vi.fn() };
      Map.instances.push(this);
    }
    on = vi.fn((event: string, callback: (event?: unknown) => void) => {
      this.events[event] = callback;
    });
    emit(event: string, value?: unknown) {
      this.events[event]?.(value);
    }
    addControl = vi.fn();
    getSource = vi.fn((id: string) => this.sources[id]);
    addSource = vi.fn((id: string) => {
      this.sources[id] = { setData: vi.fn() };
    });
    removeSource = vi.fn((id: string) => {
      delete this.sources[id];
    });
    getLayer = vi.fn((id: string) => this.layers[id]);
    addLayer = vi.fn((layer: { id: string }) => {
      this.layers[layer.id] = layer;
    });
    removeLayer = vi.fn((id: string) => {
      delete this.layers[id];
    });
    getCanvas = vi.fn(() => this.canvas);
    getCenter = vi.fn(() => ({ lng: 78, lat: 22 }));
    getZoom = vi.fn(() => 4);
    getBearing = vi.fn(() => 0);
    getPitch = vi.fn(() => 0);
    flyTo = vi.fn();
    fitBounds = vi.fn();
    jumpTo = vi.fn();
    easeTo = vi.fn();
    setLayoutProperty = vi.fn();
    setProjection = vi.fn();
    setTerrain = vi.fn();
    resize = vi.fn();
    remove = vi.fn();
  }
  class Marker {
    static instances: Marker[] = [];
    point?: Point;
    element = { setAttribute: vi.fn() };
    constructor() {
      Marker.instances.push(this);
    }
    setLngLat = vi.fn((point: Point) => {
      this.point = point;
      return this;
    });
    addTo = vi.fn(() => {
      if (!this.point)
        throw new Error("Marker needs coordinates before mounting");
      return this;
    });
    remove = vi.fn();
    getElement = vi.fn(() => this.element);
  }
  return { Map, Marker };
});
vi.mock("maplibre-gl", () => ({
  ...mocks,
  NavigationControl: class {},
  ScaleControl: class {},
}));
vi.mock("@/components/science/primitives", () => ({
  SelectBox: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
import GeoMap from "@/components/science/geo-map";

beforeEach(() => {
  mocks.Map.instances.length = 0;
  mocks.Marker.instances.length = 0;
});
async function mapInstance() {
  await waitFor(() => expect(mocks.Map.instances.length).toBeGreaterThan(0));
  return mocks.Map.instances.at(-1)!;
}

test("uses a no-key street map with visible linked attribution and initializes without waiting for tiles", async () => {
  render(<GeoMap />);
  const map = await mapInstance();
  expect(map.options.style.sources.base.tiles).toEqual([
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  ]);
  expect(map.options.style.sources.base.attribution).toContain(
    'href="https://www.openstreetmap.org/copyright"',
  );
  expect(map.options.attributionControl.compact).toBe(false);
  expect(screen.getByRole("button", { name: "Street map" })).toBeDisabled();
  act(() => map.emit("style.load"));
  expect(screen.getByRole("button", { name: "Street map" })).not.toBeDisabled();
});

test("normalizes wrapped-world clicks and pins the chosen location, then cleans up", async () => {
  const onPoint = vi.fn();
  const rendered = render(<GeoMap onPoint={onPoint} />);
  const map = await mapInstance();
  act(() => map.emit("style.load"));
  act(() => map.emit("click", { lngLat: { lng: 437.5, lat: 28.6 } }));
  expect(onPoint).toHaveBeenCalledWith([77.5, 28.6]);
  const marker = mocks.Marker.instances[0];
  expect(marker.point).toEqual([77.5, 28.6]);
  expect(marker.addTo).toHaveBeenCalledWith(map);
  rendered.unmount();
  expect(marker.remove).toHaveBeenCalled();
  expect(map.remove).toHaveBeenCalled();
});

test("applies location changes made before style readiness and avoids recentering on equal coordinates", async () => {
  const rendered = render(<GeoMap center={[1, 2]} selectedPoint={[1, 2]} />);
  const map = await mapInstance();
  rendered.rerender(<GeoMap center={[77, 28]} selectedPoint={[77, 28]} />);
  expect(map.flyTo).not.toHaveBeenCalled();
  act(() => map.emit("style.load"));
  expect(map.flyTo).toHaveBeenCalledWith({ center: [77, 28], zoom: 10 });
  const marker = mocks.Marker.instances[0];
  expect(marker.point).toEqual([77, 28]);
  rendered.rerender(<GeoMap center={[77, 28]} selectedPoint={undefined} />);
  expect(map.flyTo).toHaveBeenCalledTimes(1);
  expect(marker.remove).toHaveBeenCalled();
});

test("retry removes the failed map and restores selection on the newly ready map", async () => {
  render(<GeoMap selectedPoint={[77, 28]} />);
  const failedMap = await mapInstance();
  act(() => failedMap.emit("style.load"));
  act(() => failedMap.emit("error", { sourceId: "base" }));
  expect(screen.getByRole("status")).toHaveTextContent(
    "The street map could not load",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
  expect(failedMap.remove).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Street map" })).toBeDisabled();
  await waitFor(() => expect(mocks.Map.instances).toHaveLength(2));
  const nextMap = mocks.Map.instances[1];
  act(() => nextMap.emit("style.load"));
  expect(mocks.Marker.instances.at(-1)?.point).toEqual([77, 28]);
  expect(
    screen.queryByRole("button", { name: "Retry map" }),
  ).not.toBeInTheDocument();
});

test("drawing an area does not select a cloud point and retains the completed polygon", async () => {
  const onPoint = vi.fn(),
    onAOI = vi.fn();
  render(<GeoMap onPoint={onPoint} onAOI={onAOI} />);
  const map = await mapInstance();
  act(() => map.emit("style.load"));
  fireEvent.change(screen.getByLabelText("Drawing mode"), {
    target: { value: "polygon" },
  });
  for (const point of [
    [77, 28],
    [78, 28],
    [78, 29],
  ]) {
    act(() => map.emit("click", { lngLat: { lng: point[0], lat: point[1] } }));
  }
  fireEvent.click(screen.getByRole("button", { name: "Finish area" }));
  expect(onPoint).not.toHaveBeenCalled();
  expect(onAOI).toHaveBeenCalledWith({
    type: "Polygon",
    coordinates: [
      [
        [77, 28],
        [78, 28],
        [78, 29],
        [77, 28],
      ],
    ],
  });
  expect(map.sources.aoi.setData).toHaveBeenLastCalledWith(
    expect.objectContaining({ geometry: onAOI.mock.calls[0][0] }),
  );
});

test("drawing across the dateline keeps a narrow area instead of wrapping its vertices", async () => {
  const onAOI = vi.fn();
  render(<GeoMap onAOI={onAOI} />);
  const map = await mapInstance();
  act(() => map.emit("style.load"));
  fireEvent.change(screen.getByLabelText("Drawing mode"), {
    target: { value: "rectangle" },
  });
  act(() => map.emit("click", { lngLat: { lng: 179, lat: 10 } }));
  act(() => map.emit("click", { lngLat: { lng: 181, lat: 12 } }));
  expect(onAOI).toHaveBeenCalledWith({
    type: "Polygon",
    coordinates: [
      [
        [179, 10],
        [181, 10],
        [181, 12],
        [179, 12],
        [179, 10],
      ],
    ],
  });
  expect(map.sources.aoi.setData).toHaveBeenLastCalledWith(
    expect.objectContaining({ geometry: onAOI.mock.calls[0][0] }),
  );
});

test("analysis layers can arrive after the map is ready and are removed when cleared", async () => {
  const rendered = render(<GeoMap />);
  const map = await mapInstance();
  act(() => map.emit("style.load"));
  rendered.rerender(
    <GeoMap
      analysisId="completed"
      product="mask"
      personal
      bounds={[76, 27, 78, 29]}
    />,
  );
  expect(map.addSource).toHaveBeenCalledWith("result", {
    type: "image",
    url: "/api/science/analyses/completed/preview/mask?map=1",
    coordinates: [
      [76, 29],
      [78, 29],
      [78, 27],
      [76, 27],
    ],
  });
  rendered.rerender(<GeoMap />);
  expect(map.removeLayer).toHaveBeenCalledWith("result");
  expect(map.removeSource).toHaveBeenCalledWith("result");
});

test("a detail map starts in recorded imagery at the requested focus zoom", async () => {
  render(
    <GeoMap initialBasemap="satellite" center={[77.7, 28.98]} focusZoom={18} />,
  );
  const map = await mapInstance();
  // The same-origin endpoint preserves missing-tile 404s even when the
  // provider omits CORS headers, allowing MapLibre's parent fallback to work.
  expect(map.options.style.sources.satellite.tiles).toEqual([
    `${location.origin}/api/map-imagery/{z}/{x}/{y}`,
  ]);
  expect(map.options.zoom).toBe(18);
  expect(
    map.options.style.layers.find((layer) => layer.id === "satellite")?.layout
      ?.visibility,
  ).toBe("visible");
  expect(
    map.options.style.layers.find((layer) => layer.id === "base")?.layout
      ?.visibility,
  ).toBe("none");
  expect(
    screen.getByText(/Not live video or current cloud coverage/),
  ).toBeInTheDocument();
  act(() => map.emit("style.load"));
  expect(map.flyTo).toHaveBeenCalledWith({ center: [77.7, 28.98], zoom: 18 });
  expect(map.setLayoutProperty).toHaveBeenCalledWith(
    "satellite",
    "visibility",
    "visible",
  );
  expect(
    screen.getByRole("button", { name: "Aerial imagery" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("detail searches use their specified zoom and clamp it to the supported map range", async () => {
  const rendered = render(<GeoMap focusZoom={18} />);
  const map = await mapInstance();
  act(() => map.emit("style.load"));
  rendered.rerender(<GeoMap center={[77.7, 28.98]} focusZoom={18} />);
  expect(map.flyTo).toHaveBeenLastCalledWith({
    center: [77.7, 28.98],
    zoom: 18,
  });
  rendered.rerender(<GeoMap center={[78, 29]} focusZoom={50} />);
  expect(map.flyTo).toHaveBeenLastCalledWith({ center: [78, 29], zoom: 20 });
});

test("the selected-area control zooms to the pin without changing basemap mode", async () => {
  const rendered = render(<GeoMap initialBasemap="satellite" />);
  const map = await mapInstance();
  act(() => map.emit("style.load"));
  expect(
    screen.queryByRole("button", { name: "Zoom to selected area" }),
  ).toBeNull();
  rendered.rerender(
    <GeoMap initialBasemap="satellite" selectedPoint={[437.7, 28.98]} />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Zoom to selected area" }),
  );
  expect(map.flyTo).toHaveBeenLastCalledWith({
    center: [77.70000000000005, 28.98],
    zoom: 18,
  });
  expect(
    screen.getByRole("button", { name: "Aerial imagery" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("retry retains the user's selected basemap instead of resetting to the initial mode", async () => {
  render(<GeoMap initialBasemap="satellite" />);
  const map = await mapInstance();
  act(() => map.emit("style.load"));
  fireEvent.click(screen.getByRole("button", { name: "Aerial imagery" }));
  expect(map.setLayoutProperty).toHaveBeenLastCalledWith(
    "satellite",
    "visibility",
    "none",
  );
  act(() => map.emit("error", { sourceId: "base" }));
  fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
  await waitFor(() => expect(mocks.Map.instances).toHaveLength(2));
  const retried = mocks.Map.instances[1];
  expect(
    retried.options.style.layers.find((layer) => layer.id === "satellite")
      ?.layout?.visibility,
  ).toBe("none");
  expect(
    retried.options.style.layers.find((layer) => layer.id === "base")?.layout
      ?.visibility,
  ).toBe("visible");
  act(() => retried.emit("style.load"));
  expect(screen.getByRole("button", { name: "Street map" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
