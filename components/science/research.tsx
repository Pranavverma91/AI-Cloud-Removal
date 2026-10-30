import Link from "next/link";
import { PublicNav, PublicFooter } from "./landing";
const sections = [
  [
    "Problem Statement",
    "Clouds and shadows hide surface observations in optical imagery. LISS-IV provides Green, Red and NIR bands without Blue or SWIR in this workflow. Reconstruction must respect those spectral limits and the uncertainty in estimating an unseen surface.",
  ],
  [
    "Research Objective",
    "Build a reproducible pipeline for ingesting georeferenced images, detecting obstructions, estimating masked values and evaluating against valid references. Every result must retain its acquisition metadata, input hash, model version and processing parameters.",
  ],
  [
    "Methodology",
    "Inspect actual raster bands and geographic extent. Define an area of interest, normalize radiometry, detect cloud/shadow or use a supplied mask, and reconstruct masked pixels with a spatial or temporal baseline. Preserve clear pixels on the output grid and evaluate only where a legitimate paired reference exists.",
  ],
  [
    "Architecture",
    "Personal mode uses a Next.js interface, a browser worker for computation, and persistent storage for imagery and results. The workspace opens directly without an account or password. The optional Python service adds distributed jobs, PyTorch training and neural inference.",
  ],
  [
    "Dataset",
    "Use licensed LISS-IV observations and verified band mappings. Same-sensor temporal imagery and calibrated Sentinel-1 VV/VH provide optional conditioning. Sentinel-2 and DEM files may be inventoried but are not consumed by the current reconstruction networks. Split geographic scenes before preparing patches.",
  ],
  [
    "Preprocessing",
    "Personal mode preserves the source grid and aligns optical references with bilinear interpolation and class masks with nearest-neighbor resampling. AOIs exclude outside pixels. The optional Python service supports larger images, output reprojection and tiled processing. Georeferencing alignment is not automatic image-based subpixel registration.",
  ],
  [
    "Generative Models",
    "ResUNet provides a residual reconstruction path. The conditional GAN combines a reconstruction generator with PatchGAN discrimination. Conditional DDPM predicts noise over a diffusion schedule. All learned paths remain unavailable without compatible registered safetensors weights.",
  ],
  [
    "Multi-Sensor Fusion",
    "The multimodal diffusion network combines optical observations, masks and temporal conditioning with a separate SAR encoder. Pooled cross-attention integrates radar features. Calibration ranges and alignment must match the training configuration; missing auxiliary coverage causes an explicit failure.",
  ],
  [
    "Evaluation",
    "MAE, RMSE, PSNR, SAM and ERGAS are calculated from actual aligned references over all, cloud, shadow and clear regions. NoData is excluded. A different-date temporal image is not ground truth, so it does not produce accuracy scores. NDVI uses the recorded band scales and offsets. SSIM requires the optional Python processor.",
  ],
  [
    "Experiments",
    "Training and validation histories are measured during actual optimization. Keep training, validation and test scenes disjoint, document random seeds and preserve input hashes. Small synthetic test runs verify engineering behavior; they do not demonstrate performance on real LISS-IV acquisitions.",
  ],
  [
    "Limitations",
    "Reconstructed pixels are estimates. Bright roofs, snow and haze can confuse threshold cloud detection. Temporal change and imperfect alignment can invalidate comparisons. No calibrated uncertainty model is supplied, and no scientific accuracy or benchmark improvement is claimed.",
  ],
  [
    "Future Work",
    "Train and validate on independent licensed data, calibrate uncertainty, evaluate improved cloud detectors and image registration, and measure full-resolution throughput. Operational work includes distributed recovery, storage quotas, retention policies and deployment load testing.",
  ],
];
export function ResearchPage() {
  return (
    <div className="se-site">
      <PublicNav />
      <main className="se-research-page">
        <p className="se-eyebrow">METHODS. EVIDENCE. REPRODUCIBILITY.</p>
        <h1>AI-Based Cloud Removal and Reconstruction</h1>
        <p className="se-lead">
          A transparent research platform for investigating what lies beneath
          cloud-obscured observations.
        </p>
        <div className="se-research-layout">
          <nav aria-label="Research sections">
            {sections.map(([title]) => (
              <a
                key={title}
                href={"#" + title.toLowerCase().replaceAll(" ", "-")}
              >
                {title}
              </a>
            ))}
          </nav>
          <div>
            {sections.map(([title, text]) => (
              <section
                key={title}
                id={title.toLowerCase().replaceAll(" ", "-")}
              >
                <p className="se-eyebrow">RESEARCH / {title.toUpperCase()}</p>
                <h2>{title}</h2>
                <p>{text}</p>
                {title === "Architecture" && (
                  <div className="se-research-flow">
                    {[
                      "Optical GeoTIFF · inspect & preprocess",
                      "Cloud mask · optional temporal reference",
                      "Reconstruction · preserve clear pixels",
                      "Reference evaluation · geographic inspection · export",
                    ].map((t) => (
                      <div key={t}>{t}</div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
export function ApplicationsPage() {
  return (
    <div className="se-site">
      <PublicNav />
      <main className="se-research-page">
        <p className="se-eyebrow">EARTH OBSERVATION, APPLIED</p>
        <h1>
          Questions grounded
          <br />
          <em>in a changing planet.</em>
        </h1>
        <p className="se-lead">
          Use reconstructed imagery as a research input, with clear separation
          between observed and estimated pixels.
        </p>
        <div className="se-card-grid">
          {[
            [
              "Agriculture",
              "Investigate vegetation patterns with Green, Red, NIR and NDVI. Validate estimates against independent observations; reconstruction alone cannot diagnose crop health.",
            ],
            [
              "Water & disasters",
              "Compare surface conditions across aligned acquisitions. Radar can provide complementary information, but changes between dates must not be mistaken for reconstruction error.",
            ],
            [
              "Forests & environment",
              "Explore canopy and land-cover patterns while retaining masks, acquisition dates and reference provenance. Clear-sky comparisons and field verification remain essential.",
            ],
            [
              "Infrastructure",
              "Inspect fine-scale surface context with the original grid and exported georeferencing. Generated details must not be treated as confirmed physical structures.",
            ],
          ].map(([title, text]) => (
            <article className="se-panel" key={title}>
              <h2>{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <Link className="se-button primary" href="/explorer">
          Open Earth explorer
        </Link>
      </main>
      <PublicFooter />
    </div>
  );
}
