import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type ScheduleStatus = "scheduled" | "cancelled" | "completed" | "full";

export interface StatusBadgeProps {
  status: ScheduleStatus;
  customText?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, customText }) => {
  const getBadgeConfig = () => {
    switch (status) {
      case "scheduled":
        return {
          label: customText || "Terjadwal",
          bgColor: "bg-emerald-500/20",
          borderColor: "border-emerald-500/40",
          textColor: "text-emerald-400",
          iconName: "checkmark-circle-outline" as const,
          iconColor: "#34d399",
        };
      case "cancelled":
        return {
          label: customText || "Dibatalkan",
          bgColor: "bg-red-500/20",
          borderColor: "border-red-500/40",
          textColor: "text-red-400",
          iconName: "close-circle-outline" as const,
          iconColor: "#f87171",
        };
      case "full":
        return {
          label: customText || "Penuh",
          bgColor: "bg-rose-500/20",
          borderColor: "border-rose-500/40",
          textColor: "text-rose-400",
          iconName: "alert-circle-outline" as const,
          iconColor: "#fb7185",
        };
      case "completed":
        return {
          label: customText || "Selesai",
          bgColor: "bg-zinc-800",
          borderColor: "border-zinc-700",
          textColor: "text-zinc-400",
          iconName: "time-outline" as const,
          iconColor: "#a1a1aa",
        };
      default:
        return {
          label: customText || "Unknown",
          bgColor: "bg-zinc-800",
          borderColor: "border-zinc-700",
          textColor: "text-zinc-400",
          iconName: "help-circle-outline" as const,
          iconColor: "#a1a1aa",
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <View
      className={`flex-row items-center px-2.5 py-1 rounded-full border ${config.bgColor} ${config.borderColor}`}
    >
      <Ionicons name={config.iconName} size={12} color={config.iconColor} />
      <Text className={`text-[10px] font-bold ml-1 uppercase tracking-wide ${config.textColor}`}>
        {config.label}
      </Text>
    </View>
  );
};