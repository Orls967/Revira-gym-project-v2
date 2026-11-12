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
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api from "@/lib/api";
import { ClassSchedule } from "@/types/schedule";
import { MOCK_SCHEDULES } from "@/mocks/schedules";

export type NormalizedScheduleStatus =
  | "scheduled"
  | "ongoing"
  | "cancelled"
  | "completed"
  | "full"
  | "unknown";

// Extended frontend model carrying normalized backend fields for SCRUM-72 & SCRUM-73
export type NormalizedSchedule = Omit<ClassSchedule, "status"> & {
  status: NormalizedScheduleStatus;
  raw_backend_status?: string;
  min_participants?: number | null;
  has_max_capacity?: boolean;
  updated_at?: string | null;
};

// Raw backend payload shape from GET /api/v1/class-schedules
export interface RawBackendSchedule {
  id?: number | string;
  title?: string;
  class_name?: string;
  name?: string;
  gym_class?: {
    name?: string;
    min_participants?: number | null;
    max_participants?: number | null;
  };
  instructor?: string | { name?: string };
  instructor_name?: string;
  date?: string;
  schedule_date?: string;
  start_time?: string;
  end_time?: string;
  status?: string;
  backend_status?: string;
  cancel_reason?: string | null;
  current_participants?: number;
  participants_count?: number;
  bookings_count?: number;
  min_participants?: number | null;
  max_participants?: number | null;
  max_capacity?: number | null;
  updated_at?: string | null;
}

// Helper: Extract YYYY-MM-DD safely
function normalizeDate(raw?: string): string {
  if (!raw || typeof raw !== "string") return "";
  const match = raw.trim().match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw.trim();
}

// Helper: Extract HH:mm safely from HH:mm:ss or HH:mm
function normalizeTime(raw?: string): string {
  if (!raw || typeof raw !== "string") return "";
  const match = raw.trim().match(/^(\d{2}:\d{2})/);
  return match ? match[1] : raw.trim();
}

// Helper: Map raw status string to NormalizedScheduleStatus (F4 & Temuan 7 ongoing)
export function mapBackendScheduleStatus(
  rawStatusInput?: string | null,
  isMockSource = false
): NormalizedScheduleStatus {
  const raw = (rawStatusInput ?? "").trim().toLowerCase();
  if (raw === "scheduled" || (isMockSource && raw === "active")) {
    return "scheduled";
  }
  if (raw === "ongoing") return "ongoing";
  if (raw === "cancelled") return "cancelled";
  if (raw === "completed") return "completed";
  if (raw === "full") return "full";
  return "unknown";
}

// --- F7 & F4: Adapter to normalize Backend API & Mock into a consistent model ---
export function normalizeScheduleItem(
  raw: RawBackendSchedule,
  isMockSource = false
): NormalizedSchedule | null {
  if (!raw || typeof raw !== "object") return null;

  const numericId = Number(raw.id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  const title = (
    raw.class_name ??
    raw.title ??
    raw.gym_class?.name ??
    raw.name ??
    ""
  ).trim();

  const instructorStr =
    typeof raw.instructor === "string"
      ? raw.instructor
      : raw.instructor_name ?? raw.instructor?.name ?? "-";

  const date = normalizeDate(raw.schedule_date ?? raw.date);
  const startTime = normalizeTime(raw.start_time);
  const endTime = normalizeTime(raw.end_time);

  const statusSource = raw.backend_status ?? raw.status;
  const normalizedStatus = mapBackendScheduleStatus(statusSource, isMockSource);

  const participantsCount = Number(
    raw.participants_count ??
      raw.current_participants ??
      raw.bookings_count ??
      0
  );

  // F8: Distinguish between explicit number (including 0) and undefined/null
  const rawMin = raw.min_participants ?? raw.gym_class?.min_participants;
  const minParticipants =
    typeof rawMin === "number" && !Number.isNaN(rawMin) ? rawMin : null;

  // F7: Do not invent max_participants if backend does not provide it
  const rawMax =
    raw.max_participants ??
    raw.max_capacity ??
    raw.gym_class?.max_participants;
  const hasMaxCapacity =
    typeof rawMax === "number" && !Number.isNaN(rawMax) && rawMax > 0;
  const maxParticipants = hasMaxCapacity ? rawMax : 0;

  return {
    id: numericId,
    title: title || "Kelas Gym",
    instructor: instructorStr.trim() || "-",
    date,
    start_time: startTime,
    end_time: endTime,
    status: normalizedStatus,
    raw_backend_status: statusSource,
    cancel_reason:
      raw.cancel_reason !== undefined && raw.cancel_reason !== null
        ? String(raw.cancel_reason)
        : undefined,
    current_participants: Number.isNaN(participantsCount)
      ? 0
      : participantsCount,
    max_participants: maxParticipants,
    min_participants: minParticipants,
    has_max_capacity: hasMaxCapacity,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : null,
  };
}

// Normalize initial mock data so offline fallback uses normalized contract
const INITIAL_NORMALIZED_MOCKS: NormalizedSchedule[] = MOCK_SCHEDULES.map((m) =>
  normalizeScheduleItem(
    {
      ...(m as RawBackendSchedule),
      max_participants: undefined,
    },
    true
  )
).filter((item): item is NormalizedSchedule => item !== null);

// Helper pengelompokan 7 hari dalam WITA
const groupSchedulesByDay = (
  items: NormalizedSchedule[]
): { title: string; date: string; data: NormalizedSchedule[] }[] => {
  const groups: { [dateKey: string]: NormalizedSchedule[] } = {};

  items.forEach((item) => {
    if (!item.date) return;
    if (!groups[item.date]) {
      groups[item.date] = [];
    }
    groups[item.date].push(item);
  });

  const sortedDates = Object.keys(groups).sort();

  const nowWitaMs = Date.now() + 8 * 60 * 60 * 1000;
  const todayStr = new Date(nowWitaMs).toISOString().split("T")[0];
  const tomorrowStr = new Date(nowWitaMs + 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  return sortedDates.map((dateStr) => {
    const dateObj = new Date(`${dateStr}T00:00:00+08:00`);
    let dayLabel = dateObj.toLocaleDateString("id-ID", {
      timeZone: "Asia/Makassar",
      weekday: "long",
      day: "numeric",
      month: "short",
    });

    if (dateStr === todayStr) {
      dayLabel = `Hari Ini • ${dayLabel}`;
    } else if (dateStr === tomorrowStr) {
      dayLabel = `Besok • ${dayLabel}`;
    }

    return {
      title: dayLabel,
      date: dateStr,
      data: groups[dateStr],
    };
  });
};

export default function ClassSchedulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [schedules, setSchedules] = useState<NormalizedSchedule[]>(
    INITIAL_NORMALIZED_MOCKS
  );
  const [refreshing, setRefreshing] = useState(false);
  const [isOfflineOrError, setIsOfflineOrError] = useState(false);

  const appState = useRef(AppState.currentState);

  // Grouping data dinamis 7 hari
  const sections = useMemo(() => groupSchedulesByDay(schedules), [schedules]);

  // Fetch & Normalize Data tanpa flicker
  const fetchSchedules = async (isBackgroundPolling = false) => {
    try {
      if (!isBackgroundPolling) setIsOfflineOrError(false);

      const res = await api.get("/api/v1/class-schedules");
      const rawList = res.data?.data ?? res.data;

      if (!Array.isArray(rawList)) {
        throw new Error("Invalid schedule list format");
      }

      const normalizedList = rawList
        .map((item: RawBackendSchedule) => normalizeScheduleItem(item, false))
        .filter((item): item is NormalizedSchedule => item !== null);

      setSchedules((prev) => {
        const scheduleMap = new Map<number, NormalizedSchedule>();
        normalizedList.forEach((newItem) => {
          const existing = prev.find((p) => p.id === newItem.id);
          scheduleMap.set(
            newItem.id,
            existing ? { ...existing, ...newItem } : newItem
          );
        });
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
      let intervalId: ReturnType<typeof setInterval> | null = null;
      appState.current = AppState.currentState;

      const startPolling = () => {
        if (intervalId) clearInterval(intervalId);
        if (appState.current === "active") {
          fetchSchedules(true);
        }
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
        if (intervalId) clearInterval(intervalId);
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
          const isCompleted = item.status === "completed";
          const isOngoing = item.status === "ongoing";
          const isUnknown = item.status === "unknown";
          const isFull =
            item.status === "full" ||
            (Boolean(item.has_max_capacity) &&
              item.max_participants > 0 &&
              item.current_participants >= item.max_participants);

          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                router.push({
                  pathname: `/schedule/${item.id}`,
                  params: { scheduleData: JSON.stringify(item) },
                } as any)
              }
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
                      : isCompleted || isUnknown
                      ? "bg-zinc-800 border border-zinc-700"
                      : isOngoing
                      ? "bg-amber-500/20 border border-amber-500/40"
                      : isFull
                      ? "bg-rose-500/20 border border-rose-500/40"
                      : "bg-emerald-500/20 border border-emerald-500/40"
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      isCancelled
                        ? "text-red-400"
                        : isCompleted || isUnknown
                        ? "text-zinc-400"
                        : isOngoing
                        ? "text-amber-400"
                        : isFull
                        ? "text-rose-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {isCancelled
                      ? "DIBATALKAN"
                      : isCompleted
                      ? "SELESAI"
                      : isOngoing
                      ? "BERLANGSUNG"
                      : isFull
                      ? "PENUH"
                      : isUnknown
                      ? "TIDAK DIKETAHUI"
                      : "TERJADWAL"}
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
                    {item.has_max_capacity && item.max_participants > 0
                      ? `${item.current_participants}/${item.max_participants} Peserta`
                      : typeof item.min_participants === "number"
                      ? `${item.current_participants} (Min. ${item.min_participants}) Peserta`
                      : `${item.current_participants} Peserta`}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}