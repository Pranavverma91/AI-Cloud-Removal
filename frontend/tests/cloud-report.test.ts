import { expect, test } from "vitest";
import type { CloudCoverResult } from "@/lib/cloud-cover";
import {
  cloudCondition,
  cloudReport,
  cloudReportHtml,
} from "@/lib/cloud-report";

const reading: CloudCoverResult = {
  latitude: 28.98123,
  longitude: 77.70123,
  cloudCover: 62.35,
  observedAt: "2026-10-06T10:00:00.000Z",
  fetchedAt: "2026-10-06T10:04:00.000Z",
  intervalSeconds: 900,
  modelLatitude: 29,
  modelLongitude: 77.75,
  source: "Open-Meteo",
  sourceUrl: "https://open-meteo.com/",
};

test.each([
  [0, "Clear sky"],
  [0.1, "Mostly clear"],
  [25, "Mostly clear"],
  [25.1, "Partly cloudy"],
  [60, "Partly cloudy"],
  [60.1, "Mostly cloudy"],
  [90, "Mostly cloudy"],
  [90.1, "Overcast"],
  [100, "Overcast"],
])("classifies %s percent cloud cover as %s", (percent, condition) => {
  expect(cloudCondition(Number(percent))).toBe(condition);
});

test("structured report preserves selected coordinates, model grid, timestamps, percentages and source", () => {
  const report = cloudReport(reading, "Meerut");
  expect(report).toMatchObject({
    title: "Cloud analysis report",
    location: "Meerut",
    latitude: 28.98123,
    longitude: 77.70123,
    modelGrid: { latitude: 29, longitude: 77.75 },
    intervalSeconds: 900,
    condition: "Mostly cloudy",
    cloudCoverPercent: 62.35,
    estimatedUncoveredSkyPercent: 37.65,
    estimateTime: "2026-10-06T10:00:00.000Z",
    fetchedAt: "2026-10-06T10:04:00.000Z",
    source: "Open-Meteo",
    sourceUrl: "https://open-meteo.com/",
  });
  expect(report.method).toMatch(/weather-model estimate/);
  expect(report.limitation).toMatch(/does not inspect cloud pixels/);
  expect(report.limitation).toMatch(/entire drawn area/);
});

test("HTML export contains measured values with distinct selected-point and model-grid labels", () => {
  const document = new DOMParser().parseFromString(
    cloudReportHtml(reading, "Meerut"),
    "text/html",
  );
  const rows = Object.fromEntries(
    Array.from(document.querySelectorAll("tr"), (row) => [
      row.querySelector("th")?.textContent,
      row.querySelector("td")?.textContent,
    ]),
  );
  expect(rows).toEqual({
    "Selected latitude": "28.98123°",
    "Selected longitude": "77.70123°",
    "Cloud cover": "62.35%",
    "Estimated uncovered sky": "37.65%",
    "Estimate time (UTC)": reading.observedAt,
    "Retrieved (UTC)": reading.fetchedAt,
    "Time step": "15 minutes",
    "Model grid location": "29.00000°, 77.75000°",
  });
  expect(document.querySelector("a")?.getAttribute("href")).toBe(
    "https://open-meteo.com/",
  );
  expect(document.body.textContent).toContain(
    "Conditions can vary within the forecast grid cell.",
  );
});

test("HTML export treats supplied location names as text instead of executable markup", () => {
  const location = `<script>alert("cloud")</script><img src=x onerror='alert(1)'> & "North"`;
  const html = cloudReportHtml(reading, location);
  const document = new DOMParser().parseFromString(html, "text/html");
  expect(document.querySelector("script, img, [onerror]")).toBeNull();
  expect(document.body.textContent).toContain(location);
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&amp;");
  expect(html).toContain("&quot;North&quot;");
  expect(html).toContain("&#39;alert(1)&#39;");
});

test("missing optional metadata stays absent instead of fabricating a grid or interval", () => {
  const minimal: CloudCoverResult = {
    latitude: reading.latitude,
    longitude: reading.longitude,
    cloudCover: 0,
    observedAt: reading.observedAt,
    fetchedAt: reading.fetchedAt,
    source: reading.source,
    sourceUrl: reading.sourceUrl,
  };
  expect(cloudReport(minimal)).toMatchObject({
    location: "Selected map location",
    intervalSeconds: null,
    modelGrid: null,
    cloudCoverPercent: 0,
    estimatedUncoveredSkyPercent: 100,
    condition: "Clear sky",
  });
  const document = new DOMParser().parseFromString(
    cloudReportHtml(minimal),
    "text/html",
  );
  expect(document.body.textContent).not.toMatch(
    /Time step|Model grid location|undefined|NaN/,
  );
  expect(cloudReport({ ...minimal, modelLatitude: 29 }).modelGrid).toBeNull();
});
