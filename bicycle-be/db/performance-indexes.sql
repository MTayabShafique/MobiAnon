-- Performance indexes for live map and anonymization queries.
--
-- These queries filter by:
--   started_at BETWEEN ...        (preloaded data)
--   is_user_uploaded = ...
--   member_casual = ...
--   start_lat BETWEEN ...
--   start_lng BETWEEN ...
--
-- Run each SHOW INDEX check first if your MySQL version does not support
-- idempotent index creation. If an index already exists, skip its CREATE line.

-- Primary live-map query path: source and member are equality filters, then date
-- and spatial bounds are ranges.
CREATE INDEX idx_trips_source_member_date_bounds
ON trips (is_user_uploaded, member_casual, started_at, start_lat, start_lng);

-- Useful fallback for preloaded queries without a member filter.
CREATE INDEX idx_trips_source_date_member_bounds
ON trips (is_user_uploaded, started_at, member_casual, start_lat, start_lng);

-- Useful path for user-uploaded data, where there is usually no date filter.
CREATE INDEX idx_trips_source_bounds
ON trips (is_user_uploaded, start_lat, start_lng);

CREATE INDEX idx_trips_started_at
ON trips (started_at);

-- Useful checks:
-- SHOW INDEX FROM trips;
-- EXPLAIN SELECT ride_id, started_at, start_lat, start_lng
-- FROM trips
-- WHERE started_at BETWEEN '2024-01-01 00:00:00' AND '2024-01-01 23:59:59'
--   AND start_lat BETWEEN 40.477399 AND 40.917577
--   AND start_lng BETWEEN -74.25909 AND -73.700272
--   AND is_user_uploaded = 0
--   AND member_casual = 'member'
-- LIMIT 500;
