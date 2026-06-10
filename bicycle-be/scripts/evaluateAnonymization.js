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

const csvPath        = args.get('--csv')          || path.join(process.cwd(), '202401-citibike-tripdata.csv');
const maxRows        = parseInt(args.get('--maxRows') || '5000', 10);
const sampleSizes    = (args.get('--sampleSizes') || `${maxRows}`)
  .split(',').map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v) && v > 0);
const gridSize       = parseFloat(args.get('--gridSize') || '0.01');
const kValues        = (args.get('--k')            || '5,10,20').split(',').map((v) => parseInt(v, 10));
const temporalValues = (args.get('--temporal')     || 'none,period,hour').split(',');
const methodValues   = (args.get('--methods')      || 'merge-nearest,suppression-baseline,fixed-grid-baseline').split(',');
const outputDir      = args.get('--outputDir')     || path.join(process.cwd(), 'evaluation-results');

// --lValues=1,2,3,4   (1 = k-only, acts as baseline)
// --sensitiveAttrs=member_casual,destination_area
// When lValues contains values >1 the script adds dedicated ℓ-diversity runs
// for merge-nearest only, using temporal=none and the full sampleSize range.
const lValues          = (args.get('--lValues')       || '1,2,3').split(',').map((v) => parseInt(v, 10));
const sensitiveAttrs   = (args.get('--sensitiveAttrs') || 'member_casual,destination_area').split(',');

// --epsilonValues=Infinity,10,5,2,1,0.5
// Infinity = no noise (baseline). Finite values apply Laplace noise.
const epsilonValues    = (args.get('--epsilonValues')  || 'Infinity,10,5,2,1')
  .split(',')
  .map((v) => (v === 'Infinity' || v === 'inf' ? Infinity : parseFloat(v)))
  .filter((v) => Number.isFinite(v) || v === Infinity);


const columnAliases = {
  ride_id:       ['ride_id', 'ride id', 'trip_id', 'trip id', 'id', 'rental_id', 'rental id'],
  started_at:    ['started_at', 'started at', 'start_time', 'start time', 'started', 'start_date', 'start date', 'starttime', 'start_time_local'],
  start_lat:     ['start_lat', 'start lat', 'start_latitude', 'start latitude', 'from_lat', 'from latitude', 'start station latitude', 'start_station_latitude'],
  start_lng:     ['start_lng', 'start lng', 'start_lon', 'start lon', 'start_longitude', 'start longitude', 'from_lng', 'from longitude', 'from_lon', 'start station longitude', 'start_station_longitude'],
  end_lat:       ['end_lat', 'end lat', 'end_latitude', 'end latitude', 'to_lat', 'to latitude', 'end station latitude', 'end_station_latitude'],
  end_lng:       ['end_lng', 'end lng', 'end_lon', 'end lon', 'end_longitude', 'end longitude', 'to_lng', 'to longitude', 'to_lon', 'end station longitude', 'end_station_longitude'],
  member_casual: ['member_casual', 'member casual', 'user_type', 'usertype', 'customer_type', 'membership_type', 'subscriber_type'],
  rideable_type: ['rideable_type', 'rideable type', 'bike_type', 'bike type', 'vehicle_type', 'type'],
  gender:        ['gender', 'sex'],
  birth_year:    ['birth_year', 'birth year', 'birthyear', 'year_of_birth', 'year of birth'],
};

const normalizeGender = (value) => {
  const text = value?.toString().trim().toLowerCase();
  if (!text) return null;
  if (['1', 'm', 'male'].includes(text)) return 'male';
  if (['2', 'f', 'female'].includes(text)) return 'female';
  if (['0', 'u', 'unknown'].includes(text)) return 'unknown';
  return text;
};

const deriveAgeBand = (birthYearRaw, startedAt) => {
  const birthYear = parseInt(birthYearRaw, 10);
  if (!Number.isInteger(birthYear)) return null;
  const rideYear = startedAt ? new Date(startedAt.replace(' ', 'T')).getFullYear() : NaN;
  if (isNaN(rideYear)) return null;
  const age = rideYear - birthYear;
  if (age < 10 || age > 100) return null;
  if (age < 18) return 'under_18';
  if (age >= 80) return '80_plus';
  const decadeStart = Math.floor(age / 10) * 10;
  return `${decadeStart}-${decadeStart + 9}`;
};

const normalizeColumnName = (value) =>
  value?.replace(/^﻿/, '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

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
        const startedAt = getAliasedValue(row, 'started_at');
        const birthYearRaw = getAliasedValue(row, 'birth_year');
        trips.push({
          ride_id:       getAliasedValue(row, 'ride_id') || `benchmark-${trips.length + 1}`,
          started_at:    startedAt,
          start_lat:     getAliasedValue(row, 'start_lat'),
          start_lng:     getAliasedValue(row, 'start_lng'),
          end_lat:       getAliasedValue(row, 'end_lat'),
          end_lng:       getAliasedValue(row, 'end_lng'),
          member_casual: getAliasedValue(row, 'member_casual'),
          rideable_type: getAliasedValue(row, 'rideable_type'),
          gender:        normalizeGender(getAliasedValue(row, 'gender')),
          birth_year:    birthYearRaw ? parseInt(birthYearRaw, 10) : null,
          age_band:      deriveAgeBand(birthYearRaw, startedAt),
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

  const timestamp    = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath     = path.join(outputDir, `anonymization-benchmark-${timestamp}.json`);
  const csvPathOut   = path.join(outputDir, `anonymization-benchmark-${timestamp}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

  const columns = Array.from(
    payload.results.reduce((keys, row) => {
      Object.keys(row).forEach((key) => keys.add(key));
      return keys;
    }, new Set())
  );
  const csvRows = [
    columns.join(','),
    ...payload.results.map((row) => columns.map((col) => csvEscape(row[col])).join(',')),
  ];
  fs.writeFileSync(csvPathOut, csvRows.join('\n'));

  return { jsonPath, csvPath: csvPathOut };
};


const methods = {
  'merge-nearest':        applyKAnonymity,
  'suppression-baseline': applySuppressionBaseline,
  'fixed-grid-baseline':  applyFixedGridBaseline,
};


const main = async () => {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const trips  = await readTrips();
  const results = [];

  for (const sampleSize of sampleSizes) {
    const sample = trips.slice(0, sampleSize);

    for (const temporalGranularity of temporalValues) {
      for (const k of kValues) {
        for (const method of methodValues) {
          const anonymizer = methods[method];
          if (!anonymizer) throw new Error(`Unknown method: ${method}`);

          const started = performance.now();
          const result  = await anonymizer(sample, k, { gridSize, temporalGranularity });
          const durationMs = performance.now() - started;

          results.push({
            runType: 'k-anonymity',
            sampleSize, method, k,
            l: 1, sensitiveAttr: 'none',
            epsilon: null,
            gridSize, temporalGranularity,
            status: result.status,
            durationMs: Number(durationMs.toFixed(2)),
            ...(result.metrics || {}),
          });
        }
      }
    }
  }

  const lDiversityRuns = lValues.filter((l) => l >= 2);
  if (lDiversityRuns.length > 0) {
    console.log(`\n→ Running ℓ-diversity sweep: l=${lDiversityRuns.join(',')} × attr=${sensitiveAttrs.join(',')}`);

    for (const sampleSize of sampleSizes) {
      const sample = trips.slice(0, sampleSize);

      for (const k of kValues) {
        for (const l of lDiversityRuns) {
          for (const sensitiveAttr of sensitiveAttrs) {
            const started = performance.now();
            const result  = await applyKAnonymity(sample, k, {
              gridSize,
              temporalGranularity: 'none',
              l,
              sensitiveAttr,
            });
            const durationMs = performance.now() - started;

            results.push({
              runType: 'l-diversity',
              sampleSize,
              method: 'merge-nearest',
              k, l, sensitiveAttr,
              epsilon: null,
              gridSize,
              temporalGranularity: 'none',
              status: result.status,
              durationMs: Number(durationMs.toFixed(2)),
              ...(result.metrics || {}),
            });
          }
        }
      }
    }
  }

  const dpRuns = epsilonValues.filter((e) => Number.isFinite(e));
  if (dpRuns.length > 0) {
    console.log(`\n→ Running ε-DP sweep: ε=${dpRuns.join(',')} × k=${kValues.join(',')}`);

    for (const sampleSize of sampleSizes) {
      const sample = trips.slice(0, sampleSize);

      for (const k of kValues) {
        for (const epsilon of dpRuns) {
          const started = performance.now();
          const result  = await applyKAnonymity(sample, k, {
            gridSize,
            temporalGranularity: 'none',
            l: 1,
            sensitiveAttr: 'none',
            epsilon,
          });
          const durationMs = performance.now() - started;

          results.push({
            runType: 'epsilon-dp',
            sampleSize,
            method: 'merge-nearest',
            k, l: 1, sensitiveAttr: 'none',
            epsilon,
            gridSize,
            temporalGranularity: 'none',
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
    lValues,
    sensitiveAttrs,
    epsilonValues: epsilonValues.map((e) => (Number.isFinite(e) ? e : 'Infinity')),
    gridSize,
    supportedColumnAliases: columnAliases,
    results,
  };

  const outputFiles = writeResults(payload);
  console.table(results.map(({ runType, method, sampleSize, k, l, sensitiveAttr, epsilon, status, suppressedRecords, avgSpatialErrorKm, avgCentroidDisplacementKm }) =>
    ({ runType, method, sampleSize, k, l, sensitiveAttr, epsilon, status, suppressedRecords, avgSpatialErrorKm, avgCentroidDisplacementKm })
  ));
  console.log(JSON.stringify({ ...payload, outputFiles }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
