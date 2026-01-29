import React, { useEffect, useState } from "react";
import { Layout, Menu } from "antd";
import { HomeOutlined, InfoCircleOutlined, UploadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Sider } = Layout;

const Sidebar = ({ collapsed }) => {
  const [selectedKey, setSelectedKey] = useState("1");
  const navigate = useNavigate();

  useEffect(() => {
    const path = window.location.pathname;

    if (path === "/") setSelectedKey("1");
    else if (path === "/upload") setSelectedKey("2");
    else if (path === "/guide") setSelectedKey("3");
  }, [window.location.pathname]);

  const menuItems = [
    {
      key: "1",
      icon: <HomeOutlined />,
      label: "Tool",
      onClick: () => navigate("/"),
    },
    {
      key: "2",
      icon: <UploadOutlined />,
      label: "Upload Data",
      onClick: () => navigate("/upload"),
    },
    {
      key: "3",
      icon: <InfoCircleOutlined />,
      label: "Guide",
      onClick: () => navigate("/guide"),
    },
  ];

  return (
    <Sider collapsible collapsed={collapsed} trigger={null}>
      <div
        style={{
          height: 45,
          background: "rgba(255, 255, 255, 0.2)",
          margin: "16px",
          textAlign: "center",
          color: "#fff",
          fontSize: "18px",
          lineHeight: "45px",
        }}
      >
        {collapsed ? "Bi" : "K-Anonymization"}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        items={menuItems}
        selectedKeys={[selectedKey]}
      />
    </Sider>
  );
};

export default Sidebar;
