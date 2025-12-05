-- Add is_user_uploaded column to existing trips table
ALTER TABLE trips ADD COLUMN is_user_uploaded BOOLEAN DEFAULT FALSE;

-- Create index for better performance when filtering user data
CREATE INDEX idx_is_user_uploaded ON trips(is_user_uploaded);

-- Sample data to demonstrate the structure (optional)
-- This shows what the CSV should look like
-- ride_id,rideable_type,started_at,ended_at,start_station_name,start_station_id,end_station_name,end_station_id,start_lat,start_lng,end_lat,end_lng,member_casual 