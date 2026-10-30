import jpeg from "jpeg-js";
import type { AnalysisType, Metric } from "./types";
export type Raster = {
    width: number;
    height: number;
    data: Uint8Array;
};
export type Computed = {
    width: number;
    height: number;
    overlay: Uint8Array;
    metrics: Metric[];
    distribution: {
        label: string;
        value: number;
        color: string;
    }[];
    summary: string;
    algorithm: string;
};
const pct = (n: number, total: number) => Math.round(n / total * 1000) / 10;
export function decodeImage(bytes: Uint8Array): Raster {
    if (bytes.length > 3000000)
        throw new Error("The prepared image is too large. Choose an image under 12 MB.");
    let image;
    try {
        image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 1, maxMemoryUsageInMB: 48 });
    }
    catch {
        throw new Error("The image could not be decoded. Please choose a valid JPG, PNG, or WebP file.");
    }
    if (image.width < 16 || image.height < 16 || image.width > 900 || image.height > 900)
        throw new Error("Images must be between 16 and 900 pixels after preparation.");
    return { width: image.width, height: image.height, data: image.data };
}
function blur(values: Float32Array, w: number, h: number) {
    // Separable 5x5 Gaussian kernel [1,4,6,4,1]/16, using reflected edges.
    const t = new Float32Array(values.length), out = new Float32Array(values.length), k = [1, 4, 6, 4, 1];
    const reflect = (p: number, n: number) => p < 0 ? -p : p >= n ? 2 * n - p - 2 : p;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let s = 0;
            for (let a = -2; a <= 2; a++)
                s += values[y * w + reflect(x + a, w)] * k[a + 2];
            t[y * w + x] = s / 16;
        }
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let s = 0;
            for (let a = -2; a <= 2; a++)
                s += t[reflect(y + a, h) * w + x] * k[a + 2];
            out[y * w + x] = s / 16;
        }
    return out;
}
function vi(img: Raster) {
    const values = new Float32Array(img.width * img.height);
    for (let i = 0; i < values.length; i++) {
        const r = img.data[i * 4], g = img.data[i * 4 + 1];
        values[i] = (g - r) / (g + r + 1e-6);
    }
    return blur(values, img.width, img.height);
}
function morphology(mask: Uint8Array, w: number, h: number, dilate: boolean) {
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let v = dilate ? 0 : 1;
            check: for (let dy = -2; dy <= 2; dy++)
                for (let dx = -2; dx <= 2; dx++) {
                    const yy = y + dy, xx = x + dx;
                    // OpenCV's default neutral border for erosion/dilation.
                    const p = yy < 0 || yy >= h || xx < 0 || xx >= w ? (dilate ? 0 : 1) : mask[yy * w + xx];
                    if (dilate && p) {
                        v = 1;
                        break check;
                    }
                    if (!dilate && !p) {
                        v = 0;
                        break check;
                    }
                }
            out[y * w + x] = v;
        }
    return out;
}
export function analyze(type: AnalysisType, img: Raster, before?: Raster): Computed {
    const n = img.width * img.height, out = new Uint8Array(img.data.length);
    let metrics: Metric[] = [], distribution: Computed["distribution"] = [], summary = "", algorithm = "";
    const paint = (i: number, color: number[], mix: number) => {
        for (let c = 0; c < 3; c++)
            out[i * 4 + c] = Math.round(img.data[i * 4 + c] * (1 - mix) + color[c] * mix);
        out[i * 4 + 3] = 255;
    };
    if (type === "agriculture") {
        const v = vi(img), counts = [0, 0, 0], colors = [[34, 197, 94], [234, 179, 8], [239, 68, 68]];
        for (let i = 0; i < n; i++) {
            const c = v[i] >= .15 ? 0 : v[i] >= .02 ? 1 : 2;
            counts[c]++;
            paint(i, colors[c], .55);
        }
        const [healthy, moderate, stressed] = counts.map(x => pct(x, n));
        distribution = [{ label: "Healthy signal", value: healthy, color: "#88a966" }, { label: "Moderate", value: moderate, color: "#d5b861" }, { label: "Low / stressed", value: stressed, color: "#c57b60" }];
        metrics = distribution.map(x => ({ label: x.label, value: x.value, color: x.color, unit: "%" }));
        summary = `${pct(counts[0] + counts[1], n)}% of pixels have a positive vegetation signal. ${stressed}% fall in the low-signal class, which can include bare ground, shadows, or stressed vegetation. Color alone cannot confirm crop health.`;
        algorithm = "VI = (G - R) / (G + R + 0.000001); Gaussian 5x5; healthy >= 0.15, moderate >= 0.02.";
    }
    else if (type === "water") {
        let mask = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
            mask[i] = ((b - r) / (b + r + 1e-6) > .02 && (r + g + b) / 3 < 160) ? 1 : 0;
        }
        mask = morphology(morphology(mask, img.width, img.height, false), img.width, img.height, true);
        mask = morphology(morphology(mask, img.width, img.height, true), img.width, img.height, false);
        let count = 0;
        for (let i = 0; i < n; i++) {
            count += mask[i];
            paint(i, mask[i] ? [56, 189, 248] : [img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]], .6);
        }
        const coverage = pct(count, n);
        distribution = [{ label: "Likely water", value: coverage, color: "#689dac" }, { label: "Other surface", value: Math.round((100 - coverage) * 10) / 10, color: "#c1c9af" }];
        metrics = [{ label: "Likely water", value: coverage, unit: "%", color: "#689dac" }, { label: "Other surface", value: Math.round((100 - coverage) * 10) / 10, unit: "%", color: "#93a170" }, { label: "Water pixels", value: count, unit: "px", color: "#689dac" }];
        summary = `The color-and-brightness method identifies ${coverage}% of the image as likely water. A 5x5 opening and closing removes small isolated detections. Shadows and blue artificial surfaces may also be detected.`;
        algorithm = "WI = (B - R) / (B + R + 0.000001) > 0.02; mean RGB < 160; 5x5 opening + closing.";
    }
    else {
        if (!before)
            throw new Error("Upload both the before and after images.");
        if (before.width !== img.width || before.height !== img.height)
            throw new Error("Before and after images must have the same dimensions and cover the same area.");
        const v = vi(img), vb = vi(before);
        let loss = 0, gain = 0, stable = 0, other = 0, beforeVeg = 0, afterVeg = 0;
        for (let i = 0; i < n; i++) {
            if (vb[i] >= .05)
                beforeVeg++;
            if (v[i] >= .05)
                afterVeg++;
            const d = v[i] - vb[i];
            let c: number[];
            if (d < -.08) {
                loss++;
                c = [239, 68, 68];
            }
            else if (d > .08) {
                gain++;
                c = [56, 189, 248];
            }
            else if (v[i] >= .05) {
                stable++;
                c = [34, 197, 94];
            }
            else {
                other++;
                c = [0, 0, 0];
            }
            paint(i, c, .6);
        }
        const net = Math.round((pct(afterVeg, n) - pct(beforeVeg, n)) * 10) / 10;
        distribution = [{ label: "Signal loss", value: pct(loss, n), color: "#c57b60" }, { label: "Signal gain", value: pct(gain, n), color: "#689dac" }, { label: "Stable vegetation", value: pct(stable, n), color: "#88a966" }, { label: "Other stable", value: pct(other, n), color: "#b9c0b0" }];
        metrics = [{ label: "Before vegetation", value: pct(beforeVeg, n), unit: "%", color: "#88a966" }, { label: "After vegetation", value: pct(afterVeg, n), unit: "%", color: "#88a966" }, { label: "Net coverage change", value: net, unit: "pp", color: net < 0 ? "#c57b60" : "#88a966" }];
        summary = `Vegetation coverage changed by ${net > 0 ? "+" : ""}${net} percentage points. ${pct(loss, n)}% of pixels show a lower vegetation signal and ${pct(gain, n)}% a higher signal. Both images must be aligned; seasonal and lighting changes can affect this comparison.`;
        algorithm = "VI = (G - R)/(G + R + 0.000001); Gaussian 5x5; vegetation >= 0.05; change threshold +/- 0.08.";
    }
    const encoded = jpeg.encode({ data: out, width: img.width, height: img.height }, 85).data;
    return { width: img.width, height: img.height, overlay: new Uint8Array(encoded), metrics, distribution, summary, algorithm };
}
