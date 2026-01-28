import express from 'express';
import multer from 'multer';
import csvParser from 'csv-parser';
import fs from 'fs';
import path from 'path';
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
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

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

    const trips = [];
    const filePath = req.file.path;

    console.log(`Processing CSV file: ${filePath}`);

    let totalRows = 0;
    let skippedRows = 0;

    // Read and parse CSV
    await new Promise((resolve, reject) => {
      // Check if file exists before trying to read it
      if (!fs.existsSync(filePath)) {
        reject(new Error(`Uploaded file not found at path: ${filePath}`));
        return;
      }

      console.log('Starting CSV parsing...');
      console.log('File path:', filePath);
      
      fs.createReadStream(filePath)
        .pipe(csvParser({
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
        }))
        .on('data', (row) => {
          totalRows++;
          
          // Skip header row if it's being processed as data
          if (row.ride_id === 'ride_id' && row.started_at === 'started_at' && row.ended_at === 'ended_at') {
            console.log(`Skipping header row ${totalRows}`);
            return;
          }
          
          // Skip completely empty rows
          if (!row.ride_id && !row.started_at && !row.ended_at && !row.rideable_type) {
            console.log(`Skipping empty row ${totalRows}`);
            return;
          }
          
          // Check if fields are actually empty or just whitespace
          const rideId = row.ride_id ? row.ride_id.trim() : '';
          const startedAt = row.started_at ? row.started_at.trim() : '';
          const endedAt = row.ended_at ? row.ended_at.trim() : '';
          
          // Validate required fields
          if (!rideId || !startedAt || !endedAt) {
            console.log(`Skipping row ${totalRows} - missing required fields:`, {
              ride_id: `"${rideId}"`,
              started_at: `"${startedAt}"`,
              ended_at: `"${endedAt}"`
            });
            skippedRows++;
            return; // Skip invalid rows
          }

          // Validate New York coordinates
          const startLat = row.start_lat ? parseFloat(row.start_lat) : null;
          const startLng = row.start_lng ? parseFloat(row.start_lng) : null;
          const endLat = row.end_lat ? parseFloat(row.end_lat) : null;
          const endLng = row.end_lng ? parseFloat(row.end_lng) : null;

          // Skip rows with coordinates outside New York area
          if ((startLat && startLng && !isValidNewYorkCoordinate(startLat, startLng)) ||
              (endLat && endLng && !isValidNewYorkCoordinate(endLat, endLng))) {
            console.log(`Skipping row with coordinates outside NY area: ${rideId}`);
            skippedRows++;
            return; // Skip rows with coordinates outside New York
          }

          console.log(`Valid row ${totalRows} - adding to trips array`);
          trips.push([
            rideId,  // Use trimmed values
            row.rideable_type || null,
            startedAt,  // Use trimmed values
            endedAt,    // Use trimmed values
            row.start_station_name || null,
            row.start_station_id || null,
            row.end_station_name || null,
            row.end_station_id || null,
            startLat,
            startLng,
            endLat,
            endLng,
            row.member_casual || null,
            true // is_user_uploaded = true
          ]);
        })
        .on('end', () => {
          console.log(`CSV parsing completed. Total rows: ${totalRows}, Valid trips: ${trips.length}, Skipped: ${skippedRows}`);
          resolve();
        })
        .on('error', (streamError) => {
          console.error('CSV parsing error:', streamError);
          reject(new Error(`Error reading CSV file: ${streamError.message}`));
        });
    });

    // Clean up uploaded file
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('Cleaned up uploaded file:', filePath);
      }
    } catch (cleanupError) {
      console.error('Warning: Could not clean up uploaded file:', cleanupError.message);
      // Don't fail the upload if cleanup fails
    }

    if (trips.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid data found in CSV file. Please ensure your data contains required fields (ride_id, started_at, ended_at) and coordinates are within the New York City area.'
      });
    }

    // Insert data in chunks
    const chunkSize = 1000;
    let totalInserted = 0;
    let duplicateCount = 0;

    for (let i = 0; i < trips.length; i += chunkSize) {
      const chunk = trips.slice(i, i + chunkSize);

      const query = `
        INSERT IGNORE INTO trips (
          ride_id, rideable_type, started_at, ended_at, start_station_name, 
          start_station_id, end_station_name, end_station_id, start_lat, start_lng, 
          end_lat, end_lng, member_casual, is_user_uploaded
        ) VALUES ?
      `;

      try {
        const [result] = await pool.query(query, [chunk]);
        totalInserted += result.affectedRows;
        console.log(`Chunk ${Math.floor(i/chunkSize) + 1}: Inserted ${result.affectedRows} records`);
      } catch (insertError) {
        console.error('Error inserting chunk:', insertError);
        // If INSERT IGNORE fails, try individual inserts with duplicate handling
        if (insertError.code === 'ER_DUP_ENTRY') {
          console.log('Handling duplicates with individual inserts...');
          for (const trip of chunk) {
            try {
              const individualQuery = `
                INSERT IGNORE INTO trips (
                  ride_id, rideable_type, started_at, ended_at, start_station_name, 
                  start_station_id, end_station_name, end_station_id, start_lat, start_lng, 
                  end_lat, end_lng, member_casual, is_user_uploaded
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `;
              const [individualResult] = await pool.query(individualQuery, trip);
              if (individualResult.affectedRows > 0) {
                totalInserted++;
              } else {
                duplicateCount++;
              }
            } catch (individualError) {
              if (individualError.code === 'ER_DUP_ENTRY') {
                duplicateCount++;
                console.log(`Duplicate ride_id: ${trip[0]}`);
              } else {
                console.error('Individual insert error:', individualError);
              }
            }
          }
        }
      }
    }

    const message = skippedRows > 0 
      ? `Successfully uploaded ${totalInserted} records. ${skippedRows} rows were skipped (invalid data or coordinates outside New York City area). ${duplicateCount} duplicate records were ignored.`
      : `Successfully uploaded ${totalInserted} records. ${duplicateCount} duplicate records were ignored.`;

    res.json({
      status: 'success',
      message: message,
      totalRecords: totalInserted,
      skippedRows: skippedRows,
      totalRows: totalRows,
      duplicateCount: duplicateCount
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process CSV file',
      error: error.message
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

    res.json({
      status: 'success',
      data: {
        preloaded: preloadedCount[0].count,
        userUploaded: userDataCount[0].count
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

// Helper function to validate New York coordinates
const isValidNewYorkCoordinate = (lat, lng) => {
  if (!lat || !lng) return false;
  
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  
  if (isNaN(latNum) || isNaN(lngNum)) return false;
  
  // New York City coordinates bounds (made slightly more lenient)
  // Latitude: 40.4774 to 40.9176 (roughly)
  // Longitude: -74.2591 to -73.7004 (roughly)
  const nyLatMin = 40.4;  // Slightly more lenient
  const nyLatMax = 40.95; // Slightly more lenient
  const nyLngMin = -74.3; // Slightly more lenient
  const nyLngMax = -73.6; // Slightly more lenient
  
  const isValid = latNum >= nyLatMin && latNum <= nyLatMax && 
                  lngNum >= nyLngMin && lngNum <= nyLngMax;
  
  if (!isValid) {
    console.log(`Coordinate validation failed: lat=${latNum}, lng=${lngNum}`);
  }
  
  return isValid;
};

export default router; 