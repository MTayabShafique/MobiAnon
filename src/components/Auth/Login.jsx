import React from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const { Title, Text } = Typography;

const Login = () => {
  const navigate = useNavigate();
  const [apiError, setApiError] = React.useState('');

  const formik = useFormik({
    initialValues: { identifier: '', password: '' },
    validationSchema: Yup.object({
      identifier: Yup.string()
        .required('Email or username is required')
        .test('is-valid', 'Enter a valid email or username (min 3 chars)', (v) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || (v && v.length >= 3)
        ),
      password: Yup.string().required('Password is required'),
    }),
    onSubmit: async (values, { setSubmitting }) => {
      setApiError('');
      try {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const payload = emailRegex.test(values.identifier)
          ? { email: values.identifier, password: values.password }
          : { username: values.identifier, password: values.password };

        const response = await axios.post(
          'https://eve-backend.mrashid-te.workers.dev/user/login',
          payload
        );
        localStorage.setItem('authToken', response.data.token);
        navigate('/');
      } catch (error) {
        setApiError(error.response?.data?.message || 'Invalid credentials. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><LockOutlined /></div>
          <Title level={3} style={{ margin: 0 }}>Welcome back</Title>
          <Text type="secondary">Sign in to K-Anon Privacy Tool</Text>
        </div>

        {apiError && (
          <Alert
            type="error"
            message={apiError}
            showIcon
            style={{ marginBottom: 20 }}
          />
        )}

        <Form layout="vertical" onFinish={formik.handleSubmit} size="large">
          <Form.Item
            label="Email or Username"
            validateStatus={formik.touched.identifier && formik.errors.identifier ? 'error' : ''}
            help={formik.touched.identifier && formik.errors.identifier}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="you@example.com or username"
              name="identifier"
              value={formik.values.identifier}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            label="Password"
            validateStatus={formik.touched.password && formik.errors.password ? 'error' : ''}
            help={formik.touched.password && formik.errors.password}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Your password"
              name="password"
              value={formik.values.password}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              autoComplete="current-password"
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={formik.isSubmitting}
            block
            style={{ marginTop: 4 }}
          >
            Sign In
          </Button>
        </Form>

        <div className="auth-footer">
          <Text type="secondary">Don't have an account?</Text>
          <Button type="link" onClick={() => navigate('/signup')} style={{ padding: '0 4px' }}>
            Sign Up
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Login;
