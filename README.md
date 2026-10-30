# AI-Based Cloud Removal and Reconstruction

Personal satellite-image workspace. The website includes its own GeoTIFF processor, direct workspace access, image storage and saved analysis results. No password, ChatGPT sign-in, Docker, Python server or trained checkpoint is needed for the built-in spatial and temporal baselines.

Start with **[START-HERE.md](START-HERE.md)** for the VS Code walkthrough, localhost commands and troubleshooting.

## Open the website

Open **Cloud analysis map**, then tap the map or search for a place. The default **Detailed aerial view** shows real Esri aerial/satellite imagery and zooms to the selected location. Buildings, roads and vegetation may be visible; small objects depend on the available resolution. The imagery is recorded, its capture date varies and is not supplied by this view, and it is not a live camera feed. Use **Zoom to selected area** to return to ground detail. Weather estimates refresh every 10 minutes while the page is visible, with a checkbox to disable polling; this does not refresh the recorded photograph or imply a new weather-model observation.

Switch **Imagery source** to **LISS-IV** to find your uploaded GeoTIFFs covering that point and show their actual false-colour previews (NIR / red / green), acquisition dates, and brightness-based cloud estimates. Suspected clouds are highlighted in translucent white; toggle the highlight to inspect the original. Percentages describe the full uploaded footprint's valid pixels, not a small crop around the pin. Bright surfaces can be mistaken for clouds, and thin cloud can be missed. The map preview and reconstruction use the same automatic detector at the default threshold of 0.75.

Choose **Remove clouds…** to configure a spatial reconstruction, or select **Comparison date** to inspect an actual image from another day and use it for temporal reconstruction. The linked form preselects the source and other-date image; processing starts when you submit it. Reconstructed pixels are estimates, while an other-date observation records the ground on that other date. Review the comparison image for clear coverage before using it. Upload LISS-IV GeoTIFFs with acquisition dates and the correct band mapping; scenes are available through [NRSC Bhoonidhi](https://bhoonidhi.nrsc.gov.in/bhoonidhi/index.html). This app does not automatically retrieve authenticated LISS-IV archive data or invent images for locations without uploads.

For public imagery without an upload, switch **Imagery source** to **Sentinel-2**. A real satellite photograph appears for a 1, 2, 5 or 10 km square, with available capture dates and cloud percentage from that capture's scene classification. Cloud classes 8, 9 and 10 (including cirrus) are highlighted in white; missing, defective and unclassified pixels are excluded and coverage is shown. Both imagery sources show dated observations, not a live feed. The separate **Current weather estimate** uses Open-Meteo forecast-grid cloud conditions and can differ from image-time cloud coverage.

For GeoTIFF reconstruction, expand **Image analysis tools** and choose **New analysis**. Upload a georeferenced TIFF, map Green / Red / NIR to the correct bands, and run reconstruction. Keep the browser tab open until the result is saved. After a closed tab or interrupted connection, open the analysis and click **Resume processing**.

Online limits: **32 MB**, **2 million pixels**, **1–8 bands** per image; uint8/uint16/int8/int16/float32, north-up WGS84, Web Mercator or WGS84 UTM. Optical images need three distinct mapped bands. Anyone who can reach the personal workspace can access its images and outputs. The hosted copy uses persistent database and object storage. The browser performs computation; it is not the authoritative archive.

## Run on your computer — easiest option

1. Install **Node.js 22.13 or newer** from https://nodejs.org.
2. Extract the project ZIP.
3. On macOS, double-click **Start-Personal.command**. Or open a terminal in this folder and run:

```bash
npm run personal
```

`npm run dev` also selects personal mode on a normal local checkout.

The first launch installs the pinned dependencies. Open **http://localhost:3000** to use the workspace directly. Leave the terminal running. The first page visit compiles its code and can take a little longer; later visits reuse the compiled files. Stop with Ctrl+C.

For a compiled server, run **`npm start`**. It creates a production build on first start and reuses it afterwards. After source edits, run `npm run build:next` to refresh that build. Both modes run the frontend and personal API in one process.

The startup script always changes to the project root, so it also works when invoked from another directory. Local records and imagery persist in `data/personal/`; back up that folder. This local archive is separate from the hosted archive. No signup or email delivery is involved.

## What runs now

- GeoTIFF upload, metadata inspection and SHA-256 provenance.
- Optional supplied class mask: **0 clear / 1 cloud / 2 shadow**. Otherwise a relative-brightness heuristic and adjacent dark pixels estimate cloud/shadow; review the mask.
- Spatial reconstruction using multiscale means of clear observations, or temporal replacement from a same-sensor calibrated image aligned to the source grid.
- Clear pixels and the source grid are preserved. An AOI masks outside pixels with NoData rather than changing the grid extent.
- Original/reconstruction comparison, georeferenced map previews, spectral inspection, NDVI, analysis history and exports.
- MAE, RMSE, PSNR, spectral angle and ERGAS only when you declare a paired same-acquisition or synthetic-ground-truth reference. Temporal references do **not** produce accuracy scores. SSIM and calibrated confidence are unavailable in the built-in processor.
- Float32 **GeoTIFF** outputs with CRS, NoData and band scale/offset metadata, JSON provenance and an HTML report. Online exports are not tiled COGs. Map previews are resampled; use TIFFs for measurements.
- Optional Sentinel-2 explorer and public satellite catalogue. Basemaps and catalogue availability depend on their providers.
- Tap the cloud-analysis map or search by place / longitude, latitude for an automatic cloud report from Open-Meteo, with HTML/JSON downloads. Each result shows its model timestamp and location; these weather estimates describe the nearby sky, not cloud pixels in satellite imagery. Street maps use OpenStreetMap without an API key.

These baselines estimate hidden surfaces. They are not pretrained generative AI and do not recover observed truth. Large clouds can yield smooth or inaccurate estimates. Neural models are visibly unavailable until trained weights and the optional Python service are configured. No analyses, metrics or benchmarks are fabricated.

## Optional advanced research service

The original Python research stack remains in `backend/`, `ml/` and the Docker configuration. It supports trainable ResUNet, conditional GAN, conditional DDPM and optical/temporal/SAR attention DDPM; larger rasters; configurable output grids; tiled processing; and COG exports.

See [Python setup](docs/SETUP.md), [training](docs/TRAINING.md) and [architecture](docs/ARCHITECTURE.md). Set the server-side `SCIENCE_API_URL` only when that service is deployed and working. Configuring it opts the research routes into the Python service and its own account system. Leave it unset for personal mode.

## Development

```bash
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm run personal
npm run test:frontend
npm run typecheck
npm run verify:personal
npm run build:next
```

`npm run build` is the separate Sites/Cloudflare build, and `npm run start:cloudflare` starts its built Worker locally. Its database migrations are in `drizzle/`. The personal launcher runs Next from the actual `frontend/` directory so its route watcher can discover every page. It reads settings from the project root and keeps data in `data/personal/`. Always use the package scripts from the root folder.

The source repository deliberately excludes private data, service credentials, dependencies and generated build output. The included test suite exercises GeoTIFF round trips, calibration, reconstruction, NDVI, reference metrics, direct workspace access, malformed inputs, interrupted runs, complete artifact validation and cross-origin rejection. `verify:personal` starts a temporary server with an isolated database and exercises real HTTP pages, upload, the actual served processing worker, saved outputs, exports and server restart without a password or session cookie. Add `-- --production` after `npm run verify:personal` to check the compiled server after `npm run build:next`.

## Repair a local D1 missing-table error

If a previous Cloudflare/Vinext development session reports `no such table: personal_limits`, stop it with Ctrl+C. Use `npm run personal` and open http://localhost:3000 for the self-contained personal workspace. This creates SQLite tables automatically and opens without a password.

To keep using your existing local Cloudflare archive, run `npm run db:local` followed by `npm run dev:cloudflare`. The setup command creates missing tables with `IF NOT EXISTS` and preserves existing records. It only uses local storage. Local Cloudflare development also runs this preparation automatically. The cloud and personal SQLite archives remain separate.

Use `npm run dev:next` when deliberately connecting the optional Python service. Personal mode ignores an old `SCIENCE_API_URL` setting so that an old research configuration cannot redirect the workspace to research accounts.
