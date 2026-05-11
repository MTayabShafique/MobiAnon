# Database Query Benchmark

Source: `db-query-benchmark-2026-05-11T19-44-58-432Z.json`

Filters: date `2024-01-01`, member type `member`, data source `preloaded`, bounds `40.477399,-74.25909` to `40.917577,-73.700272`.

Indexes present: `PRIMARY`, `ride_id`, `idx_is_user_uploaded`, `idx_trips_source_date_member_bounds`, `idx_trips_source_bounds`, `idx_trips_started_at`, `idx_trips_source_member_date_bounds`

| Limit | Runs | Rows returned | Avg DB query ms | Min-max DB query ms | EXPLAIN key | EXPLAIN rows | EXPLAIN extra |
| ---: | ---: | ---: | ---: | --- | --- | ---: | --- |
| 500 | 3 | 500 | 116.36 | 109.05-120.90 | idx_trips_source_member_date_bounds | 67518 | Using index condition; Using MRR |
| 1000 | 3 | 1000 | 125.65 | 110.32-143.74 | idx_trips_source_member_date_bounds | 67518 | Using index condition; Using MRR |
| 2500 | 3 | 2500 | 159.53 | 107.12-223.04 | idx_trips_source_member_date_bounds | 67518 | Using index condition; Using MRR |
| 5000 | 3 | 5000 | 168.56 | 126.70-247.52 | idx_trips_source_member_date_bounds | 67518 | Using index condition; Using MRR |

## Interpretation

The live backend now reports database latency separately from anonymization latency, so app demos can distinguish storage/query scalability from the k-anonymity algorithm runtime. The preferred query plan uses `idx_trips_source_member_date_bounds`, which matches the common filter order: data source, member type, date range, then map bounds.
