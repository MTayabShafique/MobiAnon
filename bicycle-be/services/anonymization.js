const DEFAULT_GRID_SIZE = 0.01;
const EARTH_RADIUS_KM = 6371;

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// L2: UTC-consistent temporal bucketing with optional IANA timezone support.
// Previously date.getHours() used the server's local timezone, producing wrong
// period/hour buckets for non-NYC datasets stored in UTC.
const getTemporalBucket = (startedAt, temporalGranularity = 'none', timezone = 'UTC') => {
  if (temporalGranularity === 'none') return 'all';

  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return 'unknown';

  let yyyyMmDd;
  let hour;

  if (timezone === 'UTC') {
    yyyyMmDd = date.toISOString().slice(0, 10);
    hour = date.getUTCHours();
  } else {
    try {
      yyyyMmDd = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);

      // hour12: false gives "00"–"23"; "24" can appear for midnight in some locales
      const rawHour = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false,
      }).format(date);
      hour = parseInt(rawHour, 10) % 24;
    } catch {
      // Invalid timezone string — fall back to UTC
      yyyyMmDd = date.toISOString().slice(0, 10);
      hour = date.getUTCHours();
    }
  }

  if (temporalGranularity === 'day') return yyyyMmDd;
  if (temporalGranularity === 'hour') return `${yyyyMmDd}T${String(hour).padStart(2, '0')}`;
  if (temporalGranularity === 'period') {
    if (hour < 6) return `${yyyyMmDd}:night`;
    if (hour < 12) return `${yyyyMmDd}:morning`;
    if (hour < 18) return `${yyyyMmDd}:afternoon`;
    return `${yyyyMmDd}:evening`;
  }

  return 'all';
};

const haversineKm = (a, b) => {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const centroidOf = (trips) => {
  const totals = trips.reduce(
    (acc, trip) => ({ lat: acc.lat + trip.start_lat, lng: acc.lng + trip.start_lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: totals.lat / trips.length, lng: totals.lng / trips.length };
};

const mergeGroups = (target, source) => {
  const trips = [...target.trips, ...source.trips];
  return {
    temporalBucket: target.temporalBucket,
    cells: new Set([...target.cells, ...source.cells]),
    trips,
    centroid: centroidOf(trips),
  };
};

const getGridCellKey = (lat, lng, gridSize) => {
  const gridLat = Math.floor(lat / gridSize);
  const gridLng = Math.floor(lng / gridSize);
  return `${gridLat},${gridLng}`;
};

const buildDensityMap = (items, gridSize, getPoint, getWeight = () => 1) => {
  const density = new Map();
  items.forEach((item) => {
    const point = getPoint(item);
    const key = getGridCellKey(point.lat, point.lng, gridSize);
    density.set(key, (density.get(key) || 0) + getWeight(item));
  });
  return density;
};

const cosineSimilarity = (a, b) => {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  keys.forEach((key) => {
    const va = a.get(key) || 0;
    const vb = b.get(key) || 0;
    dot += va * vb;
    normA += va ** 2;
    normB += vb ** 2;
  });
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

// L3: Jensen-Shannon Divergence (JSD) between two density distributions.
// Unlike cosine similarity, JSD treats the inputs as probability distributions
// and is bounded in [0, 1] (log₂ base). A score of 0 means identical distributions;
// 1 means completely disjoint. We expose it as 1−JSD so higher = more similar,
// consistent with densityCosineSimilarity convention.
const jensenShannonDivergence = (a, b) => {
  const totalA = Array.from(a.values()).reduce((s, v) => s + v, 0);
  const totalB = Array.from(b.values()).reduce((s, v) => s + v, 0);
  if (totalA === 0 || totalB === 0) return 1;

  const keys = new Set([...a.keys(), ...b.keys()]);
  let jsd = 0;
  keys.forEach((key) => {
    const p = (a.get(key) || 0) / totalA;
    const q = (b.get(key) || 0) / totalB;
    const m = (p + q) / 2;
    if (p > 0) jsd += p * Math.log2(p / m);
    if (q > 0) jsd += q * Math.log2(q / m);
  });

  return Math.min(1, Math.max(0, jsd / 2));
};

const topKeys = (density, limit) =>
  Array.from(density.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);

const topOverlap = (a, b, limit) => {
  const topA = topKeys(a, limit);
  const topB = new Set(topKeys(b, limit));
  if (topA.length === 0) return 0;
  return topA.filter((key) => topB.has(key)).length / topA.length;
};

// L1: 2-phase batch merging.
//
// Phase 1 pairs sparse groups with each other before they consume large groups.
// This avoids the greedy-chain problem where a small group attaches to a large
// group early, leaving another small group stranded with nothing nearby.
//
// Phase 2 is the original greedy fallback for any remaining under-k groups.
const anonymizeBucket = (bucketTrips, k, gridSize, temporalBucket) => {
  const gridMap = new Map();
  bucketTrips.forEach((trip) => {
    const cellKey = getGridCellKey(trip.start_lat, trip.start_lng, gridSize);
    if (!gridMap.has(cellKey)) gridMap.set(cellKey, []);
    gridMap.get(cellKey).push(trip);
  });

  let groups = Array.from(gridMap.entries()).map(([cellKey, cellTrips]) => ({
    temporalBucket,
    cells: new Set([cellKey]),
    trips: cellTrips,
    centroid: centroidOf(cellTrips),
  }));

  // Phase 1: greedily pair the two closest sparse groups until no pairable pair exists.
  let changed = true;
  while (changed) {
    changed = false;
    const sparseIdxs = groups
      .map((g, i) => (g.trips.length < k ? i : -1))
      .filter((i) => i !== -1);

    if (sparseIdxs.length < 2) break;

    let bestI = -1;
    let bestJ = -1;
    let bestDist = Infinity;

    for (let a = 0; a < sparseIdxs.length; a++) {
      for (let b = a + 1; b < sparseIdxs.length; b++) {
        const i = sparseIdxs[a];
        const j = sparseIdxs[b];
        const dist = haversineKm(groups[i].centroid, groups[j].centroid);
        if (dist < bestDist) {
          bestDist = dist;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestI === -1) break;

    const merged = mergeGroups(groups[bestI], groups[bestJ]);
    groups = groups.filter((_, idx) => idx !== bestI && idx !== bestJ);
    groups.push(merged);
    changed = true;
  }

  // Phase 2: merge any surviving under-k group with its nearest neighbor (any size).
  while (groups.length > 1) {
    const smallestIndex = groups.reduce(
      (best, g, i) => (g.trips.length < groups[best].trips.length ? i : best),
      0
    );
    if (groups[smallestIndex].trips.length >= k) break;

    let nearestIndex = null;
    let nearestDistance = Infinity;
    groups.forEach((candidate, index) => {
      if (index === smallestIndex) return;
      const distance = haversineKm(groups[smallestIndex].centroid, candidate.centroid);
      if (distance < nearestDistance) {
        nearestIndex = index;
        nearestDistance = distance;
      }
    });

    const merged = mergeGroups(groups[smallestIndex], groups[nearestIndex]);
    groups = groups.filter((_, index) => index !== smallestIndex && index !== nearestIndex);
    groups.push(merged);
  }

  return groups;
};

// L2: timezone is threaded through so normalizeTrips passes it to getTemporalBucket.
const normalizeTrips = (trips, temporalGranularity, timezone = 'UTC') =>
  trips
    .map((trip) => ({
      ride_id: trip.ride_id,
      start_lat: toNumber(trip.start_lat),
      start_lng: toNumber(trip.start_lng),
      started_at: trip.started_at,
      temporalBucket: getTemporalBucket(trip.started_at, temporalGranularity, timezone),
    }))
    .filter((trip) => trip.start_lat !== null && trip.start_lng !== null);

const bucketTripsByTime = (validTrips) => {
  const buckets = new Map();
  validTrips.forEach((trip) => {
    if (!buckets.has(trip.temporalBucket)) buckets.set(trip.temporalBucket, []);
    buckets.get(trip.temporalBucket).push(trip);
  });
  return buckets;
};

const buildGridGroups = (bucketTrips, gridSize, temporalBucket) => {
  const gridMap = new Map();
  bucketTrips.forEach((trip) => {
    const cellKey = getGridCellKey(trip.start_lat, trip.start_lng, gridSize);
    if (!gridMap.has(cellKey)) gridMap.set(cellKey, []);
    gridMap.get(cellKey).push(trip);
  });
  return Array.from(gridMap.entries()).map(([cellKey, cellTrips]) => ({
    temporalBucket,
    cells: new Set([cellKey]),
    trips: cellTrips,
    centroid: centroidOf(cellTrips),
  }));
};

// L4: Fixed-grid baseline groups.
// Unlike suppression-baseline (which uses the actual trip centroid), this uses
// the geometric center of each grid cell as the released coordinate. This isolates
// the contribution of centroid placement from the contribution of the merging step.
const buildFixedGridGroups = (bucketTrips, gridSize, temporalBucket) => {
  const gridMap = new Map();
  bucketTrips.forEach((trip) => {
    const gridLat = Math.floor(trip.start_lat / gridSize);
    const gridLng = Math.floor(trip.start_lng / gridSize);
    const cellKey = `${gridLat},${gridLng}`;
    if (!gridMap.has(cellKey)) {
      gridMap.set(cellKey, {
        trips: [],
        centroid: {
          lat: (gridLat + 0.5) * gridSize,
          lng: (gridLng + 0.5) * gridSize,
        },
      });
    }
    gridMap.get(cellKey).trips.push(trip);
  });
  return Array.from(gridMap.entries()).map(([cellKey, cell]) => ({
    temporalBucket,
    cells: new Set([cellKey]),
    trips: cell.trips,
    centroid: cell.centroid,
  }));
};

const buildAnonymizationResponse = ({
  trips,
  validTrips,
  anonymizedGroups,
  suppressedTrips,
  k,
  gridSize,
  temporalGranularity,
  method,
}) => {
  if (anonymizedGroups.length === 0) {
    return {
      status: 'error',
      message: `No anonymized groups could satisfy k=${k} with temporal granularity "${temporalGranularity}"`,
      data: [],
      metrics: {
        method,
        k,
        gridSize,
        temporalGranularity,
        totalInput: trips.length,
        validInput: validTrips.length,
        releasedRecords: 0,
        suppressedRecords: suppressedTrips.length,
        suppressionRate: validTrips.length ? suppressedTrips.length / validTrips.length : 0,
        outputGroups: 0,
        kViolations: 0,
      },
    };
  }

  const anonymizedTrips = anonymizedGroups.map((group) => {
    const distances = group.trips.map((trip) =>
      haversineKm(
        { lat: trip.start_lat, lng: trip.start_lng },
        { lat: group.centroid.lat, lng: group.centroid.lng }
      )
    );
    const spatialErrorMeanKm =
      distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const spatialErrorMaxKm = Math.max(...distances);
    return {
      centroidLat: group.centroid.lat,
      centroidLng: group.centroid.lng,
      count: group.trips.length,
      temporalBucket: group.temporalBucket,
      cellsMerged: group.cells.size,
      spatialErrorMeanKm,
      spatialErrorMaxKm,
    };
  });

  const groupSizes = anonymizedTrips.map((g) => g.count);
  const releasedRecords = groupSizes.reduce((sum, c) => sum + c, 0);
  const totalSpatialError = anonymizedTrips.reduce(
    (sum, g) => sum + g.spatialErrorMeanKm * g.count,
    0
  );
  const rawDensity = buildDensityMap(
    validTrips,
    gridSize,
    (trip) => ({ lat: trip.start_lat, lng: trip.start_lng })
  );
  const anonymizedDensity = buildDensityMap(
    anonymizedTrips,
    gridSize,
    (g) => ({ lat: g.centroidLat, lng: g.centroidLng }),
    (g) => g.count
  );
  const mergedCellTotal = anonymizedTrips.reduce((sum, g) => sum + g.cellsMerged, 0);
  const jsd = jensenShannonDivergence(rawDensity, anonymizedDensity);

  return {
    status: 'success',
    message: 'Anonymized trip data retrieved successfully',
    data: anonymizedTrips,
    metrics: {
      method,
      k,
      gridSize,
      temporalGranularity,
      totalInput: trips.length,
      validInput: validTrips.length,
      releasedRecords,
      suppressedRecords: suppressedTrips.length,
      suppressionRate: suppressedTrips.length / validTrips.length,
      outputGroups: anonymizedTrips.length,
      minGroupSize: Math.min(...groupSizes),
      maxGroupSize: Math.max(...groupSizes),
      avgGroupSize: releasedRecords / anonymizedTrips.length,
      kViolations: anonymizedTrips.filter((g) => g.count < k).length,
      avgSpatialErrorKm: totalSpatialError / releasedRecords,
      maxSpatialErrorKm: Math.max(...anonymizedTrips.map((g) => g.spatialErrorMaxKm)),
      pointReductionRatio: 1 - anonymizedTrips.length / validTrips.length,
      rawDensityCells: rawDensity.size,
      anonymizedDensityCells: anonymizedDensity.size,
      densityCosineSimilarity: cosineSimilarity(rawDensity, anonymizedDensity),
      // L3: JSD-based similarity (1 − JSD so higher = more similar, consistent with cosine)
      densityJsdSimilarity: Number((1 - jsd).toFixed(4)),
      top5HotspotOverlap: topOverlap(rawDensity, anonymizedDensity, 5),
      top10HotspotOverlap: topOverlap(rawDensity, anonymizedDensity, 10),
      avgCellsMerged: mergedCellTotal / anonymizedTrips.length,
    },
  };
};

const validateInput = (trips, k, temporalGranularity, timezone) => {
  if (trips.length < k) {
    return {
      status: 'error',
      message: `Not enough trips (${trips.length}) for k=${k}`,
    };
  }

  const validTrips = normalizeTrips(trips, temporalGranularity, timezone);

  if (validTrips.length < k) {
    return {
      status: 'error',
      message: `Not enough valid trips (${validTrips.length}) for k=${k}`,
    };
  }

  return { status: 'success', validTrips };
};

export const applyKAnonymity = async (trips, k, options = {}) => {
  const gridSize = toNumber(options.gridSize) || DEFAULT_GRID_SIZE;
  const temporalGranularity = options.temporalGranularity || 'none';
  const timezone = options.timezone || 'UTC';
  const validation = validateInput(trips, k, temporalGranularity, timezone);
  if (validation.status === 'error') return validation;

  const { validTrips } = validation;
  const buckets = bucketTripsByTime(validTrips);

  const suppressedTrips = [];
  const anonymizedGroups = [];

  buckets.forEach((bucketTrips, temporalBucket) => {
    if (bucketTrips.length < k) {
      suppressedTrips.push(...bucketTrips);
      return;
    }

    anonymizeBucket(bucketTrips, k, gridSize, temporalBucket).forEach((group) => {
      if (group.trips.length < k) {
        suppressedTrips.push(...group.trips);
      } else {
        anonymizedGroups.push(group);
      }
    });
  });

  return buildAnonymizationResponse({
    trips,
    validTrips,
    anonymizedGroups,
    suppressedTrips,
    k,
    gridSize,
    temporalGranularity,
    method: 'merge-nearest',
  });
};

export const applySuppressionBaseline = async (trips, k, options = {}) => {
  const gridSize = toNumber(options.gridSize) || DEFAULT_GRID_SIZE;
  const temporalGranularity = options.temporalGranularity || 'none';
  const timezone = options.timezone || 'UTC';
  const validation = validateInput(trips, k, temporalGranularity, timezone);
  if (validation.status === 'error') return validation;

  const { validTrips } = validation;
  const buckets = bucketTripsByTime(validTrips);
  const suppressedTrips = [];
  const anonymizedGroups = [];

  buckets.forEach((bucketTrips, temporalBucket) => {
    if (bucketTrips.length < k) {
      suppressedTrips.push(...bucketTrips);
      return;
    }

    buildGridGroups(bucketTrips, gridSize, temporalBucket).forEach((group) => {
      if (group.trips.length < k) {
        suppressedTrips.push(...group.trips);
      } else {
        anonymizedGroups.push(group);
      }
    });
  });

  return buildAnonymizationResponse({
    trips,
    validTrips,
    anonymizedGroups,
    suppressedTrips,
    k,
    gridSize,
    temporalGranularity,
    method: 'suppression-baseline',
  });
};

// L4: Fixed-grid generalization baseline.
// Releases only grid cells that already satisfy k, with coordinates quantized to
// the cell center instead of the trip centroid. No merging step.
// This isolates what the merge-nearest algorithm contributes beyond simply choosing
// which cells to release.
export const applyFixedGridBaseline = async (trips, k, options = {}) => {
  const gridSize = toNumber(options.gridSize) || DEFAULT_GRID_SIZE;
  const temporalGranularity = options.temporalGranularity || 'none';
  const timezone = options.timezone || 'UTC';
  const validation = validateInput(trips, k, temporalGranularity, timezone);
  if (validation.status === 'error') return validation;

  const { validTrips } = validation;
  const buckets = bucketTripsByTime(validTrips);
  const suppressedTrips = [];
  const anonymizedGroups = [];

  buckets.forEach((bucketTrips, temporalBucket) => {
    if (bucketTrips.length < k) {
      suppressedTrips.push(...bucketTrips);
      return;
    }

    buildFixedGridGroups(bucketTrips, gridSize, temporalBucket).forEach((group) => {
      if (group.trips.length < k) {
        suppressedTrips.push(...group.trips);
      } else {
        anonymizedGroups.push(group);
      }
    });
  });

  return buildAnonymizationResponse({
    trips,
    validTrips,
    anonymizedGroups,
    suppressedTrips,
    k,
    gridSize,
    temporalGranularity,
    method: 'fixed-grid-baseline',
  });
};
