import React from "react";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function Index() {
  const { isLoading, userToken } = useAuth();
  if (isLoading) return <View className="flex-1 items-center justify-center bg-zinc-950"><ActivityIndicator color="#f59e0b" /></View>;
  return <Redirect href={userToken ? "/(app)" : "/login"} />;
}
