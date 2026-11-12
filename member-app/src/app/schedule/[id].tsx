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
import { getToken } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { ParticipantCounter } from "@/components/ParticipantCounter";
import { StatusBadge, ScheduleStatus } from "@/components/StatusBadge";
import {
  NormalizedSchedule,
  normalizeScheduleItem,
} from "@/app/(app)/schedules";

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

// Exact structure returned by MeController::membershipSummary (GET /api/v1/me)
interface MeMembershipSummary {
  is_active: boolean;
  status:
    | "active"
    | "upcoming"
    | "pending"
    | "rejected"
    | "expired"
    | "none"
    | string;
  plan: {
    id: number;
    name: string;
    duration_days: number;
  } | null;
  start_date: string | null;
  end_date: string | null;
}

// Exact structure returned by MemberBookingResource (GET /api/v1/member/bookings)
interface BookingResourceItem {
  id: number;
  status: "booked" | "attended" | "cancelled" | string;
  booked_at?: string | null;
  updated_at?: string | null;
  schedule?: {
    id?: number;
    class_id?: number;
    class_name?: string;
    instructor_name?: string;
    schedule_date?: string;
    start_time?: string;
    end_time?: string;
    status?: string;
    cancel_reason?: string | null;
    participants_count?: number;
    min_participants?: number | null;
  };
}

type PopupState = {
  visible: boolean;
  type: "confirm" | "success" | "error" | "unauthorized";
  title: string;
  message: string;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

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

// Helper: Extract YYYY-MM-DD safely
function extractDateOnly(dateInput?: string | null): string | null {
  if (!dateInput || typeof dateInput !== "string") return null;
  const match = dateInput.trim().match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

// --- F5: Strict validator for normalized schedule object ---
function isValidNormalizedSchedule(
  item: NormalizedSchedule | null
): item is NormalizedSchedule {
  if (!item || typeof item !== "object") return false;
  if (!Number.isInteger(item.id) || item.id <= 0) return false;
  if (!item.title || typeof item.title !== "string") return false;
  if (!DATE_REGEX.test(item.date)) return false;
  if (!TIME_REGEX.test(item.start_time) || !TIME_REGEX.test(item.end_time)) {
    return false;
  }
  const startMs = parseWitaDateTime(item.date, item.start_time).getTime();
  const endMs = parseWitaDateTime(item.date, item.end_time).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;

  return true;
}

// --- F2: Extract & Validate MeController membership object from GET /api/v1/me ---
function parseMeMembershipResponse(
  payload: unknown
): MeMembershipSummary | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const dataObj =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : null;

  if (!dataObj) return null;

  const membershipRaw = dataObj.membership;
  if (!membershipRaw || typeof membershipRaw !== "object") return null;

  const m = membershipRaw as Record<string, unknown>;
  if (typeof m.is_active !== "boolean" || typeof m.status !== "string") {
    return null;
  }

  return {
    is_active: m.is_active,
    status: m.status,
    plan:
      m.plan && typeof m.plan === "object"
        ? (m.plan as MeMembershipSummary["plan"])
        : null,
    start_date: typeof m.start_date === "string" ? m.start_date : null,
    end_date: typeof m.end_date === "string" ? m.end_date : null,
  };
}

// --- F2: Evaluate B6 Membership Eligibility against Session Date ---
function evaluateMembershipOnSessionDate(
  membership: MeMembershipSummary | null,
  sessionDate: string
): { eligible: boolean; reason: string } {
  if (!membership) {
    return {
      eligible: false,
      reason: "Data membership belum tersedia.",
    };
  }

  const status = membership.status.toLowerCase();

  if (status === "none") {
    return {
      eligible: false,
      reason: "Anda belum memiliki paket membership.",
    };
  }

  if (status === "pending") {
    return {
      eligible: false,
      reason: "Pengajuan membership Anda masih menunggu verifikasi admin.",
    };
  }

  if (status === "rejected") {
    return {
      eligible: false,
      reason: "Pengajuan membership Anda ditolak. Silakan ajukan ulang.",
    };
  }

  const startDate = extractDateOnly(membership.start_date);
  const endDate = extractDateOnly(membership.end_date);

  if (status === "active" || status === "upcoming" || status === "expired") {
    if (!startDate || !endDate) {
      return {
        eligible: false,
        reason: "Masa berlaku membership tidak lengkap.",
      };
    }

    if (sessionDate < startDate) {
      return {
        eligible: false,
        reason: `Membership Anda baru mulai berlaku pada ${startDate}.`,
      };
    }

    if (sessionDate > endDate) {
      return {
        eligible: false,
        reason: `Masa aktif membership Anda berakhir pada ${endDate} (sebelum tanggal sesi).`,
      };
    }

    if (status === "expired") {
      return {
        eligible: false,
        reason: "Masa aktif membership Anda telah berakhir.",
      };
    }

    return { eligible: true, reason: "" };
  }

  return {
    eligible: false,
    reason: "Membership Anda belum aktif pada tanggal sesi ini.",
  };
}

export default function ScheduleDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    scheduleData?: string | string[];
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userToken } = useAuth();

  const rawIdParam = Array.isArray(params.id) ? params.id[0] : params.id;
  const rawScheduleData = Array.isArray(params.scheduleData)
    ? params.scheduleData[0]
    : params.scheduleData;

  // F5: Validate route [id] parameter is a positive integer
  const routeScheduleId = useMemo<number | null>(() => {
    if (!rawIdParam) return null;
    const parsedId = Number(rawIdParam);
    return Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
  }, [rawIdParam]);

  // F5 & F7: Parse & normalize scheduleData from route params if provided
  const initialParsedSchedule = useMemo<NormalizedSchedule | null>(() => {
    if (!rawScheduleData || !routeScheduleId) return null;
    try {
      const rawObj = JSON.parse(rawScheduleData);
      const normalized = normalizeScheduleItem(rawObj, false);
      if (!isValidNormalizedSchedule(normalized)) return null;
      if (normalized.id !== routeScheduleId) return null;
      return normalized;
    } catch {
      return null;
    }
  }, [rawScheduleData, routeScheduleId]);

  const [schedule, setSchedule] = useState<NormalizedSchedule | null>(
    initialParsedSchedule
  );
  const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(
    !initialParsedSchedule && routeScheduleId !== null
  );
  const [scheduleLoadError, setScheduleLoadError] = useState<string | null>(
    null
  );

  // Reactive participant counter state (AC2)
  const [localParticipants, setLocalParticipants] = useState<number>(
    initialParsedSchedule?.current_participants ?? 0
  );

  useEffect(() => {
    if (initialParsedSchedule) {
      setSchedule(initialParsedSchedule);
      setLocalParticipants(initialParsedSchedule.current_participants);
      setIsLoadingSchedule(false);
      setScheduleLoadError(null);
    }
  }, [initialParsedSchedule]);

  // --- F5: Fallback fetch from GET /api/v1/class-schedules if opened without scheduleData ---
  const fetchScheduleDetailFallback = useCallback(async () => {
    if (!routeScheduleId) {
      setScheduleLoadError("ID jadwal tidak sah.");
      setIsLoadingSchedule(false);
      return;
    }

    setIsLoadingSchedule(true);
    setScheduleLoadError(null);

    try {
      const res = await api.get("/api/v1/class-schedules");
      const rawList = res.data?.data;

      if (!Array.isArray(rawList)) {
        throw new Error("Format daftar jadwal dari server tidak valid.");
      }

      const foundRaw = rawList.find(
        (item: { id?: number | string }) => Number(item?.id) === routeScheduleId
      );

      const normalized = foundRaw
        ? normalizeScheduleItem(foundRaw, false)
        : null;
      if (
        !isValidNormalizedSchedule(normalized) ||
        normalized.id !== routeScheduleId
      ) {
        throw new Error("Sesi jadwal tidak ditemukan.");
      }

      setSchedule(normalized);
      setLocalParticipants(normalized.current_participants);
    } catch (err: unknown) {
      const error = err as AxiosErrorResponse;
      setScheduleLoadError(
        error.response?.data?.message ||
          error.message ||
          "Gagal memuat detail jadwal dari server."
      );
    } finally {
      setIsLoadingSchedule(false);
    }
  }, [routeScheduleId]);

  useEffect(() => {
    if (!initialParsedSchedule && routeScheduleId !== null) {
      fetchScheduleDetailFallback();
    }
  }, [initialParsedSchedule, routeScheduleId, fetchScheduleDetailFallback]);

  const scheduleId = schedule?.id ?? null;

  // --- F2 & F6: Verification states for GET /api/v1/me & GET /api/v1/member/bookings ---
  const [hasBooked, setHasBooked] = useState(false);
  const [membershipInfo, setMembershipInfo] =
    useState<MeMembershipSummary | null>(null);
  const [isVerifyingEligibility, setIsVerifyingEligibility] = useState(true);
  const [verificationError, setVerificationError] = useState<string | null>(
    null
  );
  const [isBooking, setIsBooking] = useState(false);

  // Real-time WITA clock timestamp
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

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

  // --- F2 & F6: Verify Membership (/api/v1/me) AND Existing Bookings (/api/v1/member/bookings) ---
  const verifyBookingAndMembership = useCallback(async () => {
    if (!scheduleId) {
      setIsVerifyingEligibility(false);
      return;
    }

    setIsVerifyingEligibility(true);
    setVerificationError(null);
    setNowTimestamp(Date.now());

    try {
      const token = userToken || (await getToken());
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      const [meRes, bookingsRes] = await Promise.all([
        api.get("/api/v1/me", { headers }),
        api.get("/api/v1/member/bookings", { headers }),
      ]);

      // 1. Validate GET /api/v1/me response (F2)
      const parsedMembership = parseMeMembershipResponse(meRes.data);
      if (!parsedMembership) {
        throw new Error(
          "Format data membership dari server (/api/v1/me) tidak valid."
        );
      }

      // 2. Strictly Validate GET /api/v1/member/bookings response (F1 & F6)
      const rawBookingsData =
        bookingsRes.data &&
        typeof bookingsRes.data === "object" &&
        "data" in bookingsRes.data
          ? (bookingsRes.data as { data: unknown }).data
          : null;

      if (!Array.isArray(rawBookingsData)) {
        throw new Error(
          "Format daftar booking dari server (/api/v1/member/bookings) tidak valid."
        );
      }

      let foundActiveBooking = false;
      for (const item of rawBookingsData) {
        if (!item || typeof item !== "object") {
          throw new Error("Item pada daftar booking tidak valid.");
        }
        const b = item as BookingResourceItem;
        const bookedScheduleId = Number(b.schedule?.id);

        if (!Number.isInteger(bookedScheduleId) || bookedScheduleId <= 0) {
          throw new Error("ID jadwal pada riwayat booking tidak valid.");
        }

        // MemberBookingResource status: "booked" | "attended" | "cancelled"
        const bookingStatus = (b.status ?? "").toLowerCase();
        const isBookingActive = bookingStatus !== "cancelled";

        if (bookedScheduleId === scheduleId && isBookingActive) {
          foundActiveBooking = true;
          if (typeof b.schedule?.participants_count === "number") {
            setLocalParticipants(b.schedule.participants_count);
          }
          break;
        }
      }

      setMembershipInfo(parsedMembership);
      setHasBooked(foundActiveBooking);
    } catch (err: unknown) {
      const error = err as AxiosErrorResponse;
      setVerificationError(
        error.response?.data?.message ||
          error.message ||
          "Gagal memuat status membership atau riwayat booking Anda."
      );
    } finally {
      setIsVerifyingEligibility(false);
    }
  }, [scheduleId, userToken]);

  useEffect(() => {
    verifyBookingAndMembership();
  }, [verifyBookingAndMembership]);

  // Loading screen while fallback schedule detail is loading
  if (isLoadingSchedule) {
    return (
      <View
        className="flex-1 items-center justify-center bg-zinc-950 px-6"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator size="large" color="#fbbf24" />
        <Text className="text-zinc-400 text-sm mt-3">
          Memuat detail sesi kelas...
        </Text>
      </View>
    );
  }

  // Error screen if schedule payload or ID is invalid (F5)
  if (!schedule || !scheduleId || scheduleLoadError) {
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
          {scheduleLoadError ||
            "Parameter jadwal tidak sesuai. Silakan pilih ulang dari daftar jadwal."}
        </Text>
        <View className="flex-row gap-3 mt-5">
          {routeScheduleId !== null && (
            <TouchableOpacity
              onPress={fetchScheduleDetailFallback}
              className="bg-amber-400 px-5 py-3 rounded-xl"
            >
              <Text className="text-zinc-950 font-bold">Coba Lagi</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.back()}
            className="bg-zinc-900 px-6 py-3 rounded-xl border border-zinc-800"
          >
            <Text className="text-amber-400 font-semibold">Kembali</Text>
          </TouchableOpacity>
        </View>
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

  // --- BOOKING VALIDATION LOGIC (F2, F4, F7, F8 & Temuan 7 Ongoing) ---
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
  const isSessionOngoing =
    rawStatus === "ongoing" ||
    (!isCancelled && !isSessionCompleted && isSessionStarted);

  // F4: Strictly only "scheduled" status is allowed to book per backend contract
  const isScheduledStatus = rawStatus === "scheduled";

  // F2: Check membership validity on schedule.date (Rule B6)
  const membershipCheck = evaluateMembershipOnSessionDate(
    membershipInfo,
    schedule.date
  );

  // Determine StatusBadge prop & customText for "ongoing" and "unknown" (Temuan 7)
  let badgeStatus: ScheduleStatus = "scheduled";
  let badgeCustomText: string | undefined = undefined;

  if (isCancelled) {
    badgeStatus = "cancelled";
  } else if (isSessionCompleted) {
    badgeStatus = "completed";
  } else if (rawStatus === "ongoing") {
    badgeStatus = "scheduled";
    badgeCustomText = "Berlangsung";
  } else if (rawStatus === "full") {
    badgeStatus = "full";
  } else if (rawStatus === "unknown") {
    badgeStatus = "completed";
    badgeCustomText = "Tidak Diketahui";
  }

  // Determine disabled reason in priority order
  let buttonDisabledReason = "";
  if (isCancelled) {
    buttonDisabledReason = "Sesi telah dibatalkan.";
  } else if (isSessionCompleted) {
    buttonDisabledReason = "Sesi kelas telah selesai.";
  } else if (rawStatus === "ongoing" || isSessionOngoing) {
    buttonDisabledReason = "Sesi kelas sedang berlangsung.";
  } else if (!isScheduledStatus) {
    buttonDisabledReason = "Sesi tidak dalam status terjadwal untuk dibooking.";
  } else if (hasBooked) {
    buttonDisabledReason = "Anda sudah mem-booking sesi ini.";
  } else if (isSessionStarted) {
    buttonDisabledReason = "Sesi kelas sudah dimulai/berakhir.";
  } else if (!membershipCheck.eligible) {
    buttonDisabledReason = membershipCheck.reason;
  }

  const canBook =
    buttonDisabledReason === "" &&
    !isVerifyingEligibility &&
    !verificationError;

  // F8: Distinguish explicit min_participants (including 0) vs unavailable (null/undefined)
  const hasMinParticipants =
    typeof schedule.min_participants === "number" &&
    !Number.isNaN(schedule.min_participants);

  // --- BOOKING ACTION HANDLERS (AC2 & AC3) ---
  const handleBooking = () => {
    const currentNow = Date.now();
    setNowTimestamp(currentNow);
    if (currentNow >= sessionStartMs || !canBook) {
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
    const currentNow = Date.now();
    setNowTimestamp(currentNow);
    if (currentNow >= sessionStartMs || !canBook) {
      setPopup({
        visible: true,
        type: "error",
        title: "Tidak Dapat Booking",
        message:
          buttonDisabledReason ||
          "Sesi kelas sudah dimulai atau status sesi telah berubah.",
      });
      return;
    }

    setIsBooking(true);
    try {
      const token = userToken || (await getToken());
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      // POST /api/v1/member/class-schedules/{classSchedule}/booking
      const postRes = await api.post(
        `/api/v1/member/class-schedules/${scheduleId}/booking`,
        {},
        { headers }
      );

      // AC2: Update participant counter & booking status using authoritative server response
      const returnedParticipantsCount =
        postRes.data?.data?.schedule?.participants_count;
      if (typeof returnedParticipantsCount === "number") {
        setLocalParticipants(returnedParticipantsCount);
      } else {
        setLocalParticipants((prev) => prev + 1);
      }
      setHasBooked(true);

      setPopup({
        visible: true,
        type: "success",
        title: "Booking Berhasil!",
        message:
          postRes.data?.message ||
          "Booking kelas berhasil tercatat. Sampai jumpa di kelas!",
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

        <StatusBadge status={badgeStatus} customText={badgeCustomText} />
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

          {/* F8 & F7: Participant Counter (No invented max capacity) */}
          <View className="pt-4 flex-row items-center justify-between">
            {hasMinParticipants ? (
              <ParticipantCounter
                current={localParticipants}
                min={schedule.min_participants as number}
              />
            ) : (
              <View className="flex-col items-start">
                <View className="flex-row items-center">
                  <Ionicons name="people-outline" size={14} color="#a1a1aa" />
                  <Text className="text-xs font-semibold text-zinc-300 ml-1.5">
                    {localParticipants} peserta terdaftar
                  </Text>
                </View>
                <Text className="text-[10px] font-medium text-zinc-500 mt-0.5">
                  Kuota minimum belum tersedia
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* --- BOOKING BUTTON SECTION --- */}
        {!isCancelled && (
          <>
            {isVerifyingEligibility ? (
              <View className="py-6 items-center justify-center">
                <ActivityIndicator size="small" color="#fbbf24" />
                <Text className="text-zinc-400 text-xs mt-2">
                  Memverifikasi status membership & booking...
                </Text>
              </View>
            ) : verificationError ? (
              /* F2 & F6: Error & Retry UI when GET /me or GET /member/bookings fails */
              <View className="mb-6 p-4 rounded-2xl bg-red-950/20 border border-red-900/40 items-center">
                <Ionicons
                  name="cloud-offline-outline"
                  size={28}
                  color="#f87171"
                />
                <Text className="text-red-400 text-xs font-medium text-center mt-2 mb-3">
                  {verificationError}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={verifyBookingAndMembership}
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

                {/* Helper Reason when Button is Disabled (AC1) */}
                {!canBook && (
                  <View className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex-row items-center justify-center">
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color="#f87171"
                    />
                    <Text className="text-red-400 text-xs font-medium ml-1.5 text-center">
                      {buttonDisabledReason}
                    </Text>
                  </View>
                )}

                {/* TODO (Amel - SCRUM-97): Tambahkan tombol "Batalkan Booking" di sini jika hasBooked === true */}
                {/* if (hasBooked) { <CancelBookingButton scheduleId={scheduleId} /> } */}
              </View>
            )}
          </>
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