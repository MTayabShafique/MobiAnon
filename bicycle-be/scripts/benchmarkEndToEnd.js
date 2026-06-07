/**
 * End-to-end latency benchmark (L5/L6).
 *
 * The algorithm benchmark (evaluateAnonymization.js) measures anonymization
 * runtime against in-memory CSV samples.  The DB benchmark (benchmarkDbQueries.js)
 * measures raw MySQL query latency.  Neither captures the full request path.
 *
 * This script measures the combined pipeline that the live API actually executes:
 *   DB query → anonymization → metric computation
 *
 * It reuses getAnonymizedTripsInBounds from bicycleTrips.js so the timing is
 * identical to what a real API request would see.
 *
 * Usage:
 *   node scripts/benchmarkEndToEnd.js \
 *     [--k=5,10,20] \
 *     [--temporal=none,period,hour] \
 *     [--gridSize=0.01] \
 *     [--limits=500,1000,2500] \
 *     [--repeats=3] \
 *     [--date=2024-01-15] \
 *     [--memberType=all] \
 *     [--dataSource=preloaded] \
 *     [--minLat=40.477399] [--maxLat=40.917577] \
 *     [--minLng=-74.25909] [--maxLng=-73.700272] \
 *     [--outputDir=evaluation-results]
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { pool } from '../db/dbConfig.js';
import { getAnonymizedTripsInBounds } from '../services/bicycleTrips.js';

// CLI argument parsing
const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => {
      const eqIdx = arg.indexOf('=');
      return eqIdx === -1 ? [arg, 'true'] : [arg.slice(0, eqIdx), arg.slice(eqIdx + 1)];
    })
    .filter(([key]) => key.startsWith('--'))
);

const kValues = (args.get('--k') || '5,10,20')
  .split(',')
  .map((v) => parseInt(v, 10))
  .filter((v) => Number.isFinite(v) && v > 0);

const temporalValues = (args.get('--temporal') || 'none,period,hour').split(',');

const gridSize = parseFloat(args.get('--gridSize') || '0.01');

const limits = (args.get('--limits') || '500,1000,2500')
  .split(',')
  .map((v) => parseInt(v, 10))
  .filter((v) => Number.isFinite(v) && v > 0);

const repeats = Math.max(1, parseInt(args.get('--repeats') || '3', 10));

const outputDir = args.get('--outputDir') || path.join(process.cwd(), 'evaluation-results');

const baseFilters = {
  date: args.get('--date') || '2024-01-15',
  memberType: args.get('--memberType') || 'all',
  dataSource: args.get('--dataSource') || 'preloaded',
  bounds: {
    minLat: parseFloat(args.get('--minLat') || '40.477399'),
    maxLat: parseFloat(args.get('--maxLat') || '40.917577'),
    minLng: parseFloat(args.get('--minLng') || '-74.25909'),
    maxLng: parseFloat(args.get('--maxLng') || '-73.700272'),
  },
};

// CSV helpers
const csvEscape = (value) => {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const writeCsv = (filePath, rows) => {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((col) => csvEscape(row[col])).join(',')),
  ];
  fs.writeFileSync(filePath, lines.join('\n'));
};

// Benchmark runner
const main = async () => {
  fs.mkdirSync(outputDir, { recursive: true });

  const results = [];
  const totalConfigs = limits.length * temporalValues.length * kValues.length * repeats;
  let completed = 0;

  console.log(
    `End-to-end benchmark: ${limits.length} limits × ${temporalValues.length} temporal modes × ${kValues.length} k values × ${repeats} repeats = ${totalConfigs} runs\n`
  );

  for (const limit of limits) {
    for (const temporalGranularity of temporalValues) {
      for (const k of kValues) {
        for (let run = 1; run <= repeats; run++) {
          const wallStart = performance.now();

          const result = await getAnonymizedTripsInBounds(
            { ...baseFilters, limit },
            { k, gridSize, temporalGranularity }
          );

          const wallMs = performance.now() - wallStart;
          completed++;

          const row = {
            limit,
            temporalGranularity,
            k,
            gridSize,
            run,
            status: result.status,
            // Timing breakdown
            dbQueryMs: result.metrics?.dbQueryMs ?? null,
            anonymizationMs: result.metrics?.anonymizationMs ?? null,
            totalBackendMs: result.metrics?.totalBackendMs ?? null,
            wallMs: Number(wallMs.toFixed(2)),
            // DB metrics
            dbRowCount: result.metrics?.dbRowCount ?? null,
            queryLimit: result.metrics?.queryLimit ?? null,
            // Privacy/utility metrics
            outputGroups: result.metrics?.outputGroups ?? null,
            releasedRecords: result.metrics?.releasedRecords ?? null,
            suppressedRecords: result.metrics?.suppressedRecords ?? null,
            suppressionRate: result.metrics?.suppressionRate != null
              ? Number(result.metrics.suppressionRate.toFixed(4))
              : null,
            kViolations: result.metrics?.kViolations ?? null,
            avgSpatialErrorKm: result.metrics?.avgSpatialErrorKm != null
              ? Number(result.metrics.avgSpatialErrorKm.toFixed(4))
              : null,
            densityCosineSimilarity: result.metrics?.densityCosineSimilarity != null
              ? Number(result.metrics.densityCosineSimilarity.toFixed(4))
              : null,
            densityJsdSimilarity: result.metrics?.densityJsdSimilarity != null
              ? Number(result.metrics.densityJsdSimilarity.toFixed(4))
              : null,
            top10HotspotOverlap: result.metrics?.top10HotspotOverlap != null
              ? Number(result.metrics.top10HotspotOverlap.toFixed(4))
              : null,
            avgCellsMerged: result.metrics?.avgCellsMerged != null
              ? Number(result.metrics.avgCellsMerged.toFixed(2))
              : null,
          };

          results.push(row);

          process.stdout.write(
            `  [${completed}/${totalConfigs}] limit=${limit} temporal=${temporalGranularity} k=${k} run=${run} → wall=${row.wallMs}ms db=${row.dbQueryMs}ms anon=${row.anonymizationMs}ms (${result.status})\n`
          );
        }
      }
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(outputDir, `e2e-benchmark-${timestamp}.json`);
  const csvPath = path.join(outputDir, `e2e-benchmark-${timestamp}.csv`);

  const payload = {
    timestamp: new Date().toISOString(),
    config: { baseFilters, limits, kValues, temporalValues, gridSize, repeats },
    results,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeCsv(csvPath, results);

  // Summary table: average wall time per (limit, temporal, k) across repeats
  const summaryMap = new Map();
  results.forEach((row) => {
    const key = `${row.limit}|${row.temporalGranularity}|${row.k}`;
    if (!summaryMap.has(key)) summaryMap.set(key, []);
    summaryMap.get(key).push(row);
  });

  const summary = Array.from(summaryMap.entries()).map(([, rows]) => {
    const avg = (field) => {
      const vals = rows.map((r) => r[field]).filter((v) => v !== null);
      return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
    };
    const first = rows[0];
    return {
      limit: first.limit,
      temporal: first.temporalGranularity,
      k: first.k,
      runs: rows.length,
      avgWallMs: avg('wallMs'),
      avgDbMs: avg('dbQueryMs'),
      avgAnonMs: avg('anonymizationMs'),
      avgTotalBackendMs: avg('totalBackendMs'),
      avgSuppressionRate: avg('suppressionRate'),
      avgSpatialErrorKm: avg('avgSpatialErrorKm'),
    };
  });

  console.log('\nSummary (averages across repeats):');
  console.table(summary);
  console.log(`\nJSON → ${jsonPath}`);
  console.log(`CSV  → ${csvPath}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
