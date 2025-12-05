import React from 'react';
import CSVUpload from '../components/Upload/CSVUpload';

const Upload = () => {
  const handleDataSourceChange = (dataSource) => {
    // This will be used to communicate with the map component
    console.log('Data source changed to:', dataSource);
  };

  return (
    <div style={{ padding: '24px' }}>
      <h1>Upload Your Data</h1>
      <p>Upload your own bicycle trip data to test the anonymization features.</p>
      <CSVUpload onDataSourceChange={handleDataSourceChange} />
    </div>
  );
};

export default Upload; 