import React from "react";
import { Alert, Card, Col, Row, Space, Steps, Table, Tag, Timeline, Typography } from "antd";
import {
  AppstoreOutlined, BarChartOutlined, CheckCircleOutlined, ClusterOutlined,
  DatabaseOutlined, FileSearchOutlined, GlobalOutlined, LineChartOutlined, UploadOutlined,
} from "@ant-design/icons";

const { Paragraph, Text, Title } = Typography;

const requiredColumns = [
  { field: "started_at", purpose: "Trip start timestamp" },
  { field: "ended_at",   purpose: "Trip end timestamp" },
  { field: "start_lat / start_lng", purpose: "Trip start coordinates (decimal degrees)" },
  { field: "end_lat / end_lng",     purpose: "Trip end coordinates (decimal degrees)" },
];

const aliasRows = [
  { internal: "started_at",  examples: "start_time, starttime, start_date, started, start_time_local" },
  { internal: "ended_at",    examples: "end_time, stoptime, end_date, ended, end_time_local" },
  { internal: "start_lat",   examples: "start_latitude, from_lat, start station latitude, start_station_latitude" },
  { internal: "start_lng",   examples: "start_lon, start_longitude, from_lon, start station longitude" },
  { internal: "end_lat",     examples: "end_latitude, to_lat, end station latitude, end_station_latitude" },
  { internal: "end_lng",     examples: "end_lon, end_longitude, to_lon, end station longitude" },
  { internal: "ride_id",     examples: "trip_id, rental_id, id; deterministic hash generated when missing" },
  { internal: "member_casual", examples: "user_type, customer_type, membership_type, subscriber_type" },
];

const metricRows = [
  { metric: "k Violations",           meaning: "Released groups smaller than k. Must always be 0 — the merge-nearest algorithm guarantees this." },
  { metric: "Released Groups",        meaning: "Number of distinct anonymized clusters returned. Fewer groups = broader generalization." },
  { metric: "Suppressed",             meaning: "Trips withheld because no valid k-anonymous group could be formed for them." },
  { metric: "Mean Error (km)",        meaning: "Average distance between each trip's original start point and the centroid of its released group. Lower is better." },
  { metric: "Density Similarity (Cosine)", meaning: "Cosine similarity between raw and anonymized grid-cell density distributions. Values near 1.0 mean the anonymized heatmap closely matches the original." },
  { metric: "Density Similarity (JSD)", meaning: "1 − Jensen-Shannon Divergence. Unlike cosine, JSD treats densities as probability distributions and penalises both pattern and magnitude changes. Closer to 1 is better." },
  { metric: "Hotspot Overlap",        meaning: "Fraction of the top-10 busiest raw grid cells still present after anonymization. Near 1.0 = major hotspots survived." },
  { metric: "DB Query / Backend Total", meaning: "Live latency breakdown. DB Query measures MySQL retrieval time; Backend Total includes the anonymization algorithm as well." },
];

const multiCityDatasets = [
  { provider: "Citi Bike (NYC)",      url: "citibikenyc.com/system-data",   format: "Standard Citi Bike CSV (all fields)" },
  { provider: "Divvy (Chicago)",      url: "divvybikes.com/system-data",    format: "starttime/stoptime aliases auto-detected" },
  { provider: "Bluebikes (Boston)",   url: "bluebikes.com/system-data",     format: "start_time / end_time aliases auto-detected" },
  { provider: "Capital Bikeshare (DC)", url: "capitalbikeshare.com/system-data", format: "start_time / end_time aliases" },
  { provider: "Santander Cycles (London)", url: "tfl.gov.uk/info-for/open-data-users", format: "StartDate / EndDate — may need column rename" },
  { provider: "Custom dataset",       url: "—",                             format: "Any CSV with the 6 required coordinate/timestamp fields" },
];

const Guide = () => {
  return (
    <div className="guide-page">

      <section className="tool-hero">
        <div>
          <Space size={8} className="hero-kicker">
            <FileSearchOutlined />
            <span>User guide</span>
          </Space>
          <Title level={2}>Mobility Privacy Demonstrator</Title>
          <Paragraph>
            Use this guide to upload mobility datasets, run k-anonymity, compare privacy settings,
            interpret utility metrics, and explore the 3D privacy-utility landscape for demos or paper figures.
          </Paragraph>
        </div>
        <Tag icon={<GlobalOutlined />} color="blue">Global CSV support</Tag>
      </section>

      <Row gutter={[16, 16]}>

        {/* Upload steps */}
        <Col xs={24} xl={14}>
          <Card title={<Space><UploadOutlined /> Uploading Data</Space>} className="guide-card">
            <Steps
              direction="vertical"
              size="small"
              items={[
                {
                  title: "Prepare a mobility CSV",
                  description: "The file should contain trip start/end timestamps and start/end coordinates. Citi Bike headers and common aliases are auto-detected.",
                },
                {
                  title: "Upload on the Upload Data page",
                  description: "Files up to 250 MB are accepted. The backend streams rows into MySQL in 1,000-row chunks so it never holds the full file in memory. A real-time progress bar shows the transfer and processing phases separately.",
                },
                {
                  title: "Watch the progress bar",
                  description: "The first phase (Sending file…) shows the HTTP transfer percentage. Once the file arrives the bar holds at 99% while the server streams rows into the database. Both phases are visible.",
                },
                {
                  title: "Switch to user data",
                  description: "After upload, use the Data Source toggle or the Tool page filter to select User Data. The map re-centres automatically to the uploaded dataset's geographic bounds and the date picker adjusts to the actual date range of your data.",
                },
              ]}
            />
          </Card>
        </Col>

        {/* Required fields */}
        <Col xs={24} xl={10}>
          <Card title={<Space><CheckCircleOutlined /> Required Fields</Space>} className="guide-card">
            <Table
              size="small"
              pagination={false}
              dataSource={requiredColumns}
              rowKey="field"
              columns={[
                { title: "Field", dataIndex: "field", width: 200 },
                { title: "Purpose", dataIndex: "purpose" },
              ]}
            />
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message="ride_id is optional"
              description="When missing, the importer generates a deterministic SHA-1 hash from the trip's coordinates and timestamps. This means uploading the same file twice will not create duplicates."
            />
          </Card>
        </Col>

        {/* Column aliases */}
        <Col span={24}>
          <Card title={<Space><DatabaseOutlined /> Supported Column Aliases</Space>} className="guide-card">
            <Table
              size="small"
              pagination={false}
              dataSource={aliasRows}
              rowKey="internal"
              columns={[
                { title: "Internal field", dataIndex: "internal", width: 180 },
                { title: "Accepted examples", dataIndex: "examples" },
              ]}
            />
          </Card>
        </Col>

        {/* RL1: Multi-city / cross-dataset testing */}
        <Col span={24}>
          <Card
            title={<Space><GlobalOutlined /> Multi-City and Cross-Dataset Testing (RL1)</Space>}
            className="guide-card"
          >
            <Paragraph>
              The tool is designed to work with any point-to-point mobility CSV, not just New York City Citi Bike data.
              The alias system auto-detects the most common provider formats. To validate the tool across cities:
            </Paragraph>
            <Steps
              direction="vertical"
              size="small"
              style={{ marginBottom: 16 }}
              items={[
                {
                  title: "Download a public bike-share dataset",
                  description: "All major providers listed below publish monthly trip data as open CSV files.",
                },
                {
                  title: "Upload it on the Upload Data page",
                  description: "Select User Data as the data source. The map will re-centre to the new city automatically.",
                },
                {
                  title: "Run the offline benchmark",
                  description: 'node scripts/evaluateAnonymization.js --csv=your-file.csv --sampleSizes=1000,5000 — this adds the fixed-grid-baseline comparison and the new JSD density metric to the evaluation output.',
                },
                {
                  title: "Generate the paper report",
                  description: "node scripts/generateBenchmarkReport.js — produces SVG plots and a Markdown table comparing all three methods across all cities.",
                },
              ]}
            />
            <Table
              size="small"
              pagination={false}
              dataSource={multiCityDatasets}
              rowKey="provider"
              columns={[
                { title: "Provider", dataIndex: "provider", width: 220 },
                { title: "Open data URL", dataIndex: "url" },
                { title: "Column format notes", dataIndex: "format" },
              ]}
            />
            <Alert
              style={{ marginTop: 12 }}
              type="success"
              showIcon
              message="End-to-end benchmark"
              description={
                <span>
                  Use <code>node scripts/benchmarkEndToEnd.js</code> to measure the full pipeline latency
                  (DB query + anonymization) against a live dataset. This script is separate from the offline
                  CSV benchmark and directly reflects what a real API request experiences.
                </span>
              }
            />
          </Card>
        </Col>

        {/* Running the tool */}
        <Col xs={24} xl={12}>
          <Card title={<Space><ClusterOutlined /> Running the Tool</Space>} className="guide-card">
            <Timeline
              items={[
                { color: "blue",  children: "Choose Preloaded or User Data. Preloaded is January 2024 Citi Bike (NYC); uploaded data can come from any city." },
                { color: "blue",  children: "Set member type, grid size, k value, and temporal privacy mode. Hover any control's ? icon for an explanation." },
                { color: "green", children: "Click Load Original to inspect raw trip paths, then Run Anonymization to generate released centroids and heat intensity." },
                { color: "green", children: "Click Compare k Values to run k=5, k=10, and k=20 side-by-side on the same filters." },
                { color: "purple",children: "Open the 3D Landscape to see the privacy-utility surface across all configurations. Click any bar to instantly apply that (k, temporal) combination." },
              ]}
            />
          </Card>
        </Col>

        {/* Key controls */}
        <Col xs={24} xl={12}>
          <Card title={<Space><AppstoreOutlined /> Key Controls</Space>} className="guide-card">
            <Space direction="vertical" size={10}>
              <Text><strong>Grid size:</strong> smaller values preserve more location detail; larger values generalize broader areas and reduce suppression for sparse datasets.</Text>
              <Text><strong>k value:</strong> each released group must contain at least k trips. The merge-nearest algorithm guarantees zero k-violations.</Text>
              <Text><strong>Temporal privacy:</strong> spatial-only is least strict. Day, Period, and Hour modes add a time dimension to each anonymization cell — stricter modes suppress more records but protect timing better.</Text>
              <Text><strong>3D Landscape:</strong> interactive surface showing suppression rate, density similarity, or spatial error across all (k, temporal) combinations. Clicking a bar applies that configuration to the main tool.</Text>
              <Text><strong>Theme toggle:</strong> switch between light and dark mode for demos and paper screenshots.</Text>
            </Space>
          </Card>
        </Col>

        {/* Metrics */}
        <Col span={24}>
          <Card title={<Space><BarChartOutlined /> Reading the Metrics</Space>} className="guide-card">
            <Table
              size="small"
              pagination={false}
              dataSource={metricRows}
              rowKey="metric"
              columns={[
                { title: "Metric", dataIndex: "metric", width: 240 },
                { title: "How to interpret it", dataIndex: "meaning" },
              ]}
            />
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message="JSD vs Cosine density similarity"
              description={
                <span>
                  Both metrics compare the raw and anonymized density distributions, but they measure different
                  things. <strong>Cosine similarity</strong> captures directional alignment — two distributions
                  that preserve which cells are busy score high even if magnitudes differ. <strong>JSD similarity
                  (1−JSD)</strong> is stricter: it treats each distribution as a probability distribution and is
                  sensitive to both pattern changes and magnitude shifts. For the paper, reporting both gives
                  reviewers a more complete picture.
                </span>
              }
            />
          </Card>
        </Col>

        {/* Baseline comparison */}
        <Col span={24}>
          <Alert
            type="success"
            showIcon
            message="Three-way baseline comparison"
            description={
              <span>
                The benchmark now compares <strong>merge-nearest</strong> (the main algorithm),
                <strong> suppression-baseline</strong> (no merging — sparse cells are simply dropped),
                and <strong>fixed-grid-baseline</strong> (no merging, centroids at grid-cell centres rather
                than trip means). The fixed-grid baseline isolates what the merging step contributes beyond
                simply choosing which cells to release. Run <code>node scripts/evaluateAnonymization.js</code>{" "}
                and <code>node scripts/generateBenchmarkReport.js</code> to reproduce all three comparisons.
              </span>
            }
          />
        </Col>

      </Row>
    </div>
  );
};

export default Guide;
