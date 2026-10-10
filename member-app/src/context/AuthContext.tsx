import React, { createContext, useContext, useState, useEffect } from "react";
import {
  getToken,
  saveToken,
  clearToken,
  getUserData,
  saveUserData,
  clearUserData,
  UserData,
} from "@/lib/auth";
import { apiClient, registerUnauthorizedHandler, ApiError } from "@/lib/api";

interface AuthContextType {
  isLoading: boolean;
  userToken: string | null;
  user: UserData | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
          setUser(storedUser);
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
    // Sesuai Kontrak SCRUM-41: POST /api/v1/login dengan device_name: "mobile"
    // ✅ SINTAKS AXIOS (Benar):
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
      setUser(profile);
    }
    setUserToken(token);
  };

  const logout = async () => {
    try {
      // POST /api/v1/logout ke backend
      await apiClient("api/v1/logout", {
        method: "POST",
      });
    } catch {
      // Jika jaringan gagal, logout lokal tetap dieksekusi sesuai AC
    } finally {
      await clearToken();
      await clearUserData();
      setUserToken(null);
      setUser(null);
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