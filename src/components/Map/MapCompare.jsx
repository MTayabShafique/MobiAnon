import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import useDataSources from "../../hooks/useDataSources";
import {
  MapContainer, TileLayer, Marker, Polyline, Popup, useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Alert, Badge, Button, Card, Col, Collapse, Divider, Empty, Input, Popover,
  Progress, Row, Select, Skeleton, Space, Spin, Statistic,
  Tag, Tooltip, Typography,
} from "antd";
import {
  AimOutlined, ApartmentOutlined, AppstoreOutlined, BarChartOutlined, ClusterOutlined,
  CloseOutlined, CompressOutlined, ControlOutlined, DotChartOutlined,
  EyeInvisibleOutlined, FireOutlined, FundOutlined, InfoCircleOutlined, LineChartOutlined,
  NodeIndexOutlined, PieChartOutlined, PlayCircleOutlined, QuestionCircleOutlined,
  RadarChartOutlined, ReloadOutlined, RocketOutlined, SafetyOutlined, TeamOutlined,
  ThunderboltOutlined, UserOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { FilterComponent } from "./FilterComponent";
import mapIcon from "../../assets/map-marke.svg";
import L from "leaflet";
import "leaflet.heat";

// 3D visualization loaded lazily so it doesn't bloat the initial bundle
const PrivacyLandscape = lazy(() => import("../Viz3D/PrivacyLandscape"));

const { Text, Title } = Typography;
const API = "http://localhost:5000";

const customIcon = L.icon({
  iconUrl: mapIcon,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -41],
});

const NYC_BOUNDS = [[40.477399, -74.25909], [40.917577, -73.700272]];
const NYC_CENTER = [40.7128, -74.006];
const MAP_SETTINGS_KEY = "bicycleAnonymizationMapSettings";


const boundsToFilter = (bounds) => {
  if (!bounds || [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng].some((v) => typeof v !== "number")) return null;
  const latPad = Math.max((bounds.maxLat - bounds.minLat) * 0.08, 0.01);
  const lngPad = Math.max((bounds.maxLng - bounds.minLng) * 0.08, 0.01);
  return {
    minLat:    Math.max(-90,  bounds.minLat - latPad),
    maxLat:    Math.min(90,   bounds.maxLat + latPad),
    minLng:    Math.max(-180, bounds.minLng - lngPad),
    maxLng:    Math.min(180,  bounds.maxLng + lngPad),
    centerLat: (bounds.minLat + bounds.maxLat) / 2,
    centerLng: (bounds.minLng + bounds.maxLng) / 2,
  };
};

const loadSavedMapSettings = () => {
  try {
    const saved = localStorage.getItem(MAP_SETTINGS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
};

const saveMapSettings = (settings) => {
  try { localStorage.setItem(MAP_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* non-fatal */ }
};


function SyncView({ center, zoom }) {
  const map = useMap();
  useEffect(() => { map.setView(center, zoom); }, [center, zoom, map]);
  return null;
}

const GridOverlay = ({ gridSize }) => {
  const map = useMap();
  const bounds = map.getBounds();
  const lines = [];
  for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += gridSize)
    lines.push([[lat, bounds.getWest()], [lat, bounds.getEast()]]);
  for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += gridSize)
    lines.push([[bounds.getSouth(), lng], [bounds.getNorth(), lng]]);
  return <>{lines.map((l, i) => <Polyline key={i} positions={l} color="red" weight={1} />)}</>;
};

const MapEmpty = ({ message }) => (
  <div className="map-empty-state">
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={<span className="map-empty-msg">{message}</span>}
    />
  </div>
);

const HelpPopover = ({ title, content }) => (
  <Popover
    title={title}
    content={<div style={{ maxWidth: 280, fontSize: 13 }}>{content}</div>}
    trigger="hover"
    placement="top"
  >
    <QuestionCircleOutlined className="metric-help-icon" />
  </Popover>
);

// Metric card explanations
const METRIC_HELP = {
  kViolations: {
    title: "k Violations",
    content: "Number of released groups whose size is below k. This must always be 0 for the anonymization to be valid. The merge-nearest algorithm guarantees this.",
  },
  outputGroups: {
    title: "Released Groups",
    content: "How many distinct anonymized clusters were released. Fewer groups means more generalization; the map shows these as centroid markers and heat intensity.",
  },
  minGroupSize: {
    title: "Min Group Size",
    content: "The smallest trip count in any released group. By the k-anonymity guarantee this must always be ≥ k. When ε-DP is active, noisy counts are used — so this value can briefly dip below k on screen even though the true group sizes all satisfy k. It will vary on each fetch because the Laplace mechanism re-samples fresh noise every time.",
  },
  avgSpatialErrorKm: {
    title: "Mean Spatial Error",
    content: "Average distance in km between each trip's original start point and the centroid of the group it was assigned to. Lower is better — it means the anonymized location is close to the real one.",
  },
  top10HotspotOverlap: {
    title: "Hotspot Overlap",
    content: "Fraction of the top-10 busiest raw grid cells that are still present after anonymization. A score of 1.0 means all major hotspots survived; near 0 means the anonymization obscured the busiest areas.",
  },
  suppressedRecords: {
    title: "Suppressed Records",
    content: "Trips that could not be placed into any group satisfying k and were withheld from the output. High suppression (especially under strict temporal privacy) reduces data utility significantly.",
  },
  densityCosineSimilarity: {
    title: "Density Similarity (Cosine)",
    content: "Cosine similarity between the raw and anonymized grid-cell density distributions. Values near 1 mean the anonymized heatmap closely matches the original; 0 means no overlap at all.",
  },
  densityJsdSimilarity: {
    title: "Density Similarity (JSD)",
    content: "1 minus the Jensen-Shannon Divergence between raw and anonymized density distributions. Unlike cosine, JSD treats densities as probability distributions, making it sensitive to both pattern and magnitude changes. Values near 1 are better.",
  },
  dbQueryMs: {
    title: "DB Query Time",
    content: "Time in milliseconds for MySQL to retrieve the raw trips from the database, including index lookups and bound filtering. High values may suggest missing indexes or too many trips being retrieved.",
  },
  totalBackendMs: {
    title: "Backend Total Time",
    content: "Total server-side processing time including the DB query and the anonymization algorithm. This is what the user experiences as API latency. DB + anonymization ≈ total.",
  },
  avgCentroidDisplacementKm: {
    title: "Avg Centroid Displacement",
    content: "Average Euclidean displacement (in km) applied to released centroids by the Laplace mechanism. This is the direct utility cost of ε-DP. Larger displacement = stronger privacy guarantee but more spatial distortion on top of k-anonymity distortion.",
  },
  dpLocationScaleKm: {
    title: "Location Noise Scale (λ)",
    content: "The Laplace distribution scale parameter for lat/lng noise, expressed in km. Formally λ = gridSize / ε. About 68% of noise samples fall within ±λ km of the true centroid. Smaller ε gives larger λ and stronger privacy.",
  },
  dpCountScale: {
    title: "Count Noise Scale (λ)",
    content: "The Laplace distribution scale parameter for group-count noise. Formally λ = 1 / ε (sensitivity = 1 trip). Each released count is the true count ± Laplace(0, λ). Ensures released counts do not precisely reveal group sizes.",
  },
  dpEpsilon: {
    title: "Privacy Budget (ε)",
    content: "The ε parameter of (ε, 0)-differential privacy. Smaller ε = stronger privacy guarantee but more noise. ε ≤ 1 is considered strong; ε ≥ 5 is weak. ε = ∞ disables DP entirely. This tool applies DP as a post-processing step on top of k-anonymity.",
  },
  lViolations: {
    title: "ℓ-Violations",
    content: "Number of released groups that contain fewer than ℓ distinct values of the sensitive attribute. This must always be 0 — the modified merge-nearest algorithm guarantees it by preferring merges that maximise diversity gain.",
  },
  minDistinctSensitiveValues: {
    title: "Min Distinct Values",
    content: "The smallest number of distinct sensitive-attribute values found in any single released group. This must be ≥ ℓ for full ℓ-diversity compliance. A value equal to ℓ means at least one group is at the tightest-allowed diversity boundary.",
  },
  avgDistinctSensitiveValues: {
    title: "Avg Distinct Values",
    content: "Average number of distinct sensitive-attribute values per released group. Higher values mean groups are more diverse on average, offering stronger protection than the ℓ minimum requires. Compare across sensitive attributes to see which is naturally harder to satisfy.",
  },
  maxDistinctSensitiveValues: {
    title: "Max Distinct Values",
    content: "The highest distinct-value count found in any single group. Large values indicate that some groups were merged across many clusters to satisfy both k and ℓ, potentially increasing spatial error for those groups.",
  },
};

const MetricCard = ({ icon, label, metricKey, value, suffix, tone = "neutral" }) => (
  <Card size="small" className={`metric-card metric-card-${tone}`}>
    <Statistic
      title={
        <Space size={6}>
          {icon}
          <span>{label}</span>
          {metricKey && METRIC_HELP[metricKey] && (
            <HelpPopover title={METRIC_HELP[metricKey].title} content={METRIC_HELP[metricKey].content} />
          )}
        </Space>
      }
      value={value ?? "n/a"}
      suffix={suffix}
      valueStyle={{ fontSize: 22, fontWeight: 700 }}
    />
  </Card>
);

const MetricSkeleton = () => (
  <Card size="small" className="metric-card">
    <Skeleton active paragraph={false} title={{ width: "60%" }} />
  </Card>
);

const ROW_STYLE  = { lineHeight: "1.7", verticalAlign: "top" };
const LABEL_STYLE = { color: "#888", paddingRight: 10, whiteSpace: "nowrap", fontSize: 12 };
const VAL_STYLE   = { fontWeight: 600, fontSize: 12 };

const PopupRow = ({ label, children }) => (
  <tr style={ROW_STYLE}>
    <td style={LABEL_STYLE}>{label}</td>
    <td style={VAL_STYLE}>{children}</td>
  </tr>
);

const GroupPopup = ({ stop, filter }) => {
  const lActive  = (filter?.l ?? 1) >= 2;
  const dpActive = filter?.epsilon != null && isFinite(filter.epsilon);
  const attrLabel = SENSITIVE_ATTR_LABELS[filter?.sensitiveAttr] || "Sensitive values";
  const lSatisfied = lActive && stop.distinctSensitiveValues !== undefined
    ? stop.distinctSensitiveValues >= (filter.l ?? 1)
    : null;

  return (
    <div style={{ minWidth: 200 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontWeight: 700, fontSize: 13,
        borderBottom: "1px solid #f0f0f0", paddingBottom: 5, marginBottom: 6,
      }}>
        <span>Anonymized Group</span>
        <span style={{
          background: "#e6f4ff", color: "#0958d9",
          borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 600,
        }}>k ✓</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <PopupRow label="Trips">
            {stop.count}
            {dpActive && (
              <span style={{ color: "#faad14", fontWeight: 400, fontSize: 11, marginLeft: 5 }}>
                (noise applied)
              </span>
            )}
          </PopupRow>

          <PopupRow label="Mean error">{stop.spatialErrorMeanKm?.toFixed(2)} km</PopupRow>
          <PopupRow label="Max error">
            <span style={{ color: stop.spatialErrorMaxKm > 1 ? "#d46b08" : "inherit" }}>
              {stop.spatialErrorMaxKm?.toFixed(2)} km
            </span>
          </PopupRow>

          <PopupRow label="Cells merged">{stop.cellsMerged}</PopupRow>
          <PopupRow label="Time bucket">{stop.temporalBucket || "—"}</PopupRow>

          {lActive && stop.distinctSensitiveValues !== undefined && (
            <PopupRow label={attrLabel}>
              <span>
                {stop.distinctSensitiveValues}
                <span style={{ fontWeight: 400, color: "#888", marginLeft: 3 }}>
                  / ℓ={filter.l}
                </span>
                <span style={{
                  marginLeft: 5,
                  color: lSatisfied ? "#52c41a" : "#ff4d4f",
                  fontSize: 13,
                }}>
                  {lSatisfied ? "✓" : "✗"}
                </span>
              </span>
            </PopupRow>
          )}

          {dpActive && stop.dpDisplacementKm !== undefined && (
            <PopupRow label="DP centroid shift">
              <span style={{ color: stop.dpDisplacementKm > 1 ? "#d46b08" : "#389e0d" }}>
                {stop.dpDisplacementKm.toFixed(2)} km
              </span>
            </PopupRow>
          )}

          <PopupRow label="Centroid">
            <span style={{ fontWeight: 400, fontSize: 11 }}>
              {stop.position[0].toFixed(5)}, {stop.position[1].toFixed(5)}
            </span>
          </PopupRow>
        </tbody>
      </table>
    </div>
  );
};


const RIDEABLE_COLORS = {
  classic_bike:  "blue",
  electric_bike: "green",
  docked_bike:   "orange",
  unknown:       "default",
};
const RIDEABLE_LABELS = {
  classic_bike:  "Classic",
  electric_bike: "Electric",
  docked_bike:   "Docked",
  unknown:       "Unknown",
};

/** Derive O(n) baseline stats from the loaded original stops. */
const computeOriginalBaseline = (stops, gridSize) => {
  if (!stops || stops.length === 0) return null;

  const total = stops.length;
  const snap  = (v) => Math.floor(v / gridSize) * gridSize;

  let memberCount = 0;
  let casualCount = 0;
  const rideableMap = {};
  const genderMap = {};
  const ageBandMap = {};
  const startCells  = new Set();
  const pairCounts  = {};

  for (const s of stops) {
    const mc = s.details?.member_casual;
    if (mc === "member") memberCount++;
    else if (mc === "casual") casualCount++;

    const rt = s.details?.rideable_type || "unknown";
    rideableMap[rt] = (rideableMap[rt] || 0) + 1;

    if (s.details?.gender) {
      genderMap[s.details.gender] = (genderMap[s.details.gender] || 0) + 1;
    }
    if (s.details?.age_band) {
      ageBandMap[s.details.age_band] = (ageBandMap[s.details.age_band] || 0) + 1;
    }

    const sc = `${snap(s.start[0]).toFixed(4)},${snap(s.start[1]).toFixed(4)}`;
    const ec = `${snap(s.end[0]).toFixed(4)},${snap(s.end[1]).toFixed(4)}`;
    startCells.add(sc);
    const pair = `${sc}|${ec}`;
    pairCounts[pair] = (pairCounts[pair] || 0) + 1;
  }

  const uniquePairs = Object.values(pairCounts).filter((c) => c === 1).length;

  return {
    total,
    memberCount,
    casualCount,
    rideableMap,
    genderMap,
    ageBandMap,
    uniqueStartCells:  startCells.size,
    uniquePairs,
    reIdentifiablePct: (uniquePairs / total) * 100,
    avgTripsPerCell:   total / Math.max(startCells.size, 1),
  };
};

/** Raw-data baseline panel shown before anonymization results. */
const OriginalTripsBaseline = ({ baseline, gridSize }) => {
  if (!baseline) return null;

  const {
    total, memberCount, rideableMap, genderMap, ageBandMap,
    uniqueStartCells, uniquePairs,
    reIdentifiablePct, avgTripsPerCell,
  } = baseline;

  const memberPct = total > 0 ? (memberCount / total) * 100 : 0;
  const riskType  = reIdentifiablePct > 50 ? "error"
                  : reIdentifiablePct > 20 ? "warning"
                  :                          "success";
  const hasDemographics = Object.keys(genderMap || {}).length > 0 || Object.keys(ageBandMap || {}).length > 0;

  return (
    <div className="original-baseline-panel">
      <Divider orientation="left" orientationMargin={0} className="baseline-divider">
        <Space size={5}>
          <InfoCircleOutlined />
          <span>Raw Data Baseline</span>
          <HelpPopover
            title="Raw Data Baseline"
            content={
              <span>
                Summary of the loaded original trips — used as the ground truth against which
                anonymization quality is measured. The <strong>re-identification risk</strong>{" "}
                row shows how many trips have a unique start→end zone pair: an adversary with
                background knowledge can re-identify these individuals. k&#8209;Anonymity
                eliminates this by guaranteeing groups of ≥&nbsp;k trips per zone.
              </span>
            }
          />
        </Space>
      </Divider>

      <Row gutter={[8, 8]} align="stretch">
        <Col xs={8} style={{ display: 'flex' }}>
          <div className="baseline-stat">
            <span className="baseline-label">Trips loaded</span>
            <span className="baseline-value">{total.toLocaleString()}</span>
          </div>
        </Col>
        <Col xs={8} style={{ display: 'flex' }}>
          <div className="baseline-stat">
            <span className="baseline-label">Unique start zones</span>
            <span className="baseline-value">{uniqueStartCells.toLocaleString()}</span>
            <span className="baseline-sub">grid&nbsp;{gridSize}°</span>
          </div>
        </Col>
        <Col xs={8} style={{ display: 'flex' }}>
          <div className="baseline-stat">
            <span className="baseline-label">Avg trips&nbsp;/&nbsp;zone</span>
            <span className="baseline-value">{avgTripsPerCell.toFixed(1)}</span>
          </div>
        </Col>

        <Col xs={24}>
          <div className="baseline-row">
            <div className="baseline-row-header">
              <Space size={4}>
                <TeamOutlined className="baseline-row-icon" />
                <span className="baseline-label">Rider type split</span>
              </Space>
              <Space size={10}>
                <span className="baseline-tag-member">Member&nbsp;{memberPct.toFixed(1)}%</span>
                <span className="baseline-tag-casual">Casual&nbsp;{(100 - memberPct).toFixed(1)}%</span>
              </Space>
            </div>
            <Progress
              percent={parseFloat(memberPct.toFixed(1))}
              showInfo={false}
              size="small"
              strokeColor="#2563eb"
              trailColor="#fa8c16"
              style={{ marginTop: 4, marginBottom: 0 }}
            />
          </div>
        </Col>

        <Col xs={24}>
          <div className="baseline-row">
            <Space size={4} style={{ marginBottom: 6 }}>
              <PieChartOutlined className="baseline-row-icon" />
              <span className="baseline-label">Bike type</span>
            </Space>
            <Space size={6} wrap>
              {Object.entries(rideableMap)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <Tag key={type} color={RIDEABLE_COLORS[type] || "default"} className="baseline-type-tag">
                    {RIDEABLE_LABELS[type] || type}&nbsp;—&nbsp;{((count / total) * 100).toFixed(1)}%
                  </Tag>
                ))}
            </Space>
          </div>
        </Col>

        {hasDemographics && (
          <Col xs={24}>
            <div className="baseline-row">
              <Space size={4} style={{ marginBottom: 6 }}>
                <UserOutlined className="baseline-row-icon" />
                <span className="baseline-label">Demographics</span>
              </Space>
              <Space size={6} wrap>
                {Object.entries(genderMap || {})
                  .sort(([, a], [, b]) => b - a)
                  .map(([gender, count]) => (
                    <Tag key={`gender-${gender}`} color="cyan" className="baseline-type-tag">
                      {gender} {((count / total) * 100).toFixed(1)}%
                    </Tag>
                  ))}
                {Object.entries(ageBandMap || {})
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([ageBand, count]) => (
                    <Tag key={`age-${ageBand}`} color="magenta" className="baseline-type-tag">
                      {ageBand} {((count / total) * 100).toFixed(1)}%
                    </Tag>
                  ))}
              </Space>
            </div>
          </Col>
        )}

        <Col xs={24}>
          <Alert
            type={riskType}
            showIcon
            className="baseline-risk-alert"
            message={
              <span>
                <strong>
                  {uniquePairs.toLocaleString()} trips ({reIdentifiablePct.toFixed(1)}%)
                </strong>{" "}
                have a unique start→end zone pair and could be re-identified by an adversary
                with background knowledge. k&#8209;Anonymity merges these into groups
                of&nbsp;≥&nbsp;k&nbsp;trips, reducing this risk to&nbsp;0.
              </span>
            }
          />
        </Col>
      </Row>
    </div>
  );
};

const MapComponent = ({ mapKey, mapType, onSync, gridSize, title, subtitle, footerContent }) => {
  const mapRef = React.useRef();

  useEffect(() => {
    if (mapType !== "anonymized" || !mapRef.current) return;
    const map = mapRef.current;
    map.eachLayer((layer) => { if (layer instanceof L.HeatLayer) map.removeLayer(layer); });
    if (mapKey.stops.length === 0) return;
    L.heatLayer(mapKey.stops.map((s) => [s.position[0], s.position[1], s.count]), {
      radius: 25, blur: 15, maxZoom: 17,
    }).addTo(map);
  }, [mapKey.stops, mapType]);

  const hasData = mapKey.stops.length > 0;

  return (
    <Card
      className="map-panel"
      title={
        <Space size={8}>
          {mapType === "anonymized" ? <ClusterOutlined /> : <AimOutlined />}
          <span>{title}</span>
        </Space>
      }
      extra={
        hasData
          ? <Tag color={mapType === "anonymized" ? "blue" : "default"}>{mapKey.stops.length} Shown</Tag>
          : <Tag color="default">No Data</Tag>
      }
    >
      <Text type="secondary" className="map-subtitle">{subtitle}</Text>
      <Spin spinning={mapKey.loading}>
        {!hasData && !mapKey.loading
          ? <MapEmpty message={
              mapType === "anonymized"
                ? "Run Anonymization to see released groups and heatmap."
                : "Click Load Original to fetch trips inside the current map bounds."
            }
          />
          : (
            <MapContainer

              ref={mapRef}
              center={[mapKey.filter.centerLat, mapKey.filter.centerLng]}
              zoom={12}
              className="main-map"
              dragging scrollWheelZoom zoomControl
              minZoom={10} maxZoom={22}
              eventHandlers={{
                moveend: (e) => {
                  const map = e.target;
                  const c = map.getCenter();
                  const b = map.getBounds();
                  onSync(c, b);
                },
              }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <SyncView center={[mapKey.filter.centerLat, mapKey.filter.centerLng]} zoom={12} />
              <GridOverlay gridSize={gridSize} />
              {mapKey.stops.map((stop, i) => (
                <React.Fragment key={i}>
                  {mapType === "anonymized" ? (
                    <Marker position={stop.position} icon={customIcon}>
                      <Popup minWidth={210}>
                        <GroupPopup stop={stop} filter={mapKey.filter} />
                      </Popup>
                    </Marker>
                  ) : (
                    <>
                      <Marker icon={customIcon} position={stop.start} />
                      <Marker position={stop.end} icon={customIcon} />
                      <Polyline positions={stop.route || [stop.start, stop.end]} color="blue" weight={5}>
                        <Popup>
                          <strong>Trip</strong>
                          <p><b>ID:</b> {stop.details.ride_id}</p>
                          <p><b>From:</b> {stop.details.start_station_name || "–"}</p>
                          <p><b>To:</b> {stop.details.end_station_name || "–"}</p>
                          {stop.details.gender && <p><b>Gender:</b> {stop.details.gender}</p>}
                          {stop.details.age_band && <p><b>Age band:</b> {stop.details.age_band}</p>}
                        </Popup>
                      </Polyline>
                    </>
                  )}
                </React.Fragment>
              ))}
            </MapContainer>
          )
        }
      </Spin>
      {footerContent}
    </Card>
  );
};

const MiniAnonymizedMap = ({ result, center, gridSize, filter }) => {
  const mapRef = React.useRef();

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    map.eachLayer((l) => { if (l instanceof L.HeatLayer) map.removeLayer(l); });
    if (!result.stops.length) return;
    L.heatLayer(result.stops.map((s) => [s.position[0], s.position[1], s.count]), {
      radius: 22, blur: 14, maxZoom: 17,
    }).addTo(map);
  }, [result.stops]);

  // Merge the comparison k into filter so GroupPopup shows the right k badge label
  const popupFilter = { ...(filter || {}), k: result.k };

  return (
    <MapContainer ref={mapRef} center={center} zoom={11} className="mini-map"
      scrollWheelZoom={false} zoomControl={false} dragging>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <GridOverlay gridSize={gridSize} />
      {result.stops.map((s, i) => (
        <Marker key={i} position={s.position} icon={customIcon}>
          <Popup minWidth={210}>
            <GroupPopup stop={s} filter={popupFilter} />
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};


const fetchStopsData = async (filter, setMapState, mapType, setToolAlert) => {
  setMapState((prev) => ({ ...prev, loading: true }));
  const url = mapType === "anonymized" ? `${API}/api/trips/anonymized` : `${API}/api/trips`;
  try {
    const { data } = await axios.get(url, {
      params: { ...filter, dataSource: filter.dataSource || "preloaded" },
    });
    if (mapType === "anonymized" && Array.isArray(data.data)) {
      setMapState((prev) => ({
        ...prev,
        stops: data.data
          .filter((t) =>
            t.centroidLat != null && t.centroidLng != null &&
            isFinite(t.centroidLat) && isFinite(t.centroidLng)
          )
          .map((t) => ({
            position: [Number(t.centroidLat), Number(t.centroidLng)],
            count: t.count,
            temporalBucket: t.temporalBucket,
            cellsMerged: t.cellsMerged,
            spatialErrorMeanKm: t.spatialErrorMeanKm,
            spatialErrorMaxKm: t.spatialErrorMaxKm,
            distinctSensitiveValues: t.distinctSensitiveValues,
            dpDisplacementKm: t.dpDisplacementKm,
          })),
        metrics: data.metrics || null,
        loading: false,
      }));
    } else if (Array.isArray(data.data)) {
      setMapState((prev) => ({
        ...prev,
        stops: data.data
          .filter((t) =>
            t.start_lat != null && t.start_lng != null &&
            t.end_lat   != null && t.end_lng   != null &&
            isFinite(t.start_lat) && isFinite(t.start_lng) &&
            isFinite(t.end_lat)   && isFinite(t.end_lng)
          )
          .map((t) => ({
            start:  [Number(t.start_lat), Number(t.start_lng)],
            end:    [Number(t.end_lat),   Number(t.end_lng)],
            name:   t.start_station_name || "Trip",
            route:  [[Number(t.start_lat), Number(t.start_lng)], [Number(t.end_lat), Number(t.end_lng)]],
            details: t,
          })),
        metrics: data.metrics || null,
        loading: false,
      }));
    } else {
      setMapState((prev) => ({ ...prev, loading: false }));
      setToolAlert?.({
        type: "warning",
        message: "No data returned",
        description: data.message || "The query returned an empty result.",
      });
    }
  } catch (error) {
    setMapState((prev) => ({ ...prev, loading: false }));
    const msg = error.response?.data?.message || error.message;
    setToolAlert?.({
      type: "error",
      message: `Failed to load ${mapType === "anonymized" ? "anonymized" : "original"} data`,
      description: msg || "Check that the backend server is running on port 5000.",
    });
  }
};

const fetchKComparisonData = async (filter, gridSize, kValues, setComparisonState, setToolAlert) => {
  setComparisonState((prev) => ({ ...prev, loading: true }));
  try {
    const results = await Promise.all(
      kValues.map(async (k) => {
        const { data } = await axios.get(`${API}/api/trips/anonymized`, {
          params: {
            ...filter,
            k,
            gridSize,
            dataSource:   filter.dataSource || "preloaded",
            l:            filter.l ?? 1,
            sensitiveAttr: filter.sensitiveAttr ?? "none",
            ...(filter.epsilon != null && { epsilon: filter.epsilon }),
          },
        });
        return {
          k,
          stops: (data.data || [])
            .filter((t) =>
              t.centroidLat != null && t.centroidLng != null &&
              isFinite(t.centroidLat) && isFinite(t.centroidLng)
            )
            .map((t) => ({
              position: [Number(t.centroidLat), Number(t.centroidLng)],
              count: t.count,
              temporalBucket: t.temporalBucket,
              cellsMerged: t.cellsMerged,
              spatialErrorMeanKm: t.spatialErrorMeanKm,
              spatialErrorMaxKm: t.spatialErrorMaxKm,
              distinctSensitiveValues: t.distinctSensitiveValues,
              dpDisplacementKm: t.dpDisplacementKm,
            })),
          metrics: data.metrics || null,
        };
      })
    );
    setComparisonState({
      loading: false,
      results,
      fetchedWith: {
        kValues:             [...kValues],
        gridSize,
        temporalGranularity: filter.temporalGranularity,
        l:                   filter.l ?? 1,
        sensitiveAttr:       filter.sensitiveAttr ?? "none",
        epsilon:             filter.epsilon ?? null,
      },
    });
  } catch (error) {
    setComparisonState((prev) => ({ ...prev, loading: false }));
    setToolAlert?.({
      type: "error",
      message: "Multi-k comparison failed",
      description: error.response?.data?.message || "One or more k values returned an error.",
    });
  }
};


const TEMPORAL_LABELS = {
  none:   "Spatial only",
  day:    "Day bucket",
  period: "Time period",
  hour:   "Hour bucket",
};

const SENSITIVE_ATTR_LABELS = {
  member_casual:    "Rider type",
  rideable_type:    "Bike type",
  gender:           "Gender",
  age_band:         "Age band",
  destination_area: "Destination area",
};

// UI caps for feasible ℓ values by sensitive attribute.
const MAX_L_FOR_ATTR = {
  member_casual:    2,
  rideable_type:    3,
  gender:           3,
  age_band:         5,
  destination_area: 5,
};

const MapCompare = () => {
  const savedSettings = React.useMemo(loadSavedMapSettings, []);

  const formatPercent = (v) => typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "n/a";
  const formatNumber  = (v, d = 2) => typeof v === "number" ? v.toFixed(d) : "n/a";

  const [gridSize,        setGridSize]        = useState(savedSettings?.gridSize || 0.01);
  const [show3D,          setShow3D]          = useState(false);
  const [showKComparison, setShowKComparison] = useState(false);
  const [showComparisonInfo, setShowComparisonInfo] = useState(true);
  const { dataSourceInfo } = useDataSources();
  const comparisonRef  = React.useRef(null);
  const [pendingRun,   setPendingRun]   = useState(false); // pulses the Run button after a 3D bar click
  const [toolAlert,    setToolAlert]    = useState(null);

  const initK = savedSettings?.anonymizedFilter?.k ?? 5;
  const [selectedKValues, setSelectedKValues] = useState(
    () => [...new Set([initK, 5, 10, 20])].sort((a, b) => a - b).slice(0, 4)
  );

  // Reset old member-only filters because rider-type diversity needs both groups.
  if (savedSettings?.originalFilter?.memberType === "member" ||
      savedSettings?.anonymizedFilter?.memberType === "member") {
    try { localStorage.removeItem(MAP_SETTINGS_KEY); } catch { /* non-fatal */ }
  }

  const defaultFilter = {
    date: "2024-01-01",
    memberType: "all",
    dataSource: "preloaded",
    minLat: NYC_BOUNDS[0][0], maxLat: NYC_BOUNDS[1][0],
    minLng: NYC_BOUNDS[0][1], maxLng: NYC_BOUNDS[1][1],
    centerLat: NYC_CENTER[0], centerLng: NYC_CENTER[1],
  };

  const [mapStateOriginal,   setMapStateOriginal]   = useState({
    stops: [], metrics: null, loading: false,
    filter: { ...defaultFilter, ...(savedSettings?.originalFilter || {}) },
  });
  const [mapStateAnonymized, setMapStateAnonymized] = useState({
    stops: [], metrics: null, loading: false,
    filter: {
      ...defaultFilter,
      k: 5,
      temporalGranularity: "none",
      l: 1,
      sensitiveAttr: "member_casual",
      epsilon: null,       // null = DP disabled (Infinity on the backend)
      ...(savedSettings?.anonymizedFilter || {}),
    },
  });
  const [kComparison, setKComparison] = useState({ loading: false, results: [], fetchedWith: null });
  const lastFetchedAnonConfig = React.useRef(null);

  // Pre-compute baseline stats from original stops whenever they change.
  const originalBaseline = React.useMemo(
    () => computeOriginalBaseline(mapStateOriginal.stops, gridSize),
    [mapStateOriginal.stops, gridSize],
  );

  // dataSourceInfo is now provided by useDataSources() above — no separate fetch needed.

  useEffect(() => {
    const source = mapStateOriginal.filter.dataSource || "preloaded";
    const nextBounds = boundsToFilter(dataSourceInfo?.bounds?.[source]);
    if (!nextBounds) return;
    const applyBounds = (prev) => ({ ...prev, filter: { ...prev.filter, ...nextBounds } });
    setMapStateOriginal(applyBounds);
    setMapStateAnonymized(applyBounds);
  }, [dataSourceInfo, mapStateOriginal.filter.dataSource]);

  useEffect(() => {
    saveMapSettings({
      gridSize,
      originalFilter:   mapStateOriginal.filter,
      anonymizedFilter: mapStateAnonymized.filter,
    });
  }, [gridSize, mapStateOriginal.filter, mapStateAnonymized.filter]);

  useEffect(() => {
    if (showKComparison && comparisonRef.current) {
      setTimeout(() => {
        comparisonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  }, [showKComparison]);

  const handleSync = useCallback((center, bounds) => {
    const update = {
      centerLat: center.lat, centerLng: center.lng,
      minLat: bounds.getSouthWest().lat, maxLat: bounds.getNorthEast().lat,
      minLng: bounds.getSouthWest().lng, maxLng: bounds.getNorthWest().lng,
    };
    setMapStateOriginal((p) => ({ ...p, filter: { ...p.filter, ...update } }));
    setMapStateAnonymized((p) => ({ ...p, filter: { ...p.filter, ...update } }));
  }, []);

  const userUploadedCount = dataSourceInfo?.bounds?.user?.count ?? dataSourceInfo?.userUploaded ?? 0;
  const requireUserDataIfSelected = useCallback((filter, actionLabel) => {
    if ((filter.dataSource || "preloaded") !== "user" || userUploadedCount > 0) return true;
    setToolAlert({
      type: "warning",
      message: "User Data is empty",
      description: `Cannot ${actionLabel}. Please upload a dataset first.`,
    });
    return false;
  }, [userUploadedCount]);

  const handle3DSelect = useCallback(({ k, temporalGranularity, l, sensitiveAttr, epsilon }) => {
    setMapStateAnonymized((p) => ({
      ...p,
      filter: {
        ...p.filter,
        ...(k                 !== undefined && { k }),
        ...(temporalGranularity !== undefined && { temporalGranularity }),
        ...(l                 !== undefined && { l }),
        ...(sensitiveAttr     !== undefined && { sensitiveAttr }),
        ...(epsilon           !== undefined && { epsilon }),
      },
    }));
    const parts = [
      k                 !== undefined && `k=${k}`,
      temporalGranularity !== undefined && `temporal=${temporalGranularity}`,
      l                 !== undefined && `ℓ=${l}`,
      sensitiveAttr     !== undefined && `attr=${sensitiveAttr}`,
      epsilon           !== undefined && (epsilon != null ? `ε=${epsilon}` : "DP off"),
    ].filter(Boolean);
    setToolAlert({
      type: "info",
      message: `Configuration applied: ${parts.join(", ")}`,
      description: 'Press the pulsing "Run Anonymization" button above to render the result on the map.',
    });
    // Pulse the Run Anonymization button so the user immediately knows what to click.
    setPendingRun(true);
  }, []);

  // Detect when anonymization settings have changed since the last "Run Anonymization" fetch.
  const anonCfg = lastFetchedAnonConfig.current;
  const anonKChanged        = !!(anonCfg && mapStateAnonymized.filter.k !== anonCfg.k);
  const isAnonSettingsDirty = !!(anonCfg && (
    anonKChanged ||
    gridSize                                            !== anonCfg.gridSize ||
    mapStateAnonymized.filter.temporalGranularity       !== anonCfg.temporalGranularity ||
    (mapStateAnonymized.filter.l ?? 1)                  !== anonCfg.l ||
    (mapStateAnonymized.filter.sensitiveAttr ?? "none") !== anonCfg.sensitiveAttr ||
    (mapStateAnonymized.filter.epsilon ?? null)         !== anonCfg.epsilon
  ));
  const runBtnLabel = anonKChanged
    ? `Apply k = ${mapStateAnonymized.filter.k}`
    : isAnonSettingsDirty
      ? "Re-run with New Settings"
      : "Run Anonymization";
  const runBtnIcon  = isAnonSettingsDirty ? <ReloadOutlined /> : <ClusterOutlined />;

  // Highlight the comparison update button when it no longer matches the current settings.
  const isDirty = !!(kComparison.fetchedWith && (
    JSON.stringify([...selectedKValues].sort((a, b) => a - b)) !==
      JSON.stringify([...kComparison.fetchedWith.kValues].sort((a, b) => a - b)) ||
    gridSize                                          !== kComparison.fetchedWith.gridSize ||
    mapStateAnonymized.filter.temporalGranularity     !== kComparison.fetchedWith.temporalGranularity ||
    (mapStateAnonymized.filter.l ?? 1)                !== (kComparison.fetchedWith.l ?? 1) ||
    (mapStateAnonymized.filter.sensitiveAttr ?? "none") !== (kComparison.fetchedWith.sensitiveAttr ?? "none") ||
    (mapStateAnonymized.filter.epsilon ?? null)       !== (kComparison.fetchedWith.epsilon ?? null)
  ));

  const metrics = mapStateAnonymized.metrics;
  const isMetricLoading = mapStateAnonymized.loading && !metrics;

  return (
    <div className="map-compare-page">

      <section className="tool-hero">
        <div className="tool-hero-body">
          <Space size={8} className="hero-kicker">
            <RocketOutlined />
            <span>Interactive Mobility Data Privacy Demonstrator</span>
          </Space>
          <Title level={2} style={{ margin: "8px 0 6px" }}>Explainable Anonymization of Mobility Data</Title>
          <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
            Apply and compare k-Anonymity, ℓ-Diversity, and Differential Privacy to real
            mobility trip data. Inspect utility-loss metrics side-by-side and explore the
            privacy–utility tradeoff in 3D.
          </Text>
        </div>
      </section>

      <Card className="controls-panel" styles={{ body: { padding: "20px 24px 16px" } }}>

        <div className="controls-section-label">
          <ControlOutlined className="controls-section-icon" />
          <span>Data Filters</span>
        </div>
        <FilterComponent
          filterState={mapStateOriginal.filter}
          setFilterState={(next) => setMapStateOriginal((p) => ({ ...p, filter: { ...p.filter, ...next } }))}
          setAnonymizedFilterState={(next) => setMapStateAnonymized((p) => ({ ...p, filter: { ...p.filter, ...next } }))}
          dataSourceInfo={dataSourceInfo}
        />

        <div className="controls-divider" />

        <div className="controls-section-label">
          <ClusterOutlined className="controls-section-icon" />
          <span>Anonymization Settings</span>
        </div>
        <Row gutter={[16, 12]} align="bottom">
          <Col xs={24} sm={12} md={8} lg={6}>
            <label className="control-label">
              <AppstoreOutlined className="control-label-icon" />
              Grid Size
              <Tooltip title="Spatial resolution of the anonymization grid. Smaller = finer detail but more sparse cells and higher suppression. Larger = broader areas merged together." placement="top">
                <QuestionCircleOutlined className="control-help-icon" />
              </Tooltip>
            </label>
            <Input
              type="number"
              value={gridSize}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v) && v > 0) setGridSize(v);
              }}
              step="0.005"
              min="0.005"
              prefix={<AppstoreOutlined style={{ color: "var(--app-muted)" }} />}
            />
          </Col>

          <Col xs={24} sm={12} md={8} lg={6}>
            <label className="control-label">
              <EyeInvisibleOutlined className="control-label-icon" />
              k Value
              <Tooltip title="Minimum group size guarantee. Each released cluster must contain at least k trips. Higher k = stronger re-identification protection but potentially more suppression and spatial distortion." placement="top">
                <QuestionCircleOutlined className="control-help-icon" />
              </Tooltip>
            </label>
            <Select
              value={mapStateAnonymized.filter.k}
              style={{ width: "100%" }}
              onChange={(v) => {
                setMapStateAnonymized((p) => ({ ...p, filter: { ...p.filter, k: v } }));
                setPendingRun(true);
              }}
            >
              {Array.from({ length: 16 }, (_, i) => i + 5).map((n) => (
                <Select.Option key={n} value={n}>k = {n}</Select.Option>
              ))}
            </Select>
          </Col>

          <Col xs={24} sm={12} md={8} lg={6}>
            <label className="control-label">
              <LineChartOutlined className="control-label-icon" />
              Temporal Privacy
              <Tooltip
                title="Controls how time is included in the anonymization key. 'Spatial only' ignores time entirely. 'Hour bucket' is strictest — trips are grouped by hour of day, making buckets sparser and suppression higher."
                placement="top"
              >
                <QuestionCircleOutlined className="control-help-icon" />
              </Tooltip>
            </label>
            <Select
              value={mapStateAnonymized.filter.temporalGranularity}
              style={{ width: "100%" }}
              onChange={(v) => setMapStateAnonymized((p) => ({ ...p, filter: { ...p.filter, temporalGranularity: v } }))}
              options={[
                { value: "none",   label: "Spatial only" },
                { value: "day",    label: "Day bucket" },
                { value: "period", label: "Time period bucket" },
                { value: "hour",   label: "Hour bucket (strictest)" },
              ]}
            />
          </Col>

          <Col xs={24} sm={12} md={8} lg={6}>
            <label className="control-label">
              <SafetyOutlined className="control-label-icon" />
              ℓ-Diversity
              <Tooltip
                title="Extends k-anonymity by requiring each released group to contain at least ℓ distinct values of a sensitive attribute. This prevents attribute-inference attacks — an adversary cannot deduce a shared property (e.g. rider type, bike type, or destination area) for everyone in the group. Higher ℓ = stronger attribute privacy, but typically more merging and suppression."
                placement="top"
              >
                <QuestionCircleOutlined className="control-help-icon" />
              </Tooltip>
            </label>
            <Select
              value={mapStateAnonymized.filter.l}
              style={{ width: "100%" }}
              onChange={(v) => setMapStateAnonymized((p) => ({ ...p, filter: { ...p.filter, l: v } }))}
              options={(() => {
                const maxL = MAX_L_FOR_ATTR[mapStateAnonymized.filter.sensitiveAttr] ?? 5;
                return [
                  { value: 1, label: "Off (k-anonymity only)" },
                  ...Array.from({ length: maxL - 1 }, (_, i) => {
                    const lv = i + 2;
                    const attrLabel = SENSITIVE_ATTR_LABELS[mapStateAnonymized.filter.sensitiveAttr];
                    const hint = lv === maxL && attrLabel
                      ? ` (max for ${attrLabel})`
                      : "";
                    return { value: lv, label: `ℓ = ${lv}${hint}` };
                  }),
                ];
              })()}
            />
          </Col>

          <Col xs={24} sm={12} md={8} lg={6}>
            <label className="control-label">
              <NodeIndexOutlined className="control-label-icon" />
              ε-DP Noise
              <Tooltip
                title="Applies Laplace noise to released centroids and counts (post k-anonymization). Smaller ε = more noise = stronger semantic privacy guarantee. ε=1 is considered 'strong'; ε=10 is 'weak'. This adds a probabilistic privacy layer on top of k-anonymity's structural guarantee."
                placement="top"
              >
                <QuestionCircleOutlined className="control-help-icon" />
              </Tooltip>
            </label>
            <Select
              value={mapStateAnonymized.filter.epsilon ?? null}
              style={{ width: "100%" }}
              onChange={(v) => setMapStateAnonymized((p) => ({ ...p, filter: { ...p.filter, epsilon: v } }))}
              options={[
                { value: null,  label: "Off (no DP noise)" },
                { value: 10,    label: "ε = 10  (very weak)" },
                { value: 5,     label: "ε = 5   (weak)" },
                { value: 2,     label: "ε = 2   (moderate)" },
                { value: 1,     label: "ε = 1   (strong)" },
                { value: 0.5,   label: "ε = 0.5 (very strong)" },
              ]}
            />
          </Col>

          {/* Sensitive attribute — only meaningful when ℓ ≥ 2 */}
          <Col xs={24} sm={12} md={8} lg={6}>
            <label className={`control-label${mapStateAnonymized.filter.l < 2 ? " control-label--muted" : ""}`}>
              <ApartmentOutlined className="control-label-icon" />
              Sensitive Attribute
              <Tooltip
                title="The attribute whose diversity is enforced within each group. 'Rider type' (member vs casual) is a demographic proxy. 'Bike type' reflects usage pattern. 'Destination area' protects against destination-inference attacks — the most sensitive for mobility data."
                placement="top"
              >
                <QuestionCircleOutlined className="control-help-icon" />
              </Tooltip>
            </label>
            <Select
              value={mapStateAnonymized.filter.sensitiveAttr}
              style={{ width: "100%" }}
              disabled={mapStateAnonymized.filter.l < 2}
              onChange={(v) => setMapStateAnonymized((p) => {
                const maxL = MAX_L_FOR_ATTR[v] ?? 5;
                const clampedL = Math.min(p.filter.l ?? 1, maxL);
                return { ...p, filter: { ...p.filter, sensitiveAttr: v, l: clampedL } };
              })}
              options={[
                { value: "member_casual",    label: "Rider type (member / casual)" },
                { value: "rideable_type",    label: "Bike type (classic / electric / docked)" },
                { value: "gender",           label: "Gender (Hubway demographic)" },
                { value: "age_band",         label: "Age band (from birth year)" },
                { value: "destination_area", label: "Destination area (grid cell)" },
              ]}
            />
          </Col>
        </Row>

        {mapStateAnonymized.filter.l >= 2 &&
          mapStateAnonymized.filter.sensitiveAttr === "member_casual" &&
          mapStateAnonymized.filter.memberType !== "all" && (
          <Alert
            type="warning"
            showIcon
            className="ldiversity-warn-alert"
            message={
              <span>
                <strong>ℓ-Diversity conflict:</strong> Sensitive attribute is{" "}
                <em>Rider type</em> but Member Type filter is set to{" "}
                <strong>{mapStateAnonymized.filter.memberType}</strong> — all fetched trips
                will share the same rider type, making ℓ={mapStateAnonymized.filter.l} impossible.
              </span>
            }
            action={
              <Button
                size="small"
                type="primary"
                ghost
                onClick={() => {
                  setMapStateOriginal((p) => ({ ...p, filter: { ...p.filter, memberType: "all" } }));
                  setMapStateAnonymized((p) => ({ ...p, filter: { ...p.filter, memberType: "all" } }));
                }}
              >
                Switch to All Riders
              </Button>
            }
          />
        )}

        {mapStateAnonymized.filter.l >= 2 &&
          mapStateAnonymized.filter.sensitiveAttr === "rideable_type" &&
          mapStateAnonymized.filter.memberType !== "all" && (
          <Alert
            type="info"
            showIcon
            className="ldiversity-warn-alert"
            message={
              <span>
                <strong>Tip:</strong> Bike type diversity is not affected by the Member Type filter —
                both rider types use multiple bike types. However, <em>All Riders</em> increases
                the trip count, which can reduce suppression.
              </span>
            }
          />
        )}

        {toolAlert && (
          <Alert
            type={toolAlert.type}
            showIcon
            closable
            className="ldiversity-warn-alert"
            message={toolAlert.message}
            description={toolAlert.description}
            onClose={() => setToolAlert(null)}
          />
        )}

        <div className="action-row">
          <Space wrap>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => {
                if (!requireUserDataIfSelected(mapStateOriginal.filter, "load user data")) return;
                setToolAlert(null);
                fetchStopsData(mapStateOriginal.filter, setMapStateOriginal, "original", setToolAlert);
              }}
              loading={mapStateOriginal.loading}
            >
              Load Original
            </Button>
            <div className={pendingRun || isAnonSettingsDirty ? "run-btn-pulse" : undefined}>
              <Button
                type="primary"
                icon={runBtnIcon}
                onClick={() => {
                  if (!requireUserDataIfSelected(mapStateAnonymized.filter, "run anonymization")) return;
                  setToolAlert(null);
                  setPendingRun(false);
                  lastFetchedAnonConfig.current = {
                    k:                 mapStateAnonymized.filter.k,
                    l:                 mapStateAnonymized.filter.l ?? 1,
                    sensitiveAttr:     mapStateAnonymized.filter.sensitiveAttr ?? "none",
                    epsilon:           mapStateAnonymized.filter.epsilon ?? null,
                    gridSize,
                    temporalGranularity: mapStateAnonymized.filter.temporalGranularity,
                  };
                  fetchStopsData(
                    {
                      ...mapStateAnonymized.filter,
                      gridSize,
                      l:            mapStateAnonymized.filter.l ?? 1,
                      sensitiveAttr: mapStateAnonymized.filter.sensitiveAttr ?? "none",
                      ...(mapStateAnonymized.filter.epsilon != null && { epsilon: mapStateAnonymized.filter.epsilon }),
                    },
                    setMapStateAnonymized,
                    "anonymized",
                    setToolAlert
                  );
                }}
                loading={mapStateAnonymized.loading}
              >
                {runBtnLabel}
              </Button>
            </div>
          </Space>
          <Space wrap className="action-row-right">

            {(() => {
              const hasResults = kComparison.results.length > 0;

              if (hasResults && showKComparison) {
                return (
                  <Button
                    type="primary"
                    icon={<CloseOutlined />}
                    onClick={() => setShowKComparison(false)}
                  >
                    Hide Comparison
                  </Button>
                );
              }

              if (hasResults && !showKComparison) {
                return (
                  <Badge dot color="#16a34a" offset={[-4, 4]}>
                    <Button
                      icon={<BarChartOutlined />}
                      onClick={() => { setShowKComparison(true); setShowComparisonInfo(true); setShow3D(false); }}
                    >
                      Show Comparison
                    </Button>
                  </Badge>
                );
              }

              return (
                <Tooltip title={`Compare up to 4 k values side-by-side on the same filters. Currently selected: k=${selectedKValues.join(", ")}. You can add or remove k values inside the panel after the first fetch.`}>
                  <Button
                    icon={<BarChartOutlined />}
                    loading={kComparison.loading}
                    onClick={async () => {
                      if (!requireUserDataIfSelected(mapStateAnonymized.filter, "run multi-k comparison")) return;
                      setToolAlert(null);
                      await fetchKComparisonData(mapStateAnonymized.filter, gridSize, selectedKValues, setKComparison, setToolAlert);
                      setShowKComparison(true);
                      setShowComparisonInfo(true);
                      setShow3D(false);
                    }}
                  >
                    {kComparison.loading
                      ? `Comparing k=${selectedKValues.join(", ")}…`
                      : "Compare k Values"}
                  </Button>
                </Tooltip>
              );
            })()}

            <Tooltip title="Open the 3D Privacy-Utility Landscape — an interactive surface showing how suppression and utility change across all k values and temporal modes. Click any bar to apply that configuration.">
              <Button
                icon={<LineChartOutlined />}
                onClick={() => {
                  setShow3D((v) => {
                    if (!v) setShowKComparison(false); // hide comparison when opening 3D
                    return !v;
                  });
                }}
                type={show3D ? "primary" : "default"}
              >
                {show3D ? "Hide 3D Landscape" : "3D Landscape"}
              </Button>
            </Tooltip>
          </Space>
        </div>
      </Card>

      {show3D && (
        <Card
          className="viz3d-card"
          title={
            <Space>
              <LineChartOutlined />
              <span>Privacy-Utility Landscape</span>
              <HelpPopover
                title="Privacy-Utility Landscape"
                content="Each bar shows the expected suppression rate for a given (k, temporal granularity) configuration. Taller bars mean more suppression. Click any bar to apply that configuration to the anonymization tool below."
              />
            </Space>
          }
        >
          <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
            <PrivacyLandscape
              activeK={mapStateAnonymized.filter.k}
              activeTemporal={mapStateAnonymized.filter.temporalGranularity}
              activeL={mapStateAnonymized.filter.l ?? 1}
              activeSensAttr={mapStateAnonymized.filter.sensitiveAttr ?? "none"}
              activeEpsilon={mapStateAnonymized.filter.epsilon ?? null}
              onConfigSelect={handle3DSelect}
            />
          </Suspense>
        </Card>
      )}

      {(metrics || isMetricLoading) && (
        isMetricLoading ? (
          <Row gutter={[12, 12]} className="metric-grid">
            {[0,1,2,3,4,5,6,7].map((i) => (
              <Col key={i} xs={24} sm={12} xl={6}><MetricSkeleton /></Col>
            ))}
          </Row>
        ) : (
          <Collapse
            size="small"
            className="metric-collapse"
            defaultActiveKey={['k-anon']}
            items={[
              {
                key: 'k-anon',
                label: (
                  <Space wrap size={6}>
                    <EyeInvisibleOutlined />
                    <strong>k-Anonymity Results</strong>
                    <Tag color="blue" style={{ margin: 0 }}>k = {metrics.k}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {metrics.outputGroups} groups · {metrics.suppressedRecords} suppressed ·{" "}
                      {formatPercent(metrics.densityCosineSimilarity)} cosine ·{" "}
                      {formatNumber(metrics.avgSpatialErrorKm)} km error
                    </Text>
                  </Space>
                ),
                children: (
                  <Row gutter={[12, 12]} className="metric-grid">
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<EyeInvisibleOutlined />} label="k Violations" metricKey="kViolations" value={metrics.kViolations} tone={metrics.kViolations === 0 ? "good" : "bad"} />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<ClusterOutlined />} label="Released Groups" metricKey="outputGroups" value={metrics.outputGroups} />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<TeamOutlined />} label="Min Group Size" metricKey="minGroupSize" value={metrics.minGroupSize} tone={metrics.minGroupSize >= metrics.k ? "good" : "bad"} />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<DotChartOutlined />} label="Suppressed" metricKey="suppressedRecords" value={metrics.suppressedRecords} />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<CompressOutlined />} label="Mean Error" metricKey="avgSpatialErrorKm" value={formatNumber(metrics.avgSpatialErrorKm)} suffix="km" tone="warn" />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<FireOutlined />} label="Hotspot Overlap" metricKey="top10HotspotOverlap" value={formatPercent(metrics.top10HotspotOverlap)} tone="good" />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<RadarChartOutlined />} label="Density (Cosine)" metricKey="densityCosineSimilarity" value={formatPercent(metrics.densityCosineSimilarity)} tone="good" />
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'performance',
                label: (
                  <Space wrap size={6}>
                    <ThunderboltOutlined />
                    <strong>Performance</strong>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      DB {formatNumber(metrics.dbQueryMs)} ms · Total {formatNumber(metrics.totalBackendMs)} ms
                    </Text>
                  </Space>
                ),
                children: (
                  <Row gutter={[12, 12]} className="metric-grid">
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<FundOutlined />} label="DB Query" metricKey="dbQueryMs" value={formatNumber(metrics.dbQueryMs)} suffix="ms" />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<ThunderboltOutlined />} label="Backend Total" metricKey="totalBackendMs" value={formatNumber(metrics.totalBackendMs)} suffix="ms" />
                    </Col>
                  </Row>
                ),
              },
              ...(metrics.dpEnabled ? [{
                key: 'dp',
                label: (
                  <Space wrap size={6}>
                    <NodeIndexOutlined />
                    <strong>ε-Differential Privacy</strong>
                    <Tag color="volcano" style={{ margin: 0 }}>ε = {metrics.epsilon}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatNumber(metrics.avgCentroidDisplacementKm)} km avg displacement · noise λ = {formatNumber(metrics.dpLocationScaleKm)} km
                    </Text>
                  </Space>
                ),
                children: (
                  <>
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 12 }}
                      message={
                        <span>
                          <strong>Metrics vary on each fetch</strong> — Mean Error, Cosine Similarity, Hotspot Overlap, and Min Group Size all shift because the Laplace mechanism draws fresh random noise every time.
                          This is expected behavior of ε-DP, not a bug. Disable ε-DP (set ε to Off) to get fully deterministic results.
                        </span>
                      }
                    />
                    <Row gutter={[12, 12]} className="metric-grid">
                      <Col xs={24} sm={12} xl={6}>
                        <MetricCard icon={<NodeIndexOutlined />} label="Avg Centroid Displacement" metricKey="avgCentroidDisplacementKm" value={formatNumber(metrics.avgCentroidDisplacementKm)} suffix="km" tone="warn" />
                      </Col>
                      <Col xs={24} sm={12} xl={6}>
                        <MetricCard icon={<CompressOutlined />} label="Location Noise Scale" metricKey="dpLocationScaleKm" value={formatNumber(metrics.dpLocationScaleKm)} suffix="km" tone="neutral" />
                      </Col>
                      <Col xs={24} sm={12} xl={6}>
                        <MetricCard icon={<DotChartOutlined />} label="Count Noise Scale (λ)" metricKey="dpCountScale" value={formatNumber(metrics.dpCountScale, 3)} suffix="trips" tone="neutral" />
                      </Col>
                      <Col xs={24} sm={12} xl={6}>
                        <MetricCard icon={<EyeInvisibleOutlined />} label="Privacy Budget (ε)" metricKey="dpEpsilon" value={metrics.epsilon} tone={metrics.epsilon <= 1 ? "good" : metrics.epsilon <= 5 ? "warn" : "neutral"} />
                      </Col>
                    </Row>
                  </>
                ),
              }] : []),
              ...(metrics.lViolations !== undefined ? [{
                key: 'ldiversity',
                label: (
                  <Space wrap size={6}>
                    <SafetyOutlined />
                    <strong>ℓ-Diversity Results</strong>
                    <Tag color="purple" style={{ margin: 0 }}>
                      ℓ = {metrics.l} · {SENSITIVE_ATTR_LABELS[metrics.sensitiveAttr] ?? metrics.sensitiveAttr}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {metrics.lViolations === 0 ? "✓ No violations" : `${metrics.lViolations} violations`} · min {metrics.minDistinctSensitiveValues} distinct values
                    </Text>
                  </Space>
                ),
                children: (
                  <Row gutter={[12, 12]} className="metric-grid">
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<SafetyOutlined />} label="ℓ Violations" metricKey="lViolations" value={metrics.lViolations} tone={metrics.lViolations === 0 ? "good" : "bad"} />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<ApartmentOutlined />} label="Min Distinct Values" metricKey="minDistinctSensitiveValues" value={metrics.minDistinctSensitiveValues} tone={metrics.minDistinctSensitiveValues >= metrics.l ? "good" : "bad"} />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<UserOutlined />} label="Avg Distinct Values" metricKey="avgDistinctSensitiveValues" value={formatNumber(metrics.avgDistinctSensitiveValues)} tone="neutral" />
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <MetricCard icon={<ApartmentOutlined />} label="Max Distinct Values" metricKey="maxDistinctSensitiveValues" value={metrics.maxDistinctSensitiveValues} tone="neutral" />
                    </Col>
                  </Row>
                ),
              }] : []),
            ]}
          />
        )
      )}

      {kComparison.results.length > 0 && showKComparison && (
        <div ref={comparisonRef} className="comparison-section">
          <div className="section-title comparison-section-header">
            <Space wrap>
              <BarChartOutlined />
              <Title level={4} style={{ margin: 0 }}>Multi-k Comparison</Title>
              <HelpPopover
                title="Multi-k Comparison"
                content="Same spatial + temporal filters applied across all chosen k values. Higher k gives stronger privacy guarantees but typically increases suppression and spatial error. Use the dropdown to add/remove k values, then click Update to re-fetch."
              />
            </Space>

            <Space wrap className="comparison-controls">
              <Select
                mode="multiple"
                value={selectedKValues}
                onChange={(vals) => {
                  if (vals.length > 4) {
                    setToolAlert({
                      type: "warning",
                      message: "Maximum 4 k values allowed",
                      description: "Remove one before adding another.",
                    });
                    return;
                  }
                  if (vals.length === 0) {
                    setToolAlert({
                      type: "warning",
                      message: "At least one k value required",
                    });
                    return;
                  }
                  setToolAlert(null);
                  setSelectedKValues([...vals].sort((a, b) => a - b));
                }}
                style={{ minWidth: 220 }}
                placeholder="Select k values (max 4)"
                maxTagCount="responsive"
                options={Array.from({ length: 19 }, (_, i) => i + 2).map((n) => ({
                  value: n,
                  label: `k = ${n}`,
                }))}
              />

              <Tooltip title="Grid size from Anonymization Settings">
                <Tag icon={<AppstoreOutlined />} color="geekblue" style={{ cursor: "default" }}>
                  Grid {gridSize}
                </Tag>
              </Tooltip>
              <Tooltip title="Temporal granularity from Anonymization Settings">
                <Tag icon={<LineChartOutlined />} color="purple" style={{ cursor: "default" }}>
                  {TEMPORAL_LABELS[mapStateAnonymized.filter.temporalGranularity] ?? mapStateAnonymized.filter.temporalGranularity}
                </Tag>
              </Tooltip>

              <Tooltip title={isDirty ? "Settings changed since last fetch — click to update the comparison" : "Re-fetch all k values with the current filters"}>
                <Button
                  type={isDirty ? "primary" : "default"}
                  icon={<BarChartOutlined />}
                  loading={kComparison.loading}
                  onClick={() => {
                    if (!requireUserDataIfSelected(mapStateAnonymized.filter, "run multi-k comparison")) return;
                    setToolAlert(null);
                    fetchKComparisonData(mapStateAnonymized.filter, gridSize, selectedKValues, setKComparison, setToolAlert);
                  }}
                >
                  {isDirty ? "Update Comparison" : "Re-fetch"}
                </Button>
              </Tooltip>

              <Button size="small" icon={<CloseOutlined />} onClick={() => setShowKComparison(false)}>
                Close
              </Button>
            </Space>
          </div>

          {showComparisonInfo && (
            <Alert
              type="info"
              showIcon
              closable
              onClose={() => setShowComparisonInfo(false)}
              className="comparison-hint-alert"
              style={{ marginBottom: 8 }}
              message={<strong>How Multi-k Comparison works</strong>}
              description={
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>Select <strong>up to 4 k values</strong> using the dropdown — the panel compares them side-by-side with identical filters.</li>
                  <li><strong>Higher k</strong> = stronger privacy guarantee but more records suppressed and larger spatial error.</li>
                  <li>After changing anonymization settings (ℓ-diversity, ε-DP, grid size, temporal), click <strong>Update Comparison</strong> to re-run with the new configuration.</li>
                </ul>
              }
            />
          )}

          {isDirty && (
            <Alert
              type="warning"
              showIcon
              className="comparison-hint-alert comparison-dirty-alert"
              style={{ marginBottom: 8 }}
              message={<strong>Anonymization settings have changed</strong>}
              description="The comparison below was fetched with different settings. Use the Update Comparison button above to reflect your current configuration."
            />
          )}

          {!selectedKValues.includes(mapStateAnonymized.filter.k) && (
            <Alert
              type="info"
              showIcon
              className="comparison-hint-alert"
              message={
                <span>
                  Your active <strong>k = {mapStateAnonymized.filter.k}</strong> is not included in the comparison.
                  Add it to see how your current setting stacks up.
                </span>
              }
              action={
                <Button
                  size="small"
                  type="primary"
                  ghost
                  onClick={() =>
                    setSelectedKValues((prev) =>
                      [...new Set([...prev, mapStateAnonymized.filter.k])].sort((a, b) => a - b).slice(0, 4)
                    )
                  }
                >
                  Add k = {mapStateAnonymized.filter.k}
                </Button>
              }
            />
          )}

          <Spin spinning={kComparison.loading}>
            <Row gutter={[16, 16]} className="comparison-grid">
              {kComparison.results.map((result) => (
                <Col
                  xs={24}
                  sm={kComparison.results.length === 2 ? 12 : 24}
                  lg={kComparison.results.length <= 3 ? 8 : 6}
                  key={result.k}
                >
                  <Card
                    size="small"
                    className={`comparison-card ${result.k === mapStateAnonymized.filter.k ? "comparison-card--active" : ""}`}
                    title={
                      <Space>
                        <ClusterOutlined />
                        <span>k = {result.k}</span>
                        {result.k === mapStateAnonymized.filter.k && (
                          <Tag color="blue">current</Tag>
                        )}
                        {result.metrics && (
                          <Tag color={result.metrics.suppressedRecords === 0 ? "green" : "orange"}>
                            {result.metrics.suppressedRecords} suppressed
                          </Tag>
                        )}
                      </Space>
                    }
                  >
                    {result.stops.length > 0
                      ? (
                        <MiniAnonymizedMap
                          result={result}
                          center={[mapStateAnonymized.filter.centerLat, mapStateAnonymized.filter.centerLng]}
                          gridSize={gridSize}
                          filter={kComparison.fetchedWith}
                        />
                      )
                      : <MapEmpty message={`No groups could satisfy k=${result.k} with current filters.`} />
                    }
                    {result.metrics && (
                      <div className="comparison-metrics">
                        <span>Groups <strong>{result.metrics.outputGroups}</strong></span>
                        <Tooltip
                          title={METRIC_HELP.minGroupSize.content}
                          placement="top"
                          overlayInnerStyle={{ background: "#fff", color: "#000" }}
                          color="#fff"
                        >
                          <span className="comparison-metric-info" style={{ cursor: "help", display: "inline-flex", alignItems: "center", gap: 3 }}>
                            Min group <InfoCircleOutlined style={{ fontSize: 11, color: "#722ed1", flexShrink: 0 }} /> <strong>{result.metrics.minGroupSize}</strong>
                          </span>
                        </Tooltip>
                        <span>Suppressed <strong>{result.metrics.suppressedRecords}</strong></span>
                        <span>Error <strong>{formatNumber(result.metrics.avgSpatialErrorKm)} km</strong></span>
                        <span>Cosine <strong>{formatPercent(result.metrics.densityCosineSimilarity)}</strong></span>
                        <span>Hotspots <strong>{formatPercent(result.metrics.top10HotspotOverlap)}</strong></span>
                        <span>DB <strong>{formatNumber(result.metrics.dbQueryMs)} ms</strong></span>
                        <span>Total <strong>{formatNumber(result.metrics.totalBackendMs)} ms</strong></span>
                      </div>
                    )}
                  </Card>
                </Col>
              ))}
            </Row>
          </Spin>
        </div>
      )}

      <div className="map-grid">
        <MapComponent
          mapKey={mapStateOriginal}
          mapType="original"
          onSync={handleSync}
          gridSize={gridSize}
          title="Original Trips"
          subtitle="Raw trip start and end points inside the current map bounds."
          footerContent={
            originalBaseline
              ? <OriginalTripsBaseline baseline={originalBaseline} gridSize={gridSize} />
              : null
          }
        />
        <MapComponent
          mapKey={mapStateAnonymized}
          mapType="anonymized"
          onSync={handleSync}
          gridSize={gridSize}
          title="Anonymized Groups"
          subtitle="Released centroids and heat intensity after the selected privacy settings."
        />
      </div>
    </div>
  );
};

export default MapCompare;
