import axios from 'axios';
import { getToken, clearAuth } from './auth';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request Interceptor: sisipkan Bearer token dari auth.ts
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: tangani 401 global kecuali untuk endpoint /login dan /logout
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl: string = error.config?.url || '';
    const isAuthEndpoint =
      requestUrl.includes('/login') || requestUrl.includes('/logout');

    if (error.response?.status === 401 && !isAuthEndpoint) {
      clearAuth();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;