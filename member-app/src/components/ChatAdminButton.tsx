import React from "react";
import { Alert, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";

import {
  buildWaLink,
  WhatsAppContext,
  WhatsAppData,
} from "../lib/whatsapp";

interface ChatAdminButtonProps {
  context: WhatsAppContext;
  data?: WhatsAppData;
}

export const ChatAdminButton: React.FC<ChatAdminButtonProps> = ({
  context,
  data,
}) => {
  const waLink = buildWaLink(context, data);

  if (!waLink) {
    return null;
  }

  const handlePress = async () => {
    try {
      const canOpen = await Linking.canOpenURL(waLink);

      if (!canOpen) {
        Alert.alert(
          "Tidak dapat membuka WhatsApp",
          "Silakan pastikan WhatsApp atau browser tersedia di perangkat Anda."
        );
        return;
      }

      await Linking.openURL(waLink);
    } catch {
      Alert.alert(
        "Gagal membuka WhatsApp",
        "Terjadi kesalahan saat mencoba membuka chat Admin."
      );
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Chat Admin melalui WhatsApp"
      className="w-full min-h-[52px] px-4 py-4 rounded-xl flex-row items-center justify-center bg-zinc-900 border border-emerald-500/40 active:bg-zinc-800"
    >
      <Ionicons name="logo-whatsapp" size={20} color="#34d399" />
      <Text className="ml-2 shrink text-center text-emerald-400 font-bold text-base">
        Chat Admin
      </Text>
    </TouchableOpacity>
  );
};
