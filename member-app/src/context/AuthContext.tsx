import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { getToken, saveToken, clearToken, getUserData, saveUserData, clearUserData, UserData as BaseUserData } from "@/lib/auth";
import { apiClient, registerUnauthorizedHandler, ApiError } from "@/lib/api";

export interface MembershipInfo {
  status: string;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}
export interface UserData extends BaseUserData {
  membership?: MembershipInfo | null;
  has_pending_application?: boolean;
}
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
const AuthContext = createContext<AuthContextType | undefined>(undefined);
type SessionRequest = { url?: string; _sessionVersion?: number };

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("idle");
  const generation = useRef(0);
  const profileRequest = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const mounted = useRef(true);
  // Serialize storage mutations: an old save cannot finish after a newer clear/save.
  const storageQueue = useRef<Promise<unknown>>(Promise.resolve());
  const persist = (version: number, write: () => Promise<void>) => {
    const job = storageQueue.current.catch(() => undefined).then(async () => {
      if (mounted.current && version === generation.current) await write();
    });
    storageQueue.current = job;
    return job;
  };
  const current = (version: number) => mounted.current && version === generation.current;
  const installToken = (token: string | null) => {
    tokenRef.current = token;
    if (token) apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
    else delete apiClient.defaults.headers.common.Authorization;
    setUserToken(token);
  };
  const clearSession = async () => {
    const version = ++generation.current;
    installToken(null);
    setUser(null);
    setProfileStatus("idle");
    await persist(version, async () => { await clearToken(); await clearUserData(); });
  };
  const loadProfile = async (version: number) => {
    const request = ++profileRequest.current;
    const latest = () => current(version) && request === profileRequest.current;
    try {
      const result = await apiClient.get("/api/v1/me");
      if (!latest()) return;
      const profile = result.data?.data ?? result.data;
      if (!profile || !Number.isInteger(profile.id)) throw new ApiError(500, "Format profil tidak valid.");
      await persist(version, () => saveUserData(profile));
      if (!latest()) return;
      setUser(profile as UserData);
      setProfileStatus("loaded");
    } catch (error: any) {
      if (!latest()) return;
      if ((error.status ?? error.response?.status) === 401) {
        await clearSession();
        return;
      }
      // Network/500 keeps authentication, but never treats cached eligibility as verified.
      setProfileStatus("error");
    }
  };

  useEffect(() => {
    mounted.current = true;
    const req = apiClient.interceptors.request.use((config) => {
      (config as typeof config & SessionRequest)._sessionVersion = generation.current;
      if (config.url?.endsWith("/logout")) return config;
      if (tokenRef.current) config.headers.Authorization = `Bearer ${tokenRef.current}`;
      else if (!config.url?.endsWith("/logout")) config.headers.delete("Authorization");
      return config;
    });
    const removeUnauthorized = registerUnauthorizedHandler((error) => {
      const request = error.config as SessionRequest | undefined;
      // A 401 from an older request or invalid login must not terminate a newer session.
      if (request?._sessionVersion === generation.current && tokenRef.current && !request.url?.endsWith("/login") && !request.url?.endsWith("/logout")) {
        void clearSession().catch(() => undefined);
      }
    });
    const version = generation.current;
    void (async () => {
      try {
        const storedToken = await getToken();
        const cached = await getUserData();
        if (!current(version) || !storedToken) return;
        installToken(storedToken);
        setUser(cached as UserData | null);
        setProfileStatus("loading");
        await loadProfile(version);
      } catch {
        if (current(version)) setProfileStatus("error");
      } finally {
        if (mounted.current) setIsLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
      generation.current += 1;
      apiClient.interceptors.request.eject(req);
      removeUnauthorized();
    };
    // The provider owns one set of interceptors for its entire lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, password: string) => {
    const version = ++generation.current;
    installToken(null);
    setUser(null);
    setProfileStatus("loading");
    await persist(version, async () => { await clearToken(); await clearUserData(); });
    if (!current(version)) return;
    try {
      const result = await apiClient.post("/api/v1/login", { email, password, device_name: "mobile" });
      if (!current(version)) return;
      const data = result.data?.data ?? result.data;
      const token = data?.token ?? data?.access_token;
      if (!token) throw new ApiError(500, "Format respons tidak memiliki token.");
      installToken(token);
      await persist(version, () => saveToken(token));
      if (!current(version)) return;
      await loadProfile(version);
      if (!current(version)) throw new ApiError(401, "Sesi tidak valid. Silakan masuk kembali.");
    } catch (error) {
      if (current(version)) await clearSession();
      throw error;
    }
  };
  const logout = async () => {
    const oldToken = tokenRef.current;
    await clearSession();
    try {
      if (oldToken) await apiClient.post("/api/v1/logout", undefined, { headers: { Authorization: `Bearer ${oldToken}` } });
    } catch { /* Local logout remains final even if the network fails. */ }
  };
  const refreshUser = async () => {
    if (!tokenRef.current) return;
    const version = generation.current;
    setProfileStatus("loading");
    await loadProfile(version);
  };
  return <AuthContext.Provider value={{ isLoading, userToken, user, profileStatus, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth harus digunakan di dalam AuthProvider");
  return context;
};
