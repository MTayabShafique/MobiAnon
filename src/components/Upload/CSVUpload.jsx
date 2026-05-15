import React, { useState, useEffect } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, notification, Progress,
  Row, Space, Switch, Tag, Tooltip, Typography, Upload,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, DatabaseOutlined,
  DeleteOutlined, DownloadOutlined, InfoCircleOutlined,
  QuestionCircleOutlined, UploadOutlined, WarningOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;
const UPLOAD_DATA_SOURCE_KEY = 'bicycleUploadDataSource';
const API = 'http://localhost:5000';

// RL2: Phase labels for the upload lifecycle
const PHASES = {
  idle:        { label: '',                  percent: 0   },
  transferring:{ label: 'Sending file…',     percent: null }, // dynamic
  processing:  { label: 'Processing rows…',  percent: 99  },
  done:        { label: 'Complete',          percent: 100 },
};

const HelpIcon = ({ text }) => (
  <Tooltip title={text} placement="right">
    <QuestionCircleOutlined style={{ marginLeft: 5, cursor: 'help', opacity: 0.55, fontSize: 12 }} />
  </Tooltip>
);

const CSVUpload = ({ onDataSourceChange }) => {
  const [fileList,   setFileList]   = useState([]);
  const [phase,      setPhase]      = useState('idle');
  const [xferPct,    setXferPct]    = useState(0);
  const [dataSource, setDataSource] = useState(
    localStorage.getItem(UPLOAD_DATA_SOURCE_KEY) || 'preloaded'
  );
  const [dataInfo,     setDataInfo]     = useState({ preloaded: 0, userUploaded: 0, bounds: {} });
  const [uploadResult, setUploadResult] = useState(null);

  useEffect(() => { fetchDataSources(); }, []);

  const fetchDataSources = async () => {
    try {
      const { data } = await axios.get(`${API}/api/upload/data-sources`);
      setDataInfo(data.data);
    } catch {
      // Non-fatal — counts stay at 0
    }
  };

  // RL2: Track both the HTTP transfer phase (onUploadProgress) and the
  // server-side streaming/insert phase (after 100% transfer) separately so
  // the user always knows what stage the system is at.
  const handleUpload = async () => {
    const formData = new FormData();
    fileList.forEach((file) => formData.append('csvFile', file));

    setPhase('transferring');
    setXferPct(0);
    setUploadResult(null);

    try {
      const response = await axios.post(`${API}/api/upload/csv`, formData, {
        onUploadProgress: (evt) => {
          if (evt.total) {
            const pct = Math.min(98, Math.round((evt.loaded * 100) / evt.total));
            setXferPct(pct);
            if (pct >= 98) setPhase('processing');
          }
        },
      });

      setPhase('done');
      setUploadResult(response.data);

      const inserted = Number(response.data.totalRecords || 0);
      if (inserted === 0) {
        notification.info({
          message: 'No new records',
          description: response.data.message || 'All rows were already uploaded.',
          icon: <InfoCircleOutlined style={{ color: '#1677ff' }} />,
        });
      } else {
        notification.success({
          message: `${inserted.toLocaleString()} records imported`,
          description: response.data.message,
          icon: <CheckCircleOutlined style={{ color: '#16a34a' }} />,
        });
      }

      setFileList([]);
      fetchDataSources();
    } catch (error) {
      setPhase('idle');
      const apiMsg = error.response?.data?.message;
      const status = error.response?.status;
      setUploadResult(error.response?.data ?? { status: 'error', message: apiMsg || 'Upload failed' });

      if (status === 400) {
        notification.warning({
          message: 'Validation error',
          description: apiMsg || 'The file did not pass validation. Check the required fields.',
          icon: <WarningOutlined style={{ color: '#b45309' }} />,
          duration: 8,
        });
      } else {
        notification.error({
          message: 'Upload failed',
          description: apiMsg || 'A server error occurred. Make sure the backend is running.',
          icon: <CloseCircleOutlined style={{ color: '#dc2626' }} />,
          duration: 8,
        });
      }
    }
  };

  const handleDataSourceChange = (checked) => {
    const next = checked ? 'user' : 'preloaded';
    setDataSource(next);
    localStorage.setItem(UPLOAD_DATA_SOURCE_KEY, next);
    onDataSourceChange?.(next);
  };

  const handleDeleteUserData = async () => {
    try {
      const { data } = await axios.delete(`${API}/api/upload/user-data`);
      notification.success({ message: `Deleted ${data.deletedCount} user records` });
      fetchDataSources();
      if (dataSource === 'user') {
        setDataSource('preloaded');
        localStorage.setItem(UPLOAD_DATA_SOURCE_KEY, 'preloaded');
        onDataSourceChange?.('preloaded');
      }
    } catch {
      notification.error({ message: 'Failed to delete user data' });
    }
  };

  const downloadSampleCSV = async () => {
    try {
      const response = await axios.get(`${API}/api/upload/sample-csv`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url  = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sample-bicycle-data.csv';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 100);
      notification.success({ message: 'Sample CSV downloaded' });
    } catch {
      notification.error({ message: 'Failed to download sample CSV' });
    }
  };

  const uploadProps = {
    onRemove: () => { setFileList([]); setUploadResult(null); },
    beforeUpload: (file) => {
      if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
        notification.error({ message: 'Only CSV files are accepted' });
        return false;
      }
      if (file.size / 1024 / 1024 > 250) {
        notification.error({ message: 'File must be smaller than 250 MB' });
        return false;
      }
      setFileList([file]);
      setUploadResult(null);
      setPhase('idle');
      return false;
    },
    fileList,
    customRequest: () => {},
    maxCount: 1,
  };

  const isUploading = phase === 'transferring' || phase === 'processing';
  const progressPct = phase === 'transferring' ? xferPct : PHASES[phase].percent;
  const progressStatus = phase === 'done' ? 'success' : phase === 'idle' ? 'normal' : 'active';
  const userBounds = dataInfo?.bounds?.user;

  return (
    <Card
      title={
        <Space>
          <UploadOutlined />
          <span>Data Management</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Row gutter={[24, 24]}>

        {/* ── Upload section ── */}
        <Col span={24}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>

            <div>
              <Title level={5} style={{ marginBottom: 4 }}>Upload Your Dataset</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Upload any bike-share or point-to-point mobility CSV. Citi Bike headers and common aliases
                (start_time, start_latitude, start_lon, …) are auto-detected. Files up to 250 MB are accepted.
              </Paragraph>
            </div>

            {/* Info banner explaining what happens to uploaded data */}
            <Alert
              type="info"
              showIcon
              icon={<InfoCircleOutlined />}
              message="How uploaded data is stored"
              description={
                <span>
                  Rows are streamed directly into the local MySQL database and tagged as user-uploaded.
                  They are isolated from the preloaded Citi Bike data and can be cleared at any time.
                  Identical trips (same start time + coordinates) are automatically de-duplicated.
                </span>
              }
            />

            {/* Required fields reminder */}
            <Alert
              type="warning"
              showIcon
              message="Required fields"
              description={
                <span>
                  <strong>started_at, ended_at, start_lat, start_lng, end_lat, end_lng</strong> must be present
                  (any supported alias is fine). <strong>ride_id</strong> is optional, a deterministic
                  hash is generated when it is missing so re-uploads do not create duplicates.
                </span>
              }
            />

            <Space wrap>
              <Button icon={<DownloadOutlined />} onClick={downloadSampleCSV}>
                Download Sample CSV
              </Button>
            </Space>

            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} disabled={isUploading}>
                Select CSV File
              </Button>
            </Upload>

            <Button
              type="primary"
              onClick={handleUpload}
              disabled={fileList.length === 0 || isUploading}
              loading={isUploading}
              icon={<UploadOutlined />}
            >
              {isUploading ? PHASES[phase].label : 'Upload CSV'}
            </Button>

            {/* RL2: Progress bar — visible during transfer and server-side processing */}
            {phase !== 'idle' && (
              <div className="upload-progress-block">
                <div className="upload-progress-label">
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {phase === 'transferring' && `Sending file… ${xferPct}%`}
                    {phase === 'processing'   && 'Streaming rows into database…'}
                    {phase === 'done'         && 'Import complete'}
                  </Text>
                </div>
                <Progress
                  percent={progressPct ?? 99}
                  status={progressStatus}
                  strokeColor={
                    phase === 'done'
                      ? '#16a34a'
                      : { from: '#1677ff', to: '#0ea5e9' }
                  }
                  size="small"
                />
              </div>
            )}

            {/* Upload result details */}
            {uploadResult && (
              <Alert
                type={uploadResult.status === 'success' ? 'success' : 'warning'}
                showIcon
                closable
                message={uploadResult.message}
                description={
                  <Descriptions size="small" column={2} style={{ marginTop: 8 }}>
                    {'totalRows' in uploadResult && (
                      <Descriptions.Item label="Rows read">{uploadResult.totalRows?.toLocaleString()}</Descriptions.Item>
                    )}
                    {'totalRecords' in uploadResult && (
                      <Descriptions.Item label="New records added">
                        <Tag color="green">{uploadResult.totalRecords?.toLocaleString()}</Tag>
                      </Descriptions.Item>
                    )}
                    {'duplicateCount' in uploadResult && (
                      <Descriptions.Item label="Duplicates ignored">{uploadResult.duplicateCount?.toLocaleString()}</Descriptions.Item>
                    )}
                    {'skippedRows' in uploadResult && (
                      <Descriptions.Item label="Rows skipped">{uploadResult.skippedRows?.toLocaleString()}</Descriptions.Item>
                    )}
                    {uploadResult.validationSummary && Object.values(uploadResult.validationSummary).some(Boolean) && (
                      <Descriptions.Item label="Skip reasons" span={2}>
                        {[
                          uploadResult.validationSummary.missingRequiredValues && `${uploadResult.validationSummary.missingRequiredValues} missing values`,
                          uploadResult.validationSummary.invalidDateRows       && `${uploadResult.validationSummary.invalidDateRows} invalid dates`,
                          uploadResult.validationSummary.invalidCoordinateRows && `${uploadResult.validationSummary.invalidCoordinateRows} bad coordinates`,
                          uploadResult.validationSummary.emptyRows             && `${uploadResult.validationSummary.emptyRows} empty rows`,
                        ].filter(Boolean).join(' · ')}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                }
              />
            )}
          </Space>
        </Col>

        {/* ── Data source toggle ── */}
        <Col span={24}>
          <div style={{ borderTop: '1px solid var(--app-border)', paddingTop: 20 }}>
            <Title level={5} style={{ marginBottom: 12 }}>
              Active Data Source
              <HelpIcon text="This preference is remembered in the browser. After uploading, switch to 'User Data' then go to the Tool page to visualize it." />
            </Title>

            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div className="datasource-toggle-row">
                <Tag color={dataSource === 'preloaded' ? 'blue' : 'default'}>
                  Preloaded ({(dataInfo.preloaded ?? dataInfo.bounds?.preloaded?.count ?? 0).toLocaleString()} records)
                </Tag>
                <Switch
                  checked={dataSource === 'user'}
                  onChange={handleDataSourceChange}
                  checkedChildren="User"
                  unCheckedChildren="Pre"
                />
                <Tag color={dataSource === 'user' ? 'green' : 'default'}>
                  User data ({(dataInfo.userUploaded ?? dataInfo.bounds?.user?.count ?? 0).toLocaleString()} records)
                </Tag>
              </div>

              {/* Date range info for uploaded data */}
              {userBounds?.minDate && userBounds?.maxDate && (
                <Alert
                  type="info"
                  icon={<DatabaseOutlined />}
                  showIcon
                  message={`Uploaded data covers ${userBounds.minDate?.slice(0, 10)} → ${userBounds.maxDate?.slice(0, 10)}`}
                  description="The Tool page date picker will automatically adjust to this range when User Data is selected."
                />
              )}

              {/* No user data warning */}
              {(dataInfo.userUploaded ?? 0) === 0 && dataSource === 'user' && (
                <Alert
                  type="warning"
                  showIcon
                  message="No user data loaded"
                  description="Upload a CSV file above first, then switch to User Data."
                />
              )}

              {(dataInfo.userUploaded ?? dataInfo.bounds?.user?.count ?? 0) > 0 && (
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleDeleteUserData}
                >
                  Clear All User Data
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
