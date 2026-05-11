import fs from 'fs';
import path from 'path';

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => arg.split('='))
    .filter(([key, value]) => key && value)
);

const inputDir = args.get('--inputDir') || path.join(process.cwd(), 'evaluation-results');
const outputDir = args.get('--outputDir') || path.join(process.cwd(), 'paper-results');
const explicitInput = args.get('--input');

const metricDefinitions = [
  {
    key: 'durationMs',
    label: 'Runtime',
    unit: 'ms',
    file: 'runtime-ms.svg',
    description: 'Backend anonymization runtime by sample size.',
  },
  {
    key: 'suppressedRecords',
    label: 'Suppressed Records',
    unit: 'records',
    file: 'suppressed-records.svg',
    description: 'Rows withheld because no valid k-anonymous group could be released.',
  },
  {
    key: 'avgSpatialErrorKm',
    label: 'Mean Spatial Error',
    unit: 'km',
    file: 'mean-spatial-error-km.svg',
    description: 'Average distance between original start points and released centroids.',
  },
  {
    key: 'densityCosineSimilarity',
    label: 'Density Similarity (Cosine)',
    unit: 'score',
    file: 'density-similarity.svg',
    description: 'Cosine similarity between raw and anonymized grid-cell density distributions.',
  },
  {
    key: 'densityJsdSimilarity',
    label: 'Density Similarity (JSD)',
    unit: 'score',
    file: 'density-jsd-similarity.svg',
    description: '1 − Jensen-Shannon Divergence between raw and anonymized density distributions (higher = more similar).',
  },
  {
    key: 'top10HotspotOverlap',
    label: 'Top-10 Hotspot Overlap',
    unit: 'score',
    file: 'top10-hotspot-overlap.svg',
    description: 'Fraction of the top 10 raw-density grid cells still present after anonymization.',
  },
  {
    key: 'kViolations',
    label: 'k-Violations',
    unit: 'groups',
    file: 'k-violations.svg',
    description: 'Released groups whose size is below k. This should remain zero.',
  },
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const findLatestBenchmark = () => {
  if (explicitInput) return path.resolve(explicitInput);

  const candidates = fs
    .readdirSync(inputDir)
    .filter((name) => name.endsWith('.json') && name.includes('anonymization-benchmark'))
    .map((name) => {
      const filePath = path.join(inputDir, name);
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (candidates.length === 0) {
    throw new Error(`No benchmark JSON files found in ${inputDir}`);
  }

  return candidates[0].filePath;
};

const formatNumber = (value, digits = 2) => {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  if (Number.isInteger(value)) return String(value);
  return Number(value).toFixed(digits);
};

const formatMetric = (key, value) => {
  if (key.includes('Similarity') || key.includes('Overlap') || key === 'pointReductionRatio') {
    return value === undefined || value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
  }
  return formatNumber(value);
};

const groupKey = (row) =>
  `${row.method || 'merge-nearest'}, ${row.temporalGranularity}, k=${row.k}`;

const colorFor = (index) => {
  const colors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#4f46e5', '#be123c', '#65a30d'];
  return colors[index % colors.length];
};

const makeLineChart = ({ rows, metric, title, yLabel, outputPath }) => {
  const width = 900;
  const height = 520;
  const margin = { top: 48, right: 190, bottom: 72, left: 82 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const validRows = rows.filter((row) => row.status === 'success' && Number.isFinite(row[metric]));
  const sampleSizes = Array.from(new Set(validRows.map((row) => row.sampleSize))).sort((a, b) => a - b);
  const seriesNames = Array.from(new Set(validRows.map(groupKey)));
  const yValues = validRows.map((row) => row[metric]);
  const yMin = Math.min(0, ...yValues);
  const yMax = Math.max(...yValues);
  const yPadding = yMax === yMin ? 1 : (yMax - yMin) * 0.08;
  const yDomainMax = yMax + yPadding;

  const xFor = (sampleSize) => {
    const index = sampleSizes.indexOf(sampleSize);
    if (sampleSizes.length === 1) return margin.left + plotWidth / 2;
    return margin.left + (index / (sampleSizes.length - 1)) * plotWidth;
  };

  const yFor = (value) =>
    margin.top + plotHeight - ((value - yMin) / (yDomainMax - yMin)) * plotHeight;

  const lines = seriesNames
    .map((name, index) => {
      const points = validRows
        .filter((row) => groupKey(row) === name)
        .sort((a, b) => a.sampleSize - b.sampleSize)
        .map((row) => `${xFor(row.sampleSize)},${yFor(row[metric])}`)
        .join(' ');
      if (!points) return '';
      const color = colorFor(index);
      return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    })
    .join('\n');

  const dots = validRows
    .map((row) => {
      const color = colorFor(seriesNames.indexOf(groupKey(row)));
      return `<circle cx="${xFor(row.sampleSize)}" cy="${yFor(row[metric])}" r="4" fill="${color}"/>`;
    })
    .join('\n');

  const xTicks = sampleSizes
    .map((size) => {
      const x = xFor(size);
      return `<line x1="${x}" y1="${margin.top + plotHeight}" x2="${x}" y2="${margin.top + plotHeight + 6}" stroke="#111827"/>
      <text x="${x}" y="${margin.top + plotHeight + 26}" text-anchor="middle" font-size="12">${size}</text>`;
    })
    .join('\n');

  const yTicks = Array.from({ length: 6 }, (_, index) => yMin + ((yDomainMax - yMin) * index) / 5)
    .map((value) => {
      const y = yFor(value);
      return `<line x1="${margin.left - 6}" y1="${y}" x2="${margin.left}" y2="${y}" stroke="#111827"/>
      <line x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" stroke="#e5e7eb"/>
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${formatNumber(value)}</text>`;
    })
    .join('\n');

  const legend = seriesNames
    .map((name, index) => {
      const y = margin.top + index * 22;
      const x = margin.left + plotWidth + 28;
      const color = colorFor(index);
      return `<line x1="${x}" y1="${y}" x2="${x + 22}" y2="${y}" stroke="${color}" stroke-width="3"/>
      <text x="${x + 30}" y="${y + 4}" font-size="12">${name}</text>`;
    })
    .join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="${width / 2}" y="28" text-anchor="middle" font-size="20" font-weight="700">${title}</text>
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#111827"/>
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#111827"/>
  ${yTicks}
  ${xTicks}
  ${lines}
  ${dots}
  <text x="${margin.left + plotWidth / 2}" y="${height - 24}" text-anchor="middle" font-size="14">Sample size (rows)</text>
  <text x="22" y="${margin.top + plotHeight / 2}" transform="rotate(-90 22 ${margin.top + plotHeight / 2})" text-anchor="middle" font-size="14">${yLabel}</text>
  ${legend}
</svg>`;

  fs.writeFileSync(outputPath, svg);
};

const makeMarkdownTable = (rows, columns) => {
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map(
    (row) => `| ${columns.map((column) => column.format(row[column.key], row)).join(' | ')} |`
  );
  return [header, divider, ...body].join('\n');
};

const makeBaselineComparison = (rows) => {
  const METHOD_LABELS = {
    'merge-nearest': 'Merge',
    'suppression-baseline': 'Suppression',
    'fixed-grid-baseline': 'Fixed-Grid',
  };

  const allMethods = ['merge-nearest', 'suppression-baseline', 'fixed-grid-baseline'];
  const presentMethods = allMethods.filter((m) => rows.some((r) => (r.method || 'merge-nearest') === m));

  if (presentMethods.length < 2) return 'Baseline comparison requires at least two methods.';

  // Index rows by config key per method
  const byMethod = new Map(
    presentMethods.map((m) => [
      m,
      new Map(
        rows
          .filter((r) => (r.method || 'merge-nearest') === m)
          .map((r) => [`${r.sampleSize}|${r.temporalGranularity}|${r.k}`, r])
      ),
    ])
  );

  // Use merge-nearest as the reference to enumerate configs
  const referenceMethod = presentMethods.includes('merge-nearest') ? 'merge-nearest' : presentMethods[0];
  const referenceRows = Array.from(byMethod.get(referenceMethod).values());

  const maxSample = Math.max(...referenceRows.map((r) => r.sampleSize));
  const largestConfigs = referenceRows.filter((r) => r.sampleSize === maxSample);

  const comparisonRows = largestConfigs.map((refRow) => {
    const configKey = `${refRow.sampleSize}|${refRow.temporalGranularity}|${refRow.k}`;
    const row = {
      sampleSize: refRow.sampleSize,
      temporalGranularity: refRow.temporalGranularity,
      k: refRow.k,
    };
    presentMethods.forEach((m) => {
      const methodRow = byMethod.get(m)?.get(configKey);
      const label = METHOD_LABELS[m] || m;
      row[`${label}_suppressed`] = methodRow?.suppressedRecords ?? 'n/a';
      row[`${label}_density`] = methodRow?.densityCosineSimilarity ?? null;
      row[`${label}_jsd`] = methodRow?.densityJsdSimilarity ?? null;
      row[`${label}_hotspots`] = methodRow?.top10HotspotOverlap ?? null;
      row[`${label}_spatialErr`] = methodRow?.avgSpatialErrorKm ?? null;
    });
    return row;
  });

  const dynamicColumns = [
    { key: 'sampleSize', label: 'Rows', format: (v) => v },
    { key: 'temporalGranularity', label: 'Temporal', format: (v) => v },
    { key: 'k', label: 'k', format: (v) => v },
    ...presentMethods.flatMap((m) => {
      const label = METHOD_LABELS[m] || m;
      return [
        { key: `${label}_suppressed`, label: `${label} Suppressed`, format: (v) => v },
        { key: `${label}_density`, label: `${label} Cosine`, format: (v) => formatMetric('densityCosineSimilarity', v) },
        { key: `${label}_jsd`, label: `${label} JSD-Sim`, format: (v) => formatMetric('densityCosineSimilarity', v) },
        { key: `${label}_hotspots`, label: `${label} Top-10`, format: (v) => formatMetric('top10HotspotOverlap', v) },
        { key: `${label}_spatialErr`, label: `${label} Err(km)`, format: (v) => formatNumber(v) },
      ];
    }),
  ];

  return makeMarkdownTable(comparisonRows, dynamicColumns);
};

const main = () => {
  const inputPath = findLatestBenchmark();
  const benchmark = readJson(inputPath);
  const rows = benchmark.results;
  fs.mkdirSync(outputDir, { recursive: true });

  const successful = rows.filter((row) => row.status === 'success');
  const summaryRows = successful.filter((row) => row.sampleSize === Math.max(...successful.map((item) => item.sampleSize)));

  metricDefinitions.forEach((metric) => {
    makeLineChart({
      rows,
      metric: metric.key,
      title: `${metric.label} Across k and Temporal Settings`,
      yLabel: `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}`,
      outputPath: path.join(outputDir, metric.file),
    });
  });

  const tableColumns = [
    { key: 'sampleSize', label: 'Rows', format: (value) => value },
    { key: 'method', label: 'Method', format: (value) => value || 'merge-nearest' },
    { key: 'temporalGranularity', label: 'Temporal Mode', format: (value) => value },
    { key: 'k', label: 'k', format: (value) => value },
    { key: 'durationMs', label: 'Runtime (ms)', format: (value) => formatNumber(value) },
    { key: 'kViolations', label: 'k-Violations', format: (value) => value },
    { key: 'suppressedRecords', label: 'Suppressed', format: (value) => value },
    { key: 'avgSpatialErrorKm', label: 'Mean Error (km)', format: (value) => formatNumber(value) },
    { key: 'densityCosineSimilarity', label: 'Density (Cosine)', format: (value) => formatMetric('densityCosineSimilarity', value) },
    { key: 'densityJsdSimilarity', label: 'Density (JSD-Sim)', format: (value) => formatMetric('densityCosineSimilarity', value) },
    { key: 'top10HotspotOverlap', label: 'Top-10 Overlap', format: (value) => formatMetric('top10HotspotOverlap', value) },
  ];

  const fullTable = makeMarkdownTable(rows, tableColumns);
  const maxSampleTable = makeMarkdownTable(summaryRows, tableColumns);
  const baselineComparison = makeBaselineComparison(rows);
  const figureList = metricDefinitions
    .map((metric) => `- ${metric.description}: \`${metric.file}\``)
    .join('\n');

  const report = `# Anonymization Benchmark Report

Source benchmark: \`${inputPath}\`

Loaded rows: ${benchmark.loadedRows}

Sample sizes: ${benchmark.sampleSizes.join(', ')}

k values: ${benchmark.kValues.join(', ')}

Temporal modes: ${benchmark.temporalValues.join(', ')}

Methods: ${(benchmark.methodValues || ['merge-nearest']).join(', ')}

## Figures

${figureList}

## Largest Sample Summary

${maxSampleTable}

## Baseline Comparison

The suppression baseline releases only grid cells that already satisfy k and suppresses all sparse cells. The merge-nearest method can recover sparse cells by merging them with nearby groups while still enforcing k.

${baselineComparison}

## Full Results

${fullTable}
`;

  const reportPath = path.join(outputDir, 'benchmark-report.md');
  fs.writeFileSync(reportPath, report);

  console.log(`Benchmark report written to ${reportPath}`);
  metricDefinitions.forEach((metric) => {
    console.log(`Figure written to ${path.join(outputDir, metric.file)}`);
  });
};

main();
