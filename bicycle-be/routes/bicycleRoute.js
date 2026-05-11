import express from 'express';
import {
  getAnonymizedTripsInBounds,
  getTripsInBounds,
  normalizeLimit,
} from '../services/bicycleTrips.js';

const router = express.Router();

const parseBounds = ({ minLat, maxLat, minLng, maxLng }) => {
  const bounds = {
    minLat: parseFloat(minLat),
    maxLat: parseFloat(maxLat),
    minLng: parseFloat(minLng),
    maxLng: parseFloat(maxLng),
  };

  if (Object.values(bounds).some(Number.isNaN)) {
    return null;
  }

  return bounds;
};

const validateCommonQuery = (req, res) => {
  const { date, minLat, maxLat, minLng, maxLng } = req.query;
  const dataSource = req.query.dataSource || 'preloaded';

  if (!minLat || !maxLat || !minLng || !maxLng) {
    res.status(400).json({
      status: 'error',
      message: 'Missing required parameters: minLat, maxLat, minLng, maxLng',
    });
    return null;
  }

  if (dataSource === 'preloaded' && !date) {
    res.status(400).json({
      status: 'error',
      message: 'Date parameter is required for preloaded data',
    });
    return null;
  }

  const bounds = parseBounds(req.query);
  if (!bounds) {
    res.status(400).json({ status: 'error', message: 'Invalid bounds parameters' });
    return null;
  }

  return {
    date,
    dataSource,
    memberType: req.query.memberType,
    bounds,
    limit: normalizeLimit(req.query.limit),
  };
};

// Fetch trips in bounds
router.get('/trips', async (req, res) => {
  try {
    const filters = validateCommonQuery(req, res);
    if (!filters) return;

    const result = await getTripsInBounds(filters);
    return res.status(result.status === 'error' ? 500 : 200).json(result);
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
    const filters = validateCommonQuery(req, res);
    if (!filters) return;

    const { k, gridSize, temporalGranularity } = req.query;

    const kValue = parseInt(k, 10);
    if (Number.isNaN(kValue) || kValue < 1) {
      return res.status(400).json({ status: 'error', message: 'Invalid k value' });
    }

    const gridSizeValue = gridSize ? parseFloat(gridSize) : 0.01;
    if (Number.isNaN(gridSizeValue) || gridSizeValue <= 0 || gridSizeValue > 1) {
      return res.status(400).json({ status: 'error', message: 'Invalid gridSize value' });
    }

    const allowedTemporalGranularities = new Set(['none', 'day', 'hour', 'period']);
    const temporalGranularityValue = temporalGranularity || 'none';
    if (!allowedTemporalGranularities.has(temporalGranularityValue)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid temporalGranularity value',
      });
    }

    const result = await getAnonymizedTripsInBounds(filters, {
      k: kValue,
      gridSize: gridSizeValue,
      temporalGranularity: temporalGranularityValue,
    });

    return res.status(result.status === 'error' ? 400 : 200).json(result);
  } catch (error) {
    console.error('Error fetching anonymized trips:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch anonymized trip data',
      error: error.message || error,
    });
  }
});

export default router;
