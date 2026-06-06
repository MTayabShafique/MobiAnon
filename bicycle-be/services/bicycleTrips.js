import { performance } from 'perf_hooks';
import { pool } from '../db/dbConfig.js';
import { applyKAnonymity } from './anonymization.js';

export { applyKAnonymity };

export const DEFAULT_QUERY_LIMIT = 500;
export const MAX_QUERY_LIMIT = 5000;

export const normalizeLimit = (limit) => {
  const parsed = parseInt(limit, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_QUERY_LIMIT;
  return Math.min(parsed, MAX_QUERY_LIMIT);
};

const buildTripQuery = ({ date, memberType, bounds, dataSource, limit, anonymizationOnly }) => {
  const selectFields = anonymizationOnly
    ? 'start_lat, start_lng, end_lat, end_lng, ride_id, started_at, ended_at, member_casual, rideable_type'
    : `ride_id, rideable_type, started_at, ended_at,
        start_station_name, start_lat, start_lng,
        end_station_name, end_lat, end_lng, member_casual`;

  let sql = `
    SELECT ${selectFields}
    FROM trips
    WHERE start_lat BETWEEN ? AND ?
      AND start_lng BETWEEN ? AND ?
      AND is_user_uploaded = ?
  `;

  const isUserUploaded = dataSource === 'user' ? 1 : 0;
  let params = [
    bounds.minLat,
    bounds.maxLat,
    bounds.minLng,
    bounds.maxLng,
    isUserUploaded,
  ];

  if (dataSource === 'preloaded' && date) {
    sql = sql.replace('WHERE', 'WHERE started_at BETWEEN ? AND ? AND');
    params = [`${date} 00:00:00`, `${date} 23:59:59`, ...params];
  }

  if (memberType && memberType !== 'all') {
    sql += ' AND member_casual = ?';
    params.push(memberType);
  }

  sql += ` LIMIT ${limit}`;

  return { sql, params };
};

export const queryTripsInBounds = async (filters, options = {}) => {
  const limit = normalizeLimit(options.limit ?? filters.limit);
  const query = buildTripQuery({
    ...filters,
    limit,
    anonymizationOnly: options.anonymizationOnly || false,
  });
  let connection;
  const started = performance.now();

  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(query.sql, query.params);
    const queryMs = performance.now() - started;

    return {
      status: 'success',
      rows,
      query,
      metrics: {
        dbQueryMs: Number(queryMs.toFixed(2)),
        rowCount: rows.length,
        limit,
      },
    };
  } catch (error) {
    console.error('Error fetching trips:', error);
    return {
      status: 'error',
      message: 'Failed to fetch trips',
      error: error.message || error,
      rows: [],
      query,
      metrics: {
        dbQueryMs: Number((performance.now() - started).toFixed(2)),
        rowCount: 0,
        limit,
      },
    };
  } finally {
    if (connection) connection.release();
  }
};

export const getTripsInBounds = async (filters) => {
  const result = await queryTripsInBounds(filters);

  if (result.status === 'error') {
    return {
      status: 'error',
      message: result.message,
      error: result.error,
      metrics: result.metrics,
    };
  }

  return {
    status: 'success',
    message: 'Trips fetched successfully',
    data: result.rows,
    metrics: result.metrics,
  };
};

export const getAnonymizedTripsInBounds = async (filters, anonymizationOptions) => {
  const queryResult = await queryTripsInBounds(filters, {
    anonymizationOnly: true,
    limit: filters.limit,
  });

  if (queryResult.status === 'error') {
    return {
      status: 'error',
      message: queryResult.message,
      error: queryResult.error,
      metrics: queryResult.metrics,
    };
  }

  if (queryResult.rows.length < anonymizationOptions.k) {
    return {
      status: 'error',
      message: `Not enough trips (${queryResult.rows.length}) for k=${anonymizationOptions.k}`,
      metrics: queryResult.metrics,
    };
  }

  const anonymizationStarted = performance.now();
  const anonymizedTrips = await applyKAnonymity(queryResult.rows, anonymizationOptions.k, {
    gridSize: anonymizationOptions.gridSize,
    temporalGranularity: anonymizationOptions.temporalGranularity,
    l: anonymizationOptions.l,
    sensitiveAttr: anonymizationOptions.sensitiveAttr,
  });
  const anonymizationMs = performance.now() - anonymizationStarted;

  return {
    ...anonymizedTrips,
    metrics: {
      ...(anonymizedTrips.metrics || {}),
      dbQueryMs: queryResult.metrics.dbQueryMs,
      anonymizationMs: Number(anonymizationMs.toFixed(2)),
      totalBackendMs: Number((queryResult.metrics.dbQueryMs + anonymizationMs).toFixed(2)),
      dbRowCount: queryResult.metrics.rowCount,
      queryLimit: queryResult.metrics.limit,
    },
  };
};
