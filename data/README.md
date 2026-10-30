# Research data

No observations, trained weights, account data or model scores are included.

Runtime directories are ignored by git: `storage/` (uploads and outputs), `checkpoints/` (registered weights), `patches/` (prepared datasets) and `runs/` (training history). Back up storage and checkpoints together with PostgreSQL. The API and worker must share the same absolute paths. Docker Compose mounts the `research-data` volume at `/app/data` in both services.

Test fixtures are generated in temporary directories and are never inserted into the application dashboard.
