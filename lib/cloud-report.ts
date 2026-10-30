import type { CloudCoverResult } from "./cloud-cover";

export function cloudCondition(percent: number) {
  if (percent === 0) return "Clear sky";
  if (percent <= 25) return "Mostly clear";
  if (percent <= 60) return "Partly cloudy";
  if (percent <= 90) return "Mostly cloudy";
  return "Overcast";
}

export function cloudReport(reading: CloudCoverResult, locationName = "") {
  return {
    title: "Cloud analysis report",
    location: locationName || "Selected map location",
    latitude: reading.latitude,
    longitude: reading.longitude,
    condition: cloudCondition(reading.cloudCover),
    cloudCoverPercent: reading.cloudCover,
    estimatedUncoveredSkyPercent: Number((100 - reading.cloudCover).toFixed(2)),
    estimateTime: reading.observedAt,
    fetchedAt: reading.fetchedAt,
    intervalSeconds: reading.intervalSeconds ?? null,
    modelGrid:
      reading.modelLatitude !== undefined &&
      reading.modelLongitude !== undefined
        ? { latitude: reading.modelLatitude, longitude: reading.modelLongitude }
        : null,
    source: "Open-Meteo",
    sourceUrl: "https://open-meteo.com/",
    method:
      "Current weather-model estimate for the forecast grid cell nearest the selected map point.",
    interpretation:
      "Cloud cover is the estimated fraction of sky covered by clouds. The rest is estimated uncovered sky. Summary bands: 0% clear; up to 25% mostly clear; up to 60% partly cloudy; up to 90% mostly cloudy; above 90% overcast.",
    limitation:
      "This report does not inspect cloud pixels in the basemap, remove clouds from an image, or measure an entire drawn area. Conditions can vary within the forecast grid cell.",
  };
}

const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

export function cloudReportHtml(reading: CloudCoverResult, locationName = "") {
  const report = cloudReport(reading, locationName);
  const rows = [
    ["Selected latitude", `${report.latitude.toFixed(5)}°`],
    ["Selected longitude", `${report.longitude.toFixed(5)}°`],
    ["Cloud cover", `${report.cloudCoverPercent}%`],
    ["Estimated uncovered sky", `${report.estimatedUncoveredSkyPercent}%`],
    ["Estimate time (UTC)", report.estimateTime],
    ["Retrieved (UTC)", report.fetchedAt],
    ...(report.intervalSeconds
      ? [["Time step", `${report.intervalSeconds / 60} minutes`]]
      : []),
    ...(report.modelGrid
      ? [
          [
            "Model grid location",
            `${report.modelGrid.latitude.toFixed(5)}°, ${report.modelGrid.longitude.toFixed(5)}°`,
          ],
        ]
      : []),
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cloud analysis report</title><style>
body{font-family:system-ui,sans-serif;margin:40px auto;padding:0 24px;max-width:780px;color:#173241;line-height:1.6}h1{font-size:30px;margin-bottom:6px}h2{font-size:18px;margin-top:28px}.eyebrow{color:#327584;font-size:12px;text-transform:uppercase;letter-spacing:.12em}.reading{border:1px solid #c4dae1;border-radius:12px;background:#eff9fb;padding:22px;margin:24px 0}.reading strong{font-size:48px;color:#087c90;margin-right:18px}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #d6e3e8;overflow-wrap:anywhere}th{width:45%;font-weight:500}small{color:#4f6978}a{color:#087c90}@media print{body{margin:0}.reading{break-inside:avoid}h2{break-after:avoid}}
</style></head><body><p class="eyebrow">Map location · Cloud conditions</p><h1>Cloud analysis report</h1><p>${escape(report.location)}</p><div class="reading"><strong>${escape(report.cloudCoverPercent)}%</strong><b>${escape(report.condition)}</b><br><small>Estimated sky covered by clouds</small></div><table><tbody>${rows.map(([label, value]) => `<tr><th>${escape(label)}</th><td>${escape(value)}</td></tr>`).join("")}</tbody></table><h2>How to read this report</h2><p>${escape(report.method)}</p><p>${escape(report.interpretation)}</p><p>${escape(report.limitation)}</p><p>Source: <a href="https://open-meteo.com/">Open-Meteo</a></p></body></html>`;
}
