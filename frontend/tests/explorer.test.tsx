import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

type Point = [number, number];

vi.mock("next/dynamic", () => ({
  default: () =>
    function Map({
      onPoint,
      center,
      selectedPoint,
      initialBasemap,
      focusZoom,
    }: {
      onPoint: (point: Point) => void;
      center?: Point;
      selectedPoint?: Point;
      initialBasemap?: string;
      focusZoom?: number;
    }) {
      return (
        <div
          data-testid="map"
          data-center={center?.join(",") || "default"}
          data-selected={selectedPoint?.join(",") || "none"}
          data-basemap={initialBasemap}
          data-focus-zoom={focusZoom}
        >
          <button onClick={() => onPoint([77.7, 28.98])}>
            Choose map point
          </button>
          <button onClick={() => onPoint([78.03, 30.32])}>
            Choose another map point
          </button>
        </div>
      );
    },
}));
vi.mock("@/components/science/location-cloud-cover", () => ({
  LocationSearch: ({
    onSelect,
  }: {
    onSelect: (point: Point, name: string) => void;
  }) => (
    <>
      <button onClick={() => onSelect([72.88, 19.08], "Mumbai")}>
        Find Mumbai
      </button>
      <button onClick={() => onSelect([76.78, 30.73], "")}>
        Find coordinates
      </button>
    </>
  ),
  CloudCoverPanel: ({
    point,
    locationName,
  }: {
    point: Point | null;
    locationName: string;
  }) => (
    <p data-testid="cloud-location">
      {point ? `${locationName}:${point.join(",")}` : "Choose a location"}
    </p>
  ),
}));
vi.mock("@/components/science/primitives", () => ({
  Title: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/science/satellite-area-panel", () => ({
  SatelliteAreaPanel: ({ point }: { point: Point | null }) => (
    <p data-testid="satellite-location">
      {point?.join(",") || "Choose a location"}
    </p>
  ),
}));
vi.mock("@/components/science/liss-area-panel", () => ({
  LissAreaPanel: ({ point }: { point: Point | null }) => (
    <p data-testid="liss-location">{point?.join(",") || "Choose a location"}</p>
  ),
}));

import Explorer from "@/components/science/explorer";

afterEach(() => vi.unstubAllGlobals());

test("the project action opens reconstruction for the selected area and exposes LISS-IV uploads and results", () => {
  render(<Explorer />);
  const action = screen.getByRole("button", {
    name: "Choose image & remove clouds",
  });
  expect(action).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Find Mumbai" }));
  fireEvent.click(action);
  expect(screen.getByLabelText("Imagery source")).toHaveValue("sentinel");
  expect(screen.getByTestId("satellite-location")).toHaveTextContent(
    "72.88,19.08",
  );
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-basemap",
    "satellite",
  );
  expect(
    screen.getByRole("link", { name: "Upload LISS-IV for cloud removal" }),
  ).toHaveAttribute("href", "/analysis/new?sensor=LISS-IV");
  expect(
    screen.getByRole("link", { name: "View reconstruction results" }),
  ).toHaveAttribute("href", "/reconstructions");
});

test("opens a focused map with an unselected report", () => {
  const { container } = render(<Explorer />);
  expect(
    screen.getByRole("heading", { name: "Cloud removal & reconstruction" }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("cloud-location")).toHaveTextContent(
    "Choose a location",
  );
  expect(screen.getByTestId("map")).toHaveAttribute("data-selected", "none");
  expect(screen.getByTestId("map")).toHaveAttribute("data-center", "default");
  expect(screen.getByLabelText("Imagery source")).toHaveValue("ground");
  expect(
    screen.getByRole("region", { name: "Detailed area imagery" }),
  ).toHaveTextContent("Recorded imagery · not live video");
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-basemap",
    "satellite",
  );
  expect(screen.getByTestId("map")).toHaveAttribute("data-focus-zoom", "18");
  expect(screen.queryByTestId("satellite-location")).not.toBeInTheDocument();
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(screen.queryByText("Satellite catalogue")).not.toBeInTheDocument();
});

test("each map tap updates the selected marker and report without moving the map", () => {
  render(<Explorer />);
  fireEvent.change(screen.getByLabelText("Imagery source"), {
    target: { value: "liss" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Choose map point" }));
  expect(screen.getByTestId("cloud-location")).toHaveTextContent(":77.7,28.98");
  expect(screen.getByTestId("liss-location")).toHaveTextContent("77.7,28.98");
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-selected",
    "77.7,28.98",
  );
  expect(screen.getByTestId("map")).toHaveAttribute("data-center", "default");
  fireEvent.click(
    screen.getByRole("button", { name: "Choose another map point" }),
  );
  expect(screen.getByTestId("cloud-location")).toHaveTextContent(
    ":78.03,30.32",
  );
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-selected",
    "78.03,30.32",
  );
  expect(screen.getByTestId("map")).toHaveAttribute("data-center", "default");
});

test("switching imagery source keeps the selected map point and weather report", () => {
  render(<Explorer />);
  fireEvent.click(screen.getByRole("button", { name: "Find Mumbai" }));
  fireEvent.change(screen.getByLabelText("Imagery source"), {
    target: { value: "sentinel" },
  });
  expect(screen.getByTestId("satellite-location")).toHaveTextContent(
    "72.88,19.08",
  );
  expect(screen.queryByTestId("liss-location")).not.toBeInTheDocument();
  expect(screen.getByTestId("cloud-location")).toHaveTextContent(
    "Mumbai:72.88,19.08",
  );
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-selected",
    "72.88,19.08",
  );
  fireEvent.change(screen.getByLabelText("Imagery source"), {
    target: { value: "liss" },
  });
  expect(screen.getByTestId("liss-location")).toHaveTextContent("72.88,19.08");
  expect(screen.queryByTestId("satellite-location")).not.toBeInTheDocument();
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-center",
    "72.88,19.08",
  );
});

test("search centers the map and later taps clear the place name without recentering", () => {
  render(<Explorer />);
  fireEvent.change(screen.getByLabelText("Imagery source"), {
    target: { value: "liss" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Find Mumbai" }));
  expect(screen.getByTestId("cloud-location")).toHaveTextContent(
    "Mumbai:72.88,19.08",
  );
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-center",
    "72.88,19.08",
  );
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-selected",
    "72.88,19.08",
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose map point" }));
  expect(screen.getByTestId("cloud-location")).toHaveTextContent(":77.7,28.98");
  expect(screen.getByTestId("cloud-location")).not.toHaveTextContent("Mumbai");
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-center",
    "72.88,19.08",
  );
});

test("coordinate search also centers the map and updates the report", () => {
  render(<Explorer />);
  fireEvent.click(screen.getByRole("button", { name: "Find coordinates" }));
  expect(screen.getByTestId("cloud-location")).toHaveTextContent(
    ":76.78,30.73",
  );
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-center",
    "76.78,30.73",
  );
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-selected",
    "76.78,30.73",
  );
});

test.each([
  { label: "mobile", mobile: true, reducedMotion: false, behavior: "smooth" },
  {
    label: "mobile with reduced motion",
    mobile: true,
    reducedMotion: true,
    behavior: "auto",
  },
  { label: "desktop", mobile: false, reducedMotion: false, behavior: null },
])(
  "$label selection reveals the report only when needed",
  ({ mobile, reducedMotion, behavior }) => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(max-width: 1100px)" ? mobile : reducedMotion,
      })),
    );
    render(<Explorer />);
    fireEvent.change(screen.getByLabelText("Imagery source"), {
      target: { value: "liss" },
    });
    const report = screen
      .getByTestId("cloud-location")
      .closest<HTMLElement>(".se-cloud-map-report")!;
    const scroll = vi.fn();
    report.scrollIntoView = scroll;
    expect(
      screen.queryByRole("link", { name: "Choose another location" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Choose map point" }));
    if (behavior) {
      expect(scroll).toHaveBeenCalledExactlyOnceWith({
        behavior,
        block: "start",
      });
    } else {
      expect(scroll).not.toHaveBeenCalled();
    }
    const returnLink = screen.getByRole("link", {
      name: "Choose another location",
    });
    expect(returnLink).toHaveAttribute("href", "#cloud-map-location");
    expect(
      screen.getByRole("region", { name: "Choose a location" }),
    ).toHaveAttribute("id", "cloud-map-location");

    fireEvent.click(screen.getByRole("button", { name: "Find Mumbai" }));
    if (behavior) {
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(scroll).toHaveBeenLastCalledWith({ behavior, block: "start" });
    } else {
      expect(scroll).not.toHaveBeenCalled();
    }
  },
);

test("ground view focuses the selected area without scrolling away from the photograph", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  render(<Explorer />);
  const report = screen
    .getByTestId("cloud-location")
    .closest<HTMLElement>(".se-cloud-map-report")!;
  report.scrollIntoView = vi.fn();
  fireEvent.click(screen.getByRole("button", { name: "Choose map point" }));
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-center",
    "77.7,28.98",
  );
  expect(report.scrollIntoView).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove clouds & analyse this area" }),
  );
  expect(screen.getByLabelText("Imagery source")).toHaveValue("sentinel");
  expect(screen.getByTestId("satellite-location")).toHaveTextContent(
    "77.7,28.98",
  );
  fireEvent.change(screen.getByLabelText("Imagery source"), {
    target: { value: "ground" },
  });
  expect(screen.getByTestId("map")).toHaveAttribute(
    "data-center",
    "77.7,28.98",
  );
});
