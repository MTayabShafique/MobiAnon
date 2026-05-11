/**
 * PrivacyLandscape — SVG isometric 3D bar chart for the privacy-utility tradeoff.
 *
 * Axes:
 *   Columns (left→right) = temporal granularity (none, day, period, hour)
 *   Rows    (back→front) = k value (5, 10, 15, 20)
 *   Height  (z axis, up) = selected metric
 *
 * Clicking a bar calls onConfigSelect({ k, temporalGranularity }).
 */

import React, { useState } from "react";
import { Select, Space, Tag, Typography } from "antd";

const { Text } = Typography;

const LANDSCAPE_DATA = [
  // k=5
  { k: 5,  temporal: "none",   suppression: 0.04, densitySim: 0.94, spatialError: 0.08, kViols: 0 },
  { k: 5,  temporal: "day",    suppression: 0.11, densitySim: 0.91, spatialError: 0.09, kViols: 0 },
  { k: 5,  temporal: "period", suppression: 0.19, densitySim: 0.87, spatialError: 0.11, kViols: 0 },
  { k: 5,  temporal: "hour",   suppression: 0.47, densitySim: 0.72, spatialError: 0.15, kViols: 0 },
  // k=10
  { k: 10, temporal: "none",   suppression: 0.07, densitySim: 0.92, spatialError: 0.10, kViols: 0 },
  { k: 10, temporal: "day",    suppression: 0.18, densitySim: 0.88, spatialError: 0.12, kViols: 0 },
  { k: 10, temporal: "period", suppression: 0.31, densitySim: 0.83, spatialError: 0.14, kViols: 0 },
  { k: 10, temporal: "hour",   suppression: 0.65, densitySim: 0.63, spatialError: 0.21, kViols: 0 },
  // k=15
  { k: 15, temporal: "none",   suppression: 0.10, densitySim: 0.90, spatialError: 0.13, kViols: 0 },
  { k: 15, temporal: "day",    suppression: 0.24, densitySim: 0.85, spatialError: 0.15, kViols: 0 },
  { k: 15, temporal: "period", suppression: 0.42, densitySim: 0.78, spatialError: 0.19, kViols: 0 },
  { k: 15, temporal: "hour",   suppression: 0.81, densitySim: 0.48, spatialError: 0.28, kViols: 0 },
  // k=20
  { k: 20, temporal: "none",   suppression: 0.13, densitySim: 0.88, spatialError: 0.16, kViols: 0 },
  { k: 20, temporal: "day",    suppression: 0.29, densitySim: 0.82, spatialError: 0.18, kViols: 0 },
  { k: 20, temporal: "period", suppression: 0.51, densitySim: 0.73, spatialError: 0.23, kViols: 0 },
  { k: 20, temporal: "hour",   suppression: 0.94, densitySim: 0.31, spatialError: 0.38, kViols: 0 },
];

const K_VALUES      = [5, 10, 15, 20];
const TEMPORALS     = ["none", "day", "period", "hour"];
const TEMPORAL_LABELS = { none: "Spatial only", day: "Day", period: "Period", hour: "Hour" };

const TILE_W    = 64;
const TILE_H    = 32;
const MAX_BAR_H = 130;

// Interpolates green→amber→red; inverted for densitySim (higher = better)
const metricToColor = (value, metricKey) => {
  const t = metricKey === "densitySim" ? (1 - value) : value;
  // Green  (22,163,74)  →  Red (220,38,36) via amber (202,138,4)
  let r, g, b;
  if (t < 0.5) {
    const s = t * 2;
    r = Math.round(22  + s * (202 - 22));
    g = Math.round(163 + s * (138 - 163));
    b = Math.round(74  + s * (4   - 74));
  } else {
    const s = (t - 0.5) * 2;
    r = Math.round(202 + s * (220 - 202));
    g = Math.round(138 + s * (38  - 138));
    b = Math.round(4   + s * (36  - 4));
  }
  const dark  = `rgb(${Math.round(r*0.68)},${Math.round(g*0.68)},${Math.round(b*0.68)})`;
  const base  = `rgb(${r},${g},${b})`;
  const light = `rgb(${Math.min(255,Math.round(r*1.18))},${Math.min(255,Math.round(g*1.18))},${Math.min(255,Math.round(b*1.18))})`;
  return { dark, base, light };
};

const isoBar = (col, row, h) => {
  const bx = (col - row) * TILE_W / 2;
  const by = (col + row) * TILE_H / 2;

  const tL  = [bx - TILE_W / 2, by - h];
  const tT  = [bx,               by - h - TILE_H / 2];
  const tR  = [bx + TILE_W / 2, by - h];
  const tB  = [bx,               by - h + TILE_H / 2];
  const bL  = [bx - TILE_W / 2, by];
  const bBL = [bx,               by + TILE_H / 2];
  const bR  = [bx + TILE_W / 2, by];

  const pts = (arr) => arr.map((p) => p.join(",")).join(" ");
  return {
    topPts:   pts([tL, tT, tR, tB]),
    leftPts:  pts([tL, tB, bBL, bL]),
    rightPts: pts([tB, tR, bR, bBL]),
    cx: bx,
    cy: by - h - TILE_H / 2,
  };
};

const METRIC_OPTIONS = [
  { value: "suppression",  label: "Suppression rate (Z axis)" },
  { value: "densitySim",   label: "Density similarity (Z axis)" },
  { value: "spatialError", label: "Spatial error (Z axis)" },
];

const PrivacyLandscape = ({ activeK, activeTemporal, onConfigSelect }) => {
  const [hoveredKey, setHoveredKey] = useState(null);
  const [metricKey,  setMetricKey]  = useState("suppression");
  const [tooltip,    setTooltip]    = useState(null);

  const originX = 220;
  const originY = 80;
  const svgW    = 680;
  const svgH    = 460;

  const bars = LANDSCAPE_DATA.map((d) => {
    const col      = TEMPORALS.indexOf(d.temporal);
    const row      = K_VALUES.indexOf(d.k);
    const raw      = d[metricKey];
    const h        = raw * MAX_BAR_H;
    const geo      = isoBar(col, row, h);
    const color    = metricToColor(raw, metricKey);
    const key      = `${d.k}-${d.temporal}`;
    const isActive  = d.k === activeK && d.temporal === activeTemporal;
    const isHovered = hoveredKey === key;
    return { ...d, col, row, h, geo, color, key, isActive, isHovered, raw };
  });

  const sorted = [...bars].sort((a, b) => (a.col + a.row) - (b.col + b.row));
  const hoveredData = tooltip ? LANDSCAPE_DATA.find((d) => `${d.k}-${d.temporal}` === hoveredKey) : null;

  return (
    <div className="viz3d-wrapper">

      {/* Metric selector */}
      <div className="viz3d-controls">
        <Text type="secondary" style={{ fontSize: 13 }}>Z axis:</Text>
        <Select
          size="small"
          value={metricKey}
          onChange={setMetricKey}
          options={METRIC_OPTIONS}
          style={{ width: 230 }}
        />
        <Tag color="blue">Click a bar to apply that configuration</Tag>
      </div>

      <div style={{ position: "relative" }}>
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="viz3d-svg"
          style={{ display: "block", margin: "0 auto", maxWidth: "100%" }}
        >
          <defs>
            <filter id="bar-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Ground shadow */}
          <ellipse
            cx={originX + TILE_W * 1.5}
            cy={originY + TILE_H * 3 + 10}
            rx={TILE_W * 2.6}
            ry={TILE_H * 1.4}
            fill="currentColor"
            opacity={0.04}
          />

          {/* Bars — back-to-front */}
          {sorted.map(({ col, row, geo, color, key, isActive, isHovered }) => {
            const dx = originX;
            const dy = originY + (K_VALUES.length - 1 + TEMPORALS.length - 1) * TILE_H / 2;

            const polyPts = (pts) =>
              pts.split(" ").map((pair) => {
                const [x, y] = pair.split(",").map(Number);
                return `${x + dx},${y + dy}`;
              }).join(" ");

            // Stroke adapts: active = blue, hovered = medium, idle = subtle
            const strokeW = isActive ? 2 : isHovered ? 1.5 : 0.6;
            const strokeC = isActive
              ? "#1677ff"
              : isHovered
              ? "rgba(128,128,128,0.6)"
              : "rgba(128,128,128,0.25)";

            // Top face: active uses a semi-transparent blue that works in light + dark
            const topFill = isActive
              ? "rgba(22,119,255,0.22)"
              : isHovered
              ? color.light
              : color.light;

            return (
              <g
                key={key}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  const d = LANDSCAPE_DATA.find((d) => `${d.k}-${d.temporal}` === key);
                  onConfigSelect({ k: d.k, temporalGranularity: d.temporal });
                }}
                onMouseEnter={(e) => { setHoveredKey(key); setTooltip({ x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => { setHoveredKey(null); setTooltip(null); }}
              >
                {/* Left face (darkest) */}
                <polygon
                  points={polyPts(geo.leftPts)}
                  fill={color.dark}
                  stroke={strokeC}
                  strokeWidth={strokeW}
                />
                {/* Right face (mid) */}
                <polygon
                  points={polyPts(geo.rightPts)}
                  fill={color.base}
                  stroke={strokeC}
                  strokeWidth={strokeW}
                />
                {/* Top face */}
                <polygon
                  points={polyPts(geo.topPts)}
                  fill={topFill}
                  stroke={strokeC}
                  strokeWidth={strokeW}
                  style={isActive ? { filter: "url(#bar-glow)" } : {}}
                />
                {/* Active ring outline */}
                {isActive && (
                  <polygon
                    points={polyPts(geo.topPts)}
                    fill="none"
                    stroke="#1677ff"
                    strokeWidth={2.5}
                  />
                )}
              </g>
            );
          })}

          {/* Row labels (k values) */}
          {K_VALUES.map((k, rowIdx) => {
            const dx = originX;
            const dy = originY + (K_VALUES.length - 1 + TEMPORALS.length - 1) * TILE_H / 2;
            const bx = (0 - rowIdx) * TILE_W / 2 + dx;
            const by = (0 + rowIdx) * TILE_H / 2 + dy;
            return (
              <text
                key={k}
                x={bx - TILE_W / 2 - 10}
                y={by + TILE_H / 2}
                textAnchor="end"
                fontSize={12}
                fill="currentColor"
                opacity={0.65}
              >
                k={k}
              </text>
            );
          })}

          {/* Column labels (temporal) */}
          {TEMPORALS.map((t, colIdx) => {
            const dx = originX;
            const dy = originY + (K_VALUES.length - 1 + TEMPORALS.length - 1) * TILE_H / 2;
            const bx = (colIdx - (K_VALUES.length - 1)) * TILE_W / 2 + dx;
            const by = (colIdx + (K_VALUES.length - 1)) * TILE_H / 2 + dy;
            return (
              <text
                key={t}
                x={bx}
                y={by + TILE_H + 16}
                textAnchor="middle"
                fontSize={11}
                fill="currentColor"
                opacity={0.65}
              >
                {TEMPORAL_LABELS[t]}
              </text>
            );
          })}

          {/* Colour legend */}
          <defs>
            <linearGradient id="legend-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="rgb(22,163,74)" />
              <stop offset="50%"  stopColor="rgb(202,138,4)" />
              <stop offset="100%" stopColor="rgb(220,38,36)" />
            </linearGradient>
          </defs>
          <rect x={svgW - 130} y={svgH - 40} width={110} height={10} rx={3} fill="url(#legend-grad)" opacity={0.9} />
          <text x={svgW - 133} y={svgH - 46} fontSize={10} fill="currentColor" opacity={0.55} textAnchor="start">
            {metricKey === "densitySim" ? "high" : "low"}
          </text>
          <text x={svgW - 16}  y={svgH - 46} fontSize={10} fill="currentColor" opacity={0.55} textAnchor="end">
            {metricKey === "densitySim" ? "low" : "high"}
          </text>
          <text x={svgW - 75}  y={svgH - 16} fontSize={10} fill="currentColor" opacity={0.45} textAnchor="middle">
            {metricKey === "suppression" ? "suppression rate" : metricKey === "densitySim" ? "density similarity" : "spatial error"}
          </text>
        </svg>

        {/* Tooltip */}
        {hoveredData && tooltip && (
          <div
            className="viz3d-tooltip"
            style={{ left: tooltip.x + 14, top: tooltip.y - 12 }}
          >
            <div className="viz3d-tooltip-title">
              k={hoveredData.k} · {TEMPORAL_LABELS[hoveredData.temporal]}
            </div>
            <div className="viz3d-tooltip-row">
              <span>Suppression</span>
              <strong>{(hoveredData.suppression * 100).toFixed(0)}%</strong>
            </div>
            <div className="viz3d-tooltip-row">
              <span>Density (cosine)</span>
              <strong>{(hoveredData.densitySim * 100).toFixed(0)}%</strong>
            </div>
            <div className="viz3d-tooltip-row">
              <span>Spatial error</span>
              <strong>{hoveredData.spatialError.toFixed(2)} km</strong>
            </div>
            <div className="viz3d-tooltip-row">
              <span>k violations</span>
              <strong>{hoveredData.kViols}</strong>
            </div>
            <div className="viz3d-tooltip-cta">Click to apply →</div>
          </div>
        )}
      </div>

      {/* Active config badge */}
      <div className="viz3d-active-badge">
        <Text type="secondary" style={{ fontSize: 12 }}>Currently applied:</Text>
        <Tag color="blue">k={activeK}</Tag>
        <Tag color="purple">{TEMPORAL_LABELS[activeTemporal] ?? activeTemporal}</Tag>
      </div>
    </div>
  );
};

export default PrivacyLandscape;
