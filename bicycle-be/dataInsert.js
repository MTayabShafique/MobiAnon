import fs from 'fs';
import csvParser from 'csv-parser';
import { pool } from './db/dbConfig.js';

// Path to the CSV file
const filePath = './202401-citibike-tripdata.csv';

/**
 * Reads a CSV file and inserts data into the MySQL database, handling null values properly.
 */
const insertTripsFromCSV = async () => {
  try {
    const trips = [];

    console.log(`Reading CSV file from ${filePath}...`);

    // Read the CSV file
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (row) => {
          trips.push([
            row.ride_id || null,
            row.rideable_type || null,
            row.started_at || null,
            row.ended_at || null,
            row.start_station_name || null,
            row.start_station_id || null,
            row.end_station_name || null,
            row.end_station_id || null,
            row.start_lat ? parseFloat(row.start_lat) : null,
            row.start_lng ? parseFloat(row.start_lng) : null,
            row.end_lat ? parseFloat(row.end_lat) : null,
            row.end_lng ? parseFloat(row.end_lng) : null,
            row.member_casual || null,
          ]);
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`CSV file read successfully. Preparing to insert ${trips.length} records into MySQL.`);

    // Insert data into MySQL in chunks
    const chunkSize = 1000;
    for (let i = 0; i < trips.length; i += chunkSize) {
      const chunk = trips.slice(i, i + chunkSize);

      const query = `
        INSERT INTO trips (
          ride_id, rideable_type, started_at, ended_at, start_station_name, 
          start_station_id, end_station_name, end_station_id, start_lat, start_lng, 
          end_lat, end_lng, member_casual
        ) VALUES ?
      `;

      try {
        await pool.query(query, [chunk]);
        console.log(`Inserted ${chunk.length} records successfully.`);
      } catch (insertError) {
        console.error('Error inserting chunk into MySQL:', insertError);
      }
    }

    console.log('Data insertion process completed.');
  } catch (error) {
    console.error('Error processing CSV file:', error);
  } finally {
    await pool.end();
    console.log('Database connection pool closed.');
  }
};

// Run the function
insertTripsFromCSV();
