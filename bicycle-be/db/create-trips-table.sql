CREATE DATABASE IF NOT EXISTS bicycle_data;
USE bicycle_data;

CREATE TABLE IF NOT EXISTS trips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ride_id VARCHAR(255) UNIQUE,
  rideable_type VARCHAR(50),
  started_at DATETIME,
  ended_at DATETIME,
  start_station_name VARCHAR(255),
  start_station_id VARCHAR(50),
  end_station_name VARCHAR(255),
  end_station_id VARCHAR(50),
  start_lat DECIMAL(10, 8),
  start_lng DECIMAL(11, 8),
  end_lat DECIMAL(10, 8),
  end_lng DECIMAL(11, 8),
  member_casual VARCHAR(50),
  tripduration INT NULL,
  bike_id VARCHAR(100) NULL,
  gender VARCHAR(50) NULL,
  birth_year SMALLINT NULL,
  age_band VARCHAR(20) NULL,
  is_user_uploaded BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_is_user_uploaded ON trips(is_user_uploaded);
