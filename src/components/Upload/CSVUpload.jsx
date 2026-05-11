import React, { useState, useEffect } from 'react';
import { Upload, Button, message, Card, Row, Col, Switch, Space, Typography, Alert, Descriptions, Tooltip } from 'antd';
import { UploadOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;
const UPLOAD_DATA_SOURCE_KEY = 'bicycleUploadDataSource';

const CSVUpload = ({ onDataSourceChange }) => {
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dataSource, setDataSource] = useState(
    localStorage.getItem(UPLOAD_DATA_SOURCE_KEY) || 'preloaded'
  ); // 'preloaded' or 'user'
  const [dataInfo, setDataInfo] = useState({ preloaded: 0, userUploaded: 0 });
  const [uploadResult, setUploadResult] = useState(null);

  useEffect(() => {
    fetchDataSources();
  }, []);

  const fetchDataSources = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/upload/data-sources');
      setDataInfo(response.data.data);
    } catch (error) {
      console.error('Error fetching data sources:', error);
    }
  };

  const handleUpload = async () => {
    console.log('File list:', fileList);
    const formData = new FormData();
    fileList.forEach((file) => {
      // Use the file object directly since beforeUpload returns false
      console.log('Adding file to form data:', file);
      formData.append('csvFile', file);
    });

    setUploading(true);
    setUploadResult(null);

    try {
      console.log('Sending request to:', 'http://localhost:5000/api/upload/csv');
      console.log('FormData entries:');
      for (let [key, value] of formData.entries()) {
        console.log(key, value);
      }
      const response = await axios.post('http://localhost:5000/api/upload/csv', formData);

      if (response.data.status === 'success') {
        const inserted = Number(response.data.totalRecords || 0);
        const apiMsg = response.data.message;
        setUploadResult(response.data);

        if (inserted === 0) {
          message.info(apiMsg || 'No new records were added. The file seems to be already uploaded.');
        } else {
          message.success(apiMsg || `Successfully uploaded ${inserted} records!`);
        }

        setFileList([]);
        fetchDataSources(); // Refresh data counts
      } else {
        message.error(response.data.message || 'Upload failed');
      }
    } catch (error) {
      const status = error.response?.status;
      const apiMessage = error.response?.data?.message;
      setUploadResult(error.response?.data || {
        status: 'error',
        message: apiMessage || 'Upload failed due to a server error.',
      });

      if (status === 400) {
        // Expected validation failure (bad file / no valid rows)
        message.warning(apiMessage || 'Invalid CSV file. Please check the format and try again.');
        return;
      }

      // Unexpected error (server down, bug, etc.)
      console.error('Upload error:', error);
      message.error(apiMessage || 'Upload failed due to a server error.');
    } finally {
      setUploading(false);
    }
  };

  const handleDataSourceChange = (checked) => {
    const newDataSource = checked ? 'user' : 'preloaded';
    setDataSource(newDataSource);
    localStorage.setItem(UPLOAD_DATA_SOURCE_KEY, newDataSource);
    onDataSourceChange(newDataSource);
  };

  const handleDeleteUserData = async () => {
    try {
      const response = await axios.delete('http://localhost:5000/api/upload/user-data');
      if (response.data.status === 'success') {
        message.success(`Deleted ${response.data.deletedCount} user records`);
        fetchDataSources();
        if (dataSource === 'user') {
          setDataSource('preloaded');
          localStorage.setItem(UPLOAD_DATA_SOURCE_KEY, 'preloaded');
          onDataSourceChange('preloaded');
        }
      }
    } catch (error) {
      console.error('Delete error:', error);
      message.error('Failed to delete user data');
    }
  };

  const downloadSampleCSV = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/upload/sample-csv', {
        responseType: 'blob'
      });
      
      // Create blob with proper MIME type for Windows compatibility
      const blob = new Blob([response.data], { 
        type: 'text/csv;charset=utf-8;' 
      });
      
      // Windows-compatible download approach
      if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        // For IE/Edge on Windows
        window.navigator.msSaveOrOpenBlob(blob, 'sample-bicycle-data.csv');
      } else {
        // For modern browsers (including Chrome on Windows)
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'sample-bicycle-data.csv';
        link.style.display = 'none';
        
        // Ensure the link is properly added and removed
        document.body.appendChild(link);
        link.click();
        
        // Clean up - use setTimeout to ensure download starts
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 100);
      }
      
      message.success('Sample CSV downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      message.error('Failed to download sample CSV. Please try again.');
    }
  };

  const uploadProps = {
    onRemove: (file) => {
      const index = fileList.indexOf(file);
      const newFileList = fileList.slice();
      newFileList.splice(index, 1);
      setFileList(newFileList);
    },
    beforeUpload: (file) => {
      const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');
      if (!isCSV) {
        message.error('You can only upload CSV files!');
        return false;
      }
      const isLt250M = file.size / 1024 / 1024 < 250;
      if (!isLt250M) {
        message.error('File must be smaller than 250MB!');
        return false;
      }
      setFileList([file]);
      setUploadResult(null);
      return false;
    },
    fileList,
    // Disable automatic upload
    customRequest: () => {},
  };

  return (
    <Card title="Data Management" style={{ marginBottom: 16 }}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Title level={5}>Upload Your Data</Title>
              <Text type="secondary">
                Upload a bike-share or mobility CSV with start/end times and coordinates. Citi Bike headers and common aliases such as start_time, start_latitude, start_lon, end_time, end_latitude, and end_lon are supported.
              </Text>
            </div>
            <Text type="secondary">
              Required fields: started_at, ended_at, start_lat, start_lng, end_lat, end_lng. ride_id is optional; generated IDs are used when it is missing.
            </Text>

            <Space>
              <Button 
                icon={<DownloadOutlined />} 
                onClick={downloadSampleCSV}
              >
                Download Sample CSV
              </Button>
            </Space>

            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>Select CSV File</Button>
            </Upload>

            <Button
              type="primary"
              onClick={handleUpload}
              disabled={fileList.length === 0}
              loading={uploading}
              icon={<UploadOutlined />}
            >
              {uploading ? 'Uploading' : 'Upload CSV'}
            </Button>

            {uploadResult && (
              <Alert
                type={uploadResult.status === 'success' ? 'success' : 'warning'}
                showIcon
                message={uploadResult.message}
                description={
                  <Descriptions size="small" column={1}>
                    {'totalRows' in uploadResult && (
                      <Descriptions.Item label="Rows read">
                        {uploadResult.totalRows}
                      </Descriptions.Item>
                    )}
                    {'totalRecords' in uploadResult && (
                      <Descriptions.Item label="New records added">
                        {uploadResult.totalRecords}
                      </Descriptions.Item>
                    )}
                    {'duplicateCount' in uploadResult && (
                      <Descriptions.Item label="Duplicate rows ignored">
                        {uploadResult.duplicateCount}
                      </Descriptions.Item>
                    )}
                    {'skippedRows' in uploadResult && (
                      <Descriptions.Item label="Rows skipped">
                        {uploadResult.skippedRows}
                      </Descriptions.Item>
                    )}
                    {uploadResult.validationSummary && (
                      <Descriptions.Item label="Validation details">
                        Missing values: {uploadResult.validationSummary.missingRequiredValues || 0};
                        invalid dates: {uploadResult.validationSummary.invalidDateRows || 0};
                        invalid/out-of-range coordinates: {uploadResult.validationSummary.invalidCoordinateRows || 0};
                        empty rows: {uploadResult.validationSummary.emptyRows || 0}
                      </Descriptions.Item>
                    )}
                    {uploadResult.requiredColumns && (
                      <Descriptions.Item label="Required columns">
                        {uploadResult.requiredColumns.join(', ')}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                }
              />
            )}
          </Space>
        </Col>

        <Col span={24}>
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Title level={5}>
              Data Source Toggle{' '}
              <Tooltip title="This switch is remembered locally. Choose user data after uploading rows, then use the Tool page Data Source filter to visualize it.">
                <span style={{ cursor: 'help', fontSize: 14 }}>?</span>
              </Tooltip>
            </Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text>Use Pre-loaded Data</Text>
                <Switch 
                  checked={dataSource === 'user'}
                  onChange={handleDataSourceChange}
                  style={{ marginLeft: 8 }}
                />
                <Text style={{ marginLeft: 8 }}>
                  Use User Uploaded Data ({dataInfo.userUploaded} records)
                </Text>
              </div>

              <div>
                <Text>Pre-loaded Data: {dataInfo.preloaded} records</Text>
                <br />
                <Text>User Data: {dataInfo.userUploaded} records</Text>
              </div>

              {dataInfo.userUploaded > 0 && (
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleDeleteUserData}
                >
                  Clear User Data
                </Button>
              )}
            </Space>
          </div>
        </Col>
      </Row>
    </Card>
  );
};

export default CSVUpload; 
