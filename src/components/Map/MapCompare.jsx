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
import { Input, Button, Row, Col, Spin, Select } from "antd";
import axios from "axios";
import { FilterComponent } from "./FilterComponent";
import mapIcon from "../../assets/map-marke.svg";
import L from "leaflet";
import "leaflet.heat";

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
      }));

      setMapState((prev) => ({
        ...prev,
        stops: anonymizedStops,
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

const MapComponent = ({ mapKey, setMapState, mapType, onSync, gridSize }) => {
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
    <div style={{ width: "100%", height: "600px", display: "inline-block" }}>
      <Spin spinning={mapKey.loading}>
        <MapContainer
          ref={mapRef}
          center={[mapKey.filter.centerLat, mapKey.filter.centerLng]}
          zoom={12}
          style={{ height: "500px", width: "100%" }}
          maxBounds={NYC_BOUNDS}
          maxBoundsViscosity={1.0}
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
    </div>
  );
};

const MapCompare = () => {
  const [gridSize, setGridSize] = useState(0.01); // Default grid size

  const [mapStateOriginal, setMapStateOriginal] = useState({
    stops: [],
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
    },
  });

  const [mapStateAnonymized, setMapStateAnonymized] = useState({
    stops: [],
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
    },
  });

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

  return (
    <div>
      <div className="explanation">
        <h2>Data Anonymization and Utility</h2>
        <p>
          This tool compares original trip data with k-anonymized data. K-anonymity helps protect user privacy by grouping trips into clusters, but it may impact data utility. Use the grid overlay to see how centroids are created and adjust the grid size to fine-tune the level of anonymity.
        </p>
      </div>

      <Row gutter={16} style={{ marginBottom: "20px" }}>
        <Col span={12}>
          <label>Grid Size</label>
          <Input
            type="number"
            value={gridSize}
            onChange={(e) => setGridSize(parseFloat(e.target.value))}
            step="0.01"
            min="0.01"
          />
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: "20px" }}>
        <Col span={12} style={{ textAlign: "center" }}>
          <h3>Original Map</h3>
        </Col>
        <Col span={12} style={{ textAlign: "center" }}>
          <h3>Anonymized Map</h3>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: "20px" }}>
        <Col style={{ width: "52%" }}>
          <FilterComponent
            filterState={mapStateOriginal.filter}
            setFilterState={(newState) =>
              setMapStateOriginal((prev) => ({ ...prev, filter: newState }))
            }
            setAnonymizedFilterState={(newState) =>
              setMapStateAnonymized((prev) => ({ ...prev, filter: newState }))
            }
          />
        </Col>
        <Col>
          <label style={{ display: "block", marginBottom: "5px" }}>Select value of K</label>
          <Select
            placeholder="Select a filter"
            style={{ width: 200 }}
            onChange={(value) =>
              setMapStateAnonymized((prev) => ({
                ...prev,
                filter: { ...prev.filter, k: value },
              }))
            }
          >
            {Array.from({ length: 16 }, (_, i) => i + 5).map((num) => (
              <Select.Option key={num} value={num}>
                {num}
              </Select.Option>
            ))}
          </Select>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col style={{ width: "52%" }}>
          <Button
            type="primary"
            onClick={() =>
              fetchStopsData(mapStateOriginal.filter, setMapStateOriginal, "original")
            }
          >
            Apply Filter (Original)
          </Button>
        </Col>
        <Col>
          <Button
            type="primary"
            onClick={() =>
              fetchStopsData(mapStateAnonymized.filter, setMapStateAnonymized, "anonymized")
            }
          >
            Apply Filter (Anonymized)
          </Button>
        </Col>
      </Row>

      <div style={{ display: "flex", justifyContent: "space-between" }} className="py-2">
        <div style={{ width: "48%" }}>
          <MapComponent
            mapKey={mapStateOriginal}
            setMapState={setMapStateOriginal}
            mapType="original"
            onSync={handleSync}
            gridSize={gridSize}
          />
        </div>
        <div style={{ width: "48%" }}>
          <MapComponent
            mapKey={mapStateAnonymized}
            setMapState={setMapStateAnonymized}
            mapType="anonymized"
            onSync={handleSync}
            gridSize={gridSize}
          />
        </div>
      </div>
    </div>
  );
};

export default MapCompare;
