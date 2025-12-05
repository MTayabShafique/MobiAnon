import express from 'express';
import { applyKAnonymity, getTripsInBounds } from '../services/bicycleTrips.js';
import { pool } from '../db/dbConfig.js';


const router = express.Router();

// Fetch trips in bounds
router.get('/trips', async (req, res) => {
  try {
    
    const { date, memberType, minLat, maxLat, minLng, maxLng, dataSource } = req.query;

    // Validate required parameters
    if (!minLat || !maxLat || !minLng || !maxLng) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required parameters: minLat, maxLat, minLng, maxLng',
      });
    }

    // Date is only required for preloaded data
    if (dataSource === 'preloaded' && !date) {
      return res.status(400).json({
        status: 'error',
        message: 'Date parameter is required for preloaded data',
      });
    }

    // Parse and format parameters
    const filters = {
      date,
      memberType,
      bounds: {
        minLat: parseFloat(minLat),
        maxLat: parseFloat(maxLat),
        minLng: parseFloat(minLng),
        maxLng: parseFloat(maxLng),
      },
    };

    // Call the service function to get trips
    const result = await getTripsInBounds({ ...filters, dataSource: dataSource || 'preloaded' });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching trips:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch trips',
      error: error.message || error,
    });
  }
});


  

// Fetch anonymized trips with k-anonymity
router.get('/trips/anonymized', async (req, res) => {
  try {
    
    const { minLat, maxLat, minLng, maxLng, date, memberType, k } = req.query;

    // Validate k
    const kValue = parseInt(k, 10);
    if (isNaN(kValue) || kValue < 1) {
      return res.status(400).json({ status: 'error', message: 'Invalid k value' });
    }
    
    // Date is only required for preloaded data
    const dataSource = req.query.dataSource || 'preloaded';
    if (dataSource === 'preloaded' && !date) {
      return res.status(400).json({ status: 'error', message: 'Date is required for preloaded data' });
    }
    console.log('here111222');

    // Ensure bounds are numbers
    const minLatNum = parseFloat(minLat);
    const maxLatNum = parseFloat(maxLat);
    const minLngNum = parseFloat(minLng);
    const maxLngNum = parseFloat(maxLng);

    if ([minLatNum, maxLatNum, minLngNum, maxLngNum].some(isNaN)) {
      return res.status(400).json({ status: 'error', message: 'Invalid bounds parameters' });
    }

    console.log('✅ Fetching trips from DB...');
    console.log('here111333');

    // Fetch trips from database
    const connection = await pool.getConnection();
    try {
      let sql = `
        SELECT start_lat, start_lng, end_lat, end_lng, ride_id, started_at, ended_at, member_casual
        FROM trips
        WHERE start_lat BETWEEN ? AND ?
        AND start_lng BETWEEN ? AND ?
        AND is_user_uploaded = ?
      `;
      const dataSource = req.query.dataSource || 'preloaded';
      let params = [minLatNum, maxLatNum, minLngNum, maxLngNum, dataSource === 'user' ? 1 : 0];

      // Add date filter only for preloaded data
      if (dataSource === 'preloaded' && date) {
        sql = sql.replace('WHERE', 'WHERE started_at BETWEEN ? AND ? AND');
        params = [
          `${date} 00:00:00`, `${date} 23:59:59`,
          ...params
        ];
      }

      sql += ' LIMIT 500;';

      // Apply member filter if needed
      if (memberType && memberType !== 'all') {
        sql = sql.replace('LIMIT 500;', 'AND member_casual = ? LIMIT 500;');
        params.push(memberType);
      }

      const [rawTrips] = await connection.execute(sql, params);
      console.log(`✅ Found ${rawTrips.length} trips.`);

      if (rawTrips.length < kValue) {
        return res.status(400).json({ status: 'error', message: `Not enough trips (${rawTrips.length}) for k=${kValue}` });
      }

      // Apply k-anonymity
      const anonymizedTrips = await applyKAnonymity(rawTrips, kValue);
      return res.status(200).json(anonymizedTrips);
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Error fetching anonymized trips:', error);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch anonymized trip data' });
  }
});

export default router;
