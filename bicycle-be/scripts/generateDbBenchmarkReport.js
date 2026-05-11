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

const formatNumber = (value, digits = 2) => Number(value).toFixed(digits);

const latestBenchmarkFile = () => {
  const files = fs
    .readdirSync(inputDir)
    .filter((file) => /^db-query-benchmark-.*\.json$/.test(file))
    .map((file) => {
      const filePath = path.join(inputDir, file);
      return { file, filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!files.length) {
    throw new Error(`No DB benchmark JSON files found in ${inputDir}`);
  }

  return files[0].filePath;
};

const averageByLimit = (results) => {
  const byLimit = new Map();

  for (const row of results) {
    if (!byLimit.has(row.limit)) byLimit.set(row.limit, []);
    byLimit.get(row.limit).push(row);
  }

  return [...byLimit.entries()].map(([limit, rows]) => {
    const avgDbMs = rows.reduce((sum, row) => sum + row.dbQueryMs, 0) / rows.length;
    const avgTotalMs = rows.reduce((sum, row) => sum + row.totalServiceMs, 0) / rows.length;
    const rowCount = Math.max(...rows.map((row) => row.rowCount));

    return {
      limit,
      runs: rows.length,
      rowCount,
      avgDbMs,
      avgTotalMs,
      minDbMs: Math.min(...rows.map((row) => row.dbQueryMs)),
      maxDbMs: Math.max(...rows.map((row) => row.dbQueryMs)),
    };
  });
};

const explainByLimit = (explainPlans) =>
  new Map(explainPlans.map((plan) => [plan.limit, plan.explain?.[0] || {}]));

const renderMarkdown = (benchmark, sourceFile) => {
  const averages = averageByLimit(benchmark.results);
  const explains = explainByLimit(benchmark.explainPlans || []);
  const indexNames = [...new Set((benchmark.indexes || []).map((index) => index.keyName))];

  const tableRows = averages
    .map((row) => {
      const explain = explains.get(row.limit) || {};
      return `| ${[
        row.limit,
        row.runs,
        row.rowCount,
        formatNumber(row.avgDbMs),
        `${formatNumber(row.minDbMs)}-${formatNumber(row.maxDbMs)}`,
        explain.key || 'n/a',
        explain.rows ?? 'n/a',
        explain.Extra || 'n/a',
      ].join(' | ')} |`;
    })
    .join('\n');

  return `# Database Query Benchmark

Source: \`${path.basename(sourceFile)}\`

Filters: date \`${benchmark.filters.date}\`, member type \`${benchmark.filters.memberType}\`, data source \`${benchmark.filters.dataSource}\`, bounds \`${benchmark.filters.bounds.minLat},${benchmark.filters.bounds.minLng}\` to \`${benchmark.filters.bounds.maxLat},${benchmark.filters.bounds.maxLng}\`.

Indexes present: ${indexNames.map((name) => `\`${name}\``).join(', ')}

| Limit | Runs | Rows returned | Avg DB query ms | Min-max DB query ms | EXPLAIN key | EXPLAIN rows | EXPLAIN extra |
| ---: | ---: | ---: | ---: | --- | --- | ---: | --- |
${tableRows}

## Interpretation

The live backend now reports database latency separately from anonymization latency, so app demos can distinguish storage/query scalability from the k-anonymity algorithm runtime. The preferred query plan uses \`idx_trips_source_member_date_bounds\`, which matches the common filter order: data source, member type, date range, then map bounds.
`;
};

const main = () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const sourceFile = latestBenchmarkFile();
  const benchmark = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const markdown = renderMarkdown(benchmark, sourceFile);
  const outputPath = path.join(outputDir, 'db-query-benchmark-report.md');

  fs.writeFileSync(outputPath, markdown);
  console.log(JSON.stringify({ sourceFile, outputPath }, null, 2));
};

main();
