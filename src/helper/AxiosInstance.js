import axios from 'axios';

// Base URL
const BASE_URL = ' http://127.0.0.1:8000/';

// Create Axios instance
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

const getToken = () => localStorage.getItem('authToken');

// Function to refresh the token
const refreshAuthToken = async () => {
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('Refresh token not available');
    }

    const response = await axios.post(`${BASE_URL}/auth/refresh`, {
      refreshToken,
    });

    // Update tokens
    const { accessToken, refreshToken: newRefreshToken } = response.data;
    localStorage.setItem('authToken', accessToken);
    localStorage.setItem('refreshToken', newRefreshToken);

    return accessToken;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    throw error;
  }
};

// Request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => response, 
  async (error) => {
    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true; 
      try {
        const newToken = await refreshAuthToken();
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
