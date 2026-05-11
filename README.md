# Mobility Privacy Demonstrator

This project is a full-stack React, Express, and MySQL demonstrator for exploring explainable k-anonymity on mobility trip data. It compares original trip records with anonymized spatial-temporal releases and reports privacy/utility metrics such as k-violations, suppression, spatial error, density similarity, and hotspot overlap.

The project supports:

- Original vs anonymized map comparison.
- Spatial and spatial-temporal k-anonymity.
- Multi-k comparison for k=5, k=10, and k=20.
- Upload of Citi Bike-style or similar mobility CSV files.
- Global latitude/longitude validation instead of NYC-only uploads.
- Streaming chunk import for larger CSV uploads.
- Light/dark UI themes for demos and screenshots.
- Benchmark scripts and paper-ready report/figure generation.
- Suppression-only baseline comparison against the merge-nearest anonymization method.

## Reproducibility

For setup, Laragon/MySQL instructions, database creation, data import, benchmark commands, report generation, and known limitations, see:

[REPRODUCIBILITY.md](./REPRODUCIBILITY.md)

That guide is the primary source of truth for reproducing the current version of the project.

## Quick Start

```bash
npm install
cd bicycle-be
npm install
cd ..
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:5000
```

## Important Paths

| Path | Purpose |
| --- | --- |
| `src/components/Map/MapCompare.jsx` | Main comparison UI |
| `src/components/Upload/CSVUpload.jsx` | CSV upload/data-source UI |
| `src/pages/Guide.jsx` | In-app user guide |
| `bicycle-be/routes/bicycleRoute.js` | Trip/anonymization API routes |
| `bicycle-be/routes/uploadRoute.js` | Streaming CSV upload API |
| `bicycle-be/services/anonymization.js` | k-anonymity and baseline methods |
| `bicycle-be/scripts/evaluateAnonymization.js` | Offline anonymization benchmark |
| `bicycle-be/scripts/generateBenchmarkReport.js` | Paper report/figure generation |
| `bicycle-be/db/create-trips-table.sql` | Clean MySQL schema setup |
| `bicycle-be/db/performance-indexes.sql` | Live query performance indexes |
| `bicycle-be/paper-results/` | Generated paper-facing reports and figures |

## Verification

```bash
npm run build
cd bicycle-be
npm run benchmark:anonymization
npm run report:benchmark
npm run benchmark:db
npm run report:db
```

On managed Windows laptops, `npm run build` may need to be run in a normal terminal if a sandbox blocks the esbuild worker process.
