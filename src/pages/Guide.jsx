import React from "react";
import { Alert, Card, Col, Row, Space, Steps, Table, Tag, Timeline, Typography } from "antd";
import {
  AppstoreOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  UploadOutlined,
} from "@ant-design/icons";

const { Paragraph, Text, Title } = Typography;

const requiredColumns = [
  { field: "started_at", purpose: "Trip start timestamp" },
  { field: "ended_at", purpose: "Trip end timestamp" },
  { field: "start_lat / start_lng", purpose: "Trip start coordinates" },
  { field: "end_lat / end_lng", purpose: "Trip end coordinates" },
];

const aliasRows = [
  { internal: "started_at", examples: "start_time, starttime, start_date, started" },
  { internal: "ended_at", examples: "end_time, stoptime, end_date, ended" },
  { internal: "start_lat", examples: "start_latitude, from_lat, start station latitude" },
  { internal: "start_lng", examples: "start_lon, start_longitude, from_lon" },
  { internal: "end_lat", examples: "end_latitude, to_lat, end station latitude" },
  { internal: "end_lng", examples: "end_lon, end_longitude, to_lon" },
  { internal: "ride_id", examples: "trip_id, rental_id, id; generated when missing" },
  { internal: "member_casual", examples: "user_type, customer_type, membership_type" },
];

const metricRows = [
  { metric: "k Violations", meaning: "Released groups smaller than k. This should be 0." },
  { metric: "Suppressed", meaning: "Rows withheld because no valid k-anonymous group could be released." },
  { metric: "Mean Error", meaning: "Average distance between original start points and released centroids." },
  { metric: "Density Similarity", meaning: "How closely anonymized density preserves the raw spatial pattern." },
  { metric: "Hotspot Overlap", meaning: "Whether the busiest raw grid cells remain visible after anonymization." },
  { metric: "DB Query / Backend Total", meaning: "Live performance timings for data retrieval and anonymization." },
];

const Guide = () => {
  return (
    <div className="guide-page">
      <section className="tool-hero">
        <div>
          <Space size={8} className="hero-kicker">
            <FileSearchOutlined />
            <span>User guide</span>
          </Space>
          <Title level={2}>Mobility Privacy Demonstrator</Title>
          <Paragraph>
            Use this guide to upload comparable mobility datasets, run k-anonymity, compare
            privacy settings, and interpret the utility metrics for demos or paper figures.
          </Paragraph>
        </div>
        <Tag icon={<GlobalOutlined />} color="blue">
          Global CSV support
        </Tag>
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title={<Space><UploadOutlined /> Uploading Data</Space>} className="guide-card">
            <Steps
              direction="vertical"
              size="small"
              items={[
                {
                  title: "Prepare a mobility CSV",
                  description:
                    "The file should contain trip start/end times and start/end coordinates. It may use Citi Bike headers or common aliases.",
                },
                {
                  title: "Upload on the Upload Data page",
                  description:
                    "Files up to 250MB are accepted. The backend streams valid rows into MySQL in chunks, so it does not keep the full valid dataset in memory.",
                },
                {
                  title: "Switch to user data",
                  description:
                    "After upload, use the data-source toggle or the Tool page filter to select User Data. The map recenters to the uploaded dataset bounds.",
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card title={<Space><CheckCircleOutlined /> Required Fields</Space>} className="guide-card">
            <Table
              size="small"
              pagination={false}
              dataSource={requiredColumns}
              rowKey="field"
              columns={[
                { title: "Field", dataIndex: "field" },
                { title: "Purpose", dataIndex: "purpose" },
              ]}
            />
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message="ride_id is optional"
              description="When a trip identifier is missing, the importer generates one so datasets from other providers can still be tested."
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Card title={<Space><DatabaseOutlined /> Supported Column Aliases</Space>} className="guide-card">
            <Table
              size="small"
              pagination={false}
              dataSource={aliasRows}
              rowKey="internal"
              columns={[
                { title: "Internal field", dataIndex: "internal", width: 220 },
                { title: "Accepted examples", dataIndex: "examples" },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title={<Space><ClusterOutlined /> Running the Tool</Space>} className="guide-card">
            <Timeline
              items={[
                {
                  color: "blue",
                  children: "Choose Preloaded or User Data. Preloaded data is January 2024 Citi Bike; uploaded data can come from another city.",
                },
                {
                  color: "blue",
                  children: "Set member type, grid size, k value, and temporal privacy mode.",
                },
                {
                  color: "green",
                  children: "Load Original to inspect raw trip paths, then Run Anonymization to generate released centroids and heat intensity.",
                },
                {
                  color: "green",
                  children: "Use Compare k Values to run k=5, k=10, and k=20 side by side on the same filters.",
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title={<Space><AppstoreOutlined /> Key Controls</Space>} className="guide-card">
            <Space direction="vertical" size={10}>
              <Text><strong>Grid size:</strong> smaller values preserve more location detail; larger values generalize more area.</Text>
              <Text><strong>k value:</strong> each released group must contain at least k trips.</Text>
              <Text><strong>Temporal privacy:</strong> spatial-only is least strict; hour-level grouping is stricter and may suppress more records.</Text>
              <Text><strong>Theme toggle:</strong> use light or dark mode for demos and screenshots.</Text>
            </Space>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title={<Space><BarChartOutlined /> Reading the Metrics</Space>} className="guide-card">
            <Table
              size="small"
              pagination={false}
              dataSource={metricRows}
              rowKey="metric"
              columns={[
                { title: "Metric", dataIndex: "metric", width: 220 },
                { title: "How to interpret it", dataIndex: "meaning" },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24}>
          <Alert
            type="success"
            showIcon
            message="What the comparison demonstrates"
            description="The merge-nearest method keeps sparse regions usable by merging nearby groups until k is satisfied. The suppression baseline is useful for evaluation because it simply hides sparse cells; it can be faster, but it often removes most records under strict temporal privacy."
          />
        </Col>
      </Row>
    </div>
  );
};

export default Guide;
