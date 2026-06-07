import fs from 'fs';
import path from 'path';

const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => arg.split('='))
    .filter(([key, value]) => key && value)
);

const inputDir     = args.get('--inputDir')  || path.join(process.cwd(), 'evaluation-results');
const outputDir    = args.get('--outputDir') || path.join(process.cwd(), 'paper-results');
const explicitInput = args.get('--input');


const metricDefinitions = [
  { key: 'durationMs',              label: 'Runtime',                   unit: 'ms',    file: 'runtime-ms.svg',             description: 'Backend anonymization runtime by sample size.' },
  { key: 'suppressedRecords',       label: 'Suppressed Records',        unit: 'records', file: 'suppressed-records.svg',   description: 'Rows withheld because no valid k-anonymous group could be released.' },
  { key: 'avgSpatialErrorKm',       label: 'Mean Spatial Error',        unit: 'km',    file: 'mean-spatial-error-km.svg',  description: 'Average distance between original start points and released centroids.' },
  { key: 'densityCosineSimilarity', label: 'Density Similarity (Cosine)', unit: 'score', file: 'density-similarity.svg',   description: 'Cosine similarity between raw and anonymized grid-cell density distributions.' },
  { key: 'densityJsdSimilarity',    label: 'Density Similarity (JSD)',  unit: 'score', file: 'density-jsd-similarity.svg', description: '1 − Jensen-Shannon Divergence between raw and anonymized density distributions (higher = more similar).' },
  { key: 'top10HotspotOverlap',     label: 'Top-10 Hotspot Overlap',    unit: 'score', file: 'top10-hotspot-overlap.svg',  description: 'Fraction of the top 10 raw-density grid cells still present after anonymization.' },
  { key: 'kViolations',             label: 'k-Violations',              unit: 'groups', file: 'k-violations.svg',          description: 'Released groups whose size is below k. This should remain zero.' },
];


const lDiversityMetricDefs = [
  { key: 'suppressedRecords',          label: 'Suppressed Records',       unit: 'records', file: 'l-diversity-suppressed.svg',     description: 'Suppression vs ℓ value — shows how stricter diversity constraints increase suppression.' },
  { key: 'avgSpatialErrorKm',          label: 'Mean Spatial Error',       unit: 'km',      file: 'l-diversity-spatial-error.svg',  description: 'Spatial error vs ℓ value — merging more groups to satisfy diversity increases distortion.' },
  { key: 'lViolations',                label: 'ℓ-Violations',             unit: 'groups',  file: 'l-violations.svg',               description: 'Released groups failing ℓ-diversity. Should remain zero.' },
  { key: 'avgDistinctSensitiveValues', label: 'Avg Distinct Values',      unit: 'values',  file: 'l-diversity-distinct-values.svg', description: 'Average number of distinct sensitive attribute values per released group.' },
];


const dpMetricDefs = [
  { key: 'avgCentroidDisplacementKm', label: 'Avg Centroid Displacement', unit: 'km',    file: 'dp-centroid-displacement.svg', description: 'Average Laplace noise displacement applied to centroids vs ε.' },
  { key: 'densityCosineSimilarity',   label: 'Density Similarity (Cosine)', unit: 'score', file: 'dp-density-similarity.svg', description: 'Density similarity vs ε — shows utility loss due to DP noise.' },
  { key: 'avgSpatialErrorKm',         label: 'Total Spatial Error',       unit: 'km',    file: 'dp-spatial-error.svg',         description: 'Combined k-anonymity + DP spatial error vs ε.' },
];


const readJson    = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

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

  if (candidates.length === 0) throw new Error(`No benchmark JSON files found in ${inputDir}`);
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

const groupKey = (row) => `${row.method || 'merge-nearest'}, ${row.temporalGranularity}, k=${row.k}`;

const colorFor = (index) => {
  const colors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#4f46e5', '#be123c', '#65a30d', '#b45309'];
  return colors[index % colors.length];
};


/**
 * Standard line chart — x-axis = sampleSize, series grouped by groupKeyFn.
 */
const makeLineChart = ({ rows, metric, title, yLabel, outputPath }) => {
  const width  = 900;
  const height = 520;
  const margin = { top: 48, right: 200, bottom: 72, left: 82 };
  const plotW  = width  - margin.left - margin.right;
  const plotH  = height - margin.top  - margin.bottom;

  const validRows  = rows.filter((r) => r.status === 'success' && Number.isFinite(r[metric]));
  const sizes      = Array.from(new Set(validRows.map((r) => r.sampleSize))).sort((a, b) => a - b);
  const seriesNames = Array.from(new Set(validRows.map(groupKey)));
  const yValues    = validRows.map((r) => r[metric]);
  const yMin       = Math.min(0, ...yValues);
  const yMax       = Math.max(...yValues);
  const yDomainMax = yMax + Math.max((yMax - yMin) * 0.08, 0.001);

  const xFor = (size) => {
    const idx = sizes.indexOf(size);
    return sizes.length === 1
      ? margin.left + plotW / 2
      : margin.left + (idx / (sizes.length - 1)) * plotW;
  };
  const yFor = (v) => margin.top + plotH - ((v - yMin) / (yDomainMax - yMin)) * plotH;

  const lines = seriesNames.map((name, idx) => {
    const pts = validRows
      .filter((r) => groupKey(r) === name)
      .sort((a, b) => a.sampleSize - b.sampleSize)
      .map((r) => `${xFor(r.sampleSize)},${yFor(r[metric])}`)
      .join(' ');
    if (!pts) return '';
    return `<polyline points="${pts}" fill="none" stroke="${colorFor(idx)}" stroke-width="2.5"/>`;
  }).join('\n');

  const dots = validRows.map((r) => {
    const c = colorFor(seriesNames.indexOf(groupKey(r)));
    return `<circle cx="${xFor(r.sampleSize)}" cy="${yFor(r[metric])}" r="4" fill="${c}"/>`;
  }).join('\n');

  const xTicks = sizes.map((size) => {
    const x = xFor(size);
    return `<line x1="${x}" y1="${margin.top + plotH}" x2="${x}" y2="${margin.top + plotH + 6}" stroke="#111827"/>
    <text x="${x}" y="${margin.top + plotH + 26}" text-anchor="middle" font-size="12">${size}</text>`;
  }).join('\n');

  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + ((yDomainMax - yMin) * i) / 5).map((v) => {
    const y = yFor(v);
    return `<line x1="${margin.left - 6}" y1="${y}" x2="${margin.left}" y2="${y}" stroke="#111827"/>
    <line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e5e7eb"/>
    <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${formatNumber(v)}</text>`;
  }).join('\n');

  const legend = seriesNames.map((name, idx) => {
    const y = margin.top + idx * 22;
    const x = margin.left + plotW + 28;
    return `<line x1="${x}" y1="${y}" x2="${x + 22}" y2="${y}" stroke="${colorFor(idx)}" stroke-width="3"/>
    <text x="${x + 30}" y="${y + 4}" font-size="11">${name}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="${width / 2}" y="28" text-anchor="middle" font-size="20" font-weight="700">${title}</text>
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#111827"/>
  <line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#111827"/>
  ${yTicks}${xTicks}${lines}${dots}
  <text x="${margin.left + plotW / 2}" y="${height - 24}" text-anchor="middle" font-size="14">Sample size (rows)</text>
  <text x="22" y="${margin.top + plotH / 2}" transform="rotate(-90 22 ${margin.top + plotH / 2})" text-anchor="middle" font-size="14">${yLabel}</text>
  ${legend}
</svg>`;

  fs.writeFileSync(outputPath, svg);
};

/**
 * Parametric line chart — x-axis driven by xKey (e.g. 'l' or 'epsilon'),
 * series grouped by a custom seriesKeyFn.
 */
const makeParamLineChart = ({
  rows, xKey, xLabel, metric, yLabel, title, outputPath,
  seriesKeyFn = (r) => `k=${r.k}`,
  xFormatter  = (v) => String(v),
}) => {
  const width  = 900;
  const height = 520;
  const margin = { top: 48, right: 200, bottom: 72, left: 82 };
  const plotW  = width  - margin.left - margin.right;
  const plotH  = height - margin.top  - margin.bottom;

  const validRows   = rows.filter((r) => r.status === 'success' && Number.isFinite(r[metric]) && Number.isFinite(r[xKey]));
  if (validRows.length === 0) { console.warn(`  ⚠ No valid rows for ${outputPath} — skipping`); return; }

  const xValues     = Array.from(new Set(validRows.map((r) => r[xKey]))).sort((a, b) => a - b);
  const seriesNames = Array.from(new Set(validRows.map(seriesKeyFn)));
  const yValues     = validRows.map((r) => r[metric]);
  const yMin        = Math.min(0, ...yValues);
  const yMax        = Math.max(...yValues);
  const yDomainMax  = yMax + Math.max((yMax - yMin) * 0.08, 0.001);

  const xFor = (xv) => {
    const idx = xValues.indexOf(xv);
    return xValues.length === 1
      ? margin.left + plotW / 2
      : margin.left + (idx / (xValues.length - 1)) * plotW;
  };
  const yFor = (v) => margin.top + plotH - ((v - yMin) / (yDomainMax - yMin)) * plotH;

  const lines = seriesNames.map((name, idx) => {
    const pts = validRows
      .filter((r) => seriesKeyFn(r) === name)
      .sort((a, b) => a[xKey] - b[xKey])
      .map((r) => `${xFor(r[xKey])},${yFor(r[metric])}`)
      .join(' ');
    if (!pts) return '';
    return `<polyline points="${pts}" fill="none" stroke="${colorFor(idx)}" stroke-width="2.5"/>`;
  }).join('\n');

  const dots = validRows.map((r) => {
    const c = colorFor(seriesNames.indexOf(seriesKeyFn(r)));
    return `<circle cx="${xFor(r[xKey])}" cy="${yFor(r[metric])}" r="4.5" fill="${c}"/>`;
  }).join('\n');

  const xTicks = xValues.map((xv) => {
    const x = xFor(xv);
    return `<line x1="${x}" y1="${margin.top + plotH}" x2="${x}" y2="${margin.top + plotH + 6}" stroke="#111827"/>
    <text x="${x}" y="${margin.top + plotH + 26}" text-anchor="middle" font-size="12">${xFormatter(xv)}</text>`;
  }).join('\n');

  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + ((yDomainMax - yMin) * i) / 5).map((v) => {
    const y = yFor(v);
    return `<line x1="${margin.left - 6}" y1="${y}" x2="${margin.left}" y2="${y}" stroke="#111827"/>
    <line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e5e7eb"/>
    <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${formatNumber(v)}</text>`;
  }).join('\n');

  const legend = seriesNames.map((name, idx) => {
    const y = margin.top + idx * 22;
    const x = margin.left + plotW + 28;
    return `<line x1="${x}" y1="${y}" x2="${x + 22}" y2="${y}" stroke="${colorFor(idx)}" stroke-width="3"/>
    <text x="${x + 30}" y="${y + 4}" font-size="11">${name}</text>`;
  }).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="white"/>
  <text x="${width / 2}" y="28" text-anchor="middle" font-size="20" font-weight="700">${title}</text>
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#111827"/>
  <line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#111827"/>
  ${yTicks}${xTicks}${lines}${dots}
  <text x="${margin.left + plotW / 2}" y="${height - 24}" text-anchor="middle" font-size="14">${xLabel}</text>
  <text x="22" y="${margin.top + plotH / 2}" transform="rotate(-90 22 ${margin.top + plotH / 2})" text-anchor="middle" font-size="14">${yLabel}</text>
  ${legend}
</svg>`;

  fs.writeFileSync(outputPath, svg);
};


const makeMarkdownTable = (rows, columns) => {
  if (!rows.length) return '_No data._';
  const header  = `| ${columns.map((c) => c.label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body    = rows.map(
    (row) => `| ${columns.map((c) => c.format(row[c.key], row)).join(' | ')} |`
  );
  return [header, divider, ...body].join('\n');
};


const makeBaselineComparison = (rows) => {
  const METHOD_LABELS = { 'merge-nearest': 'Merge', 'suppression-baseline': 'Suppression', 'fixed-grid-baseline': 'Fixed-Grid' };
  const allMethods    = ['merge-nearest', 'suppression-baseline', 'fixed-grid-baseline'];
  const presentMethods = allMethods.filter((m) => rows.some((r) => (r.method || 'merge-nearest') === m));
  if (presentMethods.length < 2) return 'Baseline comparison requires at least two methods.';

  const byMethod = new Map(presentMethods.map((m) => [
    m,
    new Map(rows.filter((r) => (r.method || 'merge-nearest') === m).map((r) => [`${r.sampleSize}|${r.temporalGranularity}|${r.k}`, r])),
  ]));

  const ref       = presentMethods.includes('merge-nearest') ? 'merge-nearest' : presentMethods[0];
  const maxSample = Math.max(...Array.from(byMethod.get(ref).values()).map((r) => r.sampleSize));
  const configs   = Array.from(byMethod.get(ref).values()).filter((r) => r.sampleSize === maxSample);

  const compRows = configs.map((refRow) => {
    const ck  = `${refRow.sampleSize}|${refRow.temporalGranularity}|${refRow.k}`;
    const row = { sampleSize: refRow.sampleSize, temporalGranularity: refRow.temporalGranularity, k: refRow.k };
    presentMethods.forEach((m) => {
      const mr  = byMethod.get(m)?.get(ck);
      const lbl = METHOD_LABELS[m] || m;
      row[`${lbl}_suppressed`]  = mr?.suppressedRecords ?? 'n/a';
      row[`${lbl}_density`]     = mr?.densityCosineSimilarity ?? null;
      row[`${lbl}_jsd`]         = mr?.densityJsdSimilarity ?? null;
      row[`${lbl}_hotspots`]    = mr?.top10HotspotOverlap ?? null;
      row[`${lbl}_spatialErr`]  = mr?.avgSpatialErrorKm ?? null;
    });
    return row;
  });

  const cols = [
    { key: 'sampleSize',          label: 'Rows',    format: (v) => v },
    { key: 'temporalGranularity', label: 'Temporal', format: (v) => v },
    { key: 'k',                   label: 'k',        format: (v) => v },
    ...presentMethods.flatMap((m) => {
      const lbl = METHOD_LABELS[m] || m;
      return [
        { key: `${lbl}_suppressed`, label: `${lbl} Supp`,      format: (v) => v },
        { key: `${lbl}_density`,    label: `${lbl} Cosine`,    format: (v) => formatMetric('densityCosineSimilarity', v) },
        { key: `${lbl}_jsd`,        label: `${lbl} JSD-Sim`,   format: (v) => formatMetric('densityCosineSimilarity', v) },
        { key: `${lbl}_hotspots`,   label: `${lbl} Top-10`,    format: (v) => formatMetric('top10HotspotOverlap', v) },
        { key: `${lbl}_spatialErr`, label: `${lbl} Err(km)`,   format: (v) => formatNumber(v) },
      ];
    }),
  ];

  return makeMarkdownTable(compRows, cols);
};


const makeLDiversityTable = (rows) => {
  const lRows = rows.filter((r) => r.runType === 'l-diversity' && r.status === 'success');
  if (!lRows.length) return '_No ℓ-diversity runs found. Re-run with --lValues=2,3,4 to generate._';

  const maxSample = Math.max(...lRows.map((r) => r.sampleSize));
  const tableRows = lRows
    .filter((r) => r.sampleSize === maxSample)
    .sort((a, b) => a.k - b.k || a.l - b.l);

  const cols = [
    { key: 'k',                           label: 'k',              format: (v) => v },
    { key: 'l',                           label: 'ℓ',              format: (v) => v },
    { key: 'sensitiveAttr',               label: 'Sensitive Attr', format: (v) => v },
    { key: 'suppressedRecords',           label: 'Suppressed',     format: (v) => v },
    { key: 'avgSpatialErrorKm',           label: 'Mean Err (km)',  format: (v) => formatNumber(v) },
    { key: 'densityCosineSimilarity',     label: 'Cosine Sim',     format: (v) => formatMetric('densityCosineSimilarity', v) },
    { key: 'densityJsdSimilarity',        label: 'JSD-Sim',        format: (v) => formatMetric('densityCosineSimilarity', v) },
    { key: 'top10HotspotOverlap',         label: 'Top-10 Overlap', format: (v) => formatMetric('top10HotspotOverlap', v) },
    { key: 'lViolations',                 label: 'ℓ-Violations',   format: (v) => v ?? 'n/a' },
    { key: 'minDistinctSensitiveValues',  label: 'Min Distinct',   format: (v) => v ?? 'n/a' },
    { key: 'avgDistinctSensitiveValues',  label: 'Avg Distinct',   format: (v) => formatNumber(v) },
    { key: 'durationMs',                  label: 'Runtime (ms)',   format: (v) => formatNumber(v) },
  ];

  return makeMarkdownTable(tableRows, cols);
};


const makeDPTable = (rows) => {
  const dpRows = rows.filter((r) => r.runType === 'epsilon-dp' && r.status === 'success');
  if (!dpRows.length) return '_No ε-DP runs found. Re-run with --epsilonValues=10,5,2,1,0.5 to generate._';

  const maxSample = Math.max(...dpRows.map((r) => r.sampleSize));
  const tableRows = dpRows
    .filter((r) => r.sampleSize === maxSample)
    .sort((a, b) => a.k - b.k || b.epsilon - a.epsilon);

  const cols = [
    { key: 'k',                           label: 'k',              format: (v) => v },
    { key: 'epsilon',                     label: 'ε',              format: (v) => v },
    { key: 'suppressedRecords',           label: 'Suppressed',     format: (v) => v },
    { key: 'avgCentroidDisplacementKm',   label: 'Displacement (km)', format: (v) => formatNumber(v, 4) },
    { key: 'dpLocationScaleKm',           label: 'Noise Scale (km)', format: (v) => formatNumber(v, 4) },
    { key: 'avgSpatialErrorKm',           label: 'Total Err (km)', format: (v) => formatNumber(v) },
    { key: 'densityCosineSimilarity',     label: 'Cosine Sim',     format: (v) => formatMetric('densityCosineSimilarity', v) },
    { key: 'densityJsdSimilarity',        label: 'JSD-Sim',        format: (v) => formatMetric('densityCosineSimilarity', v) },
    { key: 'top10HotspotOverlap',         label: 'Top-10 Overlap', format: (v) => formatMetric('top10HotspotOverlap', v) },
    { key: 'durationMs',                  label: 'Runtime (ms)',   format: (v) => formatNumber(v) },
  ];

  return makeMarkdownTable(tableRows, cols);
};


const main = () => {
  const inputPath = findLatestBenchmark();
  const benchmark = readJson(inputPath);
  const rows      = benchmark.results;
  fs.mkdirSync(outputDir, { recursive: true });

  const successful = rows.filter((r) => r.status === 'success');

  const standardRows = rows.filter((r) => !r.runType || r.runType === 'k-anonymity');
  metricDefinitions.forEach((m) => {
    makeLineChart({
      rows: standardRows,
      metric: m.key,
      title:  `${m.label} Across k and Temporal Settings`,
      yLabel: `${m.label}${m.unit ? ` (${m.unit})` : ''}`,
      outputPath: path.join(outputDir, m.file),
    });
  });

  const lRows = rows.filter((r) => r.runType === 'l-diversity');
  lDiversityMetricDefs.forEach((m) => {
    makeParamLineChart({
      rows:        lRows,
      xKey:        'l',
      xLabel:      'ℓ value',
      metric:      m.key,
      yLabel:      `${m.label}${m.unit ? ` (${m.unit})` : ''}`,
      title:       `ℓ-Diversity: ${m.label} vs ℓ`,
      outputPath:  path.join(outputDir, m.file),
      seriesKeyFn: (r) => `k=${r.k}, attr=${r.sensitiveAttr}`,
      xFormatter:  (v) => `ℓ=${v}`,
    });
  });

  const dpRows = rows.filter((r) => r.runType === 'epsilon-dp');
  dpMetricDefs.forEach((m) => {
    makeParamLineChart({
      rows:        dpRows,
      xKey:        'epsilon',
      xLabel:      'ε (privacy budget)',
      metric:      m.key,
      yLabel:      `${m.label}${m.unit ? ` (${m.unit})` : ''}`,
      title:       `ε-DP: ${m.label} vs ε`,
      outputPath:  path.join(outputDir, m.file),
      seriesKeyFn: (r) => `k=${r.k}`,
      xFormatter:  (v) => `ε=${v}`,
    });
  });

  const maxSample    = Math.max(...successful.map((r) => r.sampleSize));
  const summaryRows  = successful.filter((r) => r.sampleSize === maxSample && (!r.runType || r.runType === 'k-anonymity'));

  const tableColumns = [
    { key: 'sampleSize',              label: 'Rows',           format: (v) => v },
    { key: 'method',                  label: 'Method',         format: (v) => v || 'merge-nearest' },
    { key: 'temporalGranularity',     label: 'Temporal Mode',  format: (v) => v },
    { key: 'k',                       label: 'k',              format: (v) => v },
    { key: 'durationMs',              label: 'Runtime (ms)',   format: (v) => formatNumber(v) },
    { key: 'kViolations',             label: 'k-Violations',   format: (v) => v },
    { key: 'suppressedRecords',       label: 'Suppressed',     format: (v) => v },
    { key: 'avgSpatialErrorKm',       label: 'Mean Err (km)',  format: (v) => formatNumber(v) },
    { key: 'densityCosineSimilarity', label: 'Cosine Sim',     format: (v) => formatMetric('densityCosineSimilarity', v) },
    { key: 'densityJsdSimilarity',    label: 'JSD-Sim',        format: (v) => formatMetric('densityCosineSimilarity', v) },
    { key: 'top10HotspotOverlap',     label: 'Top-10 Overlap', format: (v) => formatMetric('top10HotspotOverlap', v) },
  ];

  const allFigures = [
    ...metricDefinitions.map((m) => `- ${m.description}: \`${m.file}\``),
    '',
    '**ℓ-Diversity figures:**',
    ...lDiversityMetricDefs.map((m) => `- ${m.description}: \`${m.file}\``),
    '',
    '**ε-DP figures:**',
    ...dpMetricDefs.map((m) => `- ${m.description}: \`${m.file}\``),
  ].join('\n');

  const report = `# Anonymization Benchmark Report

Source: \`${inputPath}\`

Loaded rows: ${benchmark.loadedRows} | Sample sizes: ${benchmark.sampleSizes?.join(', ')} | k values: ${benchmark.kValues?.join(', ')}

Temporal modes: ${benchmark.temporalValues?.join(', ')} | Methods: ${(benchmark.methodValues || ['merge-nearest']).join(', ')}

ℓ values: ${(benchmark.lValues || [1]).join(', ')} | Sensitive attrs: ${(benchmark.sensitiveAttrs || ['none']).join(', ')}

ε values: ${(benchmark.epsilonValues || ['Infinity']).join(', ')}

---

## Figures

${allFigures}

---

## 1. k-Anonymity — Largest Sample Summary

${makeMarkdownTable(summaryRows, tableColumns)}

## 2. k-Anonymity — Baseline Comparison

Suppression baseline releases only cells already satisfying k (no merging).
Fixed-grid baseline uses cell-centre coordinates instead of trip centroids.
Merge-nearest recovers sparse cells and achieves lower suppression.

${makeBaselineComparison(rows.filter((r) => !r.runType || r.runType === 'k-anonymity'))}

---

## 3. ℓ-Diversity Analysis

ℓ-diversity adds an attribute-diversity constraint on top of k-anonymity.
Each released group must contain at least ℓ distinct values of the sensitive attribute.
Higher ℓ protects against attribute-inference attacks but increases suppression and spatial error.

${makeLDiversityTable(rows)}

---

## 4. ε-Differential Privacy Analysis

ε-DP adds calibrated Laplace noise to centroids and counts after k-anonymization.
Smaller ε = stronger probabilistic privacy = more centroid displacement.
Unlike suppression-based methods, ε-DP always releases all k-anonymous groups (suppression = 0 from DP).
The utility cost is centroid displacement rather than data withholding.

${makeDPTable(rows)}

---

## 5. Full Results (all runs)

${makeMarkdownTable(rows, tableColumns)}
`;

  const reportPath = path.join(outputDir, 'benchmark-report.md');
  fs.writeFileSync(reportPath, report);

  console.log(`\nBenchmark report → ${reportPath}`);
  [...metricDefinitions, ...lDiversityMetricDefs, ...dpMetricDefs].forEach((m) => {
    const p = path.join(outputDir, m.file);
    if (fs.existsSync(p)) console.log(`Figure → ${p}`);
  });
};

main();
