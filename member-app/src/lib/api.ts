import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'https://revira-gym-project-production.up.railway.app',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

export default api;