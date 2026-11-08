import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import api from "@/lib/api";
import { getToken, UserData } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { ParticipantCounter } from "@/components/ParticipantCounter";
import { StatusBadge, ScheduleStatus } from "@/components/StatusBadge";
import { ClassSchedule } from "@/types/schedule";

// Local Axios error interface to avoid TypeScript errors on .response
interface AxiosErrorResponse {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
  message?: string;
}

// Extended schedule type matching backend contract without altering src/types/schedule.ts
type ExtendedSchedule = Omit<ClassSchedule, "status"> & {
  status: "scheduled" | "active" | "cancelled" | "completed" | "full";
  min_participants?: number;
  participants_count?: number;
  max_capacity?: number;
};

// Extended UserData type for B6 membership period validation without altering src/lib/auth.ts
type ExtendedUserData = UserData & {
  is_active?: boolean;
  membership_status?: string;
  membership_start_date?: string;
  membership_end_date?: string;
  active_until?: string;
  expires_at?: string;
  membership?: {
    status?: string;
    is_active?: boolean;
    start_date?: string;
    end_date?: string;
    expires_at?: string;
  };
};

// MemberBookingResource item structure from GET /api/v1/member/bookings
interface BookingResourceItem {
  id?: number;
  status?: string;
  schedule_id?: number;
  class_schedule_id?: number;
  schedule?: {
    id?: number;
  };
  class_schedule?: {
    id?: number;
  };
}

type PopupState = {
  visible: boolean;
  type: "confirm" | "success" | "error" | "unauthorized";
  title: string;
  message: string;
};

// Helper: Normalize HH:mm or HH:mm:ss into HH:mm:ss
function normalizeTimeString(timeStr: string): string {
  const clean = timeStr.trim();
  if (/^\d{2}:\d{2}$/.test(clean)) return `${clean}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(clean)) return clean;
  return "00:00:00";
}

// Helper: Parse YYYY-MM-DD + HH:mm explicitly in WITA (UTC+08:00)
function parseWitaDateTime(dateStr: string, timeStr: string): Date {
  const normalizedTime = normalizeTimeString(timeStr);
  return new Date(`${dateStr}T${normalizedTime}+08:00`);
}

// Helper: Extract YYYY-MM-DD from any ISO/date string
function extractDateOnly(dateInput?: string | null): string | null {
  if (!dateInput || typeof dateInput !== "string") return null;
  const match = dateInput.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

// Helper: Validate B6 Membership Eligibility on Session Date
function checkMemberEligibility(
  user: UserData | null,
  sessionDate: string
): { eligible: boolean; reason: string } {
  if (!user) {
    return { eligible: false, reason: "Membership Anda belum aktif." };
  }

  const u = user as ExtendedUserData;
  const endDateRaw =
    u.membership?.end_date ||
    u.membership?.expires_at ||
    u.membership_end_date ||
    u.active_until ||
    u.expires_at;
  const startDateRaw = u.membership?.start_date || u.membership_start_date;

  const endDate = extractDateOnly(endDateRaw);
  const startDate = extractDateOnly(startDateRaw);

  const explicitActive =
    u.is_active === true ||
    u.membership?.is_active === true ||
    u.membership_status === "active" ||
    u.membership?.status === "active";

  const explicitInactive =
    u.is_active === false ||
    u.membership?.is_active === false ||
    (u.membership_status !== undefined && u.membership_status !== "active") ||
    (u.membership?.status !== undefined && u.membership?.status !== "active");

  if (explicitInactive) {
    return { eligible: false, reason: "Membership Anda belum aktif." };
  }

  // Check if session date falls within [startDate, endDate]
  if (startDate && sessionDate < startDate) {
    return {
      eligible: false,
      reason: "Membership Anda belum berlaku pada tanggal sesi ini.",
    };
  }

  if (endDate) {
    if (sessionDate > endDate) {
      return {
        eligible: false,
        reason: "Masa aktif membership Anda berakhir sebelum tanggal sesi ini.",
      };
    }
    return { eligible: true, reason: "" };
  }

  if (explicitActive) {
    return { eligible: true, reason: "" };
  }

  // Strict fallback: if neither active flag nor valid period exists, treat as inactive
  return { eligible: false, reason: "Membership Anda belum aktif." };
}

export default function ScheduleDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    scheduleData?: string | string[];
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, userToken } = useAuth();

  const rawIdParam = Array.isArray(params.id) ? params.id[0] : params.id;
  const rawScheduleData = Array.isArray(params.scheduleData)
    ? params.scheduleData[0]
    : params.scheduleData;

  // --- TEMUAN 9 & 10: Safe JSON Parsing, Payload Validation & Route ID Matching ---
  const schedule = useMemo<ExtendedSchedule | null>(() => {
    if (!rawScheduleData) return null;
    try {
      const parsed = JSON.parse(rawScheduleData) as Partial<ExtendedSchedule>;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.id !== "number" ||
        typeof parsed.title !== "string" ||
        typeof parsed.date !== "string" ||
        typeof parsed.start_time !== "string" ||
        typeof parsed.end_time !== "string"
      ) {
        return null;
      }

      // Ensure route param [id] matches parsed schedule.id
      if (rawIdParam !== undefined && Number(rawIdParam) !== parsed.id) {
        return null;
      }

      return parsed as ExtendedSchedule;
    } catch {
      return null;
    }
  }, [rawScheduleData, rawIdParam]);

  const scheduleId = schedule?.id;

  const initialParticipants =
    schedule?.current_participants ?? schedule?.participants_count ?? 0;

  // Local state for AC2 (Reactive counter & booking status without reload)
  const [localParticipants, setLocalParticipants] =
    useState<number>(initialParticipants);
  const [hasBooked, setHasBooked] = useState(false);

  // Loading & Error states for GET /api/v1/member/bookings (Temuan 11 & 12)
  const [isCheckingBooking, setIsCheckingBooking] = useState(true);
  const [bookingCheckError, setBookingCheckError] = useState<string | null>(
    null
  );
  const [isBooking, setIsBooking] = useState(false);

  // Real-time clock state to re-evaluate WITA session start eligibility (Temuan 5 & 6)
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Custom Themed Popup Modal state
  const [popup, setPopup] = useState<PopupState>({
    visible: false,
    type: "confirm",
    title: "",
    message: "",
  });

  const closePopup = () => {
    if (isBooking) return;
    setPopup((prev) => ({ ...prev, visible: false }));
  };

  // --- TEMUAN 1, 2, 11, 12: Check existing booking with nested schedule.id & retry support ---
  const checkUserBooking = useCallback(async () => {
    if (!scheduleId) {
      setIsCheckingBooking(false);
      return;
    }

    setIsCheckingBooking(true);
    setBookingCheckError(null);

    try {
      const token = userToken || (await getToken());
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const res = await api.get("/api/v1/member/bookings", { headers });

      const rawList = res.data?.data ?? res.data;
      const bookings: BookingResourceItem[] = Array.isArray(rawList)
        ? rawList
        : [];

      const alreadyBooked = bookings.some((b) => {
        const bookedScheduleId =
          b.schedule?.id ??
          b.class_schedule?.id ??
          b.schedule_id ??
          b.class_schedule_id;

        // Ignore cancelled bookings so member can re-book if allowed
        const isBookingActive =
          !b.status || b.status.toLowerCase() !== "cancelled";

        return Number(bookedScheduleId) === scheduleId && isBookingActive;
      });

      setHasBooked(alreadyBooked);
    } catch (err: unknown) {
      const error = err as AxiosErrorResponse;
      setBookingCheckError(
        error.response?.data?.message ||
          "Gagal memeriksa status booking Anda. Silakan coba lagi."
      );
    } finally {
      setIsCheckingBooking(false);
    }
  }, [scheduleId, userToken]);

  useEffect(() => {
    checkUserBooking();
  }, [checkUserBooking]);

  if (!schedule || !scheduleId) {
    return (
      <View
        className="flex-1 items-center justify-center bg-zinc-950 px-6"
        style={{ paddingTop: insets.top }}
      >
        <Ionicons name="alert-circle-outline" size={48} color="#f87171" />
        <Text className="text-white text-lg font-bold mt-3 text-center">
          Data Sesi Tidak Valid atau Tidak Ditemukan
        </Text>
        <Text className="text-zinc-400 text-xs text-center mt-1">
          Parameter jadwal tidak sesuai. Silakan pilih ulang dari daftar jadwal.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-5 bg-zinc-900 px-6 py-3 rounded-xl border border-zinc-800"
        >
          <Text className="text-amber-400 font-semibold">Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Format date in WITA timezone
  const formattedDate = parseWitaDateTime(
    schedule.date,
    "00:00:00"
  ).toLocaleDateString("id-ID", {
    timeZone: "Asia/Makassar",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // --- BOOKING VALIDATION LOGIC (Temuan 3, 4, 5, 6, 7, 8) ---
  const rawStatus = schedule.status;
  const isCancelled = rawStatus === "cancelled";

  // Check WITA session start & end times
  const sessionStartMs = parseWitaDateTime(
    schedule.date,
    schedule.start_time
  ).getTime();
  const sessionEndMs = parseWitaDateTime(
    schedule.date,
    schedule.end_time
  ).getTime();

  const isSessionStarted = nowTimestamp >= sessionStartMs;
  const isSessionCompleted =
    rawStatus === "completed" || nowTimestamp >= sessionEndMs;

  // Backend contract: only "scheduled" (or frontend mock "active") is bookable
  const isScheduledStatus =
    rawStatus === "scheduled" || rawStatus === "active";

  // Capacity check (only if max_participants is a positive number)
  const maxCapacity = schedule.max_participants ?? schedule.max_capacity ?? 0;
  const isFull =
    rawStatus === "full" || (maxCapacity > 0 && localParticipants >= maxCapacity);

  // Membership eligibility check on session date (B6)
  const membershipCheck = checkMemberEligibility(user, schedule.date);

  // Determine StatusBadge prop strictly matching ScheduleStatus
  const badgeStatus: ScheduleStatus = isCancelled
    ? "cancelled"
    : isSessionCompleted
    ? "completed"
    : isFull
    ? "full"
    : "scheduled";

  // Determine disabled reason in priority order
  let buttonDisabledReason = "";
  if (isCancelled) {
    buttonDisabledReason = "Sesi telah dibatalkan.";
  } else if (isSessionCompleted) {
    buttonDisabledReason = "Sesi kelas telah selesai.";
  } else if (!isScheduledStatus) {
    buttonDisabledReason = "Sesi tidak dalam status terjadwal untuk dibooking.";
  } else if (hasBooked) {
    buttonDisabledReason = "Anda sudah mem-booking sesi ini.";
  } else if (isSessionStarted) {
    buttonDisabledReason = "Sesi kelas sudah dimulai/berakhir.";
  } else if (!membershipCheck.eligible) {
    buttonDisabledReason = membershipCheck.reason;
  } else if (isFull) {
    buttonDisabledReason = "Kapasitas kelas sudah penuh.";
  }

  const canBook =
    buttonDisabledReason === "" && !isCheckingBooking && !bookingCheckError;

  // Minimum participants from API (0 if not provided by API)
  const minParticipants =
    typeof schedule.min_participants === "number"
      ? schedule.min_participants
      : 0;

  // --- BOOKING ACTION HANDLERS (AC2 & AC3) ---
  const handleBooking = () => {
    // Re-verify WITA time right when user taps the button
    if (Date.now() >= sessionStartMs) {
      setNowTimestamp(Date.now());
      return;
    }

    setPopup({
      visible: true,
      type: "confirm",
      title: "Konfirmasi Booking",
      message: "Apakah Anda yakin ingin mem-booking sesi kelas ini?",
    });
  };

  const confirmBookingAction = async () => {
    // Guard against time passing while modal was open
    if (Date.now() >= sessionStartMs) {
      setNowTimestamp(Date.now());
      setPopup({
        visible: true,
        type: "error",
        title: "Waktu Habis",
        message: "Sesi kelas sudah dimulai sehingga tidak dapat dibooking.",
      });
      return;
    }

    setIsBooking(true);
    try {
      const token = userToken || (await getToken());
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      // Use validated scheduleId
      await api.post(
        `/api/v1/member/class-schedules/${scheduleId}/booking`,
        {},
        { headers }
      );

      // AC2: Update participant counter & booking status without reloading
      setLocalParticipants((prev) => prev + 1);
      setHasBooked(true);

      setPopup({
        visible: true,
        type: "success",
        title: "Booking Berhasil!",
        message: "Booking kelas berhasil tercatat. Sampai jumpa di kelas!",
      });
    } catch (err: unknown) {
      const error = err as AxiosErrorResponse;
      if (error.response?.status === 401) {
        setPopup({
          visible: true,
          type: "unauthorized",
          title: "Sesi Berakhir",
          message:
            "Sesi login Anda tidak valid atau belum terautentikasi. Silakan login kembali.",
        });
      } else {
        const msg =
          error.response?.data?.message ||
          error.message ||
          "Terjadi kesalahan pada server.";
        setPopup({
          visible: true,
          type: "error",
          title: "Gagal Booking",
          message: msg,
        });
      }
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <View
      className="flex-1 bg-zinc-950"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {/* Top Header */}
      <View className="px-5 py-4 border-b border-zinc-800/60 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="mr-3.5 p-2 bg-zinc-900 rounded-lg border border-zinc-800"
          >
            <Ionicons name="arrow-back" size={20} color="#fbbf24" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-bold text-white">Detail Sesi</Text>
          </View>
        </View>

        <StatusBadge status={badgeStatus} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cancellation Banner (AC4) */}
        {isCancelled && (
          <View className="mb-5 p-4 rounded-2xl bg-red-950/20 border border-red-900/40 flex-row items-start">
            <Ionicons
              name="close-circle-outline"
              size={20}
              color="#f87171"
              style={{ marginTop: 1 }}
            />
            <View className="ml-3 flex-1">
              <Text className="text-red-400 font-bold text-xs uppercase tracking-wider mb-1">
                Sesi Dibatalkan
              </Text>
              <Text className="text-red-300 text-xs italic">
                Ket: {schedule.cancel_reason || "Tidak ada alasan spesifik."}
              </Text>
            </View>
          </View>
        )}

        {/* Main Class Info Card */}
        <View
          className={`p-5 rounded-2xl border mb-6 ${
            isCancelled
              ? "bg-red-950/20 border-red-900/40"
              : "bg-zinc-900 border-zinc-800"
          }`}
        >
          {/* Title & Instructor */}
          <View className="pb-4 border-b border-zinc-800/60">
            <Text className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              Program Kelas
            </Text>
            <Text className="text-2xl font-extrabold text-white mb-2">
              {schedule.title}
            </Text>
            <View className="flex-row items-center">
              <Ionicons name="person-outline" size={15} color="#a1a1aa" />
              <Text className="text-sm text-zinc-300 font-medium ml-1.5">
                {schedule.instructor}
              </Text>
            </View>
          </View>

          {/* Date & Time (WITA) */}
          <View className="py-4 border-b border-zinc-800/60">
            <View className="flex-row items-center mb-3.5">
              <View className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 items-center justify-center mr-3">
                <Ionicons name="calendar-outline" size={18} color="#fbbf24" />
              </View>
              <View className="flex-1">
                <Text className="text-zinc-400 text-xs font-medium">
                  Hari & Tanggal
                </Text>
                <Text className="text-white text-sm font-bold mt-0.5">
                  {formattedDate}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center">
              <View className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 items-center justify-center mr-3">
                <Ionicons name="time-outline" size={18} color="#fbbf24" />
              </View>
              <View className="flex-1">
                <Text className="text-zinc-400 text-xs font-medium">
                  Waktu Pelaksanaan
                </Text>
                <Text className="text-amber-400 text-sm font-bold mt-0.5">
                  {schedule.start_time} - {schedule.end_time} WITA
                </Text>
              </View>
            </View>
          </View>

          {/* Participant Counter (Amel's SCRUM-59 Component) */}
          <View className="pt-4 flex-row items-center justify-between">
            <ParticipantCounter
              current={localParticipants}
              min={minParticipants}
            />

            {maxCapacity > 0 && (
              <View className="items-end">
                <Text className="text-[11px] text-zinc-400 font-medium">
                  Kapasitas Maksimal
                </Text>
                <Text
                  className={`text-xs font-bold mt-0.5 ${
                    isFull ? "text-red-400" : "text-white"
                  }`}
                >
                  {localParticipants} / {maxCapacity} Peserta
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* --- BOOKING BUTTON SECTION --- */}
        {isCheckingBooking ? (
          <View className="py-6 items-center justify-center">
            <ActivityIndicator size="small" color="#fbbf24" />
            <Text className="text-zinc-400 text-xs mt-2">
              Memeriksa status booking...
            </Text>
          </View>
        ) : bookingCheckError ? (
          /* Temuan 11 & 12: Error & Retry UI when GET /api/v1/member/bookings fails */
          <View className="mb-6 p-4 rounded-2xl bg-red-950/20 border border-red-900/40 items-center">
            <Ionicons name="cloud-offline-outline" size={28} color="#f87171" />
            <Text className="text-red-400 text-xs font-medium text-center mt-2 mb-3">
              {bookingCheckError}
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={checkUserBooking}
              className="px-5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 flex-row items-center"
            >
              <Ionicons name="refresh-outline" size={16} color="#fbbf24" />
              <Text className="text-amber-400 text-xs font-bold ml-1.5">
                Coba Lagi
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="mb-6">
            {!isCancelled && (
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={!canBook || isBooking}
                onPress={handleBooking}
                className={`w-full min-h-[52px] py-4 rounded-xl flex-row justify-center items-center ${
                  !canBook || isBooking
                    ? "bg-zinc-800 border border-zinc-700/60"
                    : "bg-amber-400 active:bg-amber-500"
                }`}
              >
                {isBooking ? (
                  <ActivityIndicator color="#09090b" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={
                        hasBooked
                          ? "checkmark-circle-outline"
                          : "bookmark-outline"
                      }
                      size={18}
                      color={!canBook ? "#71717a" : "#09090b"}
                    />
                    <Text
                      className={`text-base font-bold ml-2 ${
                        !canBook ? "text-zinc-500" : "text-zinc-950"
                      }`}
                    >
                      {hasBooked ? "Sudah Terdaftar" : "Booking Kelas"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Helper Reason when Button is Disabled (AC1) */}
            {!canBook && !isCancelled && (
              <View className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex-row items-center justify-center">
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color="#f87171"
                />
                <Text className="text-red-400 text-xs font-medium ml-1.5">
                  {buttonDisabledReason}
                </Text>
              </View>
            )}

            {/* TODO (Amel - SCRUM-97): Tambahkan tombol "Batalkan Booking" di sini jika hasBooked === true */}
            {/* if (hasBooked) { <CancelBookingButton scheduleId={scheduleId} /> } */}
          </View>
        )}
      </ScrollView>

      {/* --- CUSTOM THEMED POPUP MODAL --- */}
      <Modal
        transparent
        visible={popup.visible}
        animationType="fade"
        onRequestClose={closePopup}
      >
        <View className="flex-1 bg-black/80 items-center justify-center px-6">
          <View className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            {/* Popup Top Icon */}
            <View className="items-center mb-4">
              {popup.type === "confirm" && (
                <View className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 items-center justify-center">
                  <Ionicons name="bookmark-outline" size={28} color="#fbbf24" />
                </View>
              )}
              {popup.type === "success" && (
                <View className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 items-center justify-center">
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={30}
                    color="#34d399"
                  />
                </View>
              )}
              {(popup.type === "error" || popup.type === "unauthorized") && (
                <View className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 items-center justify-center">
                  <Ionicons
                    name="alert-circle-outline"
                    size={30}
                    color="#f87171"
                  />
                </View>
              )}
            </View>

            {/* Popup Title & Message */}
            <Text className="text-xl font-extrabold text-white text-center mb-2">
              {popup.title}
            </Text>
            <Text className="text-sm text-zinc-400 text-center leading-5 mb-5">
              {popup.message}
            </Text>

            {/* Session Summary Box inside Popup */}
            {(popup.type === "confirm" || popup.type === "success") && (
              <View className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-6">
                <Text className="text-base font-bold text-white mb-1">
                  {schedule.title}
                </Text>
                <View className="flex-row items-center mb-2">
                  <Ionicons name="person-outline" size={13} color="#a1a1aa" />
                  <Text className="text-xs text-zinc-400 ml-1.5">
                    {schedule.instructor}
                  </Text>
                </View>
                <View className="pt-2.5 border-t border-zinc-800/80 flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <Ionicons
                      name="calendar-outline"
                      size={13}
                      color="#fbbf24"
                    />
                    <Text className="text-xs text-zinc-300 font-medium ml-1.5">
                      {schedule.date}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Ionicons name="time-outline" size={13} color="#fbbf24" />
                    <Text className="text-xs font-semibold text-amber-400 ml-1">
                      {schedule.start_time} - {schedule.end_time} WITA
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Popup Action Buttons */}
            {popup.type === "confirm" ? (
              <View className="flex-row gap-3">
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={isBooking}
                  onPress={closePopup}
                  className="flex-1 py-3.5 rounded-xl bg-zinc-800 border border-zinc-700 items-center justify-center"
                >
                  <Text className="text-sm font-bold text-zinc-300">Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={isBooking}
                  onPress={confirmBookingAction}
                  className="flex-1 py-3.5 rounded-xl bg-amber-400 active:bg-amber-500 items-center justify-center flex-row"
                >
                  {isBooking ? (
                    <ActivityIndicator color="#09090b" size="small" />
                  ) : (
                    <Text className="text-sm font-bold text-zinc-950">
                      Ya, Booking
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : popup.type === "unauthorized" ? (
              <View className="flex-row gap-3">
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={closePopup}
                  className="flex-1 py-3.5 rounded-xl bg-zinc-800 border border-zinc-700 items-center justify-center"
                >
                  <Text className="text-sm font-bold text-zinc-300">Tutup</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    closePopup();
                    router.replace("/login" as any);
                  }}
                  className="flex-1 py-3.5 rounded-xl bg-amber-400 active:bg-amber-500 items-center justify-center"
                >
                  <Text className="text-sm font-bold text-zinc-950">
                    Login Ulang
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={closePopup}
                className="w-full py-3.5 rounded-xl bg-amber-400 active:bg-amber-500 items-center justify-center"
              >
                <Text className="text-sm font-bold text-zinc-950">
                  {popup.type === "success" ? "Selesai" : "Mengerti"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}