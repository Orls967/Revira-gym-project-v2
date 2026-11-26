import axios from "axios";

export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Untuk upload gambar (FormData): jangan paksa Content-Type JSON, biarkan
// boundary multipart diisi otomatis.
apiClient.interceptors.request.use(
  (config) => {
    if (config.data instanceof FormData) {
      const headers: any = config.headers;
      if (typeof headers?.delete === "function") {
        headers.delete("Content-Type");
      } else if (headers) {
        delete headers["Content-Type"];
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export class ApiError extends Error {
  status: number;
  errors?: Record<string, string[]>;

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export const registerUnauthorizedHandler = (handler: (error: any) => void) => {
  const interceptor = apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        handler(error);
      }
      return Promise.reject(error);
    }
  );
  return () => apiClient.interceptors.response.eject(interceptor);
};

export default apiClient;