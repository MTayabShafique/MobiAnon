import React from "react";
import { Col, Row, Select, DatePicker } from "antd";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

dayjs.extend(isBetween);

const { Option } = Select;

export const FilterComponent = ({ filterState, setFilterState, setAnonymizedFilterState }) => {
  const applyState = (next) => {
    setFilterState(next);
    setAnonymizedFilterState(next);
  };

  const handleDateChange = (date) => {
    const next = { ...filterState, date: date ? date.format("YYYY-MM-DD") : null };
    applyState(next);
  };

  const handleDataSourceChange = (value) => {
    const next = {
      ...filterState,
      dataSource: value,
      date: value === "user" ? null : filterState.date || "2024-01-01",
    };
    applyState(next);
  };

  const disabledDate = (current) => {
    if (!current) return true;
    // Only allow dates within January 2024
    return !current.isBetween(dayjs("2024-01-01"), dayjs("2024-01-31"), "day", "[]");
  };

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      {/* Data Source (Dropdown) */}
      <Col xs={24} sm={12} md={8} lg={6}>
        <label style={{ display: "block", marginBottom: 5 }}>Data Source</label>
        <Select
          style={{ width: "100%" }}
          value={filterState.dataSource}
          onChange={handleDataSourceChange}
          options={[
            { value: "preloaded", label: "Preloaded" },
            { value: "user", label: "User Data" },
          ]}
        />
      </Col>

      {/* Member Type Select */}
      <Col xs={24} sm={12} md={8} lg={6}>
        <label style={{ display: "block", marginBottom: 5 }}>Member Type</label>
        <Select
          style={{ width: "100%" }}
          placeholder="Select Type"
          value={filterState.memberType}
          onChange={(value) => {
            const next = { ...filterState, memberType: value };
            setFilterState(next);
            setAnonymizedFilterState(next);
          }}
        >
          <Option value="all">All</Option>
          <Option value="member">Member</Option>
          <Option value="casual">Casual</Option>
        </Select>
      </Col>


            {/* Select Date — only visible when preloaded is selected */}
      {filterState.dataSource === "preloaded" && (
        <Col xs={24} sm={12} md={8} lg={6}>
          <label style={{ display: "block", marginBottom: 5 }}>Select Date</label>
          <DatePicker
            style={{ width: "100%" }}
            placeholder="Select Date"
            value={filterState.date ? dayjs(filterState.date, "YYYY-MM-DD") : null}
            onChange={handleDateChange}
            format="YYYY-MM-DD"
            disabledDate={disabledDate}
          />
        </Col>
      )}
    </Row>
  );
};
