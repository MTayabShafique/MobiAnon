# 2024-MA-Haris-Mustafa

# Bicycle Trip Data Visualization

A full-stack application for visualizing bicycle trip data in New York City. Built with React, Node.js, and MySQL.

## Windows Setup Guide

### Prerequisites

1. **Install XAMPP**
   - Download XAMPP from [https://www.apachefriends.org/](https://www.apachefriends.org/)
   - Install with default options (ensure MySQL and Apache are selected)
   - Installation path should be `C:\xampp` (default)

2. **Install Node.js**
   - Download Node.js LTS version from [https://nodejs.org/](https://nodejs.org/)
   - Install with default options
   - Verify installation by opening Command Prompt and running:
     ```bash
     node --version
     npm --version
     ```

### Database Setup

1. **Start MySQL**
   - Open XAMPP Control Panel
   - Start MySQL service
   - Start Apache service (for phpMyAdmin)

2. **Create Database**
   - Open browser and go to [http://localhost/phpmyadmin](http://localhost/phpmyadmin)
   - Click "New" on the left sidebar
   - Create database named `bicycle_data`

3. **Create Table**
   ```sql
   CREATE TABLE trips (
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
     member_casual VARCHAR(20),
     is_user_uploaded BOOLEAN DEFAULT FALSE
   );

   -- Create index for better performance
   CREATE INDEX idx_is_user_uploaded ON trips(is_user_uploaded);
   ```

### Project Setup

1. **Clone Repository**
   - Open Command Prompt
   - Navigate to desired directory
   - Clone the repository:
     ```bash
     git clone git@gitlab.rz.uni-bamberg.de:mobi/theses/2024-ma-haris-mustafa.git
     cd bicycle-fe
     ```

2. **Install Dependencies and Start Application**
   ```bash
   # Install all dependencies (both frontend and backend)
   npm install

   # Start the application (this will start both frontend and backend)
   npm run dev
   ```

### Loading Initial Data

1. **Download Sample Data**
   - Download CitiBike trip data CSV file
   - Rename it to `202401-citibike-tripdata.csv`
   - Place it in the `bicycle-be` folder

2. **Run Data Import Script**
   ```bash
   # From bicycle-be directory
   node dataInsert.js
   ```

### Running the Application

1. **Start the Application**
   ```bash
   # From project root directory
   npm run dev
   ```
   This will automatically start both the frontend and backend servers.

2. **Access the Application**
   - Open browser and go to [http://localhost:5173](http://localhost:5173)
   - The backend will be running on port 5000

### Troubleshooting

1. **XAMPP Issues**
   - Ensure MySQL is running in XAMPP Control Panel
   - Default MySQL port is 3306
   - If port conflicts occur, check Task Manager for processes using port 3306

2. **Database Connection Issues**
   - Verify database name is `bicycle_data`
   - Check .env file has correct credentials
   - Default XAMPP MySQL credentials:
     - Username: root
     - Password: (empty)

3. **File Upload Issues**
   - Check if `uploads` directory exists in `bicycle-be`
   - Ensure Windows user has write permissions
   - Try running Command Prompt as Administrator

4. **Node.js Issues**
   - Clear npm cache: `npm cache clean --force`
   - Delete node_modules and reinstall: 
     ```bash
     rm -rf node_modules
     npm install
     ```

### Notes

- The application requires both frontend and backend servers to be running simultaneously
- Sample CSV data must be within New York City coordinates
- XAMPP's MySQL is recommended for Windows, but any MySQL server will work with proper configuration
- Keep the backend server running for continuous data upload/download functionality