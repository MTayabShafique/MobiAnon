# Reproducibility Guide

This guide describes how to reproduce the current mobility privacy demonstrator on a Windows laptop with Laragon/MySQL, run the web app, import data, run benchmarks, and regenerate paper-ready outputs.

## 1. Environment

Tested local setup:

| Component | Expected setup |
| --- | --- |
| OS | Windows |
| Node.js | LTS or current Node with npm |
| Database | MySQL via Laragon |
| Backend | Express on `http://localhost:5000` |
| Frontend | Vite React on `http://localhost:5173` |
| Database name | `bicycle_data` |
| MySQL user | `root` |
| MySQL password | empty by default in Laragon |
| MySQL port | `3306` |

## 2. Install Dependencies

From the repository root:

```bash
npm install
cd bicycle-be
npm install
cd ..
```

## 3. Create the MySQL Database

Start Laragon, then start MySQL.

Open Laragon Terminal or another terminal that can run `mysql`, then run:

```bash
mysql -u root < bicycle-be/db/create-trips-table.sql
```

If your Laragon root account has a password, use:

```bash
mysql -u root -p < bicycle-be/db/create-trips-table.sql
```

Then apply the performance indexes used by the live map/backend benchmark:

```bash
cd bicycle-be
npm run db:indexes
cd ..
```

## 4. Configure Database Connection

For standard Laragon MySQL on Windows, no `.env` changes are usually required because the backend defaults to:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=bicycle_data
```

If your Laragon uses different credentials, set them in `bicycle-be/.env`.

## 5. Load Data

### Option A: Preloaded Citi Bike CSV

Place the January 2024 Citi Bike CSV here:

```text
bicycle-be/202401-citibike-tripdata.csv
```

Then run:

```bash
cd bicycle-be
node dataInsert.js
cd ..
```

The repository excludes this large CSV through `.gitignore`, so another machine must download or copy the file separately.

### Option B: Upload a Mobility CSV in the Web App

Run the app, open the Upload Data page, and upload a CSV.

Supported required fields:

| Field | Required | Notes |
| --- | --- | --- |
| `started_at` | yes | common aliases include `start_time`, `starttime`, `start_date` |
| `ended_at` | yes | common aliases include `end_time`, `stoptime`, `end_date` |
| `start_lat` | yes | common aliases include `start_latitude`, `from_lat` |
| `start_lng` | yes | common aliases include `start_lon`, `start_longitude`, `from_lon` |
| `end_lat` | yes | common aliases include `end_latitude`, `to_lat` |
| `end_lng` | yes | common aliases include `end_lon`, `end_longitude`, `to_lon` |
| `ride_id` | no | generated automatically when missing |

The web importer accepts valid global latitude/longitude coordinates and inserts rows into MySQL using bounded-memory streaming chunks.

## 6. Run the Application

From the repository root:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

The backend runs on:

```text
http://localhost:5000
```

## 7. Verify the Build

From the repository root:

```bash
npm run build
```

On some managed Windows laptops, the sandboxed environment can block the esbuild worker process with `spawn EPERM`. Running the same command in a normal terminal usually works.

The build currently emits a Vite chunk-size warning. This is not a failure; it indicates a future optimization opportunity through route-level code splitting.

## 8. Run Anonymization Benchmarks

From `bicycle-be`:

```bash
npm run benchmark:anonymization
```

This evaluates:

- sample sizes: `1000, 5000, 10000, 25000`
- k values: `5, 10, 20`
- temporal modes: `none, period, hour`
- methods: `merge-nearest, suppression-baseline`

Outputs are written to:

```text
bicycle-be/evaluation-results/
```

To benchmark a different CSV with common mobility headers:

```bash
npm run evaluate:anonymization -- --csv=path/to/other-city.csv --sampleSizes=1000,5000,25000 --k=5,10,20 --temporal=none,period,hour
```

## 9. Generate Paper Figures and Tables

From `bicycle-be`:

```bash
npm run report:benchmark
```

Outputs are written to:

```text
bicycle-be/paper-results/
```

Important generated artifacts:

| File | Purpose |
| --- | --- |
| `benchmark-report.md` | paper-ready benchmark tables, including baseline comparison |
| `runtime-ms.svg` | anonymization runtime plot |
| `suppressed-records.svg` | suppression plot |
| `mean-spatial-error-km.svg` | utility-loss plot |
| `density-similarity.svg` | density preservation plot |
| `top10-hotspot-overlap.svg` | hotspot preservation plot |
| `k-violations.svg` | privacy-validity plot |

## 10. Run Live Database Benchmark

From `bicycle-be`:

```bash
npm run benchmark:db
npm run report:db
```

Outputs:

```text
bicycle-be/evaluation-results/db-query-benchmark-*.json
bicycle-be/evaluation-results/db-query-benchmark-*.csv
bicycle-be/paper-results/db-query-benchmark-report.md
```

The report includes query latency and MySQL `EXPLAIN` information for the live backend query path.

## 11. Reproducibility Checklist

Use this checklist before sharing results:

- MySQL is running in Laragon.
- Database `bicycle_data` exists.
- `trips` table exists.
- Performance indexes have been applied with `npm run db:indexes`.
- Dataset CSV is present or uploaded through the app.
- `npm run build` passes.
- `npm run benchmark:anonymization` completes.
- `npm run report:benchmark` regenerates figures/tables.
- `npm run benchmark:db` and `npm run report:db` complete if reporting live backend performance.

## 12. Known Scope Limits

The app supports point-to-point trip CSVs with start/end timestamps and coordinates. Datasets containing only station IDs, zones, full GPS traces, or trajectories need preprocessing into the normalized trip schema before upload.

The web upload route supports larger files through streaming chunk insertion, but production-scale full-year imports may still benefit from a command-line importer or background job queue with progress reporting.
