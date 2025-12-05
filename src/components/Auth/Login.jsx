import React from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { message } from 'antd';

const Login = () => {
  const navigate = useNavigate();

  const formik = useFormik({
    initialValues: {
      identifier: '', // Accepts either email or username
      password: '',
    },
    validationSchema: Yup.object({
      identifier: Yup.string()
        .required('Email or Username is required')
        .test('is-email-or-username', 'Invalid Email or Username', (value) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Email format
          return emailRegex.test(value) || value.length >= 3; // Allow email or username
        }),
      password: Yup.string().required('Password is required'),
    }),
    onSubmit: async (values, { setSubmitting, setErrors }) => {
      try {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const payload = emailRegex.test(values.identifier)
          ? { email: values.identifier, password: values.password } 
          : { username: values.identifier, password: values.password }; // Use username key

        // Make API call to /api/login
        const response = await axios.post('https://eve-backend.mrashid-te.workers.dev/user/login', payload);

        const { token } = response.data;
        localStorage.setItem('authToken', token);
        message.success(response.data.message);

        navigate('/');
      } catch (error) {
        // Handle errors
        if (error.response && error.response.data) {
          const { message } = error.response.data;
          setErrors({ identifier: message || 'Invalid login credentials' });
        } else {
          setErrors({ identifier: 'Something went wrong. Please try again.' });
        }
      } finally {
        setSubmitting(false); // Stop the submission spinner
      }
    },
  });

  return (
    <div className="container-sm shadow-sm mt-5">
      <h2>Login</h2>
      <form onSubmit={formik.handleSubmit}>
        <div className="mb-3">
          <label htmlFor="identifier" className="form-label">
            Email or Username
          </label>
          <input
            type="text"
            id="identifier"
            name="identifier"
            className={`form-control ${
              formik.touched.identifier && formik.errors.identifier ? 'is-invalid' : ''
            }`}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            value={formik.values.identifier}
          />
          {formik.touched.identifier && formik.errors.identifier ? (
            <div className="invalid-feedback">{formik.errors.identifier}</div>
          ) : null}
        </div>
        <div className="mb-3">
          <label htmlFor="password" className="form-label">
            Password
          </label>
          <input
            type="password"
            id="password"
            name="password"
            className={`form-control ${
              formik.touched.password && formik.errors.password ? 'is-invalid' : ''
            }`}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            value={formik.values.password}
          />
          {formik.touched.password && formik.errors.password ? (
            <div className="invalid-feedback">{formik.errors.password}</div>
          ) : null}
        </div>
        <button type="submit" className="btn btn-primary" disabled={formik.isSubmitting}>
          {formik.isSubmitting ? 'Logging in...' : 'Login'}
        </button>
        <p className="mt-1">
          Don't have an account?{' '}
          <span>
            <button className="btn btn-link mb-1" onClick={() => navigate('/signup')}>
              Sign Up
            </button>
          </span>
        </p>
      </form>
    </div>
  );
};

export default Login;
