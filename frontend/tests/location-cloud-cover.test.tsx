import React from "react";
import { Blob as NodeBlob } from "node:buffer";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { CloudCoverResult } from "@/lib/cloud-cover";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/science/client", () => ({ api: request }));
import {
  CloudCoverPanel,
  LocationSearch,
} from "@/components/science/location-cloud-cover";

const reading = (
  cloudCover: number,
  metadata: Partial<CloudCoverResult> = {},
): CloudCoverResult => ({
  cloudCover,
  latitude: 28.98,
  longitude: 77.7,
  observedAt: "2026-10-06T10:00:00Z",
  fetchedAt: "2026-10-06T10:04:00Z",
  source: "Open-Meteo",
  sourceUrl: "https://open-meteo.com/",
  ...metadata,
});
beforeEach(() => {
  request.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("does not claim cloud cover until a location is selected", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<CloudCoverPanel point={null} />);
  expect(
    screen.getByText(/Tap or click a location on the map/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Download/ }),
  ).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
});

test("requests the chosen point and shows a dated model estimate including true zero", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(reading(0)));
  vi.stubGlobal("fetch", fetcher);
  render(<CloudCoverPanel point={[77.7, 28.98]} locationName="Meerut" />);
  expect(await screen.findByText("Clear sky")).toBeInTheDocument();
  expect(fetcher.mock.calls[0][0]).toBe("/api/cloud-cover?lat=28.98&lng=77.7");
  expect(screen.getByText("0%")).toBeInTheDocument();
  expect(
    screen.getByRole("meter", { name: "Estimated cloud cover" }),
  ).toHaveAttribute("aria-valuenow", "0");
  expect(screen.getByText("100% estimated")).toBeInTheDocument();
  expect(screen.getByText(/Weather-model estimate/)).toHaveTextContent(
    "Open-Meteo",
  );
  expect(screen.getByText(/Oct 6, 2026/).closest("time")).toHaveAttribute(
    "datetime",
    "2026-10-06T10:00:00Z",
  );
});

test("automatic weather refresh polls only while visible and stops on unmount", async () => {
  vi.useFakeTimers();
  let visibility: DocumentVisibilityState = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility,
  );
  const fetcher = vi.fn(async () => Response.json(reading(25)));
  vi.stubGlobal("fetch", fetcher);
  const { unmount } = render(
    <CloudCoverPanel point={[77.7, 28.98]} autoRefresh />,
  );
  const advance = (time: number) =>
    act(() => vi.advanceTimersByTimeAsync(time));
  await advance(350);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole("checkbox", {
      name: "Auto-refresh weather every 10 minutes",
    }),
  ).toBeChecked();
  await advance(10 * 60 * 1000);
  await advance(350);
  expect(fetcher).toHaveBeenCalledTimes(2);
  visibility = "hidden";
  await advance(20 * 60 * 1000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  visibility = "visible";
  await advance(10 * 60 * 1000);
  await advance(350);
  expect(fetcher).toHaveBeenCalledTimes(3);
  unmount();
  await advance(10 * 60 * 1000);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test("automatic weather refresh follows the latest point and can be disabled", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const fetcher = vi.fn<(url: string) => Promise<Response>>(async () =>
    Response.json(reading(25)),
  );
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<CloudCoverPanel point={null} autoRefresh />);
  const advance = (time: number) =>
    act(() => vi.advanceTimersByTimeAsync(time));
  await advance(10 * 60 * 1000);
  expect(fetcher).not.toHaveBeenCalled();
  rerender(<CloudCoverPanel point={[77.7, 28.98]} autoRefresh />);
  await advance(350);
  await advance(5 * 60 * 1000);
  rerender(<CloudCoverPanel point={[72, 19]} autoRefresh />);
  await advance(350);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await advance(5 * 60 * 1000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await advance(5 * 60 * 1000);
  await advance(350);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe("/api/cloud-cover?lat=19&lng=72");
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Auto-refresh weather every 10 minutes",
    }),
  );
  await advance(20 * 60 * 1000);
  expect(fetcher).toHaveBeenCalledTimes(3);
  fireEvent.click(screen.getByRole("button", { name: "Refresh report" }));
  await advance(350);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

test("changing location aborts the previous request and ignores its late result", async () => {
  let resolveFirst!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json(reading(81)));
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<CloudCoverPanel point={[77.7, 28.98]} />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0][1].signal;
  rerender(<CloudCoverPanel point={[72, 19]} />);
  expect(signal.aborted).toBe(true);
  expect(await screen.findByText("81%")).toBeInTheDocument();
  await act(async () => resolveFirst(Response.json(reading(12))));
  expect(screen.queryByText("12%")).not.toBeInTheDocument();
  expect(screen.getByText("81%")).toBeInTheDocument();
});

test("failed cloud lookup shows unavailable and refresh retries instead of reporting clear", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: "Weather service unavailable." }, { status: 502 }),
    )
    .mockResolvedValueOnce(Response.json(reading(52)));
  vi.stubGlobal("fetch", fetcher);
  render(<CloudCoverPanel point={[77.7, 28.98]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Weather service unavailable.",
  );
  expect(screen.queryByText("0%")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Download/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh report" }));
  expect(screen.getByRole("status")).toHaveTextContent("Analyzing cloud cover");
  expect(await screen.findByText("52%")).toBeInTheDocument();
});

test("the report identifies the exact selected point separately from its forecast grid", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        reading(62.5, {
          modelLatitude: 29,
          modelLongitude: 77.75,
          intervalSeconds: 900,
        }),
      ),
    ),
  );
  render(<CloudCoverPanel point={[77.7, 28.98]} locationName="Meerut" />);
  expect(await screen.findByText("Mostly cloudy")).toBeInTheDocument();
  expect(
    screen.getByText(/Meerut · 28.9800° latitude, 77.7000° longitude/),
  ).toBeInTheDocument();
  expect(screen.getByText("29.0000°, 77.7500°")).toBeInTheDocument();
  expect(screen.getByText("15 minutes")).toBeInTheDocument();
  expect(screen.getByText("37.5% estimated")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open-Meteo" })).toHaveAttribute(
    "href",
    "https://open-meteo.com/",
  );
  expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "62.5");
});

test("a new location immediately removes the old report and downloads, including when lookup fails", async () => {
  let finishSecond!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(reading(34)))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishSecond = resolve;
        }),
    );
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(
    <CloudCoverPanel point={[77.7, 28.98]} locationName="Meerut" />,
  );
  expect(await screen.findByText("34%")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Download report" }),
  ).toBeInTheDocument();
  rerender(<CloudCoverPanel point={[72, 19]} locationName="New location" />);
  expect(screen.queryByText("34%")).not.toBeInTheDocument();
  expect(screen.queryByText(/Meerut/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Download/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Analyzing cloud cover");
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () =>
    finishSecond(
      Response.json({ error: "Service unavailable." }, { status: 502 }),
    ),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Service unavailable.",
  );
  expect(screen.queryByText("34%")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Download/ }),
  ).not.toBeInTheDocument();
});

test("refresh hides previous report and exports until the replacement reading arrives", async () => {
  let finishRefresh!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(reading(25)))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishRefresh = resolve;
        }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<CloudCoverPanel point={[77.7, 28.98]} />);
  expect(await screen.findByText("25%")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh report" }));
  expect(screen.queryByText("25%")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Download/ }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await act(async () => finishRefresh(Response.json(reading(96))));
  expect(await screen.findByText("Overcast")).toBeInTheDocument();
  expect(screen.getByText("96%")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Download data" }),
  ).toBeInTheDocument();
});

test("downloads HTML and structured JSON for the selected report and releases their blob URLs", async () => {
  const sample = reading(62.5, {
    modelLatitude: 29,
    modelLongitude: 77.75,
    intervalSeconds: 900,
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(sample)));
  render(
    <CloudCoverPanel point={[77.7, 28.98]} locationName="Meerut & nearby" />,
  );
  await screen.findByRole("button", { name: "Download report" });
  const files: NodeBlob[] = [];
  const links: { href: string; filename: string }[] = [];
  const createObjectURL = vi.fn((file: unknown) => {
    if (!(file instanceof NodeBlob)) throw new Error("Expected a report blob");
    files.push(file);
    return `blob:cloud-report-${files.length}`;
  });
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  vi.stubGlobal("Blob", NodeBlob);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    links.push({ href: this.href, filename: this.download });
    expect(this.isConnected).toBe(true);
  });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Download report" }));
  fireEvent.click(screen.getByRole("button", { name: "Download data" }));
  expect(files[0].type).toBe("text/html;charset=utf-8");
  const html = new DOMParser().parseFromString(
    await files[0].text(),
    "text/html",
  );
  expect(html.body.textContent).toContain("Meerut & nearby");
  expect(html.body.textContent).toContain("62.5%");
  expect(files[1].type).toBe("application/json");
  expect(JSON.parse(await files[1].text())).toMatchObject({
    location: "Meerut & nearby",
    latitude: 28.98,
    longitude: 77.7,
    cloudCoverPercent: 62.5,
    estimateTime: sample.observedAt,
    fetchedAt: sample.fetchedAt,
    source: "Open-Meteo",
    modelGrid: { latitude: 29, longitude: 77.75 },
  });
  expect(links).toEqual([
    {
      href: "blob:cloud-report-1",
      filename: "cloud-report-28.9800-77.7000-2026-10-06-10-00.html",
    },
    {
      href: "blob:cloud-report-2",
      filename: "cloud-report-28.9800-77.7000-2026-10-06-10-00.json",
    },
  ]);
  expect(document.querySelector("a[download]")).toBeNull();
  vi.runOnlyPendingTimers();
  expect(revokeObjectURL.mock.calls).toEqual([
    ["blob:cloud-report-1"],
    ["blob:cloud-report-2"],
  ]);
});

test("search accepts explicit coordinates without geocoding and rejects out-of-range values", () => {
  const onSelect = vi.fn();
  render(<LocationSearch onSelect={onSelect} />);
  const input = screen.getByLabelText("Place or longitude, latitude");
  fireEvent.change(input, { target: { value: "77.7, 28.98" } });
  fireEvent.submit(input.closest("form")!);
  expect(onSelect).toHaveBeenCalledWith([77.7, 28.98], "");
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "181, 20" } });
  fireEvent.submit(input.closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent("longitude −180 to 180");
  expect(onSelect).toHaveBeenCalledTimes(1);
});

test("named search selects the coordinates of the chosen result", async () => {
  request.mockResolvedValue([
    {
      properties: { name: "Meerut", country: "India" },
      geometry: { coordinates: [77.7, 28.98] },
    },
  ]);
  const onSelect = vi.fn();
  render(<LocationSearch onSelect={onSelect} />);
  const input = screen.getByLabelText("Place or longitude, latitude");
  fireEvent.change(input, { target: { value: "Meerut" } });
  fireEvent.submit(input.closest("form")!);
  fireEvent.click(await screen.findByRole("button", { name: "Meerut, India" }));
  expect(onSelect).toHaveBeenCalledWith([77.7, 28.98], "Meerut, India");
});
