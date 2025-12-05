import React from 'react';
import { Layout } from 'antd';

const { Content } = Layout;

const AppLayout = ({ children }) => {
  return (
    <Layout>
      <Content style={{ margin: '16px', padding: '16px', background: '#fff' }}>
        {children}
      </Content>
    </Layout>
  );
};

export default AppLayout;
