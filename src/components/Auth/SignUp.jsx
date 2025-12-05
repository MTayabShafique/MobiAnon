import React, { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { message } from 'antd';

const SignUp = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const navigate = useNavigate();

  const formik = useFormik({
    initialValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    validationSchema: Yup.object({
      username: Yup.string().required('Username is required'),
      email: Yup.string().email('Invalid email address').required('Email is required'),
      password: Yup.string()
        .min(8, 'Password must be at least 8 characters')
        .required('Password is required'),
      confirmPassword: Yup.string()
        .oneOf([Yup.ref('password'), null], 'Passwords must match')
        .required('Confirm Password is required'),
    }),
    onSubmit: async (values) => {
      setIsSubmitting(true);
      setServerError('');
      try {
        const response = await axios.post(
          'https://eve-backend.mrashid-te.workers.dev/user/signup',
          values
        );
        if (response.data.status === 'success') {
          message.success(response.data.message || 'Signup successful!');
          formik.resetForm();
          navigate('/login');
        }
      } catch (error) {
        setServerError(
          error.response?.data?.message || 'Something went wrong. Please try again later.'
        );
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="container mt-5 p-4 shadow-sm rounded bg-white">
      <h2 className="text-center mb-4">Sign Up</h2>
      {serverError && (
        <div className="alert alert-danger text-center" role="alert">
          {serverError}
        </div>
      )}
      <form onSubmit={formik.handleSubmit}>
        <div className="mb-3">
          <label htmlFor="username" className="form-label">
            Username
          </label>
          <input
            type="text"
            id="username"
            name="username"
            className={`form-control ${
              formik.touched.username && formik.errors.username ? 'is-invalid' : ''
            }`}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            value={formik.values.username}
          />
          {formik.touched.username && formik.errors.username && (
            <div className="invalid-feedback">{formik.errors.username}</div>
          )}
        </div>
        <div className="mb-3">
          <label htmlFor="email" className="form-label">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            className={`form-control ${
              formik.touched.email && formik.errors.email ? 'is-invalid' : ''
            }`}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            value={formik.values.email}
          />
          {formik.touched.email && formik.errors.email && (
            <div className="invalid-feedback">{formik.errors.email}</div>
          )}
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
          {formik.touched.password && formik.errors.password && (
            <div className="invalid-feedback">{formik.errors.password}</div>
          )}
        </div>
        <div className="mb-3">
          <label htmlFor="confirmPassword" className="form-label">
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            className={`form-control ${
              formik.touched.confirmPassword && formik.errors.confirmPassword ? 'is-invalid' : ''
            }`}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            value={formik.values.confirmPassword}
          />
          {formik.touched.confirmPassword && formik.errors.confirmPassword && (
            <div className="invalid-feedback">{formik.errors.confirmPassword}</div>
          )}
        </div>
        <div className="d-grid gap-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing Up...' : 'Sign Up'}
          </button>
        </div>
        <p className="text-center mt-3">
          Already have an account?{' '}
          <button
            type="button"
            className="btn btn-link p-0"
            onClick={() => navigate('/login')}
          >
            Login
          </button>
        </p>
      </form>
    </div>
  );
};

export default SignUp;
