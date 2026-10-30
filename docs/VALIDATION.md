# Validation record — version 5.1.0

This is the historical validation record for the original password-protected release. Personal mode now opens directly without a password or session cookie, and its current tests and HTTP checks exercise that access flow. Password/session results below describe the original release, not the current personal access model.

Verified on 1 October 2026 in the supplied Linux environment, using Node.js 24.19 and Python 3.12. The project requires Node.js 22.13 or newer. The macOS launcher is included, but no macOS or Windows machine was available for platform-specific execution.

| Check | Observed result |
|---|---|
| Frontend / Vitest | **33 tests passed** across four files |
| Python / pytest | **19 tests passed** on CPU |
| TypeScript | Passed |
| Next.js standalone production build | Passed; every route compiled |
| Personal development server HTTP workflow | Passed with isolated temporary storage |
| Personal compiled production server HTTP workflow | Passed, including real standalone startup |
| Sentinel numerical verification | Passed: spectral indices, offset correction, masking, malformed inputs and PDF report |
| Access verification command | Passed; runs the 26 personal API/processing cases included in the frontend total |
| Browser visual check | Homepage rendered in the managed browser with the requested title and navigation |

## Personal workflow exercised

`npm run verify:personal` starts a real server on an available local port and creates an isolated database, temporary password and generated georeferenced TIFF. It checks:

- Public pages and protection of the dashboard/API before login.
- Password login and all main authenticated pages: dashboard, new analysis, datasets, history, reconstructions, explorer, model pages, settings and the legacy workspace.
- A real GeoTIFF upload, queued analysis and execution of the **actual worker JavaScript served by the website**. The worker runs through a Node worker-thread bridge in this check; this is not a browser button-automation test.
- Stage updates and uploads of every generated TIFF, PNG preview and georeferenced map preview.
- Completion, cloud counts, reconstructed values, exact clear-pixel preservation and retention of NoData.
- Reconstruction download, preview, metadata, report, geographic pixel inspection and the analysis page.
- A server restart using the same storage and session, followed by retrieval of the saved analysis and export.
- Logout and rejection of the revoked session.

The same workflow passed with `npm run verify:personal -- --production` after the production build. This caught and fixed an entrypoint module-format issue that compilation alone did not detect. The launcher now copies the required static/public assets and runs the generated CommonJS entrypoint with a `.cjs` extension.

## Numerical and failure cases

Frontend tests cover calibrated GeoTIFF round trips, spatial/temporal reconstruction, reference metric eligibility, NDVI, tiny and one-dimensional rasters, NoData at interpolation boundaries, all-cloud inputs, missing temporal coverage, invalid class masks and empty AOI intersections. The NoData-boundary regression is fixed by ignoring zero-weight neighbors and snapping numerically equivalent pixel centers.

API cases cover malformed TIFFs and band mappings, invalid dates, invalid polygon/multipolygon coordinates and rings, unsupported models and processing settings, self-references, unauthorized access, cross-origin writes and inappropriate HTTP methods. Tests also verify password-rotation session revocation, restarting a failed analysis, rejection of corrupt previews or mismatched raster grids, refusal to complete missing/invalid products and protection against overwriting completed results.

Python tests use the real FastAPI application against isolated SQLite fixtures. Queue dispatch is replaced during tests, while the processing function runs synchronously on generated georeferenced rasters. Cases include temporal reconstruction, clear-pixel preservation, COG metadata, mask-band mapping, withheld temporal-reference metrics, invalid-mask failure, reprojection, ownership, single-use password resets, paired-raster preparation and model registration. Small CPU training runs exercise all four neural architectures and checkpoint loading.

These are functional tests using explicitly generated fixtures. They are **not** accuracy measurements on licensed LISS-IV imagery, and they do not establish perfect reconstruction of unseen land.

## Reproduce

From the project root, after dependency installation:

```bash
npm run test:frontend
npm run typecheck
npm run verify
npm run verify:access
npm run verify:personal
npm run build:next
npm run verify:personal -- --production
```

For Python, install the development requirements and CPU PyTorch as described in `SETUP.md`, then run `.venv/bin/python -m pytest -q` (or the Windows virtual-environment equivalent).

## Limits of this validation

- Docker image/container startup and live PostgreSQL/PostGIS + Redis/Celery integration were not executed. The frontend Docker paths and CommonJS entrypoint were corrected to match the locally verified standalone output.
- No live SMTP delivery, GPU execution, trained LISS-IV checkpoint, benchmark evaluation or deployed Python processing was verified.
- External map, geocoding and catalogue providers can be unavailable or rate limited. They are not required for local reconstruction of uploaded imagery.
- Authenticated browser click-through, mobile layout and browser-specific memory limits were not exhaustively tested. The HTTP workflow does not replace those checks.
- Dependency deprecation warnings from Starlette/httpx and Rasterio remain; the Python tests pass with them.

For operational startup, backups and the old `personal_limits` error, see `START-HERE.md` in the project root.
