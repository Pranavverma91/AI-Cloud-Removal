# SPACE-EYE

AI-based satellite imagery analysis & environmental monitoring platform — a final-year B.Tech CSE project.

SPACE-EYE lets a user upload a satellite image and get back:

- **Crop health** — a vegetation-index breakdown into healthy / moderate / stressed
- **Water body detection** — a highlighted water mask with coverage %
- **Forest & vegetation change** — a before/after comparison with a change map

All analysis is done with classical image processing (OpenCV + NumPy), not trained deep-learning models — deliberately, so every result is explainable and the whole pipeline can be understood, demonstrated, and defended in a viva.

---

## 1. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Recharts, React-Leaflet, Lucide icons |
| Backend | Python, Flask, OpenCV, NumPy, Pillow, ReportLab |
| Auth | JWT (Flask-JWT-Extended) + bcrypt password hashing |
| Database | MySQL (schema provided) — defaults to SQLite for zero-setup local dev |

## 2. Project structure

```
space-eye/
├── backend/
│   ├── app.py                  # Flask app entrypoint
│   ├── config.py
│   ├── requirements.txt
│   ├── models/                 # SQLAlchemy models (User, Analysis)
│   ├── routes/                 # auth, analyze, dashboard, analyses, reports
│   ├── image_processing/       # agriculture.py, water.py, forest.py
│   ├── utils/                  # file handling, PDF report generation
│   └── sample_data/            # synthetic demo-mode images + generator script
├── database/
│   └── schema.sql              # MySQL schema
├── frontend/
│   ├── src/
│   │   ├── pages/              # Landing, Login, Register, Dashboard, Agriculture,
│   │   │                       # Water, Forest, MapPage, History, AnalysisDetail
│   │   ├── components/         # Navbar, Footer, SatelliteHero, ImageDrop, etc.
│   │   ├── services/api.js     # API client
│   │   └── hooks/useAuth.jsx   # auth context
│   └── ...
└── README.md
```

## 3. Running it locally

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate    # optional but recommended
pip install -r requirements.txt
python sample_data/generate_samples.py                 # generates demo-mode images
python app.py                                           # runs on http://127.0.0.1:5000
```

By default the backend uses **SQLite** (`backend/spaceeye.db`) — zero setup required.
To use MySQL instead, create the database from `database/schema.sql` and set an
environment variable before running:

```bash
mysql -u root -p < ../database/schema.sql
export DATABASE_URL="mysql+pymysql://root:yourpassword@localhost/spaceeye"
python app.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev            # runs on http://127.0.0.1:5173, proxies /api to the backend
```

Open `http://127.0.0.1:5173`, register an account, and either upload an image or
click **Try Demo Analysis** on any analysis page.

### Build for production

```bash
cd frontend && npm run build     # outputs static files to frontend/dist/
```

---

## 4. API reference

All endpoints are prefixed `/api`. Authenticated endpoints require
`Authorization: Bearer <token>` (token returned by register/login).

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` → `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` → `{ token, user }` |
| GET | `/auth/profile` | current user |
| POST | `/analyze/agriculture` | multipart: `image` **or** `demo=true`, optional `location_name`, `latitude`, `longitude` |
| POST | `/analyze/water` | same shape as above |
| POST | `/analyze/forest` | multipart: `image_before` + `image_after` **or** `demo=true` |
| GET | `/analyses` | list current user's analyses |
| GET | `/analyses/:id` | single analysis detail |
| GET | `/dashboard/stats` | totals by type + 5 most recent |
| POST | `/reports/generate` | `{ analysis_id }` → `{ report_url }` |
| GET | `/reports/download/:filename` | streams the generated PDF |

All error responses are `{ "error": "human-readable message" }` with an appropriate
HTTP status code (400 bad input, 401 unauthorized, 404 not found, 413 file too large,
500 server error).

---

## 5. How the analysis actually works

Real NDVI needs a near-infrared band, which a normal RGB satellite crop doesn't have.
Each module uses an honestly-documented **RGB-only approximation** instead:

- **Agriculture** — pseudo-vegetation index `VI = (G − R) / (G + R)`, thresholded into
  healthy / moderate / stressed, visualized as a green/yellow/red overlay.
- **Water** — a blue/red proxy index combined with a brightness check, cleaned up with
  morphological opening/closing to remove speckle noise.
- **Forest change** — the same vegetation index computed on two images of the same
  location, then differenced and thresholded into loss / gain / stable.

This is intentionally simple — no training data, no GPU, nothing that can't be
explained line-by-line — and the UI/PDF reports say so explicitly via a disclaimer.
It is **not** a substitute for calibrated multispectral remote sensing.

## 6. Demo mode

Since real satellite imagery may not be on hand, `backend/sample_data/generate_samples.py`
synthesizes three sample images (a patchwork field, a river+lake scene, and a
before/after forest-clearing pair) so every module can be demonstrated end-to-end
without any upload. Demo results are clearly labeled **"DEMONSTRATION DATA"** in the UI
and PDF reports.

## 7. Database

See `database/schema.sql` for the full MySQL schema. Core tables:

- **users** — account + hashed password
- **analyses** — one row per analysis run (type, location, image paths, summary)
- **analysis_results** — wide queryable metric columns + full JSON blob
- **reports** — generated PDF records
- **locations** — optional reusable named locations

```
users (1) ──< analyses (1) ──< analysis_results
                    │
                    └──< reports
locations (1) ──< analyses   (optional link)
```

## 8. Architecture

```
React (Vite) ── fetch/multipart ──▶ Flask REST API ──▶ OpenCV/NumPy pipelines
     │                                    │
     ▼                                    ▼
 Recharts / Leaflet UI              SQLAlchemy ──▶ MySQL (or SQLite in dev)
                                          │
                                          ▼
                                    ReportLab (PDF reports)
```

## 9. Limitations & future scope

**Limitations:** RGB-only vegetation proxies instead of true multispectral NDVI/NDWI;
thresholds are fixed constants rather than calibrated per-region; no real-time satellite
feed integration; single-image (not time-series) analysis per request.

**Future scope:** ingest real Sentinel-2 multispectral bands for true NDVI/NDWI; add a
lightweight trained classifier as an optional upgrade path; time-series trend charts per
location; role-based accounts for institutional use; scheduled/recurring monitoring for a
saved location.

## 10. Common viva questions

**Q: Why not use a deep learning model?**
A: The brief calls for something a single student can build, explain, and defend without
needing training data, GPUs, or a black-box model. Classical image processing keeps every
number traceable to a formula.

**Q: How is this different from real NDVI?**
A: Real NDVI uses a near-infrared band. We approximate the same "healthy vegetation
reflects more, absorbs less red" idea using green/red channels from ordinary RGB imagery
— a documented simplification, not a claim of scientific equivalence.

**Q: How would you make this production-grade?**
A: Swap in a Sentinel-2/Landsat ingestion pipeline for real multispectral bands, add
per-region calibrated thresholds, move file storage to object storage (S3-compatible),
and put the Flask app behind a production WSGI server (gunicorn) with the MySQL schema
provided.

**Q: Why JWT instead of sessions?**
A: The frontend and backend are decoupled (separate dev servers, different ports), so a
stateless bearer token avoids cross-origin cookie complications during development.

---

**Disclaimer:** SPACE-EYE is a student research project for academic demonstration.
Results come from simplified, RGB-based image-processing heuristics, not calibrated
sensors or agronomic/hydrological models, and must not be used for real agricultural,
hydrological, environmental, or commercial decisions.
