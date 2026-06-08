import express from 'express';
import multer from 'multer';
import csvParser from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { pool } from '../db/dbConfig.js';

const router = express.Router();

// Keep sessions in RAM and on disk so interrupted uploads can resume after a restart.

const SESSION_DIR = path.join(process.cwd(), 'uploads', 'sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const OPTIONAL_TRIP_COLUMNS = [
  { name: 'tripduration', definition: 'INT NULL' },
  { name: 'bike_id',      definition: 'VARCHAR(100) NULL' },
  { name: 'gender',       definition: 'VARCHAR(50) NULL' },
  { name: 'birth_year',   definition: 'SMALLINT NULL' },
  { name: 'age_band',     definition: 'VARCHAR(20) NULL' },
];

const ensureTripMetadataColumns = async () => {
  for (const column of OPTIONAL_TRIP_COLUMNS) {
    const [existing] = await pool.query('SHOW COLUMNS FROM trips LIKE ?', [column.name]);
    if (existing.length === 0) {
      await pool.query(`ALTER TABLE trips ADD COLUMN ${column.name} ${column.definition}`);
    }
  }
};

let tripMetadataColumnsError = null;
const tripMetadataColumnsReady = ensureTripMetadataColumns().catch((err) => {
  tripMetadataColumnsError = err;
  console.error('trip metadata column init error:', err.message);
});

// Track delete jobs so the UI can resume or poll after a restart.

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delete_jobs (
        id      INT PRIMARY KEY DEFAULT 1,
        status  ENUM('running','interrupted','done') NOT NULL DEFAULT 'running',
        total   INT NOT NULL DEFAULT 0,
        deleted INT NOT NULL DEFAULT 0,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    // Any job that was 'running' when the server died is now interrupted.
    await pool.query("UPDATE delete_jobs SET status = 'interrupted' WHERE status = 'running'");
  } catch (err) {
    console.error('delete_jobs init error:', err.message);
  }
})();

const uploadSessions = new Map();

const sessionFilePath = (id) => path.join(SESSION_DIR, `session-${id}.json`);

// Write session state before replying so retried chunks do not get double-counted.
const persistSession = (session) => {
  const payload = JSON.stringify({
    ...session,
    // Sets aren't JSON-serialisable — store as a plain array on disk.
    completedChunks: [...session.completedChunks],
    // columnMap is re-detected from chunk headers on resume, skip persisting it.
    columnMap: null,
  });
  return fs.promises.writeFile(sessionFilePath(session.sessionId), payload).catch((err) => {
    // Non-fatal: the upload can continue, but the crash window is slightly wider.
    console.error(`Session persist failed [${session.sessionId}]:`, err.message);
  });
};

// Remove the session file once it's no longer needed.
const deleteSessionFile = (sessionId) => {
  fs.unlink(sessionFilePath(sessionId), (err) => {
    if (err && err.code !== 'ENOENT')
      console.error(`Session file delete failed [${sessionId}]:`, err.message);
  });
};

// Restore recent sessions from disk on startup.
const loadSessionsFromDisk = () => {
  let files;
  try {
    files = fs.readdirSync(SESSION_DIR).filter(
      (f) => f.startsWith('session-') && f.endsWith('.json')
    );
  } catch { return; }

  const staleAfter = Date.now() - 4 * 60 * 60 * 1000;
  let restored = 0;

  for (const file of files) {
    const fullPath = path.join(SESSION_DIR, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

      // Throw away sessions older than 4 hours — they're almost certainly stale.
      if (data.createdAt < staleAfter) {
        fs.unlinkSync(fullPath);
        continue;
      }

      uploadSessions.set(data.sessionId, {
        ...data,
        // Deserialise the chunk list back into a Set for O(1) lookups.
        completedChunks: new Set(data.completedChunks ?? []),
        // Re-detect columnMap from the next chunk header.
        columnMap: null,
      });
      restored++;
    } catch (err) {
      console.error(`Skipping corrupt session file ${file}:`, err.message);
      try { fs.unlinkSync(fullPath); } catch { /* best effort */ }
    }
  }

  if (restored > 0) console.log(`✅ Restored ${restored} upload session(s) from disk`);
};

loadSessionsFromDisk();

// Prune stale sessions from both RAM and disk every hour.
setInterval(() => {
  const staleAfter = Date.now() - 4 * 60 * 60 * 1000;
  for (const [id, session] of uploadSessions) {
    if (session.createdAt < staleAfter) {
      deleteSessionFile(id);
      uploadSessions.delete(id);
    }
  }
}, 60 * 60 * 1000);

// Each uploaded chunk is a small CSV with its own header row.
const parseCSVChunk = (csvText) =>
  new Promise((resolve, reject) => {
    const rows = [];
    let detectedHeaders = null;

    Readable.from([csvText])
      .pipe(
        csvParser({
          separator: ',',
          skipEmptyLines: true,
          trim: true,
          mapHeaders: ({ header }) => header?.replace(/^﻿/, '').trim(),
        })
      )
      .on('headers', (h) => { detectedHeaders = h; })
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve({ rows, headers: detectedHeaders }))
      .on('error', reject);
  });


// Start a session, or resume one for the same file fingerprint.
router.post('/session/start', (req, res) => {
  const { fileName, totalChunks, fileFingerprint } = req.body;

  // Resume path: find any live session for the same file
  for (const [id, session] of uploadSessions) {
    if (session.fileFingerprint === fileFingerprint && session.status !== 'done') {
      return res.json({
        sessionId: id,
        resuming: true,
        completedChunks: [...session.completedChunks],
        insertedSoFar: session.totalInserted,
      });
    }
  }

  // Fresh session
  const sessionId = createHash('sha1')
    .update(`${Date.now()}-${fileName}-${Math.random()}`)
    .digest('hex')
    .slice(0, 16);

  const newSession = {
    sessionId,            // stored inside the object so persistSession can access it
    fileFingerprint,
    fileName,
    totalChunks,
    completedChunks: new Set(),
    columnMap: null,      // detected from the first chunk's header row
    totalInserted: 0,
    totalSkipped: 0,
    totalRows: 0,
    totalDuplicates: 0,   // actual DB-detected duplicates, not an estimate
    validationSummary: createValidationSummary(),
    status: 'uploading',
    createdAt: Date.now(),
  };

  uploadSessions.set(sessionId, newSession);
  // Persist immediately so the session exists before the first chunk arrives.
  persistSession(newSession);

  res.json({ sessionId, resuming: false, completedChunks: [] });
});

// Process one self-contained CSV chunk; retries are safe because INSERT IGNORE is idempotent.
router.post('/session/:sessionId/chunk', express.text({ limit: '5mb', type: 'text/plain' }), async (req, res) => {
  const { sessionId } = req.params;
  const chunkIndex = parseInt(req.query.chunkIndex, 10);
  const csvText = req.body;

  const session = uploadSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({
      status: 'error',
      message: 'Upload session not found or expired — please start a new upload.',
    });
  }

  // Idempotent: acknowledge chunks we already processed without re-inserting
  if (session.completedChunks.has(chunkIndex)) {
    return res.json({
      status: 'ok',
      alreadyProcessed: true,
      insertedSoFar: session.totalInserted,
      completedChunks: session.completedChunks.size,
    });
  }

  try {
    const { rows, headers } = await parseCSVChunk(csvText);

    // Build the column map once from the first chunk that carries the header row.
    if (!session.columnMap && headers) {
      const colMap = buildColumnMap(headers);
      const missing = REQUIRED_CSV_COLUMNS.filter((col) => !colMap[col]);
      if (missing.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: `Missing required columns: ${missing.join(', ')}`,
        });
      }
      session.columnMap = colMap;
    }

    // Update session counters only after the DB write succeeds.
    const chunkValidationSummary = createValidationSummary();
    const validTrips = [];
    let chunkSkipped = 0;

    for (const row of rows) {
      const normalized = normalizeUploadedTrip(
        row, session.columnMap, session.totalRows + validTrips.length + chunkSkipped + 1,
        chunkValidationSummary
      );
      if (normalized.status === 'valid') validTrips.push(normalized.trip);
      else if (normalized.status === 'skip') chunkSkipped++;
    }

    const { inserted, duplicates } = await insertTripChunk(validTrips);

    // If a crash happens after DB insert but before persistence, a retry looks like all duplicates.
    // Skip counters in that case so the final summary stays accurate.
    const isCrashRetry = validTrips.length > 0 && inserted === 0 && duplicates === validTrips.length;

    if (!isCrashRetry) {
      session.totalRows    += rows.length;
      session.totalSkipped += chunkSkipped;
      session.totalDuplicates = (session.totalDuplicates ?? 0) + duplicates;

      // Merge per-chunk validation detail into the session summary.
      for (const key of Object.keys(chunkValidationSummary)) {
        session.validationSummary[key] = (session.validationSummary[key] ?? 0) + chunkValidationSummary[key];
      }
    } else {
      console.log(`[session ${sessionId}] Chunk ${chunkIndex}: crash-retry detected — skipping row count update`);
    }

    session.totalInserted += inserted;
    session.completedChunks.add(chunkIndex);

    // Reply only after this chunk is durable on disk.
    await persistSession(session);

    res.json({
      status: 'ok',
      insertedThisChunk: inserted,
      insertedSoFar: session.totalInserted,
      completedChunks: session.completedChunks.size,
      totalChunks: session.totalChunks,
    });
  } catch (err) {
    console.error(`Chunk ${chunkIndex} error for session ${sessionId}:`, err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// Finalize the session and return the overall upload summary.
router.post('/session/:sessionId/complete', (req, res) => {
  const { sessionId } = req.params;
  const session = uploadSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ status: 'error', message: 'Upload session not found or expired.' });
  }

  session.status = 'done';
  // Session is finished — remove the file so it doesn't get reloaded on next startup.
  deleteSessionFile(sessionId);

  // Trust the DB duplicate count; retries can distort arithmetic estimates.
  const duplicateCount = session.totalDuplicates ?? 0;

  const message = session.totalInserted === 0
    ? 'All rows already exist in the database — nothing new was added. Clear user data first if you want to replace it.'
    : `Successfully uploaded ${session.totalInserted} records. ${duplicateCount} duplicates were ignored.`;

  res.json({
    status: 'success',
    message,
    totalRecords: session.totalInserted,
    totalRows: session.totalRows,
    skippedRows: session.totalSkipped,
    duplicateCount,
    validationSummary: session.validationSummary,
    supportedFields: REQUIRED_CSV_COLUMNS,
  });
});

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

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
  'tripduration',
  'bike_id',
  'gender',
  'birth_year',
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
  member_casual: ['member_casual', 'member casual', 'user_type', 'user type', 'usertype', 'subscriber_type', 'customer_type', 'membership_type'],
  tripduration: ['tripduration', 'trip_duration', 'trip duration', 'duration', 'duration_sec', 'duration seconds'],
  bike_id: ['bike_id', 'bike id', 'bikeid', 'bike_number', 'bike number', 'vehicle_id', 'vehicle id'],
  gender: ['gender', 'sex'],
  birth_year: ['birth_year', 'birth year', 'birthyear', 'year_of_birth', 'year of birth', 'birth_date', 'birth date'],
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

const nullIfEmpty = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || ['\\n', '\\N', 'null', 'undefined', 'na', 'n/a'].includes(text.toLowerCase())) return null;
  return text;
};

const normalizeMemberType = (value) => {
  const text = nullIfEmpty(value);
  if (!text) return 'unknown';
  const normalized = text.toLowerCase().replace(/[\s_-]+/g, '');
  if (['member', 'subscriber', 'subscribers'].includes(normalized)) return 'member';
  if (['casual', 'customer', 'customers'].includes(normalized)) return 'casual';
  return text.toLowerCase();
};

const normalizeGender = (value) => {
  const text = nullIfEmpty(value);
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (['1', 'm', 'male'].includes(normalized)) return 'male';
  if (['2', 'f', 'female'].includes(normalized)) return 'female';
  if (['0', 'u', 'unknown'].includes(normalized)) return 'unknown';
  return normalized;
};

const getRideYear = (startedAt) => {
  const normalized = startedAt?.includes('T') ? startedAt : startedAt?.replace(' ', 'T');
  const year = normalized ? new Date(normalized).getFullYear() : NaN;
  return Number.isFinite(year) ? year : null;
};

const normalizeBirthYear = (value, startedAt) => {
  const text = nullIfEmpty(value);
  if (!text) return { birthYear: null, ageBand: null };
  const birthYear = parseInt(text, 10);
  const rideYear = getRideYear(startedAt);
  if (!Number.isInteger(birthYear) || !rideYear) return { birthYear: null, ageBand: null };

  const age = rideYear - birthYear;
  if (age < 10 || age > 100) return { birthYear: null, ageBand: null };
  if (age < 18) return { birthYear, ageBand: 'under_18' };
  if (age >= 80) return { birthYear, ageBand: '80_plus' };

  const decadeStart = Math.floor(age / 10) * 10;
  return { birthYear, ageBand: `${decadeStart}-${decadeStart + 9}` };
};

const normalizeDuration = (value) => {
  const text = nullIfEmpty(value);
  if (!text) return null;
  const duration = parseInt(text, 10);
  return Number.isInteger(duration) && duration >= 0 ? duration : null;
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

// Rows without ride_id still need a stable key so INSERT IGNORE can detect
// duplicates across chunks and re-uploads.
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

  // ride_id is optional because a stable hash is generated below.
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

  // Prefer the source ride_id when present; otherwise hash stable trip fields for deduplication.
  const finalRideId = explicitRideId || tripContentHash(startedAt, startLat, startLng, endLat, endLng);
  const { birthYear, ageBand } = normalizeBirthYear(getMappedValue(row, columnMap, 'birth_year'), startedAt);

  return {
    status: 'valid',
    trip: [
      finalRideId,
      nullIfEmpty(getMappedValue(row, columnMap, 'rideable_type')),
      startedAt,
      endedAt,
      nullIfEmpty(getMappedValue(row, columnMap, 'start_station_name')),
      nullIfEmpty(getMappedValue(row, columnMap, 'start_station_id')),
      nullIfEmpty(getMappedValue(row, columnMap, 'end_station_name')),
      nullIfEmpty(getMappedValue(row, columnMap, 'end_station_id')),
      startLat,
      startLng,
      endLat,
      endLng,
      normalizeMemberType(getMappedValue(row, columnMap, 'member_casual')),
      true,
      normalizeDuration(getMappedValue(row, columnMap, 'tripduration')),
      nullIfEmpty(getMappedValue(row, columnMap, 'bike_id')),
      normalizeGender(getMappedValue(row, columnMap, 'gender')),
      birthYear,
      ageBand,
    ],
  };
};

const insertTripChunk = async (chunk) => {
  if (chunk.length === 0) return { inserted: 0, duplicates: 0 };
  await tripMetadataColumnsReady;
  if (tripMetadataColumnsError) throw tripMetadataColumnsError;

  // INSERT IGNORE preserves existing trips and skips duplicate ride_id values.
  const query = `
    INSERT IGNORE INTO trips (
      ride_id, rideable_type, started_at, ended_at, start_station_name,
      start_station_id, end_station_name, end_station_id, start_lat, start_lng,
      end_lat, end_lng, member_casual, is_user_uploaded, tripduration,
      bike_id, gender, birth_year, age_band
    ) VALUES ?
  `;

  const [result] = await pool.query(query, [chunk]);
  // affectedRows counts only newly inserted rows.
  const inserted   = result.affectedRows;
  const duplicates = chunk.length - inserted;
  return { inserted, duplicates };
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

    // Keep a small insert pool so large files stream steadily without flooding MySQL.
    // INSERT IGNORE makes chunk order irrelevant for duplicate handling.
    const MAX_PARALLEL_INSERTS = 2;
    let activeInserts = 0;
    const insertErrors = [];

    const runInsert = (rowsToInsert, chunkNumber) => {
      activeInserts++;
      insertTripChunk(rowsToInsert)
        .then(({ inserted }) => {
          totalInserted += inserted;
          console.log(`Stream chunk ${chunkNumber}: inserted ${inserted}/${rowsToInsert.length} records`);
        })
        .catch((err) => insertErrors.push(err))
        .finally(() => { activeInserts--; });
    };

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

    await new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        reject(new Error(`Uploaded file not found at path: ${filePath}`));
        return;
      }

      console.log('Starting CSV parsing...');
      console.log('File path:', filePath);
      
      const parser = csvParser({
          separator: ',',
          skipEmptyLines: true,
          trim: true,
          ltrim: true,
          rtrim: true,
          mapHeaders: ({ header }) =>
            header?.replace(/^\uFEFF/, '').trim(),
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
            // Pause parsing when both DB insert slots are full.
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

    // Rows that passed validation but weren't inserted are duplicates already in the DB.
    const duplicatesEstimated = validRows - totalInserted;

    const validationDetails = formatValidationDetails(validationSummary);

    // Build a summary depending on whether anything was actually new.
    let message;
    if (totalInserted === 0) {
      message = 'All rows already exist in the database — nothing new was added. If you meant to replace the data, clear user data first and re-upload.';
    } else if (skippedRows > 0) {
      message = `Successfully uploaded ${totalInserted} records. ${skippedRows} rows were skipped${validationDetails ? ` (${validationDetails})` : ''}. ${duplicatesEstimated} duplicate records were ignored.`;
    } else {
      message = `Successfully uploaded ${totalInserted} records. ${duplicatesEstimated} duplicate records were ignored.`;
    }

    res.json({
      status: 'success',
      message,
      totalRecords: totalInserted,
      skippedRows,
      totalRows,
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

// Current delete-job state for resume/polling UI.
router.get('/delete-status', async (req, res) => {
  try {
    const [[job]] = await pool.query('SELECT status, total, deleted FROM delete_jobs WHERE id = 1');
    if (!job || job.status === 'done') return res.json({ status: 'idle' });
    res.json({ status: job.status, total: job.total, deleted: job.deleted });
  } catch {
    res.json({ status: 'idle' });
  }
});

router.delete('/user-data', async (req, res) => {
  // Reject a second concurrent delete before touching the response.
  try {
    const [[job]] = await pool.query('SELECT status FROM delete_jobs WHERE id = 1');
    if (job?.status === 'running') {
      return res.status(409).json({ error: 'A delete is already in progress' });
    }
  } catch { /* ignore — table may not exist yet on very first boot */ }

  // Stream batch progress to the browser with SSE.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Keep deleting after disconnect; just stop writing to the closed socket.
  let clientConnected = true;
  req.on('close', () => { clientConnected = false; });

  // Silently drops writes when the client has disconnected.
  const send = (data) => {
    if (!clientConnected) return;
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* socket closed */ }
  };

  const BATCH_SIZE = 5000;
  const MAX_DEADLOCK_RETRIES = 5;

  try {
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM trips WHERE is_user_uploaded = true'
    );

    send({ type: 'start', total });

    if (total === 0) {
      await pool.query(
        "INSERT INTO delete_jobs (id, status, total, deleted) VALUES (1,'done',0,0) " +
        "ON DUPLICATE KEY UPDATE status='done', total=0, deleted=0"
      );
      send({ type: 'done', deleted: 0, total: 0 });
      return res.end();
    }

    // Persist job as 'running' so a server restart can detect an interrupted delete.
    await pool.query(
      "INSERT INTO delete_jobs (id, status, total, deleted) VALUES (1,'running',?,0) " +
      "ON DUPLICATE KEY UPDATE status='running', total=?, deleted=0",
      [total, total]
    );

    let totalDeleted = 0;

    while (true) {
      // Retry each batch on deadlock with exponential back-off.
      let result;
      for (let attempt = 1; attempt <= MAX_DEADLOCK_RETRIES; attempt++) {
        try {
          [result] = await pool.query(
            'DELETE FROM trips WHERE is_user_uploaded = true LIMIT ?',
            [BATCH_SIZE]
          );
          break;
        } catch (err) {
          if (err.code === 'ER_LOCK_DEADLOCK' && attempt < MAX_DEADLOCK_RETRIES) {
            console.warn(`Delete deadlock on attempt ${attempt}, retrying…`);
            await new Promise(r => setTimeout(r, attempt * 300));
            continue;
          }
          throw err;
        }
      }

      totalDeleted += result.affectedRows;

      // Persist progress so the UI can poll it after navigating back.
      await pool.query('UPDATE delete_jobs SET deleted = ? WHERE id = 1', [totalDeleted]);
      send({ type: 'progress', deleted: totalDeleted, total });

      if (result.affectedRows < BATCH_SIZE) break;

      // Short yield between batches so other queries can slip in.
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    await pool.query("UPDATE delete_jobs SET status='done', deleted=? WHERE id=1", [totalDeleted]);
    send({ type: 'done', deleted: totalDeleted, total });
    if (clientConnected) res.end();
  } catch (error) {
    console.error('Delete error:', error);
    try {
      await pool.query("UPDATE delete_jobs SET status='interrupted' WHERE id=1");
    } catch { /* ignore */ }
    send({ type: 'error', message: error.message });
    if (clientConnected) res.end();
  }
});

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

const SAMPLES_DIR = path.join(process.cwd(), 'samples');

const SAMPLE_FILES = {
  standard: '202004-divvy-tripdata.csv',
  extended: 'JC-202605-citibike-tripdata.csv',
  hubway: '201501-hubway-tripdata.csv',
};

router.get('/sample-csv', (req, res) => {
  const type = req.query.type;

  // Serve real sample files from disk.
  if (SAMPLE_FILES[type]) {
    const filename = SAMPLE_FILES[type];
    const filepath = path.join(SAMPLES_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ status: 'error', message: `Sample file not found: ${filename}` });
    }

    const stat = fs.statSync(filepath);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    fs.createReadStream(filepath).pipe(res);
    return;
  }

  // Minimal sample \u2014 generated inline (no real file needed).
  try {
    const csvContent = [
      'started_at,ended_at,start_lat,start_lng,end_lat,end_lng',
      '2024-01-15 08:23:11,2024-01-15 08:37:42,40.7127,-74.0059,40.7282,-73.9942',
      '2024-01-15 09:01:55,2024-01-15 09:14:30,40.7282,-73.9942,40.7489,-73.9680',
      '2024-01-15 09:45:00,2024-01-15 10:02:17,40.7489,-73.9680,40.7580,-73.9855',
      '2024-01-15 10:30:22,2024-01-15 10:44:55,40.7580,-73.9855,40.7127,-74.0059',
      '2024-01-15 11:05:10,2024-01-15 11:19:48,40.7350,-73.9910,40.7210,-74.0020',
    ].join('\n');

    const bom = '\uFEFF';
    const body = Buffer.from(bom + csvContent, 'utf8');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sample-minimal.csv"');
    res.setHeader('Content-Length', body.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(body);
  } catch (error) {
    console.error('Sample CSV error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to generate sample CSV', error: error.message });
  }
});

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
