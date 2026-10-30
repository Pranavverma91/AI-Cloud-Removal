# Research methodology and evaluation protocol

## Objective and contribution

Estimate cloud-obscured Green, Red and NIR values in georeferenced LISS-IV imagery, while preserving clear observations and retaining traceable inputs, parameters and model versions. The current contribution is an integrated, reproducible research implementation. No superiority, novelty, field validation or numerical benchmark is claimed without an appropriate experimental study.

NRSC documents LISS-IV's 5.8 m spatial resolution and multispectral band characteristics. Confirm the particular delivered product's band mapping and calibration rather than inferring them from its filename. The nominal resolution is a sensor specification, not a measured resolution for every uploaded/resampled file.

## Implemented methods

| Method | Purpose | Boundary |
|---|---|---|
| Brightness/shadow heuristic | Experimental class mask using scene-normalized optical brightness and nearby dark pixels | No Blue/SWIR-based physical cloud test; snow, bright roofs, haze and dark surface confusion remain possible |
| Spatial normalized convolution | Fill masked pixels from clear context at multiple Gaussian scales | Texture/detail may blur; fails without sufficient nearby clear context |
| Temporal replacement | Geometrically resample a same-sensor optical observation into masked areas | Dates differ; land-cover or illumination changes can be copied |
| Residual U-Net | Supervised paired reconstruction | Requires representative data and trained weights |
| Conditional GAN | Residual generator plus conditional PatchGAN | Visually plausible details can be invented |
| Conditional DDPM | Iterative noise-conditioned reconstruction | Computationally expensive and stochastic |
| Optical/temporal/SAR DDPM | Separate SAR encoder with pooled optical/SAR cross-attention | Requires calibrated VV/VH, temporal data and registered normalization |

The attention module exchanges pooled spatial tokens and fuses the result back into the optical pathway. It is not a full-scale pretrained vision transformer. Sentinel-2 and DEM uploads can be inventoried but are not consumed by these reconstruction models. Adding their physical calibration and conditioning remains future work.

## Output and metric interpretation

Reconstruction preserves clear pixels **on the processing grid**. Reprojection/resampling requested by the user happens first. Masks use `0` clear, `1` cloud, `2` shadow and `255` invalid. The brightness score is not a probability or confidence estimate; a supplied mask does not generate a new score. Calibrated uncertainty is unavailable, represented as null.

NDVI uses `(NIR − Red)/(NIR + Red)` after applying recorded per-band scale/offset. Zero denominators and invalid observations are masked. Review whether the input's stored radiometry actually supports quantitative NDVI; arbitrary digital numbers without correct calibration are not surface reflectance. False-color display maps NIR/Red/Green, with the same sampled stretch for original, reconstruction and reference.

Accuracy is computed only when the user identifies a same-acquisition paired reference or a deliberately synthetic ground truth. A different-date reference produces a comparison/difference product with no accuracy metrics. An absent reference yields no metric cards or invented target values. The declared relationship does not automatically prove the reference is cloud-free; inspecting reference quality remains part of dataset preparation.

- MAE and RMSE aggregate native digital-number errors across the three bands.
- PSNR and SSIM use a sampled reference 2–98 percentile data range, recorded in the result note. Values depend on this convention and are not directly comparable with papers using [0,1] reflectance or a fixed sensor range.
- Zero error gives infinite PSNR, serialized as null with an explanatory note. A region with no valid samples has no metrics.
- SSIM contributes only centers whose full 7×7 neighborhood is valid and inside that region. Halos prevent internal tile boundaries from removing valid neighborhoods.
- SAM is the mean spectral angle in degrees over nonzero spectral vectors.
- ERGAS uses the same-grid spatial ratio of 1 and reference band means. It is unavailable when a mean is too close to zero.
- Metrics are separated into all, cloud, shadow and clear regions. Area is a local geodesic approximation per processing tile; it is not cadastral area.

## Experimental design

1. Acquire licensed scenes spanning relevant seasons, terrain, land cover and contamination levels. Document acquisition dates, geographic footprints, calibration and mask quality.
2. Hold out geographic scenes, including overlapping neighbors and temporal variants. Freeze train/validation/test manifests and hashes before patch extraction.
3. Use synthetic occlusion to obtain known paired targets, then evaluate transfer separately on real cloudy imagery with a defensible reference. Do not mix those two conclusions.
4. Compare identical spatial/temporal baselines and trained models on the same masks and output grids. Include optical-only, temporal-only and SAR-fusion ablations where data permits.
5. Report per-scene regional metrics and the distribution across scenes. Examine spectral profiles, water/forest/crop boundaries and artifact-heavy cases rather than reporting only a visually pleasing example.
6. Record model version, training seed, inference seed, checkpoints, hyperparameters, hardware/runtime and any excluded scenes. Report uncertainty across held-out scenes rather than treating overlapping tiles as independent observations.

## Remaining scientific and operational limits

No trained LISS-IV checkpoint, licensed benchmark dataset, quantitative superiority result or calibrated uncertainty model is bundled. Georeferencing aligns grids but does not estimate subpixel image registration. There is no automatic surface-reflectance correction, SAR preprocessing or physical atmospheric inversion. Entirely hidden surfaces cannot be recovered as observations from a single optical image. Severe domain shift, seasonal change and mask errors can produce misleading estimates.

The queue uses recorded stages and duplicate-delivery protection but has no interactive cancellation or automatic recovery of a process killed mid-job. The application is intended for supervised research; application conclusions require independent validation.

## Primary references

These sources motivate the sensor context and architecture families. The project does not reproduce their reported scores.

- NRSC, **Resourcesat-1 User Handbook**, LISS-IV sensor and product characteristics: https://www.nrsc.gov.in/nrscnew/assets/pdf/handbooks/Resourcesat-1_Handbook.pdf
- Ho, J., Jain, A., and Abbeel, P. (2020), **Denoising Diffusion Probabilistic Models**: https://arxiv.org/abs/2006.11239
- Isola, P., Zhu, J.-Y., Zhou, T., and Efros, A. A. (CVPR 2017), **Image-to-Image Translation with Conditional Adversarial Networks**: https://arxiv.org/abs/1611.07004
- NASA Scientific Visualization Studio, **Blue Marble** visualization asset: https://svs.gsfc.nasa.gov/2915/
