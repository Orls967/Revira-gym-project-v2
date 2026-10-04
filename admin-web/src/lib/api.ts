import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Interceptor untuk menyisipkan token ke setiap request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor untuk menangani error respons dari server
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Cek jika API merespons 401 DAN request-nya BUKAN ke endpoint '/login'
    if (error.response?.status === 401 && !error.config.url?.includes('/login')) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

export default api;