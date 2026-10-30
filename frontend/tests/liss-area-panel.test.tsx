import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LissAreaPanel } from "@/components/science/liss-area-panel";
import type { Raster } from "@/lib/science/types";
import type { LissCloudObservation } from "@/lib/liss-imagery";

const source: Raster = {
  id: "cloudy-scene",
  name: "Meerut October.tif",
  role: "cloudy",
  sensor: "LISS-IV",
  acquired_at: "2026-10-02T00:00:00Z",
  bands: { green: 1, red: 2, nir: 3 },
  metadata: {
    width: 100,
    height: 80,
    count: 3,
    dtype: "Uint16",
    crs: "EPSG:4326",
    bounds: [77, 28, 78, 30],
    resolution: [0.01, 0.025],
    nodata: null,
    scales: [1, 1, 1],
    offsets: [0, 0, 0],
    bytes: 48000,
  },
  sha256: "test-source",
  created_at: "2026-10-03T00:00:00Z",
};
const older: Raster = {
  ...source,
  id: "other-date",
  name: "Meerut September.tif",
  role: "temporal",
  acquired_at: "2026-09-20T00:00:00Z",
};
const mask = "data:image/png;base64,d2hpdGUtY2xvdWRz";
const observation = (
  image: Raster = source,
  percent = 25,
): LissCloudObservation => ({
  image_id: image.id,
  sensor: image.sensor,
  acquired_at: image.acquired_at,
  bounds: image.metadata.bounds,
  width: 100,
  height: 80,
  valid_pixels: 8000,
  valid_percent: 100,
  cloud_pixels: Math.ceil(percent * 80),
  cloud_percent: percent,
  shadow_pixels: 0,
  shadow_percent: 0,
  brightness_threshold: 0.75,
  method: "Relative brightness estimate.",
  scope: "Full valid uploaded footprint.",
  preview_url: `/api/science/images/${image.id}/preview`,
  overlay_data_url: mask,
  limitations: ["Bright ground can be mistaken for cloud."],
});
const photo = () =>
  screen.getByRole("img", { name: /^LISS-IV false-colour image/ });
const overlay = () => screen.queryByAltText("");
const settle = () => act(() => vi.advanceTimersByTimeAsync(1));
const mockFetch = (
  images: Raster[] = [older, source],
  result = observation(),
) => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url === "/api/science/images"
        ? images
        : url.includes(older.id)
          ? observation(older, 3)
          : result,
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("waits for a chosen map location before requesting imagery", async () => {
  const fetch = mockFetch();
  render(<LissAreaPanel point={null} />);
  await settle();
  expect(screen.getByText(/Choose a location on the map/)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("meter")).toBeNull();
});

test("an empty location offers genuine LISS upload and never invents an image or cloud percent", async () => {
  mockFetch([{ ...source, sensor: "Sentinel-2" }]);
  render(<LissAreaPanel point={[77.7, 28.98]} />);
  await settle();
  expect(
    screen.getByRole("heading", { name: /No uploaded LISS-IV scene/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Upload LISS-IV imagery" }),
  ).toHaveAttribute("href", "/analysis/new?sensor=LISS-IV");
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("meter")).toBeNull();
  expect(screen.queryByText(/\d+(\.\d+)?%/)).toBeNull();
});

test("shows the latest actual observation with scoped estimated coverage and a removable white overlay", async () => {
  mockFetch();
  render(<LissAreaPanel point={[77.7, 28.98]} locationName="Meerut" />);
  await settle();
  expect(screen.getByLabelText("Observation date")).toHaveValue(source.id);
  expect(photo()).toHaveAttribute(
    "src",
    `/api/science/images/${source.id}/preview?retry=0`,
  );
  expect(
    screen.getByRole("meter", { name: "Selected observation cloud cover" }),
  ).toHaveAttribute("aria-valuenow", "25");
  expect(
    screen.getByText(/full uploaded scene containing your point/),
  ).toBeInTheDocument();
  expect(screen.getByText(/does not provide a blue band/)).toBeInTheDocument();
  expect(overlay()).toBeNull();
  fireEvent.load(photo());
  const toggle = screen.getByRole("checkbox", {
    name: "Highlight suspected clouds in white",
  });
  expect(toggle).toBeChecked();
  expect(overlay()).toHaveAttribute("src", mask);
  expect(overlay()).toHaveAttribute("aria-hidden", "true");
  fireEvent.click(toggle);
  expect(overlay()).toBeNull();
  expect(photo()).toHaveAttribute(
    "src",
    `/api/science/images/${source.id}/preview?retry=0`,
  );
  fireEvent.click(toggle);
  expect(overlay()).toHaveAttribute("src", mask);
  expect(
    screen.getByRole("link", { name: "Open original image" }),
  ).toHaveAttribute("href", `/api/science/images/${source.id}/preview`);
});

test("changing observation date aborts previous analysis and ignores a late result", async () => {
  let finishOld!: (response: Response) => void;
  let oldSignal: AbortSignal | null | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === "/api/science/images") return Response.json([source, older]);
      if (url.includes(source.id)) {
        oldSignal = init.signal;
        return new Promise<Response>((resolve) => {
          finishOld = resolve;
        });
      }
      return Response.json(observation(older, 3));
    }),
  );
  render(<LissAreaPanel point={[77.7, 28.98]} />);
  await settle();
  fireEvent.change(screen.getByLabelText("Observation date"), {
    target: { value: older.id },
  });
  expect(oldSignal?.aborted).toBe(true);
  await settle();
  expect(photo()).toHaveAttribute(
    "src",
    `/api/science/images/${older.id}/preview?retry=0`,
  );
  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "3");
  await act(async () => {
    finishOld(Response.json(observation()));
  });
  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "3");
  expect(photo()).toHaveAttribute(
    "src",
    `/api/science/images/${older.id}/preview?retry=0`,
  );
});

test("other-date comparison shows both real observations and correct reconstruction inputs", async () => {
  mockFetch();
  render(<LissAreaPanel point={[77.7, 28.98]} />);
  await settle();
  const spatial = new URL(
    screen.getByRole("link", { name: "Remove clouds…" }).getAttribute("href")!,
    "http://localhost",
  );
  expect(Object.fromEntries(spatial.searchParams)).toEqual({
    sensor: "LISS-IV",
    image: source.id,
    model: "spatial-baseline",
  });
  expect(
    screen.queryByRole("link", { name: "Remove clouds using this date…" }),
  ).toBeNull();
  fireEvent.change(screen.getByLabelText("Comparison date"), {
    target: { value: older.id },
  });
  await settle();
  const first = screen.getByRole("article", {
    name: "Selected observation 2026-10-02",
  });
  const second = screen.getByRole("article", {
    name: "Other-date observation 2026-09-20",
  });
  expect(within(first).getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining(source.id),
  );
  expect(within(second).getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining(older.id),
  );
  expect(within(second).getByRole("meter")).toHaveAttribute(
    "aria-valuenow",
    "3",
  );
  const temporal = new URL(
    screen
      .getByRole("link", { name: "Remove clouds using this date…" })
      .getAttribute("href")!,
    "http://localhost",
  );
  expect(Object.fromEntries(temporal.searchParams)).toEqual({
    sensor: "LISS-IV",
    image: source.id,
    temporal: older.id,
    model: "temporal-baseline",
  });
  expect(
    screen.getByText(
      /Clouds in the reference image are not screened out or removed/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Cloud removal creates a reconstructed estimate/),
  ).toBeInTheDocument();
});

test("a failed image hides its cloud overlay and can retry the same real preview", async () => {
  mockFetch();
  render(<LissAreaPanel point={[77.7, 28.98]} />);
  await settle();
  fireEvent.load(photo());
  expect(overlay()).not.toBeNull();
  fireEvent.error(photo());
  expect(overlay()).toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
  expect(photo()).toHaveAttribute(
    "src",
    `/api/science/images/${source.id}/preview?retry=1`,
  );
  expect(overlay()).toBeNull();
  fireEvent.load(photo());
  expect(overlay()).toHaveAttribute("src", mask);
});

test("a failed cloud estimate leaves actual imagery available without displaying zero clouds", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/science/images"
        ? Response.json([source])
        : Response.json(
            { detail: "Cloud estimate unavailable" },
            { status: 500 },
          ),
    ),
  );
  render(<LissAreaPanel point={[77.7, 28.98]} />);
  await settle();
  expect(screen.getByText("Cloud estimate unavailable")).toBeInTheDocument();
  expect(screen.queryByRole("meter")).toBeNull();
  expect(screen.queryByText("0.0%")).toBeNull();
  expect(photo()).toHaveAttribute("src", expect.stringContaining(source.id));
  fireEvent.load(photo());
  expect(
    screen.getByRole("link", { name: "Open original image" }),
  ).toHaveAttribute("href", `/api/science/images/${source.id}/preview`);
});

test("an incompatible dated image can be viewed but cannot be sent for temporal reconstruction", async () => {
  mockFetch([
    source,
    { ...older, metadata: { ...older.metadata, scales: [2, 2, 2] } },
  ]);
  render(<LissAreaPanel point={[77.7, 28.98]} />);
  await settle();
  fireEvent.change(screen.getByLabelText("Comparison date"), {
    target: { value: older.id },
  });
  await settle();
  expect(
    screen.getByRole("article", { name: "Other-date observation 2026-09-20" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Remove clouds using this date…" }),
  ).toBeNull();
  expect(
    screen.getByText(/same sensor label and matching band calibration/),
  ).toBeInTheDocument();
});

test("a positive but tiny cloud area is not presented as zero", async () => {
  mockFetch([source], observation(source, 0.01));
  render(<LissAreaPanel point={[77.7, 28.98]} />);
  await settle();
  expect(screen.getByText("<0.1%")).toBeInTheDocument();
  expect(screen.queryByText(/No clouds detected/)).toBeNull();
});
