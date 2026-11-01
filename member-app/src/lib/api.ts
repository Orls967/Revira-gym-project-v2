import axios from "axios";

export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Tambahan Interceptor Request untuk mendukung upload gambar (FormData)
apiClient.interceptors.request.use(
  (config) => {
    // Jika body adalah FormData, hapus Content-Type agar fetch/browser
    // otomatis mengisinya dengan boundary multipart yang benar.
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const registerUnauthorizedHandler = (handler: () => void) => {
  apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        handler();
      }
      return Promise.reject(error);
    }
  );
};

export default apiClient;