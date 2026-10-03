import axios from 'axios';
import { getAuthToken, clearAuth } from './auth';

console.log("Cek URL .env:", import.meta.env.VITE_API_URL);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1',
  headers: {
    'Accept': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {

    if (error.response?.status === 401 && !error.config.url?.includes('/login')) {
      localStorage.removeItem('auth_token'); 
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;