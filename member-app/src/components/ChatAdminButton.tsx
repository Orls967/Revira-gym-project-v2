import React from "react";
import { Alert, Text, TouchableOpacity } from "react-native";
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
      className="w-full py-4 rounded-xl items-center justify-center bg-emerald-500 active:bg-emerald-600"
    >
      <Text className="text-white font-bold text-base">Chat Admin</Text>
    </TouchableOpacity>
  );
};