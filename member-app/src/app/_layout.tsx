import "../../global.css";
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "@/context/AuthContext";

function NavigationGate() {
  const { isLoading, userToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!userToken && !inAuthGroup) {
      // Jika belum login dan di luar (auth), arahkan ke login
      router.replace("/login" as any);
    } else if (userToken && inAuthGroup) {
      // Jika sudah login dan masih di (auth), arahkan ke layar utama (app)
      router.replace("/" as any);
    }
  }, [userToken, isLoading, segments]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950">
        <ActivityIndicator size="large" color="#fbbf24" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <NavigationGate />
    </AuthProvider>
  );
}