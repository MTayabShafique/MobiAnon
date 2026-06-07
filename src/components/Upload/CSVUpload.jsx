import React, { useState, useEffect } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, notification, Popover, Progress,
  Row, Space, Switch, Tag, Tooltip, Typography, Upload,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, DatabaseOutlined,
  DeleteOutlined, DownloadOutlined, FileTextOutlined, InfoCircleOutlined,
  QuestionCircleOutlined, ReloadOutlined, UploadOutlined, WarningOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import useDataSources from '../../hooks/useDataSources';

const { Title, Text, Paragraph } = Typography;
const UPLOAD_DATA_SOURCE_KEY = 'bicycleUploadDataSource';
const RESUME_SESSION_KEY     = 'bicycleUploadSession';
const API = 'http://localhost:5000';

// 5k-row chunks keep requests small while cutting upload round-trips.
const CHUNK_ROWS   = 5000;
const MAX_RETRIES  = 3;

const PHASES = {
  idle:        { label: '',                        percent: 0   },
  reading:     { label: 'Reading file…',           percent: null },
  transferring:{ label: 'Uploading…',              percent: null },
  processing:  { label: 'Finalizing…',             percent: 99  },
  done:        { label: 'Complete',                percent: 100 },
};

// Fingerprint built from file metadata only (instant, no content read needed).
const fileFingerprint = (file) => `${file.name}-${file.size}-${file.lastModified}`;

// Build self-contained CSV chunks so each one can be retried independently.
const splitCSVIntoChunks = (text, rowsPerChunk) => {
  const lines  = text.split('\n');
  const header = lines[0];
  const data   = lines.slice(1).filter((l) => l.trim() !== '');
  const chunks = [];
  for (let i = 0; i < data.length; i += rowsPerChunk) {
    chunks.push(header + '\n' + data.slice(i, i + rowsPerChunk).join('\n'));
  }
  return chunks;
};

// Upload one chunk as plain text with automatic retry and exponential back-off.
const uploadChunk = async (sessionId, chunkIndex, csvText) => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.post(
        `${API}/api/upload/session/${sessionId}/chunk?chunkIndex=${chunkIndex}`,
        csvText,
        { headers: { 'Content-Type': 'text/plain' }, timeout: 90_000 }
      );
      return data;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      // Wait a little longer before each retry so a flaky connection has time to recover.
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
};

const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const SAMPLE_CSVS = [
  {
    key: 'minimal',
    label: 'Minimal',
    tag: 'blue',
    description: 'Required fields only — the smallest valid format the system accepts.',
    columns: 'started_at · ended_at · start_lat · start_lng · end_lat · end_lng',
    filename: 'sample-minimal.csv',
    source: 'client',
    content: [
      'started_at,ended_at,start_lat,start_lng,end_lat,end_lng',
      '2024-01-15 08:23:11,2024-01-15 08:37:42,40.7127,-74.0059,40.7282,-73.9942',
      '2024-01-15 09:01:55,2024-01-15 09:14:30,40.7282,-73.9942,40.7489,-73.9680',
      '2024-01-15 09:45:00,2024-01-15 10:02:17,40.7489,-73.9680,40.7580,-73.9855',
      '2024-01-15 10:30:22,2024-01-15 10:44:55,40.7580,-73.9855,40.7127,-74.0059',
      '2024-01-15 11:05:10,2024-01-15 11:19:48,40.7350,-73.9910,40.7210,-74.0020',
    ].join('\n'),
  },
  {
    key: 'standard',
    label: 'Standard (Divvy)',
    tag: 'green',
    description: 'Chicago Divvy 2020 dataset — single rideable type (docked_bike), mix of member and casual riders. Good for basic k-anonymity experiments.',
    columns: 'ride_id · rideable_type · started_at · ended_at · start_station_name · start_station_id · end_station_name · end_station_id · start_lat · start_lng · end_lat · end_lng · member_casual',
    filename: '202004-divvy-tripdata.csv',
    source: 'backend',
  },
  {
    key: 'extended',
    label: 'Extended (Citi Bike)',
    tag: 'purple',
    description: 'Jersey City Citi Bike 2026 dataset — two rideable types (electric_bike, classic_bike), both member and casual. Best for ℓ-diversity experiments requiring bike-type diversity.',
    columns: 'ride_id · rideable_type · started_at · ended_at · start_station_name · start_station_id · end_station_name · end_station_id · start_lat · start_lng · end_lat · end_lng · member_casual',
    filename: 'JC-202605-citibike-tripdata.csv',
    source: 'backend',
  },
];

const downloadCSV = (filename, content) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
};

const HelpIcon = ({ text }) => (
  <Tooltip title={text} placement="right" overlayClassName="help-tooltip">
    <QuestionCircleOutlined style={{ marginLeft: 5, cursor: 'help', opacity: 0.55, fontSize: 12 }} />
  </Tooltip>
);

const CSVUpload = ({ onDataSourceChange }) => {
  const [fileList,      setFileList]      = useState([]);
  const [phase,         setPhase]         = useState('idle');
  const [xferPct,       setXferPct]       = useState(0);
  const [chunkProgress, setChunkProgress] = useState({ done: 0, total: 0 });
  const [dataSource,    setDataSource]    = useState(
    localStorage.getItem(UPLOAD_DATA_SOURCE_KEY) || 'preloaded'
  );
  // Instant on first render (reads localStorage cache), then revalidates from API.
  const { dataSourceInfo: dataInfo, refreshDataSources: fetchDataSources } = useDataSources();

  const [uploadResult, setUploadResult] = useState(null);

  // Holds info about an interrupted session — shown as a resume banner on page load.
  const [pendingSession,  setPendingSession]  = useState(null);
  // True when the currently selected file can continue a previous interrupted upload.
  const [isInterrupted,   setIsInterrupted]   = useState(false);

  // Delete progress — { deleted, total } while Clear All User Data is running.
  const [deleteProgress, setDeleteProgress] = useState(null);
  // Server-backed delete state used for resume UI.
  const [deleteServerStatus, setDeleteServerStatus] = useState('idle');

  // Live count during upload/delete; null falls back to cached dataInfo.
  const [liveUserCount, setLiveUserCount] = useState(null);

  // Poll while a background delete is running.
  useEffect(() => {
    if (deleteServerStatus !== 'running') return;
    let active = true;
    let timer  = null;

    const poll = async () => {
      try {
        const res  = await fetch(`${API}/api/upload/delete-status`);
        const data = await res.json();
        if (!active) return;
        setDeleteServerStatus(data.status);
        if (data.status === 'running') {
          setDeleteProgress({ deleted: data.deleted, total: data.total });
          setLiveUserCount(data.total - data.deleted);
          timer = setTimeout(poll, 2000);
        } else {
          // Delete finished or was interrupted while we were away.
          setDeleteProgress(null);
          setLiveUserCount(null);
          if (data.status === 'done') {
            notification.success({ message: 'Delete completed in background' });
            fetchDataSources();
          }
        }
      } catch { /* ignore */ }
    };

    // Start the first poll immediately.
    poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteServerStatus]);

  // On mount: check the server for any in-progress or interrupted delete job.
  useEffect(() => {
    fetch(`${API}/api/upload/delete-status`)
      .then(r => r.json())
      .then(data => { if (data.status !== 'idle') setDeleteServerStatus(data.status); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount, restore any unfinished upload session from localStorage.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RESUME_SESSION_KEY);
      if (stored) setPendingSession(JSON.parse(stored));
    } catch {
      localStorage.removeItem(RESUME_SESSION_KEY);
    }
  }, []);

  const handleUpload = async () => {
    const file = fileList[0];
    if (!file) return;

    setPhase('reading');
    setXferPct(0);
    setChunkProgress({ done: 0, total: 0 });
    setUploadResult(null);
    setIsInterrupted(false);

    try {
      // Read the file once, then split it into upload chunks.
      const fileText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsText(file);
      });

      const chunks      = splitCSVIntoChunks(fileText, CHUNK_ROWS);
      const totalChunks = chunks.length;

      if (totalChunks === 0) {
        throw Object.assign(new Error('The file appears to be empty or has no data rows.'), { isValidation: true });
      }

      setPhase('transferring');
      setChunkProgress({ done: 0, total: totalChunks });

      // Start or resume the matching server-side upload session.
      const { data: sessionData } = await axios.post(`${API}/api/upload/session/start`, {
        fileName: file.name,
        totalChunks,
        fileFingerprint: fileFingerprint(file),
      });

      const { sessionId, resuming, completedChunks: alreadyDone, insertedSoFar: prevInserted = 0 } = sessionData;
      const doneSet = new Set(alreadyDone);

      // Subtract resumed inserts so the live count starts from the true baseline.
      const baseUserCount = (dataInfo?.userUploaded ?? 0) - prevInserted;

      // Persist session ID so the browser can resume even after a page refresh.
      localStorage.setItem(RESUME_SESSION_KEY, JSON.stringify({
        sessionId,
        fileFingerprint: fileFingerprint(file),
        fileName: file.name,
      }));

      if (resuming) {
        notification.info({
          message: 'Resuming previous upload',
          description: `${alreadyDone.length} of ${totalChunks} chunks already done — continuing from where it stopped.`,
          icon: <InfoCircleOutlined style={{ color: '#1677ff' }} />,
          duration: 4,
        });
      }

      // Count every chunk once, including chunks already completed on the server.
      let uploadedCount = 0;

      // Upload sequentially so failures are easy to resume from.
      for (let i = 0; i < totalChunks; i++) {
        uploadedCount++;
        setXferPct(Math.round((uploadedCount / totalChunks) * 100));
        setChunkProgress({ done: uploadedCount, total: totalChunks });

        if (doneSet.has(i)) continue;  // already committed — skip, progress already updated above

        const chunkResult = await uploadChunk(sessionId, i, chunks[i]);
        // Update the live user-record counter as rows land in the database.
        if (chunkResult?.insertedSoFar !== undefined) {
          setLiveUserCount(baseUserCount + chunkResult.insertedSoFar);
        }
      }

      setPhase('processing');

      // Ask the server to finalize and return the combined summary.
      const { data: result } = await axios.post(`${API}/api/upload/session/${sessionId}/complete`);

      // Upload finished — clear the resume state so the banner doesn't reappear.
      localStorage.removeItem(RESUME_SESSION_KEY);
      setPendingSession(null);
      setIsInterrupted(false);
      setLiveUserCount(null); // hand back to the real cached count

      setPhase('done');
      setUploadResult(result);
      setFileList([]);
      fetchDataSources();

      const inserted = Number(result.totalRecords || 0);
      if (inserted === 0) {
        notification.info({
          message: 'No new records',
          description: result.message || 'All rows were already in the database.',
          icon: <InfoCircleOutlined style={{ color: '#1677ff' }} />,
        });
      } else {
        notification.success({
          message: `${inserted.toLocaleString()} records imported`,
          description: result.message,
          icon: <CheckCircleOutlined style={{ color: '#16a34a' }} />,
        });
      }
    } catch (error) {
      // Leave the file selected so the user can retry without re-picking it.
      setLiveUserCount(null);
      setPhase('idle');

      const apiMsg = error.response?.data?.message || error.message;
      const status = error.response?.status;
      setUploadResult(error.response?.data ?? { status: 'error', message: apiMsg });

      if (error.isValidation || status === 400) {
        // Validation errors are not resumable — the file itself is the problem.
        setIsInterrupted(false);
        notification.warning({
          message: 'Validation error',
          description: apiMsg || 'The file did not pass validation. Check the required fields.',
          icon: <WarningOutlined style={{ color: '#b45309' }} />,
          duration: 8,
        });
      } else {
        // Keep the session so the user can resume after a network or server error.
        setIsInterrupted(true);
        notification.error({
          message: 'Upload interrupted',
          description: `${apiMsg} — use the Resume Upload button to continue from where it stopped.`,
          icon: <CloseCircleOutlined style={{ color: '#dc2626' }} />,
          duration: 10,
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
    setDeleteProgress({ deleted: 0, total: 0 });
    setDeleteServerStatus('running');

    try {
      const response = await fetch(`${API}/api/upload/user-data`, { method: 'DELETE' });

      // 409 = already running in background; switch to polling mode.
      if (response.status === 409) {
        setDeleteServerStatus('running');
        return;
      }

      const reader   = response.body.getReader();
      const decoder  = new TextDecoder();
      let   buffer   = '';

      // Parse complete SSE frames as the batch delete streams progress.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop(); // last element may be an incomplete frame — keep it

        for (const frame of frames) {
          const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;

          try {
            const event = JSON.parse(dataLine.slice(5).trim());

            if (event.type === 'start') {
              setDeleteProgress({ deleted: 0, total: event.total });
              // Show the full count immediately so the tag doesn't lag behind
              setLiveUserCount(event.total);

            } else if (event.type === 'progress') {
              setDeleteProgress({ deleted: event.deleted, total: event.total });
              // Decrement the tag in real time: remaining = total − deleted so far
              setLiveUserCount(event.total - event.deleted);

            } else if (event.type === 'done') {
              setDeleteProgress(null);
              setDeleteServerStatus('idle');
              setLiveUserCount(null); // hand back to the real API count
              notification.success({
                message: event.deleted > 0
                  ? `Deleted ${event.deleted.toLocaleString()} user records`
                  : 'No user data to delete',
              });
              fetchDataSources();
              if (dataSource === 'user') {
                setDataSource('preloaded');
                localStorage.setItem(UPLOAD_DATA_SOURCE_KEY, 'preloaded');
                onDataSourceChange?.('preloaded');
              }

            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            // Malformed frame — skip silently
          }
        }
      }
    } catch (err) {
      setDeleteProgress(null);
      setDeleteServerStatus('interrupted');
      setLiveUserCount(null); // restore real count on error
      notification.error({ message: 'Failed to delete user data', description: err.message });
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

  // Dismiss the resume banner and forget the interrupted session entirely.
  const handleDismissResume = () => {
    localStorage.removeItem(RESUME_SESSION_KEY);
    setPendingSession(null);
    setIsInterrupted(false);
  };

  const uploadProps = {
    onRemove: () => {
      setFileList([]);
      setUploadResult(null);
      setIsInterrupted(false);
    },
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

      // Matching file fingerprint means this upload can resume.
      if (pendingSession && fileFingerprint(file) === pendingSession.fileFingerprint) {
        setIsInterrupted(true);
      } else {
        // Warn when a different file would start a fresh upload.
        if (pendingSession && fileFingerprint(file) !== pendingSession.fileFingerprint) {
          notification.warning({
            message: 'Different file selected',
            description: `The interrupted upload was "${pendingSession.fileName}". Selecting a different file will start a fresh upload — the previous session will remain paused and can still be resumed by re-selecting "${pendingSession.fileName}".`,
            duration: 8,
          });
        }
        setIsInterrupted(false);
      }
      return false;
    },
    fileList,
    customRequest: () => {},
    maxCount: 1,
  };

  // Auto-hide the progress bar a moment after the upload finishes.
  useEffect(() => {
    if (phase !== 'done') return;
    const id = setTimeout(() => setPhase('idle'), 1500);
    return () => clearTimeout(id);
  }, [phase]);

  const isUploading    = phase === 'reading' || phase === 'transferring' || phase === 'processing';
  const isDeleting     = !!deleteProgress || deleteServerStatus === 'running';
  const progressPct    = phase === 'transferring' ? xferPct : PHASES[phase].percent;
  const progressStatus = phase === 'done' ? 'success' : phase === 'idle' ? 'normal' : 'active';
  const userBounds     = dataInfo?.bounds?.user;
  // True when the current state allows resuming rather than starting fresh.
  const isResumable    = isInterrupted;

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

        <Col span={24}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>

            <div>
              <Title level={5} style={{ marginBottom: 4 }}>Upload Your Dataset</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Upload any bike-share or point-to-point mobility CSV. Citi Bike headers and common aliases
                (start_time, start_latitude, start_lon, …) are auto-detected. Files up to 250 MB are accepted.
              </Paragraph>
            </div>

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

            <Popover
              trigger="click"
              placement="bottomLeft"
              overlayStyle={{ width: 420 }}
              title={
                <Space>
                  <DownloadOutlined />
                  <span>Sample CSV Files</span>
                </Space>
              }
              content={
                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                  {SAMPLE_CSVS.map((s) => (
                    <div key={s.key} style={{ borderBottom: '1px solid var(--app-border)', paddingBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Space size={6}>
                          <FileTextOutlined />
                          <Text strong>{s.label}</Text>
                          <Tag color={s.tag} style={{ margin: 0 }}>{s.filename}</Tag>
                        </Space>
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={async () => {
                            if (s.source === 'backend') {
                              try {
                                const resp = await axios.get(`${API}/api/upload/sample-csv?type=${s.key}`, { responseType: 'blob' });
                                const url  = URL.createObjectURL(new Blob([resp.data], { type: 'text/csv' }));
                                const link = document.createElement('a');
                                link.href = url; link.download = s.filename; link.style.display = 'none';
                                document.body.appendChild(link); link.click();
                                setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
                                notification.success({ message: `${s.label} sample downloaded` });
                              } catch {
                                notification.error({ message: `Failed to download ${s.label} sample` });
                              }
                            } else {
                              downloadCSV(s.filename, s.content);
                              notification.success({ message: `${s.label} sample downloaded` });
                            }
                          }}
                        >
                          Download
                        </Button>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 3 }}>
                        {s.description}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--app-muted)' }}>
                        {s.columns}
                      </Text>
                    </div>
                  ))}
                </Space>
              }
            >
              <Button icon={<DownloadOutlined />}>
                Download Sample CSV
              </Button>
            </Popover>

            {/* Resume banner — appears after a page refresh if a session is still alive */}
            {pendingSession && !isUploading && phase !== 'done' && (
              <Alert
                type="error"
                showIcon
                closable
                onClose={handleDismissResume}
                message="Interrupted upload detected"
                description={
                  <span>
                    Your previous upload of <strong>{pendingSession.fileName}</strong> did not
                    finish. Re-select the same file and click <strong>Resume Upload</strong> to
                    continue from where it stopped — no rows will be duplicated.
                  </span>
                }
              />
            )}

            <Space direction="vertical" size={4}>
              <Upload {...uploadProps} disabled={isUploading || isDeleting}>
                <Button icon={<UploadOutlined />} disabled={isUploading || isDeleting}>
                  Select CSV File
                </Button>
              </Upload>
              {fileList[0] && (
                <Space size={6} style={{ paddingLeft: 2 }}>
                  <FileTextOutlined style={{ color: 'var(--app-muted)', fontSize: 13 }} />
                  <Text style={{ fontSize: 13 }}>{fileList[0].name}</Text>
                  <Tag style={{ margin: 0 }}>{formatFileSize(fileList[0].size)}</Tag>
                </Space>
              )}
            </Space>

            {/* Upload button adapts for fresh vs resumed uploads. */}
            {isResumable ? (
              <Button
                onClick={handleUpload}
                disabled={fileList.length === 0 || isUploading || isDeleting}
                loading={isUploading}
                icon={<ReloadOutlined />}
                style={{
                  background:   isUploading || isDeleting ? undefined : '#d97706',
                  borderColor:  isUploading || isDeleting ? undefined : '#d97706',
                  color:        isUploading || isDeleting ? undefined : '#fff',
                }}
              >
                {isUploading ? PHASES[phase].label : 'Resume Upload'}
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={handleUpload}
                disabled={fileList.length === 0 || isUploading || isDeleting}
                loading={isUploading}
                icon={<UploadOutlined />}
              >
                {isUploading ? PHASES[phase].label : 'Upload CSV'}
              </Button>
            )}

            {phase !== 'idle' && (
              <div className="upload-progress-block">
                <div className="upload-progress-label">
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {phase === 'reading'      && 'Reading file…'}
                    {phase === 'transferring' && (
                      chunkProgress.total > 0
                        ? `Uploading chunk ${chunkProgress.done} of ${chunkProgress.total} (${xferPct}%)`
                        : `Uploading… ${xferPct}%`
                    )}
                    {phase === 'processing'   && 'Finalizing…'}
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
                  disabled={isDeleting}
                />
                <Tag color={dataSource === 'user' ? 'green' : 'default'}>
                  User data ({(liveUserCount ?? dataInfo.userUploaded ?? dataInfo.bounds?.user?.count ?? 0).toLocaleString()} records)
                </Tag>
              </div>

              {userBounds?.minDate && userBounds?.maxDate && (
                <Alert
                  type="info"
                  icon={<DatabaseOutlined />}
                  showIcon
                  message={`Uploaded data covers ${userBounds.minDate?.slice(0, 10)} → ${userBounds.maxDate?.slice(0, 10)}`}
                  description="The Tool page date picker will automatically adjust to this range when User Data is selected."
                />
              )}

              {(dataInfo.userUploaded ?? 0) === 0 && dataSource === 'user' && (
                <Alert
                  type="warning"
                  showIcon
                  message="No user data loaded"
                  description="Upload a CSV file above first, then switch to User Data."
                />
              )}

              {(dataInfo.userUploaded ?? dataInfo.bounds?.user?.count ?? 0) > 0 && (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleDeleteUserData}
                      loading={!!deleteProgress}
                      disabled={!!deleteProgress || deleteServerStatus === 'interrupted'}
                    >
                      {deleteProgress ? 'Deleting…' : 'Clear All User Data'}
                    </Button>

                    {/* Resume button — shown when the server restarted mid-delete */}
                    {deleteServerStatus === 'interrupted' && (
                      <Button
                        danger
                        icon={<ReloadOutlined />}
                        onClick={handleDeleteUserData}
                      >
                        Resume Delete
                      </Button>
                    )}
                  </Space>

                  {deleteServerStatus === 'interrupted' && !deleteProgress && (
                    <Alert
                      type="warning"
                      showIcon
                      message="Delete was interrupted"
                      description="The previous delete did not finish (server may have restarted). Click Resume Delete to continue removing user data."
                      style={{ marginTop: 4 }}
                    />
                  )}

                  {/* Live progress bar — only visible while deletion is in progress */}
                  {deleteProgress && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {deleteProgress.total > 0
                          ? `Deleting ${deleteProgress.deleted.toLocaleString()} of ${deleteProgress.total.toLocaleString()} records…`
                          : 'Starting…'}
                      </Text>
                      <Progress
                        percent={
                          deleteProgress.total > 0
                            ? Math.round((deleteProgress.deleted / deleteProgress.total) * 100)
                            : 0
                        }
                        status="active"
                        strokeColor={{ from: '#ff4d4f', to: '#cf1322' }}
                        size="small"
                        style={{ marginTop: 4 }}
                      />
                    </div>
                  )}
                </Space>
              )}
            </Space>
          </div>
        </Col>

      </Row>
    </Card>
  );
};

export default CSVUpload;
