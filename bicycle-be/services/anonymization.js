const DEFAULT_GRID_SIZE = 0.01;
const EARTH_RADIUS_KM = 6371;

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getTemporalBucket = (startedAt, temporalGranularity = 'none') => {
  if (temporalGranularity === 'none') return 'all';

  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const yyyyMmDd = date.toISOString().slice(0, 10);
  const hour = date.getHours();

  if (temporalGranularity === 'day') return yyyyMmDd;
  if (temporalGranularity === 'hour') {
    return `${yyyyMmDd}T${String(hour).padStart(2, '0')}`;
  }
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
    (acc, trip) => ({
      lat: acc.lat + trip.start_lat,
      lng: acc.lng + trip.start_lng,
    }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: totals.lat / trips.length,
    lng: totals.lng / trips.length,
  };
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
    const valueA = a.get(key) || 0;
    const valueB = b.get(key) || 0;
    dot += valueA * valueB;
    normA += valueA ** 2;
    normB += valueB ** 2;
  });

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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

  while (groups.length > 1) {
    const smallestIndex = groups.reduce(
      (bestIndex, group, index) =>
        group.trips.length < groups[bestIndex].trips.length ? index : bestIndex,
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

const normalizeTrips = (trips, temporalGranularity) =>
  trips
    .map((trip) => ({
      ride_id: trip.ride_id,
      start_lat: toNumber(trip.start_lat),
      start_lng: toNumber(trip.start_lng),
      started_at: trip.started_at,
      temporalBucket: getTemporalBucket(trip.started_at, temporalGranularity),
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
      distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
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

  const groupSizes = anonymizedTrips.map((group) => group.count);
  const releasedRecords = groupSizes.reduce((sum, count) => sum + count, 0);
  const totalSpatialError = anonymizedTrips.reduce(
    (sum, group) => sum + group.spatialErrorMeanKm * group.count,
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
    (group) => ({ lat: group.centroidLat, lng: group.centroidLng }),
    (group) => group.count
  );
  const mergedCellTotal = anonymizedTrips.reduce((sum, group) => sum + group.cellsMerged, 0);

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
      kViolations: anonymizedTrips.filter((group) => group.count < k).length,
      avgSpatialErrorKm: totalSpatialError / releasedRecords,
      maxSpatialErrorKm: Math.max(...anonymizedTrips.map((group) => group.spatialErrorMaxKm)),
      pointReductionRatio: 1 - anonymizedTrips.length / validTrips.length,
      rawDensityCells: rawDensity.size,
      anonymizedDensityCells: anonymizedDensity.size,
      densityCosineSimilarity: cosineSimilarity(rawDensity, anonymizedDensity),
      top5HotspotOverlap: topOverlap(rawDensity, anonymizedDensity, 5),
      top10HotspotOverlap: topOverlap(rawDensity, anonymizedDensity, 10),
      avgCellsMerged: mergedCellTotal / anonymizedTrips.length,
    },
  };
};

const validateInput = (trips, k, temporalGranularity) => {
  if (trips.length < k) {
    return {
      status: 'error',
      message: `Not enough trips (${trips.length}) for k=${k}`,
    };
  }

  const validTrips = normalizeTrips(trips, temporalGranularity);

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
  const validation = validateInput(trips, k, temporalGranularity);
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
  const validation = validateInput(trips, k, temporalGranularity);
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
