export type User = { id: string; name: string; email: string };
export type Metadata = {
  width: number;
  height: number;
  count: number;
  dtype: string;
  crs: string;
  bounds: [number, number, number, number];
  resolution: number[];
  nodata: number | null;
  scales: number[];
  offsets: number[];
  bytes: number;
  origin?: number[];
  step?: number[];
};
export type Raster = {
  id: string;
  name: string;
  role: string;
  sensor: string;
  acquired_at: string | null;
  bands: Record<string, number>;
  metadata: Metadata;
  sha256: string;
  created_at: string;
};
export type Model = {
  id: string;
  name: string;
  architecture: string;
  version: string;
  available: boolean;
  baseline: boolean;
  required_auxiliary: string[];
  training_date: string | null;
  validation_metrics: Record<string, number> | null;
  reason: string | null;
};
export type Metrics = {
  pixels: number;
  mae: number;
  rmse: number;
  psnr: number | null;
  ssim: number | null;
  sam: number | null;
  ergas: number | null;
};
export type Analysis = {
  engine?: "browser";
  id: string;
  name: string;
  image_id: string;
  model_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  error: string | null;
  parameters: Record<string, unknown>;
  products: string[];
  stages?: { stage: string; timestamp: string }[];
  result: null | {
    metadata: Metadata;
    counts: Record<string, number>;
    area_m2: Record<string, number>;
    cloud_percent: number;
    shadow_percent: number;
    metrics: Record<string, Metrics | null> | null;
    metric_note: string;
    provenance: Record<string, unknown>;
    seconds: number;
    confidence: null;
    limitations: string[];
  };
};
export type Experiment = {
  id: string;
  model_id: string;
  dataset: string;
  configuration: Record<string, unknown>;
  history: {
    epoch: number;
    train_loss: number;
    val_loss: number;
    val_mae?: number;
    seconds: number;
  }[];
  created_at: string;
};
export type Dashboard = {
  images: number;
  analyses: number;
  completed: number;
  processing: number;
  processed_area_m2: number;
  recent: Analysis[];
  cloud_coverage: { name: string; percent: number }[];
  models: Model[];
};
