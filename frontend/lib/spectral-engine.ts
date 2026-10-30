import jpeg from "jpeg-js";
import type { AnalysisType, Metric } from "./types";
export type SpectralRaster = {
    width: number;
    height: number;
    red: Float32Array;
    green: Float32Array;
    nir: Float32Array;
    valid: Uint8Array;
};
// TiTiler returns a C-order NPY: B04, B03, B08, SCL, alpha. Never evaluate its header.
export function decodeBands(bytes: Uint8Array, baseline: number): SpectralRaster {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 12 || bytes[0] !== 0x93 || new TextDecoder().decode(bytes.slice(1, 6)) !== "NUMPY")
        throw new Error("The service returned an unreadable spectral image.");
    const version = bytes[6];
    if (version !== 1 && version !== 2)
        throw new Error("Unsupported spectral data format.");
    const start = version === 1 ? 10 : 12, length = version === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
    const header = new TextDecoder().decode(bytes.slice(start, start + length));
    const dtype = header.match(/'descr':\s*'([^']+)'/)?.[1], dims = header.match(/'shape':\s*\(([^)]+)\)/)?.[1].split(",").map(x => Number(x.trim())).filter(Boolean);
    if (dtype !== "<u2" || !/'fortran_order':\s*False/.test(header) || !dims || dims.length !== 3 || dims[0] !== 5 || dims.some(n => !Number.isInteger(n) || n <= 0) || dims[1] > 512 || dims[2] > 512)
        throw new Error("The imagery service returned an unsupported band layout.");
    const [, height, width] = dims, n = width * height, offset = start + length;
    if (offset + n * 5 * 2 !== bytes.length)
        throw new Error("The spectral image is incomplete.");
    const red = new Float32Array(n), green = new Float32Array(n), nir = new Float32Array(n), valid = new Uint8Array(n), shift = baseline >= 4 ? -1000 : 0;
    for (let i = 0; i < n; i++) {
        const r = dv.getUint16(offset + i * 2, true), g = dv.getUint16(offset + (n + i) * 2, true), ir = dv.getUint16(offset + (2 * n + i) * 2, true), scl = dv.getUint16(offset + (3 * n + i) * 2, true), mask = dv.getUint16(offset + (4 * n + i) * 2, true);
        red[i] = (r + shift) / 10000;
        green[i] = (g + shift) / 10000;
        nir[i] = (ir + shift) / 10000;
        valid[i] = mask && r && g && ir && [4, 5, 6, 7].includes(scl) ? 1 : 0;
    }
    return { width, height, red, green, nir, valid };
}
export function spectralAnalysis(type: AnalysisType, after: SpectralRaster, before?: SpectralRaster) {
    if (type === "forest" && (!before || before.width !== after.width || before.height !== after.height))
        throw new Error("Forest comparison needs two aligned satellite images.");
    const n = after.width * after.height, pixels = new Uint8Array(n * 4), counts = [0, 0, 0];
    let valid = 0, sum = 0, oldCover = 0, newCover = 0;
    const palette = type === "agriculture" ? [[95, 213, 155], [219, 196, 92], [202, 119, 110]] : type === "water" ? [[67, 187, 240], [156, 171, 139], [156, 171, 139]] : [[233, 124, 113], [95, 213, 155], [144, 162, 179]];
    for (let i = 0; i < n; i++) {
        const ndvi = (after.nir[i] - after.red[i]) / (after.nir[i] + after.red[i]);
        const ndwi = (after.green[i] - after.nir[i]) / (after.green[i] + after.nir[i]);
        const previous = before ? (before.nir[i] - before.red[i]) / (before.nir[i] + before.red[i]) : 0;
        const usable = after.valid[i] && Number.isFinite(type === "water" ? ndwi : ndvi) && Math.abs(type === "water" ? ndwi : ndvi) <= 1 && (!before || (before.valid[i] && Number.isFinite(previous) && Math.abs(previous) <= 1));
        let color: number[] = [39, 49, 66];
        if (usable) {
            valid++;
            sum += type === "water" ? ndwi : ndvi;
            let c = 0;
            if (type === "agriculture")
                c = ndvi >= .6 ? 0 : ndvi >= .3 ? 1 : 2;
            if (type === "water")
                c = ndwi > 0 ? 0 : 1;
            if (type === "forest") {
                const difference = ndvi - previous;
                c = difference < -.2 ? 0 : difference > .2 ? 1 : 2;
                oldCover += previous >= .6 ? 1 : 0;
                newCover += ndvi >= .6 ? 1 : 0;
            }
            counts[c]++;
            color = palette[c];
        }
        pixels.set([...color, 255], i * 4);
    }
    if (valid / n < .05)
        throw new Error("Less than 5% of this area has usable, cloud-free pixels. Choose a clearer capture or a different area.");
    const pct = (x: number) => Math.round(x / valid * 1000) / 10, validPercent = Math.round(valid / n * 1000) / 10;
    const labels = type === "agriculture" ? ["High vegetation", "Moderate vegetation", "Low vegetation"] : type === "water" ? ["Water signal", "Other surface"] : ["Vegetation decrease", "Vegetation increase", "Stable signal"];
    const colors = palette.map(c => "#" + c.map(v => v.toString(16).padStart(2, "0")).join(""));
    const distribution = labels.map((label, i) => ({ label, value: pct(counts[i]), color: colors[i] }));
    let metrics: Metric[], summary: string;
    if (type === "agriculture") {
        metrics = distribution.map(d => ({ ...d, unit: "%" }));
        summary = `${pct(counts[0])}% of usable pixels show high vegetation (NDVI ≥ 0.6). This measures greenness, not crop species, yield, or a disease diagnosis.`;
    }
    else if (type === "water") {
        metrics = [{ label: "Water signal", value: pct(counts[0]), unit: "%", color: colors[0] }, { label: "Mean NDWI", value: Math.round(sum / valid * 1000) / 1000, unit: "index", color: colors[0] }, { label: "Usable pixels", value: validPercent, unit: "%", color: "#a1b5d0" }];
        summary = `${pct(counts[0])}% of usable pixels have a positive NDWI water signal. Shadows, built surfaces, and shallow or turbid water can affect this estimate.`;
    }
    else {
        metrics = [{ label: "Before vegetation", value: pct(oldCover), unit: "%", color: "#a1b5d0" }, { label: "After vegetation", value: pct(newCover), unit: "%", color: colors[1] }, { label: "Coverage change", value: Math.round((newCover - oldCover) / valid * 1000) / 10, unit: "pp", color: newCover >= oldCover ? colors[1] : colors[0] }];
        summary = `${pct(counts[0])}% of jointly usable pixels show an NDVI decrease greater than 0.2; ${pct(counts[1])}% show an increase. Vegetation includes crops and grass; seasonal change is not proof of deforestation.`;
    }
    const algorithm = (type === "water" ? "NDWI = (B03 - B08) / (B03 + B08); water signal > 0." : type === "forest" ? "NDVI from B08 and B04; decrease < -0.2, increase > 0.2; vegetation cover NDVI >= 0.6." : "NDVI = (B08 - B04) / (B08 + B04); high >= 0.6, moderate >= 0.3, low < 0.3.") + " L2A offset corrected by processing baseline. SCL 4/5/6/7 retained; clouds, shadow, snow, no-data excluded. Percentages use valid pixels.";
    return { width: after.width, height: after.height, overlay: jpeg.encode({ width: after.width, height: after.height, data: pixels }, 88).data, metrics, distribution, summary, algorithm, validPercent };
}
