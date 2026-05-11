import React, { useState } from "react";
import { Layout, Menu, Tooltip } from "antd";
import {
  BarChartOutlined,
  BookOutlined,
  CloudUploadOutlined,
  LeftOutlined,
  LockOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";

const { Sider } = Layout;

const pathToKey = (pathname) => {
  if (pathname === "/upload") return "2";
  if (pathname === "/guide")  return "3";
  return "1";
};

const Sidebar = ({ themeMode = "dark" }) => {
  const navigate    = useNavigate();
  const location    = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const selectedKey = pathToKey(location.pathname);
  const isDark      = themeMode === "dark";

  const menuItems = [
    {
      key:     "1",
      icon:    <BarChartOutlined />,
      label:   "Tool",
      onClick: () => navigate("/"),
    },
    {
      key:     "2",
      icon:    <CloudUploadOutlined />,
      label:   "Upload Data",
      onClick: () => navigate("/upload"),
    },
    {
      key:     "3",
      icon:    <BookOutlined />,
      label:   "Guide",
      onClick: () => navigate("/guide"),
    },
  ];

  return (
    <Sider
      collapsed={collapsed}
      collapsedWidth={64}
      width={200}
      theme={isDark ? "dark" : "light"}
      className={`app-sidebar app-sidebar--${isDark ? "dark" : "light"}`}
    >
      {/* Logo */}
      <div className={`sidebar-logo ${collapsed ? "sidebar-logo--collapsed" : ""}`}>
        <div className="sidebar-logo-icon">
          <LockOutlined />
        </div>
        {!collapsed && (
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-title">K-Anon</span>
            <span className="sidebar-logo-sub">Privacy Tool</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <Menu
        theme={isDark ? "dark" : "light"}
        mode="inline"
        items={menuItems}
        selectedKeys={[selectedKey]}
        inlineCollapsed={collapsed}
        className="sidebar-menu"
      />

      {/* Collapse trigger */}
      <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right">
        <button
          className={`sidebar-collapse-btn ${isDark ? "sidebar-collapse-btn--dark" : "sidebar-collapse-btn--light"}`}
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <RightOutlined /> : <LeftOutlined />}
        </button>
      </Tooltip>
    </Sider>
  );
};

export default Sidebar;
