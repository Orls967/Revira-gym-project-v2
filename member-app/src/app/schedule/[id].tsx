import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  AppState,
  AppStateStatus,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import api from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useAuth } from "@/context/AuthContext";
import { ParticipantCounter } from "@/components/ParticipantCounter";
import { StatusBadge, ScheduleStatus } from "@/components/StatusBadge";
import {
  NormalizedSchedule,
  NormalizedScheduleStatus,
  RawBackendSchedule,
  normalizeScheduleItem,
  mapBackendScheduleStatus,
  isValidCalendarDateString,
  normalizeValidDate,
  normalizeValidTime,
  parseNonNegativeInt,
  toNonEmptyTrimmedString,
} from "@/app/(app)/schedules";

// Local Axios error interface to avoid TypeScript errors on .response and cancellation
interface AxiosErrorResponse {
  name?: string;
  code?: string;
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
  message?: string;
}

// Single membership period item
interface MembershipPeriodItem {
  is_active?: boolean;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

// Structure extracted from GET /api/v1/me (supports single summary AND optional renewal list/flags)
interface MeMembershipData {
  primary: MembershipPeriodItem;
  periods: MembershipPeriodItem[];
  explicitSessionEligible?: boolean;
}

// Exact structure returned by MemberBookingResource (GET /api/v1/member/bookings)
interface BookingResourceItem {
  id?: unknown;
  status?: unknown;
  booked_at?: unknown;
  updated_at?: unknown;
  schedule?: {
    id?: unknown;
    class_id?: unknown;
    class_name?: unknown;
    instructor_name?: unknown;
    schedule_date?: unknown;
    start_time?: unknown;
    end_time?: unknown;
    status?: unknown;
    cancel_reason?: unknown;
    participants_count?: unknown;
    min_participants?: unknown;
    updated_at?: unknown;
  } | null;
}

// Item returned by ClassScheduleStatusResource (GET /api/v1/class-schedules/status)
interface ScheduleStatusPollItem {
  id?: unknown;
  schedule_id?: unknown;
  status?: unknown;
  cancel_reason?: unknown;
  participants_count?: unknown;
  current_participants?: unknown;
  min_participants?: unknown;
  updated_at?: unknown;
}

type PopupState = {
  visible: boolean;
  type: "confirm" | "success" | "error" | "unauthorized";
  title: string;
  message: string;
};

// Helper: Check if an error is an Axios / AbortController cancellation
function isRequestCanceled(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as AxiosErrorResponse;
  return (
    e.code === "ERR_CANCELED" ||
    e.name === "CanceledError" ||
    e.name === "AbortError"
  );
}

// Helper: Normalize validated HH:mm or HH:mm:ss into HH:mm:ss without losing seconds precision
function toFullTimeWithSeconds(timeStr: string): string {
  const clean = timeStr.trim();
  if (/^\d{2}:\d{2}$/.test(clean)) return `${clean}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(clean)) return clean;
  return "00:00:00";
}

// Helper: Parse YYYY-MM-DD + HH:mm(:ss) explicitly in WITA (UTC+08:00)
function parseWitaDateTime(dateStr: string, timeStr: string): Date {
  const normalizedTime = toFullTimeWithSeconds(timeStr);
  return new Date(`${dateStr}T${normalizedTime}+08:00`);
}

// Helper: Parse ISO timestamp to epoch ms safely for updated_at comparison
function parseTimestampMs(iso?: string | null): number | null {
  if (!iso || typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

// Strict validator for normalized schedule object (F5)
function isValidNormalizedSchedule(
  item: NormalizedSchedule | null
): item is NormalizedSchedule {
  if (!item || typeof item !== "object") return false;
  if (!Number.isInteger(item.id) || !Number.isFinite(item.id) || item.id <= 0) {
    return false;
  }
  if (!toNonEmptyTrimmedString(item.title)) return false;
  if (!toNonEmptyTrimmedString(item.instructor)) return false;
  if (!isValidCalendarDateString(item.date)) return false;

  const validStart = normalizeValidTime(item.start_time);
  const validEnd = normalizeValidTime(item.end_time);
  if (!validStart || !validEnd) return false;

  if (parseNonNegativeInt(item.participants_count) === null) return false;
  if (
    item.min_participants !== null &&
    item.min_participants !== undefined &&
    parseNonNegativeInt(item.min_participants) === null
  ) {
    return false;
  }

  const startMs = parseWitaDateTime(item.date, validStart).getTime();
  const endMs = parseWitaDateTime(item.date, validEnd).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

  return true;
}

// Helper: Parse a single raw membership object safely
function parseSingleMembershipPeriod(
  raw: unknown
): MembershipPeriodItem | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const statusStr = toNonEmptyTrimmedString(m.status);
  if (!statusStr) return null;

  const startDate =
    m.start_date === null || m.start_date === undefined
      ? null
      : normalizeValidDate(m.start_date);
  const endDate =
    m.end_date === null || m.end_date === undefined
      ? null
      : normalizeValidDate(m.end_date);

  if (
    (m.start_date !== null && m.start_date !== undefined && !startDate) ||
    (m.end_date !== null && m.end_date !== undefined && !endDate)
  ) {
    return null;
  }

  return {
    is_active: typeof m.is_active === "boolean" ? m.is_active : undefined,
    status: statusStr.toLowerCase(),
    start_date: startDate,
    end_date: endDate,
  };
}

// Extract & Validate MeController membership response from GET /api/v1/me (F2)
function parseMeMembershipResponse(payload: unknown): MeMembershipData | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const dataObj =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : null;

  if (!dataObj) return null;

  const primary = parseSingleMembershipPeriod(dataObj.membership);
  if (!primary || typeof primary.is_active !== "boolean") {
    return null;
  }

  const periods: MembershipPeriodItem[] = [primary];

  const upcomingCandidate = parseSingleMembershipPeriod(
    dataObj.upcoming_membership ?? dataObj.next_membership
  );
  if (upcomingCandidate) {
    periods.push(upcomingCandidate);
  }

  if (Array.isArray(dataObj.memberships)) {
    for (const item of dataObj.memberships) {
      const parsed = parseSingleMembershipPeriod(item);
      if (parsed) {
        periods.push(parsed);
      }
    }
  }

  const explicitSessionEligible =
    typeof dataObj.is_eligible_for_session === "boolean"
      ? dataObj.is_eligible_for_session
      : undefined;

  return {
    primary,
    periods,
    explicitSessionEligible,
  };
}

// Evaluate B6 Membership Eligibility against Session Date (F2)
function evaluateMembershipOnSessionDate(
  membershipData: MeMembershipData | null,
  sessionDate: string
): { eligible: boolean; reason: string } {
  if (!membershipData) {
    return {
      eligible: false,
      reason: "Data membership belum tersedia.",
    };
  }

  if (membershipData.explicitSessionEligible === true) {
    return { eligible: true, reason: "" };
  }
  if (membershipData.explicitSessionEligible === false) {
    return {
      eligible: false,
      reason: "Membership Anda tidak berlaku pada tanggal sesi ini.",
    };
  }

  for (const period of membershipData.periods) {
    const st = period.status.toLowerCase();
    if (st === "active" || st === "upcoming") {
      if (
        period.start_date &&
        period.end_date &&
        sessionDate >= period.start_date &&
        sessionDate <= period.end_date
      ) {
        return { eligible: true, reason: "" };
      }
    }
  }

  const primary = membershipData.primary;
  const status = primary.status.toLowerCase();

  if (status === "none") {
    return {
      eligible: false,
      reason: "Membership belum aktif. Anda belum memiliki paket membership.",
    };
  }

  if (status === "pending") {
    return {
      eligible: false,
      reason: "Membership belum aktif (menunggu verifikasi admin).",
    };
  }

  if (status === "rejected") {
    return {
      eligible: false,
      reason: "Pengajuan membership Anda ditolak. Silakan ajukan ulang.",
    };
  }

  if (status === "expired") {
    return {
      eligible: false,
      reason: "Masa aktif membership Anda telah berakhir.",
    };
  }

  if (status === "active" || status === "upcoming") {
    if (!primary.start_date || !primary.end_date) {
      return {
        eligible: false,
        reason: "Data periode membership belum lengkap.",
      };
    }

    if (sessionDate < primary.start_date) {
      return {
        eligible: false,
        reason: `Membership belum aktif pada tanggal sesi ini (mulai berlaku ${primary.start_date}).`,
      };
    }

    if (sessionDate > primary.end_date) {
      return {
        eligible: false,
        reason: `Masa aktif membership berakhir pada ${primary.end_date} (sebelum tanggal sesi).`,
      };
    }
  }

  return {
    eligible: false,
    reason: "Membership belum aktif pada tanggal sesi ini.",
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

  // F5: Validate route [id] parameter is a positive finite integer
  const routeScheduleId = useMemo<number | null>(() => {
    const idStr = toNonEmptyTrimmedString(rawIdParam);
    if (!idStr || !/^\d+$/.test(idStr)) return null;
    const parsedId = Number(idStr);
    return Number.isInteger(parsedId) &&
      Number.isFinite(parsedId) &&
      parsedId > 0
      ? parsedId
      : null;
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

  // Single source of truth for schedule (including live participants_count, status, cancel_reason)
  const [schedule, setSchedule] = useState<NormalizedSchedule | null>(
    initialParsedSchedule
  );
  const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(
    !initialParsedSchedule && routeScheduleId !== null
  );
  const [scheduleLoadError, setScheduleLoadError] = useState<string | null>(
    null
  );

  // --- Concurrency, Lifecycle, Session & Auth Token Guards (SCRUM-72 F6 & SCRUM-73 Poin 2, 3, 4) ---
  const activeSessionIdRef = useRef<number | null>(routeScheduleId);
  const activeTokenRef = useRef<string | null>(userToken ?? null);
  const mutationEpochRef = useRef<number>(0);
  const verifySeqRef = useRef<number>(0);
  const pollSeqRef = useRef<number>(0);
  const isPollingInFlightRef = useRef<boolean>(false);
  const isBookingInFlightRef = useRef<boolean>(false);
  const lastUpdatedAtMsRef = useRef<number | null>(
    parseTimestampMs(initialParsedSchedule?.updated_at)
  );
  const scheduleDateRef = useRef<string | null>(
    initialParsedSchedule?.date ?? null
  );

  const pollAbortRef = useRef<AbortController | null>(null);
  const verifyAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  const isScreenFocusedRef = useRef<boolean>(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const cancelAllInFlightRequests = useCallback(() => {
    if (pollAbortRef.current) {
      pollAbortRef.current.abort();
      pollAbortRef.current = null;
    }
    if (verifyAbortRef.current) {
      verifyAbortRef.current.abort();
      verifyAbortRef.current = null;
    }
    if (detailAbortRef.current) {
      detailAbortRef.current.abort();
      detailAbortRef.current = null;
    }
    isPollingInFlightRef.current = false;
  }, []);

  // Keep scheduleDateRef synced for date_from/date_to query params during polling
  useEffect(() => {
    scheduleDateRef.current = schedule?.date ?? null;
  }, [schedule?.date]);

  // --- F2 & F6: Verification states for GET /api/v1/me & GET /api/v1/member/bookings ---
  const [hasBooked, setHasBooked] = useState(false);
  const [membershipData, setMembershipData] = useState<MeMembershipData | null>(
    null
  );
  const [isVerifyingEligibility, setIsVerifyingEligibility] = useState(true);
  const [verificationError, setVerificationError] = useState<string | null>(
    null
  );
  const [isBooking, setIsBooking] = useState(false);

  // --- SCRUM-73 Poin 6: Pull-to-refresh & Error Banner States ---
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // --- F3: Real-time WITA clock timestamp state ---
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

  // --- Reset state & invalidate stale requests on session or auth token change (Poin 4 & F6) ---
  useEffect(() => {
    activeSessionIdRef.current = routeScheduleId;
    activeTokenRef.current = userToken ?? null;
    mutationEpochRef.current += 1;
    verifySeqRef.current += 1;
    pollSeqRef.current += 1;
    cancelAllInFlightRequests();

    setHasBooked(false);
    setMembershipData(null);
    setVerificationError(null);
    setRefreshError(null);
    setIsVerifyingEligibility(true);
    setNowTimestamp(Date.now());

    if (
      rawScheduleData &&
      !initialParsedSchedule &&
      routeScheduleId !== null
    ) {
      setSchedule(null);
      lastUpdatedAtMsRef.current = null;
      setIsLoadingSchedule(false);
      setScheduleLoadError(
        "Data sesi tidak valid (format tanggal, waktu, atau kuota tidak sesuai kontrak)."
      );
      return;
    }

    if (initialParsedSchedule && initialParsedSchedule.id === routeScheduleId) {
      setSchedule(initialParsedSchedule);
      lastUpdatedAtMsRef.current = parseTimestampMs(
        initialParsedSchedule.updated_at
      );
      setIsLoadingSchedule(false);
      setScheduleLoadError(null);
    } else {
      setSchedule(null);
      lastUpdatedAtMsRef.current = null;
      setIsLoadingSchedule(routeScheduleId !== null);
      setScheduleLoadError(null);
    }

    return () => {
      cancelAllInFlightRequests();
    };
  }, [
    routeScheduleId,
    userToken,
    rawScheduleData,
    initialParsedSchedule,
    cancelAllInFlightRequests,
  ]);

  // --- F5: Fallback fetch from GET /api/v1/class-schedules if opened without scheduleData ---
  const fetchScheduleDetailFallback = useCallback(async () => {
    const targetSessionId = routeScheduleId;
    if (!targetSessionId) {
      setScheduleLoadError("ID jadwal tidak sah.");
      setIsLoadingSchedule(false);
      return;
    }

    if (detailAbortRef.current) {
      detailAbortRef.current.abort();
    }
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const startEpoch = mutationEpochRef.current;

    setIsLoadingSchedule(true);
    setScheduleLoadError(null);

    try {
      const res = await api.get("/api/v1/class-schedules", {
        signal: controller.signal,
      });

      if (
        controller.signal.aborted ||
        activeSessionIdRef.current !== targetSessionId ||
        mutationEpochRef.current !== startEpoch
      ) {
        return;
      }

      const rawList = res.data?.data;
      if (!Array.isArray(rawList)) {
        throw new Error("Format daftar jadwal dari server tidak valid.");
      }

      const foundRaw = rawList.find((item: unknown) => {
        if (!item || typeof item !== "object") return false;
        const rawId = (item as { id?: unknown }).id;
        return Number(rawId) === targetSessionId;
      });

      if (!foundRaw) {
        throw new Error("Sesi jadwal tidak ditemukan.");
      }

      const normalized = normalizeScheduleItem(foundRaw, false);
      if (
        !isValidNormalizedSchedule(normalized) ||
        normalized.id !== targetSessionId
      ) {
        throw new Error(
          "Data sesi dari server memiliki format tanggal, jam, atau peserta yang tidak valid."
        );
      }

      lastUpdatedAtMsRef.current = parseTimestampMs(normalized.updated_at);
      setSchedule(normalized);
    } catch (err: unknown) {
      if (isRequestCanceled(err)) return;
      if (activeSessionIdRef.current !== targetSessionId) return;

      const error = err as AxiosErrorResponse;
      setScheduleLoadError(
        error.response?.data?.message ||
          error.message ||
          "Gagal memuat detail jadwal dari server."
      );
    } finally {
      if (activeSessionIdRef.current === targetSessionId) {
        setIsLoadingSchedule(false);
      }
    }
  }, [routeScheduleId]);

  useEffect(() => {
    if (
      !rawScheduleData &&
      !initialParsedSchedule &&
      routeScheduleId !== null
    ) {
      fetchScheduleDetailFallback();
    }
  }, [
    rawScheduleData,
    initialParsedSchedule,
    routeScheduleId,
    fetchScheduleDetailFallback,
  ]);

  const scheduleId = schedule?.id ?? null;
  const scheduleDate = schedule?.date ?? null;
  const scheduleStartTime = schedule?.start_time ?? null;
  const scheduleEndTime = schedule?.end_time ?? null;

  // --- F2 & F6: Verify Membership (/api/v1/me) AND Existing Bookings (/api/v1/member/bookings) ---
  // Returns boolean indicating success so Pull-to-Refresh can track completion & errors (Poin 6)
  const verifyBookingAndMembership = useCallback(
    async (options?: { isSilent?: boolean }): Promise<boolean> => {
      const isSilent = options?.isSilent ?? false;
      const targetSessionId = scheduleId;

      if (!targetSessionId) {
        if (!isSilent) setIsVerifyingEligibility(false);
        return false;
      }

      if (isBookingInFlightRef.current) {
        return true;
      }

      if (verifyAbortRef.current) {
        verifyAbortRef.current.abort();
      }
      const controller = new AbortController();
      verifyAbortRef.current = controller;

      const reqSeq = ++verifySeqRef.current;
      const reqEpoch = mutationEpochRef.current;
      const reqContextToken = userToken ?? null;

      if (!isSilent) {
        setIsVerifyingEligibility(true);
        setVerificationError(null);
      }
      setNowTimestamp(Date.now());

      try {
        const resolvedToken = reqContextToken || (await getToken());

        if (
          controller.signal.aborted ||
          reqSeq !== verifySeqRef.current ||
          reqEpoch !== mutationEpochRef.current ||
          activeSessionIdRef.current !== targetSessionId ||
          activeTokenRef.current !== reqContextToken ||
          isBookingInFlightRef.current
        ) {
          return true;
        }

        const headers = resolvedToken
          ? { Authorization: `Bearer ${resolvedToken}` }
          : undefined;

        const [meRes, bookingsRes] = await Promise.all([
          api.get("/api/v1/me", { headers, signal: controller.signal }),
          api.get("/api/v1/member/bookings", {
            headers,
            signal: controller.signal,
          }),
        ]);

        if (
          controller.signal.aborted ||
          reqSeq !== verifySeqRef.current ||
          reqEpoch !== mutationEpochRef.current ||
          activeSessionIdRef.current !== targetSessionId ||
          activeTokenRef.current !== reqContextToken ||
          isBookingInFlightRef.current
        ) {
          return true;
        }

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
        let matchedScheduleFromBooking:
          | BookingResourceItem["schedule"]
          | undefined;

        for (const item of rawBookingsData) {
          if (!item || typeof item !== "object") {
            throw new Error("Item pada daftar booking tidak valid.");
          }
          const b = item as BookingResourceItem;
          if (!b.schedule || typeof b.schedule !== "object") {
            throw new Error("Data jadwal pada riwayat booking tidak valid.");
          }

          const rawBookedId = b.schedule.id;
          const bookedScheduleId =
            typeof rawBookedId === "number"
              ? rawBookedId
              : typeof rawBookedId === "string" &&
                /^\d+$/.test(rawBookedId.trim())
              ? Number(rawBookedId.trim())
              : NaN;

          if (
            !Number.isInteger(bookedScheduleId) ||
            !Number.isFinite(bookedScheduleId) ||
            bookedScheduleId <= 0
          ) {
            throw new Error("ID jadwal pada riwayat booking tidak valid.");
          }

          const bookingStatusStr = toNonEmptyTrimmedString(b.status);
          if (!bookingStatusStr) {
            throw new Error("Status pada riwayat booking tidak valid.");
          }

          if (bookedScheduleId === targetSessionId) {
            matchedScheduleFromBooking = b.schedule;
            if (bookingStatusStr.toLowerCase() !== "cancelled") {
              foundActiveBooking = true;
              break;
            }
          }
        }

        setMembershipData(parsedMembership);
        setHasBooked(foundActiveBooking);
        setVerificationError(null);

        if (matchedScheduleFromBooking) {
          const parsedCount = parseNonNegativeInt(
            matchedScheduleFromBooking.participants_count
          );
          const nextStatus = matchedScheduleFromBooking.status
            ? mapBackendScheduleStatus(matchedScheduleFromBooking.status, false)
            : null;
          const nextCancelReason =
            matchedScheduleFromBooking.cancel_reason !== undefined
              ? typeof matchedScheduleFromBooking.cancel_reason === "string"
                ? matchedScheduleFromBooking.cancel_reason.trim()
                : ""
              : undefined;

          setSchedule((prev) => {
            if (!prev || prev.id !== targetSessionId) return prev;
            const resolvedStatus = nextStatus ?? prev.status;
            const resolvedCount =
              parsedCount !== null ? parsedCount : prev.participants_count;
            const resolvedCancel =
              resolvedStatus === "cancelled"
                ? nextCancelReason !== undefined
                  ? nextCancelReason
                  : prev.cancel_reason
                : undefined;

            if (
              prev.status === resolvedStatus &&
              prev.participants_count === resolvedCount &&
              (prev.cancel_reason ?? "") === (resolvedCancel ?? "")
            ) {
              return prev;
            }

            return {
              ...prev,
              status: resolvedStatus,
              participants_count: resolvedCount,
              cancel_reason: resolvedCancel,
            };
          });
        }

        return true;
      } catch (err: unknown) {
        if (isRequestCanceled(err)) return true;

        if (
          reqSeq !== verifySeqRef.current ||
          reqEpoch !== mutationEpochRef.current ||
          activeSessionIdRef.current !== targetSessionId ||
          activeTokenRef.current !== reqContextToken ||
          isBookingInFlightRef.current
        ) {
          return true;
        }

        const error = err as AxiosErrorResponse;
        const msg =
          error.response?.data?.message ||
          error.message ||
          "Gagal memuat status membership atau riwayat booking Anda.";

        if (!isSilent) {
          setVerificationError(msg);
        }
        return false;
      } finally {
        if (
          !isSilent &&
          reqSeq === verifySeqRef.current &&
          reqEpoch === mutationEpochRef.current &&
          activeSessionIdRef.current === targetSessionId &&
          activeTokenRef.current === reqContextToken
        ) {
          setIsVerifyingEligibility(false);
        }
      }
    },
    [scheduleId, userToken]
  );

  useEffect(() => {
    if (scheduleId) {
      verifyBookingAndMembership({ isSilent: false });
    }
  }, [scheduleId, verifyBookingAndMembership]);

  // --- SCRUM-73 Poin 1, 2, 3, 4: Poll GET /api/v1/class-schedules/status + Sync cancel_reason ---
  const pollScheduleStatus = useCallback(
    async (options?: { force?: boolean }): Promise<boolean> => {
      const force = options?.force ?? false;
      const targetSessionId = scheduleId;
      const targetDate = scheduleDateRef.current;

      if (!targetSessionId) return false;

      // Poin 3: Never allow background polling to race with an active POST booking
      if (isBookingInFlightRef.current) {
        return true;
      }

      // Poin 2: In-flight guard for periodic polling; manual refresh (force) aborts older poll
      if (isPollingInFlightRef.current) {
        if (!force) {
          return true;
        }
        if (pollAbortRef.current) {
          pollAbortRef.current.abort();
          pollAbortRef.current = null;
        }
      }

      const controller = new AbortController();
      pollAbortRef.current = controller;
      isPollingInFlightRef.current = true;

      const reqSeq = ++pollSeqRef.current;
      const startEpoch = mutationEpochRef.current;
      const reqContextToken = userToken ?? null;

      setNowTimestamp(Date.now());

      const isStale = () =>
        controller.signal.aborted ||
        reqSeq !== pollSeqRef.current ||
        startEpoch !== mutationEpochRef.current ||
        activeSessionIdRef.current !== targetSessionId ||
        activeTokenRef.current !== reqContextToken ||
        isBookingInFlightRef.current;

      try {
        const queryParams =
          targetDate && isValidCalendarDateString(targetDate)
            ? { date_from: targetDate, date_to: targetDate }
            : undefined;

        const res = await api.get("/api/v1/class-schedules/status", {
          params: queryParams,
          signal: controller.signal,
        });

        if (isStale()) return true;

        const rawList = res.data?.data ?? res.data;
        if (!Array.isArray(rawList)) {
          throw new Error("Format respons polling status tidak valid.");
        }

        const matchedPoll = rawList.find((item: unknown) => {
          if (!item || typeof item !== "object") return false;
          const p = item as ScheduleStatusPollItem;
          return Number(p.id ?? p.schedule_id) === targetSessionId;
        }) as ScheduleStatusPollItem | undefined;

        if (!matchedPoll) {
          return true;
        }

        const nextStatus: NormalizedScheduleStatus = mapBackendScheduleStatus(
          matchedPoll.status,
          false
        );
        const incomingUpdatedAtStr = toNonEmptyTrimmedString(
          matchedPoll.updated_at
        );
        const incomingUpdatedAtMs = parseTimestampMs(incomingUpdatedAtStr);

        // Poin 1: ClassScheduleStatusResource does not include cancel_reason.
        // Whenever status is "cancelled" and cancel_reason is not provided in /status,
        // fetch full schedule from GET /api/v1/class-schedules to get authoritative cancel_reason.
        let resolvedCancelReason: string | undefined =
          matchedPoll.cancel_reason !== undefined
            ? typeof matchedPoll.cancel_reason === "string"
              ? matchedPoll.cancel_reason.trim()
              : ""
            : undefined;
        let fullScheduleItem: NormalizedSchedule | null = null;

        if (nextStatus === "cancelled" && resolvedCancelReason === undefined) {
          try {
            const fullRes = await api.get("/api/v1/class-schedules", {
              params: queryParams,
              signal: controller.signal,
            });

            if (isStale()) return true;

            const fullList = fullRes.data?.data ?? fullRes.data;
            if (Array.isArray(fullList)) {
              const foundFull = fullList.find((item: unknown) => {
                if (!item || typeof item !== "object") return false;
                return (
                  Number((item as RawBackendSchedule).id) === targetSessionId
                );
              }) as RawBackendSchedule | undefined;

              if (foundFull) {
                // Explicitly preserve null or empty string from backend
                resolvedCancelReason =
                  typeof foundFull.cancel_reason === "string"
                    ? foundFull.cancel_reason.trim()
                    : "";
                fullScheduleItem = normalizeScheduleItem(foundFull, false);
              }
            }
          } catch (innerErr: unknown) {
            if (isRequestCanceled(innerErr)) return true;
            if (force) throw innerErr;
          }
        }

        if (isStale()) return true;

        const polledParticipants = parseNonNegativeInt(
          matchedPoll.participants_count ?? matchedPoll.current_participants
        );
        const polledMin =
          matchedPoll.min_participants !== undefined
            ? parseNonNegativeInt(matchedPoll.min_participants)
            : undefined;

        setSchedule((prev) => {
          if (!prev || prev.id !== targetSessionId) return prev;

          // Poin 2: Reject older updated_at unless status itself changed (allows valid transitions like cancelled -> scheduled)
          if (
            incomingUpdatedAtMs !== null &&
            lastUpdatedAtMsRef.current !== null &&
            incomingUpdatedAtMs < lastUpdatedAtMsRef.current &&
            prev.status === nextStatus
          ) {
            return prev;
          }

          if (incomingUpdatedAtMs !== null) {
            lastUpdatedAtMsRef.current = incomingUpdatedAtMs;
          }

          const nextParticipants =
            polledParticipants !== null
              ? polledParticipants
              : fullScheduleItem?.participants_count ??
                prev.participants_count;

          const nextMin =
            polledMin !== undefined
              ? polledMin
              : fullScheduleItem?.min_participants ?? prev.min_participants;

          const nextCancelReason =
            nextStatus === "cancelled"
              ? resolvedCancelReason !== undefined
                ? resolvedCancelReason
                : prev.cancel_reason
              : undefined;

          if (
            prev.status === nextStatus &&
            prev.participants_count === nextParticipants &&
            prev.min_participants === nextMin &&
            (prev.cancel_reason ?? "") === (nextCancelReason ?? "")
          ) {
            return prev;
          }

          return {
            ...prev,
            status: nextStatus,
            participants_count: nextParticipants,
            min_participants: nextMin,
            cancel_reason: nextCancelReason,
            updated_at: incomingUpdatedAtStr ?? prev.updated_at,
          };
        });

        // If session became cancelled, backend cancels active bookings (B9)
        if (nextStatus === "cancelled") {
          setHasBooked(false);
        }

        return true;
      } catch (err: unknown) {
        if (isRequestCanceled(err)) return true;
        return false;
      } finally {
        if (pollAbortRef.current === controller) {
          isPollingInFlightRef.current = false;
          pollAbortRef.current = null;
        }
      }
    },
    [scheduleId, userToken]
  );

  // --- SCRUM-73 Poin 4 & 5 + SCRUM-72 F3: Focus & Foreground-Only Polling + WITA Clock Timers ---
  useFocusEffect(
    useCallback(() => {
      isScreenFocusedRef.current = true;
      if (
        !scheduleId ||
        !scheduleDate ||
        !scheduleStartTime ||
        !scheduleEndTime
      ) {
        return () => {
          isScreenFocusedRef.current = false;
        };
      }

      let pollIntervalId: ReturnType<typeof setInterval> | null = null;
      let clockIntervalId: ReturnType<typeof setInterval> | null = null;
      let startDeadlineTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let endDeadlineTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const clearAllTimersAndAbortPolling = () => {
        if (pollIntervalId) {
          clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
        if (clockIntervalId) {
          clearInterval(clockIntervalId);
          clockIntervalId = null;
        }
        if (startDeadlineTimeoutId) {
          clearTimeout(startDeadlineTimeoutId);
          startDeadlineTimeoutId = null;
        }
        if (endDeadlineTimeoutId) {
          clearTimeout(endDeadlineTimeoutId);
          endDeadlineTimeoutId = null;
        }
        if (pollAbortRef.current) {
          pollAbortRef.current.abort();
          pollAbortRef.current = null;
        }
        isPollingInFlightRef.current = false;
      };

      const startForegroundActivities = () => {
        clearAllTimersAndAbortPolling();

        // Poin 5: Always read latest AppState.currentState before starting fetch & timers
        const currentAppState = AppState.currentState;
        appStateRef.current = currentAppState;

        if (!isScreenFocusedRef.current || currentAppState !== "active") {
          return;
        }

        const currentNow = Date.now();
        setNowTimestamp(currentNow);

        // 1. Initial silent status poll when focused & foreground
        pollScheduleStatus({ force: false });

        // 2. 15s status polling interval (SCRUM-73)
        pollIntervalId = setInterval(() => {
          if (
            isScreenFocusedRef.current &&
            AppState.currentState === "active" &&
            !isBookingInFlightRef.current
          ) {
            pollScheduleStatus({ force: false });
          }
        }, 15000);

        // 3. 5s local WITA clock tick (SCRUM-72 F3)
        clockIntervalId = setInterval(() => {
          if (
            isScreenFocusedRef.current &&
            AppState.currentState === "active"
          ) {
            setNowTimestamp(Date.now());
          }
        }, 5000);

        // 4. Exact deadline timers for session start & end (SCRUM-72 F3)
        const startMs = parseWitaDateTime(
          scheduleDate,
          scheduleStartTime
        ).getTime();
        const msUntilStart = startMs - currentNow;
        if (msUntilStart > 0 && msUntilStart <= 2147483647) {
          startDeadlineTimeoutId = setTimeout(() => {
            setNowTimestamp(Date.now());
          }, msUntilStart + 50);
        }

        const endMs = parseWitaDateTime(
          scheduleDate,
          scheduleEndTime
        ).getTime();
        const msUntilEnd = endMs - currentNow;
        if (msUntilEnd > 0 && msUntilEnd <= 2147483647) {
          endDeadlineTimeoutId = setTimeout(() => {
            setNowTimestamp(Date.now());
          }, msUntilEnd + 50);
        }
      };

      startForegroundActivities();

      const subscription = AppState.addEventListener(
        "change",
        (nextAppState: AppStateStatus) => {
          const prevAppState = appStateRef.current;
          appStateRef.current = nextAppState;

          if (!isScreenFocusedRef.current) return;

          if (nextAppState === "active") {
            if (prevAppState !== "active") {
              verifyBookingAndMembership({ isSilent: true });
            }
            startForegroundActivities();
          } else {
            clearAllTimersAndAbortPolling();
          }
        }
      );

      return () => {
        isScreenFocusedRef.current = false;
        clearAllTimersAndAbortPolling();
        if (verifyAbortRef.current) {
          verifyAbortRef.current.abort();
          verifyAbortRef.current = null;
        }
        subscription.remove();
      };
    }, [
      scheduleId,
      scheduleDate,
      scheduleStartTime,
      scheduleEndTime,
      pollScheduleStatus,
      verifyBookingAndMembership,
    ])
  );

  // --- SCRUM-73 Poin 6: Pull-to-Refresh waiting for all requests & showing error banner ---
  const onRefresh = useCallback(async () => {
    if (!scheduleId || isBookingInFlightRef.current) return;

    setRefreshing(true);
    setRefreshError(null);

    try {
      const [pollOk, verifyOk] = await Promise.all([
        pollScheduleStatus({ force: true }),
        verifyBookingAndMembership({ isSilent: true }),
      ]);

      if (!pollOk || !verifyOk) {
        setRefreshError(
          "Gagal memperbarui data terbaru. Menampilkan data terakhir yang tersimpan."
        );
      } else {
        setRefreshError(null);
      }
    } catch {
      setRefreshError(
        "Gagal memperbarui data terbaru. Periksa koneksi internet Anda."
      );
    } finally {
      setRefreshing(false);
    }
  }, [scheduleId, pollScheduleStatus, verifyBookingAndMembership]);

  // --- BOOKING VALIDATION COMPUTATION (F2, F3, F4, F7, F8 & Poin 7) ---
  const rawStatus = schedule?.status ?? "scheduled";
  const isCancelled = rawStatus === "cancelled";

  const sessionStartMs = schedule
    ? parseWitaDateTime(schedule.date, schedule.start_time).getTime()
    : 0;
  const sessionEndMs = schedule
    ? parseWitaDateTime(schedule.date, schedule.end_time).getTime()
    : 0;

  const isSessionStarted = schedule ? nowTimestamp >= sessionStartMs : false;
  const isSessionCompleted = schedule
    ? rawStatus === "completed" || nowTimestamp >= sessionEndMs
    : false;
  const isSessionOngoing = schedule
    ? rawStatus === "ongoing" ||
      (!isCancelled && !isSessionCompleted && isSessionStarted)
    : false;

  const isScheduledStatus = rawStatus === "scheduled";

  const membershipCheck = useMemo(
    () =>
      schedule
        ? evaluateMembershipOnSessionDate(membershipData, schedule.date)
        : { eligible: false, reason: "Data sesi belum siap." },
    [membershipData, schedule]
  );

  let buttonDisabledReason = "";
  if (isCancelled) {
    buttonDisabledReason = "Sesi telah dibatalkan.";
  } else if (isSessionCompleted) {
    buttonDisabledReason = "Sesi kelas telah selesai.";
  } else if (hasBooked) {
    buttonDisabledReason = "Anda sudah mem-booking sesi ini.";
  } else if (isSessionStarted || rawStatus === "ongoing" || isSessionOngoing) {
    buttonDisabledReason = "Sesi sudah dimulai.";
  } else if (!isScheduledStatus) {
    buttonDisabledReason = "Sesi tidak dalam status terjadwal untuk dibooking.";
  } else if (!membershipCheck.eligible) {
    buttonDisabledReason = membershipCheck.reason;
  }

  const canBook =
    Boolean(schedule) &&
    buttonDisabledReason === "" &&
    !isVerifyingEligibility &&
    !verificationError;

  // --- SCRUM-73 Poin 8 & F3: Protect open confirmation modal when session is cancelled or started ---
  useEffect(() => {
    if (!popup.visible || popup.type !== "confirm" || isBooking) return;

    if (isCancelled) {
      const reasonText =
        schedule?.cancel_reason && schedule.cancel_reason.trim() !== ""
          ? ` Alasan: ${schedule.cancel_reason}`
          : "";
      setPopup({
        visible: true,
        type: "error",
        title: "Sesi Dibatalkan Admin",
        message: `Sesi kelas ini baru saja dibatalkan sehingga tidak dapat dibooking.${reasonText}`,
      });
    } else if (isSessionStarted) {
      setPopup({
        visible: true,
        type: "error",
        title: "Waktu Habis",
        message: "Sesi sudah dimulai sehingga tidak dapat dibooking.",
      });
    } else if (!canBook && buttonDisabledReason) {
      setPopup({
        visible: true,
        type: "error",
        title: "Tidak Dapat Booking",
        message: buttonDisabledReason,
      });
    }
  }, [
    popup.visible,
    popup.type,
    isBooking,
    isCancelled,
    isSessionStarted,
    canBook,
    buttonDisabledReason,
    schedule?.cancel_reason,
  ]);

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
          {routeScheduleId !== null && !rawScheduleData && (
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

  // Determine StatusBadge prop & customText (Poin 7)
  let badgeStatus: ScheduleStatus = "scheduled";
  let badgeCustomText: string | undefined = undefined;

  if (isCancelled) {
    badgeStatus = "cancelled";
  } else if (isSessionCompleted) {
    badgeStatus = "completed";
  } else if (rawStatus === "ongoing" || isSessionOngoing) {
    badgeStatus = "scheduled";
    badgeCustomText = "Berlangsung";
  } else if (rawStatus === "unknown") {
    badgeStatus = "completed";
    badgeCustomText = "Tidak Diketahui";
  }

  const localParticipants = schedule.participants_count;
  const validMinParticipants = parseNonNegativeInt(schedule.min_participants);
  const hasMinParticipants = validMinParticipants !== null;

  // --- BOOKING ACTION HANDLERS (AC2, AC3, F3, F6, Poin 3 & Poin 8) ---
  const handleBooking = () => {
    const currentNow = Date.now();
    setNowTimestamp(currentNow);
    if (currentNow >= sessionStartMs || !canBook || isCancelled) {
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

    // Poin 8: Re-validate latest eligibility & status right before sending POST
    if (currentNow >= sessionStartMs || !canBook || isCancelled) {
      setPopup({
        visible: true,
        type: "error",
        title: isCancelled ? "Sesi Dibatalkan Admin" : "Tidak Dapat Booking",
        message:
          currentNow >= sessionStartMs
            ? "Sesi sudah dimulai sehingga tidak dapat dibooking."
            : buttonDisabledReason ||
              "Status sesi atau kelayakan telah berubah.",
      });
      return;
    }

    const targetSessionId = scheduleId;
    const reqContextToken = userToken ?? null;

    // Poin 3 & F6: Invalidate & abort any in-flight polling/verification requests before POST
    mutationEpochRef.current += 1;
    verifySeqRef.current += 1;
    pollSeqRef.current += 1;
    cancelAllInFlightRequests();

    isBookingInFlightRef.current = true;
    setIsBooking(true);

    try {
      const resolvedToken = reqContextToken || (await getToken());
      const headers = resolvedToken
        ? { Authorization: `Bearer ${resolvedToken}` }
        : undefined;

      // POST /api/v1/member/class-schedules/{classSchedule}/booking
      const postRes = await api.post(
        `/api/v1/member/class-schedules/${targetSessionId}/booking`,
        {},
        { headers }
      );

      if (
        activeSessionIdRef.current !== targetSessionId ||
        activeTokenRef.current !== reqContextToken
      ) {
        return;
      }

      // Bump epoch again so any stray response from before POST completion is strictly rejected
      mutationEpochRef.current += 1;

      const returnedSchedule = postRes.data?.data?.schedule;
      const authoritativeCount = parseNonNegativeInt(
        returnedSchedule?.participants_count
      );
      const returnedUpdatedAtMs = parseTimestampMs(
        returnedSchedule?.updated_at ?? postRes.data?.data?.updated_at
      );

      if (returnedUpdatedAtMs !== null) {
        lastUpdatedAtMsRef.current = returnedUpdatedAtMs;
      } else {
        lastUpdatedAtMsRef.current = Date.now();
      }

      // Poin 3: Use authoritative participants_count from server response (no double increment)
      setSchedule((prev) => {
        if (!prev || prev.id !== targetSessionId) return prev;
        const nextCount =
          authoritativeCount !== null
            ? authoritativeCount
            : prev.participants_count + 1;
        const nextStatus = returnedSchedule?.status
          ? mapBackendScheduleStatus(returnedSchedule.status, false)
          : prev.status;

        return {
          ...prev,
          status: nextStatus,
          participants_count: nextCount,
        };
      });

      setHasBooked(true);
      setVerificationError(null);
      setRefreshError(null);
      setIsVerifyingEligibility(false);

      setPopup({
        visible: true,
        type: "success",
        title: "Booking Berhasil!",
        message:
          toNonEmptyTrimmedString(postRes.data?.message) ||
          "Booking kelas berhasil tercatat. Sampai jumpa di kelas!",
      });
    } catch (err: unknown) {
      if (
        activeSessionIdRef.current !== targetSessionId ||
        activeTokenRef.current !== reqContextToken
      ) {
        return;
      }

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
      isBookingInFlightRef.current = false;
      if (
        activeSessionIdRef.current === targetSessionId &&
        activeTokenRef.current === reqContextToken
      ) {
        setIsBooking(false);
        // Poin 3: Reconcile state with authoritative server data after POST finishes
        pollScheduleStatus({ force: true });
        verifyBookingAndMembership({ isSilent: true });
      }
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fbbf24"
            colors={["#fbbf24"]}
          />
        }
      >
        {/* Poin 6: Pull-to-Refresh Error Banner (preserves last data + Retry button) */}
        {refreshError && (
          <View className="mb-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 mr-3">
              <Ionicons
                name="cloud-offline-outline"
                size={18}
                color="#fbbf24"
              />
              <Text className="text-amber-300 text-xs font-medium ml-2 flex-1">
                {refreshError}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={refreshing}
              onPress={onRefresh}
              className="px-3 py-1.5 rounded-lg bg-amber-400"
            >
              <Text className="text-zinc-950 text-xs font-bold">Coba Lagi</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cancellation Banner (AC4 SCRUM-26 & B9 SCRUM-25) */}
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
                Ket:{" "}
                {schedule.cancel_reason && schedule.cancel_reason.trim() !== ""
                  ? schedule.cancel_reason
                  : "Tidak ada alasan spesifik."}
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

          {/* F8: Participant Counter (Live updated via SCRUM-73 polling) */}
          <View className="pt-4 flex-row items-center justify-between">
            {hasMinParticipants ? (
              <ParticipantCounter
                current={localParticipants}
                min={validMinParticipants}
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
                  Minimum belum tersedia
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* --- BOOKING BUTTON SECTION (Hidden when session is cancelled per AC4/B9) --- */}
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
                  onPress={() => verifyBookingAndMembership({ isSilent: false })}
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

                {/* TODO (Amel - SCRUM-97): Tambahkan tombol "Batalkan Booking" di sini jika hasBooked === true && !isCancelled */}
                {/* if (hasBooked && !isCancelled) { <CancelBookingButton scheduleId={scheduleId} /> } */}
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
                  disabled={
                    isBooking || !canBook || isCancelled || isSessionStarted
                  }
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