import React, { createContext, useContext, useState, useEffect } from "react";
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

// Extend tipe UserData untuk menambahkan membership, nomor HP, dan pengajuan pending
export interface UserData extends BaseUserData {
  phone?: string; // lama, dipertahankan agar kode lain tidak rusak
  membership?: MembershipInfo | null;
  // TODO: sesuaikan nama/bentuk field ini dengan kesepakatan bersama PIC backend (Orlando)
  pending_membership?: MembershipInfo | null;
}

interface AuthContextType {
  isLoading: boolean;
  userToken: string | null;
  user: UserData | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);

  // Auto-login: Memeriksa keberadaan token di SecureStore saat aplikasi baru dibuka
  useEffect(() => {
    async function initSession() {
      try {
        const storedToken = await getToken();
        const storedUser = await getUserData();

        if (storedToken) {
          setUserToken(storedToken);
          setUser(storedUser as UserData);
        }
      } catch {
        // Abaikan error pembacaan storage awal
      } finally {
        setIsLoading(false);
      }
    }

    initSession();

    registerUnauthorizedHandler(() => {
      setUserToken(null);
      setUser(null);
    });
  }, []);

  const login = async (email: string, password: string) => {
    const result = await apiClient.post("/api/v1/login", {
      email,
      password,
      device_name: "mobile",
    });

    const token = result.data?.token || result.data?.data?.token;
    const profile = result.data?.user || result.data?.data?.user;

    if (!token) {
      throw new ApiError(500, "Format data respon tidak memiliki token.");
    }

    await saveToken(token);
    if (profile) {
      await saveUserData(profile);
      setUser(profile as UserData);
    }
    setUserToken(token);
  };

  const logout = async () => {
    try {
      await apiClient("api/v1/logout", {
        method: "POST",
      });
    } catch {
      // Jika jaringan gagal, logout lokal tetap dieksekusi
    } finally {
      await clearToken();
      await clearUserData();
      setUserToken(null);
      setUser(null);
    }
  };

  // Ambil ulang data /me dari API
  const refreshUser = async () => {
    try {
      const result = await apiClient.get("/api/v1/me");
      const profile = result.data?.data || result.data;
      if (profile) {
        await saveUserData(profile);
        setUser(profile as UserData);
      }
    } catch (error) {
      console.error("Gagal merefresh data user:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        userToken,
        user,
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
