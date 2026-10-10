import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface ParticipantCounterProps {
  current: number;
  min: number;
}

export const ParticipantCounter: React.FC<ParticipantCounterProps> = ({
  current,
  min,
}) => {
  const isMinMet = current >= min;
  const needed = min - current;

  return (
    <View className="flex-col items-start">
      <View className="flex-row items-center">
        <Ionicons
          name="people-outline"
          size={14}
          color={isMinMet ? "#34d399" : "#fbbf24"}
        />
        <Text className="text-xs font-semibold text-zinc-300 ml-1.5">
          {current} dari minimal {min} peserta
        </Text>
      </View>

      <View className="mt-0.5">
        {isMinMet ? (
          <Text className="text-[10px] font-bold text-emerald-400">
            ✓ Minimum terpenuhi
          </Text>
        ) : (
          <Text className="text-[10px] font-bold text-amber-400">
            • Butuh {needed} orang lagi
          </Text>
        )}
      </View>
    </View>
  );
};