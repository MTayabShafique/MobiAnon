import React from 'react';
import { Layout } from 'antd';

const { Content } = Layout;

const AppLayout = ({ children }) => {
  return (
    <Layout className="route-layout">
      <Content className="route-content">
        {children}
      </Content>
    </Layout>
  );
};

export default AppLayout;
