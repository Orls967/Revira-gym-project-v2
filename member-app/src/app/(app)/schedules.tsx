import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  SectionList,
  RefreshControl,
  TouchableOpacity,
  AppState,
  AppStateStatus,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "@/lib/api";
import { ClassSchedule, ScheduleSection } from "@/types/schedule";
import { MOCK_SCHEDULES } from "@/mocks/schedules";

// Helper pengelompokan 7 hari
const groupSchedulesByDay = (items: ClassSchedule[]): ScheduleSection[] => {
  const groups: { [dateKey: string]: ClassSchedule[] } = {};

  items.forEach((item) => {
    if (!groups[item.date]) {
      groups[item.date] = [];
    }
    groups[item.date].push(item);
  });

  const sortedDates = Object.keys(groups).sort();
  const todayStr = new Date().toISOString().split("T")[0];

  return sortedDates.map((dateStr) => {
    const dateObj = new Date(dateStr + "T00:00:00");
    let dayLabel = dateObj.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });

    if (dateStr === todayStr) {
      dayLabel = `Hari Ini • ${dayLabel}`;
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (dateStr === tomorrow.toISOString().split("T")[0]) {
        dayLabel = `Besok • ${dayLabel}`;
      }
    }

    return {
      title: dayLabel,
      date: dateStr,
      data: groups[dateStr],
    };
  });
};

export default function ClassSchedulesScreen() {
  const insets = useSafeAreaInsets();
  const [schedules, setSchedules] = useState<ClassSchedule[]>(MOCK_SCHEDULES);
  const [refreshing, setRefreshing] = useState(false);
  const [isOfflineOrError, setIsOfflineOrError] = useState(false);

  const appState = useRef(AppState.currentState);

  // Grouping data dinamis 7 hari
  const sections = useMemo(() => groupSchedulesByDay(schedules), [schedules]);

  // Fetch & Merge Data tanpa flicker
  const fetchSchedules = async (isBackgroundPolling = false) => {
    try {
      if (!isBackgroundPolling) setIsOfflineOrError(false);

      const res = await api.get("/api/v1/class-schedules");
      const freshData: ClassSchedule[] = res.data.data;

      setSchedules((prev) => {
        const scheduleMap = new Map(prev.map((item) => [item.id, item]));
        freshData.forEach((newItem) => scheduleMap.set(newItem.id, newItem));
        return Array.from(scheduleMap.values());
      });

      setIsOfflineOrError(false);
    } catch {
      if (!isBackgroundPolling) {
        setIsOfflineOrError(true);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // Polling (15 Detik) hanya saat Screen Active & Focused
  useFocusEffect(
    useCallback(() => {
      let intervalId: ReturnType<typeof setInterval>;

      const startPolling = () => {
        fetchSchedules(true);
        intervalId = setInterval(() => {
          if (appState.current === "active") {
            fetchSchedules(true);
          }
        }, 15000);
      };

      const subscription = AppState.addEventListener(
        "change",
        (nextAppState: AppStateStatus) => {
          appState.current = nextAppState;
          if (nextAppState === "active") {
            fetchSchedules(true);
          }
        }
      );

      startPolling();

      return () => {
        clearInterval(intervalId);
        subscription.remove();
      };
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchSchedules(false);
  };

  return (
    <View className="flex-1 bg-zinc-950" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-5 py-4 border-b border-zinc-800/60 flex-row items-center justify-between">
        <View>
          <Text className="text-3xl font-bold text-white">Jadwal Kelas</Text>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          className="p-2 bg-zinc-900 rounded-lg border border-zinc-800"
        >
          <Ionicons name="refresh-outline" size={20} color="#fbbf24" />
        </TouchableOpacity>
      </View>

      {/* Banner Offline / Fallback Data */}
      {isOfflineOrError && (
        <View className="bg-amber-500/10 border-b border-amber-500/30 px-5 py-2.5 flex-row items-center">
          <Ionicons name="wifi-outline" size={16} color="#fbbf24" />
          <Text className="text-amber-400 text-xs ml-2 font-medium flex-1">
            Menampilkan data cache/mock terbaru. Memeriksa koneksi...
          </Text>
        </View>
      )}

      {/* Section List per Hari */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fbbf24"
          />
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        renderSectionHeader={({ section: { title } }) => (
          <View className="bg-zinc-950 pt-5 pb-2.5">
            <Text className="text-sm font-bold text-amber-400 uppercase tracking-wider">
              {title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const isCancelled = item.status === "cancelled";
          const isFull = item.current_participants >= item.max_participants;

          return (
            <View
              className={`p-4 mb-3 rounded-2xl border ${
                isCancelled
                  ? "bg-red-950/20 border-red-900/40"
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 mr-2">
                  <Text className="text-base font-bold text-white mb-1">
                    {item.title}
                  </Text>
                  <View className="flex-row items-center">
                    <Ionicons name="person-outline" size={14} color="#a1a1aa" />
                    <Text className="text-xs text-zinc-400 ml-1">
                      {item.instructor}
                    </Text>
                  </View>
                </View>

                {/* Badge Status */}
                <View
                  className={`px-2.5 py-1 rounded-full ${
                    isCancelled
                      ? "bg-red-500/20 border border-red-500/40"
                      : isFull
                      ? "bg-rose-500/20 border border-rose-500/40"
                      : "bg-emerald-500/20 border border-emerald-500/40"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      isCancelled
                        ? "text-red-400"
                        : isFull
                        ? "text-rose-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {isCancelled ? "DIBATALKAN" : isFull ? "PENUH" : "TERSEDIA"}
                  </Text>
                </View>
              </View>

              {/* Alasan Pembatalan (jika status cancelled) */}
              {isCancelled && item.cancel_reason && (
                <View className="mt-2.5 p-2 rounded-lg bg-red-900/30 border border-red-800/40">
                  <Text className="text-xs text-red-300 italic">
                    Ket: {item.cancel_reason}
                  </Text>
                </View>
              )}

              {/* Waktu WITA & Counter Peserta */}
              <View className="mt-3.5 pt-3 border-t border-zinc-800/60 flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Ionicons name="time-outline" size={14} color="#fbbf24" />
                  <Text className="text-xs font-semibold text-amber-400 ml-1.5">
                    {item.start_time} - {item.end_time} WITA
                  </Text>
                </View>

                <View className="flex-row items-center">
                  <Ionicons
                    name="people-outline"
                    size={14}
                    color={isFull ? "#f87171" : "#a1a1aa"}
                  />
                  <Text
                    className={`text-xs font-medium ml-1.5 ${
                      isFull ? "text-red-400" : "text-zinc-400"
                    }`}
                  >
                    {item.current_participants}/{item.max_participants} Peserta
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}