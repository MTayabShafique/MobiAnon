import { pool } from '../db/dbConfig.js';

const indexes = [
  {
    name: 'idx_trips_source_member_date_bounds',
    sql: `
      CREATE INDEX idx_trips_source_member_date_bounds
      ON trips (is_user_uploaded, member_casual, started_at, start_lat, start_lng)
    `,
  },
  {
    name: 'idx_trips_source_date_member_bounds',
    sql: `
      CREATE INDEX idx_trips_source_date_member_bounds
      ON trips (is_user_uploaded, started_at, member_casual, start_lat, start_lng)
    `,
  },
  {
    name: 'idx_trips_source_bounds',
    sql: `
      CREATE INDEX idx_trips_source_bounds
      ON trips (is_user_uploaded, start_lat, start_lng)
    `,
  },
  {
    name: 'idx_trips_started_at',
    sql: `
      CREATE INDEX idx_trips_started_at
      ON trips (started_at)
    `,
  },
];

const indexExists = async (connection, indexName) => {
  const [rows] = await connection.execute(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'trips'
        AND index_name = ?
    `,
    [indexName]
  );

  return rows[0].count > 0;
};

const main = async () => {
  const connection = await pool.getConnection();

  try {
    for (const index of indexes) {
      if (await indexExists(connection, index.name)) {
        console.log(`Index already exists: ${index.name}`);
        continue;
      }

      console.log(`Creating index: ${index.name}`);
      await connection.query(index.sql);
      console.log(`Created index: ${index.name}`);
    }

    console.log('Refreshing table statistics: trips');
    await connection.query('ANALYZE TABLE trips');
  } finally {
    connection.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error('Failed to apply performance indexes:', error);
  process.exitCode = 1;
});
