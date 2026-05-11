import React from 'react';
import { Space, Typography } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import CSVUpload from '../components/Upload/CSVUpload';

const { Paragraph, Title } = Typography;

const Upload = () => {
  const handleDataSourceChange = (dataSource) => {
    console.log('Data source changed to:', dataSource);
  };

  return (
    <div className="upload-page">
      <section className="tool-hero">
        <div className="tool-hero-body">
          <Space size={8} className="hero-kicker">
            <CloudUploadOutlined />
            <span>Data ingestion</span>
          </Space>
          <Title level={2} style={{ margin: '8px 0 6px' }}>Upload Your Dataset</Title>
          <Paragraph type="secondary" style={{ fontSize: 14, margin: 0 }}>
            Upload any bike-share or point-to-point mobility CSV. Citi Bike headers and
            common column aliases are auto-detected. Files up to 250 MB are accepted.
          </Paragraph>
        </div>
      </section>

      <CSVUpload onDataSourceChange={handleDataSourceChange} />
    </div>
  );
};

export default Upload;
