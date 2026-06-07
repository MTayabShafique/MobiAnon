/** Interactive SVG privacy-utility landscape with animated bars, tooltips, and pin-to-compare. */

import React, { useState, useRef, useEffect } from "react";
import { Select, Segmented, Space, Tag, Typography } from "antd";
import {
  SafetyOutlined, NodeIndexOutlined, ClusterOutlined,
  PushpinFilled,
} from "@ant-design/icons";

const { Text } = Typography;


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

const L_DIV_DATA = [
  { l: 1, sensitiveAttr: "none",             suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 1, sensitiveAttr: "member_casual",    suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 1, sensitiveAttr: "rideable_type",    suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 1, sensitiveAttr: "destination_area", suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 2, sensitiveAttr: "none",             suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 2, sensitiveAttr: "member_casual",    suppression: 0.08, densitySim: 0.92, spatialError: 0.10, lViols: 0 },
  { l: 2, sensitiveAttr: "rideable_type",    suppression: 0.06, densitySim: 0.93, spatialError: 0.09, lViols: 0 },
  { l: 2, sensitiveAttr: "destination_area", suppression: 0.12, densitySim: 0.89, spatialError: 0.13, lViols: 0 },
  { l: 3, sensitiveAttr: "none",             suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 3, sensitiveAttr: "member_casual",    suppression: 0.15, densitySim: 0.88, spatialError: 0.13, lViols: 0 },
  { l: 3, sensitiveAttr: "rideable_type",    suppression: 0.11, densitySim: 0.90, spatialError: 0.12, lViols: 0 },
  { l: 3, sensitiveAttr: "destination_area", suppression: 0.25, densitySim: 0.83, spatialError: 0.20, lViols: 0 },
  { l: 4, sensitiveAttr: "none",             suppression: 0.04, densitySim: 0.94, spatialError: 0.08, lViols: 0 },
  { l: 4, sensitiveAttr: "member_casual",    suppression: 0.23, densitySim: 0.84, spatialError: 0.17, lViols: 0 },
  { l: 4, sensitiveAttr: "rideable_type",    suppression: 0.18, densitySim: 0.86, spatialError: 0.15, lViols: 0 },
  { l: 4, sensitiveAttr: "destination_area", suppression: 0.38, densitySim: 0.76, spatialError: 0.28, lViols: 0 },
];

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

const K_VALUES   = [5, 10, 15, 20];
const TEMPORALS  = ["none", "day", "period", "hour"];
const L_VALUES   = [1, 2, 3, 4];
const SENS_ATTRS = ["none", "member_casual", "rideable_type", "destination_area"];
const EPSILONS   = [10, 5, 2, 1, 0.5];

const TEMPORAL_LABELS = { none: "Spatial only", day: "Day", period: "Period", hour: "Hour" };
const TEMPORAL_DESCS  = {
  none:   "no temporal partitioning",
  day:    "day-level temporal partitioning",
  period: "time-period partitioning (AM / PM / evening)",
  hour:   "hour-level temporal partitioning",
};
const SENS_ATTR_LABELS = {
  none:             "k-only",
  member_casual:    "Rider type",
  rideable_type:    "Bike type",
  destination_area: "Dest. area",
};

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


const TILE_W      = 60;
const TILE_H      = 30;
const MAX_BAR_H   = 130;
const SVG_W       = 720;
const SVG_H       = 500;
const ORIGIN_X    = 220;
const ORIGIN_Y    = 105;
const DANGER_SUPP = 0.40;   // bars exceeding this suppression rate enter the "danger zone"


/** Composite Privacy-Utility score 0–100 (higher = more useful anonymisation). */
const computeScore = (d) =>
  Math.round((d.densitySim * 0.6 + (1 - d.suppression) * 0.4) * 100);

/** Map a normalised metric value → three-tone isometric colour. */
const metricToColor = (value, metricKey) => {
  const t = metricKey === "densitySim" ? 1 - value : value;
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
  const dark  = `rgb(${Math.round(r * 0.68)},${Math.round(g * 0.68)},${Math.round(b * 0.68)})`;
  const base  = `rgb(${r},${g},${b})`;
  const light = `rgb(${Math.min(255, Math.round(r * 1.18))},${Math.min(255, Math.round(g * 1.18))},${Math.min(255, Math.round(b * 1.18))})`;
  return { dark, base, light };
};

/** Return the SVG polygons and label anchor for one isometric bar. */
const isoBar = (col, row, h) => {
  const bx  = (col - row) * TILE_W / 2;
  const by  = (col + row) * TILE_H / 2;
  const pts = (arr) => arr.map((p) => p.join(",")).join(" ");
  return {
    topPts:   pts([[bx - TILE_W/2, by - h], [bx, by - h - TILE_H/2], [bx + TILE_W/2, by - h], [bx, by - h + TILE_H/2]]),
    leftPts:  pts([[bx - TILE_W/2, by - h], [bx, by - h + TILE_H/2], [bx, by + TILE_H/2], [bx - TILE_W/2, by]]),
    rightPts: pts([[bx, by - h + TILE_H/2], [bx + TILE_W/2, by - h], [bx + TILE_W/2, by], [bx, by + TILE_H/2]]),
    cx: bx,
    cy: by - h - TILE_H / 2,   // top of the top-face diamond (label anchor)
  };
};


const getModeConfig = (mode) => {
  switch (mode) {
    case "l-diversity":
      return {
        data:           L_DIV_DATA,
        rowValues:      L_VALUES,
        colValues:      SENS_ATTRS,
        rowLabelFn:     (l)    => l === 1 ? "ℓ=1 (k-only)" : `ℓ=${l}`,
        colLabelFn:     (attr) => SENS_ATTR_LABELS[attr] ?? attr,
        keyFn:          (d)    => `${d.l}-${d.sensitiveAttr}`,
        isActiveFn:     (d, aK, aT, aL, aS) => d.l === aL && d.sensitiveAttr === aS,
        clickPayloadFn: (d)    => ({ l: d.l, sensitiveAttr: d.sensitiveAttr }),
        defaultMetric:  "suppression",
        rowAxisLabel:   "ℓ value  →",
        colAxisLabel:   "← Sensitive attribute",
      };
    case "epsilon-dp":
      return {
        data:           DP_DATA,
        rowValues:      K_VALUES,
        colValues:      EPSILONS,
        rowLabelFn:     (k)   => `k=${k}`,
        colLabelFn:     (eps) => `ε=${eps}`,
        keyFn:          (d)   => `${d.k}-${d.epsilon}`,
        isActiveFn:     (d, aK, _t, _l, _s, aEps) => d.k === aK && d.epsilon === aEps,
        clickPayloadFn: (d)   => ({ k: d.k, epsilon: d.epsilon }),
        defaultMetric:  "displacement",
        rowAxisLabel:   "k value  →",
        colAxisLabel:   "← ε budget",
      };
    default: // k-anonymity
      return {
        data:           K_ANON_DATA,
        rowValues:      K_VALUES,
        colValues:      TEMPORALS,
        rowLabelFn:     (k)   => `k=${k}`,
        colLabelFn:     (t)   => TEMPORAL_LABELS[t] ?? t,
        keyFn:          (d)   => `${d.k}-${d.temporal}`,
        isActiveFn:     (d, aK, aT) => d.k === aK && d.temporal === aT,
        clickPayloadFn: (d)   => ({ k: d.k, temporalGranularity: d.temporal }),
        defaultMetric:  "suppression",
        rowAxisLabel:   "k value  →",
        colAxisLabel:   "← Temporal granularity",
      };
  }
};


const scoreTag = (score) =>
  score >= 80 ? { text: "Strong balance",     color: "#16a34a" } :
  score >= 65 ? { text: "Reasonable balance", color: "#ca8a04" } :
  score >= 50 ? { text: "Utility tension",    color: "#ea580c" } :
                { text: "Poor utility",        color: "#dc2626" };

const getInterpretation = (d, mode) => {
  if (!d) return null;
  const suppPct = (d.suppression * 100).toFixed(0);
  const densPct = (d.densitySim  * 100).toFixed(0);
  const score   = computeScore(d);
  const tag     = scoreTag(score);

  const suppLvl = d.suppression < 0.15 ? "low"
                : d.suppression < 0.35 ? "moderate"
                : d.suppression < 0.60 ? "high" : "very high";
  const densLvl = d.densitySim > 0.90 ? "excellent"
                : d.densitySim > 0.80 ? "good"
                : d.densitySim > 0.65 ? "fair" : "poor";

  if (mode === "k-anonymity") {
    const tempDesc = TEMPORAL_DESCS[d.temporal] ?? d.temporal;
    return {
      headline: `k=${d.k} · ${TEMPORAL_LABELS[d.temporal]}`,
      tag,
      body: `Enforcing groups of ≥${d.k} trips with ${tempDesc} suppresses ${suppPct}% of records `
          + `(${suppLvl} privacy cost). The preserved data retains ${densPct}% of the original `
          + `density structure (${densLvl} utility). Privacy-Utility score: ${score}/100.`,
      advice: d.suppression > 0.60
        ? "⚠ Very high suppression — spatial mobility patterns may be severely distorted. Consider reducing k or temporal granularity."
        : d.suppression < 0.12
        ? "✓ Minimal data loss with meaningful privacy. A strong candidate for data release."
        : "A balanced configuration — verify density maps for visual distortion before publishing.",
    };
  }

  if (mode === "l-diversity") {
    const attrLabel = SENS_ATTR_LABELS[d.sensitiveAttr] ?? d.sensitiveAttr;
    const baseline  = d.l === 1;
    return {
      headline: `ℓ=${d.l} · ${attrLabel}`,
      tag,
      body: baseline
        ? `Baseline (k-only, ℓ=1): no sensitive-attribute protection enforced. `
        + `Suppression: ${suppPct}%, density similarity: ${densPct}%.`
        : `ℓ-Diversity requires ≥${d.l} distinct values of "${attrLabel}" per equivalence class, `
        + `guarding against attribute inference attacks. Suppression rises to ${suppPct}% (${suppLvl}) `
        + `vs the k-only baseline. Density similarity: ${densPct}% (${densLvl}). Score: ${score}/100.`,
      advice: baseline
        ? "Baseline only — no attribute-level re-identification protection beyond k-Anonymity."
        : d.suppression > 0.30
        ? "⚠ ℓ-Diversity adds significant suppression overhead. Evaluate if the sensitive attribute justifies this cost."
        : `✓ ℓ=${d.l} over "${attrLabel}" provides attribute inference protection at manageable utility cost.`,
    };
  }

  if (mode === "epsilon-dp") {
    const privStr = d.epsilon <= 1 ? "strong" : d.epsilon <= 5 ? "moderate" : "weak";
    const dispKm  = d.displacement?.toFixed(3) ?? "—";
    return {
      headline: `k=${d.k} · ε=${d.epsilon}`,
      tag,
      body: `k-Anonymity (${suppPct}% suppression) is applied first, then Laplace noise with ε=${d.epsilon} `
          + `(${privStr} differential privacy) shifts trip start coordinates by ≈${dispKm} km on average. `
          + `Smaller ε = stronger guarantee but greater spatial distortion. `
          + `Density similarity: ${densPct}% (${densLvl}). Score: ${score}/100.`,
      advice: d.epsilon <= 0.5
        ? "⚠ Very strong DP noise — centroid displacement may render precise location inference unreliable."
        : d.epsilon >= 10
        ? "Minimal DP noise. Spatial accuracy is preserved but the formal privacy guarantee is weak."
        : `✓ ε=${d.epsilon} offers ${privStr} differential privacy while keeping displacement at ${dispKm} km.`,
    };
  }

  return null;
};


const PrivacyLandscape = ({
  activeK, activeTemporal, activeL, activeSensAttr, activeEpsilon,
  onConfigSelect,
}) => {
  const [mode,       setMode]       = useState("k-anonymity");
  const [hoveredKey, setHoveredKey] = useState(null);
  const [pinnedKey,  setPinnedKey]  = useState(null);
  const [metricKey,  setMetricKey]  = useState("suppression");
  const [tooltip,    setTooltip]    = useState(null);

  const hideTimerRef = useRef(null);
  const scheduleHide = () => {
    hideTimerRef.current = setTimeout(() => {
      setHoveredKey(null);
      setTooltip(null);
    }, 220);
  };
  const cancelHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };

  const animRef    = useRef({ heights: {}, frameId: null });
  const [animHeights, setAnimHeights] = useState({});

  const cfg = getModeConfig(mode);
  const { data, rowValues, colValues, rowLabelFn, colLabelFn, keyFn,
          isActiveFn, clickPayloadFn, rowAxisLabel, colAxisLabel } = cfg;

  useEffect(() => {
    // Target height for each bar under the selected metric.
    const targets = {};
    data.forEach((d) => {
      targets[keyFn(d)] = Math.max(2, (d[metricKey] ?? 0) * MAX_BAR_H);
    });

    // New mode: start new bars at zero so they grow in.
    const curKeys = Object.keys(animRef.current.heights);
    const newKeys = Object.keys(targets);
    if (!newKeys.every((k) => curKeys.includes(k))) {
      newKeys.forEach((k) => { animRef.current.heights[k] = 0; });
    }

    if (animRef.current.frameId) cancelAnimationFrame(animRef.current.frameId);

    const tick = () => {
      let running = false;
      newKeys.forEach((key) => {
        const cur  = animRef.current.heights[key] ?? 0;
        const tgt  = targets[key] ?? 0;
        const diff = tgt - cur;
        if (Math.abs(diff) > 0.4) {
          animRef.current.heights[key] = cur + diff * 0.2;
          running = true;
        } else {
          animRef.current.heights[key] = tgt;
        }
      });
      setAnimHeights({ ...animRef.current.heights });
      if (running) animRef.current.frameId = requestAnimationFrame(tick);
    };

    animRef.current.frameId = requestAnimationFrame(tick);
    return () => { if (animRef.current.frameId) cancelAnimationFrame(animRef.current.frameId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKey, mode]);

  const handleModeChange = (newMode) => {
    const newCfg    = getModeConfig(newMode);
    const validKeys = METRIC_OPTIONS[newMode].map((o) => o.value);
    if (!validKeys.includes(metricKey)) setMetricKey(newCfg.defaultMetric);
    setPinnedKey(null);
    setMode(newMode);
  };

  const dx = ORIGIN_X;
  const dy = ORIGIN_Y + (rowValues.length - 1 + colValues.length - 1) * TILE_H / 2;

  const polyPts = (pts) =>
    pts.split(" ").map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return `${x + dx},${y + dy}`;
    }).join(" ");

  const bars = data.map((d) => {
    const col = colValues.indexOf(colValues.find((cv) =>
      mode === "l-diversity" ? d.sensitiveAttr === cv :
      mode === "epsilon-dp"  ? d.epsilon       === cv : d.temporal === cv
    ));
    const row = rowValues.indexOf(mode === "l-diversity" ? d.l : d.k);
    if (col < 0 || row < 0) return null;

    const key      = keyFn(d);
    const rawValue = d[metricKey] ?? 0;
    const h        = animHeights[key] ?? Math.max(2, rawValue * MAX_BAR_H);
    const geo      = isoBar(col, row, h);
    const color    = metricToColor(rawValue, metricKey);
    const isActive  = isActiveFn(d, activeK, activeTemporal, activeL ?? 1, activeSensAttr ?? "none", activeEpsilon ?? null);
    const isHovered = hoveredKey === key;
    const isPinned  = pinnedKey  === key;
    const score     = computeScore(d);
    return { ...d, col, row, h, geo, color, key, isActive, isHovered, isPinned, rawValue, score };
  }).filter(Boolean);

  const sorted = [...bars].sort((a, b) => (a.col + a.row) - (b.col + b.row));

  const bestBar  = bars.length ? bars.reduce((a, b) => b.score > a.score ? b : a) : null;
  const worstBar = bars.length ? bars.reduce((a, b) => b.score < a.score ? b : a) : null;

  const hoveredData = hoveredKey ? data.find((d) => keyFn(d) === hoveredKey) : null;
  const pinnedData  = pinnedKey  ? data.find((d) => keyFn(d) === pinnedKey)  : null;

  const activeData =
    mode === "k-anonymity" ? data.find((d) => d.k === activeK && d.temporal === activeTemporal) :
    mode === "l-diversity" ? data.find((d) => d.l === (activeL ?? 1) && d.sensitiveAttr === (activeSensAttr ?? "none")) :
    data.find((d) => d.k === activeK && d.epsilon === activeEpsilon);

  // Interpretation panel shows hovered bar, falls back to active config
  const interpData = hoveredData ?? activeData;
  const interp     = getInterpretation(interpData, mode);

  const handleBarClick = (entry, e) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl / ⌘ click → pin for side-by-side comparison
      setPinnedKey((prev) => (prev === keyFn(entry) ? null : keyFn(entry)));
    } else {
      // Delegate everything (config update + scroll) to the parent's onConfigSelect
      onConfigSelect(clickPayloadFn(entry));
    }
  };

  const fmtLabel = (raw) =>
    metricKey === "suppression" || metricKey === "densitySim"
      ? `${(raw * 100).toFixed(0)}%`
      : raw.toFixed(2);

  // Row axis runs top-right → bottom-left (increasing row = going left-down)
  const rowAxisX = dx - (rowValues.length - 1) * TILE_W / 2 - TILE_W / 2 - 42;
  const rowAxisY = dy + (rowValues.length / 2) * TILE_H;
  // Column axis runs along the bottom of the grid
  const colAxisX = dx + ((colValues.length - 1) / 2 - (rowValues.length - 1) / 2) * TILE_W / 2;
  const colAxisY = dy + ((colValues.length - 1) + (rowValues.length - 1)) * TILE_H / 2 + TILE_H + 34;

  return (
    <div className="viz3d-wrapper">

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
          Click bar = apply config · Ctrl+click = 📌 pin a bar to compare vs current
        </Tag>
      </div>

      {/* Mode hint */}
      {mode === "l-diversity" && (
        <Text type="secondary" className="viz3d-mode-hint">
          Rows = ℓ value (1 = k-only baseline) · Columns = sensitive attribute · k=5 fixed
        </Text>
      )}
      {mode === "epsilon-dp" && (
        <Text type="secondary" className="viz3d-mode-hint">
          Rows = k value · Columns = ε budget (left = weak privacy, right = strong)
        </Text>
      )}

      <div style={{ position: "relative" }}>
        <svg
          width={SVG_W} height={SVG_H}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="viz3d-svg"
          style={{ display: "block", margin: "0 auto", maxWidth: "100%" }}
        >
          <defs>
            <filter id="bar-glow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="marker-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <linearGradient id="legend-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="rgb(22,163,74)"  />
              <stop offset="50%"  stopColor="rgb(202,138,4)"  />
              <stop offset="100%" stopColor="rgb(220,38,36)"  />
            </linearGradient>
          </defs>

          {colValues.map((_, cIdx) =>
            rowValues.map((_, rIdx) => {
              const geo = isoBar(cIdx, rIdx, 0);
              return (
                <polygon
                  key={`floor-${cIdx}-${rIdx}`}
                  points={polyPts(geo.topPts)}
                  fill="currentColor" fillOpacity={0.03}
                  stroke="currentColor" strokeOpacity={0.14} strokeWidth={0.8}
                />
              );
            })
          )}

          {sorted.map(({ geo, color, key, isActive, isHovered, isPinned, rawValue, h, suppression }) => {
            const inDanger = suppression > DANGER_SUPP;
            const strokeW  = isActive || isPinned ? 2.2 : isHovered ? 1.5 : 0.6;
            const strokeC  = isPinned  ? "#7c3aed"
                           : isActive  ? "#1677ff"
                           : isHovered ? "rgba(128,128,128,0.65)"
                           : inDanger  ? "rgba(220,38,38,0.40)"
                           : "rgba(128,128,128,0.25)";
            const topFill  = isActive  ? "rgba(22,119,255,0.20)"
                           : isPinned  ? "rgba(124,58,237,0.20)"
                           : color.light;

            return (
              <g
                key={key}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  const entry = data.find((en) => keyFn(en) === key);
                  if (entry) handleBarClick(entry, e);
                }}
                onMouseEnter={(e) => { cancelHide(); setHoveredKey(key); setTooltip({ x: e.clientX, y: e.clientY }); }}
                onMouseMove={(e)  => { cancelHide(); setTooltip({ x: e.clientX, y: e.clientY }); }}
                onMouseLeave={scheduleHide}
              >
                <polygon points={polyPts(geo.leftPts)}  fill={color.dark}  stroke={strokeC} strokeWidth={strokeW} />
                <polygon points={polyPts(geo.rightPts)} fill={color.base}  stroke={strokeC} strokeWidth={strokeW} />
                <polygon
                  points={polyPts(geo.topPts)}
                  fill={topFill}
                  stroke={strokeC} strokeWidth={strokeW}
                  style={(isActive || isPinned) ? { filter: "url(#bar-glow)" } : undefined}
                />
                {(isActive || isPinned) && (
                  <polygon
                    points={polyPts(geo.topPts)}
                    fill="none"
                    stroke={isPinned ? "#7c3aed" : "#1677ff"}
                    strokeWidth={2.5}
                  />
                )}

                {/* Value label on top face — halo stroke punches through bar colour */}
                {h > 16 && (
                  <text
                    x={geo.cx + dx} y={geo.cy + dy + 5}
                    textAnchor="middle"
                    fontSize={isHovered || isActive ? 11 : 10}
                    fontWeight={isHovered || isActive ? 700 : 600}
                    fill="currentColor"
                    style={{
                      pointerEvents: "none",
                      stroke: "var(--app-surface)",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                      paintOrder: "stroke",
                    }}
                  >
                    {fmtLabel(rawValue)}
                  </text>
                )}
              </g>
            );
          })}

          {bestBar && (() => {
            const geo = isoBar(bestBar.col, bestBar.row, bestBar.h);
            return (
              <g style={{ pointerEvents: "none" }} filter="url(#marker-glow)">
                <text x={geo.cx + dx} y={geo.cy + dy - 9} textAnchor="middle" fontSize={17} fill="#eab308">
                  ★
                </text>
              </g>
            );
          })()}

          {worstBar && worstBar.key !== bestBar?.key && (() => {
            const geo = isoBar(worstBar.col, worstBar.row, worstBar.h);
            return (
              <g style={{ pointerEvents: "none" }}>
                <text x={geo.cx + dx} y={geo.cy + dy - 7} textAnchor="middle" fontSize={13} fill="#ef4444" opacity={0.88}>
                  ⚠
                </text>
              </g>
            );
          })()}

          {pinnedKey && (() => {
            const pb = bars.find((b) => b.key === pinnedKey);
            if (!pb) return null;
            const geo = isoBar(pb.col, pb.row, pb.h);
            return (
              <g style={{ pointerEvents: "none" }}>
                <text
                  x={geo.cx + dx + TILE_W / 2 - 2}
                  y={geo.cy + dy - 2}
                  fontSize={13} fill="#7c3aed" opacity={0.9}
                >
                  📌
                </text>
              </g>
            );
          })()}

          {rowValues.map((rv, rowIdx) => {
            const bx = (0 - rowIdx) * TILE_W / 2 + dx;
            const by = (0 + rowIdx) * TILE_H / 2 + dy;
            return (
              <text key={rowIdx} x={bx - TILE_W / 2 - 10} y={by + TILE_H / 2}
                textAnchor="end" fontSize={12} fontWeight={600} fill="currentColor"
                style={{ stroke: "var(--app-surface)", strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" }}>
                {rowLabelFn(rv)}
              </text>
            );
          })}

          {colValues.map((cv, colIdx) => {
            const bx = (colIdx - (rowValues.length - 1)) * TILE_W / 2 + dx;
            const by = (colIdx + (rowValues.length - 1)) * TILE_H / 2 + dy;
            return (
              <text key={colIdx} x={bx} y={by + TILE_H + 16}
                textAnchor="middle" fontSize={11} fontWeight={600} fill="currentColor"
                style={{ stroke: "var(--app-surface)", strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" }}>
                {colLabelFn(cv)}
              </text>
            );
          })}

          {/* Row axis */}
          <text
            x={rowAxisX} y={rowAxisY}
            textAnchor="middle" fontSize={11} fontWeight={500} fill="currentColor" opacity={0.55}
            transform={`rotate(-27, ${rowAxisX}, ${rowAxisY})`}
            style={{ stroke: "var(--app-surface)", strokeWidth: 3, paintOrder: "stroke" }}
          >
            {rowAxisLabel}
          </text>
          {/* Column axis */}
          <text x={colAxisX} y={colAxisY} textAnchor="middle" fontSize={11} fontWeight={500} fill="currentColor" opacity={0.55}
            style={{ stroke: "var(--app-surface)", strokeWidth: 3, paintOrder: "stroke" }}>
            {colAxisLabel}
          </text>
          {/* Z axis */}
          <text x={16} y={26} textAnchor="start" fontSize={11} fontWeight={500} fill="currentColor" opacity={0.55}
            style={{ stroke: "var(--app-surface)", strokeWidth: 3, paintOrder: "stroke" }}>
            ↑ Z: {METRIC_OPTIONS[mode].find((o) => o.value === metricKey)?.label}
          </text>

          <rect x={SVG_W - 134} y={SVG_H - 38} width={114} height={10} rx={3}
            fill="url(#legend-grad)" opacity={0.9} />
          <text x={SVG_W - 137} y={SVG_H - 44} fontSize={10} fill="currentColor" opacity={0.52} textAnchor="start">
            {metricKey === "densitySim" ? "high" : "low"}
          </text>
          <text x={SVG_W - 16}  y={SVG_H - 44} fontSize={10} fill="currentColor" opacity={0.52} textAnchor="end">
            {metricKey === "densitySim" ? "low" : "high"}
          </text>
          <text x={SVG_W - 77}  y={SVG_H - 14} fontSize={10} fill="currentColor" opacity={0.42} textAnchor="middle">
            {metricKey === "suppression"  ? "suppression rate"
           : metricKey === "densitySim"   ? "density similarity"
           : metricKey === "displacement" ? "displacement (km)"
           : "spatial error"}
          </text>

          {/* Danger threshold tick on legend (suppression only) */}
          {metricKey === "suppression" && (
            <g>
              <line
                x1={SVG_W - 134 + 114 * DANGER_SUPP} y1={SVG_H - 44}
                x2={SVG_W - 134 + 114 * DANGER_SUPP} y2={SVG_H - 24}
                stroke="#ef4444" strokeWidth={1.5} strokeDasharray="2,2" opacity={0.75}
              />
              <text
                x={SVG_W - 134 + 114 * DANGER_SUPP} y={SVG_H - 46}
                textAnchor="middle" fontSize={9} fill="#ef4444" opacity={0.8}
              >
                {`${(DANGER_SUPP * 100).toFixed(0)}% ⚠`}
              </text>
            </g>
          )}

          {/* Legend marker guide */}
          <text x={SVG_W - 134} y={SVG_H - 60} fontSize={12} fill="#eab308">★</text>
          <text x={SVG_W - 119} y={SVG_H - 60} fontSize={9}  fill="currentColor" opacity={0.48}>Best balance</text>
          <text x={SVG_W - 67}  y={SVG_H - 60} fontSize={12} fill="#ef4444">⚠</text>
          <text x={SVG_W - 53}  y={SVG_H - 60} fontSize={9}  fill="currentColor" opacity={0.48}>Worst utility</text>
        </svg>

        {hoveredData && tooltip && (() => {
          const sc      = computeScore(hoveredData);
          const scColor = sc >= 80 ? "#16a34a" : sc >= 65 ? "#ca8a04" : sc >= 50 ? "#ea580c" : "#dc2626";
          const isThisPinned = pinnedKey === keyFn(hoveredData);
          return (
            <div
              className="viz3d-tooltip"
              style={{ left: tooltip.x + 14, top: tooltip.y - 12 }}
              onMouseEnter={cancelHide}
              onMouseLeave={scheduleHide}
            >
              <div className="viz3d-tooltip-title">
                {mode === "k-anonymity" && `k=${hoveredData.k} · ${TEMPORAL_LABELS[hoveredData.temporal]}`}
                {mode === "l-diversity" && `ℓ=${hoveredData.l} · ${SENS_ATTR_LABELS[hoveredData.sensitiveAttr] ?? hoveredData.sensitiveAttr}`}
                {mode === "epsilon-dp"  && `k=${hoveredData.k} · ε=${hoveredData.epsilon}`}
              </div>

              {/* P–U Score */}
              <div className="viz3d-tooltip-score">
                <span>P–U Score</span>
                <span style={{ fontWeight: 700, color: scColor, fontSize: 15 }}>{sc}</span>
                <span style={{ opacity: 0.55, fontSize: 11 }}>/100</span>
              </div>

              {/* Metrics */}
              {mode !== "epsilon-dp" ? (
                <div className="viz3d-tooltip-row">
                  <span>Suppression</span>
                  <strong>{(hoveredData.suppression * 100).toFixed(0)}%</strong>
                </div>
              ) : (
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

              {/* CTA row */}
              <div className="viz3d-tooltip-actions">
                <span className="viz3d-tooltip-cta" style={{ flex: 1 }}>Click = apply config ↑</span>
                <span
                  className="viz3d-tooltip-cta viz3d-tooltip-pin"
                  style={{ color: isThisPinned ? "#7c3aed" : undefined }}
                  title={isThisPinned ? "Unpin — hide side-by-side comparison" : "Pin this bar to compare its metrics vs the current applied config (table appears below)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinnedKey((prev) => (prev === keyFn(hoveredData) ? null : keyFn(hoveredData)));
                  }}
                >
                  {isThisPinned ? "📌 Unpin" : "📌 Pin & Compare"}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="viz3d-active-badge">
        <Text type="secondary" style={{ fontSize: 12 }}>Applied:</Text>
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
        {activeData && (() => {
          const sc = computeScore(activeData);
          const color = sc >= 80 ? "green" : sc >= 65 ? "orange" : sc >= 50 ? "volcano" : "red";
          return <Tag color={color}>Score {sc}/100</Tag>;
        })()}
      </div>

      {interp && (
        <div className="viz3d-interpretation">
          <div className="viz3d-interp-header">
            <span className="viz3d-interp-headline">{interp.headline}</span>
            <span className="viz3d-interp-tag" style={{ background: interp.tag.color }}>
              {interp.tag.text}
            </span>
            <span className="viz3d-interp-source">
              {hoveredData ? "● Hovering" : "○ Active config"}
            </span>
          </div>
          <p className="viz3d-interp-body">{interp.body}</p>
          <p className="viz3d-interp-advice">{interp.advice}</p>
        </div>
      )}

      {pinnedData && activeData && pinnedKey !== keyFn(activeData ?? {}) && (
        <div className="viz3d-compare">
          <div className="viz3d-compare-header">
            <PushpinFilled style={{ color: "#7c3aed", fontSize: 13 }} />
            <span>Side-by-side comparison</span>
            <button className="viz3d-compare-close" onClick={() => setPinnedKey(null)}>✕</button>
          </div>
          <table className="viz3d-compare-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>
                  {mode === "k-anonymity" && `k=${activeData.k} · ${TEMPORAL_LABELS[activeData.temporal]}`}
                  {mode === "l-diversity" && `ℓ=${activeData.l} · ${SENS_ATTR_LABELS[activeData.sensitiveAttr]}`}
                  {mode === "epsilon-dp"  && `k=${activeData.k} · ε=${activeData.epsilon}`}
                  &nbsp;<Tag color="blue" style={{ fontSize: 10, padding: "0 4px", lineHeight: "16px" }}>Active</Tag>
                </th>
                <th>
                  {mode === "k-anonymity" && `k=${pinnedData.k} · ${TEMPORAL_LABELS[pinnedData.temporal]}`}
                  {mode === "l-diversity" && `ℓ=${pinnedData.l} · ${SENS_ATTR_LABELS[pinnedData.sensitiveAttr]}`}
                  {mode === "epsilon-dp"  && `k=${pinnedData.k} · ε=${pinnedData.epsilon}`}
                  &nbsp;<Tag color="purple" style={{ fontSize: 10, padding: "0 4px", lineHeight: "16px" }}>Pinned</Tag>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Suppression</td>
                <td className={activeData.suppression < pinnedData.suppression ? "viz3d-compare-better" : activeData.suppression > pinnedData.suppression ? "viz3d-compare-worse" : ""}>
                  {(activeData.suppression * 100).toFixed(0)}%
                </td>
                <td className={pinnedData.suppression < activeData.suppression ? "viz3d-compare-better" : pinnedData.suppression > activeData.suppression ? "viz3d-compare-worse" : ""}>
                  {(pinnedData.suppression * 100).toFixed(0)}%
                </td>
              </tr>
              <tr>
                <td>Density similarity</td>
                <td className={activeData.densitySim > pinnedData.densitySim ? "viz3d-compare-better" : activeData.densitySim < pinnedData.densitySim ? "viz3d-compare-worse" : ""}>
                  {(activeData.densitySim * 100).toFixed(0)}%
                </td>
                <td className={pinnedData.densitySim > activeData.densitySim ? "viz3d-compare-better" : pinnedData.densitySim < activeData.densitySim ? "viz3d-compare-worse" : ""}>
                  {(pinnedData.densitySim * 100).toFixed(0)}%
                </td>
              </tr>
              <tr>
                <td>Spatial error</td>
                <td className={activeData.spatialError < pinnedData.spatialError ? "viz3d-compare-better" : activeData.spatialError > pinnedData.spatialError ? "viz3d-compare-worse" : ""}>
                  {activeData.spatialError?.toFixed(2)} km
                </td>
                <td className={pinnedData.spatialError < activeData.spatialError ? "viz3d-compare-better" : pinnedData.spatialError > activeData.spatialError ? "viz3d-compare-worse" : ""}>
                  {pinnedData.spatialError?.toFixed(2)} km
                </td>
              </tr>
              {mode === "epsilon-dp" && (
                <tr>
                  <td>Displacement</td>
                  <td className={activeData.displacement < pinnedData.displacement ? "viz3d-compare-better" : activeData.displacement > pinnedData.displacement ? "viz3d-compare-worse" : ""}>
                    {activeData.displacement?.toFixed(3)} km
                  </td>
                  <td className={pinnedData.displacement < activeData.displacement ? "viz3d-compare-better" : pinnedData.displacement > activeData.displacement ? "viz3d-compare-worse" : ""}>
                    {pinnedData.displacement?.toFixed(3)} km
                  </td>
                </tr>
              )}
              <tr className="viz3d-compare-score-row">
                <td>P–U Score</td>
                <td><strong>{computeScore(activeData)}/100</strong></td>
                <td><strong>{computeScore(pinnedData)}/100</strong></td>
              </tr>
            </tbody>
          </table>
          <p className="viz3d-compare-hint">
            <span className="viz3d-compare-better">Green</span> = better · <span className="viz3d-compare-worse">Red</span> = worse
          </p>
        </div>
      )}

    </div>
  );
};

export default PrivacyLandscape;
