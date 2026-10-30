# Developer handover

Start with the root README, then read SETUP, ARCHITECTURE and TRAINING in this folder. The UI and research backend are separately deployable. Root compatibility symlinks support the preserved Sites build; source lives in `frontend/`. Do not merge the old hosted D1 account boundary into research PostgreSQL sessions without an explicit migration design.

## Start and validate

Copy `.env.example`, start the Compose stack or native services, apply the migration and create a research account. Keep the API and worker on the same shared data paths. Upload a real small GeoTIFF and a known mask, process a baseline, inspect clear-pixel preservation and export metadata. Then run the documented automated checks. Avoid manufacturing a successful UI state when a provider, queue or trained model is unavailable.

## Where to make changes

- Add research endpoints in `backend/app/routers/science.py`; preserve the owner check before opening a file.
- Change inference in `backend/app/services/pipeline.py` and `ai/`; extend numerical tests when a scientific invariant changes.
- Change database structure through a new Alembic revision. Never silently alter the frozen initial migration on an existing deployment.
- Add frontend research interactions in `frontend/components/science/`; keep the fixed-origin server proxy and private caching policy.
- Register weights using `scripts/register_model.py`, not a browser file upload. Models without validated checkpoints must stay unavailable.
- Keep `/workspace` and its original `/api/satellite/*` / D1/R2 behavior compatible; `pnpm verify` and `pnpm verify:access` cover it.

## Operational responsibilities

Back up database, inputs, outputs and registered weights together. Protect SMTP/database secrets; preserve HTTPS secure cookies and exact allowed origins. Monitor disk, queue depth and worker failures. There is no automated retention policy, account deletion workflow, multi-user project sharing or job cancellation. Operator-only registry access is intentionally a CLI operation.

The training code saves actual history and final-epoch weights. Complete a proper held-out LISS-IV study before describing any model as accurate, validated or production ready. The published interface does not imply the separate Python service has been provisioned.
