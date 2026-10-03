import React, { useState } from "react";
import { View, Text } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/Button";
import { Ionicons } from "@expo/vector-icons";

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <View className="flex-1 bg-zinc-950 px-6 justify-center items-center">
      <View className="w-20 h-20 bg-amber-400/10 rounded-full items-center justify-center border border-amber-400/20 mb-4">
        <Ionicons name="person" size={36} color="#fbbf24" />
      </View>

      <Text className="text-zinc-400 text-sm">Selamat Datang,</Text>
      <Text className="text-white text-2xl font-bold mt-1 text-center">
        {user?.name || "Member Revira"}
      </Text>
      <Text className="text-zinc-500 text-sm mt-1">{user?.email}</Text>

      <View className="w-full mt-10">
        <Button
          title="Keluar"
          onPress={handleLogout}
          loading={isLoggingOut}
        />
      </View>
    </View>
  );
}