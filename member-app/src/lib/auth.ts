import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "revira_auth_token";
const USER_KEY = "revira_user_data";

export interface UserData {
  id: number;
  name: string;
  email: string;
  phone_number?: string;
  role: "admin" | "member";
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function saveUserData(user: UserData): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getUserData(): Promise<UserData | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserData;
  } catch {
    return null;
  }
}

export async function clearUserData(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}