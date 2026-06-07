import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import {
  MapContainer, TileLayer, Marker, Polyline, Popup, useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Alert, Badge, Button, Card, Col, Empty, Input, notification, Popover,
  Row, Select, Skeleton, Space, Spin, Statistic,
  Tag, Tooltip, Typography,
} from "antd";
import {
  AimOutlined, ApartmentOutlined, AppstoreOutlined, BarChartOutlined, ClusterOutlined,
  CloseOutlined, CompressOutlined, ControlOutlined, DotChartOutlined,
  EyeInvisibleOutlined, FireOutlined, FundOutlined, LineChartOutlined,
  NodeIndexOutlined, PlayCircleOutlined, QuestionCircleOutlined, RadarChartOutlined,
  RocketOutlined, SafetyOutlined, ThunderboltOutlined, UserOutlined,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  // ── ε-DP metrics ──────────────────────────────────────────────────────────
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
  // ── ℓ-Diversity metrics ───────────────────────────────────────────────────
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

// ── Centroid popup helpers ────────────────────────────────────────────────────
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
      {/* ── Header ── */}
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
          {/* ── Trips count — labelled "(noisy)" when DP is on ── */}
          <PopupRow label="Trips">
            {stop.count}
            {dpActive && (
              <span style={{ color: "#faad14", fontWeight: 400, fontSize: 11, marginLeft: 5 }}>
                (noise applied)
              </span>
            )}
          </PopupRow>

          {/* ── Spatial errors ── */}
          <PopupRow label="Mean error">{stop.spatialErrorMeanKm?.toFixed(2)} km</PopupRow>
          <PopupRow label="Max error">
            <span style={{ color: stop.spatialErrorMaxKm > 1 ? "#d46b08" : "inherit" }}>
              {stop.spatialErrorMaxKm?.toFixed(2)} km
            </span>
          </PopupRow>

          {/* ── Structure ── */}
          <PopupRow label="Cells merged">{stop.cellsMerged}</PopupRow>
          <PopupRow label="Time bucket">{stop.temporalBucket || "—"}</PopupRow>

          {/* ── ℓ-Diversity — only when ℓ ≥ 2 ── */}
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

          {/* ── DP Displacement — only when ε is active ── */}
          {dpActive && stop.dpDisplacementKm !== undefined && (
            <PopupRow label="DP centroid shift">
              <span style={{ color: stop.dpDisplacementKm > 1 ? "#d46b08" : "#389e0d" }}>
                {stop.dpDisplacementKm.toFixed(2)} km
              </span>
            </PopupRow>
          )}

          {/* ── Position ── */}
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
// ─────────────────────────────────────────────────────────────────────────────

const MapComponent = ({ mapKey, mapType, onSync, gridSize, title, subtitle }) => {
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

// ─── Data fetchers ────────────────────────────────────────────────────────────

const fetchStopsData = async (filter, setMapState, mapType) => {
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
      notification.warning({ message: "No data returned", description: data.message || "The query returned an empty result." });
    }
  } catch (error) {
    setMapState((prev) => ({ ...prev, loading: false }));
    const msg = error.response?.data?.message || error.message;
    notification.error({
      message: `Failed to load ${mapType === "anonymized" ? "anonymized" : "original"} data`,
      description: msg || "Check that the backend server is running on port 5000.",
      duration: 6,
    });
  }
};

const fetchKComparisonData = async (filter, gridSize, kValues, setComparisonState) => {
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
    notification.error({
      message: "Multi-k comparison failed",
      description: error.response?.data?.message || "One or more k values returned an error.",
    });
  }
};

// ─── Main component ───────────────────────────────────────────────────────────

const TEMPORAL_LABELS = {
  none:   "Spatial only",
  day:    "Day bucket",
  period: "Time period",
  hour:   "Hour bucket",
};

const SENSITIVE_ATTR_LABELS = {
  member_casual:    "Rider type",
  rideable_type:    "Bike type",
  destination_area: "Destination area",
};

// Maximum achievable ℓ per sensitive attribute.
// member_casual has exactly 2 distinct values (member / casual).
// rideable_type has up to 3 (classic_bike / electric_bike / docked_bike).
// destination_area has many distinct grid-cell values — capped at 5 for the UI.
const MAX_L_FOR_ATTR = {
  member_casual:    2,
  rideable_type:    3,
  destination_area: 5,
};

const MapCompare = () => {
  const savedSettings = React.useMemo(loadSavedMapSettings, []);

  const formatPercent = (v) => typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "n/a";
  const formatNumber  = (v, d = 2) => typeof v === "number" ? v.toFixed(d) : "n/a";

  const [gridSize,        setGridSize]        = useState(savedSettings?.gridSize || 0.01);
  const [show3D,          setShow3D]          = useState(false);
  const [showKComparison, setShowKComparison] = useState(false);
  const [dataSourceInfo,  setDataSourceInfo]  = useState(null);
  const comparisonRef = React.useRef(null);

  // k values the user wants in the comparison panel (max 4)
  const initK = savedSettings?.anonymizedFilter?.k ?? 5;
  const [selectedKValues, setSelectedKValues] = useState(
    () => [...new Set([initK, 5, 10, 20])].sort((a, b) => a - b).slice(0, 4)
  );

  // If a previous session saved "member" as the memberType, discard it so
  // ℓ-diversity works out of the box (member_casual needs both rider types present).
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

  // Load data-source metadata (bounds + counts + date ranges)
  useEffect(() => {
    axios.get(`${API}/api/upload/data-sources`)
      .then(({ data }) => setDataSourceInfo(data.data))
      .catch(() => {/* non-fatal */});
  }, []);

  // Re-center maps when the data source changes
  useEffect(() => {
    const source = mapStateOriginal.filter.dataSource || "preloaded";
    const nextBounds = boundsToFilter(dataSourceInfo?.bounds?.[source]);
    if (!nextBounds) return;
    const applyBounds = (prev) => ({ ...prev, filter: { ...prev.filter, ...nextBounds } });
    setMapStateOriginal(applyBounds);
    setMapStateAnonymized(applyBounds);
  }, [dataSourceInfo, mapStateOriginal.filter.dataSource]);

  // Persist settings
  useEffect(() => {
    saveMapSettings({
      gridSize,
      originalFilter:   mapStateOriginal.filter,
      anonymizedFilter: mapStateAnonymized.filter,
    });
  }, [gridSize, mapStateOriginal.filter, mapStateAnonymized.filter]);

  // Scroll to comparison section whenever it is revealed
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

  // 3D landscape click → apply k + temporal to the anonymized filter
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
    notification.info({
      message: `Configuration applied: ${parts.join(", ")}`,
      description: "Click Run Anonymization to see the result on the map.",
      duration: 4,
    });
  }, []);

  // Comparison panel is "dirty" when the user has changed k values, gridSize, or temporal
  // since the last fetch — flags the Update button as primary
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

      {/* ── Hero ── */}
      <section className="tool-hero">
        <div className="tool-hero-body">
          <Space size={8} className="hero-kicker">
            <RocketOutlined />
            <span>Interactive privacy-utility demonstrator</span>
          </Space>
          <Title level={2} style={{ margin: "8px 0 6px" }}>Data Anonymization and Utility</Title>
          <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
            Compare raw mobility trips with k-anonymized spatial-temporal groups, inspect
            utility loss metrics, and explore the privacy-utility tradeoff in 3D.
          </Text>
        </div>
      </section>

      {/* ── Controls ── */}
      <Card className="controls-panel" styles={{ body: { padding: "20px 24px 16px" } }}>

        {/* ── Section 1: Data Filters ── */}
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

        {/* ── Divider ── */}
        <div className="controls-divider" />

        {/* ── Section 2: Anonymization Settings ── */}
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
              onChange={(v) => setMapStateAnonymized((p) => ({ ...p, filter: { ...p.filter, k: v } }))}
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

          {/* ── ℓ-Diversity ── */}
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

          {/* ── ε-Differential Privacy ── */}
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
                { value: "destination_area", label: "Destination area (grid cell)" },
              ]}
            />
          </Col>
        </Row>

        {/* ── ℓ-Diversity compatibility warnings ── */}
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

        {/* ── Action buttons ── */}
        <div className="action-row">
          <Space wrap>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => fetchStopsData(mapStateOriginal.filter, setMapStateOriginal, "original")}
              loading={mapStateOriginal.loading}
            >
              Load Original
            </Button>
            <Button
              type="primary"
              icon={<ClusterOutlined />}
              onClick={() => fetchStopsData(
                {
                  ...mapStateAnonymized.filter,
                  gridSize,
                  l:            mapStateAnonymized.filter.l ?? 1,
                  sensitiveAttr: mapStateAnonymized.filter.sensitiveAttr ?? "none",
                  ...(mapStateAnonymized.filter.epsilon != null && { epsilon: mapStateAnonymized.filter.epsilon }),
                },
                setMapStateAnonymized,
                "anonymized"
              )}
              loading={mapStateAnonymized.loading}
            >
              Run Anonymization
            </Button>
          </Space>
          <Space wrap className="action-row-right">

            {/* ── Compare k Values — 3-state smart toggle ── */}
            {(() => {
              const hasResults = kComparison.results.length > 0;

              // State 2: results visible → offer to hide
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

              // State 3: results exist but hidden → green dot badge to catch attention
              if (hasResults && !showKComparison) {
                return (
                  <Badge dot color="#16a34a" offset={[-4, 4]}>
                    <Button
                      icon={<BarChartOutlined />}
                      onClick={() => setShowKComparison(true)}
                    >
                      Show Comparison
                    </Button>
                  </Badge>
                );
              }

              // State 1: no results yet → fetch + auto-reveal
              return (
                <Tooltip title={`Runs k=${selectedKValues.join(", ")} side-by-side on the same filters so you can compare privacy guarantees and utility loss without switching back and forth. Adjust k values in the comparison panel header after the first fetch.`}>
                  <Button
                    icon={<BarChartOutlined />}
                    loading={kComparison.loading}
                    onClick={async () => {
                      await fetchKComparisonData(mapStateAnonymized.filter, gridSize, selectedKValues, setKComparison);
                      setShowKComparison(true);
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
                onClick={() => setShow3D((v) => !v)}
                type={show3D ? "primary" : "default"}
              >
                {show3D ? "Hide 3D Landscape" : "3D Landscape"}
              </Button>
            </Tooltip>
          </Space>
        </div>
      </Card>

      {/* ── 3D Privacy-Utility Landscape ── */}
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

      {/* ── Metric cards ── */}
      {(metrics || isMetricLoading) && (
        <Row gutter={[12, 12]} className="metric-grid">
          {isMetricLoading ? (
            [0,1,2,3,4,5,6,7].map((i) => (
              <Col key={i} xs={24} sm={12} xl={6}><MetricSkeleton /></Col>
            ))
          ) : (
            <>
              <Col xs={24} sm={12} xl={6}>
                <MetricCard icon={<EyeInvisibleOutlined />} label="k Violations" metricKey="kViolations" value={metrics.kViolations} tone="good" />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <MetricCard icon={<ClusterOutlined />} label="Released Groups" metricKey="outputGroups" value={metrics.outputGroups} />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <MetricCard icon={<CompressOutlined />} label="Mean Error" metricKey="avgSpatialErrorKm" value={formatNumber(metrics.avgSpatialErrorKm)} suffix="km" tone="warn" />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <MetricCard icon={<FireOutlined />} label="Hotspot Overlap" metricKey="top10HotspotOverlap" value={formatPercent(metrics.top10HotspotOverlap)} tone="good" />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <MetricCard icon={<DotChartOutlined />} label="Suppressed" metricKey="suppressedRecords" value={metrics.suppressedRecords} />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <MetricCard icon={<RadarChartOutlined />} label="Density (Cosine)" metricKey="densityCosineSimilarity" value={formatPercent(metrics.densityCosineSimilarity)} tone="good" />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <MetricCard icon={<FundOutlined />} label="DB Query" metricKey="dbQueryMs" value={formatNumber(metrics.dbQueryMs)} suffix="ms" />
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <MetricCard icon={<ThunderboltOutlined />} label="Backend Total" metricKey="totalBackendMs" value={formatNumber(metrics.totalBackendMs)} suffix="ms" />
              </Col>

              {/* ── ε-DP metrics — only rendered when DP is active ── */}
              {metrics.dpEnabled && (
                <>
                  <Col xs={24}>
                    <div className="metric-section-divider">
                      <NodeIndexOutlined />
                      <span>ε-Differential Privacy</span>
                      <Tag color="volcano">ε = {metrics.epsilon}</Tag>
                    </div>
                  </Col>
                  <Col xs={24} sm={12} xl={6}>
                    <MetricCard
                      icon={<NodeIndexOutlined />}
                      label="Avg Centroid Displacement"
                      metricKey="avgCentroidDisplacementKm"
                      value={formatNumber(metrics.avgCentroidDisplacementKm)}
                      suffix="km"
                      tone="warn"
                    />
                  </Col>
                  <Col xs={24} sm={12} xl={6}>
                    <MetricCard
                      icon={<CompressOutlined />}
                      label="Location Noise Scale"
                      metricKey="dpLocationScaleKm"
                      value={formatNumber(metrics.dpLocationScaleKm)}
                      suffix="km"
                      tone="neutral"
                    />
                  </Col>
                  <Col xs={24} sm={12} xl={6}>
                    <MetricCard
                      icon={<DotChartOutlined />}
                      label="Count Noise Scale (λ)"
                      metricKey="dpCountScale"
                      value={formatNumber(metrics.dpCountScale, 3)}
                      suffix="trips"
                      tone="neutral"
                    />
                  </Col>
                  <Col xs={24} sm={12} xl={6}>
                    <MetricCard
                      icon={<EyeInvisibleOutlined />}
                      label="Privacy Budget (ε)"
                      metricKey="dpEpsilon"
                      value={metrics.epsilon}
                      tone={metrics.epsilon <= 1 ? "good" : metrics.epsilon <= 5 ? "warn" : "neutral"}
                    />
                  </Col>
                </>
              )}

              {/* ── ℓ-Diversity metrics — only rendered when ℓ ≥ 2 ── */}
              {metrics.lViolations !== undefined && (
                <>
                  <Col xs={24}>
                    <div className="metric-section-divider">
                      <SafetyOutlined />
                      <span>ℓ-Diversity Results</span>
                      <Tag color="purple">
                        ℓ = {metrics.l} · {SENSITIVE_ATTR_LABELS[metrics.sensitiveAttr] ?? metrics.sensitiveAttr}
                      </Tag>
                    </div>
                  </Col>
                  <Col xs={24} sm={12} xl={6}>
                    <MetricCard
                      icon={<SafetyOutlined />}
                      label="ℓ Violations"
                      metricKey="lViolations"
                      value={metrics.lViolations}
                      tone={metrics.lViolations === 0 ? "good" : "bad"}
                    />
                  </Col>
                  <Col xs={24} sm={12} xl={6}>
                    <MetricCard
                      icon={<ApartmentOutlined />}
                      label="Min Distinct Values"
                      metricKey="minDistinctSensitiveValues"
                      value={metrics.minDistinctSensitiveValues}
                      tone={metrics.minDistinctSensitiveValues >= metrics.l ? "good" : "bad"}
                    />
                  </Col>
                  <Col xs={24} sm={12} xl={6}>
                    <MetricCard
                      icon={<UserOutlined />}
                      label="Avg Distinct Values"
                      metricKey="avgDistinctSensitiveValues"
                      value={formatNumber(metrics.avgDistinctSensitiveValues)}
                      tone="neutral"
                    />
                  </Col>
                  <Col xs={24} sm={12} xl={6}>
                    <MetricCard
                      icon={<ApartmentOutlined />}
                      label="Max Distinct Values"
                      metricKey="maxDistinctSensitiveValues"
                      value={metrics.maxDistinctSensitiveValues}
                      tone="neutral"
                    />
                  </Col>
                </>
              )}
            </>
          )}
        </Row>
      )}

      {/* ── Multi-k comparison — shown only when user has revealed it ── */}
      {kComparison.results.length > 0 && showKComparison && (
        <div ref={comparisonRef} className="comparison-section">
          {/* ── Comparison header ── */}
          <div className="section-title comparison-section-header">
            {/* Left: title + help */}
            <Space wrap>
              <BarChartOutlined />
              <Title level={4} style={{ margin: 0 }}>Multi-k Comparison</Title>
              <HelpPopover
                title="Multi-k Comparison"
                content="Same spatial + temporal filters applied across all chosen k values. Higher k gives stronger privacy guarantees but typically increases suppression and spatial error. Use the dropdown to add/remove k values, then click Update to re-fetch."
              />
            </Space>

            {/* Right: controls */}
            <Space wrap className="comparison-controls">
              {/* k-value multi-select */}
              <Select
                mode="multiple"
                value={selectedKValues}
                onChange={(vals) => {
                  if (vals.length > 4) {
                    notification.warning({ message: "Maximum 4 k values allowed", description: "Remove one before adding another.", duration: 3 });
                    return;
                  }
                  if (vals.length === 0) {
                    notification.warning({ message: "At least one k value required", duration: 2 });
                    return;
                  }
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

              {/* Read-only setting tags */}
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

              {/* Update / Re-fetch button */}
              <Tooltip title={isDirty ? "Settings changed since last fetch — click to update the comparison" : "Re-fetch all k values with the current filters"}>
                <Button
                  type={isDirty ? "primary" : "default"}
                  icon={<BarChartOutlined />}
                  loading={kComparison.loading}
                  onClick={() =>
                    fetchKComparisonData(mapStateAnonymized.filter, gridSize, selectedKValues, setKComparison)
                  }
                >
                  {isDirty ? "Update Comparison" : "Re-fetch"}
                </Button>
              </Tooltip>

              <Button size="small" icon={<CloseOutlined />} onClick={() => setShowKComparison(false)}>
                Close
              </Button>
            </Space>
          </div>

          {/* ── Hint: current k not in comparison ── */}
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

          {/* ── Comparison cards ── */}
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
                        <span>Min group <strong>{result.metrics.minGroupSize}</strong></span>
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

      {/* ── Map panels ── */}
      <div className="map-grid">
        <MapComponent
          mapKey={mapStateOriginal}
          mapType="original"
          onSync={handleSync}
          gridSize={gridSize}
          title="Original Trips"
          subtitle="Raw trip start and end points inside the current map bounds."
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
