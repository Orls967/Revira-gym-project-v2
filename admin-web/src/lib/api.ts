import axios from 'axios';

// Placeholder klien API (akan disempurnakan di SCRUM-46)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    'Accept': 'application/json',
  },
});

export default api;