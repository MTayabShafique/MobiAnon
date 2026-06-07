import React from "react";
import { Col, Row, Select, DatePicker, Tag, Tooltip, Typography } from "antd";
import {
  CalendarOutlined,
  DatabaseOutlined,
  QuestionCircleOutlined,
  TableOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

dayjs.extend(isBetween);

const { Text } = Typography;
const { Option } = Select;

const getDateBounds = (dataSourceInfo, dataSource) => {
  const bounds = dataSourceInfo?.bounds?.[dataSource];
  if (!bounds?.minDate || !bounds?.maxDate) return null;
  const min = dayjs(bounds.minDate);
  const max = dayjs(bounds.maxDate);
  if (!min.isValid() || !max.isValid()) return null;
  return {
    min,
    max,
  };
};

const HelpIcon = ({ title }) => (
  <Tooltip title={title} placement="top" overlayClassName="help-tooltip">
    <QuestionCircleOutlined className="control-help-icon" />
  </Tooltip>
);

const ControlLabel = ({ icon, text, helpText }) => (
  <label className="control-label">
    {icon && <span className="control-label-icon">{icon}</span>}
    {text}
    {helpText && <HelpIcon title={helpText} />}
  </label>
);

export const FilterComponent = ({
  filterState,
  setFilterState,
  setAnonymizedFilterState,
  dataSourceInfo,
}) => {
  const applyState = (next) => {
    setFilterState(next);
    setAnonymizedFilterState(next);
  };

  const dateBounds = getDateBounds(dataSourceInfo, filterState.dataSource);
  const selectedDate = filterState.date ? dayjs(filterState.date, "YYYY-MM-DD") : null;
  const selectedDateInBounds = selectedDate?.isValid() && (
    dateBounds
      ? selectedDate.isBetween(dateBounds.min, dateBounds.max, "day", "[]")
      : filterState.dataSource === "preloaded"
        ? selectedDate.isBetween(dayjs("2024-01-01"), dayjs("2024-01-31"), "day", "[]")
        : true
  );
  const calendarAnchor = selectedDateInBounds
    ? selectedDate
    : dateBounds?.min ?? dayjs("2024-01-01");

  React.useEffect(() => {
    if (!dateBounds || !filterState.date || selectedDateInBounds) return;
    applyState({ ...filterState, date: dateBounds.min.format("YYYY-MM-DD") });
  }, [dateBounds, filterState, selectedDateInBounds]);

  const disabledDate = (current) => {
    if (!current) return true;
    if (dateBounds) {
      return !current.isBetween(dateBounds.min, dateBounds.max, "day", "[]");
    }
    return !current.isBetween(dayjs("2024-01-01"), dayjs("2024-01-31"), "day", "[]");
  };

  const handleDateChange = (date) => {
    applyState({ ...filterState, date: date ? date.format("YYYY-MM-DD") : null });
  };

  const handleDataSourceChange = (value) => {
    const newBounds = getDateBounds(dataSourceInfo, value);
    applyState({
      ...filterState,
      dataSource: value,
      date: newBounds ? newBounds.min.format("YYYY-MM-DD") : value === "preloaded" ? "2024-01-01" : null,
    });
  };

  const userCount    = dataSourceInfo?.bounds?.user?.count   ?? dataSourceInfo?.userUploaded ?? 0;
  const preloadCount = dataSourceInfo?.bounds?.preloaded?.count ?? dataSourceInfo?.preloaded ?? 0;

  const datePickerPlaceholder = dateBounds
    ? `${dateBounds.min.format("YYYY-MM-DD")}`
    : filterState.dataSource === "user"
    ? "Upload data first"
    : "Select date";

  const showDatePicker = filterState.dataSource === "preloaded" || (filterState.dataSource === "user" && dateBounds);

  return (
    <Row gutter={[16, 16]} style={{ alignItems: "flex-end", flexWrap: "wrap" }}>

      <Col xs={24} sm={12} md={8} lg={6}>
        <ControlLabel
          icon={<TableOutlined />}
          text="Data Source"
          helpText="Choose the built-in Citi Bike demo data (January 2024, NYC) or rows you uploaded on the Upload Data page. The map re-centres automatically to the selected dataset."
        />
        <Select
          style={{ width: "100%" }}
          value={filterState.dataSource}
          onChange={handleDataSourceChange}
          options={[
            {
              value: "preloaded",
              label: (
                <span className="datasource-option">
                  <DatabaseOutlined className="datasource-option-icon" />
                  Preloaded
                  {preloadCount > 0 && (
                    <Tag className="datasource-count-tag" color="blue">{preloadCount.toLocaleString()}</Tag>
                  )}
                </span>
              ),
            },
            {
              value: "user",
              label: (
                <span className="datasource-option">
                  <TeamOutlined className="datasource-option-icon" />
                  User Data
                  {userCount > 0
                    ? <Tag className="datasource-count-tag" color="green">{userCount.toLocaleString()}</Tag>
                    : <Tag className="datasource-count-tag" color="default">empty</Tag>
                  }
                </span>
              ),
            },
          ]}
        />
      </Col>

      <Col xs={24} sm={12} md={8} lg={6}>
        <ControlLabel
          icon={<TeamOutlined />}
          text="Member Type"
          helpText="Filter trips by rider subscription type. 'All' keeps both member and casual trips. Casual trips are typically shorter; filtering can change suppression rates."
        />
        <Select
          style={{ width: "100%" }}
          placeholder="Select Type"
          value={filterState.memberType}
          onChange={(value) => applyState({ ...filterState, memberType: value })}
        >
          <Option value="all">All riders</Option>
          <Option value="member">Member</Option>
          <Option value="casual">Casual</Option>
        </Select>
      </Col>

      {/* Date picker — shown for both preloaded and user data (when bounds exist) */}
      {showDatePicker && (
        <Col xs={24} sm={12} md={8} lg={6}>
          <ControlLabel
            icon={<CalendarOutlined />}
            text="Select Date"
            helpText={
              dateBounds
                ? `Pick any date within ${dateBounds.min.format("MMM D")} – ${dateBounds.max.format("MMM D, YYYY")}. A single day reduces trip count — sparse days may see higher suppression.`
                : "The preloaded demo data covers January 2024."
            }
          />
          <DatePicker
            key={`${filterState.dataSource}-${dateBounds?.min?.format("YYYY-MM") ?? "none"}`}
            className="date-picker-inline"
            placeholder={datePickerPlaceholder}
            value={selectedDateInBounds ? selectedDate : null}
            defaultPickerValue={calendarAnchor}
            onChange={handleDateChange}
            format="YYYY-MM-DD"
            disabledDate={disabledDate}
            allowClear
            suffixIcon={<CalendarOutlined />}
          />
          {dateBounds && (
            <Text type="secondary" className="date-range-hint">
              {dateBounds.min.format("MMM D")} – {dateBounds.max.format("MMM D, YYYY")}
            </Text>
          )}
        </Col>
      )}

      {/* User data with no bounds yet — show empty state */}
      {filterState.dataSource === "user" && !dateBounds && (
        <Col xs={24} sm={12} md={8} lg={6}>
          <ControlLabel icon={<CalendarOutlined />} text="Date Range" />
          <div className="date-range-empty">
            <CalendarOutlined className="date-range-empty-icon" />
            <span>No data uploaded</span>
          </div>
        </Col>
      )}

    </Row>
  );
};
