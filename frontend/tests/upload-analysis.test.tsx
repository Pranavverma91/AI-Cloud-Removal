import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { Model, Raster } from "@/lib/science/types";

const mocks = vi.hoisted(() => ({
  query: "sensor=LISS-IV&image=cloudy&temporal=clear",
  images: null as Raster[] | null,
  api: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock("@/lib/personal/runner", () => ({ startAnalysis: vi.fn() }));
vi.mock("@/components/ui/switch", () => ({
  Switch: () => <input type="checkbox" aria-label="Detect candidate shadows" />,
}));
vi.mock("@/components/science/primitives", () => ({
  Title: ({ title, description }: { title: string; description: string }) => (
    <>
      <h1>{title}</h1>
      <p>{description}</p>
    </>
  ),
  Failure: ({ message }: { message: string }) => <p role="alert">{message}</p>,
  Notice: ({ children }: { children: React.ReactNode }) => (
    <div role="status">{children}</div>
  ),
  SelectBox: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string; disabled?: boolean }[];
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("@/lib/science/client", () => ({
  api: mocks.api,
  number: (value: number) => value.toString(),
  useResource: (path: string) => ({
    data:
      path === "/images"
        ? mocks.images
        : path === "/models"
          ? ([
              {
                id: "spatial-baseline",
                name: "Spatial",
                available: true,
                baseline: true,
                required_auxiliary: [],
              },
              {
                id: "temporal-baseline",
                name: "Temporal",
                available: true,
                baseline: true,
                required_auxiliary: ["temporal"],
              },
            ] as Model[])
          : path === "/health"
            ? { service: "Built-in personal processor" }
            : [],
    loading: path === "/images" && mocks.images === null,
    error: "",
    refresh: vi.fn(),
  }),
}));

import UploadAnalysis from "@/components/science/upload-analysis";

const image = (id: string, day: string): Raster => ({
  id,
  name: `${id}.tif`,
  role: "cloudy",
  sensor: "LISS-IV",
  acquired_at: day,
  bands: { green: 1, red: 2, nir: 3 },
  metadata: {
    width: 16,
    height: 16,
    count: 3,
    dtype: "uint16",
    crs: "EPSG:4326",
    bounds: [77, 22, 78, 23],
    resolution: [0.01, 0.01],
    nodata: null,
    scales: [1, 1, 1],
    offsets: [0, 0, 0],
    bytes: 1000,
  },
  sha256: "test",
  created_at: "2026-10-07T00:00:00Z",
});

beforeEach(() => {
  mocks.query = "sensor=LISS-IV&image=cloudy&temporal=clear";
  mocks.images = [image("cloudy", "2026-10-06"), image("clear", "2026-10-04")];
  vi.clearAllMocks();
});

test("prefills a real source and other-date acquisition without starting a job", () => {
  render(<UploadAnalysis />);
  expect(screen.getByLabelText("Source observation")).toHaveValue("cloudy");
  expect(screen.getByLabelText("temporal imagery")).toHaveValue("clear");
  expect(screen.getByLabelText("Reconstruction model")).toHaveValue(
    "temporal-baseline",
  );
  expect(
    screen.getByRole("img", {
      name: /Actual other-date LISS-IV observation: 2026-10-04/,
    }),
  ).toHaveAttribute("src", "/api/science/images/clear/preview");
  expect(
    screen.getByText(/cannot recover an actual photograph/),
  ).toBeInTheDocument();
  expect(mocks.api).not.toHaveBeenCalled();
});

test("waits for uploaded observations, then keeps a manual change across refresh", () => {
  mocks.images = null;
  const { rerender } = render(<UploadAnalysis />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  mocks.images = [image("cloudy", "2026-10-06"), image("clear", "2026-10-04")];
  rerender(<UploadAnalysis />);
  expect(screen.getByLabelText("Source observation")).toHaveValue("cloudy");
  fireEvent.change(screen.getByLabelText("Source observation"), {
    target: { value: "clear" },
  });
  mocks.images = [...mocks.images];
  rerender(<UploadAnalysis />);
  expect(screen.getByLabelText("Source observation")).toHaveValue("clear");
  expect(screen.getByLabelText("temporal imagery")).toHaveValue("none");
});

test("starts the reviewed temporal reconstruction only on submit", async () => {
  mocks.api.mockResolvedValue({ id: "analysis-1" });
  render(<UploadAnalysis />);
  fireEvent.change(screen.getByLabelText("Investigation name"), {
    target: { value: "LISS-IV cloud removal" },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Remove clouds & create reconstruction",
    }),
  );
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith("/analysis/analysis-1"),
  );
  const [path, request] = mocks.api.mock.calls[0];
  expect(path).toBe("/analyses");
  expect(JSON.parse(request.body)).toMatchObject({
    image_id: "cloudy",
    temporal_id: "clear",
    model_id: "temporal-baseline",
    reference_id: null,
  });
});

test("LISS-IV upload links can select an additional acquisition and require its date", () => {
  mocks.query = "sensor=LISS-IV&image=cloudy&role=temporal";
  render(<UploadAnalysis />);
  expect(screen.getByLabelText("Image role")).toHaveValue("temporal");
  expect(screen.getByLabelText("Acquisition date")).toBeRequired();
});

test("offers only compatible other-date LISS inputs and rejects an incompatible deep link", () => {
  const mismatched = image("mismatched", "2026-10-03");
  mismatched.metadata.scales = [0.01, 0.01, 0.01];
  const alias = { ...image("alias", "2026-10-02"), sensor: "LISS-4" };
  mocks.images!.push(mismatched, alias, image("same-day", "2026-10-06"));
  mocks.query = "sensor=LISS-IV&image=cloudy&temporal=mismatched";
  render(<UploadAnalysis />);
  const selector = screen.getByLabelText("temporal imagery");
  expect(selector).toHaveValue("none");
  expect(
    within(selector)
      .getAllByRole("option")
      .map((item) => item.textContent),
  ).toEqual(["None selected", "clear.tif"]);
  expect(
    screen.getByText(/matching sensor and band calibration/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: /Actual other-date/ })).toBeNull();
  fireEvent.change(selector, { target: { value: "clear" } });
  expect(screen.getByLabelText("Reconstruction model")).toHaveValue(
    "temporal-baseline",
  );
  expect(
    screen.getByRole("img", { name: /Actual other-date/ }),
  ).toHaveAttribute("src", "/api/science/images/clear/preview");
  expect(
    screen.getByText(/clouds in the reference are not screened or removed/),
  ).toBeInTheDocument();
});
