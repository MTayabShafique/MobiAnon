import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { performance } from 'perf_hooks';
import { applyKAnonymity, applySuppressionBaseline, applyFixedGridBaseline } from '../services/anonymization.js';

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => arg.split('='))
    .filter(([key, value]) => key && value)
);

const csvPath = args.get('--csv') || path.join(process.cwd(), '202401-citibike-tripdata.csv');
const maxRows = parseInt(args.get('--maxRows') || '5000', 10);
const sampleSizes = (args.get('--sampleSizes') || `${maxRows}`)
  .split(',')
  .map((value) => parseInt(value, 10))
  .filter((value) => Number.isFinite(value) && value > 0);
const gridSize = parseFloat(args.get('--gridSize') || '0.01');
const kValues = (args.get('--k') || '5,10,20').split(',').map((value) => parseInt(value, 10));
const temporalValues = (args.get('--temporal') || 'none,period,hour').split(',');
const methodValues = (args.get('--methods') || 'merge-nearest,suppression-baseline,fixed-grid-baseline').split(',');
const outputDir = args.get('--outputDir') || path.join(process.cwd(), 'evaluation-results');

const methods = {
  'merge-nearest': applyKAnonymity,
  'suppression-baseline': applySuppressionBaseline,
  'fixed-grid-baseline': applyFixedGridBaseline,
};

const columnAliases = {
  ride_id: ['ride_id', 'ride id', 'trip_id', 'trip id', 'id', 'rental_id', 'rental id'],
  started_at: ['started_at', 'started at', 'start_time', 'start time', 'started', 'start_date', 'start date', 'starttime', 'start_time_local'],
  start_lat: ['start_lat', 'start lat', 'start_latitude', 'start latitude', 'from_lat', 'from latitude', 'start station latitude', 'start_station_latitude'],
  start_lng: ['start_lng', 'start lng', 'start_lon', 'start lon', 'start_longitude', 'start longitude', 'from_lng', 'from longitude', 'from_lon', 'start station longitude', 'start_station_longitude'],
};

const normalizeColumnName = (value) =>
  value
    ?.replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const getAliasedValue = (row, field) => {
  const normalizedRow = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeColumnName(key), value])
  );
  const alias = columnAliases[field].find((candidate) =>
    Object.prototype.hasOwnProperty.call(normalizedRow, normalizeColumnName(candidate))
  );
  return alias ? normalizedRow[normalizeColumnName(alias)] : undefined;
};

const readTrips = async () => {
  const trips = [];
  const rowLimit = Math.max(...sampleSizes);

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csvParser())
      .on('data', (row) => {
        if (trips.length >= rowLimit) return;
        trips.push({
          ride_id: getAliasedValue(row, 'ride_id') || `benchmark-${trips.length + 1}`,
          started_at: getAliasedValue(row, 'started_at'),
          start_lat: getAliasedValue(row, 'start_lat'),
          start_lng: getAliasedValue(row, 'start_lng'),
        });
      })
      .on('end', resolve)
      .on('error', reject);
  });

  return trips;
};

const csvEscape = (value) => {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const writeResults = (payload) => {
  fs.mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `anonymization-benchmark-${timestamp}.json`);
  const csvPathOut = path.join(outputDir, `anonymization-benchmark-${timestamp}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const columns = Array.from(
    payload.results.reduce((keys, row) => {
      Object.keys(row).forEach((key) => keys.add(key));
      return keys;
    }, new Set())
  );
  const csvRows = [
    columns.join(','),
    ...payload.results.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ];
  fs.writeFileSync(csvPathOut, csvRows.join('\n'));

  return { jsonPath, csvPath: csvPathOut };
};

const main = async () => {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const trips = await readTrips();
  const results = [];

  for (const sampleSize of sampleSizes) {
    const sample = trips.slice(0, sampleSize);

    for (const temporalGranularity of temporalValues) {
      for (const k of kValues) {
        for (const method of methodValues) {
          const anonymizer = methods[method];
          if (!anonymizer) {
            throw new Error(`Unknown anonymization method: ${method}`);
          }

          const started = performance.now();
          const result = await anonymizer(sample, k, { gridSize, temporalGranularity });
          const durationMs = performance.now() - started;

          results.push({
            sampleSize,
            method,
            k,
            gridSize,
            temporalGranularity,
            status: result.status,
            durationMs: Number(durationMs.toFixed(2)),
            ...(result.metrics || {}),
          });
        }
      }
    }
  }

  const payload = {
    csvPath,
    loadedRows: trips.length,
    sampleSizes,
    kValues,
    temporalValues,
    methodValues,
    gridSize,
    supportedColumnAliases: columnAliases,
    results,
  };
  const outputFiles = writeResults(payload);

  console.table(results);
  console.log(JSON.stringify({ ...payload, outputFiles }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
