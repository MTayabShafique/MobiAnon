import { pool } from '../db/dbConfig.js';
import { kmeans } from 'ml-kmeans';


export const getTripsInBounds = async (filters) => {
  const { date, memberType, bounds, dataSource } = filters;

  try {
    console.log('🟢 Entering getTripsInBounds function');

    // **Step 1: Get a connection from the pool**
    const connection = await pool.getConnection();
    console.log('✅ Connection acquired from pool');

    // **Step 2: Build the SQL query**
    let sql = `
      SELECT 
        ride_id, rideable_type, started_at, ended_at, 
        start_station_name, start_lat, start_lng, 
        end_station_name, end_lat, end_lng, member_casual
      FROM trips 
      WHERE start_lat BETWEEN ? AND ?
        AND start_lng BETWEEN ? AND ?
        AND is_user_uploaded = ?
    `;

    const isUserUploaded = dataSource === 'user' ? 1 : 0;
    let params = [
      bounds.minLat, bounds.maxLat,
      bounds.minLng, bounds.maxLng,
      isUserUploaded
    ];

    // Add date filter only for preloaded data
    if (dataSource === 'preloaded' && date) {
      sql = sql.replace('WHERE', 'WHERE started_at BETWEEN ? AND ? AND');
      params = [
        `${date} 00:00:00`, `${date} 23:59:59`,
        ...params
      ];
    }

    if (memberType && memberType !== 'all') {
      sql += ' AND member_casual = ?';
      params.push(memberType);
    }

    sql += ' LIMIT 500';


    // **Step 3: Execute the query**
    console.log('📌 Executing query:', sql);
    console.log('📌 With parameters:', params);

    const [rows] = await connection.execute(sql, params);
    connection.release(); // Always release the connection after query
    console.log('✅ Query executed successfully:', rows.length, 'results found');

    return {
      status: 'success',
      message: 'Trips fetched successfully',
      data: rows,
    };
  } catch (error) {
    console.error('❌ Error fetching trips:', error);
    return {
      status: 'error',
      message: 'Failed to fetch trips',
      error: error.message || error,
    };
  }
};



export const applyKAnonymity = async (trips, k) => {
  if (trips.length < k) {
    return {
      status: "error",
      message: `Not enough trips (${trips.length}) for k=${k}`,
    };
  }

  // Filter out invalid trips
  const validTrips = trips
    .map(trip => ({
      start_lat: parseFloat(trip.start_lat),
      start_lng: parseFloat(trip.start_lng),
    }))
    .filter(trip => !isNaN(trip.start_lat) && !isNaN(trip.start_lng));

  if (validTrips.length < k) {
    return {
      status: "error",
      message: `Not enough valid trips (${validTrips.length}) for k=${k}`,
    };
  }

  console.log(`🔹 Valid trips count: ${validTrips.length}`);

  // Define grid size (adjust this based on dataset scale)
  const GRID_SIZE = 0.01; // ~1.1 km per grid cell

  // Function to compute grid cell
  const getGridKey = (lat, lng) => {
    const gridLat = Math.floor(lat / GRID_SIZE);
    const gridLng = Math.floor(lng / GRID_SIZE);
    return `${gridLat},${gridLng}`;
  };

  // Group trips into grid cells
  const gridMap = new Map();
  validTrips.forEach(trip => {
    const key = getGridKey(trip.start_lat, trip.start_lng);
    if (!gridMap.has(key)) gridMap.set(key, []);
    gridMap.get(key).push(trip);
  });

  console.log(`🔹 Initial grid cells: ${gridMap.size}`);

  // Merge small grids until all have at least k trips
  const mergedGrid = new Map();
  for (let [key, trips] of gridMap.entries()) {
    if (trips.length >= k) {
      mergedGrid.set(key, trips);
    } else {
      // Merge with nearest neighbor
      let merged = false;
      for (let [neighborKey, neighborTrips] of mergedGrid.entries()) {
        if (neighborTrips.length + trips.length >= k) {
          neighborTrips.push(...trips);
          merged = true;
          break;
        }
      }
      if (!merged) {
        mergedGrid.set(key, trips); // If no merge was possible, keep it
      }
    }
  }

  console.log(`🔹 Final anonymized groups: ${mergedGrid.size}`);

  // Compute centroids
  const anonymizedTrips = Array.from(mergedGrid.values()).map(group => {
    const centroidLat = group.reduce((sum, trip) => sum + trip.start_lat, 0) / group.length;
    const centroidLng = group.reduce((sum, trip) => sum + trip.start_lng, 0) / group.length;

    return {
      centroidLat,
      centroidLng,
      count: group.length, // Intensity for heatmap
    };
  });

  return {
    status: "success",
    message: "Anonymized trip data retrieved successfully",
    data: anonymizedTrips,
  };
};

