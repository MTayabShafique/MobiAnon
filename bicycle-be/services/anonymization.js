const DEFAULT_GRID_SIZE = 0.01;
const EARTH_RADIUS_KM = 6371;
// 1 degree of latitude ≈ 111.32 km (used for human-readable noise scale reporting)
const KM_PER_DEG_LAT = 111.32;

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// ─── ε-Differential Privacy helpers ──────────────────────────────────────────

/**
 * Sample from the Laplace(0, scale) distribution using the inverse-CDF method.
 * This is the standard mechanism for (ε, 0)-differential privacy.
 */
const laplaceSample = (scale) => {
  // Avoid log(0) at the tails
  const u = Math.max(Math.min(Math.random() - 0.5, 0.4999), -0.4999);
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
};

/**
 * Apply Laplace noise to the centroids and counts of k-anonymous groups.
 *
 * Privacy accounting:
 *   - Location (lat / lng): global sensitivity = gridSize degrees.
 *     One trip can shift a centroid by at most one full grid cell.
 *     → Laplace scale = gridSize / ε
 *   - Count: global sensitivity = 1 (one trip changes count by exactly 1).
 *     → Laplace scale = 1 / ε
 *
 * This is applied as a post-processing step after k-anonymization so the
 * k-anonymity guarantee is preserved and DP adds an additional semantic layer.
 * The composition theorem means the combined mechanism satisfies (ε, 0)-DP
 * on top of the k-anonymity structural guarantee.
 */
const applyDPNoise = (groups, epsilon, gridSize) => {
  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    return { noisyGroups: groups, dpStats: null };
  }

  const locationScale = gridSize / epsilon; // degrees
  const countScale    = 1 / epsilon;        // trips

  let totalDisplacementKm = 0;

  const noisyGroups = groups.map((group) => {
    const noisyLat   = group.centroid.lat + laplaceSample(locationScale);
    const noisyLng   = group.centroid.lng + laplaceSample(locationScale);
    const noisyCount = Math.max(1, Math.round(group.trips.length + laplaceSample(countScale)));

    const displacementKm = haversineKm(
      { lat: group.centroid.lat, lng: group.centroid.lng },
      { lat: noisyLat, lng: noisyLng }
    );
    totalDisplacementKm += displacementKm;

    return {
      ...group,
      centroid:          { lat: noisyLat, lng: noisyLng },
      originalCentroid:  group.centroid,
      noisyCount,
      dpDisplacementKm:  displacementKm,
    };
  });

  return {
    noisyGroups,
    dpStats: {
      epsilon,
      locationScaleDeg: locationScale,
      locationScaleKm:  Number((locationScale * KM_PER_DEG_LAT).toFixed(4)),
      countScale:       Number(countScale.toFixed(4)),
      avgDisplacementKm: groups.length > 0
        ? Number((totalDisplacementKm / groups.length).toFixed(4))
        : 0,
    },
  };
};

// L2: UTC-consistent temporal bucketing with optional IANA timezone support.
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

      const rawHour = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false,
      }).format(date);
      hour = parseInt(rawHour, 10) % 24;
    } catch {
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

// L3: Jensen-Shannon Divergence between two density distributions.
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

// ─── ℓ-Diversity helpers ──────────────────────────────────────────────────────

/**
 * Map a trip to its sensitive value for the chosen sensitive attribute.
 *
 * Supported attributes:
 *   'member_casual'    – member | casual (2 distinct values in Citi Bike data)
 *   'rideable_type'    – classic_bike | electric_bike | docked_bike (up to 3)
 *   'destination_area' – destination grid cell key derived from end_lat/end_lng,
 *                        using the same gridSize as the spatial bucketing step.
 *                        This protects against destination-inference attacks:
 *                        each released group must cover ≥ ℓ distinct destination areas.
 */
const getSensitiveValue = (trip, sensitiveAttr, gridSize) => {
  if (!sensitiveAttr || sensitiveAttr === 'none') return null;
  switch (sensitiveAttr) {
    case 'member_casual':
      return trip.member_casual ?? null;
    case 'rideable_type':
      return trip.rideable_type ?? null;
    case 'destination_area': {
      const eLat = toNumber(trip.end_lat);
      const eLng = toNumber(trip.end_lng);
      if (eLat === null || eLng === null) return null;
      return getGridCellKey(eLat, eLng, gridSize);
    }
    default:
      return null;
  }
};

/**
 * Return the number of distinct non-null sensitive values in a group.
 * Returns Infinity when ℓ-diversity is not active so all comparisons pass.
 */
const getLDiversityCount = (group, sensitiveAttr, gridSize) => {
  if (!sensitiveAttr || sensitiveAttr === 'none') return Infinity;
  const values = new Set(
    group.trips
      .map((t) => getSensitiveValue(t, sensitiveAttr, gridSize))
      .filter((v) => v !== null && v !== undefined)
  );
  return values.size;
};

/**
 * A group is valid only when it satisfies BOTH:
 *   1. k-anonymity  — at least k trips
 *   2. ℓ-diversity  — at least ℓ distinct sensitive values (when ℓ > 1)
 */
const isGroupValid = (group, k, l, sensitiveAttr, gridSize) => {
  if (group.trips.length < k) return false;
  if (l > 1) {
    if (getLDiversityCount(group, sensitiveAttr, gridSize) < l) return false;
  }
  return true;
};

// ─── Core algorithm ───────────────────────────────────────────────────────────

/**
 * L1 + ℓ-Diversity: 2-phase batch merging extended with ℓ-diversity enforcement.
 *
 * Phase 1: greedily pair the two closest groups that are "invalid" (fail k OR ℓ).
 *   When ℓ-diversity is active, merge preference is weighted toward pairs that
 *   maximise the gain in distinct sensitive values.
 *
 * Phase 2: for any remaining invalid group, merge with the neighbor that gives
 *   the highest diversity gain; distance is the tiebreaker.
 */
const anonymizeBucket = (bucketTrips, k, l, sensitiveAttr, gridSize, temporalBucket) => {
  const lActive = l > 1 && sensitiveAttr && sensitiveAttr !== 'none';

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

  // Phase 1: greedily pair the two closest invalid groups.
  let changed = true;
  while (changed) {
    changed = false;
    const invalidIdxs = groups
      .map((g, i) => (!isGroupValid(g, k, l, sensitiveAttr, gridSize) ? i : -1))
      .filter((i) => i !== -1);

    if (invalidIdxs.length < 2) break;

    let bestI = -1;
    let bestJ = -1;
    let bestDist = Infinity;
    let bestGain = -1;

    for (let a = 0; a < invalidIdxs.length; a++) {
      for (let b = a + 1; b < invalidIdxs.length; b++) {
        const i = invalidIdxs[a];
        const j = invalidIdxs[b];
        const dist = haversineKm(groups[i].centroid, groups[j].centroid);

        if (lActive) {
          // Prefer merges that yield the highest combined distinct count.
          const combined = { trips: [...groups[i].trips, ...groups[j].trips] };
          const gain = getLDiversityCount(combined, sensitiveAttr, gridSize);
          if (
            gain > bestGain ||
            (gain === bestGain && dist < bestDist)
          ) {
            bestGain = gain;
            bestDist = dist;
            bestI = i;
            bestJ = j;
          }
        } else {
          if (dist < bestDist) {
            bestDist = dist;
            bestI = i;
            bestJ = j;
          }
        }
      }
    }

    if (bestI === -1) break;

    const merged = mergeGroups(groups[bestI], groups[bestJ]);
    groups = groups.filter((_, idx) => idx !== bestI && idx !== bestJ);
    groups.push(merged);
    changed = true;
  }

  // Phase 2: merge any remaining invalid group with its best neighbor.
  while (groups.length > 1) {
    const invalidIdx = groups.findIndex(
      (g) => !isGroupValid(g, k, l, sensitiveAttr, gridSize)
    );
    if (invalidIdx === -1) break;

    let bestNeighborIdx = null;
    let bestNeighborDist = Infinity;
    let bestNeighborGain = -1;

    groups.forEach((candidate, index) => {
      if (index === invalidIdx) return;
      const dist = haversineKm(groups[invalidIdx].centroid, candidate.centroid);

      if (lActive) {
        // Candidate's contribution to distinct sensitive values.
        const currentVals = new Set(
          groups[invalidIdx].trips
            .map((t) => getSensitiveValue(t, sensitiveAttr, gridSize))
            .filter((v) => v !== null)
        );
        const candidateVals = new Set(
          candidate.trips
            .map((t) => getSensitiveValue(t, sensitiveAttr, gridSize))
            .filter((v) => v !== null)
        );
        const mergedDistinct = new Set([...currentVals, ...candidateVals]).size;
        const gain = mergedDistinct - currentVals.size; // new distinct values added

        if (
          gain > bestNeighborGain ||
          (gain === bestNeighborGain && dist < bestNeighborDist)
        ) {
          bestNeighborGain = gain;
          bestNeighborDist = dist;
          bestNeighborIdx = index;
        }
      } else {
        if (dist < bestNeighborDist) {
          bestNeighborDist = dist;
          bestNeighborIdx = index;
        }
      }
    });

    if (bestNeighborIdx === null) break;

    const merged = mergeGroups(groups[invalidIdx], groups[bestNeighborIdx]);
    groups = groups.filter((_, index) => index !== invalidIdx && index !== bestNeighborIdx);
    groups.push(merged);
  }

  return groups;
};

// ─── Trip normalization ───────────────────────────────────────────────────────

// L2: timezone is threaded through so normalizeTrips passes it to getTemporalBucket.
// Sensitive-attribute fields (member_casual, rideable_type, end_lat, end_lng) are
// preserved so the ℓ-diversity helpers can access them during anonymization.
const normalizeTrips = (trips, temporalGranularity, timezone = 'UTC') =>
  trips
    .map((trip) => ({
      ride_id: trip.ride_id,
      start_lat: toNumber(trip.start_lat),
      start_lng: toNumber(trip.start_lng),
      end_lat: toNumber(trip.end_lat) ?? null,
      end_lng: toNumber(trip.end_lng) ?? null,
      member_casual: trip.member_casual ?? null,
      rideable_type: trip.rideable_type ?? null,
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

// ─── Response builder ─────────────────────────────────────────────────────────

const buildAnonymizationResponse = ({
  trips,
  validTrips,
  anonymizedGroups,
  suppressedTrips,
  k,
  l,
  sensitiveAttr,
  dpStats,
  gridSize,
  temporalGranularity,
  method,
}) => {
  const lActive  = l > 1 && sensitiveAttr && sensitiveAttr !== 'none';
  const dpActive = dpStats !== null && dpStats !== undefined;

  if (anonymizedGroups.length === 0) {
    return {
      status: 'error',
      message: (() => {
        const base = `No anonymized groups could satisfy k=${k}${lActive ? `, ℓ=${l}` : ''} with temporal granularity "${temporalGranularity}".`;
        if (lActive) {
          const attrHints = {
            member_casual:    'Ensure the Member Type filter is set to "All Riders" so both member and casual trips are included.',
            rideable_type:    'The dataset may not contain enough bike-type diversity in the selected area/date. Try a wider bounding box or a different date.',
            destination_area: 'Try reducing ℓ, increasing grid size, or selecting a date with more trip volume.',
          };
          const hint = attrHints[sensitiveAttr] || 'Try reducing ℓ or choosing a different sensitive attribute.';
          return `${base} ${hint}`;
        }
        return base;
      })(),
      data: [],
      metrics: {
        method,
        k,
        gridSize,
        temporalGranularity,
        ...(lActive && { l, sensitiveAttr }),
        totalInput: trips.length,
        validInput: validTrips.length,
        releasedRecords: 0,
        suppressedRecords: suppressedTrips.length,
        suppressionRate: validTrips.length ? suppressedTrips.length / validTrips.length : 0,
        outputGroups: 0,
        kViolations: 0,
        ...(lActive && { lViolations: 0 }),
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

    // Attach per-group ℓ-diversity info for the response
    const distinctSensitiveValues = lActive
      ? getLDiversityCount(group, sensitiveAttr, gridSize)
      : undefined;

    return {
      centroidLat: group.centroid.lat,
      centroidLng: group.centroid.lng,
      count: group.noisyCount ?? group.trips.length,
      temporalBucket: group.temporalBucket,
      cellsMerged: group.cells.size,
      spatialErrorMeanKm,
      spatialErrorMaxKm,
      ...(lActive  && { distinctSensitiveValues }),
      ...(dpActive && { dpDisplacementKm: group.dpDisplacementKm ?? 0 }),
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

  // ℓ-diversity aggregate metrics
  let lDiversityMetrics = {};
  if (lActive) {
    const distinctCounts = anonymizedGroups.map((g) =>
      getLDiversityCount(g, sensitiveAttr, gridSize)
    );
    lDiversityMetrics = {
      l,
      sensitiveAttr,
      lViolations: distinctCounts.filter((c) => c < l).length,
      minDistinctSensitiveValues: Math.min(...distinctCounts),
      maxDistinctSensitiveValues: Math.max(...distinctCounts),
      avgDistinctSensitiveValues: Number(
        (distinctCounts.reduce((s, c) => s + c, 0) / distinctCounts.length).toFixed(2)
      ),
    };
  }

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
      densityJsdSimilarity: Number((1 - jsd).toFixed(4)),
      top5HotspotOverlap: topOverlap(rawDensity, anonymizedDensity, 5),
      top10HotspotOverlap: topOverlap(rawDensity, anonymizedDensity, 10),
      avgCellsMerged: mergedCellTotal / anonymizedTrips.length,
      ...lDiversityMetrics,
      ...(dpActive && {
        dpEnabled:            true,
        epsilon:              dpStats.epsilon,
        dpLocationScaleDeg:   dpStats.locationScaleDeg,
        dpLocationScaleKm:    dpStats.locationScaleKm,
        dpCountScale:         dpStats.countScale,
        avgCentroidDisplacementKm: dpStats.avgDisplacementKm,
      }),
    },
  };
};

// ─── Input validation ─────────────────────────────────────────────────────────

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

// ─── Public exports ───────────────────────────────────────────────────────────

export const applyKAnonymity = async (trips, k, options = {}) => {
  const gridSize = toNumber(options.gridSize) || DEFAULT_GRID_SIZE;
  const temporalGranularity = options.temporalGranularity || 'none';
  const timezone = options.timezone || 'UTC';

  // ℓ-diversity options (l=1 means disabled — same as plain k-anonymity)
  const l = Number.isInteger(options.l) && options.l >= 2 ? options.l : 1;
  const sensitiveAttr = options.sensitiveAttr || 'none';

  // ε-DP: Infinity means disabled (no noise added)
  const epsilon = (Number.isFinite(options.epsilon) && options.epsilon > 0)
    ? options.epsilon
    : Infinity;

  const validation = validateInput(trips, k, temporalGranularity, timezone);
  if (validation.status === 'error') return validation;

  const { validTrips } = validation;

  // ── ℓ-diversity cardinality pre-check ────────────────────────────────────
  // If ℓ exceeds the number of distinct values that actually exist in the
  // dataset for the chosen attribute, no merging strategy can ever satisfy
  // the constraint.  Fail fast with a precise, actionable message instead of
  // silently suppressing everything and returning an opaque "no groups" error.
  if (l > 1 && sensitiveAttr !== 'none') {
    const globalValues = new Set(
      validTrips
        .map((t) => getSensitiveValue(t, sensitiveAttr, gridSize))
        .filter((v) => v !== null && v !== undefined)
    );
    const globalDistinct = globalValues.size;
    if (globalDistinct < l) {
      const sample = [...globalValues].slice(0, 6).map((v) => `"${v}"`).join(', ');
      return {
        status: 'error',
        message:
          `ℓ=${l} cannot be satisfied: the loaded dataset contains only ` +
          `${globalDistinct} distinct value${globalDistinct === 1 ? '' : 's'} ` +
          `for "${sensitiveAttr}" (${sample}${globalValues.size > 6 ? ', …' : ''}). ` +
          `Reduce ℓ to ${globalDistinct} or less, or choose "Destination area" as the ` +
          `sensitive attribute (it has many distinct grid-cell values).`,
      };
    }
  }

  const buckets = bucketTripsByTime(validTrips);

  const suppressedTrips = [];
  const anonymizedGroups = [];

  buckets.forEach((bucketTrips, temporalBucket) => {
    if (bucketTrips.length < k) {
      suppressedTrips.push(...bucketTrips);
      return;
    }

    anonymizeBucket(bucketTrips, k, l, sensitiveAttr, gridSize, temporalBucket).forEach(
      (group) => {
        if (!isGroupValid(group, k, l, sensitiveAttr, gridSize)) {
          suppressedTrips.push(...group.trips);
        } else {
          anonymizedGroups.push(group);
        }
      }
    );
  });

  // Apply ε-DP noise to released centroids as a post-processing step.
  // k-anonymity provides the structural guarantee (group size ≥ k);
  // ε-DP adds a semantic probabilistic guarantee on top via Laplace noise.
  const { noisyGroups, dpStats } = applyDPNoise(anonymizedGroups, epsilon, gridSize);

  return buildAnonymizationResponse({
    trips,
    validTrips,
    anonymizedGroups: noisyGroups,
    suppressedTrips,
    k,
    l,
    sensitiveAttr,
    dpStats,
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
    l: 1,
    sensitiveAttr: 'none',
    dpStats: null,
    gridSize,
    temporalGranularity,
    method: 'suppression-baseline',
  });
};

// L4: Fixed-grid generalization baseline.
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
    l: 1,
    sensitiveAttr: 'none',
    dpStats: null,
    gridSize,
    temporalGranularity,
    method: 'fixed-grid-baseline',
  });
};
