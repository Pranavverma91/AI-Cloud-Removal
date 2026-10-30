import { isLissIv, otherDateLissImages } from "./liss-imagery";
import type { Raster } from "./science/types";

export function compatibleLissReference(source: Raster, reference: Raster) {
  return (
    otherDateLissImages([reference], source).length === 1 &&
    reference.sensor === source.sensor &&
    ["green", "red", "nir"].every((band) => {
      const sourceIndex = source.bands[band] - 1;
      const referenceIndex = reference.bands[band] - 1;
      return (
        reference.metadata.scales[referenceIndex] ===
          source.metadata.scales[sourceIndex] &&
        reference.metadata.offsets[referenceIndex] ===
          source.metadata.offsets[sourceIndex]
      );
    })
  );
}

export function analysisPrefill(
  search: Pick<URLSearchParams, "get">,
  images: Raster[],
) {
  const liss = search.get("sensor")?.toUpperCase() === "LISS-IV";
  const source = images.find(
    (image) =>
      image.id === search.get("image") &&
      "nir" in image.bands &&
      (!liss || isLissIv(image)),
  );
  const temporal = source
    ? otherDateLissImages(images, source).find(
        (image) =>
          image.id === search.get("temporal") &&
          compatibleLissReference(source, image),
      )
    : undefined;
  return {
    sourceId: source?.id || "none",
    temporalId: temporal?.id || "none",
    modelId: temporal ? "temporal-baseline" : "spatial-baseline",
    liss,
    missingSource: !!search.get("image") && !source,
    invalidTemporal: !!search.get("temporal") && !temporal,
  };
}
