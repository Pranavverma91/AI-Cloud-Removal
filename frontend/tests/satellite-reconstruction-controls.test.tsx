import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SatelliteReconstructionControls } from "@/components/science/satellite-reconstruction-controls";
import type { Scene } from "@/lib/satellite";

const { push, startAnalysis } = vi.hoisted(() => ({
  push: vi.fn(),
  startAnalysis: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/personal/runner", () => ({ startAnalysis }));
const scene: Scene = {
  id: "cloudy",
  capturedAt: "2026-10-02T05:32:41Z",
  cloudCover: 65,
  baseline: 5,
  platform: "Sentinel-2A",
};
const reference: Scene = {
  ...scene,
  id: "clear",
  capturedAt: "2026-09-25T05:32:41Z",
  cloudCover: 3,
};
const props = {
  point: [77.7, 28.98] as [number, number],
  size: 5,
  scene,
  scenes: [scene, { ...scene, id: "same-day" }, reference],
  locationName: "Meerut",
  ready: true,
  cloudPercent: 25,
};
const job = { id: "saved-job", engine: "browser", status: "Queued" };
const submit = () =>
  screen.getByRole("button", { name: "Remove clouds & reconstruct area" });
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

test("waits for the selected image and report, then creates and starts the saved spatial job on request", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(job, { status: 202 }));
  vi.stubGlobal("fetch", fetch);
  const view = render(
    <SatelliteReconstructionControls {...props} ready={false} />,
  );
  expect(submit()).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
  view.rerender(<SatelliteReconstructionControls {...props} />);
  fireEvent.click(submit());
  await waitFor(() => expect(push).toHaveBeenCalledWith("/analysis/saved-job"));
  expect(startAnalysis).toHaveBeenCalledWith(job);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("/api/satellite/reconstruct");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    lat: 28.98,
    lng: 77.7,
    size: 5,
    scene: "cloudy",
    method: "spatial-baseline",
    location: "Meerut",
  });
});

test("temporal reconstruction requires another capture date and previews the same area", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(job, { status: 202 }));
  vi.stubGlobal("fetch", fetch);
  render(<SatelliteReconstructionControls {...props} />);
  fireEvent.change(screen.getByLabelText("Reconstruction method"), {
    target: { value: "temporal-baseline" },
  });
  expect(submit()).toBeDisabled();
  const dates = screen.getByLabelText("Clearer reference date");
  expect(
    Array.from(dates.querySelectorAll("option")).map((option) =>
      option.getAttribute("value"),
    ),
  ).toEqual(["", "clear"]);
  fireEvent.change(dates, { target: { value: "clear" } });
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining("scene=clear"),
  );
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    expect.stringContaining("lat=28.98&lng=77.7&size=5"),
  );
  fireEvent.click(submit());
  await waitFor(() => expect(push).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    method: "temporal-baseline",
    referenceScene: "clear",
  });
});

test("provider failure stays actionable and never creates a fake result", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { error: "The reference is cloudy. Choose another date." },
        { status: 422 },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  render(<SatelliteReconstructionControls {...props} />);
  fireEvent.click(submit());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The reference is cloudy",
  );
  expect(startAnalysis).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  expect(submit()).toBeEnabled();
});

test("changing area or date cancels preparation and prevents a stale job from opening", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const view = render(<SatelliteReconstructionControls {...props} />);
  fireEvent.click(submit());
  const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1]
    .signal!;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(Response.json(job, { status: 202 })));
  expect(startAnalysis).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
});
