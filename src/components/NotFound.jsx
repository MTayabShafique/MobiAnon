// src/components/NotFound.js
import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>404</h1>
      <p style={styles.message}>Oops! The page you are looking for does not exist.</p>
      <Link to="/" style={styles.link}>Go back to Home</Link>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#f7f7f7',
    textAlign: 'center',
  },
  header: {
    fontSize: '100px',
    fontWeight: 'bold',
    color: '#FF5733',
  },
  message: {
    fontSize: '20px',
    color: '#333',
    marginBottom: '20px',
  },
  link: {
    fontSize: '18px',
    color: '#007bff',
    textDecoration: 'none',
    fontWeight: 'bold',
  },
};

export default NotFound;
