import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Analysis } from "./types";
export async function generateReport(a: Analysis, imageBytes: Uint8Array) {
    const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([595, 842]), dark = rgb(.09, .15, .11), muted = rgb(.38, .44, .35), lime = rgb(.82, .93, .59);
    const safe = (s: string) => s.replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/−/g, "-").replace(/×/g, "x").replace(/[^\x20-\x7E]/g, " ");
    const text = (s: string, x: number, y: number, size = 11, heavy = false, color = dark) => page.drawText(safe(s), { x, y, size, font: heavy ? bold : font, color });
    page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: dark });
    text("AI-Based Cloud Removal and Reconstruction", 40, 796, 23, true, lime);
    text("EARTH OBSERVATION / ANALYSIS REPORT", 40, 772, 9, false, rgb(.73, .8, .68));
    text(a.type === "agriculture" ? "Crop health" : a.type === "water" ? "Water detection" : "Forest change", 40, 710, 22, true);
    text(a.location.length > 72 ? a.location.slice(0, 69) + "..." : a.location, 40, 686, 12, false, muted);
    text("Analyzed: " + new Date(a.createdAt).toISOString().replace("T", " ").slice(0, 19) + " UTC", 40, 665, 9, false, muted);
    text(a.source?.capturedAt ? "SENTINEL-2 L2A / Captured: " + a.source.capturedAt.slice(0, 19).replace("T", " ") + " UTC" : "USER-UPLOADED RGB IMAGERY", 40, 640, 9, true);
    const jpg = await pdf.embedJpg(new Uint8Array(imageBytes)), scale = Math.min(515 / jpg.width, 260 / jpg.height);
    page.drawImage(jpg, { x: 40 + (515 - jpg.width * scale) / 2, y: 365, width: jpg.width * scale, height: jpg.height * scale });
    let y = 339;
    for (const m of a.metrics) {
        text(m.label, 40, y, 11);
        text(String(m.value) + " " + (m.unit || "%"), 370, y, 12, true);
        y -= 22;
    }
    const lines = (s: string, max: number) => {
        const words = safe(s).split(/\s+/), r: string[] = [];
        let l = "";
        for (const w of words) {
            if ((l + " " + w).length > max) {
                r.push(l);
                l = w;
            }
            else
                l += (l ? " " : "") + w;
        }
        if (l)
            r.push(l);
        return r;
    };
    y -= 6;
    for (const line of lines(a.summary, 92)) {
        text(line, 40, y, 10, false, muted);
        y -= 15;
    }
    y -= 12;
    text("METHOD", 40, y, 9, true);
    y -= 16;
    for (const line of lines(a.algorithm, 98)) {
        text(line, 40, y, 9, false, muted);
        y -= 13;
    }
    page.drawLine({ start: { x: 40, y: 96 }, end: { x: 555, y: 96 }, thickness: 1, color: rgb(.84, .88, .8) });
    text(a.source?.kind === "sentinel-2" ? "COPERNICUS SENTINEL-2 / MICROSOFT PLANETARY COMPUTER" : "YOUR UPLOADED IMAGE / RGB PROXY", 40, 79, 9, true);
    text(a.source?.kind === "sentinel-2" ? `Usable pixels: ${a.source.validPercent}% | Scene cloud: ${a.source.cloudCover}% | Area: ${a.source.sizeKm} x ${a.source.sizeKm} km` : "RGB color proxies are not multispectral indices. Verify results on the ground.", 40, 63, 9, false, muted);
    text("Observation ID: " + a.id, 40, 42, 8, false, muted);
    if (a.source?.kind === "sentinel-2") {
        const provenance = pdf.addPage([595, 842]);
        const line = (s: string, y: number, size = 10) => provenance.drawText(safe(s), { x: 40, y, size, font, color: dark });
        line("OBSERVATION PROVENANCE", 792, 18);
        let py = 750;
        const details = ["Provider: " + a.source.provider, "Location: " + a.location, "Coordinates: " + a.latitude + ", " + a.longitude, "Captured: " + a.source.capturedAt, "Scene: " + a.source.sceneId, ...(a.source.beforeCapturedAt ? ["Before capture: " + a.source.beforeCapturedAt, "Before scene: " + a.source.beforeSceneId] : []), "Bounding box (west, south, east, north): " + a.source.bbox?.join(", "), "Resolution: " + a.source.nativeResolution, "Output: " + a.width + " x " + a.height + " pixels", "Processing: " + a.algorithm, "Interpretation: Indices describe spectral signals. Vegetation can include crops and grass; differences between dates are not proof of deforestation. Verify conditions on the ground."];
        for (const detail of details) {
            for (const l of lines(detail, 90)) {
                line(l, py);
                py -= 16;
            }
            py -= 10;
        }
    }
    pdf.setTitle("AI-Based Cloud Removal and Reconstruction - " + a.type + " observation");
    pdf.setAuthor("AI-Based Cloud Removal and Reconstruction");
    const bytes = await pdf.save();
    return bytes;
}
