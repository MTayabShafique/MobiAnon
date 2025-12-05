import React from 'react';
import { Layout, Button } from 'antd';
import { MenuUnfoldOutlined, MenuFoldOutlined } from '@ant-design/icons';

const { Header } = Layout;

const Navbar = ({ toggleSidebar, collapsed }) => {
  return (
    <Header
      style={{
        padding: '0 16px',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Button
        type="text"
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        onClick={toggleSidebar}
        style={{ fontSize: '16px' }}
      />
      <div>
        {/* <button type='button' className='btn btn-dark' onClick={()=>{
            localStorage.removeItem('authToken');
            window.location.href = '/login';
  
        }}>
          Logout</button> */}
      </div>
    </Header>
  );
};

export default Navbar;
