import React, { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const { Title, Text } = Typography;

const SignUp = () => {
  const navigate   = useNavigate();
  const [apiError, setApiError] = useState('');

  const formik = useFormik({
    initialValues: { username: '', email: '', password: '', confirmPassword: '' },
    validationSchema: Yup.object({
      username: Yup.string().required('Username is required'),
      email:    Yup.string().email('Invalid email address').required('Email is required'),
      password: Yup.string()
        .min(8, 'Password must be at least 8 characters')
        .required('Password is required'),
      confirmPassword: Yup.string()
        .oneOf([Yup.ref('password'), null], 'Passwords must match')
        .required('Please confirm your password'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      setApiError('');
      try {
        const response = await axios.post(
          'https://eve-backend.mrashid-te.workers.dev/user/signup',
          values
        );
        if (response.data.status === 'success') {
          resetForm();
          navigate('/login');
        }
      } catch (error) {
        setApiError(
          error.response?.data?.message || 'Something went wrong. Please try again.'
        );
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
          <Title level={3} style={{ margin: 0 }}>Create account</Title>
          <Text type="secondary">Join MobiAnon</Text>
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
            label="Username"
            validateStatus={formik.touched.username && formik.errors.username ? 'error' : ''}
            help={formik.touched.username && formik.errors.username}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Choose a username"
              name="username"
              value={formik.values.username}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            label="Email"
            validateStatus={formik.touched.email && formik.errors.email ? 'error' : ''}
            help={formik.touched.email && formik.errors.email}
          >
            <Input
              prefix={<MailOutlined />}
              type="email"
              placeholder="you@example.com"
              name="email"
              value={formik.values.email}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              autoComplete="email"
            />
          </Form.Item>

          <Form.Item
            label="Password"
            validateStatus={formik.touched.password && formik.errors.password ? 'error' : ''}
            help={formik.touched.password && formik.errors.password}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="At least 8 characters"
              name="password"
              value={formik.values.password}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            label="Confirm Password"
            validateStatus={formik.touched.confirmPassword && formik.errors.confirmPassword ? 'error' : ''}
            help={formik.touched.confirmPassword && formik.errors.confirmPassword}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Repeat your password"
              name="confirmPassword"
              value={formik.values.confirmPassword}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              autoComplete="new-password"
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={formik.isSubmitting}
            block
            style={{ marginTop: 4 }}
          >
            Create Account
          </Button>
        </Form>

        <div className="auth-footer">
          <Text type="secondary">Already have an account?</Text>
          <Button type="link" onClick={() => navigate('/login')} style={{ padding: '0 4px' }}>
            Sign In
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default SignUp;
