# Train and register a model

Training runs on your data and hardware. The application does not ship pretrained weights or borrow example accuracy values. The four neural models are compact project implementations inspired by established architecture families, not reproductions of a particular published cloud-removal benchmark.

## Prepare observations

Use licensed, geometrically aligned observations with known calibration. Optical band order must be Green, Red, NIR after mapping. Match sensor and band scales/offsets across cloudy, clear and temporal images. A different-date observation can condition a model but is not a trustworthy paired target without a separate scientific justification.

Split whole geographic scenes into train/validation/test **before** generating variants or patches. Keep nearby overlapping footprints and every date/variant of a held-out scene together. The script rejects repeated scene IDs or identical cloudy/clear/temporal/SAR file hashes across splits, but cannot detect geographic overlap or renamed scene aliases by itself.

For explicitly synthetic experimentation from a clear observation:

```bash
python -m scripts.generate_synthetic /path/to/clear.tif data/synthetic/scene-a --seed 42 --bands 1 2 3
```

This writes cloudy/clear GeoTIFFs, a class mask and provenance. It creates procedural opacity and displaced shadows; it is not an atmospheric simulator. Clear pixels outside its mask stay unchanged. Use a new output directory each time. Never describe these generated cloudy inputs as real satellite acquisitions.

Create a JSON list with one row per observation pair. Paths are relative to the manifest file. This is a **schema example**, not a supplied dataset:

```json
[
  {"scene_id":"geographic-scene-a","split":"train","cloudy":"scene-a/cloudy.tif","clear":"scene-a/clear.tif","mask":"scene-a/mask.tif","bands":[1,2,3]},
  {"scene_id":"geographic-scene-b","split":"val","cloudy":"scene-b/cloudy.tif","clear":"scene-b/clear.tif","mask":"scene-b/mask.tif","bands":[1,2,3]},
  {"scene_id":"geographic-scene-c","split":"test","cloudy":"scene-c/cloudy.tif","clear":"scene-c/clear.tif","mask":"scene-c/mask.tif","bands":[1,2,3]}
]
```

For multimodal training, each row additionally needs `temporal`, `sar`, `sar_bands` (VV/VH indices), `sar_low` and `sar_span` (two finite calibration values and positive spans). Use the same SAR normalization across all splits and pass it again during training. Apply the appropriate Sentinel-1 calibration, terrain correction and speckle treatment upstream; the code does not infer their physical units.

```bash
python -m scripts.prepare_patches data/pairs.json data/patches/run-01 --size 256 --overlap 32
```

Only complete, fully valid patches are written. Reference and auxiliary readers warp by their CRS/transforms. Review the output manifest's per-scene counts and normalization. Empty splits stop training. Training augmentation applies consistent rotations/flips to all channels and the same optical gain/offset to cloudy, target and temporal imagery. Validation is not augmented. Inputs are normalized with the cloudy scene's sampled 2–98 percentile range and clipped to [0,1]; review saturation before training.

## Train

```bash
python -m ai.training.train --data data/patches/run-01 --output data/runs/resunet-01 --model resunet --epochs 50 --batch-size 4 --base 16 --seed 42
python -m ai.training.train --data data/patches/run-01 --output data/runs/cgan-01 --model cgan --epochs 50 --batch-size 4 --base 16 --seed 42
python -m ai.training.train --data data/patches/run-01 --output data/runs/ddpm-01 --model diffusion --epochs 50 --steps 100 --batch-size 4 --base 16 --seed 42
python -m ai.training.train --data data/patches/multimodal-01 --output data/runs/fusion-01 --model multimodal-diffusion --epochs 50 --steps 100 --batch-size 4 --base 16 --seed 42 --sar-low -25 -30 --sar-span 25 30
```

The final SAR numbers are **example CLI syntax**, not a calibration prescription; replace them with the values used to prepare your files. Reduce batch size if memory is insufficient. A CUDA-capable PyTorch environment is selected automatically. The supplied Docker image uses CPU only.

| Model | Input | Objective |
|---|---|---|
| ResUNet | 3 optical channels + binary mask | Weighted L1 reconstruction |
| cGAN | Same input; conditional PatchGAN sees optical/mask + candidate | Weighted L1 + adversarial loss |
| Conditional DDPM | Optical/mask condition, noisy target and time | Weighted noise-prediction error |
| Multimodal DDPM | Optical/mask + temporal optical + VV/VH SAR | Optical/SAR feature attention and noise-prediction error |

Each epoch writes measured losses, masked normalized validation MAE, elapsed time, `config.json`, `history.json`, `model.safetensors` and a trusted training-state file. Registration uses **the final epoch**, not automatic best-checkpoint selection. Validation MAE is averaged across batches; use scene-level held-out evaluation for the final report. Diffusion validation includes stochastic sampling. Automatic early stopping and resume are not implemented; optimizer/discriminator/scheduler/RNG state is retained for a future explicit resume implementation. Never load an untrusted `.pt` file.

## Register

Create the research account first, then run against the same database and shared model directory as the API/worker:

```bash
python -m scripts.register_model data/runs/resunet-01 --owner-email your-account@example.com
```

The command validates the exact model state, requires measured history, stores a uniquely named safetensors checkpoint with its hash, and enables the existing registry entry. The Models page then shows it as available; Model Lab shows the stored training run. Re-registering updates the active version without changing previous result provenance. Inference verifies the checkpoint checksum and records a seed in analysis parameters.

For Docker, put the training run into the shared `/app/data/runs` volume, or train in an environment that mounts it; run registration with `docker compose exec api python -m scripts.register_model /app/data/runs/RUN --owner-email ADDRESS`.

## Final evaluation

Run each baseline and trained model on exactly the same held-out scene/AOI/mask. Upload the actual paired reference, select `synthetic-ground-truth` or `same-acquisition` truthfully, and export the results. Aggregate per scene, not by treating overlapping patches as independent samples. Report geographic splits, source dates/calibration, cloud and shadow fractions, hardware, runtime and model versions. Follow [the evaluation protocol](../research/METHODOLOGY.md).
