import React, { useState, useEffect, useCallback } from "react";
import {
  Alert, Button, Card, Col, Row, Space, Steps, Table, Tag, Timeline, Tabs, Typography, Tooltip,
} from "antd";
import {
  ApartmentOutlined, AppstoreOutlined, BarChartOutlined, CheckCircleOutlined,
  ClusterOutlined, DatabaseOutlined, FileSearchOutlined, GlobalOutlined,
  NodeIndexOutlined, SafetyOutlined, UploadOutlined, ApiOutlined,
  DesktopOutlined, CodeOutlined, ThunderboltOutlined, InfoCircleOutlined,
  RocketOutlined, BranchesOutlined, PlayCircleOutlined, PauseCircleOutlined,
  StepForwardOutlined, StepBackwardOutlined, ReloadOutlined, OrderedListOutlined,
  ExperimentOutlined, FunctionOutlined, PartitionOutlined,
} from "@ant-design/icons";

const { Paragraph, Text, Title } = Typography;


const requiredColumns = [
  { field: "started_at",             purpose: "Trip start timestamp" },
  { field: "ended_at",               purpose: "Trip end timestamp" },
  { field: "start_lat / start_lng",  purpose: "Trip start coordinates (decimal degrees)" },
  { field: "end_lat / end_lng",      purpose: "Trip end coordinates (decimal degrees)" },
];

const optionalColumns = [
  { field: "ride_id",        purpose: "Optional stable trip identifier; generated deterministically when missing" },
  { field: "member_casual",  purpose: "Optional rider type; supports rider-type filtering and l-diversity" },
  { field: "rideable_type",  purpose: "Optional bike type; supports bike-type l-diversity when present" },
  { field: "gender",         purpose: "Optional Hubway-style demographic attribute; normalized from 0/1/2 or text values" },
  { field: "birth_year",     purpose: "Optional demographic input; converted to age_band for privacy demonstrations" },
  { field: "age_band",       purpose: "Derived optional field, e.g. 20-29 or 30-39; used instead of exact birth year in the Tool page" },
  { field: "bike_id",        purpose: "Optional operational identifier stored for import completeness, not used as a release attribute" },
  { field: "tripduration",   purpose: "Optional trip duration metadata from Hubway-style datasets" },
];

const aliasRows = [
  { internal: "started_at",    examples: "start_time, starttime, start_date, started, start_time_local" },
  { internal: "ended_at",      examples: "end_time, stoptime, end_date, ended, end_time_local" },
  { internal: "start_lat",     examples: "start_latitude, from_lat, start station latitude, start_station_latitude" },
  { internal: "start_lng",     examples: "start_lon, start_longitude, from_lon, start station longitude" },
  { internal: "end_lat",       examples: "end_latitude, to_lat, end station latitude, end_station_latitude" },
  { internal: "end_lng",       examples: "end_lon, end_longitude, to_lon, end station longitude" },
  { internal: "ride_id",       examples: "trip_id, rental_id, id; deterministic hash generated when missing" },
  { internal: "member_casual", examples: "user_type, usertype, customer_type, membership_type, subscriber_type" },
  { internal: "rideable_type", examples: "bike_type, vehicle_type, type" },
  { internal: "gender",        examples: "gender, sex; Hubway numeric codes 1/2/0 become male/female/unknown" },
  { internal: "birth_year",    examples: "birth year, birthyear, year_of_birth, year of birth" },
  { internal: "bike_id",       examples: "bikeid, bike id, bike_number, vehicle_id" },
  { internal: "tripduration",  examples: "tripduration, trip_duration, duration, duration_sec" },
];

const metricRows = [
  { metric: "k Violations",               meaning: "Released groups smaller than k. This should always be 0 because the merge-nearest algorithm merges any undersized group before releasing it." },
  { metric: "Released Groups",            meaning: "Number of distinct anonymized clusters returned. Fewer groups means broader generalization and stronger privacy." },
  { metric: "Suppressed",                 meaning: "Trips withheld because no valid k-anonymous group (and ℓ-diverse group, if enabled) could be formed for them." },
  { metric: "Mean Error (km)",            meaning: "Average distance between each trip's original start point and the centroid of its released group. Lower values indicate better spatial accuracy." },
  { metric: "Density Similarity (Cosine)",meaning: "Cosine similarity between raw and anonymized grid-cell density distributions. Values near 1.0 indicate the anonymized heatmap closely matches the original." },
  { metric: "Density Similarity (JSD)",   meaning: "One minus Jensen-Shannon Divergence. Treats densities as probability distributions and penalises both pattern and magnitude changes. Values closer to 1 are better." },
  { metric: "Hotspot Overlap",            meaning: "Fraction of the top-10 busiest raw grid cells still present after anonymization. A value near 1.0 means major hotspots survived." },
  { metric: "DB Query / Backend Total",   meaning: "Live latency breakdown. DB Query measures MySQL retrieval time and Backend Total also includes the anonymization algorithm." },
  { metric: "ℓ Violations",              meaning: "Groups failing the ℓ-diversity constraint. Should remain 0 after the merge algorithm runs. Only shown when ℓ is 2 or higher." },
  { metric: "Min / Avg Distinct Values",  meaning: "Diversity statistics per released group, showing the minimum and average distinct sensitive-attribute values. A group with min equal to ℓ is the tightest." },
  { metric: "Avg Centroid Displacement",  meaning: "ε-DP only. Average Laplace noise displacement applied to released centroids. A smaller ε produces a larger displacement." },
  { metric: "Noise Scale (km)",           meaning: "ε-DP only. The Laplace distribution scale parameter (gridSize / ε) converted to km. Around 68% of displacement values fall within this distance." },
];

const lDiversityAttrs = [
  { attr: "Rider type (member_casual)", values: "member, casual (2 values)",                    threat: "An adversary who knows the grid cell cannot infer whether the person is a commuter or tourist." },
  { attr: "Bike type (rideable_type)",  values: "classic_bike, electric_bike, docked_bike (up to 3)", threat: "Prevents inference of bike preference or accessibility device use." },
  { attr: "Gender (gender)",            values: "male, female, unknown / text categories",      threat: "Prevents demographic attribute disclosure for Hubway-style datasets when gender is present." },
  { attr: "Age band (age_band)",        values: "decade bands derived from birth_year",         threat: "Demonstrates age-related disclosure protection without releasing exact birth year." },
  { attr: "Destination area",           values: "Grid cell key derived from end_lat/end_lng",   threat: "Strongest protection: each group covers ≥ ℓ distinct destination neighbourhoods, blocking destination-inference attacks." },
];

const multiCityDatasets = [
  { provider: "Citi Bike (NYC)",           url: "citibikenyc.com/system-data",         format: "Standard Citi Bike CSV (all fields)" },
  { provider: "Divvy (Chicago)",           url: "divvybikes.com/system-data",           format: "starttime/stoptime aliases auto-detected" },
  { provider: "Bluebikes (Boston)",        url: "bluebikes.com/system-data",            format: "start_time / end_time aliases auto-detected" },
  { provider: "Hubway (Boston legacy)",     url: "bluebikes.com/system-data",            format: "starttime/stoptime plus optional gender, birth year, bikeid, tripduration" },
  { provider: "Capital Bikeshare (DC)",    url: "capitalbikeshare.com/system-data",     format: "start_time / end_time aliases" },
  { provider: "Santander Cycles (London)", url: "tfl.gov.uk/info-for/open-data-users",  format: "StartDate / EndDate (may need column rename)" },
  { provider: "Custom dataset",            url: "n/a",                                  format: "Any CSV with the 6 required coordinate and timestamp fields" },
];

const getOpenDataHref = (url) => {
  if (!url || url === "n/a") return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

const renderOpenDataUrl = (url) => {
  const href = getOpenDataHref(url);
  if (!href) return <Text type="secondary">n/a</Text>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {url}
    </a>
  );
};

const epsilonRows = [
  { eps: "ε = 10",  scale: "gridSize / 10 ≈ 110 m",   label: "Very weak: barely detectable noise" },
  { eps: "ε = 5",   scale: "gridSize / 5  ≈ 220 m",   label: "Weak: minor centroid displacement" },
  { eps: "ε = 2",   scale: "gridSize / 2  ≈ 560 m",   label: "Moderate: noticeable displacement" },
  { eps: "ε = 1",   scale: "gridSize / 1  ≈ 1.1 km",  label: "Strong: significant noise and high privacy" },
  { eps: "ε = 0.5", scale: "gridSize / 0.5 ≈ 2.2 km", label: "Very strong: maximum distortion" },
];


const NODE_COLORS = {
  frontend:  { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  backend:   { bg: "#dcfce7", border: "#22c55e", text: "#15803d" },
  db:        { bg: "#fef9c3", border: "#eab308", text: "#854d0e" },
  algo:      { bg: "#f3e8ff", border: "#a855f7", text: "#6b21a8" },
  user:      { bg: "#ffedd5", border: "#f97316", text: "#9a3412" },
};


function ArchBox({ x, y, w, h, color, icon, label, sub, tooltip: tip, live }) {
  const [hovered, setHovered] = useState(false);
  const active = hovered || live;
  const box = (
    <g
      transform={`translate(${x},${y})`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: tip ? "pointer" : "default" }}
    >
      <rect
        width={w} height={h} rx={10} ry={10}
        fill={active ? color.border + "28" : color.bg}
        stroke={color.border}
        strokeWidth={active ? 2.5 : 1.5}
        style={{ transition: "all 0.2s" }}
        filter={active ? "drop-shadow(0 4px 10px rgba(0,0,0,0.2))" : "none"}
      />
      <text x={w / 2} y={26} textAnchor="middle" fontSize={18} style={{ userSelect: "none" }}>{icon}</text>
      <text x={w / 2} y={47} textAnchor="middle" fontSize={12} fontWeight={700} fill={color.text} style={{ userSelect: "none" }}>{label}</text>
      {sub && <text x={w / 2} y={62} textAnchor="middle" fontSize={10} fill={color.text} opacity={0.75} style={{ userSelect: "none" }}>{sub}</text>}
    </g>
  );
  return tip ? <Tooltip title={tip}>{box}</Tooltip> : box;
}

// Single arrowhead marker rendered once inside <defs>
function ArchDefs() {
  return (
    <defs>
      {/* Standard arrowheads */}
      <marker id="arch-ah" markerWidth="9" markerHeight="9" refX="9" refY="3.5" orient="auto">
        <path d="M0,0 L0,7 L9,3.5 z" fill="#94a3b8" />
      </marker>
      <marker id="arch-ah-blue" markerWidth="9" markerHeight="9" refX="9" refY="3.5" orient="auto">
        <path d="M0,0 L0,7 L9,3.5 z" fill="#3b82f6" />
      </marker>
      <marker id="arch-ah-green" markerWidth="9" markerHeight="9" refX="9" refY="3.5" orient="auto">
        <path d="M0,0 L0,7 L9,3.5 z" fill="#22c55e" />
      </marker>
    </defs>
  );
}

// SVG path arrow for straight, curved, and L-shaped routes.
function ArchArrow({ d, label, lx, ly, dashed, liveFlow, color, thick }) {
  const isLive  = !!liveFlow;
  const isThick = !!thick;
  const stroke  = isLive ? (color || "#3b82f6") : (isThick ? "#64748b" : "#94a3b8");
  const sw      = isThick ? (isLive ? 3.5 : 2.5) : (isLive ? 2 : 1.5);

  let markerId;
  if (isThick) {
    markerId = isLive && color === "#22c55e" ? "arch-ah-big-green" : "arch-ah-big";
  } else {
    markerId = isLive
      ? (color === "#22c55e" ? "arch-ah-green" : "arch-ah-blue")
      : "arch-ah";
  }

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeDasharray={dashed ? "5,4" : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={`url(#${markerId})`}
        className={isLive ? "arch-live-arrow" : undefined}
      />
      {label && (
        <text
          x={lx} y={ly}
          textAnchor="middle"
          fontSize={isThick ? 11 : 9.5}
          fontWeight={isThick ? 600 : 400}
          fill={isThick ? "#374151" : "#64748b"}
          fontStyle="italic"
        >
          {label}
        </text>
      )}
    </g>
  );
}

// Live-mode flags decide which arrows light up.

const ARROWS = [
  // id,  path d,                                                        label, lx,  ly,   dashed  queryFlow  uploadFlow  color
  ["u-mv", "M 404,93 C 330,104 218,108 114,118",                         "interacts", 264, 101, false, true,  false, "#3b82f6"],
  ["u-ct", "M 424,93 C 374,106 306,109 249,118",                         null, 0, 0,        false, true,  false, "#3b82f6"],
  ["u-ld", "M 430,93 C 420,102 405,109 389,118",                         null, 0, 0,        false, true,  false, "#3b82f6"],
  ["u-up", "M 456,93 C 486,104 515,110 539,118",                         null, 0, 0,        false, false, true,  "#22c55e"],
  ["mv-ap","M 114,193 L 114,238",                                         "fetch()", 147, 217, false, true, false, "#3b82f6"],
  ["ct-ap","M 249,193 L 140,238",                                          null, 0, 0,       false, true,  false, "#3b82f6"],
  ["ld-ap","M 389,193 L 160,238",                                          null, 0, 0,       false, true,  false, "#3b82f6"],
  // API → Anon Engine (straight)
  ["ap-an","M 173,272 L 240,272",                                         "query results", 207,264, false, true, false, "#3b82f6"],
  // Anon → MySQL SELECT
  ["an-db","M 395,270 L 445,270",                                         "SELECT", 420, 262, false, true, false, "#3b82f6"],
  // MySQL → Anon rows (return)
  ["db-an","M 445,284 L 395,284",                                         "rows", 420, 296, false, true, false, "#3b82f6"],
  // API → MySQL raw trips — curved BELOW AnonEngine and MySQL (avoids node overlap)
  ["ap-db","M 114,316 C 150,378 432,378 494,324 C 498,322 501,319 504,316", "raw trips", 292, 362, true, true, false, "#3b82f6"],
  // Upload → Validate — L-shaped route via right margin (avoids all backend nodes)
  ["up-vl","M 539,193 L 539,210 L 760,210 L 760,384 L 267,384 L 267,409","POST /upload", 680, 204, true, false, true, "#22c55e"],
  // Pipeline arrows use standard weight; spacing keeps labels clear between boxes.
  ["cv-vl","M 173,446 L 205,446",                                          null, 0, 0,       false, false, true,  "#22c55e"],
  ["vl-st","M 330,446 L 430,446",                                         "alias mapping", 380, 436, false, false, true,  "#22c55e"],
  ["st-db","M 560,446 L 665,446",                                         "data rows chunked",       612, 436, false, false, true,  "#22c55e"],
];

function ArchitectureDiagram() {
  const [liveMode, setLiveMode] = useState("off"); // "off" | "query" | "upload"

  const toggleMode = useCallback((mode) => {
    setLiveMode(prev => prev === mode ? "off" : mode);
  }, []);

  const queryLive   = liveMode === "query";
  const uploadLive  = liveMode === "upload";

  return (
    <div>
      {/* Live-mode toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Text strong style={{ fontSize: 13 }}>Live flow:</Text>
        <Button
          size="small"
          type={queryLive ? "primary" : "default"}
          icon={<PlayCircleOutlined />}
          onClick={() => toggleMode("query")}
        >
          {queryLive ? "Pause" : "Show"} Query Flow
        </Button>
        <Button
          size="small"
          type={uploadLive ? "primary" : "default"}
          icon={<PlayCircleOutlined />}
          style={uploadLive ? { background: "#22c55e", borderColor: "#22c55e" } : {}}
          onClick={() => toggleMode("upload")}
        >
          {uploadLive ? "Pause" : "Show"} Upload Flow
        </Button>
        {liveMode !== "off" && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            ● Animated arrows show the active data path
          </Text>
        )}
      </div>

      <div className="arch-diagram-wrap">
        {/* viewBox: 860 × 510. Extra right space (x>750) used by POST /upload routing. */}
        <svg viewBox="0 0 860 550" style={{ width: "100%", maxHeight: 550 }}>
          <ArchDefs />

          {/* Row label texts */}
          <text x={2} y={54}  fontSize={9} fill="#94a3b8" fontWeight={600} dominantBaseline="middle">CLIENT</text>
          <text x={2} y={156} fontSize={9} fill="#94a3b8" fontWeight={600} dominantBaseline="middle">FRONTEND</text>
          <text x={2} y={277} fontSize={9} fill="#94a3b8" fontWeight={600} dominantBaseline="middle">BACKEND</text>
          <text x={2} y={447} fontSize={9} fill="#94a3b8" fontWeight={600} dominantBaseline="middle">PIPELINE</text>

          {/* Horizontal row separators */}
          {[110, 228, 398].map(y => (
            <line key={y} x1={50} y1={y} x2={810} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4,4" />
          ))}

          {ARROWS.map(([id, d, label, lx, ly, dashed, qFlow, uFlow, color, thick]) => (
            <ArchArrow
              key={id}
              d={d}
              label={label}
              lx={lx} ly={ly}
              dashed={dashed}
              liveFlow={(queryLive && qFlow) || (uploadLive && uFlow)}
              color={color}
              thick={thick}
            />
          ))}

          <ArchBox x={371} y={15}  w={118} h={78} color={NODE_COLORS.user}
            icon="👤" label="User" sub="Web Browser"
            tooltip="The end user interacts with the app entirely in the browser."
            live={liveMode !== "off"} />

          <ArchBox x={55}  y={118} w={118} h={75} color={NODE_COLORS.frontend}
            icon="🗺️" label="Map View" sub="MapCompare.jsx"
            tooltip="Interactive Leaflet map showing raw trips and anonymized centroids side-by-side."
            live={queryLive} />
          <ArchBox x={190} y={118} w={118} h={75} color={NODE_COLORS.frontend}
            icon="🎛️" label="Controls" sub="FilterComponent.jsx"
            tooltip="Grid size, k value, temporal mode, ℓ-diversity, and ε-DP: all settings live here."
            live={queryLive} />
          <ArchBox x={330} y={118} w={118} h={75} color={NODE_COLORS.frontend}
            icon="📊" label="3D Landscape" sub="PrivacyLandscape.jsx"
            tooltip="Three-axis 3D bar chart. Click any bar to instantly apply that privacy configuration."
            live={queryLive} />
          <ArchBox x={480} y={118} w={118} h={75} color={NODE_COLORS.frontend}
            icon="⬆️" label="Upload" sub="CSVUpload.jsx"
            tooltip="Drag-and-drop CSV upload with streaming progress bar and duplicate detection."
            live={uploadLive} />
          <ArchBox x={625} y={118} w={118} h={75} color={NODE_COLORS.frontend}
            icon="🧭" label="Top Nav" sub="TopNav.jsx"
            tooltip="Global navigation, theme toggle (light/dark), and page routing." />

          <ArchBox x={55}  y={238} w={118} h={78} color={NODE_COLORS.backend}
            icon="🔀" label="API Routes" sub="Express.js"
            tooltip="REST endpoints: /trips, /anonymize, /upload, /compare. Validates input before passing to services."
            live={queryLive || uploadLive} />
          <ArchBox x={240} y={238} w={155} h={78} color={NODE_COLORS.algo}
            icon="🔐" label="Anonymization Engine" sub="anonymization.js"
            tooltip="Implements merge-nearest k-anonymity, ℓ-diversity attribute checking, and Laplace ε-DP noise on centroids."
            live={queryLive} />
          <ArchBox x={445} y={238} w={118} h={78} color={NODE_COLORS.db}
            icon="🗄️" label="MySQL" sub="bicycle_trips"
            tooltip="Stores raw trips (is_user_uploaded flag), ride_id deduplication, and spatial decimal columns."
            live={queryLive} />

          <ArchBox x={55}  y={409} w={118} h={75} color={NODE_COLORS.frontend}
            icon="📄" label="CSV File" sub="User upload"
            tooltip="Any point-to-point mobility CSV with 6 required columns. Up to 250 MB."
            live={uploadLive} />
          <ArchBox x={205} y={409} w={125} h={75} color={NODE_COLORS.backend}
            icon="✅" label="Validate" sub="uploadRoute.js"
            tooltip="Alias mapping, BOM stripping, coordinate range checks, and empty-row filtering."
            live={uploadLive} />
          <ArchBox x={430} y={409} w={130} h={75} color={NODE_COLORS.backend}
            icon="🔄" label="Stream Chunks" sub="1 000-row batches"
            tooltip="CSV is split into 5,000-row chunks and uploaded via resumable session endpoints. Each chunk is retried independently on network error."
            live={uploadLive} />
          <ArchBox x={665} y={409} w={125} h={75} color={NODE_COLORS.db}
            icon="🗄️" label="MySQL" sub="INSERT IGNORE"
            tooltip="Deterministic ride_id hash ensures the same file uploaded twice creates no duplicates."
            live={uploadLive} />
        </svg>
      </div>

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


const SEQ_SVG_W   = 900;
const SEQ_EDGE_PAD = 16;
const ACTOR_BOX_W = 105;
const ACTOR_BOX_H = 36;   // reduced: medium size
const STEP_Y0     = 88;   // y of first message row
const STEP_DY     = 40;   // vertical distance between rows (was 54)

// Step type controls arrow style: call, return, or self-loop.

const QUERY_ACTORS = [
  { label: "User",        color: NODE_COLORS.user },
  { label: "Controls",    color: NODE_COLORS.frontend },
  { label: "MapCompare",  color: NODE_COLORS.frontend },
  { label: "Express API", color: NODE_COLORS.backend },
  { label: "Anon Engine", color: NODE_COLORS.algo },
  { label: "MySQL",       color: NODE_COLORS.db },
];

const QUERY_STEPS = [
  { from: 0, to: 1, type: "call",   label: "Set k, gridSize, filters" },
  { from: 0, to: 2, type: "call",   label: "Click 'Run Anonymization'" },
  { from: 2, to: 3, type: "call",   label: "POST /anonymize {params}" },
  { from: 3, to: 5, type: "call",   label: "SELECT trips WHERE date BETWEEN …" },
  { from: 5, to: 3, type: "return", label: "raw trip records" },
  { from: 3, to: 4, type: "call",   label: "runAnonymization(trips, k, ℓ, ε)" },
  { from: 4, to: 4, type: "self",   label: "Grid assign + merge-nearest k-anon" },
  { from: 4, to: 4, type: "self",   label: "ℓ-diversity check & merge groups" },
  { from: 4, to: 4, type: "self",   label: "Apply Laplace ε-DP noise to centroids" },
  { from: 4, to: 3, type: "return", label: "centroids + metrics JSON" },
  { from: 3, to: 2, type: "return", label: "200 OK { centroids, metrics }" },
  { from: 2, to: 0, type: "return", label: "Render anonymized map + metric panel" },
];

const UPLOAD_ACTORS = [
  { label: "User",       color: NODE_COLORS.user },
  { label: "CSVUpload",  color: NODE_COLORS.frontend },
  { label: "Express API",color: NODE_COLORS.backend },
  { label: "uploadRoute",color: NODE_COLORS.backend },
  { label: "MySQL",      color: NODE_COLORS.db },
];

const UPLOAD_STEPS = [
  { from: 0, to: 1, type: "call",   label: "Drag & drop CSV file" },
  { from: 1, to: 1, type: "self",   label: "Validate file type & size (≤ 250 MB)" },
  { from: 1, to: 1, type: "self",   label: "Fingerprint file; check localStorage for resume" },
  { from: 1, to: 2, type: "call",   label: "POST /session/start { filename, totalRows }" },
  { from: 2, to: 1, type: "return", label: "{ sessionId, resumeChunk }" },
  { from: 1, to: 1, type: "self",   label: "Split into 5,000-row chunks" },
  { from: 1, to: 2, type: "call",   label: "POST /session/:id/chunk (chunk payload)" },
  { from: 2, to: 3, type: "call",   label: "Parse, alias-map, validate rows" },
  { from: 3, to: 2, type: "return", label: "INSERT IGNORE batch → row counts" },
  { from: 2, to: 1, type: "return", label: "chunk accepted" },
  { from: 1, to: 1, type: "self",   label: "Repeat for remaining chunks (retry on error)" },
  { from: 1, to: 2, type: "call",   label: "POST /session/:id/complete" },
  { from: 2, to: 1, type: "return", label: "200 OK { rowsInserted, duplicates }" },
];

const DELETE_ACTORS = [
  { label: "User",        color: NODE_COLORS.user },
  { label: "CSVUpload",   color: NODE_COLORS.frontend },
  { label: "Express API", color: NODE_COLORS.backend },
  { label: "MySQL",       color: NODE_COLORS.db },
];

const DELETE_STEPS = [
  { from: 0, to: 1, type: "call",   label: "Click 'Delete My Data'" },
  { from: 1, to: 1, type: "self",   label: "Show confirmation dialog" },
  { from: 0, to: 1, type: "call",   label: "Confirm deletion" },
  { from: 1, to: 2, type: "call",   label: "EventSource: DELETE /user-data (SSE)" },
  { from: 2, to: 2, type: "self",   label: "SSE: { type: 'start', total }" },
  { from: 2, to: 3, type: "call",   label: "DELETE trips WHERE is_user_uploaded=1 (batched)" },
  { from: 3, to: 2, type: "return", label: "rows deleted per batch" },
  { from: 2, to: 1, type: "return", label: "SSE: { type: 'progress', deleted, total }" },
  { from: 1, to: 1, type: "self",   label: "Update progress bar" },
  { from: 2, to: 1, type: "return", label: "SSE: { type: 'done', deleted }" },
  { from: 1, to: 1, type: "self",   label: "Close SSE, reset state, show success" },
];

const STEP_DESCRIPTIONS = {
  query: [
    "The user opens the Controls panel and adjusts the anonymization parameters.",
    "The user clicks 'Run Anonymization' on the Map Compare page.",
    "MapCompare sends the parameters to the Express.js /anonymize endpoint.",
    "Express queries MySQL for raw trip records matching the date/member filters.",
    "MySQL returns the matching raw trip records to the API layer.",
    "The API passes the raw trips to the Anonymization Engine service.",
    "The engine assigns trips to spatial grid cells and runs merge-nearest k-anonymity.",
    "The engine checks each group for ℓ-diversity and merges non-diverse groups.",
    "Laplace noise is added to each centroid's lat/lng and count (when ε-DP is enabled).",
    "The anonymized centroids and all utility metrics are returned to the API.",
    "The API sends the full JSON response back to the MapCompare component.",
    "MapCompare renders the anonymized markers, heatmap, and the metrics panel.",
  ],
  upload: [
    "The user drags a CSV file onto the upload drop zone.",
    "CSVUpload validates the file extension and checks that the file size is under 250 MB.",
    "The file is fingerprinted (name, size, last-modified) and compared against localStorage to detect a previous incomplete upload.",
    "CSVUpload starts a new upload session by posting the filename and total row count to /session/start.",
    "The server returns a unique sessionId and the index of the first chunk to upload (0 for a new upload, N for a resume).",
    "The file contents are read locally and split into chunks of 5,000 rows each.",
    "The first chunk is posted as a multipart payload to /session/:sessionId/chunk.",
    "uploadRoute parses the chunk rows, strips the BOM if present, maps column aliases to internal field names, and normalizes optional Hubway demographic fields.",
    "The validated rows are written to MySQL using INSERT IGNORE and the route returns inserted and duplicate counts.",
    "Express acknowledges the chunk; the progress bar advances proportionally.",
    "CSVUpload repeats the chunk upload for every remaining chunk, using exponential backoff (3 attempts, 1.5 s intervals) on any network error.",
    "Once all chunks are confirmed, CSVUpload calls /session/:sessionId/complete to finalise the upload.",
    "Express returns the total rowsInserted and duplicates; the UI clears the upload state and prompts the user to switch to User Data.",
  ],
  delete: [
    "The user clicks the 'Delete My Data' button to remove their uploaded dataset.",
    "CSVUpload renders a confirmation dialog with a warning that this action cannot be undone.",
    "The user confirms; CSVUpload starts the delete flow.",
    "CSVUpload opens an EventSource connection to DELETE /user-data, which streams Server-Sent Events back to the browser.",
    "Express sets the SSE response headers and immediately emits a start event containing the total row count to be deleted.",
    "The backend deletes rows in batches using DELETE FROM bicycle_trips WHERE is_user_uploaded=1.",
    "MySQL returns the number of rows affected per batch to the route handler.",
    "Express emits a progress SSE event with the running deleted count and total after each batch.",
    "CSVUpload reads the progress event and updates the progress bar in real time.",
    "When all batches complete, Express emits a done event with the final deleted count and closes the stream.",
    "CSVUpload closes the EventSource, clears localStorage, resets the upload state, and shows a success message.",
  ],
};

function SequenceDiagram({ actors, steps, descriptions }) {
  // Static mode shows all steps; live mode reveals them one by one.
  const [liveMode, setLiveMode] = useState(false);
  const [current,  setCurrent]  = useState(steps.length); // default: all visible
  const [playing,  setPlaying]  = useState(false);
  const markerPrefix = actors.map(actor => actor.label.replace(/\W+/g, "-").toLowerCase()).join("-");
  const seqFwdMarker = `${markerPrefix}-seq-fwd`;
  const seqRetMarker = `${markerPrefix}-seq-ret`;

  const N       = actors.length;
  const spacing = (SEQ_SVG_W - ACTOR_BOX_W - SEQ_EDGE_PAD * 2) / (N - 1);
  const actorCx = useCallback((i) => SEQ_EDGE_PAD + ACTOR_BOX_W / 2 + i * spacing, [spacing]);

  const svgHeight = STEP_Y0 + steps.length * STEP_DY + 36;

  // Auto-advance in live mode
  useEffect(() => {
    if (!playing || !liveMode) return;
    if (current >= steps.length) { setPlaying(false); return; }
    const t = setTimeout(() => setCurrent(s => s + 1), 1300);
    return () => clearTimeout(t);
  }, [playing, current, liveMode, steps.length]);

  const startLive = useCallback(() => {
    setLiveMode(true);
    setCurrent(0);
    setPlaying(true);
  }, []);

  const exitLive = useCallback(() => {
    setLiveMode(false);
    setCurrent(steps.length);
    setPlaying(false);
  }, [steps.length]);

  const visibleCount = liveMode ? current : steps.length;
  const currentDesc  = liveMode && current > 0 ? (descriptions?.[current - 1] ?? null) : null;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        {!liveMode ? (
          <>
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={startLive}
              style={{ background: "#f97316", borderColor: "#f97316", color: "#fff" }}
            >
              Live Walkthrough
            </Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              All {steps.length} steps shown. Click Live Walkthrough to animate them step-by-step.
            </Text>
          </>
        ) : (
          <>
            <Button size="small" icon={<ReloadOutlined />}
              onClick={() => { setCurrent(0); setPlaying(false); }}>Reset</Button>
            <Button size="small" icon={<StepBackwardOutlined />}
              onClick={() => { setPlaying(false); setCurrent(s => Math.max(0, s - 1)); }}
              disabled={current === 0}>Prev</Button>
            <Button size="small" type="primary"
              icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={() => setPlaying(p => !p)}>
              {playing ? "Pause" : "Resume"}
            </Button>
            <Button size="small" icon={<StepForwardOutlined />}
              onClick={() => { setPlaying(false); setCurrent(s => Math.min(steps.length, s + 1)); }}
              disabled={current >= steps.length}>Next</Button>
            <Button size="small" onClick={exitLive}>Exit Live</Button>
            <span className="seq-step-badge">Step {current} / {steps.length}</span>
          </>
        )}
      </div>

      <div className="seq-diagram-wrap">
        <svg className="seq-diagram-svg" viewBox={`0 0 ${SEQ_SVG_W} ${svgHeight}`}>
          <defs>
            <marker id={seqFwdMarker} markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L8,3.5 z" fill="#334155" />
            </marker>
            <marker id={seqRetMarker} markerWidth="8" markerHeight="7" refX="8" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L8,3.5 z" fill="#94a3b8" />
            </marker>
          </defs>

          {/* Actor boxes + lifelines */}
          {actors.map((actor, i) => {
            const x = actorCx(i);
            const isActive = liveMode && steps.slice(0, visibleCount).some(s =>
              s.from === i || (s.to === i && s.type !== "self")
            );
            return (
              <g key={i}>
                <rect
                  x={x - ACTOR_BOX_W / 2} y={6}
                  width={ACTOR_BOX_W} height={ACTOR_BOX_H}
                  rx={7} ry={7}
                  fill={isActive ? actor.color.border + "22" : actor.color.bg}
                  stroke={actor.color.border}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  style={{ transition: "all 0.25s" }}
                  filter={isActive ? "drop-shadow(0 2px 6px rgba(0,0,0,0.15))" : "none"}
                />
                <text x={x} y={28} textAnchor="middle" fontSize={10.5} fontWeight={700}
                  fill={actor.color.text} style={{ userSelect: "none" }}>
                  {actor.label}
                </text>
                {/* Lifeline */}
                <line
                  x1={x} y1={6 + ACTOR_BOX_H}
                  x2={x} y2={svgHeight - 10}
                  stroke="#cbd5e1" strokeDasharray="4,3" strokeWidth={1.1}
                />
              </g>
            );
          })}

          {/* Step messages */}
          {steps.slice(0, visibleCount).map((step, idx) => {
            const y        = STEP_Y0 + idx * STEP_DY;
            const fromX    = actorCx(step.from);
            const toX      = actorCx(step.to);
            const isLatest = liveMode && (idx === visibleCount - 1);
            const msgColor    = isLatest ? "#0f172a" : "#475569";
            const strokeColor = step.type === "return"
              ? "#94a3b8"
              : (isLatest ? "#1e40af" : "#334155");
            const dashArray = step.type === "return" ? "6,3" : undefined;
            const markerId  = step.type === "return" ? seqRetMarker : seqFwdMarker;
            const sw        = isLatest ? 2 : 1.5;

            // Step number bubble on the left margin
            const stepNum = idx + 1;

            if (step.type === "self") {
              const lx = fromX + 32;
              return (
                <g key={idx}>
                  <text x={16} y={y + 10} fontSize={9} fill="#94a3b8" textAnchor="middle">{stepNum}</text>
                  <path
                    d={`M ${fromX} ${y} L ${lx} ${y} L ${lx} ${y + 18} L ${fromX} ${y + 18}`}
                    fill="none" stroke={strokeColor} strokeWidth={sw}
                    strokeLinecap="round" strokeLinejoin="round"
                    markerEnd={`url(#${markerId})`}
                  />
                  <text x={lx + 4} y={y + 13} fontSize={9.5} fill={msgColor}
                    fontStyle="italic" fontWeight={isLatest ? 700 : 400}
                    style={{ userSelect: "none" }}>
                    {step.label}
                  </text>
                  {isLatest && <circle cx={fromX} cy={y} r={3.5} fill="#1e40af" opacity={0.75} />}
                </g>
              );
            }

            const arrowDir = toX > fromX ? -4 : 4;
            const midX = (fromX + toX) / 2;
            return (
              <g key={idx}>
                <text x={16} y={y + 4} fontSize={9} fill="#94a3b8" textAnchor="middle">{stepNum}</text>
                <line
                  x1={fromX} y1={y} x2={toX + arrowDir} y2={y}
                  stroke={strokeColor} strokeWidth={sw} strokeDasharray={dashArray}
                  strokeLinecap="round"
                  markerEnd={`url(#${markerId})`}
                />
                <text
                  x={midX} y={y - 4} textAnchor="middle" fontSize={9.5}
                  fill={msgColor}
                  fontStyle={step.type === "return" ? "italic" : "normal"}
                  fontWeight={isLatest ? 700 : 400}
                  style={{ userSelect: "none" }}
                >
                  {step.label}
                </text>
                {isLatest && <circle cx={fromX} cy={y} r={3.5} fill="#1e40af" opacity={0.75} />}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Description panel — shown only in live mode */}
      {liveMode && (
        <div className="seq-step-info">
          {currentDesc
            ? <><Text strong style={{ marginRight: 6 }}>Step {current}:</Text><Text>{currentDesc}</Text></>
            : <Text type="secondary">
                {current === 0 ? "Click Resume or Next to begin the walkthrough…" : "All steps complete. Click Exit Live to return to the full view."}
              </Text>
          }
        </div>
      )}
    </div>
  );
}


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
        {[
          { icon: <UploadOutlined />,    color: "#3b82f6", title: "Upload any CSV",         body: "Drag-and-drop mobility datasets from any city. Common column names are auto-detected so no preprocessing is needed. Uploads are chunked and resumable if interrupted." },
          { icon: <ClusterOutlined />,   color: "#22c55e", title: "k-Anonymity",            body: "The merge-nearest algorithm clusters trips into groups of at least k and releases only centroids. Every released group is guaranteed to meet the k threshold." },
          { icon: <SafetyOutlined />,    color: "#a855f7", title: "ℓ-Diversity",           body: "Extends k-anonymity so each released group contains at least ℓ distinct sensitive attribute values, blocking attribute-inference attacks." },
          { icon: <NodeIndexOutlined />, color: "#f97316", title: "ε-Differential Privacy", body: "Adds calibrated Laplace noise to centroids and counts, providing a formal semantic privacy guarantee on top of k-anonymity." },
          { icon: <BarChartOutlined />,  color: "#eab308", title: "Utility Metrics",        body: "Spatial error, density similarity (cosine and JSD), hotspot overlap, suppression rate, and live latency are all displayed in real time." },
          { icon: <AppstoreOutlined />,  color: "#ec4899", title: "3D Privacy Landscape",   body: "Spring-animated isometric bar chart across three axes. Click any bar to apply that configuration, Ctrl+click to pin and compare, and read the plain-English interpretation panel below the chart." },
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
        <Col span={24}>
          <Card title={<Space><RocketOutlined /> Quick Start</Space>} className="guide-card">
            <Steps direction="vertical" size="small" items={[
              { title: "Open the Tool page",        description: "Select Preloaded Data to explore the built-in January 2024 Citi Bike (NYC) dataset immediately (no upload required)." },
              { title: "Set your privacy budget",   description: "Choose a grid size and k value. Leave ℓ-Diversity and ε-DP off for your first run to see plain k-anonymity." },
              { title: "Load Original + Anonymize", description: "Click Load Original to see raw trip paths, then Run Anonymization. Metrics appear on the right panel." },
              { title: "Compare k Values",          description: "Click Compare k Values to run multiple k settings side-by-side on the same data and filters." },
              { title: "Explore the 3D Landscape",  description: "Open the 3D Landscape tab and click any bar to jump to that configuration instantly." },
              { title: "Try your own data",         description: "Go to Upload Data, drop in a CSV from any city, then switch the data source toggle on the Tool page." },
            ]} />
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
              { title: "Prepare a mobility CSV",       description: "The file must contain trip start/end timestamps and coordinates. Citi Bike, Divvy, Bluebikes/Hubway headers and common aliases are auto-detected. Use the Download Sample CSV table to get a core template or the Hubway demographic sample." },
              { title: "Open the Upload Data page",    description: "Files up to 250 MB are accepted. Drag-and-drop or click to browse." },
              { title: "Session starts automatically", description: "The uploader fingerprints your file and calls /session/start to get a session ID. If a previous upload was interrupted, the resume banner appears and lets you continue from the last completed chunk." },
              { title: "Chunked transfer with retry",  description: "Your file is split into 5,000-row chunks. Each chunk is posted individually to /session/:id/chunk and retried up to 3 times with exponential backoff on any network error." },
              { title: "Watch the progress bar",       description: "The bar advances chunk by chunk. Once the final chunk lands, CSVUpload calls /session/:id/complete and the server confirms the total rows inserted and duplicates skipped." },
              { title: "Switch to User Data",          description: "After upload, use the Data Source toggle on the Tool page. The map re-centres automatically and the date picker adjusts to your dataset's date range." },
            ]} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title={<Space><CheckCircleOutlined /> Required Fields</Space>} className="guide-card">
            <Table size="small" pagination={false} dataSource={requiredColumns} rowKey="field"
              columns={[{ title: "Field", dataIndex: "field", width: 200 }, { title: "Purpose", dataIndex: "purpose" }]} />
            <Alert style={{ marginTop: 12 }} type="info" showIcon message="ride_id is optional"
              description="When missing, the importer generates a deterministic SHA-1 hash from coordinates and timestamps. Uploading the same file twice will not create duplicates." />
            <Alert style={{ marginTop: 12 }} type="success" showIcon message="Demographic fields are optional"
              description="Hubway-style gender, birth year, bike ID, and trip duration columns are supported when present. They are not required for upload; birth year is converted into age bands for privacy demonstrations." />
          </Card>
        </Col>
        <Col span={24}>
          <Card title={<Space><InfoCircleOutlined /> Core vs Optional Fields</Space>} className="guide-card">
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              Core fields are required for map rendering and anonymization. Optional fields enrich the demonstrator and unlock additional l-diversity attributes when available.
            </Paragraph>
            <Table size="small" pagination={false} dataSource={optionalColumns} rowKey="field"
              columns={[
                { title: "Optional field", dataIndex: "field", width: 180 },
                { title: "How it is used", dataIndex: "purpose" },
              ]} />
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
                { title: "Open data URL",       dataIndex: "url", render: renderOpenDataUrl },
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
              { color: "purple",  children: "Optionally enable ℓ-Diversity and choose a sensitive attribute: rider type, bike type, destination area, or Hubway gender/age band when those optional columns are present. A warning appears if the member type filter conflicts with the chosen attribute." },
              { color: "volcano", children: "Optionally enable ε-DP noise and choose ε. Smaller ε = more noise = stronger privacy but larger centroid displacement." },
              { color: "green",   children: "Click Load Original to inspect raw trip paths, then Run Anonymization to generate released centroids and heat intensity." },
              { color: "green",   children: "Click Compare k Values to run multiple k values side-by-side. All active settings (ℓ, ε) apply to every comparison column." },
              { color: "purple",  children: "Open the 3D Landscape and switch between k-Anonymity, ℓ-Diversity, and ε-DP modes. Click any bar to apply that configuration, Ctrl+click to pin and compare two bars, and read the plain-English panel for the Privacy-Utility Score." },
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
                <Text>Spatial-only is least strict. Day, Period, and Hour modes add a time dimension so trips are grouped by both location and time bucket, increasing strictness and suppression.</Text>
              </div>
              <div className="guide-control-row">
                <Tag color="purple" icon={<SafetyOutlined />}>ℓ-Diversity</Tag>
                <Text>Extends k-anonymity: each released group must contain ≥ ℓ distinct values of the chosen sensitive attribute. Rider type and destination area are broadly available; gender and age band are optional Hubway-style enrichments. Set to Off to use plain k-anonymity.</Text>
              </div>
              <div className="guide-control-row">
                <Tag color="orange" icon={<NodeIndexOutlined />}>ε-DP Noise</Tag>
                <Text>Adds calibrated Laplace noise to centroids and counts. Provides a formal (ε, 0)-differential privacy guarantee on top of k-anonymity's structural guarantee.</Text>
              </div>
              <div className="guide-control-row">
                <Tag color="magenta">3D Landscape</Tag>
                <Text>Three spring-animated modes: k-Anonymity (k × temporal), ℓ-Diversity (ℓ × attribute), and ε-DP (k × ε). Click any bar to apply that configuration instantly. Ctrl+click to pin a bar for side-by-side comparison. The panel below the chart gives a plain-English interpretation of the current configuration including a 0–100 Privacy-Utility Score and a danger-zone warning when suppression exceeds 40%.</Text>
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
  --sensitiveAttrs=member_casual,gender,age_band,destination_area \\
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
        <Col span={24}>
          <Card title={<Space><ClusterOutlined /> k-Anonymity: Merge-Nearest Algorithm</Space>} className="guide-card">
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
                  of the merged group, never revealing an individual trip's coordinates.
                </Paragraph>
                <Paragraph>
                  <strong>Zero k-violations are guaranteed</strong>: the algorithm never releases a group
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
        <Col span={24}>
          <Card title={<Space><SafetyOutlined /> ℓ-Diversity: Attribute Inference Protection</Space>} className="guide-card">
            <Row gutter={16}>
              <Col xs={24} md={14}>
                <Paragraph>
                  <strong>ℓ-diversity</strong> (Machanavajjhala et al., 2006) addresses a weakness of plain k-anonymity:
                  even when a released group contains k trips, all trips might share the same sensitive attribute value,
                  making inference trivial. ℓ-diversity requires at least ℓ <em>distinct</em> values per group.
                  Supported attributes include rider type, bike type, destination area, and optional Hubway
                  demographic fields such as gender and age band when those columns exist in the uploaded CSV.
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
                        {" "}<code>member_casual = member</code>, leaving only 1 distinct value and making ℓ=2 impossible.
                        A warning with a one-click fix appears in the settings panel when detected.
                      </span>
                    } />
                  <Alert type="info" showIcon message="Destination area is the strongest attribute"
                    description="It protects against destination-inference attacks. Because destination grid cells are numerous, ℓ=2 or ℓ=3 is achievable with minimal extra suppression compared to rider or bike type." />
                  <Alert type="success" showIcon message="Hubway demographics are optional"
                    description="Gender and age band appear only when uploaded data provides those columns. Exact birth year is used only to derive age bands; the Tool page uses age_band rather than exposing exact birth year as a sensitive-attribute option." />
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={24}>
          <Card title={<Space><NodeIndexOutlined /> ε-Differential Privacy: Centroid Noise</Space>} className="guide-card">
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
                    <strong>k-anonymity + ℓ-diversity</strong> are <em>syntactic</em> methods that make
                    structural guarantees about released groups but cannot bound an adversary's inference gain.
                  </Paragraph>
                  <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                    <strong>ε-DP</strong> is a <em>semantic</em> method that bounds the posterior probability
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
              size="small" pagination={false} dataSource={metricRows} rowKey="metric"
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
                  and magnitude shifts. Stricter than cosine: a high JSD score means the anonymized
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
            message="Hover over any node for details. Use the Live Flow buttons to animate data paths."
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
                { name: "MapCompare.jsx",        desc: "Side-by-side Leaflet map with raw trips on the left and anonymized centroids on the right." },
                { name: "FilterComponent.jsx",   desc: "All anonymization controls: grid size, k, temporal mode, ℓ-diversity, and ε-DP." },
                { name: "PrivacyLandscape.jsx",  desc: "Spring-animated isometric 3D bar chart with Pin & Compare, a 0-100 Privacy-Utility Score, and a plain-English interpretation panel." },
                { name: "CSVUpload.jsx",         desc: "Drag-and-drop uploader with chunked resumable sessions, SSE-streamed delete progress, and duplicate detection." },
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
                { name: "bicycleRoute.js",   desc: "REST endpoints: /trips (raw), /anonymize, /compare, /stats." },
                { name: "uploadRoute.js",    desc: "Session-based chunked upload (/session/start, /chunk, /complete), alias mapping, BOM stripping, coordinate validation, Hubway demographic normalization, and SSE-streamed delete progress." },
                { name: "anonymization.js",  desc: "Merge-nearest k-anonymity, ℓ-diversity checks for rider, bike, demographic, and destination attributes, plus Laplace ε-DP noise." },
                { name: "bicycleTrips.js",   desc: "MySQL query layer handling trip retrieval, date filtering, and user vs. preloaded data separation." },
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
              <Text strong style={{ fontSize: 13 }}>MySQL: bicycle_trips table</Text>
              {[
                "ride_id VARCHAR(255): primary key, deterministic hash when absent",
                "started_at / ended_at: DATETIME, indexed for date-range queries",
                "start_lat/lng + end_lat/lng: DECIMAL(10,8) / (11,8)",
                "member_casual / rideable_type: optional categorical attributes",
                "gender / age_band: optional Hubway demographic attributes for l-diversity",
                "birth_year: optional source value used to derive age_band, not exposed in Tool-page releases",
                "bike_id / tripduration: optional Hubway metadata stored for import completeness",
                "is_user_uploaded BOOLEAN: separates preloaded from user data",
              ].map(f => <Text key={f} type="secondary" style={{ fontSize: 12, display: "block" }}>• {f}</Text>)}
              <Text strong style={{ fontSize: 13, marginTop: 6, display: "block" }}>Upload Pipeline</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                CSV → session start → 5,000-row chunks (with retry) → alias mapping →
                BOM strip → coordinate validation → INSERT IGNORE → session complete
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
                    "CSVUpload fingerprints file; POST /session/start",
                    "Server returns sessionId (resume point if interrupted)",
                    "File split into 5,000-row chunks; each posted to /session/:id/chunk",
                    "uploadRoute strips BOM, maps aliases, validates rows",
                    "INSERT IGNORE per chunk → MySQL; ride_id hash deduplicates",
                    "POST /session/:id/complete → success response → user switches to User Data",
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


function PipelineFlowSVG() {
  const stages = [
    { icon: "🗄️", label: "Raw Trips",     sub: "MySQL DB",        color: NODE_COLORS.db },
    { icon: "📐", label: "Grid Assign",    sub: "+ Temporal key",  color: NODE_COLORS.backend },
    { icon: "🔗", label: "Merge-Nearest",  sub: "k-Anonymity",     color: NODE_COLORS.algo },
    { icon: "🌈", label: "ℓ-Diversity",   sub: "optional",        color: NODE_COLORS.frontend },
    { icon: "🎲", label: "Laplace ε-DP",  sub: "optional",        color: NODE_COLORS.user },
  ];
  const BW = 118, BH = 62, GAP = 20;
  const total = stages.length * BW + (stages.length - 1) * GAP;
  const startX = (760 - total) / 2;

  return (
    <svg viewBox="0 0 760 82" style={{ width: "100%", maxHeight: 82 }}>
      <defs>
        <marker id="pf-ah" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
        </marker>
      </defs>
      {stages.map((s, i) => {
        const x = startX + i * (BW + GAP);
        const cx = x + BW / 2;
        const isLDiversity = i === 3;
        return (
          <g key={i}>
            <rect x={x} y={6} width={BW} height={BH} rx={9} ry={9}
              fill={s.color.bg} stroke={s.color.border} strokeWidth={1.5} />
            {isLDiversity ? (
              <g transform={`translate(${cx - 9}, 8)`} fill="none" stroke={s.color.text} strokeWidth={1.8} strokeLinecap="round">
                <circle cx={9} cy={5} r={4.2} fill={s.color.text} stroke="none" opacity={0.9} />
                <path d="M3.4,24 L4.2,15 C4.7,10.5 13.3,10.5 13.8,15 L14.6,24" fill={s.color.text} stroke="none" opacity={0.9} />
                <path d="M5.8,19.5 C5.8,15.5 12.2,15.5 12.2,19.5" stroke="#ffffff" />
                <path d="M7.6,22 C6.8,19.3 7.8,17.2 9,17.2 C10.2,17.2 11.2,19.3 10.4,22" stroke="#ffffff" />
                <path d="M9,20.5 L9,23" stroke="#ffffff" />
              </g>
            ) : (
              <text x={cx} y={24} textAnchor="middle" fontSize={15} style={{ userSelect: "none" }}>{s.icon}</text>
            )}
            <text x={cx} y={42} textAnchor="middle" fontSize={11} fontWeight={700} fill={s.color.text} style={{ userSelect: "none" }}>{s.label}</text>
            <text x={cx} y={57} textAnchor="middle" fontSize={9.5} fill={s.color.text} opacity={0.7} style={{ userSelect: "none" }}>{s.sub}</text>
            {i < stages.length - 1 && (
              <line
                x1={x + BW} y1={37} x2={x + BW + GAP} y2={37}
                stroke="#94a3b8" strokeWidth={1.5} markerEnd="url(#pf-ah)"
              />
            )}
          </g>
        );
      })}
      {/* "→ Released Centroids" label after last box */}
      <text x={startX + stages.length * (BW + GAP) - GAP + 8} y={41}
        fontSize={10.5} fill="#64748b" fontStyle="italic">→ Released Centroids</text>
    </svg>
  );
}


function AlgorithmsTab() {
  return (
    <div className="guide-tab-content">
      <Row gutter={[16, 16]}>

        {/* Pipeline overview */}
        <Col span={24}>
          <Card
            title={<Space><PartitionOutlined />Privacy Pipeline Overview</Space>}
            className="guide-card"
          >
            <Paragraph style={{ marginBottom: 14 }}>
              Every anonymization request runs through up to three composable layers. Each layer is
              independent and optional (except k-anonymity, which is always applied). The layers are
              executed in order, so later layers always operate on already-k-anonymous output.
            </Paragraph>
            <PipelineFlowSVG />
            <Row gutter={16} style={{ marginTop: 16 }}>
              {[
                { color: "#a855f7", title: "Layer 1: k-Anonymity", body: "Always on. Groups trips into cells of ≥ k, releases only centroids. Guarantees zero individual-trip leakage." },
                { color: "#3b82f6", title: "Layer 2: ℓ-Diversity", body: "Optional (ℓ ≥ 2). Enforces ≥ ℓ distinct sensitive-attribute values per released group. Works with rider type, bike type, destination area, and optional Hubway gender/age-band fields." },
                { color: "#f97316", title: "Layer 3: ε-DP Noise",  body: "Optional (ε < ∞). Adds Laplace noise to centroids and counts. Provides a formal (ε, 0)-DP semantic guarantee." },
              ].map(l => (
                <Col xs={24} md={8} key={l.title}>
                  <div className="guide-concept-box" style={{ borderColor: l.color }}>
                    <Text strong style={{ color: l.color, display: "block", marginBottom: 4 }}>{l.title}</Text>
                    <Text style={{ fontSize: 13 }}>{l.body}</Text>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        {/* k-Anonymity */}
        <Col span={24}>
          <Card
            title={<Space><FunctionOutlined style={{ color: "#a855f7" }} />k-Anonymity: Merge-Nearest Algorithm</Space>}
            className="guide-card"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={14}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>How it works</Text>
                <Paragraph>
                  Trips are first <strong>assigned to a spatial grid cell</strong> by integer-dividing
                  their start latitude and longitude by <code>gridSize</code> (default 0.01°).
                  When temporal mode is active, a time bucket (day / period / hour) is appended to the
                  key, making cells both spatially and temporally distinct.
                </Paragraph>
                <Paragraph>
                  Any cell with fewer than <strong>k</strong> trips is too small to release. The algorithm
                  finds the <strong>nearest neighbour cell</strong> (by Euclidean distance between
                  centroids) and <strong>merges</strong> the two cells into one group. This repeats until
                  every group has ≥ k trips. Trips that still cannot form a valid group after all merges
                  are <strong>suppressed</strong> (withheld entirely).
                </Paragraph>
                <Text strong style={{ display: "block", marginBottom: 6 }}>Pseudocode</Text>
                <pre className="guide-code-block">{`function kAnonymize(trips, k, gridSize, temporalMode):
  groups = {}
  for each trip:
    key = (floor(lat/g), floor(lng/g), timeBucket?)
    groups[key].push(trip)

  while min(groups.size) < k:
    small  = groups with size < k, sorted ascending
    for g in small:
      nearest = argmin(dist(g.centroid, other.centroid))
      merge(g, nearest) into groups

  return groups.map(g => centroid(g) + metrics(g))`}
                </pre>
              </Col>
              <Col xs={24} lg={10}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>Complexity</Text>
                <div className="guide-concept-box" style={{ borderColor: "#a855f7" }}>
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    {[
                      { label: "Grid assignment", val: "O(n)", note: "one pass, O(1) hash per trip" },
                      { label: "Centroid recompute", val: "O(n)", note: "incremental after each merge" },
                      { label: "Nearest-neighbour", val: "O(m²)", note: "m = number of groups (m ≪ n)" },
                      { label: "Total", val: "O(n + m²)", note: "typically O(n) in practice" },
                    ].map(r => (
                      <div key={r.label}>
                        <Space>
                          <Tag color="purple" style={{ fontFamily: "monospace", minWidth: 80 }}>{r.val}</Tag>
                          <Text style={{ fontSize: 13 }}>{r.label}</Text>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12, display: "block", paddingLeft: 90 }}>{r.note}</Text>
                      </div>
                    ))}
                  </Space>
                </div>
                <div className="guide-concept-box" style={{ borderColor: "#a855f7", marginTop: 12 }}>
                  <Text strong style={{ color: "#a855f7" }}>Zero-violation guarantee</Text>
                  <Paragraph style={{ marginTop: 6, marginBottom: 0, fontSize: 13 }}>
                    The merge loop terminates only when <em>all</em> groups satisfy k.
                    No group smaller than k is ever released. Any remaining under-k trip is suppressed,
                    never partially disclosed.
                  </Paragraph>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* ℓ-Diversity */}
        <Col span={24}>
          <Card
            title={<Space><ExperimentOutlined style={{ color: "#3b82f6" }} />ℓ-Diversity: Attribute Diversity Enforcement</Space>}
            className="guide-card"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={14}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>How it works</Text>
                <Paragraph>
                  After k-anonymity completes, each group is checked for <strong>attribute
                  diversity</strong>. The sensitive attribute (rider type, bike type, gender, age band, or destination area)
                  must appear in at least <strong>ℓ distinct values</strong> within every released group.
                </Paragraph>
                <Paragraph>
                  A non-diverse group is merged with the <strong>nearest group that provides
                  complementary attribute values</strong>: the merge partner whose attribute
                  distribution, when combined, satisfies ℓ. This is re-checked after every merge until
                  convergence.
                </Paragraph>
                <Text strong style={{ display: "block", marginBottom: 6 }}>Pseudocode</Text>
                <pre className="guide-code-block">{`function applyLDiversity(groups, l, attr):
  changed = true
  while changed:
    changed = false
    for g in groups:
      distinct = countDistinct(g.trips, attr)
      if distinct < l:
        // find nearest group whose union would reach l
        partner = findComplementaryNearest(g, groups, l, attr)
        merge(g, partner)
        changed = true  // re-scan after merge

  // any group that still can't reach l → suppress
  return groups.filter(g => countDistinct(g, attr) >= l)`}
                </pre>
              </Col>
              <Col xs={24} lg={10}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>Sensitive attributes</Text>
                <Space direction="vertical" size={10} style={{ width: "100%" }}>
                  {[
                    { attr: "member_casual", vals: "member, casual", strength: "Basic", color: "#3b82f6", note: "Prevents rider-type inference. Conflicts with member-only filter." },
                    { attr: "rideable_type",  vals: "classic, electric, docked", strength: "Medium", color: "#22c55e", note: "Prevents bike-preference / accessibility inference." },
                    { attr: "gender", vals: "male, female, unknown", strength: "Demographic", color: "#06b6d4", note: "Optional Hubway field. Prevents gender inference when enough categories exist in the selected data." },
                    { attr: "age_band", vals: "decade age ranges", strength: "Demographic", color: "#db2777", note: "Derived from birth_year. Demonstrates age disclosure protection without releasing exact birth year." },
                    { attr: "destination_area", vals: "grid cell of end coords", strength: "Strongest", color: "#f97316", note: "Blocks destination-inference. Many distinct values → low suppression cost." },
                  ].map(a => (
                    <div key={a.attr} className="guide-concept-box" style={{ borderColor: a.color }}>
                      <Space>
                        <Tag color={a.color === "#f97316" ? "orange" : a.color === "#22c55e" ? "green" : "blue"}>
                          {a.strength}
                        </Tag>
                        <Text code style={{ fontSize: 11 }}>{a.attr}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                        Values: {a.vals}
                      </Text>
                      <Text style={{ fontSize: 12, display: "block" }}>{a.note}</Text>
                    </div>
                  ))}
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* ε-DP */}
        <Col span={24}>
          <Card
            title={<Space><ExperimentOutlined style={{ color: "#f97316" }} />ε-Differential Privacy: Laplace Mechanism</Space>}
            className="guide-card"
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={14}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>How it works</Text>
                <Paragraph>
                  After k-anonymity (and optional ℓ-diversity), <strong>Laplace noise</strong> is added
                  independently to each released centroid's latitude, longitude, and group count.
                  The noise scale is calibrated to the <strong>global sensitivity</strong> of each
                  statistic divided by the privacy budget ε.
                </Paragraph>
                <Text strong style={{ display: "block", marginBottom: 6 }}>Noise formulas</Text>
                <pre className="guide-code-block">{`// Global sensitivity of location = gridSize (one cell width)
// Global sensitivity of count    = 1 (one trip can shift count by 1)

scale_location = gridSize / ε      // e.g. 0.01 / 2 = 0.005°
scale_count    = 1.0 / ε

for each centroid c:
  c.lat   += Laplace(0, scale_location)
  c.lng   += Laplace(0, scale_location)
  c.count  = max(1, round(c.count + Laplace(0, scale_count)))

// Laplace sample via inverse CDF:
// noise = -scale * sign(u) * ln(1 - 2|u|),  u ~ Uniform(-0.5, 0.5)`}
                </pre>
                <Paragraph style={{ marginTop: 10 }}>
                  This satisfies <strong>(ε, 0)-differential privacy</strong> per Dwork (2006): for any
                  two datasets differing in one trip, the ratio of output probabilities is bounded by e^ε.
                </Paragraph>
              </Col>
              <Col xs={24} lg={10}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>Privacy budget guide</Text>
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  {epsilonRows.map(r => (
                    <div key={r.eps} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Tag style={{ fontFamily: "monospace", minWidth: 55, textAlign: "center" }}>{r.eps}</Tag>
                      <div>
                        <Text style={{ fontSize: 12, display: "block" }}>{r.scale}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>{r.label}</Text>
                      </div>
                    </div>
                  ))}
                </Space>
                <div className="guide-concept-box" style={{ borderColor: "#f97316", marginTop: 14 }}>
                  <Text strong style={{ color: "#f97316" }}>Post-processing property</Text>
                  <Paragraph style={{ marginTop: 6, marginBottom: 0, fontSize: 13 }}>
                    Applying ε-DP <em>after</em> k-anonymity is safe: any post-processing of a
                    differentially private output is still differentially private (with the same ε).
                    The k-anon structural guarantee is preserved independently.
                  </Paragraph>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* Implementation Optimizations */}
        <Col span={24}>
          <Card
            title={<Space><RocketOutlined style={{ color: "#22c55e" }} />Implementation Optimizations</Space>}
            className="guide-card"
          >
            <Row gutter={[12, 12]}>
              {[
                {
                  icon: "⚡",
                  title: "O(1) Grid Hashing",
                  body: "Each trip is assigned to a cell in O(1) via integer division: key = `${⌊lat/g⌋}_${⌊lng/g⌋}`. No sorting or tree traversal needed for the assignment step.",
                  color: "#a855f7",
                },
                {
                  icon: "📦",
                  title: "5,000-Row Chunk Uploads",
                  body: "CSV uploads use a resumable session model: the file is split into 5,000-row chunks, each posted independently to /session/:id/chunk with automatic exponential backoff retry. This means a network drop mid-upload resumes from the last good chunk rather than restarting from zero.",
                  color: "#3b82f6",
                },
                {
                  icon: "🔁",
                  title: "In-Memory Anonymization",
                  body: "All k-anon / ℓ-diversity / ε-DP computation runs in the Node.js heap with no intermediate disk writes. For typical query windows (up to 200 k trips) this keeps end-to-end latency under 200 ms.",
                  color: "#22c55e",
                },
                {
                  icon: "🔑",
                  title: "Deterministic Deduplication",
                  body: "Each trip gets a SHA-1 ride_id derived from (start_lat, start_lng, end_lat, end_lng, started_at). INSERT IGNORE silently skips any row whose ride_id already exists, making uploads idempotent.",
                  color: "#eab308",
                },
                {
                  icon: "🗂️",
                  title: "MySQL Spatial Indices",
                  body: "The bicycle_trips table has a compound index on (started_at, is_user_uploaded). Date-range queries skip the full table scan, cutting DB query time from O(n) to O(log n + result_set).",
                  color: "#f97316",
                },
                {
                  icon: "📐",
                  title: "Incremental Centroid Update",
                  body: "After each merge, the new centroid is computed incrementally from the two group centroids and their sizes: c_new = (c1·n1 + c2·n2) / (n1+n2). Avoids re-iterating all trips in the merged group.",
                  color: "#ec4899",
                },
              ].map(opt => (
                <Col xs={24} sm={12} xl={8} key={opt.title}>
                  <div className="guide-concept-box" style={{ borderColor: opt.color, height: "100%" }}>
                    <Space align="start">
                      <span style={{ fontSize: 22 }}>{opt.icon}</span>
                      <div>
                        <Text strong style={{ color: opt.color, display: "block", marginBottom: 4 }}>
                          {opt.title}
                        </Text>
                        <Text style={{ fontSize: 12 }}>{opt.body}</Text>
                      </div>
                    </Space>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

      </Row>
    </div>
  );
}

function SequenceTab() {
  const [activeSeq, setActiveSeq] = useState("query");

  return (
    <div className="guide-tab-content">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Alert type="info" showIcon
            message="The full sequence is shown by default. Click Live Walkthrough on any diagram to animate it step-by-step with explanations."
          />
        </Col>

        <Col span={24}>
          <Tabs
            activeKey={activeSeq}
            onChange={setActiveSeq}
            type="line"
            size="small"
            items={[
              {
                key: "query",
                label: <Space><ClusterOutlined />Anonymization Request Flow</Space>,
                children: (
                  <Card
                    title={<Space><ClusterOutlined />Query / Anonymization Flow (12 steps)</Space>}
                    className="guide-card"
                    style={{ marginTop: 8 }}
                  >
                    <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                      What happens when a user clicks "Run Anonymization", tracing the full path from the frontend controls
                      all the way through the k-anonymity / ℓ-diversity / ε-DP pipeline and back.
                    </Paragraph>
                    <SequenceDiagram
                      actors={QUERY_ACTORS}
                      steps={QUERY_STEPS}
                      descriptions={STEP_DESCRIPTIONS.query}
                    />
                  </Card>
                ),
              },
              {
                key: "upload",
                label: <Space><UploadOutlined />CSV Upload Flow</Space>,
                children: (
                  <Card
                    title={<Space><UploadOutlined />CSV Upload Flow (13 steps)</Space>}
                    className="guide-card"
                    style={{ marginTop: 8 }}
                  >
                    <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                      What happens when a user uploads a CSV, covering session creation, 5,000-row chunked transfer with retry,
                      alias detection, row validation, ride_id deduplication, and session completion.
                    </Paragraph>
                    <SequenceDiagram
                      actors={UPLOAD_ACTORS}
                      steps={UPLOAD_STEPS}
                      descriptions={STEP_DESCRIPTIONS.upload}
                    />
                  </Card>
                ),
              },
              {
                key: "delete",
                label: <Space><DatabaseOutlined />Delete Flow (SSE)</Space>,
                children: (
                  <Card
                    title={<Space><DatabaseOutlined />Delete My Data Flow (11 steps)</Space>}
                    className="guide-card"
                    style={{ marginTop: 8 }}
                  >
                    <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                      What happens when a user deletes their uploaded data. The backend streams real-time
                      progress back to the browser using Server-Sent Events so the progress bar stays live throughout.
                    </Paragraph>
                    <SequenceDiagram
                      actors={DELETE_ACTORS}
                      steps={DELETE_STEPS}
                      descriptions={STEP_DESCRIPTIONS.delete}
                    />
                  </Card>
                ),
              },
            ]}
          />
        </Col>

        {/* Quick legend */}
        <Col span={24}>
          <Card size="small" className="guide-card">
            <Space size={24} wrap>
              <Space size={6}>
                <svg width={50} height={16}>
                  <line x1={0} y1={8} x2={42} y2={8} stroke="#334155" strokeWidth={2} markerEnd="url(#_lg1)" />
                  <defs><marker id="_lg1" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#334155"/></marker></defs>
                </svg>
                <Text style={{ fontSize: 12 }}>Method call / request</Text>
              </Space>
              <Space size={6}>
                <svg width={50} height={16}>
                  <line x1={0} y1={8} x2={42} y2={8} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5,3" markerEnd="url(#_lg2)" />
                  <defs><marker id="_lg2" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#94a3b8"/></marker></defs>
                </svg>
                <Text style={{ fontSize: 12 }}>Return / response</Text>
              </Space>
              <Space size={6}>
                <svg width={50} height={16}>
                  <path d="M 8,8 L 44,8 L 44,14" fill="none" stroke="#334155" strokeWidth={2} />
                </svg>
                <Text style={{ fontSize: 12 }}>Self-call (internal processing)</Text>
              </Space>
              <Space size={6}>
                <svg width={16} height={16}><circle cx={8} cy={8} r={4} fill="#1e40af" opacity={0.7} /></svg>
                <Text style={{ fontSize: 12 }}>Current step (highlighted)</Text>
              </Space>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}


const TABS = [
  { key: "overview",      label: <Space><AppstoreOutlined />Overview</Space>,              children: <OverviewTab /> },
  { key: "getting-started", label: <Space><UploadOutlined />Getting Started</Space>,       children: <GettingStartedTab /> },
  { key: "using-the-tool", label: <Space><ClusterOutlined />Using the Tool</Space>,        children: <UsingTheToolTab /> },
  { key: "privacy",       label: <Space><SafetyOutlined />Privacy Techniques</Space>,      children: <PrivacyTab /> },
  { key: "metrics",       label: <Space><BarChartOutlined />Metrics</Space>,               children: <MetricsTab /> },
  { key: "algorithms",    label: <Space><ExperimentOutlined />Algorithms</Space>,          children: <AlgorithmsTab /> },
  { key: "architecture",  label: <Space><ApartmentOutlined />Architecture</Space>,         children: <ArchitectureTab /> },
  { key: "sequences",     label: <Space><OrderedListOutlined />Sequence Diagrams</Space>,  children: <SequenceTab /> },
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
