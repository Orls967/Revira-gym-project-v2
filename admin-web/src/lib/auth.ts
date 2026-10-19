export const TOKEN_KEY = 'auth_token';
export const USER_KEY = 'auth_user';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

export function setAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Alias untuk menjaga kompatibilitas dengan ProtectedRoute.tsx dan komponen lain
export const getAuthToken = getToken;

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export const getAuthUser = getUser;

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}