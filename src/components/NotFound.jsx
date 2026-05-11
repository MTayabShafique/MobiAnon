import React from 'react';
import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <div className="notfound-page">
      <Result
        status="404"
        title="404"
        subTitle="The page you're looking for doesn't exist."
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            Back to Tool
          </Button>
        }
      />
    </div>
  );
};

export default NotFound;
