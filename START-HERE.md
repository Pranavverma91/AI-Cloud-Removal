# Run AI-Based Cloud Removal and Reconstruction

This ZIP includes the frontend, personal API, local database adapter, processing worker, optional Python research backend, training code and tests.

## Start in VS Code

1. Install Node.js **22.13 or newer** and restart VS Code if it was open.
2. Extract the ZIP. In VS Code choose **File → Open Folder** and select the folder containing `package.json` and this file.
3. Choose **Terminal → New Terminal**. Run:

   ```bash
   npm run personal
   ```

4. The first launch downloads the pinned dependencies. Wait for the terminal to show **Ready**.
5. Open **http://localhost:3000** to use the workspace directly. Keep the terminal running. Stop with **Ctrl+C**; run the same command to restart.

On macOS you can also open `Start-Personal.command`. If macOS does not allow it to open, use the VS Code command above.

**One terminal runs the frontend, personal API and SQLite storage together.** Reconstruction runs in a browser worker. Python, Docker, PostgreSQL, Redis and a ChatGPT account are not required for personal mode. The first page visit compiles its code; subsequent visits are faster.

## Use the compiled version

```bash
npm start
```

This installs dependencies and builds the production website if needed, then serves it at the same address. Subsequent starts reuse the build. After editing source code, stop the server and run `npm run build:next` before `npm start`. Use `npm run personal` while developing, so edits update automatically.

## Run an analysis

1. Choose **New analysis** and upload a north-up, georeferenced `.tif` or `.tiff`.
2. Map **Green**, **Red** and **NIR** to the correct three distinct bands for your image.
3. Optionally upload a mask with classes **0 = clear, 1 = cloud, 2 = shadow**. Without a mask, the app estimates clouds from brightness; review the result.
4. Select the spatial baseline, or upload a compatible temporal image and select temporal replacement.
5. Run processing and keep the tab open until saving finishes. An interrupted run can be resumed from its analysis page.
6. Inspect the comparison, cloud mask and NDVI. Download the reconstruction GeoTIFF, metadata or report.

Personal-mode limits are **32 MB, 2 million pixels and 1–8 bands per image**. Supported pixel types are uint8, uint16, int8, int16 and float32. Supported north-up grids are WGS84, Web Mercator and WGS84 UTM. JPEG/PNG photos do not contain the spectral bands and georeferencing required for this workflow.

The included spatial and temporal methods are working reconstruction baselines. Neural models require the optional Python service and trained checkpoints; weights and scientific accuracy claims are not included. See `docs/SETUP.md` and `docs/TRAINING.md` for that service.

## Data and troubleshooting

| Situation | Action |
|---|---|
| `npm` or `node` is not found | Install Node.js 22.13+ and open a new terminal. |
| `package.json` cannot be found | Open the extracted project root, not `backend/` or `frontend/`. |
| `EADDRINUSE` / port 3000 occupied | Stop the other server. On macOS/Linux you can instead run `PORT=3001 npm run personal` and open port 3001. In PowerShell use `$env:PORT=3001; npm run personal`. |
| Website does not connect | Wait for **Ready**, keep the terminal open, and use the port printed there. Read the first error in the terminal if startup exits. |
| `no such table: personal_limits` in an old Cloudflare checkout | Use `npm run personal`. To keep that separate Cloudflare archive, run `npm run db:local`, then `npm run dev:cloudflare`. |
| Reconstruction cannot fill an entirely cloudy image | Provide a valid temporal reference with clear coverage. A spatial method requires some clear observations. |
| Interrupted browser processing | Reopen the analysis and choose **Resume processing**. |

Your local records, imagery and exports are in **`data/personal/`**. Stop the server before backing up or moving that folder. It is not included in the source ZIP. The online website and this local copy have separate archives. Personal mode opens without a password, so anyone who can reach the server can access its workspace.

Internet is needed for the first dependency installation and for external map/catalogue providers. Personal processing of uploaded files does not need a Python service. Provider availability and licensed source imagery remain external dependencies.

## Verify the project

After the first startup has installed dependencies, stop the app and run:

```bash
npm run test:frontend
npm run typecheck
npm run verify
npm run verify:personal
npm run build:next
npm run verify:personal -- --production
```

The HTTP checks use generated test imagery and isolated storage; they do not modify your personal archive. `docs/VALIDATION.md` records the checks performed for the original release and their limits.
