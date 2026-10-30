export type AnalysisType = "agriculture" | "water" | "forest";
export type Metric = {
    label: string;
    value: number;
    unit?: string;
    color: string;
};
export type Analysis = {
    id: string;
    type: AnalysisType;
    title: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
    demo?: boolean;
    source?: {
        kind: "sentinel-2" | "upload";
        provider: string;
        capturedAt?: string;
        beforeCapturedAt?: string;
        sceneId?: string;
        beforeSceneId?: string;
        cloudCover?: number;
        validPercent?: number;
        sizeKm?: number;
        bbox?: number[];
        nativeResolution?: string;
    };
    createdAt: string;
    metrics: Metric[];
    summary: string;
    width: number;
    height: number;
    images: {
        original: string;
        overlay: string;
        before?: string;
    };
    distribution: {
        label: string;
        value: number;
        color: string;
    }[];
    algorithm: string;
};
export const modules = {
    agriculture: { title: "Crop health", description: "Measure vegetation with Sentinel-2 NDVI.", long: "Inspect vegetation signals at your selected location.", code: "VEG / 01", color: "#8bab62" },
    water: { title: "Water detection", description: "Map surface water with spectral signals.", long: "Find water signals in actual satellite observations.", code: "H₂O / 02", color: "#6897a2" },
    forest: { title: "Forest change", description: "Compare vegetation across capture dates.", long: "Compare two dates over the same area for vegetation change.", code: "CHG / 03", color: "#929666" }
} as const;
