import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Button,
  Card,
  Col,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  AimOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  EyeInvisibleOutlined,
  FireOutlined,
  MoonOutlined,
  PlayCircleOutlined,
  SunOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { FilterComponent } from "./FilterComponent";
import mapIcon from "../../assets/map-marke.svg";
import L from "leaflet";
import "leaflet.heat";

const { Text, Title } = Typography;

const customIcon = L.icon({
  iconUrl: mapIcon,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -41],
});

const NYC_BOUNDS = [
  [40.477399, -74.25909],
  [40.917577, -73.700272],
];
const NYC_CENTER = [40.7128, -74.006];
const MAP_SETTINGS_KEY = "bicycleAnonymizationMapSettings";

const boundsToFilter = (bounds) => {
  if (!bounds || [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng].some((value) => typeof value !== "number")) {
    return null;
  }

  const latPadding = Math.max((bounds.maxLat - bounds.minLat) * 0.08, 0.01);
  const lngPadding = Math.max((bounds.maxLng - bounds.minLng) * 0.08, 0.01);

  return {
    minLat: Math.max(-90, bounds.minLat - latPadding),
    maxLat: Math.min(90, bounds.maxLat + latPadding),
    minLng: Math.max(-180, bounds.minLng - lngPadding),
    maxLng: Math.min(180, bounds.maxLng + lngPadding),
    centerLat: (bounds.minLat + bounds.maxLat) / 2,
    centerLng: (bounds.minLng + bounds.maxLng) / 2,
  };
};

/**
 * SyncView updates the Leaflet map view whenever the `center` (or `zoom`) prop changes.
 */
function SyncView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

const fetchStopsData = async (filter, setMapState, mapType) => {
  setMapState((prev) => ({ ...prev, loading: true }));
  const apiUrl =
    mapType === "anonymized"
      ? "http://localhost:5000/api/trips/anonymized"
      : "http://localhost:5000/api/trips";

  try {
    // Add dataSource to the params
    const params = {
      ...filter,
      dataSource: filter.dataSource || 'preloaded'
    };
    const response = await axios.get(apiUrl, { params });

    if (mapType === "anonymized" && Array.isArray(response.data.data)) {
      // Process anonymized data
      const anonymizedStops = response.data.data.map((trip) => ({
        position: [trip.centroidLat, trip.centroidLng],
        count: trip.count,
        temporalBucket: trip.temporalBucket,
        cellsMerged: trip.cellsMerged,
        spatialErrorMeanKm: trip.spatialErrorMeanKm,
        spatialErrorMaxKm: trip.spatialErrorMaxKm,
      }));

      setMapState((prev) => ({
        ...prev,
        stops: anonymizedStops,
        metrics: response.data.metrics || null,
        loading: false,
      }));
    } else if (Array.isArray(response.data.data)) {
      // Process original data
      const stops = response.data.data.map((trip) => {
        if (trip.start_lat && trip.start_lng && trip.end_lat && trip.end_lng) {
          return {
            start: [trip.start_lat, trip.start_lng],
            end: [trip.end_lat, trip.end_lng],
            name: trip?.start_station_name || "Trip",
            route: [
              [trip.start_lat, trip.start_lng],
              [trip.end_lat, trip.end_lng],
            ],
            details: trip,
          };
        }
        return null;
      });

      setMapState((prev) => ({
        ...prev,
        stops: stops.filter((stop) => stop !== null),
        metrics: response.data.metrics || null,
        loading: false,
      }));
    } else {
      console.error("Expected an array but got:", response.data);
      setMapState((prev) => ({ ...prev, loading: false }));
    }
  } catch (error) {
    console.error("Error fetching stops data:", error);
    setMapState((prev) => ({ ...prev, loading: false }));
  }
};

const fetchKComparisonData = async (filter, gridSize, setComparisonState) => {
  const kValues = [5, 10, 20];
  setComparisonState((prev) => ({ ...prev, loading: true }));

  try {
    const responses = await Promise.all(
      kValues.map(async (k) => {
        const response = await axios.get("http://localhost:5000/api/trips/anonymized", {
          params: {
            ...filter,
            k,
            gridSize,
            dataSource: filter.dataSource || "preloaded",
          },
        });

        return {
          k,
          stops: (response.data.data || []).map((trip) => ({
            position: [trip.centroidLat, trip.centroidLng],
            count: trip.count,
            temporalBucket: trip.temporalBucket,
            cellsMerged: trip.cellsMerged,
            spatialErrorMeanKm: trip.spatialErrorMeanKm,
          })),
          metrics: response.data.metrics || null,
        };
      })
    );

    setComparisonState({ loading: false, results: responses });
  } catch (error) {
    console.error("Error fetching multi-k comparison data:", error);
    setComparisonState((prev) => ({ ...prev, loading: false }));
  }
};

const loadSavedMapSettings = () => {
  try {
    const saved = localStorage.getItem(MAP_SETTINGS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn("Could not load saved map settings:", error);
    return null;
  }
};

const saveMapSettings = (settings) => {
  try {
    localStorage.setItem(MAP_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Could not save map settings:", error);
  }
};

const GridOverlay = ({ gridSize }) => {
  const map = useMap();
  const bounds = map.getBounds();
  const gridLines = [];

  for (let lat = bounds.getSouth(); lat <= bounds.getNorth(); lat += gridSize) {
    gridLines.push([[lat, bounds.getWest()], [lat, bounds.getEast()]]);
  }

  for (let lng = bounds.getWest(); lng <= bounds.getEast(); lng += gridSize) {
    gridLines.push([[bounds.getSouth(), lng], [bounds.getNorth(), lng]]);
  }

  return (
    <>
      {gridLines.map((line, index) => (
        <Polyline key={index} positions={line} color="red" weight={1} />
      ))}
    </>
  );
};

const MapComponent = ({ mapKey, mapType, onSync, gridSize, title, subtitle }) => {
  const mapRef = React.useRef();

  useEffect(() => {
    if (mapType === "anonymized" && mapRef.current) {
      const map = mapRef.current;
      const heatLayer = L.heatLayer(
        mapKey.stops.map((stop) => [
          stop.position[0], // Latitude
          stop.position[1], // Longitude
          stop.count, // Intensity
        ]),
        {
          radius: 25,
          blur: 15,
          maxZoom: 17,
        }
      );

      map.eachLayer((layer) => {
        if (layer instanceof L.HeatLayer) {
          map.removeLayer(layer); // Remove existing heatmap layer
        }
      });

      heatLayer.addTo(map);
    }
  }, [mapKey.stops, mapType]);

  return (
    <Card
      className="map-panel"
      title={
        <Space size={8}>
          {mapType === "anonymized" ? <ClusterOutlined /> : <AimOutlined />}
          <span>{title}</span>
        </Space>
      }
      extra={<Tag>{mapKey.stops.length} shown</Tag>}
    >
      <Text type="secondary" className="map-subtitle">
        {subtitle}
      </Text>
      <Spin spinning={mapKey.loading}>
        <MapContainer
          ref={mapRef}
          center={[mapKey.filter.centerLat, mapKey.filter.centerLng]}
          zoom={12}
          className="main-map"
          dragging={true}
          scrollWheelZoom={true}
          zoomControl={true}
          minZoom={12}
          maxZoom={22}
          eventHandlers={{
            moveend: (e) => {
              const map = e.target;
              const center = map.getCenter();
              const bounds = map.getBounds();
              // Call the sync callback with the new center and visible bounds
              onSync(center, bounds);
            },
          }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {/* Force re-centering on updates */}
          <SyncView center={[mapKey.filter.centerLat, mapKey.filter.centerLng]} zoom={12} />
          <GridOverlay gridSize={gridSize} />
          {mapKey.stops.map((stop, index) => (
            <React.Fragment key={index}>
              {mapType === "anonymized" ? (
                <Marker position={stop.position} icon={customIcon}>
                  <Popup>
                    <strong>Anonymized Data:</strong>
                    <p>Count: {stop.count}</p>
                    <p>Time: {stop.temporalBucket}</p>
                    <p>Cells merged: {stop.cellsMerged}</p>
                    <p>Mean error: {stop.spatialErrorMeanKm?.toFixed(2)} km</p>
                    <p>Lat: {stop.position[0]}</p>
                    <p>Lng: {stop.position[1]}</p>
                  </Popup>
                </Marker>
              ) : (
                <>
                  <Marker icon={customIcon} position={stop.start} />
                  <Marker position={stop.end} icon={customIcon} />
                  <Polyline positions={stop.route || [stop.start, stop.end]} color="blue" weight={5}>
                    <Popup>
                      <strong>Trip Details:</strong>
                      <br />
                      <b>Ride ID: {stop.details.ride_id}</b>
                      <p>Start Station: {stop.details.start_station_name}</p>
                      <p>End Station: {stop.details.end_station_name}</p>
                    </Popup>
                  </Polyline>
                </>
              )}
            </React.Fragment>
          ))}
        </MapContainer>
      </Spin>
    </Card>
  );
};

const MiniAnonymizedMap = ({ result, center, gridSize }) => {
  const mapRef = React.useRef();

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    map.eachLayer((layer) => {
      if (layer instanceof L.HeatLayer) {
        map.removeLayer(layer);
      }
    });

    if (result.stops.length === 0) return;

    L.heatLayer(
      result.stops.map((stop) => [stop.position[0], stop.position[1], stop.count]),
      { radius: 22, blur: 14, maxZoom: 17 }
    ).addTo(map);
  }, [result.stops]);

  return (
    <MapContainer
      ref={mapRef}
      center={center}
      zoom={11}
      className="mini-map"
      scrollWheelZoom={false}
      zoomControl={false}
      dragging={true}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <GridOverlay gridSize={gridSize} />
      {result.stops.map((stop, index) => (
        <Marker key={index} position={stop.position} icon={customIcon}>
          <Popup>
            <strong>k={result.k}</strong>
            <p>Count: {stop.count}</p>
            <p>Cells merged: {stop.cellsMerged}</p>
            <p>Mean error: {stop.spatialErrorMeanKm?.toFixed(2)} km</p>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

const MetricCard = ({ icon, label, value, suffix, tone = "neutral" }) => (
  <Card size="small" className={`metric-card metric-card-${tone}`}>
    <Statistic
      title={
        <Space size={6}>
          {icon}
          <span>{label}</span>
        </Space>
      }
      value={value ?? "n/a"}
      suffix={suffix}
      valueStyle={{ fontSize: 22, fontWeight: 700 }}
    />
  </Card>
);

const MapCompare = ({ themeMode, setThemeMode }) => {
  const savedSettings = React.useMemo(loadSavedMapSettings, []);
  const [gridSize, setGridSize] = useState(savedSettings?.gridSize || 0.01);
  const formatPercent = (value) =>
    typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "n/a";
  const formatNumber = (value, digits = 2) =>
    typeof value === "number" ? value.toFixed(digits) : "n/a";

  const [mapStateOriginal, setMapStateOriginal] = useState({
    stops: [],
    metrics: null,
    loading: false,
    filter: {
      date: "2024-01-01",
      memberType: "member",
      dataSource: "preloaded",
      // Using NYC_BOUNDS for the initial visible bounds
      minLat: NYC_BOUNDS[0][0],
      maxLat: NYC_BOUNDS[1][0],
      minLng: NYC_BOUNDS[0][1],
      maxLng: NYC_BOUNDS[1][1],
      centerLat: NYC_CENTER[0],
      centerLng: NYC_CENTER[1],
      ...(savedSettings?.originalFilter || {}),
    },
  });

  const [mapStateAnonymized, setMapStateAnonymized] = useState({
    stops: [],
    metrics: null,
    loading: false,
    filter: {
      date: "2024-01-01",
      memberType: "member",
      dataSource: "preloaded",
      minLat: NYC_BOUNDS[0][0],
      maxLat: NYC_BOUNDS[1][0],
      minLng: NYC_BOUNDS[0][1],
      maxLng: NYC_BOUNDS[1][1],
      centerLat: NYC_CENTER[0],
      centerLng: NYC_CENTER[1],
      k: 5,
      temporalGranularity: "none",
      ...(savedSettings?.anonymizedFilter || {}),
    },
  });
  const [kComparison, setKComparison] = useState({
    loading: false,
    results: [],
  });
  const [dataSourceInfo, setDataSourceInfo] = useState(null);

  useEffect(() => {
    axios
      .get("http://localhost:5000/api/upload/data-sources")
      .then((response) => setDataSourceInfo(response.data.data))
      .catch((error) => console.warn("Could not load data source bounds:", error));
  }, []);

  useEffect(() => {
    saveMapSettings({
      gridSize,
      originalFilter: mapStateOriginal.filter,
      anonymizedFilter: mapStateAnonymized.filter,
    });
  }, [gridSize, mapStateOriginal.filter, mapStateAnonymized.filter]);

  useEffect(() => {
    const source = mapStateOriginal.filter.dataSource || "preloaded";
    const sourceBounds = dataSourceInfo?.bounds?.[source];
    const nextBounds = boundsToFilter(sourceBounds);
    if (!nextBounds) return;

    const applyBounds = (prev) => ({
      ...prev,
      filter: {
        ...prev.filter,
        ...nextBounds,
      },
    });

    setMapStateOriginal(applyBounds);
    setMapStateAnonymized(applyBounds);
  }, [dataSourceInfo, mapStateOriginal.filter.dataSource]);

  /**
   * Whenever one map moves (or zooms), update both maps’ filters with the new center and bounds.
   * This ensures both maps are synchronized.
   */
  const handleSync = (center, bounds) => {
    const newCenterLat = center.lat;
    const newCenterLng = center.lng;
    const newMinLat = bounds.getSouthWest().lat;
    const newMaxLat = bounds.getNorthEast().lat;
    const newMinLng = bounds.getSouthWest().lng;
    const newMaxLng = bounds.getNorthWest().lng;

    setMapStateOriginal((prev) => ({
      ...prev,
      filter: {
        ...prev.filter,
        centerLat: newCenterLat,
        centerLng: newCenterLng,
        minLat: newMinLat,
        maxLat: newMaxLat,
        minLng: newMinLng,
        maxLng: newMaxLng,
      },
    }));
    setMapStateAnonymized((prev) => ({
      ...prev,
      filter: {
        ...prev.filter,
        centerLat: newCenterLat,
        centerLng: newCenterLng,
        minLat: newMinLat,
        maxLat: newMaxLat,
        minLng: newMinLng,
        maxLng: newMaxLng,
      },
    }));
  };

  const metrics = mapStateAnonymized.metrics;

  return (
    <div className="map-compare-page">
      <section className="tool-hero">
        <div>
          <Space size={8} className="hero-kicker">
            <BarChartOutlined />
            <span>Interactive privacy-utility demonstrator</span>
          </Space>
          <Title level={2}>Data Anonymization and Utility</Title>
          <Text>
            Compare raw Citi Bike trips with k-anonymized spatial-temporal groups, inspect
            utility loss, and prepare paper-quality demo screenshots from one workspace.
          </Text>
        </div>
        <Segmented
          value={themeMode}
          onChange={setThemeMode}
          options={[
            { label: "Light", value: "light", icon: <SunOutlined /> },
            { label: "Dark", value: "dark", icon: <MoonOutlined /> },
          ]}
        />
      </section>

      <Card className="controls-panel">
        <Row gutter={[16, 16]} align="bottom">
          <Col xs={24} xl={11}>
            <FilterComponent
              filterState={mapStateOriginal.filter}
              setFilterState={(newState) =>
                setMapStateOriginal((prev) => ({ ...prev, filter: { ...prev.filter, ...newState } }))
              }
              setAnonymizedFilterState={(newState) =>
                setMapStateAnonymized((prev) => ({ ...prev, filter: { ...prev.filter, ...newState } }))
              }
            />
          </Col>
          <Col xs={24} sm={8} xl={4}>
            <label className="control-label">
              Grid Size{" "}
              <Tooltip title="Controls the spatial grid used by backend anonymization and the red grid overlay. Larger values usually merge broader areas.">
                <span className="help-dot">?</span>
              </Tooltip>
            </label>
            <Input
              type="number"
              value={gridSize}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (!Number.isNaN(value) && value > 0) setGridSize(value);
              }}
              step="0.01"
              min="0.01"
              prefix={<AppstoreOutlined />}
            />
          </Col>
          <Col xs={24} sm={8} xl={4}>
            <label className="control-label">
              k Value{" "}
              <Tooltip title="Each released anonymized cluster must represent at least this many trips. Higher k improves anonymity but can reduce detail.">
                <span className="help-dot">?</span>
              </Tooltip>
            </label>
            <Select
              value={mapStateAnonymized.filter.k}
              className="full-width"
              onChange={(value) =>
                setMapStateAnonymized((prev) => ({
                  ...prev,
                  filter: { ...prev.filter, k: value },
                }))
              }
            >
              {Array.from({ length: 16 }, (_, i) => i + 5).map((num) => (
                <Select.Option key={num} value={num}>
                  k = {num}
                </Select.Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={8} xl={5}>
            <label className="control-label">
              Temporal Privacy{" "}
              <Tooltip title="Adds time buckets to anonymization. Hour buckets protect timing better, but can suppress more records and reduce utility.">
                <span className="help-dot">?</span>
              </Tooltip>
            </label>
            <Select
              value={mapStateAnonymized.filter.temporalGranularity}
              className="full-width"
              onChange={(value) =>
                setMapStateAnonymized((prev) => ({
                  ...prev,
                  filter: { ...prev.filter, temporalGranularity: value },
                }))
              }
              options={[
                { value: "none", label: "Spatial only" },
                { value: "day", label: "Day bucket" },
                { value: "period", label: "Time period bucket" },
                { value: "hour", label: "Hour bucket" },
              ]}
            />
          </Col>
        </Row>
        <Space wrap className="action-row">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() =>
              fetchStopsData(mapStateOriginal.filter, setMapStateOriginal, "original")
            }
          >
            Load Original
          </Button>
          <Button
            type="primary"
            icon={<ClusterOutlined />}
            onClick={() =>
              fetchStopsData(
                { ...mapStateAnonymized.filter, gridSize },
                setMapStateAnonymized,
                "anonymized"
              )
            }
          >
            Run Anonymization
          </Button>
          <Tooltip title="Runs the anonymization for k=5, k=10, and k=20 on the same filters so you can compare privacy and utility without switching back and forth.">
            <Button
              icon={<BarChartOutlined />}
              onClick={() =>
                fetchKComparisonData(
                  mapStateAnonymized.filter,
                  gridSize,
                  setKComparison
                )
              }
              loading={kComparison.loading}
            >
              Compare k Values
            </Button>
          </Tooltip>
        </Space>
      </Card>

      {mapStateAnonymized.metrics && (
        <Row gutter={[12, 12]} className="metric-grid">
          <Col xs={24} sm={12} xl={6}>
            <MetricCard icon={<EyeInvisibleOutlined />} label="k Violations" value={metrics.kViolations} tone="good" />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <MetricCard icon={<ClusterOutlined />} label="Released Groups" value={metrics.outputGroups} />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <MetricCard icon={<AimOutlined />} label="Mean Error" value={formatNumber(metrics.avgSpatialErrorKm)} suffix="km" tone="warn" />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <MetricCard icon={<FireOutlined />} label="Hotspot Overlap" value={formatPercent(metrics.top10HotspotOverlap)} tone="good" />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <MetricCard icon={<AppstoreOutlined />} label="Suppressed" value={metrics.suppressedRecords} />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <MetricCard icon={<BarChartOutlined />} label="Density Similarity" value={formatPercent(metrics.densityCosineSimilarity)} tone="good" />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <MetricCard icon={<DatabaseOutlined />} label="DB Query" value={formatNumber(metrics.dbQueryMs)} suffix="ms" />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <MetricCard icon={<ThunderboltOutlined />} label="Backend Total" value={formatNumber(metrics.totalBackendMs)} suffix="ms" />
          </Col>
        </Row>
      )}

      {kComparison.results.length > 0 && (
        <Spin spinning={kComparison.loading}>
          <div className="section-title">
            <Space>
              <BarChartOutlined />
              <Title level={4}>Multi-k Comparison</Title>
            </Space>
            <Text type="secondary">Same filters, different privacy guarantees.</Text>
          </div>
          <Row gutter={[16, 16]} className="comparison-grid">
            {kComparison.results.map((result) => (
              <Col xs={24} lg={8} key={result.k}>
                <Card
                  size="small"
                  className="comparison-card"
                  title={
                    <Space>
                      <ClusterOutlined />
                      <span>k = {result.k}</span>
                    </Space>
                  }
                >
                  <MiniAnonymizedMap
                    result={result}
                    center={[
                      mapStateAnonymized.filter.centerLat,
                      mapStateAnonymized.filter.centerLng,
                    ]}
                    gridSize={gridSize}
                  />
                  {result.metrics && (
                    <div className="comparison-metrics">
                      <span>Groups <strong>{result.metrics.outputGroups}</strong></span>
                      <span>Min group <strong>{result.metrics.minGroupSize}</strong></span>
                      <span>Suppressed <strong>{result.metrics.suppressedRecords}</strong></span>
                      <span>Error <strong>{formatNumber(result.metrics.avgSpatialErrorKm)} km</strong></span>
                      <span>Density <strong>{formatPercent(result.metrics.densityCosineSimilarity)}</strong></span>
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
      )}

      <div className="map-grid">
        <div>
          <MapComponent
            mapKey={mapStateOriginal}
            mapType="original"
            onSync={handleSync}
            gridSize={gridSize}
            title="Original Trips"
            subtitle="Raw trip start and end points inside the current map bounds."
          />
        </div>
        <div>
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
    </div>
  );
};

export default MapCompare;
