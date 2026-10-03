import { getToken, clearToken, clearUserData } from "./auth";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "";

export class ApiError extends Error {
  public status: number;
  public errors?: Record<string, string[]>;

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.name = "ApiError";
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function registerUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError(500, "EXPO_PUBLIC_API_URL belum terpasang di file .env");
  }

  const token = await getToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const cleanBase = BASE_URL.replace(/\/+$/, "");
  const cleanEndpoint = endpoint.replace(/^\/+/, "");
  const fullUrl = `${cleanBase}/${cleanEndpoint}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      "Gagal terhubung ke server. Periksa koneksi internet Anda."
    );
  }

  let jsonResult: any = null;
  try {
    jsonResult = await response.json();
  } catch {
    jsonResult = null;
  }

 const isLoginRequest = cleanEndpoint.includes("login");

  // Interceptor status 401
  if (response.status === 401) {
    if (!isLoginRequest) {
      // Hanya jalankan sesi berakhir jika BUKAN di halaman login
      await clearToken();
      await clearUserData();
      if (onUnauthorized) {
        onUnauthorized();
      }
      throw new ApiError(401, "Sesi Anda telah berakhir. Silakan masuk kembali.");
    } else {
      // Jika terjadi saat LOGIN, ambil pesan ASLI yang dikirim backend Laravel:
      const errorMsg = jsonResult?.message || "Email atau password salah.";
      throw new ApiError(401, errorMsg, jsonResult?.errors);
    }
  }

  if (!response.ok) {
    const errorMsg =
      jsonResult?.message || `Terjadi kesalahan pada server (${response.status}).`;
    throw new ApiError(response.status, errorMsg, jsonResult?.errors);
  }

  return jsonResult as T;
}