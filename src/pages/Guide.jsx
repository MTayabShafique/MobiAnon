import React, { useState } from "react";
import {
  Alert, Card, Col, Row, Space, Steps, Table, Tag, Timeline, Tabs, Typography, Tooltip,
} from "antd";
import {
  ApartmentOutlined, AppstoreOutlined, BarChartOutlined, CheckCircleOutlined,
  ClusterOutlined, DatabaseOutlined, FileSearchOutlined, GlobalOutlined,
  NodeIndexOutlined, SafetyOutlined, UploadOutlined, ApiOutlined,
  DesktopOutlined, CodeOutlined, ThunderboltOutlined, InfoCircleOutlined,
  RocketOutlined, BranchesOutlined,
} from "@ant-design/icons";

const { Paragraph, Text, Title } = Typography;

/* ─── Static data ───────────────────────────────────────────────────────────── */

const requiredColumns = [
  { field: "started_at",             purpose: "Trip start timestamp" },
  { field: "ended_at",               purpose: "Trip end timestamp" },
  { field: "start_lat / start_lng",  purpose: "Trip start coordinates (decimal degrees)" },
  { field: "end_lat / end_lng",      purpose: "Trip end coordinates (decimal degrees)" },
];

const aliasRows = [
  { internal: "started_at",    examples: "start_time, starttime, start_date, started, start_time_local" },
  { internal: "ended_at",      examples: "end_time, stoptime, end_date, ended, end_time_local" },
  { internal: "start_lat",     examples: "start_latitude, from_lat, start station latitude, start_station_latitude" },
  { internal: "start_lng",     examples: "start_lon, start_longitude, from_lon, start station longitude" },
  { internal: "end_lat",       examples: "end_latitude, to_lat, end station latitude, end_station_latitude" },
  { internal: "end_lng",       examples: "end_lon, end_longitude, to_lon, end station longitude" },
  { internal: "ride_id",       examples: "trip_id, rental_id, id; deterministic hash generated when missing" },
  { internal: "member_casual", examples: "user_type, customer_type, membership_type, subscriber_type" },
  { internal: "rideable_type", examples: "bike_type, vehicle_type, type" },
];

const metricRows = [
  { metric: "k Violations",               meaning: "Released groups smaller than k. Must always be 0 — the merge-nearest algorithm guarantees this." },
  { metric: "Released Groups",            meaning: "Number of distinct anonymized clusters returned. Fewer groups = broader generalization." },
  { metric: "Suppressed",                 meaning: "Trips withheld because no valid k-anonymous (and ℓ-diverse, if enabled) group could be formed for them." },
  { metric: "Mean Error (km)",            meaning: "Average distance between each trip's original start point and the centroid of its released group. Lower is better." },
  { metric: "Density Similarity (Cosine)",meaning: "Cosine similarity between raw and anonymized grid-cell density distributions. Values near 1.0 mean the anonymized heatmap closely matches the original." },
  { metric: "Density Similarity (JSD)",   meaning: "1 − Jensen-Shannon Divergence. Treats densities as probability distributions and penalises both pattern and magnitude changes. Closer to 1 is better." },
  { metric: "Hotspot Overlap",            meaning: "Fraction of the top-10 busiest raw grid cells still present after anonymization. Near 1.0 = major hotspots survived." },
  { metric: "DB Query / Backend Total",   meaning: "Live latency breakdown. DB Query measures MySQL retrieval time; Backend Total includes the anonymization algorithm as well." },
  { metric: "ℓ Violations",              meaning: "Groups failing the ℓ-diversity constraint. Should remain 0 after the merge algorithm runs. Only shown when ℓ ≥ 2." },
  { metric: "Min / Avg Distinct Values",  meaning: "Diversity statistics per released group — minimum and average distinct sensitive-attribute values. A group with min = ℓ is the tightest." },
  { metric: "Avg Centroid Displacement",  meaning: "ε-DP only. Average Laplace noise displacement applied to released centroids. Smaller ε = larger displacement." },
  { metric: "Noise Scale (km)",           meaning: "ε-DP only. The Laplace distribution scale parameter (gridSize / ε) converted to km. 68% of displacement values fall within this distance." },
];

const lDiversityAttrs = [
  { attr: "Rider type (member_casual)", values: "member, casual (2 values)",                    threat: "An adversary who knows the grid cell cannot infer whether the person is a commuter or tourist." },
  { attr: "Bike type (rideable_type)",  values: "classic_bike, electric_bike, docked_bike (up to 3)", threat: "Prevents inference of bike preference or accessibility device use." },
  { attr: "Destination area",           values: "Grid cell key derived from end_lat/end_lng",   threat: "Strongest protection: each group covers ≥ ℓ distinct destination neighbourhoods, blocking destination-inference attacks." },
];

const multiCityDatasets = [
  { provider: "Citi Bike (NYC)",           url: "citibikenyc.com/system-data",         format: "Standard Citi Bike CSV (all fields)" },
  { provider: "Divvy (Chicago)",           url: "divvybikes.com/system-data",           format: "starttime/stoptime aliases auto-detected" },
  { provider: "Bluebikes (Boston)",        url: "bluebikes.com/system-data",            format: "start_time / end_time aliases auto-detected" },
  { provider: "Capital Bikeshare (DC)",    url: "capitalbikeshare.com/system-data",     format: "start_time / end_time aliases" },
  { provider: "Santander Cycles (London)", url: "tfl.gov.uk/info-for/open-data-users",  format: "StartDate / EndDate — may need column rename" },
  { provider: "Custom dataset",            url: "—",                                    format: "Any CSV with the 6 required coordinate/timestamp fields" },
];

const epsilonRows = [
  { eps: "ε = 10",  scale: "gridSize / 10 ≈ 110 m",   label: "Very weak — barely detectable noise" },
  { eps: "ε = 5",   scale: "gridSize / 5  ≈ 220 m",   label: "Weak — minor centroid displacement" },
  { eps: "ε = 2",   scale: "gridSize / 2  ≈ 560 m",   label: "Moderate — noticeable displacement" },
  { eps: "ε = 1",   scale: "gridSize / 1  ≈ 1.1 km",  label: "Strong — significant noise, high privacy" },
  { eps: "ε = 0.5", scale: "gridSize / 0.5 ≈ 2.2 km", label: "Very strong — maximum distortion" },
];

/* ─── Architecture Diagram ──────────────────────────────────────────────────── */

const NODE_COLORS = {
  frontend:  { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  backend:   { bg: "#dcfce7", border: "#22c55e", text: "#15803d" },
  db:        { bg: "#fef9c3", border: "#eab308", text: "#854d0e" },
  algo:      { bg: "#f3e8ff", border: "#a855f7", text: "#6b21a8" },
  user:      { bg: "#ffedd5", border: "#f97316", text: "#9a3412" },
};

// Dark-mode aware version — colours are overridden via CSS variables in dark theme
function ArchBox({ x, y, w, h, color, icon, label, sub, tooltip: tip }) {
  const [hovered, setHovered] = useState(false);
  const box = (
    <g
      transform={`translate(${x},${y})`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: tip ? "pointer" : "default" }}
    >
      <rect
        width={w} height={h} rx={10} ry={10}
        fill={color.bg}
        stroke={color.border}
        strokeWidth={hovered ? 2.5 : 1.5}
        style={{ transition: "all 0.2s" }}
        filter={hovered ? "drop-shadow(0 4px 8px rgba(0,0,0,0.15))" : "none"}
      />
      <text x={w / 2} y={26} textAnchor="middle" fontSize={18} style={{ userSelect: "none" }}>{icon}</text>
      <text x={w / 2} y={48} textAnchor="middle" fontSize={12} fontWeight={700} fill={color.text} style={{ userSelect: "none" }}>{label}</text>
      {sub && <text x={w / 2} y={63} textAnchor="middle" fontSize={10} fill={color.text} opacity={0.75} style={{ userSelect: "none" }}>{sub}</text>}
    </g>
  );
  return tip ? <Tooltip title={tip}>{box}</Tooltip> : box;
}

function Arrow({ x1, y1, x2, y2, label, dashed }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
        </marker>
      </defs>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#94a3b8" strokeWidth={1.5}
        strokeDasharray={dashed ? "5,4" : "none"}
        markerEnd="url(#arrowhead)"
      />
      {label && (
        <text x={mx} y={my - 6} textAnchor="middle" fontSize={9.5} fill="#64748b" fontStyle="italic">
          {label}
        </text>
      )}
    </g>
  );
}

function ArchitectureDiagram() {
  // Layout: 800 × 440
  // Row 1 (y=20):  User Browser
  // Row 2 (y=140): React Components  →  Express Routes
  // Row 3 (y=260): Anonymization Engine  ←→  MySQL DB
  // Row 4 (y=370): CSV Upload Pipeline (spanning)

  const W = 130, H = 80;

  return (
    <div className="arch-diagram-wrap">
      <svg viewBox="0 0 820 460" style={{ width: "100%", maxHeight: 460 }}>

        {/* ── Row labels ── */}
        <text x={8} y={75}  fontSize={9} fill="#94a3b8" fontWeight={600} textAnchor="start">CLIENT</text>
        <text x={8} y={195} fontSize={9} fill="#94a3b8" fontWeight={600} textAnchor="start">FRONTEND</text>
        <text x={8} y={315} fontSize={9} fill="#94a3b8" fontWeight={600} textAnchor="start">BACKEND</text>
        <text x={8} y={415} fontSize={9} fill="#94a3b8" fontWeight={600} textAnchor="start">PIPELINE</text>

        {/* Row separator lines */}
        {[110, 230, 350].map(y => (
          <line key={y} x1={40} y1={y} x2={790} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4,4" />
        ))}

        {/* ── Row 1: User ── */}
        <ArchBox x={340} y={20}  w={W} h={H} color={NODE_COLORS.user}
          icon="👤" label="User" sub="Web Browser"
          tooltip="The end user interacts with the app entirely in the browser." />

        {/* ── Row 2: Frontend components ── */}
        <ArchBox x={60}  y={140} w={W} h={H} color={NODE_COLORS.frontend}
          icon="🗺️" label="Map View" sub="MapCompare.jsx"
          tooltip="Interactive Leaflet map showing raw trips and anonymized centroids side-by-side." />
        <ArchBox x={220} y={140} w={W} h={H} color={NODE_COLORS.frontend}
          icon="🎛️" label="Controls" sub="FilterComponent.jsx"
          tooltip="Grid size, k value, temporal mode, ℓ-diversity, ε-DP — all settings live here." />
        <ArchBox x={380} y={140} w={W} h={H} color={NODE_COLORS.frontend}
          icon="📊" label="3D Landscape" sub="PrivacyLandscape.jsx"
          tooltip="Three-axis 3D bar chart. Click any bar to instantly apply that privacy configuration." />
        <ArchBox x={540} y={140} w={W} h={H} color={NODE_COLORS.frontend}
          icon="⬆️" label="Upload" sub="CSVUpload.jsx"
          tooltip="Drag-and-drop CSV upload with streaming progress bar and duplicate detection." />
        <ArchBox x={660} y={140} w={W} h={H} color={NODE_COLORS.frontend}
          icon="🧭" label="Top Nav" sub="TopNav.jsx"
          tooltip="Global navigation, theme toggle (light/dark), and page routing." />

        {/* User → Frontend arrows */}
        <Arrow x1={405} y1={100} x2={125} y2={140} label="interacts" />
        <Arrow x1={405} y1={100} x2={285} y2={140} />
        <Arrow x1={405} y1={100} x2={445} y2={140} />
        <Arrow x1={405} y1={100} x2={605} y2={140} />

        {/* ── Row 3: Backend ── */}
        <ArchBox x={60}  y={260} w={W} h={H} color={NODE_COLORS.backend}
          icon="🔀" label="API Routes" sub="Express.js"
          tooltip="REST endpoints: /trips, /anonymize, /upload, /compare. Validates input before passing to services." />
        <ArchBox x={250} y={260} w={160} h={H} color={NODE_COLORS.algo}
          icon="🔐" label="Anonymization Engine" sub="anonymization.js"
          tooltip="Implements merge-nearest k-anonymity, ℓ-diversity attribute checking, and Laplace ε-DP noise on centroids." />
        <ArchBox x={460} y={260} w={W} h={H} color={NODE_COLORS.db}
          icon="🗄️" label="MySQL" sub="bicycle_trips"
          tooltip="Stores raw trips (is_user_uploaded flag), ride_id deduplication, and spatial decimal columns." />

        {/* Frontend → API */}
        <Arrow x1={165} y1={220} x2={125} y2={260} label="fetch()" />
        <Arrow x1={285} y1={220} x2={145} y2={260} />
        <Arrow x1={445} y1={220} x2={145} y2={260} />

        {/* API → Anonymization Engine */}
        <Arrow x1={190} y1={300} x2={250} y2={300} label="query results" />

        {/* Anonymization Engine ↔ MySQL */}
        <Arrow x1={410} y1={300} x2={460} y2={300} label="SELECT" />
        <Arrow x1={460} y1={315} x2={410} y2={315} label="rows" />

        {/* API → MySQL (direct for raw trips) */}
        <Arrow x1={190} y1={290} x2={460} y2={290} dashed label="raw trips" />

        {/* ── Row 4: Upload pipeline ── */}
        <ArchBox x={60}  y={370} w={W} h={H} color={NODE_COLORS.frontend}
          icon="📄" label="CSV File" sub="User upload"
          tooltip="Any point-to-point mobility CSV with 6 required columns. Up to 250 MB." />

        {/* Pipeline arrow boxes */}
        <ArchBox x={220} y={370} w={130} h={H} color={NODE_COLORS.backend}
          icon="✅" label="Validate" sub="uploadRoute.js"
          tooltip="Alias mapping, BOM stripping, coordinate range checks, and empty-row filtering." />
        <ArchBox x={385} y={370} w={130} h={H} color={NODE_COLORS.backend}
          icon="🔄" label="Stream Chunks" sub="1 000-row batches"
          tooltip="Rows are streamed into MySQL in 1,000-row INSERT IGNORE chunks — no full-file memory spike." />
        <ArchBox x={550} y={370} w={130} h={H} color={NODE_COLORS.db}
          icon="🗄️" label="MySQL" sub="INSERT IGNORE"
          tooltip="Deterministic ride_id hash ensures the same file uploaded twice creates no duplicates." />

        {/* Pipeline arrows */}
        <Arrow x1={190} y1={410} x2={220} y2={410} />
        <Arrow x1={350} y1={410} x2={385} y2={410} label="alias mapping" />
        <Arrow x1={515} y1={410} x2={550} y2={410} label="chunked" />

        {/* Upload component → uploadRoute */}
        <Arrow x1={605} y1={220} x2={280} y2={370} dashed label="POST /upload" />

      </svg>

      {/* Legend */}
      <div className="arch-legend">
        {[
          { color: NODE_COLORS.user,     label: "User / Browser" },
          { color: NODE_COLORS.frontend, label: "Frontend (React)" },
          { color: NODE_COLORS.backend,  label: "Backend (Express)" },
          { color: NODE_COLORS.algo,     label: "Anonymization Engine" },
          { color: NODE_COLORS.db,       label: "Database (MySQL)" },
        ].map(({ color, label }) => (
          <span key={label} className="arch-legend-item">
            <span className="arch-legend-dot" style={{ background: color.bg, border: `2px solid ${color.border}` }} />
            <span>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Tab content components ────────────────────────────────────────────────── */

function OverviewTab() {
  return (
    <div className="guide-tab-content">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Alert
            type="info" showIcon
            message="What this application does"
            description="Upload any point-to-point mobility CSV, apply k-anonymity, ℓ-diversity, and/or ε-differential privacy, then compare privacy settings and inspect utility metrics on an interactive map and 3D landscape."
          />
        </Col>

        {/* Feature cards */}
        {[
          { icon: <UploadOutlined />,    color: "#3b82f6", title: "Upload any CSV",         body: "Drag-and-drop mobility datasets from any city. Common column names are auto-detected — no preprocessing needed." },
          { icon: <ClusterOutlined />,   color: "#22c55e", title: "k-Anonymity",            body: "The merge-nearest algorithm clusters trips into groups of at least k, releasing only centroids. Zero k-violations guaranteed." },
          { icon: <SafetyOutlined />,    color: "#a855f7", title: "ℓ-Diversity",           body: "Extends k-anonymity: each released group must contain ≥ ℓ distinct sensitive attribute values, blocking attribute-inference attacks." },
          { icon: <NodeIndexOutlined />, color: "#f97316", title: "ε-Differential Privacy", body: "Adds calibrated Laplace noise to centroids and counts, providing a formal semantic privacy guarantee on top of k-anonymity." },
          { icon: <BarChartOutlined />,  color: "#eab308", title: "Utility Metrics",        body: "Spatial error, density similarity (cosine + JSD), hotspot overlap, suppression rate, and live latency — all displayed in real time." },
          { icon: <AppstoreOutlined />,  color: "#ec4899", title: "3D Privacy Landscape",   body: "Three-axis bar chart across k×temporal, ℓ×attribute, and k×ε axes. Click any bar to instantly apply that configuration to the map." },
        ].map(f => (
          <Col xs={24} sm={12} xl={8} key={f.title}>
            <Card className="guide-card guide-feature-card" size="small">
              <Space align="start">
                <span className="guide-feature-icon" style={{ color: f.color, background: `${f.color}18` }}>
                  {f.icon}
                </span>
                <div>
                  <Text strong style={{ display: "block", marginBottom: 4 }}>{f.title}</Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>{f.body}</Text>
                </div>
              </Space>
            </Card>
          </Col>
        ))}

        {/* Quick-start checklist */}
        <Col span={24}>
          <Card title={<Space><RocketOutlined /> Quick Start</Space>} className="guide-card">
            <Steps
              direction="vertical" size="small"
              items={[
                { title: "Open the Tool page",       description: "Select Preloaded Data to explore the built-in January 2024 Citi Bike (NYC) dataset immediately — no upload required." },
                { title: "Set your privacy budget",  description: "Choose a grid size and k value. Leave ℓ-Diversity and ε-DP off for your first run to see plain k-anonymity." },
                { title: "Load Original + Anonymize",description: "Click Load Original to see raw trip paths, then Run Anonymization. Metrics appear on the right panel." },
                { title: "Compare k Values",         description: "Click Compare k Values to run multiple k settings side-by-side on the same data and filters." },
                { title: "Explore the 3D Landscape", description: "Open the 3D Landscape tab and click any bar to jump to that configuration instantly." },
                { title: "Try your own data",        description: "Go to Upload Data, drop in a CSV from any city, then switch the data source toggle on the Tool page." },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function GettingStartedTab() {
  return (
    <div className="guide-tab-content">
      <Row gutter={[16, 16]}>

        <Col xs={24} xl={14}>
          <Card title={<Space><UploadOutlined /> Uploading a Dataset</Space>} className="guide-card">
            <Steps direction="vertical" size="small" items={[
              { title: "Prepare a mobility CSV", description: "The file must contain trip start/end timestamps and coordinates. Citi Bike headers and common aliases are auto-detected." },
              { title: "Open the Upload Data page", description: "Files up to 250 MB are accepted. Drag-and-drop or click to browse." },
              { title: "Watch the progress bar", description: "The first phase (Sending file…) shows HTTP transfer percentage. Once the file arrives the bar holds at 99% while rows stream into the database." },
              { title: "Switch to User Data", description: "After upload, use the Data Source toggle on the Tool page. The map re-centres automatically and the date picker adjusts to your dataset's date range." },
            ]} />
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card title={<Space><CheckCircleOutlined /> Required Fields</Space>} className="guide-card">
            <Table size="small" pagination={false} dataSource={requiredColumns} rowKey="field"
              columns={[{ title: "Field", dataIndex: "field", width: 200 }, { title: "Purpose", dataIndex: "purpose" }]} />
            <Alert style={{ marginTop: 12 }} type="info" showIcon message="ride_id is optional"
              description="When missing, the importer generates a deterministic SHA-1 hash from coordinates and timestamps. Uploading the same file twice will not create duplicates." />
          </Card>
        </Col>

        <Col span={24}>
          <Card title={<Space><DatabaseOutlined /> Supported Column Aliases</Space>} className="guide-card">
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              The importer automatically maps these column name variants to internal field names. You do not need to rename columns in your CSV.
            </Paragraph>
            <Table size="small" pagination={false} dataSource={aliasRows} rowKey="internal"
              columns={[
                { title: "Internal field",    dataIndex: "internal", width: 180 },
                { title: "Accepted variants", dataIndex: "examples" },
              ]} />
          </Card>
        </Col>

        <Col span={24}>
          <Card title={<Space><GlobalOutlined /> Compatible Public Datasets</Space>} className="guide-card">
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              The tool works with any point-to-point mobility CSV. The alias system auto-detects the most common provider formats:
            </Paragraph>
            <Table size="small" pagination={false} dataSource={multiCityDatasets} rowKey="provider"
              columns={[
                { title: "Provider",            dataIndex: "provider", width: 220 },
                { title: "Open data URL",       dataIndex: "url" },
                { title: "Column format notes", dataIndex: "format" },
              ]} />
          </Card>
        </Col>

      </Row>
    </div>
  );
}

function UsingTheToolTab() {
  return (
    <div className="guide-tab-content">
      <Row gutter={[16, 16]}>

        <Col xs={24} xl={12}>
          <Card title={<Space><ClusterOutlined /> Step-by-Step Workflow</Space>} className="guide-card">
            <Timeline items={[
              { color: "blue",    children: "Choose Preloaded or User Data. Preloaded is January 2024 Citi Bike (NYC); uploaded data can come from any city." },
              { color: "blue",    children: "Set member type, grid size, k value, and temporal privacy mode. Hover any control's ? icon for an inline explanation." },
              { color: "purple",  children: "Optionally enable ℓ-Diversity and choose a sensitive attribute. A warning appears if the member type filter conflicts with the chosen attribute." },
              { color: "volcano", children: "Optionally enable ε-DP noise and choose ε. Smaller ε = more noise = stronger privacy but larger centroid displacement." },
              { color: "green",   children: "Click Load Original to inspect raw trip paths, then Run Anonymization to generate released centroids and heat intensity." },
              { color: "green",   children: "Click Compare k Values to run multiple k values side-by-side. All active settings (ℓ, ε) apply to every comparison column." },
              { color: "purple",  children: "Open the 3D Landscape and switch between k-Anonymity, ℓ-Diversity, and ε-DP modes. Click any bar to instantly apply that configuration." },
            ]} />
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title={<Space><AppstoreOutlined /> Controls Explained</Space>} className="guide-card">
            <Space direction="vertical" size={14} style={{ width: "100%" }}>

              <div className="guide-control-row">
                <Tag color="blue">Grid size</Tag>
                <Text>Spatial resolution of the anonymization grid. Smaller = finer detail but sparser cells and higher suppression. Default 0.01° ≈ 1.1 km.</Text>
              </div>

              <div className="guide-control-row">
                <Tag color="blue">k value</Tag>
                <Text>Each released group must contain at least k trips. Higher k = stronger privacy, more suppression, coarser centroids.</Text>
              </div>

              <div className="guide-control-row">
                <Tag color="cyan">Temporal mode</Tag>
                <Text>Spatial-only is least strict. Day, Period, and Hour modes add a time dimension — trips are grouped by both location AND time bucket, increasing strictness and suppression.</Text>
              </div>

              <div className="guide-control-row">
                <Tag color="purple" icon={<SafetyOutlined />}>ℓ-Diversity</Tag>
                <Text>Extends k-anonymity: each released group must contain ≥ ℓ distinct values of the chosen sensitive attribute. Prevents attribute-inference attacks. Set to Off to use plain k-anonymity.</Text>
              </div>

              <div className="guide-control-row">
                <Tag color="orange" icon={<NodeIndexOutlined />}>ε-DP Noise</Tag>
                <Text>Adds calibrated Laplace noise to centroids and counts. Provides a formal (ε, 0)-differential privacy guarantee on top of k-anonymity's structural guarantee.</Text>
              </div>

              <div className="guide-control-row">
                <Tag color="magenta">3D Landscape</Tag>
                <Text>Three modes — k-Anonymity (k × temporal), ℓ-Diversity (ℓ × sensitive attribute), ε-DP (k × ε). Clicking a bar applies that exact configuration instantly.</Text>
              </div>

            </Space>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={<Space><CodeOutlined /> Offline Benchmark Scripts</Space>} className="guide-card">
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Text>Run a full parameter sweep from the command line:</Text>
              <pre className="guide-code-block">
                {`node scripts/evaluateAnonymization.js \\
  --csv=your-file.csv \\
  --sampleSizes=1000,5000 \\
  --lValues=1,2,3 \\
  --sensitiveAttrs=member_casual,destination_area \\
  --epsilonValues=Infinity,5,2,1`}
              </pre>
              <Text type="secondary">Sweeps k-anonymity, ℓ-diversity, and ε-DP in one pass and writes timestamped JSON + CSV results.</Text>
              <Text>Generate visual reports:</Text>
              <pre className="guide-code-block">node scripts/generateBenchmarkReport.js</pre>
              <Text type="secondary">Produces SVG plots and a Markdown report with comparison tables for all three privacy layers.</Text>
            </Space>
          </Card>
        </Col>

      </Row>
    </div>
  );
}

function PrivacyTab() {
  return (
    <div className="guide-tab-content">
      <Row gutter={[16, 16]}>

        {/* k-Anonymity */}
        <Col span={24}>
          <Card title={<Space><ClusterOutlined /> k-Anonymity — Merge-Nearest Algorithm</Space>} className="guide-card">
            <Row gutter={16}>
              <Col xs={24} md={14}>
                <Paragraph>
                  <strong>k-anonymity</strong> requires that every released record is indistinguishable
                  from at least k−1 others with respect to quasi-identifying attributes (here: start location and time).
                </Paragraph>
                <Paragraph>
                  This tool implements a <strong>merge-nearest</strong> strategy: trips are first assigned to
                  grid cells. Any cell with fewer than k trips is merged with its nearest neighbour
                  (by centroid distance) until the group reaches k. The released value is the centroid
                  of the merged group — never an individual trip's coordinates.
                </Paragraph>
                <Paragraph>
                  <strong>Zero k-violations are guaranteed</strong> — the algorithm never releases a group
                  smaller than k. The cost is suppression: trips that cannot form a valid group are withheld entirely.
                </Paragraph>
              </Col>
              <Col xs={24} md={10}>
                <div className="guide-concept-box" style={{ borderColor: "#3b82f6" }}>
                  <Text strong style={{ color: "#3b82f6" }}>Key trade-off</Text>
                  <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                    <li><Text>Higher k → more privacy, more suppression, coarser centroids</Text></li>
                    <li><Text>Smaller grid → finer detail, sparser cells, higher suppression risk</Text></li>
                    <li><Text>Temporal mode → adds time dimension to grouping, always increases suppression</Text></li>
                  </ul>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* ℓ-Diversity */}
        <Col span={24}>
          <Card title={<Space><SafetyOutlined /> ℓ-Diversity — Attribute Inference Protection</Space>} className="guide-card">
            <Row gutter={16}>
              <Col xs={24} md={14}>
                <Paragraph>
                  <strong>ℓ-diversity</strong> (Machanavajjhala et al., 2006) addresses a weakness of plain k-anonymity:
                  even when a released group contains k trips, all trips might share the same sensitive attribute value,
                  making inference trivial. ℓ-diversity requires at least ℓ <em>distinct</em> values per group.
                </Paragraph>
                <Table size="small" pagination={false} dataSource={lDiversityAttrs} rowKey="attr"
                  columns={[
                    { title: "Sensitive Attribute", dataIndex: "attr",   width: 220 },
                    { title: "Distinct Values",     dataIndex: "values", width: 200 },
                    { title: "Threat Addressed",    dataIndex: "threat" },
                  ]} />
              </Col>
              <Col xs={24} md={10}>
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                  <Alert type="warning" showIcon message="Member Type filter conflict"
                    description={
                      <span>
                        When <strong>Rider type</strong> is the sensitive attribute, Member Type must be set
                        to <strong>All Riders</strong>. Filtering to members-only means every trip has
                        {" "}<code>member_casual = member</code> — only 1 distinct value — making ℓ=2 impossible.
                        A warning with a one-click fix appears in the settings panel when detected.
                      </span>
                    } />
                  <Alert type="info" showIcon message="Destination area is the strongest attribute"
                    description="It protects against destination-inference attacks. Because destination grid cells are numerous, ℓ=2 or ℓ=3 is achievable with minimal extra suppression compared to rider or bike type." />
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* ε-DP */}
        <Col span={24}>
          <Card title={<Space><NodeIndexOutlined /> ε-Differential Privacy — Centroid Noise</Space>} className="guide-card">
            <Row gutter={16}>
              <Col xs={24} md={14}>
                <Paragraph>
                  <strong>Differential privacy</strong> (Dwork, 2006) provides a <em>semantic</em> privacy guarantee:
                  an adversary with arbitrary background knowledge cannot determine with high confidence
                  whether any individual trip contributed to the output. This is stronger than
                  k-anonymity's structural guarantee.
                </Paragraph>
                <Paragraph>
                  This tool implements the <strong>Laplace mechanism</strong> as a post-processing step on k-anonymous centroids:
                </Paragraph>
                <ul style={{ paddingLeft: 18, marginBottom: 12 }}>
                  <li><Text><strong>Location noise:</strong> Laplace(0, gridSize / ε) degrees added to each centroid's lat and lng independently.</Text></li>
                  <li><Text><strong>Count noise:</strong> Laplace(0, 1 / ε) added to each released group's count, clamped to ≥ 1.</Text></li>
                </ul>
                <Table size="small" pagination={false} dataSource={epsilonRows} rowKey="eps"
                  columns={[
                    { title: "ε budget",                       dataIndex: "eps",   width: 100 },
                    { title: "Noise scale (gridSize=0.01°)",   dataIndex: "scale", width: 200 },
                    { title: "Effect",                         dataIndex: "label" },
                  ]} />
              </Col>
              <Col xs={24} md={10}>
                <div className="guide-concept-box" style={{ borderColor: "#f97316" }}>
                  <Text strong style={{ color: "#f97316" }}>Syntactic vs. Semantic</Text>
                  <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    <strong>k-anonymity + ℓ-diversity</strong> are <em>syntactic</em> methods — they make
                    structural guarantees about released groups but cannot bound an adversary's inference gain.
                  </Paragraph>
                  <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    <strong>ε-DP</strong> is a <em>semantic</em> method — it bounds the posterior probability
                    update any adversary can achieve, regardless of their prior knowledge.
                  </Paragraph>
                  <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    Layering all three (k-anon → ℓ-div → ε-DP) provides the strongest combined protection.
                  </Paragraph>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

      </Row>
    </div>
  );
}

function MetricsTab() {
  return (
    <div className="guide-tab-content">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title={<Space><BarChartOutlined /> All Metrics Explained</Space>} className="guide-card">
            <Table
              size="small"
              pagination={false}
              dataSource={metricRows}
              rowKey="metric"
              columns={[
                { title: "Metric",               dataIndex: "metric",  width: 260 },
                { title: "How to interpret it",  dataIndex: "meaning" },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title={<Space><InfoCircleOutlined /> JSD vs Cosine Density Similarity</Space>} className="guide-card">
            <Space direction="vertical" size={10}>
              <Text>Both metrics compare raw and anonymized density distributions across grid cells.</Text>
              <div className="guide-concept-box" style={{ borderColor: "#3b82f6" }}>
                <Text strong style={{ color: "#3b82f6" }}>Cosine Similarity</Text>
                <Paragraph style={{ marginTop: 6, marginBottom: 0 }}>
                  Captures directional alignment. Two distributions that preserve which cells are busy
                  score high even if their magnitudes differ. Good for checking if the <em>pattern</em> of activity is preserved.
                </Paragraph>
              </div>
              <div className="guide-concept-box" style={{ borderColor: "#a855f7" }}>
                <Text strong style={{ color: "#a855f7" }}>JSD Similarity (1 − JSD)</Text>
                <Paragraph style={{ marginTop: 6, marginBottom: 0 }}>
                  Treats each distribution as a probability distribution. Sensitive to both pattern changes
                  and magnitude shifts. Stricter than cosine — a high JSD score means the anonymized
                  heatmap is close in both shape and intensity.
                </Paragraph>
              </div>
              <Text type="secondary">Both values near 1.0 = strong utility preservation.</Text>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title={<Space><ThunderboltOutlined /> Privacy vs Utility Trade-off</Space>} className="guide-card">
            <Space direction="vertical" size={10}>
              <Text>Increasing privacy always costs utility. Here is what each dial does:</Text>
              {[
                { control: "↑ k", effect: "More suppression, larger centroid displacement, lower spatial utility" },
                { control: "↑ ℓ", effect: "More suppression (groups must be more diverse), similar spatial error" },
                { control: "↓ ε", effect: "Larger centroid noise, higher mean error, lower density similarity" },
                { control: "Finer grid", effect: "Sparser cells, higher suppression risk even at low k" },
                { control: "Stricter temporal", effect: "Hour mode suppresses much more than spatial-only" },
              ].map(r => (
                <div key={r.control} className="guide-control-row">
                  <Tag color="geekblue" style={{ fontFamily: "monospace", minWidth: 90 }}>{r.control}</Tag>
                  <Text type="secondary" style={{ fontSize: 13 }}>{r.effect}</Text>
                </div>
              ))}
            </Space>
          </Card>
        </Col>

      </Row>
    </div>
  );
}

function ArchitectureTab() {
  return (
    <div className="guide-tab-content">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Alert type="info" showIcon
            message="Hover over any node in the diagram to learn more about that component."
          />
        </Col>
        <Col span={24}>
          <Card title={<Space><ApartmentOutlined /> Live Application Architecture</Space>} className="guide-card">
            <ArchitectureDiagram />
          </Card>
        </Col>

        {/* Component summaries */}
        <Col xs={24} md={12} xl={8}>
          <Card title={<Space><DesktopOutlined /> Frontend (React)</Space>} className="guide-card" size="small">
            <Space direction="vertical" size={6}>
              {[
                { name: "MapCompare.jsx",        desc: "Side-by-side Leaflet map — raw trips on the left, anonymized centroids on the right." },
                { name: "FilterComponent.jsx",   desc: "All anonymization controls: grid size, k, temporal mode, ℓ-diversity, ε-DP." },
                { name: "PrivacyLandscape.jsx",  desc: "Three-axis 3D bar chart. Clicking a bar instantly applies that configuration." },
                { name: "CSVUpload.jsx",         desc: "Drag-and-drop uploader with streaming progress, validation feedback, and duplicate detection." },
                { name: "TopNav.jsx",            desc: "Global navigation, theme toggle (light/dark), and page routing." },
              ].map(c => (
                <div key={c.name}>
                  <Text code style={{ fontSize: 12 }}>{c.name}</Text>
                  <Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 2 }}>{c.desc}</Text>
                </div>
              ))}
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12} xl={8}>
          <Card title={<Space><ApiOutlined /> Backend (Express.js)</Space>} className="guide-card" size="small">
            <Space direction="vertical" size={6}>
              {[
                { name: "bicycleRoute.js",      desc: "REST endpoints: /trips (raw), /anonymize, /compare, /stats." },
                { name: "uploadRoute.js",       desc: "Handles CSV upload: alias mapping, BOM stripping, coordinate validation, 1,000-row streaming inserts." },
                { name: "anonymization.js",     desc: "Merge-nearest k-anonymity, ℓ-diversity attribute checking, Laplace ε-DP noise." },
                { name: "bicycleTrips.js",      desc: "MySQL query layer — trip retrieval, date filtering, user vs. preloaded data separation." },
              ].map(c => (
                <div key={c.name}>
                  <Text code style={{ fontSize: 12 }}>{c.name}</Text>
                  <Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 2 }}>{c.desc}</Text>
                </div>
              ))}
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12} xl={8}>
          <Card title={<Space><DatabaseOutlined /> Database & Pipeline</Space>} className="guide-card" size="small">
            <Space direction="vertical" size={6}>
              <Text strong style={{ fontSize: 13 }}>MySQL — bicycle_trips table</Text>
              {[
                "ride_id VARCHAR(255) — primary key, deterministic hash when absent",
                "started_at / ended_at — DATETIME, indexed for date-range queries",
                "start_lat/lng + end_lat/lng — DECIMAL(10,8) / (11,8)",
                "is_user_uploaded BOOLEAN — separates preloaded from user data",
              ].map(f => <Text key={f} type="secondary" style={{ fontSize: 12, display: "block" }}>• {f}</Text>)}
              <Text strong style={{ fontSize: 13, marginTop: 6, display: "block" }}>Upload Pipeline</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                CSV → alias mapping → BOM strip → coordinate validation →
                1,000-row INSERT IGNORE chunks → deduplication via ride_id hash
              </Text>
            </Space>
          </Card>
        </Col>

        <Col span={24}>
          <Card title={<Space><BranchesOutlined /> Data Flow Summary</Space>} className="guide-card" size="small">
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>Query flow (Tool page)</Text>
                <div className="guide-flow-steps">
                  {[
                    "User sets filters in FilterComponent",
                    "React calls fetch() → Express /anonymize endpoint",
                    "Route validates params, queries MySQL for raw trips",
                    "anonymization.js runs merge-nearest k-anon",
                    "ℓ-diversity check merges non-diverse groups",
                    "ε-DP Laplace noise added to centroids (if enabled)",
                    "JSON response → MapCompare renders results + metrics",
                  ].map((s, i) => (
                    <div key={i} className="guide-flow-step">
                      <span className="guide-flow-num">{i + 1}</span>
                      <Text style={{ fontSize: 13 }}>{s}</Text>
                    </div>
                  ))}
                </div>
              </Col>
              <Col xs={24} md={12}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>Upload flow</Text>
                <div className="guide-flow-steps">
                  {[
                    "User drops CSV on CSVUpload component",
                    "File sent as multipart POST /upload",
                    "uploadRoute.js strips BOM, maps column aliases",
                    "Rows validated (coordinates in range, timestamps parseable)",
                    "ride_id generated if absent (SHA-1 of coords + times)",
                    "INSERT IGNORE in 1,000-row batches → MySQL",
                    "Success response → user switches to User Data source",
                  ].map((s, i) => (
                    <div key={i} className="guide-flow-step">
                      <span className="guide-flow-num">{i + 1}</span>
                      <Text style={{ fontSize: 13 }}>{s}</Text>
                    </div>
                  ))}
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

      </Row>
    </div>
  );
}

/* ─── Main Guide component ──────────────────────────────────────────────────── */

const TABS = [
  { key: "overview",      label: <Space><AppstoreOutlined />Overview</Space>,           children: <OverviewTab /> },
  { key: "getting-started", label: <Space><UploadOutlined />Getting Started</Space>,    children: <GettingStartedTab /> },
  { key: "using-the-tool", label: <Space><ClusterOutlined />Using the Tool</Space>,     children: <UsingTheToolTab /> },
  { key: "privacy",       label: <Space><SafetyOutlined />Privacy Techniques</Space>,   children: <PrivacyTab /> },
  { key: "metrics",       label: <Space><BarChartOutlined />Metrics</Space>,            children: <MetricsTab /> },
  { key: "architecture",  label: <Space><ApartmentOutlined />Architecture</Space>,      children: <ArchitectureTab /> },
];

const Guide = () => {
  const [activeTab, setActiveTab] = useState("overview");

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
            Upload mobility datasets, apply k-anonymity with optional ℓ-diversity and ε-DP,
            compare privacy settings, interpret utility metrics, and explore the 3D privacy-utility landscape.
          </Paragraph>
        </div>
        <Tag icon={<GlobalOutlined />} color="blue">Global CSV support</Tag>
      </section>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        className="guide-tabs"
        items={TABS}
        size="middle"
      />
    </div>
  );
};

export default Guide;
