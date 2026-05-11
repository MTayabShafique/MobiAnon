import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { pool } from '../db/dbConfig.js';
import { queryTripsInBounds } from '../services/bicycleTrips.js';

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => arg.split('='))
    .filter(([key, value]) => key && value)
);

const outputDir = args.get('--outputDir') || path.join(process.cwd(), 'evaluation-results');
const limits = (args.get('--limits') || '500,1000,2500,5000')
  .split(',')
  .map((value) => parseInt(value, 10))
  .filter((value) => Number.isFinite(value) && value > 0);
const repeats = parseInt(args.get('--repeats') || '3', 10);

const filters = {
  date: args.get('--date') || '2024-01-01',
  memberType: args.get('--memberType') || 'member',
  dataSource: args.get('--dataSource') || 'preloaded',
  bounds: {
    minLat: parseFloat(args.get('--minLat') || '40.477399'),
    maxLat: parseFloat(args.get('--maxLat') || '40.917577'),
    minLng: parseFloat(args.get('--minLng') || '-74.25909'),
    maxLng: parseFloat(args.get('--maxLng') || '-73.700272'),
  },
};

const csvEscape = (value) => {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const writeCsv = (filePath, rows) => {
  const columns = Object.keys(rows[0] || {});
  const csvRows = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ];
  fs.writeFileSync(filePath, csvRows.join('\n'));
};

const getIndexInfo = async () => {
  const [indexes] = await pool.query('SHOW INDEX FROM trips');
  return indexes.map((index) => ({
    keyName: index.Key_name,
    columnName: index.Column_name,
    seqInIndex: index.Seq_in_index,
    nonUnique: index.Non_unique,
  }));
};

const getExplain = async (query) => {
  const [explainRows] = await pool.query(`EXPLAIN ${query.sql}`, query.params);
  return explainRows;
};

const main = async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const results = [];
  const explainPlans = [];
  const indexes = await getIndexInfo();

  for (const limit of limits) {
    let lastQuery = null;

    for (let run = 1; run <= repeats; run++) {
      const started = performance.now();
      const result = await queryTripsInBounds(
        { ...filters, limit },
        { anonymizationOnly: true, limit }
      );
      const totalMs = performance.now() - started;
      lastQuery = result.query;

      results.push({
        limit,
        run,
        status: result.status,
        rowCount: result.metrics.rowCount,
        dbQueryMs: result.metrics.dbQueryMs,
        totalServiceMs: Number(totalMs.toFixed(2)),
      });
    }

    if (lastQuery) {
      explainPlans.push({
        limit,
        explain: await getExplain(lastQuery),
      });
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `db-query-benchmark-${timestamp}.json`);
  const csvPath = path.join(outputDir, `db-query-benchmark-${timestamp}.csv`);

  const payload = {
    filters,
    limits,
    repeats,
    indexes,
    results,
    explainPlans,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeCsv(csvPath, results);

  console.table(results);
  console.log(JSON.stringify({ outputFiles: { jsonPath, csvPath }, indexes }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
