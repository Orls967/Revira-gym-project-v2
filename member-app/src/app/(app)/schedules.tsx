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
  id?: unknown;
  title?: unknown;
  class_name?: unknown;
  name?: unknown;
  gym_class?: {
    name?: unknown;
    min_participants?: unknown;
    max_participants?: unknown;
  } | null;
  instructor?: unknown;
  instructor_name?: unknown;
  date?: unknown;
  schedule_date?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  status?: unknown;
  backend_status?: unknown;
  cancel_reason?: unknown;
  current_participants?: unknown;
  participants_count?: unknown;
  bookings_count?: unknown;
  min_participants?: unknown;
  max_participants?: unknown;
  max_capacity?: unknown;
  updated_at?: unknown;
}

// --- F5: Safe runtime string helper (never calls .trim() on non-strings) ---
export function toNonEmptyTrimmedString(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// --- F5: Strict real calendar date validator (rejects 2026-02-31, 2026-13-01, etc.) ---
export function isValidCalendarDateString(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

// Extract & validate YYYY-MM-DD calendar date safely
export function normalizeValidDate(raw: unknown): string | null {
  const str = toNonEmptyTrimmedString(raw);
  if (!str) return null;
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const candidate = match[1];
  return isValidCalendarDateString(candidate) ? candidate : null;
}

// --- F5: Validate & normalize time string (preserves seconds if non-zero so precision is never lost) ---
export function normalizeValidTime(raw: unknown): string | null {
  const str = toNonEmptyTrimmedString(raw);
  if (!str) return null;

  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] !== undefined ? Number(match[3]) : 0;

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  // Keep HH:mm for standard contract, but preserve HH:mm:ss if non-zero seconds exist
  if (match[3] !== undefined && seconds > 0) {
    return `${match[1]}:${match[2]}:${match[3]}`;
  }
  return `${match[1]}:${match[2]}`;
}

// --- F5 & F8: Parse finite non-negative integer (rejects null, NaN, floats, strings, negatives) ---
export function parseNonNegativeInt(val: unknown): number | null {
  if (typeof val !== "number" || !Number.isFinite(val) || !Number.isInteger(val)) {
    return null;
  }
  return val >= 0 ? val : null;
}

// Helper: Map raw status string to NormalizedScheduleStatus (F4 & ongoing)
export function mapBackendScheduleStatus(
  rawStatusInput: unknown,
  isMockSource = false
): NormalizedScheduleStatus {
  const str = toNonEmptyTrimmedString(rawStatusInput);
  if (!str) return "unknown";
  const raw = str.toLowerCase();
  if (raw === "scheduled" || (isMockSource && raw === "active")) {
    return "scheduled";
  }
  if (raw === "ongoing") return "ongoing";
  if (raw === "cancelled") return "cancelled";
  if (raw === "completed") return "completed";
  if (raw === "full") return "full";
  return "unknown";
}

// --- F5, F7, F8: Strict Adapter normalizing Backend API & Mock into a validated frontend model ---
export function normalizeScheduleItem(
  raw: unknown,
  isMockSource = false
): NormalizedSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as RawBackendSchedule;

  // Validate positive integer ID
  const numericId =
    typeof item.id === "number"
      ? item.id
      : typeof item.id === "string" && /^\d+$/.test(item.id.trim())
      ? Number(item.id.trim())
      : NaN;

  if (!Number.isInteger(numericId) || !Number.isFinite(numericId) || numericId <= 0) {
    return null;
  }

  // Validate required class title
  const gymClassObj =
    item.gym_class && typeof item.gym_class === "object" ? item.gym_class : null;
  const title =
    toNonEmptyTrimmedString(item.class_name) ??
    toNonEmptyTrimmedString(item.title) ??
    toNonEmptyTrimmedString(gymClassObj?.name) ??
    toNonEmptyTrimmedString(item.name);

  if (!title) return null;

  // Validate required instructor name
  const instructorObj =
    item.instructor && typeof item.instructor === "object"
      ? (item.instructor as { name?: unknown })
      : null;
  const instructor =
    toNonEmptyTrimmedString(item.instructor_name) ??
    toNonEmptyTrimmedString(item.instructor) ??
    toNonEmptyTrimmedString(instructorObj?.name);

  if (!instructor) return null;

  // Validate required calendar date & times
  const date = normalizeValidDate(item.schedule_date ?? item.date);
  const startTime = normalizeValidTime(item.start_time);
  const endTime = normalizeValidTime(item.end_time);

  if (!date || !startTime || !endTime) {
    return null;
  }

  // Validate status
  const statusSource =
    toNonEmptyTrimmedString(item.backend_status) ??
    toNonEmptyTrimmedString(item.status) ??
    "scheduled";
  const normalizedStatus = mapBackendScheduleStatus(statusSource, isMockSource);

  // Validate required participant counter (must be non-negative integer)
  const rawCountSource =
    item.participants_count !== undefined
      ? item.participants_count
      : item.current_participants !== undefined
      ? item.current_participants
      : item.bookings_count;

  const participantsCount = parseNonNegativeInt(rawCountSource);
  if (participantsCount === null) {
    return null;
  }

  // F8: Validate min_participants (only finite integer >= 0 is valid; negative/null/invalid -> null/unknown)
  const rawMinSource =
    item.min_participants !== undefined
      ? item.min_participants
      : gymClassObj?.min_participants;
  const minParticipants = parseNonNegativeInt(rawMinSource);

  // F7: Do not invent max_participants unless explicitly provided as positive integer
  const rawMaxSource =
    item.max_participants !== undefined
      ? item.max_participants
      : item.max_capacity !== undefined
      ? item.max_capacity
      : gymClassObj?.max_participants;
  const parsedMax = parseNonNegativeInt(rawMaxSource);
  const hasMaxCapacity = parsedMax !== null && parsedMax > 0;
  const maxParticipants = hasMaxCapacity ? parsedMax : 0;

  const cancelReason =
    typeof item.cancel_reason === "string"
      ? item.cancel_reason.trim()
      : undefined;

  const updatedAt = toNonEmptyTrimmedString(item.updated_at);

  return {
    id: numericId,
    title,
    instructor,
    date,
    start_time: startTime,
    end_time: endTime,
    status: normalizedStatus,
    raw_backend_status: statusSource,
    cancel_reason: cancelReason,
    current_participants: participantsCount,
    max_participants: maxParticipants,
    min_participants: minParticipants,
    has_max_capacity: hasMaxCapacity,
    updated_at: updatedAt,
  };
}

// Normalize initial mock data so offline fallback uses normalized contract
const INITIAL_NORMALIZED_MOCKS: NormalizedSchedule[] = MOCK_SCHEDULES.map((m) =>
  normalizeScheduleItem(
    {
      ...(m as unknown as RawBackendSchedule),
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
        .map((item: unknown) => normalizeScheduleItem(item, false))
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

          const hasValidMin =
            typeof item.min_participants === "number" &&
            Number.isInteger(item.min_participants) &&
            item.min_participants >= 0;

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
                      : hasValidMin
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