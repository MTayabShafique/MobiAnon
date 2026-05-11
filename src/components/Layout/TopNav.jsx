import React from "react";
import { Segmented, Space } from "antd";
import {
  BarChartOutlined,
  BookOutlined,
  CloudUploadOutlined,
  LockOutlined,
  MoonOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { key: "/",       label: "Tool",        icon: <BarChartOutlined /> },
  { key: "/upload", label: "Upload",      icon: <CloudUploadOutlined /> },
  { key: "/guide",  label: "Guide",       icon: <BookOutlined /> },
];

const TopNav = ({ themeMode, setThemeMode }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <header className="topnav">
      {/* ── Brand ── */}
      <button className="topnav-brand" onClick={() => navigate("/")}>
        <span className="topnav-brand-icon"><LockOutlined /></span>
        <span className="topnav-brand-text">
          <span className="topnav-brand-title">K-Anon</span>
          <span className="topnav-brand-sub">Privacy Tool</span>
        </span>
      </button>

      {/* ── Right side ── */}
      <div className="topnav-right">
        {/* Nav pills */}
        <nav className="topnav-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ key, label, icon }) => (
            <button
              key={key}
              className={`topnav-pill ${pathname === key ? "topnav-pill--active" : ""}`}
              onClick={() => navigate(key)}
            >
              <span className="topnav-pill-icon">{icon}</span>
              <span className="topnav-pill-label">{label}</span>
            </button>
          ))}
        </nav>

        {/* Divider */}
        <div className="topnav-sep" />

        {/* Theme toggle */}
        <Segmented
          value={themeMode}
          onChange={setThemeMode}
          size="small"
          className="topnav-theme-toggle"
          options={[
            { label: "Light", value: "light", icon: <SunOutlined /> },
            { label: "Dark",  value: "dark",  icon: <MoonOutlined /> },
          ]}
        />
      </div>
    </header>
  );
};

export default TopNav;
