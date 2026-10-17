import React from "react";
import { View, Text, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBadge } from "@/components/StatusBadge";
import { ParticipantCounter } from "@/components/ParticipantCounter";

export default function PreviewComponentsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-zinc-950 px-5"
      style={{ paddingTop: insets.top + 20 }}
    >
      <Text className="text-2xl font-bold text-white mb-1">
        Pratinjau Komponen SCRUM-59
      </Text>
      <Text className="text-xs text-zinc-400 mb-6">
        Komponen Reusable untuk Sprint 2 & Sprint 3
      </Text>

      {/* Section StatusBadge */}
      <View className="p-4 mb-5 bg-zinc-900 border border-zinc-800 rounded-2xl">
        <Text className="text-sm font-bold text-amber-400 mb-3 uppercase">
          Varian Status Badge
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <StatusBadge status="scheduled" />
          <StatusBadge status="cancelled" />
          <StatusBadge status="full" />
          <StatusBadge status="completed" />
        </View>
      </View>

      {/* Section ParticipantCounter */}
      <View className="p-4 mb-5 bg-zinc-900 border border-zinc-800 rounded-2xl">
        <Text className="text-sm font-bold text-amber-400 mb-3 uppercase">
          Varian Counter Peserta
        </Text>

        <View className="mb-4">
          <Text className="text-xs text-zinc-400 mb-1">Keadaan: Minimum Terpenuhi</Text>
          <ParticipantCounter current={8} min={5} />
        </View>

        <View>
          <Text className="text-xs text-zinc-400 mb-1">Keadaan: Kuota Kurang</Text>
          <ParticipantCounter current={2} min={5} />
        </View>
      </View>
    </ScrollView>
  );
}