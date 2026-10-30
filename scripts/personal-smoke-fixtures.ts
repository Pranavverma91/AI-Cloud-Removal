// Generated test data only. Never shown as a real satellite observation.
import proj4 from "proj4";
import {
  tiff,
  projection,
  readScene,
  type Scene,
} from "../frontend/lib/personal/raster";
export { readScene };
export function fixture() {
  const width = 32,
    height = 32,
    n = width * height;
  const scene: Scene = {
    width,
    height,
    crs: "EPSG:32643",
    origin: [500000, 2400000, 0],
    step: [5.8, -5.8, 0],
    values: [1000, 2000, 6000].map((v) => new Float32Array(n).fill(v)),
    valid: new Uint8Array(n).fill(1),
    keys: {},
    metadata: {
      width,
      height,
      count: 3,
      dtype: "float32",
      crs: "EPSG:32643",
      bounds: [0, 0, 0, 0],
      resolution: [5.8, 5.8],
      nodata: null,
      scales: [0.0001, 0.0001, 0.0001],
      offsets: [0, 0, 0],
      bytes: 0,
    },
  };
  scene.valid[0] = 0;
  for (let y = 12; y < 20; y++)
    for (let x = 12; x < 20; x++)
      scene.values.forEach((band) => {
        band[y * width + x] = 10000;
      });
  return {
    buffer: tiff(scene),
    center: proj4(projection(scene.crs), "EPSG:4326", [
      500000 + 15.5 * 5.8,
      2400000 - 15.5 * 5.8,
    ]),
  };
}
