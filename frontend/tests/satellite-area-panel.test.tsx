import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SatelliteAreaPanel } from "@/components/science/satellite-area-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/personal/runner", () => ({ startAnalysis: vi.fn() }));

const scenes = [
  { id: "newest", capturedAt: "2026-10-02T05:32:41Z", cloudCover: 90 },
  { id: "older", capturedAt: "2026-09-25T05:32:41Z", cloudCover: 0 },
];
const cloudMask = "data:image/png;base64,Y2xvdWQtbWFzaw==";
const metrics = {
  cloudPercent: 25 as number | null,
  coveragePercent: 100,
  cloudShadowPercent: 3,
  snowIcePercent: 0,
  unclassifiedPercent: 0,
  method: "Cloud classes 8, 9 and 10",
  cloudMaskDataUrl: cloudMask as string | null,
  cloudPixelCount: 25,
};
const photo = () =>
  screen.getByRole("img", { name: /^Sentinel-2 true-colour satellite image/ });
const overlay = () => screen.queryByAltText("");
const waitForSearch = () => act(() => vi.advanceTimersByTimeAsync(400));
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function mockFetch(result = metrics) {
  const fetch = vi.fn(async (url: string) =>
    Response.json(url.includes("/scenes?") ? { scenes } : result),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

test("does not request an image until a location is selected", () => {
  const fetch = mockFetch();
  render(<SatelliteAreaPanel point={null} />);
  expect(screen.getByText(/Choose a location on the map/)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("img")).toBeNull();
});
test("automatically shows the latest real capture, including cloudy dates, and local image cloud percent", async () => {
  const fetch = mockFetch();
  render(<SatelliteAreaPanel point={[77.7, 28.98]} locationName="Meerut" />);
  await waitForSearch();
  expect(fetch.mock.calls[0][0]).toContain("cloud=100");
  const photo = screen.getByRole("img");
  expect(photo).toHaveAttribute("src", expect.stringContaining("scene=newest"));
  expect(photo).toHaveAttribute(
    "src",
    expect.stringContaining("lat=28.98&lng=77.7&size=5"),
  );
  expect(
    screen.getByRole("meter", { name: "Satellite image cloud cover" }),
  ).toHaveAttribute("aria-valuenow", "25");
  expect(
    screen.getByText(/Satellite captures are not live/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Open full image" })).toBeNull();
  fireEvent.load(photo);
  expect(screen.getByRole("link", { name: "Open full image" })).toHaveAttribute(
    "href",
    photo.getAttribute("src"),
  );
});
test("highlights detected clouds on the loaded photograph and lets the user inspect the original", async () => {
  mockFetch();
  render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  expect(overlay()).toBeNull();
  fireEvent.load(photo());

  const toggle = screen.getByRole("checkbox", {
    name: "Highlight detected clouds",
  });
  expect(toggle).toBeChecked();
  expect(overlay()).toHaveAttribute("src", cloudMask);
  expect(overlay()).toHaveAttribute("aria-hidden", "true");
  expect(screen.getAllByRole("img")).toEqual([photo()]);
  expect(
    screen
      .getByRole("meter", { name: "Satellite image cloud cover" })
      .compareDocumentPosition(photo()) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  const original = photo().getAttribute("src");
  fireEvent.click(toggle);
  expect(overlay()).toBeNull();
  expect(photo()).toHaveAttribute("src", original);
  expect(
    screen.getByRole("meter", { name: "Satellite image cloud cover" }),
  ).toHaveAttribute("aria-valuenow", "25");
  fireEvent.click(toggle);
  expect(overlay()).toHaveAttribute("src", cloudMask);
});
test("changing the capture keeps its image and cloud calculation in sync", async () => {
  const olderMask = "data:image/png;base64,b2xkZXItY2xvdWQtbWFzaw==";
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.includes("/scenes?")
        ? { scenes }
        : url.includes("scene=older")
          ? { ...metrics, cloudPercent: 40, cloudMaskDataUrl: olderMask }
          : metrics,
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  fireEvent.load(photo());
  expect(overlay()).toHaveAttribute("src", cloudMask);
  fireEvent.change(screen.getByLabelText("Capture date"), {
    target: { value: "older" },
  });
  expect(overlay()).toBeNull();
  expect(screen.queryByRole("meter")).toBeNull();
  await act(async () => {});
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining("scene=older"),
  );
  expect(fetch.mock.calls.at(-1)?.[0]).toContain("scene=older");
  expect(overlay()).toBeNull();
  fireEvent.load(photo());
  expect(overlay()).toHaveAttribute("src", olderMask);
  expect(
    screen.getByRole("meter", { name: "Satellite image cloud cover" }),
  ).toHaveAttribute("aria-valuenow", "40");
});
test("a late classification for the previous date cannot replace the current image's result or overlay", async () => {
  let finishOld!: (response: Response) => void;
  let oldSignal: AbortSignal | null | undefined;
  const currentMask = "data:image/png;base64,Y3VycmVudC1jbG91ZC1tYXNr";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes("/scenes?")) return Response.json({ scenes });
      if (url.includes("scene=newest")) {
        oldSignal = options.signal;
        return new Promise<Response>((resolve) => {
          finishOld = resolve;
        });
      }
      return Response.json({
        ...metrics,
        cloudPercent: 12,
        cloudMaskDataUrl: currentMask,
      });
    }),
  );
  render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  fireEvent.change(screen.getByLabelText("Capture date"), {
    target: { value: "older" },
  });
  await act(async () => {});
  expect(oldSignal?.aborted).toBe(true);
  fireEvent.load(photo());
  expect(overlay()).toHaveAttribute("src", currentMask);

  await act(async () => {
    finishOld(Response.json(metrics));
  });
  expect(photo()).toHaveAttribute(
    "src",
    expect.stringContaining("scene=older"),
  );
  expect(overlay()).toHaveAttribute("src", currentMask);
  expect(
    screen.getByRole("meter", { name: "Satellite image cloud cover" }),
  ).toHaveAttribute("aria-valuenow", "12");
});
test("a new map point immediately removes the previous image and aborts its requests", async () => {
  const fetch = mockFetch();
  const { rerender } = render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  fireEvent.load(photo());
  expect(overlay()).toHaveAttribute("src", cloudMask);
  const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    .signal;
  const classificationSignal = (
    fetch.mock.calls[1] as unknown as [string, RequestInit]
  )[1].signal;
  rerender(<SatelliteAreaPanel point={[72.88, 19.08]} />);
  expect(screen.queryByRole("img")).toBeNull();
  expect(overlay()).toBeNull();
  expect(screen.queryByRole("meter")).toBeNull();
  expect(signal?.aborted).toBe(true);
  expect(classificationSignal?.aborted).toBe(true);
  await waitForSearch();
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining("lat=19.08&lng=72.88"),
  );
});
test("changing area size refreshes both the crop and its classification", async () => {
  mockFetch();
  render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  fireEvent.change(screen.getByLabelText("Area around the selected point"), {
    target: { value: "10" },
  });
  expect(screen.queryByRole("img")).toBeNull();
  await waitForSearch();
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining("size=10"),
  );
});
test("image failure has an explicit retry and does not replace the real image with a sample", async () => {
  mockFetch();
  render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  fireEvent.load(photo());
  expect(overlay()).toHaveAttribute("src", cloudMask);
  fireEvent.error(photo());
  expect(screen.queryByRole("img")).toBeNull();
  expect(overlay()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
  expect(overlay()).toBeNull();
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining("retry=1"),
  );
  fireEvent.load(photo());
  expect(overlay()).toHaveAttribute("src", cloudMask);
});
test("partial classified coverage is explained and zero clouds remains a valid result", async () => {
  mockFetch({
    ...metrics,
    cloudPercent: 0,
    coveragePercent: 50,
    cloudPixelCount: 0,
  });
  render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  expect(
    screen.getByRole("meter", { name: "Satellite image cloud cover" }),
  ).toHaveAttribute("aria-valuenow", "0");
  expect(
    screen.getByText("No clouds detected in the classified part of this area."),
  ).toBeInTheDocument();
  expect(screen.getByText(/Partial coverage/)).toBeInTheDocument();
});
test("tiny positive cloud coverage is not described as a cloud-free image", async () => {
  mockFetch({ ...metrics, cloudPercent: 0, cloudPixelCount: 1 });
  render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  expect(screen.getByText("<0.1%")).toBeInTheDocument();
  expect(screen.queryByText(/No clouds detected/)).toBeNull();
});
test("unclassified imagery is unknown rather than clear and has no cloud overlay", async () => {
  mockFetch({
    ...metrics,
    cloudPercent: null,
    cloudPixelCount: 0,
    coveragePercent: 0,
    cloudMaskDataUrl: null,
  });
  render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  fireEvent.load(photo());
  expect(screen.queryByRole("meter")).toBeNull();
  expect(screen.queryByText(/No clouds detected/)).toBeNull();
  expect(screen.getByText(/no classified pixels/)).toBeInTheDocument();
  expect(overlay()).toBeNull();
  expect(
    screen.getByRole("checkbox", { name: "Highlight detected clouds" }),
  ).toBeDisabled();
});
test("classification failures still leave the real photograph available", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/scenes?")
        ? Response.json({ scenes })
        : Response.json({ error: "Service unavailable" }, { status: 502 }),
    ),
  );
  render(<SatelliteAreaPanel point={[77.7, 28.98]} />);
  await waitForSearch();
  fireEvent.load(photo());
  expect(photo()).toBeInTheDocument();
  expect(overlay()).toBeNull();
  expect(screen.queryByRole("meter")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Image cloud percentage unavailable",
  );
});
