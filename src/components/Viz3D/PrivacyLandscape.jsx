/**
 * PrivacyLandscape — SVG isometric 3D bar chart for the privacy-utility tradeoff.
 *
 * Three landscape modes:
 *   k-Anonymity  — Columns = temporal granularity, Rows = k value
 *   ℓ-Diversity  — Columns = sensitive attribute,  Rows = ℓ value
 *   ε-DP         — Columns = ε budget,              Rows = k value
 *
 * Clicking a bar calls onConfigSelect with the relevant config params.
 */

import React, { useState } from "react";
import { Select, Segmented, Space, Tag, Typography } from "antd";
import { SafetyOutlined, NodeIndexOutlined, ClusterOutlined } from "@ant-design/icons";

const { Text } = Typography;

// ─── k-Anonymity data ─────────────────────────────────────────────────────────
const K_ANON_DATA = [
  { k: 5,  temporal: "none",   suppression: 0.04, densitySim: 0.94, spatialError: 0.08, kViols: 0 },
  { k: 5,  temporal: "day",    suppression: 0.11, densitySim: 0.91, spatialError: 0.09, kViols: 0 },
  { k: 5,  temporal: "period", suppression: 0.19, densitySim: 0.87, spatialError: 0.11, kViols: 0 },
  { k: 5,  temporal: "hour",   suppression: 0.47, densitySim: 0.72, spatialError: 0.15, kViols: 0 },
  { k: 10, temporal: "none",   suppression: 0.07, densitySim: 0.92, spatialError: 0.10, kViols: 0 },
  { k: 10, temporal: "day",    suppression: 0.18, densitySim: 0.88, spatialError: 0.12, kViols: 0 },
  { k: 10, temporal: "period", suppression: 0.31, densitySim: 0.83, spatialError: 0.14, kViols: 0 },
  { k: 10, temporal: "hour",   suppression: 0.65, densitySim: 0.63, spatialError: 0.21, kViols: 0 },
  { k: 15, temporal: "none",   suppression: 0.10, densitySim: 0.90, spatialError: 0.13, kViols: 0 },
  { k: 15, temporal: "day",    suppression: 0.24, densitySim: 0.85, spatialError: 0.15, kViols: 0 },
  { k: 15, temporal: "period", suppression: 0.42, densitySim: 0.78, spatialError: 0.19, kViols: 0 },
  { k: 15, temporal: "hour",   suppression: 0.81, densitySim: 0.48, spatialError: 0.28, kViols: 0 },
  { k: 20, temporal: "none",   suppression: 0.13, densitySim: 0.88, spatialError: 0.16, kViols: 0 },
  { k: 20, temporal: "day",    suppression: 0.29, densitySim: 0.82, spatialError: 0.18, kViols: 0 },
  { k: 20, temporal: "period", suppression: 0.51, densitySim: 0.73, spatialError: 0.23, kViols: 0 },
  { k: 20, temporal: "hour",   suppression: 0.94, densitySim: 0.31, spatialError: 0.38, kViols: 0 },
];

// ─── ℓ-Diversity data ─────────────────────────────────────────────────────────
// Rows = ℓ values (1 = k-only baseline), Columns = sensitive attribute
// Representative values for k=5, temporal=none, gridSize=0.01
const L_DIV_DATA = [
  // ℓ=1 (k-only — same regardless of attr)
  { l: 1, sensitiveAttr: "none",             suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 1, sensitiveAttr: "member_casual",    suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 1, sensitiveAttr: "rideable_type",    suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 1, sensitiveAttr: "destination_area", suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  // ℓ=2
  { l: 2, sensitiveAttr: "none",             suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 2, sensitiveAttr: "member_casual",    suppression: 0.08, densitySim: 0.92, spatialError: 0.10, lViols: 0 },
  { l: 2, sensitiveAttr: "rideable_type",    suppression: 0.06, densitySim: 0.93, spatialError: 0.09, lViols: 0 },
  { l: 2, sensitiveAttr: "destination_area", suppression: 0.12, densitySim: 0.89, spatialError: 0.13, lViols: 0 },
  // ℓ=3
  { l: 3, sensitiveAttr: "none",             suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 3, sensitiveAttr: "member_casual",    suppression: 0.15, densitySim: 0.88, spatialError: 0.13, lViols: 0 },
  { l: 3, sensitiveAttr: "rideable_type",    suppression: 0.11, densitySim: 0.90, spatialError: 0.12, lViols: 0 },
  { l: 3, sensitiveAttr: "destination_area", suppression: 0.25, densitySim: 0.83, spatialError: 0.20, lViols: 0 },
  // ℓ=4
  { l: 4, sensitiveAttr: "none",             suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 4, sensitiveAttr: "member_casual",    suppression: 0.23, densitySim: 0.84, spatialError: 0.17, lViols: 0 },
  { l: 4, sensitiveAttr: "rideable_type",    suppression: 0.18, densitySim: 0.86, spatialError: 0.15, lViols: 0 },
  { l: 4, sensitiveAttr: "destination_area", suppression: 0.38, densitySim: 0.76, spatialError: 0.28, lViols: 0 },
];

// ─── ε-DP data ────────────────────────────────────────────────────────────────
// Rows = k values, Columns = ε budget (∞ = no noise → left side = weakest)
// Suppression stays at k-anonymity level; displacement increases as ε decreases.
const DP_DATA = [
  { k: 5,  epsilon: 10,  displacement: 0.012, densitySim: 0.93, spatialError: 0.09, suppression: 0.04 },
  { k: 5,  epsilon: 5,   displacement: 0.022, densitySim: 0.91, spatialError: 0.10, suppression: 0.04 },
  { k: 5,  epsilon: 2,   displacement: 0.056, densitySim: 0.87, spatialError: 0.13, suppression: 0.04 },
  { k: 5,  epsilon: 1,   displacement: 0.111, densitySim: 0.82, spatialError: 0.17, suppression: 0.04 },
  { k: 5,  epsilon: 0.5, displacement: 0.222, densitySim: 0.74, spatialError: 0.27, suppression: 0.04 },
  { k: 10, epsilon: 10,  displacement: 0.012, densitySim: 0.91, spatialError: 0.11, suppression: 0.07 },
  { k: 10, epsilon: 5,   displacement: 0.022, densitySim: 0.89, spatialError: 0.13, suppression: 0.07 },
  { k: 10, epsilon: 2,   displacement: 0.056, densitySim: 0.85, spatialError: 0.16, suppression: 0.07 },
  { k: 10, epsilon: 1,   displacement: 0.111, densitySim: 0.79, spatialError: 0.21, suppression: 0.07 },
  { k: 10, epsilon: 0.5, displacement: 0.222, densitySim: 0.70, spatialError: 0.31, suppression: 0.07 },
  { k: 15, epsilon: 10,  displacement: 0.012, densitySim: 0.89, spatialError: 0.14, suppression: 0.10 },
  { k: 15, epsilon: 5,   displacement: 0.022, densitySim: 0.87, spatialError: 0.16, suppression: 0.10 },
  { k: 15, epsilon: 2,   displacement: 0.056, densitySim: 0.82, spatialError: 0.19, suppression: 0.10 },
  { k: 15, epsilon: 1,   displacement: 0.111, densitySim: 0.76, spatialError: 0.25, suppression: 0.10 },
  { k: 15, epsilon: 0.5, displacement: 0.222, densitySim: 0.67, spatialError: 0.36, suppression: 0.10 },
  { k: 20, epsilon: 10,  displacement: 0.012, densitySim: 0.87, spatialError: 0.17, suppression: 0.13 },
  { k: 20, epsilon: 5,   displacement: 0.022, densitySim: 0.85, spatialError: 0.19, suppression: 0.13 },
  { k: 20, epsilon: 2,   displacement: 0.056, densitySim: 0.80, spatialError: 0.23, suppression: 0.13 },
  { k: 20, epsilon: 1,   displacement: 0.111, densitySim: 0.73, spatialError: 0.29, suppression: 0.13 },
  { k: 20, epsilon: 0.5, displacement: 0.222, densitySim: 0.63, spatialError: 0.40, suppression: 0.13 },
];

// ─── Axis definitions per mode ────────────────────────────────────────────────

const K_VALUES   = [5, 10, 15, 20];
const TEMPORALS  = ["none", "day", "period", "hour"];
const L_VALUES   = [1, 2, 3, 4];
const SENS_ATTRS = ["none", "member_casual", "rideable_type", "destination_area"];
const EPSILONS   = [10, 5, 2, 1, 0.5];   // left→right = weak→strong

const TEMPORAL_LABELS   = { none: "Spatial only", day: "Day", period: "Period", hour: "Hour" };
const SENS_ATTR_LABELS  = { none: "k-only", member_casual: "Rider type", rideable_type: "Bike type", destination_area: "Dest. area" };

// ─── Chart constants ──────────────────────────────────────────────────────────

const TILE_W    = 60;
const TILE_H    = 30;
const MAX_BAR_H = 130;

// ─── Metric options per mode ──────────────────────────────────────────────────

const METRIC_OPTIONS = {
  "k-anonymity": [
    { value: "suppression",  label: "Suppression rate" },
    { value: "densitySim",   label: "Density similarity" },
    { value: "spatialError", label: "Spatial error (km)" },
  ],
  "l-diversity": [
    { value: "suppression",  label: "Suppression rate" },
    { value: "densitySim",   label: "Density similarity" },
    { value: "spatialError", label: "Spatial error (km)" },
  ],
  "epsilon-dp": [
    { value: "displacement", label: "Centroid displacement (km)" },
    { value: "densitySim",   label: "Density similarity" },
    { value: "spatialError", label: "Total spatial error (km)" },
  ],
};

// ─── Color helpers ────────────────────────────────────────────────────────────

const metricToColor = (value, metricKey) => {
  const t = metricKey === "densitySim" ? (1 - value) : value;
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

// ─── Isometric bar geometry ───────────────────────────────────────────────────

const isoBar = (col, row, h) => {
  const bx = (col - row) * TILE_W / 2;
  const by = (col + row) * TILE_H / 2;
  const pts = (arr) => arr.map((p) => p.join(",")).join(" ");
  return {
    topPts:   pts([[bx - TILE_W/2, by - h], [bx, by - h - TILE_H/2], [bx + TILE_W/2, by - h], [bx, by - h + TILE_H/2]]),
    leftPts:  pts([[bx - TILE_W/2, by - h], [bx, by - h + TILE_H/2], [bx, by + TILE_H/2], [bx - TILE_W/2, by]]),
    rightPts: pts([[bx, by - h + TILE_H/2], [bx + TILE_W/2, by - h], [bx + TILE_W/2, by], [bx, by + TILE_H/2]]),
    cx: bx, cy: by - h - TILE_H/2,
  };
};

// ─── Mode configuration ───────────────────────────────────────────────────────

const getModeConfig = (mode) => {
  switch (mode) {
    case "l-diversity":
      return {
        data:       L_DIV_DATA,
        rowValues:  L_VALUES,
        colValues:  SENS_ATTRS,
        rowLabelFn: (l)    => l === 1 ? "ℓ=1 (k-only)" : `ℓ=${l}`,
        colLabelFn: (attr) => SENS_ATTR_LABELS[attr] ?? attr,
        keyFn:      (d)    => `${d.l}-${d.sensitiveAttr}`,
        matchFn:    (d, rowVal, colVal) => d.l === rowVal && d.sensitiveAttr === colVal,
        isActiveFn: (d, activeK, activeTemporal, activeL, activeSensAttr) =>
          d.l === activeL && d.sensitiveAttr === activeSensAttr,
        clickPayloadFn: (d) => ({ l: d.l, sensitiveAttr: d.sensitiveAttr }),
        defaultMetric: "suppression",
      };
    case "epsilon-dp":
      return {
        data:       DP_DATA,
        rowValues:  K_VALUES,
        colValues:  EPSILONS,
        rowLabelFn: (k)   => `k=${k}`,
        colLabelFn: (eps) => `ε=${eps}`,
        keyFn:      (d)   => `${d.k}-${d.epsilon}`,
        matchFn:    (d, rowVal, colVal) => d.k === rowVal && d.epsilon === colVal,
        isActiveFn: (d, activeK, _t, _l, _s, activeEpsilon) =>
          d.k === activeK && d.epsilon === activeEpsilon,
        clickPayloadFn: (d) => ({ k: d.k, epsilon: d.epsilon }),
        defaultMetric: "displacement",
      };
    default: // k-anonymity
      return {
        data:       K_ANON_DATA,
        rowValues:  K_VALUES,
        colValues:  TEMPORALS,
        rowLabelFn: (k)   => `k=${k}`,
        colLabelFn: (t)   => TEMPORAL_LABELS[t] ?? t,
        keyFn:      (d)   => `${d.k}-${d.temporal}`,
        matchFn:    (d, rowVal, colVal) => d.k === rowVal && d.temporal === colVal,
        isActiveFn: (d, activeK, activeTemporal) =>
          d.k === activeK && d.temporal === activeTemporal,
        clickPayloadFn: (d) => ({ k: d.k, temporalGranularity: d.temporal }),
        defaultMetric: "suppression",
      };
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

const PrivacyLandscape = ({
  activeK, activeTemporal, activeL, activeSensAttr, activeEpsilon,
  onConfigSelect,
}) => {
  const [mode,       setMode]       = useState("k-anonymity");
  const [hoveredKey, setHoveredKey] = useState(null);
  const [metricKey,  setMetricKey]  = useState("suppression");
  const [tooltip,    setTooltip]    = useState(null);

  const cfg = getModeConfig(mode);

  // Reset metric key when mode changes if current key doesn't exist in new mode
  const handleModeChange = (newMode) => {
    const newCfg = getModeConfig(newMode);
    const validKeys = METRIC_OPTIONS[newMode].map((o) => o.value);
    if (!validKeys.includes(metricKey)) setMetricKey(newCfg.defaultMetric);
    setMode(newMode);
  };

  const originX = 220;
  const originY = 80;
  const svgW    = 720;
  const svgH    = 460;

  const { data, rowValues, colValues, rowLabelFn, colLabelFn, keyFn, isActiveFn, clickPayloadFn } = cfg;

  const bars = data.map((d) => {
    const col = colValues.indexOf(colValues.find((cv) =>
      mode === "l-diversity"  ? d.sensitiveAttr === cv :
      mode === "epsilon-dp"   ? d.epsilon       === cv :
                                d.temporal       === cv
    ));
    const row = rowValues.indexOf(
      mode === "l-diversity" ? d.l : d.k
    );
    if (col < 0 || row < 0) return null;

    const raw     = d[metricKey] ?? 0;
    const h       = Math.max(2, raw * MAX_BAR_H);
    const geo     = isoBar(col, row, h);
    const color   = metricToColor(raw, metricKey);
    const key     = keyFn(d);
    const isActive  = isActiveFn(d, activeK, activeTemporal, activeL ?? 1, activeSensAttr ?? "none", activeEpsilon ?? null);
    const isHovered = hoveredKey === key;
    return { ...d, col, row, h, geo, color, key, isActive, isHovered, raw };
  }).filter(Boolean);

  const sorted = [...bars].sort((a, b) => (a.col + a.row) - (b.col + b.row));
  const hoveredData = tooltip ? data.find((d) => keyFn(d) === hoveredKey) : null;

  const dx = originX;
  const dy = originY + (rowValues.length - 1 + colValues.length - 1) * TILE_H / 2;

  const polyPts = (pts) =>
    pts.split(" ").map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return `${x + dx},${y + dy}`;
    }).join(" ");

  return (
    <div className="viz3d-wrapper">

      {/* ── Mode selector ── */}
      <div className="viz3d-mode-selector">
        <Segmented
          value={mode}
          onChange={handleModeChange}
          options={[
            { value: "k-anonymity", label: <Space size={4}><ClusterOutlined />k-Anonymity</Space> },
            { value: "l-diversity", label: <Space size={4}><SafetyOutlined />ℓ-Diversity</Space> },
            { value: "epsilon-dp",  label: <Space size={4}><NodeIndexOutlined />ε-DP</Space> },
          ]}
        />
      </div>

      {/* ── Metric + hint ── */}
      <div className="viz3d-controls">
        <Text type="secondary" style={{ fontSize: 13 }}>Z axis:</Text>
        <Select
          size="small"
          value={metricKey}
          onChange={setMetricKey}
          options={METRIC_OPTIONS[mode]}
          style={{ width: 240 }}
        />
        <Tag color={mode === "k-anonymity" ? "blue" : mode === "l-diversity" ? "purple" : "volcano"}>
          Click a bar to apply that configuration
        </Tag>
      </div>

      {/* ── Mode description ── */}
      {mode === "l-diversity" && (
        <Text type="secondary" className="viz3d-mode-hint">
          Rows = ℓ value (1 = k-only baseline) · Columns = sensitive attribute · k=5 fixed · hover for details
        </Text>
      )}
      {mode === "epsilon-dp" && (
        <Text type="secondary" className="viz3d-mode-hint">
          Rows = k value · Columns = ε budget (left = weak privacy, right = strong) · hover for details
        </Text>
      )}

      <div style={{ position: "relative" }}>
        <svg
          width={svgW} height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="viz3d-svg"
          style={{ display: "block", margin: "0 auto", maxWidth: "100%" }}
        >
          <defs>
            <filter id="bar-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          <ellipse
            cx={originX + TILE_W * 1.5} cy={originY + TILE_H * 3 + 10}
            rx={TILE_W * 2.8} ry={TILE_H * 1.5}
            fill="currentColor" opacity={0.04}
          />

          {/* Bars — back-to-front */}
          {sorted.map(({ geo, color, key, isActive, isHovered, ...d }) => {
            const strokeW = isActive ? 2 : isHovered ? 1.5 : 0.6;
            const strokeC = isActive ? "#1677ff" : isHovered ? "rgba(128,128,128,0.6)" : "rgba(128,128,128,0.25)";
            const topFill = isActive ? "rgba(22,119,255,0.22)" : color.light;

            return (
              <g key={key} style={{ cursor: "pointer" }}
                onClick={() => { const entry = data.find((e) => keyFn(e) === key); if (entry) onConfigSelect(clickPayloadFn(entry)); }}
                onMouseEnter={(e) => { setHoveredKey(key); setTooltip({ x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => { setHoveredKey(null); setTooltip(null); }}
              >
                <polygon points={polyPts(geo.leftPts)}  fill={color.dark}  stroke={strokeC} strokeWidth={strokeW} />
                <polygon points={polyPts(geo.rightPts)} fill={color.base}  stroke={strokeC} strokeWidth={strokeW} />
                <polygon points={polyPts(geo.topPts)}   fill={topFill}     stroke={strokeC} strokeWidth={strokeW}
                  style={isActive ? { filter: "url(#bar-glow)" } : {}} />
                {isActive && (
                  <polygon points={polyPts(geo.topPts)} fill="none" stroke="#1677ff" strokeWidth={2.5} />
                )}
              </g>
            );
          })}

          {/* Row labels */}
          {rowValues.map((rv, rowIdx) => {
            const bx = (0 - rowIdx) * TILE_W / 2 + dx;
            const by = (0 + rowIdx) * TILE_H / 2 + dy;
            return (
              <text key={rowIdx} x={bx - TILE_W/2 - 10} y={by + TILE_H/2}
                textAnchor="end" fontSize={11} fill="currentColor" opacity={0.65}>
                {rowLabelFn(rv)}
              </text>
            );
          })}

          {/* Column labels */}
          {colValues.map((cv, colIdx) => {
            const bx = (colIdx - (rowValues.length - 1)) * TILE_W / 2 + dx;
            const by = (colIdx + (rowValues.length - 1)) * TILE_H / 2 + dy;
            return (
              <text key={colIdx} x={bx} y={by + TILE_H + 16}
                textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.65}>
                {colLabelFn(cv)}
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
          <rect x={svgW - 130} y={svgH - 40} width={110} height={10} rx={3} fill="url(#legend-grad)" opacity={0.9}/>
          <text x={svgW - 133} y={svgH - 46} fontSize={10} fill="currentColor" opacity={0.55} textAnchor="start">
            {metricKey === "densitySim" ? "high" : "low"}
          </text>
          <text x={svgW - 16} y={svgH - 46} fontSize={10} fill="currentColor" opacity={0.55} textAnchor="end">
            {metricKey === "densitySim" ? "low" : "high"}
          </text>
          <text x={svgW - 75} y={svgH - 16} fontSize={10} fill="currentColor" opacity={0.45} textAnchor="middle">
            {metricKey === "suppression" ? "suppression rate" :
             metricKey === "densitySim"  ? "density similarity" :
             metricKey === "displacement"? "displacement (km)" : "spatial error"}
          </text>
        </svg>

        {/* Tooltip */}
        {hoveredData && tooltip && (
          <div className="viz3d-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 12 }}>
            <div className="viz3d-tooltip-title">
              {mode === "k-anonymity" && `k=${hoveredData.k} · ${TEMPORAL_LABELS[hoveredData.temporal]}`}
              {mode === "l-diversity" && `ℓ=${hoveredData.l} · ${SENS_ATTR_LABELS[hoveredData.sensitiveAttr] ?? hoveredData.sensitiveAttr}`}
              {mode === "epsilon-dp"  && `k=${hoveredData.k} · ε=${hoveredData.epsilon}`}
            </div>
            {mode !== "epsilon-dp" && (
              <div className="viz3d-tooltip-row">
                <span>Suppression</span>
                <strong>{(hoveredData.suppression * 100).toFixed(0)}%</strong>
              </div>
            )}
            {mode === "epsilon-dp" && (
              <>
                <div className="viz3d-tooltip-row">
                  <span>Displacement</span>
                  <strong>{hoveredData.displacement?.toFixed(3)} km</strong>
                </div>
                <div className="viz3d-tooltip-row">
                  <span>k-Suppression</span>
                  <strong>{(hoveredData.suppression * 100).toFixed(0)}%</strong>
                </div>
              </>
            )}
            <div className="viz3d-tooltip-row">
              <span>Density (cosine)</span>
              <strong>{(hoveredData.densitySim * 100).toFixed(0)}%</strong>
            </div>
            <div className="viz3d-tooltip-row">
              <span>Spatial error</span>
              <strong>{hoveredData.spatialError?.toFixed(2)} km</strong>
            </div>
            {mode === "l-diversity" && hoveredData.lViols === 0 && (
              <div className="viz3d-tooltip-row">
                <span>ℓ-Violations</span>
                <strong>0 ✓</strong>
              </div>
            )}
            <div className="viz3d-tooltip-cta">Click to apply →</div>
          </div>
        )}
      </div>

      {/* Active config badge */}
      <div className="viz3d-active-badge">
        <Text type="secondary" style={{ fontSize: 12 }}>Currently applied:</Text>
        {mode === "k-anonymity" && (
          <>
            <Tag color="blue">k={activeK}</Tag>
            <Tag color="purple">{TEMPORAL_LABELS[activeTemporal] ?? activeTemporal}</Tag>
          </>
        )}
        {mode === "l-diversity" && (
          <>
            <Tag color="purple">ℓ={activeL ?? 1}</Tag>
            <Tag color="geekblue">{SENS_ATTR_LABELS[activeSensAttr] ?? activeSensAttr ?? "none"}</Tag>
          </>
        )}
        {mode === "epsilon-dp" && (
          <>
            <Tag color="blue">k={activeK}</Tag>
            <Tag color="volcano">{activeEpsilon != null ? `ε=${activeEpsilon}` : "DP off"}</Tag>
          </>
        )}
      </div>
    </div>
  );
};

export default PrivacyLandscape;
