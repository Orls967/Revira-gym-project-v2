import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import {
  getToken,
  saveToken,
  clearToken,
  getUserData,
  saveUserData,
  clearUserData,
  UserData as BaseUserData, // Ubah nama impor agar bisa di-extend
} from "@/lib/auth";
import { apiClient, registerUnauthorizedHandler, ApiError } from "@/lib/api";

export interface MembershipInfo {
  id: number;
  status: string;
  start_date?: string;
  end_date?: string;
}

// Extend tipe UserData untuk menambahkan membership dan pengajuan pending (SCRUM-74)
export interface UserData extends BaseUserData {
  phone?: string; // lama, dipertahankan agar kode lain tidak rusak
  membership?: MembershipInfo | null;
  // TODO: sesuaikan nama/bentuk field ini dengan kesepakatan bersama PIC backend (Orlando)
  pending_membership?: MembershipInfo | null;
}

// Status profil dari server (/me):
// - idle    : belum login
// - loading : sedang diperiksa (data cache BELUM dianggap terverifikasi)
// - loaded  : berhasil dimuat dari server
// - error   : gagal dimuat, status membership belum diketahui
export type ProfileStatus = "idle" | "loading" | "loaded" | "error";

interface AuthContextType {
  isLoading: boolean;
  userToken: string | null;
  user: UserData | null;
  profileStatus: ProfileStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// Ambil profil lengkap (/me). Header Bearer dipasang oleh interceptor request
// dan default header dari SCRUM-72, jadi tidak perlu dikirim manual di sini.
const fetchProfile = async (): Promise<UserData | null> => {
  const result = await apiClient.get("/api/v1/me");
  const profile = result.data?.data || result.data;
  return profile ? (profile as UserData) : null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");

  // Naik setiap login/logout/401 agar respons /me dari sesi lama diabaikan
  const sessionRef = useRef(0);

  // Auto-login: Memeriksa keberadaan token di SecureStore saat aplikasi baru dibuka
  useEffect(() => {
    async function initSession() {
      const sessionId = sessionRef.current;
      try {
        const storedToken = await getToken();
        const storedUser = await getUserData();

        if (storedToken) {
          apiClient.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
          setUserToken(storedToken);
          setUser(storedUser as UserData);

          // Data tersimpan hanyalah cache: periksa ulang ke server
          setProfileStatus("loading");
          fetchProfile()
            .then(async (fresh) => {
              if (sessionId !== sessionRef.current) return;
              if (fresh) {
                await saveUserData(fresh);
                setUser(fresh);
                setProfileStatus("loaded");
              } else {
                setProfileStatus("error");
              }
            })
            .catch(() => {
              if (sessionId === sessionRef.current) setProfileStatus("error");
            });
        }
      } catch {
        // Abaikan error pembacaan storage awal
      } finally {
        setIsLoading(false);
      }
    }

    initSession();

    // Interceptor request agar token selalu disertakan di setiap request ke backend
    const reqInterceptor = apiClient.interceptors.request.use(async (config) => {
      const token = await getToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    registerUnauthorizedHandler(() => {
      sessionRef.current += 1;
      delete apiClient.defaults.headers.common["Authorization"];
      setUserToken(null);
      setUser(null);
      setProfileStatus("idle");
    });

    return () => {
      apiClient.interceptors.request.eject(reqInterceptor);
    };
  }, []);

  const login = async (email: string, password: string) => {
    // Sesuai Kontrak SCRUM-41: POST /api/v1/login dengan device_name: "mobile"
    const result = await apiClient.post("/api/v1/login", {
      email,
      password,
      device_name: "mobile",
    });

    const token =
      result.data?.token ||
      result.data?.access_token ||
      result.data?.data?.token ||
      result.data?.data?.access_token;
    const profile =
      result.data?.user ||
      result.data?.member ||
      result.data?.data?.user ||
      result.data?.data?.member;

    if (!token) {
      throw new ApiError(500, "Format data respon tidak memiliki token.");
    }

    sessionRef.current += 1;
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    await saveToken(token);

    // Respons login hanya memuat identitas dasar: ambil profil lengkap dari /me
    // setelah token siap. Bila gagal, status 'error' sehingga layar yang butuh
    // data membership menampilkan pesan + Coba Lagi (bukan dianggap member baru).
    let fullProfile: UserData | null = null;
    try {
      fullProfile = await fetchProfile();
    } catch {
      // ditangani lewat profileStatus
    }

    const finalProfile = (fullProfile ?? profile) as UserData | undefined;
    if (finalProfile) {
      await saveUserData(finalProfile);
      setUser(finalProfile);
    }
    setProfileStatus(fullProfile ? "loaded" : "error");
    setUserToken(token);
  };

  const logout = async () => {
    sessionRef.current += 1;
    try {
      // POST /api/v1/logout ke backend
      await apiClient("api/v1/logout", {
        method: "POST",
      });
    } catch {
      // Jika jaringan gagal, logout lokal tetap dieksekusi sesuai AC
    } finally {
      delete apiClient.defaults.headers.common["Authorization"];
      await clearToken();
      await clearUserData();
      setUserToken(null);
      setUser(null);
      setProfileStatus("idle");
    }
  };

  // Ambil ulang data /me. Juga dipakai tombol "Coba Lagi".
  // Bila profil sudah 'loaded', refresh berjalan senyap (tanpa kembali ke 'loading').
  const refreshUser = async () => {
    const sessionId = sessionRef.current;
    const token = userToken ?? (await getToken());
    if (!token) return;

    setProfileStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const fresh = await fetchProfile();
      if (sessionId !== sessionRef.current) return; // sesi sudah berganti
      if (fresh) {
        await saveUserData(fresh);
        setUser(fresh);
        setProfileStatus("loaded");
      } else {
        setProfileStatus((prev) => (prev === "loaded" ? prev : "error"));
      }
    } catch (error) {
      if (sessionId !== sessionRef.current) return;
      setProfileStatus((prev) => (prev === "loaded" ? prev : "error"));
      console.error("Gagal merefresh data user:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        userToken,
        user,
        profileStatus,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth harus digunakan di dalam AuthProvider");
  }
  return ctx;
}; 