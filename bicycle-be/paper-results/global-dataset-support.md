# Larger and Global Dataset Support

This note documents the changes that make the demonstrator less dependent on the January 2024 Citi Bike sample.

## Supported Dataset Shape

The internal schema remains a normalized trip schema:

| Internal field | Required | Meaning |
| --- | --- | --- |
| `started_at` | yes | Trip start timestamp |
| `ended_at` | yes | Trip end timestamp |
| `start_lat` | yes | Start latitude |
| `start_lng` | yes | Start longitude |
| `end_lat` | yes | End latitude |
| `end_lng` | yes | End longitude |
| `ride_id` | no | Trip identifier; generated if missing |
| `rideable_type` | no | Vehicle/bike type |
| `start_station_name` | no | Start station/place label |
| `end_station_name` | no | End station/place label |
| `member_casual` | no | User category; defaults to `unknown` |

The upload path now accepts common aliases such as `start_time`, `end_time`, `start_latitude`, `start_lon`, `end_latitude`, `end_lon`, `from_station_name`, and `to_station_name`. This keeps the database schema stable while allowing similar bike-share or mobility datasets to be imported.

## Geographic Scope

The previous upload validation rejected coordinates outside New York City. The new validation accepts any valid latitude/longitude pair:

- latitude between `-90` and `90`
- longitude between `-180` and `180`

The frontend fetches stored bounds for preloaded and user-uploaded data from `/api/upload/data-sources`. When the selected source changes, the map recenters to that source's actual coordinate range. This allows uploaded datasets from other cities to be visualized without editing code.

## Larger Files

The CSV upload limit is increased from 10 MB to 250 MB. The upload route now uses bounded-memory streaming import: rows are parsed, validated, mapped into the normalized trip schema, and inserted into MySQL in chunks while the file is still being read. The server no longer stores the full set of valid rows in memory before insertion.

This makes larger monthly exports and moderate multi-month files more realistic on a laptop setup. Very large full-year files may still benefit from direct database import or an offline command-line importer, but the web upload path is no longer limited by holding the entire valid dataset in RAM.

For algorithm evaluation, `scripts/evaluateAnonymization.js` also supports the same common aliases for start time and start coordinates. This allows benchmark runs on non-Citi-Bike CSV files using:

```bash
npm run evaluate:anonymization -- --csv=path/to/other-city.csv --sampleSizes=1000,5000,25000 --k=5,10,20 --temporal=none,period,hour
```

## Remaining Work

The app now supports comparable mobility CSVs, but it is still optimized for trip records with point-to-point coordinates. Datasets containing only station IDs, zones, trajectories, or GPS traces need a preprocessing step to convert them into the normalized start/end coordinate schema. For production-scale full-year imports, a background job queue with progress reporting would be the next infrastructure improvement.
