import express from 'express';
import multer from 'multer';
import csvParser from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { pool } from '../db/dbConfig.js';

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 250 * 1024 * 1024 // 250MB limit for larger mobility CSV files
  }
});

const REQUIRED_CSV_COLUMNS = [
  'started_at',
  'ended_at',
  'start_lat',
  'start_lng',
  'end_lat',
  'end_lng',
];

const EXPECTED_CSV_COLUMNS = [
  'ride_id',
  'rideable_type',
  'started_at',
  'ended_at',
  'start_station_name',
  'start_station_id',
  'end_station_name',
  'end_station_id',
  'start_lat',
  'start_lng',
  'end_lat',
  'end_lng',
  'member_casual',
];

const COLUMN_ALIASES = {
  ride_id: ['ride_id', 'ride id', 'trip_id', 'trip id', 'id', 'rental_id', 'rental id'],
  rideable_type: ['rideable_type', 'bike_type', 'bike type', 'vehicle_type', 'vehicle type'],
  started_at: ['started_at', 'started at', 'start_time', 'start time', 'started', 'start_date', 'start date', 'starttime', 'start_time_local'],
  ended_at: ['ended_at', 'ended at', 'end_time', 'end time', 'ended', 'end_date', 'end date', 'stoptime', 'end_time_local'],
  start_station_name: ['start_station_name', 'start station name', 'from_station_name', 'from station name', 'start_station', 'start station', 'start_location_name'],
  start_station_id: ['start_station_id', 'start station id', 'from_station_id', 'from station id', 'start_id', 'start id'],
  end_station_name: ['end_station_name', 'end station name', 'to_station_name', 'to station name', 'end_station', 'end station', 'end_location_name'],
  end_station_id: ['end_station_id', 'end station id', 'to_station_id', 'to station id', 'end_id', 'end id'],
  start_lat: ['start_lat', 'start lat', 'start_latitude', 'start latitude', 'from_lat', 'from latitude', 'start station latitude', 'start_station_latitude'],
  start_lng: ['start_lng', 'start lng', 'start_lon', 'start lon', 'start_longitude', 'start longitude', 'from_lng', 'from longitude', 'from_lon', 'start station longitude', 'start_station_longitude'],
  end_lat: ['end_lat', 'end lat', 'end_latitude', 'end latitude', 'to_lat', 'to latitude', 'end station latitude', 'end_station_latitude'],
  end_lng: ['end_lng', 'end lng', 'end_lon', 'end lon', 'end_longitude', 'end longitude', 'to_lng', 'to longitude', 'to_lon', 'end station longitude', 'end_station_longitude'],
  member_casual: ['member_casual', 'member casual', 'user_type', 'user type', 'subscriber_type', 'customer_type', 'membership_type'],
};

const normalizeColumnName = (value) =>
  value
    ?.replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const buildColumnMap = (headers) => {
  const normalizedHeaders = new Map(
    headers.map((header) => [normalizeColumnName(header), header?.replace(/^\uFEFF/, '').trim()])
  );

  return Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([field, aliases]) => {
      const matchedAlias = aliases.find((alias) => normalizedHeaders.has(normalizeColumnName(alias)));
      return [field, matchedAlias ? normalizedHeaders.get(normalizeColumnName(matchedAlias)) : null];
    })
  );
};

const getMappedValue = (row, columnMap, field) => {
  const column = columnMap?.[field];
  const value = column ? row[column] : undefined;
  return typeof value === 'string' ? value.trim() : value;
};

const createValidationSummary = () => ({
  missingRequiredValues: 0,
  invalidDateRows: 0,
  invalidCoordinateRows: 0,
  emptyRows: 0,
});

const isValidDateTime = (value) => {
  if (!value) return false;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return !Number.isNaN(new Date(normalized).getTime());
};

const isFiniteCoordinate = (value) => Number.isFinite(parseFloat(value));

const formatValidationDetails = (summary) =>
  [
    summary.missingRequiredValues
      ? `${summary.missingRequiredValues} missing required values`
      : null,
    summary.invalidDateRows ? `${summary.invalidDateRows} invalid date rows` : null,
    summary.invalidCoordinateRows
      ? `${summary.invalidCoordinateRows} invalid coordinate rows`
      : null,
    summary.emptyRows ? `${summary.emptyRows} empty rows` : null,
  ]
    .filter(Boolean)
    .join('; ');

// L8: Deterministic ride_id for rows without an explicit ID.
// Using Date.now() + rowNumber previously produced a different ID each upload,
// so INSERT IGNORE could not detect duplicate rows across chunks or re-uploads.
// A SHA-1 of the stable trip fields guarantees the same row always gets the same
// generated ID, enabling DB-level deduplication via INSERT IGNORE.
const tripContentHash = (startedAt, startLat, startLng, endLat, endLng) =>
  `auto-${createHash('sha1')
    .update(`${startedAt}|${startLat}|${startLng}|${endLat}|${endLng}`)
    .digest('hex')
    .slice(0, 20)}`;

const normalizeUploadedTrip = (row, columnMap, rowNumber, validationSummary) => {
  const explicitRideId = getMappedValue(row, columnMap, 'ride_id');
  const startedAt = getMappedValue(row, columnMap, 'started_at') || '';
  const endedAt = getMappedValue(row, columnMap, 'ended_at') || '';
  const startLatRaw = getMappedValue(row, columnMap, 'start_lat');
  const startLngRaw = getMappedValue(row, columnMap, 'start_lng');
  const endLatRaw = getMappedValue(row, columnMap, 'end_lat');
  const endLngRaw = getMappedValue(row, columnMap, 'end_lng');

  if (explicitRideId === 'ride_id' && startedAt === 'started_at' && endedAt === 'ended_at') {
    return { status: 'skip-header' };
  }

  if (!startedAt && !endedAt && !startLatRaw && !startLngRaw && !endLatRaw && !endLngRaw) {
    validationSummary.emptyRows++;
    return { status: 'skip' };
  }

  // Required fields: rideId absence is tolerated — we will generate a hash instead
  if (!startedAt || !endedAt || !startLatRaw || !startLngRaw || !endLatRaw || !endLngRaw) {
    validationSummary.missingRequiredValues++;
    return { status: 'skip' };
  }

  if (!isValidDateTime(startedAt) || !isValidDateTime(endedAt)) {
    validationSummary.invalidDateRows++;
    return { status: 'skip' };
  }

  const hasValidCoordinates = [
    startLatRaw,
    startLngRaw,
    endLatRaw,
    endLngRaw,
  ].every(isFiniteCoordinate);

  if (!hasValidCoordinates) {
    validationSummary.invalidCoordinateRows++;
    return { status: 'skip' };
  }

  const startLat = parseFloat(startLatRaw);
  const startLng = parseFloat(startLngRaw);
  const endLat = parseFloat(endLatRaw);
  const endLng = parseFloat(endLngRaw);

  if (!isValidCoordinate(startLat, startLng) || !isValidCoordinate(endLat, endLng)) {
    validationSummary.invalidCoordinateRows++;
    return { status: 'skip' };
  }

  // Resolve final ride_id: explicit value wins; otherwise derive a stable hash from
  // the trip's content so INSERT IGNORE deduplicates across chunks and re-uploads.
  const finalRideId = explicitRideId || tripContentHash(startedAt, startLat, startLng, endLat, endLng);

  return {
    status: 'valid',
    trip: [
      finalRideId,
      getMappedValue(row, columnMap, 'rideable_type') || null,
      startedAt,
      endedAt,
      getMappedValue(row, columnMap, 'start_station_name') || null,
      getMappedValue(row, columnMap, 'start_station_id') || null,
      getMappedValue(row, columnMap, 'end_station_name') || null,
      getMappedValue(row, columnMap, 'end_station_id') || null,
      startLat,
      startLng,
      endLat,
      endLng,
      getMappedValue(row, columnMap, 'member_casual') || 'unknown',
      true,
    ],
  };
};

const insertTripChunk = async (chunk) => {
  if (chunk.length === 0) return 0;

  const query = `
    INSERT IGNORE INTO trips (
      ride_id, rideable_type, started_at, ended_at, start_station_name,
      start_station_id, end_station_name, end_station_id, start_lat, start_lng,
      end_lat, end_lng, member_casual, is_user_uploaded
    ) VALUES ?
  `;

  const [result] = await pool.query(query, [chunk]);
  return result.affectedRows;
};

const cleanupUploadedFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Cleaned up uploaded file:', filePath);
    }
  } catch (cleanupError) {
    console.error('Warning: Could not clean up uploaded file:', cleanupError.message);
  }
};

// Upload CSV endpoint
router.post('/csv', upload.single('csvFile'), async (req, res) => {
  try {
    console.log('Upload request received:', req.body);
    console.log('Files:', req.files);
    console.log('File object:', req.file);
    
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    const filePath = req.file.path;

    console.log(`Processing CSV file: ${filePath}`);

    let totalRows = 0;
    let skippedRows = 0;
    let validRows = 0;
    let totalInserted = 0;
    let flushCount = 0;
    let headersChecked = false;
    let columnMap = null;
    let chunk = [];
    const chunkSize = 1000;
    const validationSummary = createValidationSummary();

    // L7: Concurrency-limited insert pool.
    // Previously every chunk queued strictly behind a single pendingFlush promise, so
    // inserts were fully sequential. Allowing 2 parallel inserts doubles DB throughput
    // on large files. INSERT IGNORE is idempotent so order does not matter for correctness.
    const MAX_PARALLEL_INSERTS = 2;
    let activeInserts = 0;
    const insertErrors = [];

    // Fire an insert immediately — caller controls whether to pause the stream.
    const runInsert = (rowsToInsert, chunkNumber) => {
      activeInserts++;
      insertTripChunk(rowsToInsert)
        .then((inserted) => {
          totalInserted += inserted;
          console.log(`Stream chunk ${chunkNumber}: inserted ${inserted}/${rowsToInsert.length} records`);
        })
        .catch((err) => insertErrors.push(err))
        .finally(() => { activeInserts--; });
    };

    // Wait for all in-flight inserts to finish before closing
    const drainInserts = () =>
      new Promise((resolve) => {
        const check = () => (activeInserts === 0 ? resolve() : setImmediate(check));
        check();
      });

    const flushChunk = () => {
      if (chunk.length === 0) return;
      const rowsToInsert = chunk;
      chunk = [];
      flushCount++;
      runInsert(rowsToInsert, flushCount);
    };

    // Read and parse CSV
    await new Promise((resolve, reject) => {
      // Check if file exists before trying to read it
      if (!fs.existsSync(filePath)) {
        reject(new Error(`Uploaded file not found at path: ${filePath}`));
        return;
      }

      console.log('Starting CSV parsing...');
      console.log('File path:', filePath);
      
      const parser = csvParser({
          // Windows-compatible CSV parsing options
          separator: ',',
          skipEmptyLines: true,
          trim: true,
          // Handle different line endings
          ltrim: true,
          rtrim: true,
          mapHeaders: ({ header }) =>
            header?.replace(/^\uFEFF/, '').trim(),
          // Additional options for Windows compatibility
          strict: false,
          skipLinesWithEmptyValues: false
        });

      fs.createReadStream(filePath)
        .pipe(parser)
        .on('headers', (headers) => {
          headersChecked = true;
          columnMap = buildColumnMap(headers);
          const missingColumns = REQUIRED_CSV_COLUMNS.filter((column) => !columnMap[column]);

          if (missingColumns.length > 0) {
            reject(new Error(`Missing required mobility fields: ${missingColumns.join(', ')}`));
          }
        })
        .on('data', (row) => {
          totalRows++;

          const normalized = normalizeUploadedTrip(row, columnMap, totalRows, validationSummary);

          if (normalized.status === 'skip-header') {
            console.log(`Skipping header row ${totalRows}`);
            return;
          }

          if (normalized.status === 'skip') {
            skippedRows++;
            return;
          }

          validRows++;
          chunk.push(normalized.trip);

          if (chunk.length >= chunkSize) {
            flushChunk();
            // Apply backpressure only when both slots are occupied so we never
            // queue more than MAX_PARALLEL_INSERTS concurrent DB writes.
            if (activeInserts >= MAX_PARALLEL_INSERTS) {
              parser.pause();
              const resume = () => (activeInserts < MAX_PARALLEL_INSERTS ? parser.resume() : setImmediate(resume));
              setImmediate(resume);
            }
          }
        })
        .on('end', async () => {
          if (!headersChecked) {
            reject(new Error('CSV file is empty or missing a header row'));
            return;
          }

          try {
            flushChunk();
            await drainInserts();
            if (insertErrors.length > 0) {
              throw insertErrors[0];
            }
            console.log(`CSV parsing completed. Total rows: ${totalRows}, Valid trips: ${validRows}, Inserted: ${totalInserted}, Skipped: ${skippedRows}`);
            resolve();
          } catch (flushError) {
            reject(flushError);
          }
        })
        .on('error', (streamError) => {
          console.error('CSV parsing error:', streamError);
          reject(new Error(`Error reading CSV file: ${streamError.message}`));
        });
    });

    cleanupUploadedFile(filePath);

    if (validRows === 0) {
      const details = formatValidationDetails(validationSummary);
      return res.status(400).json({
        status: 'error',
        message: details
          ? `No valid rows were found. ${details}.`
          : 'No valid data found in CSV file. Please use the sample template or a similar mobility CSV with start/end time and coordinates.',
        totalRows,
        skippedRows,
        validationSummary,
        requiredColumns: REQUIRED_CSV_COLUMNS,
        expectedColumns: EXPECTED_CSV_COLUMNS,
        supportedAliases: COLUMN_ALIASES,
      });
    }

    const duplicatesEstimated = validRows - totalInserted;

    if (totalInserted === 0) {
      return res.json({
        status: 'success',
        message: 'No new records were added. This file appears to be already uploaded (all rows were duplicates).',
        totalRecords: 0,
        skippedRows,
        totalRows,
        duplicateCount: duplicatesEstimated,
        validationSummary,
      });
    }

    const validationDetails = formatValidationDetails(validationSummary);
    const message = skippedRows > 0 
      ? `Successfully uploaded ${totalInserted} records. ${skippedRows} rows were skipped${validationDetails ? ` (${validationDetails})` : ''}. ${duplicatesEstimated} duplicate records were ignored.`
      : `Successfully uploaded ${totalInserted} records. ${duplicatesEstimated} duplicate records were ignored.`;

    res.json({
      status: 'success',
      message: message,
      totalRecords: totalInserted,
      skippedRows: skippedRows,
      totalRows: totalRows,
      duplicateCount: duplicatesEstimated,
      validationSummary,
      supportedFields: REQUIRED_CSV_COLUMNS,
    });

  } catch (error) {
    console.error('Upload error:', error);
    cleanupUploadedFile(req.file?.path);
    const isValidationError = error.message?.startsWith('Missing required mobility fields') ||
      error.message === 'CSV file is empty or missing a header row';

    res.status(isValidationError ? 400 : 500).json({
      status: 'error',
      message: isValidationError
        ? error.message
        : 'Failed to process CSV file',
      error: error.message,
      requiredColumns: REQUIRED_CSV_COLUMNS,
      expectedColumns: EXPECTED_CSV_COLUMNS,
      supportedAliases: COLUMN_ALIASES,
    });
  }
});

// Delete user uploaded data
router.delete('/user-data', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM trips WHERE is_user_uploaded = true'
    );

    res.json({
      status: 'success',
      message: `Deleted ${result.affectedRows} user uploaded records`,
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete user data',
      error: error.message
    });
  }
});

// Get data source info
router.get('/data-sources', async (req, res) => {
  try {
    const [preloadedCount] = await pool.query(
      'SELECT COUNT(*) as count FROM trips WHERE is_user_uploaded = false'
    );
    
    const [userDataCount] = await pool.query(
      'SELECT COUNT(*) as count FROM trips WHERE is_user_uploaded = true'
    );

    const [bounds] = await pool.query(`
      SELECT
        is_user_uploaded,
        COUNT(*) AS count,
        MIN(start_lat) AS minLat,
        MAX(start_lat) AS maxLat,
        MIN(start_lng) AS minLng,
        MAX(start_lng) AS maxLng,
        MIN(started_at) AS minDate,
        MAX(started_at) AS maxDate
      FROM trips
      GROUP BY is_user_uploaded
    `);

    const boundsBySource = Object.fromEntries(
      bounds.map((row) => {
        const key = row.is_user_uploaded ? 'user' : 'preloaded';
        return [
          key,
          {
            count: row.count,
            minLat: row.minLat === null ? null : Number(row.minLat),
            maxLat: row.maxLat === null ? null : Number(row.maxLat),
            minLng: row.minLng === null ? null : Number(row.minLng),
            maxLng: row.maxLng === null ? null : Number(row.maxLng),
            minDate: row.minDate,
            maxDate: row.maxDate,
          },
        ];
      })
    );

    res.json({
      status: 'success',
      data: {
        preloaded: preloadedCount[0].count,
        userUploaded: userDataCount[0].count,
        bounds: boundsBySource,
      }
    });
  } catch (error) {
    console.error('Data sources error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get data sources info',
      error: error.message
    });
  }
});

// Sample CSV download endpoint
router.get('/sample-csv', (req, res) => {
  try {
    const csvContent = `ride_id,rideable_type,started_at,ended_at,start_station_name,start_station_id,end_station_name,end_station_id,start_lat,start_lng,end_lat,end_lng,member_casual
SAMPLE_001,electric_bike,2024-01-22 18:43:19.012,2024-01-22 18:48:10.708,Frederick Douglass Blvd & W 145 St,7954.12,St Nicholas Ave & W 126 St,7756.10,40.823071718,-73.941738367,40.8114323,-73.9518776,member
SAMPLE_002,electric_bike,2024-01-11 19:19:18.721,2024-01-11 19:47:36.007,W 54 St & 6 Ave,6771.13,E 74 St & 1 Ave,6953.08,40.761822224,-73.977036119,40.7689738,-73.95482273,member
SAMPLE_003,classic_bike,2024-01-15 08:30:00,2024-01-15 08:45:00,Central Park Station,CP001,Metro Station,MS001,40.7589,-73.9851,40.7505,-73.9934,casual
SAMPLE_004,electric_bike,2024-01-15 09:00:00,2024-01-15 09:20:00,Union Square,US001,Brooklyn Bridge,BB001,40.7359,-73.9911,40.7061,-73.9969,member
SAMPLE_005,classic_bike,2024-01-15 10:15:00,2024-01-15 10:35:00,Washington Square,WS001,NYU Campus,NYU001,40.7308,-73.9976,40.7295,-73.9961,casual
SAMPLE_006,electric_bike,2024-01-15 11:00:00,2024-01-15 11:25:00,Times Square,TS001,Rockefeller Center,RC001,40.7580,-73.9855,40.7587,-73.9787,member
SAMPLE_007,classic_bike,2024-01-15 12:30:00,2024-01-15 12:50:00,Grand Central,GCT001,Empire State Building,ESB001,40.7527,-73.9772,40.7484,-73.9857,casual`;

    // Set proper headers for CSV download with Windows compatibility
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sample-bicycle-data.csv"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
    
    // Add BOM for better Excel compatibility on Windows
    const bom = '\uFEFF';
    res.send(bom + csvContent);
  } catch (error) {
    console.error('Sample CSV download error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate sample CSV file',
      error: error.message
    });
  }
});

// Helper function to validate global latitude/longitude ranges.
const isValidCoordinate = (lat, lng) => {
  if (!lat || !lng) return false;
  
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  
  if (isNaN(latNum) || isNaN(lngNum)) return false;
  
  const isValid = latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;
  
  if (!isValid) {
    console.log(`Coordinate validation failed: lat=${latNum}, lng=${lngNum}`);
  }
  
  return isValid;
};

export default router; 
