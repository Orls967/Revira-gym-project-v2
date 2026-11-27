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
  RawBackendSchedule,
  mapBackendScheduleStatus,
  normalizeScheduleItem,
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

// Structure extracted from GET /api/v1/me (supports single summary AND future renewal list/flags)
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
  } | null;
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

// Helper: Normalize validated HH:mm or HH:mm:ss into HH:mm:ss without losing seconds precision (F5)
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

// --- F5: Strict validator for normalized schedule object ---
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

  // If start_date or end_date was provided as a non-null value but failed calendar validation, reject
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

// --- F2: Extract & Validate MeController membership response from GET /api/v1/me ---
// Supports current single summary AND optional array/upcoming_membership for renewal (B6)
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

  // Support optional renewal / upcoming membership fields if backend provides them
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

// --- F2: Evaluate B6 Membership Eligibility against Session Date ---
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

  // Check if ANY valid active/upcoming membership period covers sessionDate (supports renewal)
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

type PollOutcome = "UPDATED" | "UNCHANGED" | "MISSING" | "ABORTED" | "FAILED";
type ScheduleSnapshot = Partial<Pick<
  NormalizedSchedule,
  "status" | "participants_count" | "min_participants" | "cancel_reason" | "updated_at"
>> & { id: number };

const REQUEST_TIMEOUT_MS = 12000;
const POLL_INTERVAL_MS = 15000;
const MAX_BACKOFF_MS = 120000;

function timestampMs(value: unknown) {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function retryAfterMs(value: unknown, now: number) {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const text = String(value).trim();
  const delay = /^\d+$/.test(text) ? Number(text) * 1000 : (timestampMs(text) ?? now) - now;
  return Math.min(MAX_BACKOFF_MS, Math.max(0, delay));
}

function findScheduleItem(payload: unknown, id: number): RawBackendSchedule | undefined {
  if (!Array.isArray(payload)) throw new Error("Format daftar jadwal dari server tidak valid.");
  return payload.find((item): item is RawBackendSchedule =>
    Boolean(item && typeof item === "object" && Number(item.id) === id)
  );
}

export default function ScheduleDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    scheduleData?: string | string[];
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userToken, isLoading: isAuthLoading } = useAuth();

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

  const [schedule, setSchedule] = useState<NormalizedSchedule | null>(
    initialParsedSchedule
  );
  const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(
    !initialParsedSchedule && routeScheduleId !== null
  );
  const [scheduleLoadError, setScheduleLoadError] = useState<string | null>(
    null
  );

  const scheduleRef = useRef(initialParsedSchedule);
  const observationRef = useRef(0);
  const acceptedObservationRef = useRef(0);
  const latestTimestampRef = useRef(timestampMs(initialParsedSchedule?.updated_at));
  const bookingRevisionRef = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);
  const focusedRef = useRef(false);
  const refreshSeqRef = useRef(0);
  const retryRef = useRef({ failures: 0, until: 0, throttled: false });

  // --- F6: Concurrency, Sequence ID, Session & Auth Token Guards ---
  const activeSessionIdRef = useRef<number | null>(routeScheduleId);
  const activeTokenRef = useRef<string | null>(userToken ?? null);
  const mutationEpochRef = useRef<number>(0);
  const verifySeqRef = useRef<number>(0);
  const isBookingInFlightRef = useRef<boolean>(false);
  const bookingSeqRef = useRef(0);
  const needsConflictReconciliationRef = useRef(false);

  const verifyAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  const abortPoll = useCallback(() => {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
  }, []);

  const abortVerification = useCallback(() => {
    verifyAbortRef.current?.abort();
    verifyAbortRef.current = null;
  }, []);

  const abortAllRequests = useCallback(() => {
    abortPoll();
    abortVerification();
    if (detailAbortRef.current) {
      detailAbortRef.current.abort();
      detailAbortRef.current = null;
    }
  }, [abortPoll, abortVerification]);

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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const isActive = useCallback(() =>
    focusedRef.current && AppState.currentState === "active", []);

  const acceptSnapshot = useCallback((snapshot: ScheduleSnapshot, observation: number, sawCancellation = false): PollOutcome => {
    const previous = scheduleRef.current;
    if (!previous || previous.id !== snapshot.id || activeSessionIdRef.current !== snapshot.id) {
      return "ABORTED";
    }
    const timestamp = timestampMs(snapshot.updated_at);
    if (
      observation < acceptedObservationRef.current ||
      (timestamp !== null && latestTimestampRef.current !== null &&
        timestamp < latestTimestampRef.current)
    ) {
      return "UNCHANGED";
    }

    acceptedObservationRef.current = observation;
    if (timestamp !== null) latestTimestampRef.current = timestamp;
    const next = {
      ...previous,
      status: snapshot.status ?? previous.status,
      participants_count: snapshot.participants_count ?? previous.participants_count,
      min_participants: snapshot.min_participants === undefined
        ? previous.min_participants : snapshot.min_participants,
      cancel_reason: "cancel_reason" in snapshot ? snapshot.cancel_reason : previous.cancel_reason,
      updated_at: snapshot.updated_at ?? previous.updated_at,
    };
    if (next.status !== "cancelled") next.cancel_reason = undefined;

    if (previous.status !== "cancelled" && (next.status === "cancelled" || sawCancellation)) {
      // B9 invalidates personal booking reads started before cancellation.
      bookingRevisionRef.current += 1;
      setHasBooked(false);
    }
    scheduleRef.current = next;
    if (
      previous.status === next.status &&
      previous.participants_count === next.participants_count &&
      previous.min_participants === next.min_participants &&
      previous.cancel_reason === next.cancel_reason &&
      previous.updated_at === next.updated_at
    ) return "UNCHANGED";

    setSchedule(next);
    return "UPDATED";
  }, []);

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

  // --- F6: Reset state & invalidate stale requests on session or auth token change ---
  useEffect(() => {
    activeSessionIdRef.current = routeScheduleId;
    activeTokenRef.current = userToken ?? null;
    mutationEpochRef.current += 1;
    verifySeqRef.current += 1;
    abortAllRequests();
    // A new auth/session context owns its own submit lock and loading state.
    bookingSeqRef.current += 1;
    isBookingInFlightRef.current = false;
    needsConflictReconciliationRef.current = false;
    setIsBooking(false);
    bookingRevisionRef.current += 1;
    acceptedObservationRef.current = 0;
    latestTimestampRef.current = timestampMs(initialParsedSchedule?.updated_at);
    scheduleRef.current = initialParsedSchedule;
    retryRef.current = { failures: 0, until: 0, throttled: false };
    refreshSeqRef.current += 1;
    setRefreshing(false);
    setRefreshError(null);
    setPopup((previous) => ({ ...previous, visible: false }));

    setHasBooked(false);
    setMembershipData(null);
    setVerificationError(null);
    setIsVerifyingEligibility(true);
    setNowTimestamp(Date.now());

    if (
      rawScheduleData &&
      !initialParsedSchedule &&
      routeScheduleId !== null
    ) {
      // Explicit scheduleData was passed in params, but failed F5 validation
      setSchedule(null);
      setIsLoadingSchedule(false);
      setScheduleLoadError(
        "Data sesi tidak valid (format tanggal, waktu, atau kuota tidak sesuai kontrak)."
      );
      return;
    }

    if (initialParsedSchedule && initialParsedSchedule.id === routeScheduleId) {
      setSchedule(initialParsedSchedule);
      setIsLoadingSchedule(false);
      setScheduleLoadError(null);
    } else {
      setSchedule(null);
      setIsLoadingSchedule(routeScheduleId !== null);
      setScheduleLoadError(null);
    }

    return () => {
      activeSessionIdRef.current = null;
      abortAllRequests();
    };
  }, [
    routeScheduleId,
    userToken,
    isAuthLoading,
    rawScheduleData,
    initialParsedSchedule,
    abortAllRequests,
  ]);

  // --- F5: Fallback fetch from GET /api/v1/class-schedules if opened without scheduleData ---
  const fetchScheduleDetailFallback = useCallback(async () => {
    const targetSessionId = routeScheduleId;
    if (isAuthLoading) return;
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
    const isCurrentRequest = () =>
      detailAbortRef.current === controller &&
      !controller.signal.aborted &&
      activeSessionIdRef.current === targetSessionId &&
      activeTokenRef.current === (userToken ?? null) &&
      mutationEpochRef.current === startEpoch;

    setIsLoadingSchedule(true);
    setScheduleLoadError(null);

    try {
      const res = await api.get("/api/v1/class-schedules", {
        signal: controller.signal,
        timeout: REQUEST_TIMEOUT_MS,
      });

      if (!isCurrentRequest()) {
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

      scheduleRef.current = normalized;
      latestTimestampRef.current = timestampMs(normalized.updated_at);
      setSchedule(normalized);
    } catch (err: unknown) {
      if (isRequestCanceled(err)) return;
      if (!isCurrentRequest()) return;

      const error = err as AxiosErrorResponse;
      setScheduleLoadError(
        error.response?.data?.message ||
          error.message ||
          "Gagal memuat detail jadwal dari server."
      );
    } finally {
      if (isCurrentRequest()) {
        setIsLoadingSchedule(false);
      }
    }
  }, [routeScheduleId, userToken, isAuthLoading]);

  useEffect(() => {
    if (
      !isAuthLoading &&
      !rawScheduleData &&
      !initialParsedSchedule &&
      routeScheduleId !== null
    ) {
      fetchScheduleDetailFallback();
    }
  }, [
    isAuthLoading,
    rawScheduleData,
    initialParsedSchedule,
    routeScheduleId,
    fetchScheduleDetailFallback,
  ]);

  const scheduleId = schedule?.id ?? null;
  const scheduleDate = schedule?.date;
  const scheduleStartTime = schedule?.start_time;
  const scheduleEndTime = schedule?.end_time;

  const pollScheduleStatus = useCallback(async (force = false): Promise<PollOutcome> => {
    const targetId = scheduleId;
    const token = userToken ?? null;
    if (
      !isActive() || isAuthLoading || !targetId || !scheduleDate ||
      activeSessionIdRef.current !== targetId || activeTokenRef.current !== token ||
      isBookingInFlightRef.current
    ) return "ABORTED";

    const retry = retryRef.current;
    if (Date.now() < retry.until && (!force || retry.throttled)) return "FAILED";
    if (pollAbortRef.current && !force) return "ABORTED";
    abortPoll();

    const controller = new AbortController();
    pollAbortRef.current = controller;
    const epoch = mutationEpochRef.current;
    const observation = ++observationRef.current;
    const isCurrent = () =>
      !controller.signal.aborted && pollAbortRef.current === controller &&
      mutationEpochRef.current === epoch && activeSessionIdRef.current === targetId &&
      activeTokenRef.current === token && !isBookingInFlightRef.current && isActive();
    const recovered = () => {
      retryRef.current = { failures: 0, until: 0, throttled: false };
    };
    const recordFailure = (error: unknown) => {
      const response = (error as AxiosErrorResponse & {
        response?: { headers?: Record<string, unknown> };
      })?.response;
      if (response?.status && response.status !== 429 && response.status < 500) return;
      const failures = retryRef.current.failures + 1;
      const now = Date.now();
      const delay = Math.min(MAX_BACKOFF_MS, 2 ** Math.min(failures, 3) * POLL_INTERVAL_MS);
      const requestedDelay = response?.status === 429 || response?.status === 503
        ? retryAfterMs(response.headers?.["retry-after"], now) : 0;
      retryRef.current = {
        failures,
        until: now + Math.max(delay, requestedDelay),
        throttled: response?.status === 429,
      };
    };

    try {
      const config = {
        signal: controller.signal,
        timeout: REQUEST_TIMEOUT_MS,
        params: { date_from: scheduleDate, date_to: scheduleDate },
      };
      const res = await api.get("/api/v1/class-schedules/status", {
        ...config,
        validateStatus: (status) => status === 304 || (status >= 200 && status < 300),
      });
      if (!isCurrent()) return "ABORTED";
      if (res.status === 304) {
        recovered();
        return "UNCHANGED";
      }

      const item = findScheduleItem(res.data?.data, targetId);
      if (!item) {
        recovered();
        return "MISSING";
      }
      const count = parseNonNegativeInt(item.participants_count);
      if (count === null) throw new Error("Jumlah peserta dari server tidak valid.");

      const status = mapBackendScheduleStatus(item.status, false);
      const updatedAt = toNonEmptyTrimmedString(item.updated_at) ?? undefined;
      const snapshot: ScheduleSnapshot = {
        id: targetId,
        status,
        participants_count: count,
        ...(item.min_participants === undefined ? {} : { min_participants: parseNonNegativeInt(item.min_participants) }),
        ...(updatedAt ? { updated_at: updatedAt } : {}),
      };
      if (status === "cancelled") {
        const statusTime = timestampMs(updatedAt);
        if (statusTime !== null && latestTimestampRef.current !== null &&
            statusTime < latestTimestampRef.current) {
          recovered();
          return "UNCHANGED";
        }
        try {
          const fullResponse = await api.get("/api/v1/class-schedules", config);
          if (!isCurrent()) return "ABORTED";
          const full = normalizeScheduleItem(findScheduleItem(fullResponse.data?.data, targetId), false);
          const fullTime = timestampMs(full?.updated_at);
          if (!isValidNormalizedSchedule(full) || full.status === "unknown" || full.date !== scheduleDate ||
              (statusTime !== null && (fullTime === null || fullTime < statusTime))) {
            throw new Error("Rincian pembatalan belum tersedia.");
          }
          recovered();
          // The second response may already contain a valid reschedule.
          return acceptSnapshot({ ...full, cancel_reason: full.cancel_reason ?? "" }, observation, true);
        } catch (err: unknown) {
          if (!isCurrent() || isRequestCanceled(err)) return "ABORTED";
          // Hide booking immediately, but never borrow a reason from a
          // different snapshot or report refresh success without the detail.
          if (updatedAt !== scheduleRef.current?.updated_at || scheduleRef.current?.status !== "cancelled") {
            snapshot.cancel_reason = undefined;
          }
          acceptSnapshot(snapshot, observation);
          recordFailure(err);
          return "FAILED";
        }
      }

      recovered();
      return acceptSnapshot(snapshot, observation);
    } catch (err: unknown) {
      if (!isCurrent() || isRequestCanceled(err)) return "ABORTED";
      recordFailure(err);
      return "FAILED";
    } finally {
      if (pollAbortRef.current === controller) pollAbortRef.current = null;
    }
  }, [abortPoll, acceptSnapshot, isActive, isAuthLoading, scheduleDate, scheduleId, userToken]);

  const verifyBookingAndMembership = useCallback(async (silent = false): Promise<PollOutcome> => {
    const targetSessionId = scheduleId;
    const reqContextToken = userToken ?? null;
    if (
      isAuthLoading || !isActive() || !targetSessionId ||
      activeSessionIdRef.current !== targetSessionId ||
      activeTokenRef.current !== reqContextToken || isBookingInFlightRef.current
    ) return "ABORTED";

    abortVerification();
    const controller = new AbortController();
    verifyAbortRef.current = controller;
    const reqSeq = ++verifySeqRef.current;
    const reqEpoch = mutationEpochRef.current;
    const bookingRevision = bookingRevisionRef.current;
    const observation = ++observationRef.current;
    const reconcileConflict = needsConflictReconciliationRef.current;
    const isCurrent = () =>
      !controller.signal.aborted && reqSeq === verifySeqRef.current &&
      reqEpoch === mutationEpochRef.current && activeSessionIdRef.current === targetSessionId &&
      activeTokenRef.current === reqContextToken && isActive() && !isBookingInFlightRef.current;

    if (!silent || reconcileConflict) {
      setIsVerifyingEligibility(true);
      setVerificationError(null);
    }

    try {
      const resolvedToken = reqContextToken || (await getToken());
      if (!isCurrent()) return "ABORTED";
      if (!resolvedToken) throw new Error("Silakan login untuk memeriksa status booking.");
      const headers = { Authorization: "Bearer " + resolvedToken };
      const config = { headers, signal: controller.signal, timeout: REQUEST_TIMEOUT_MS };
      const [meRes, bookingsRes] = await Promise.all([
        api.get("/api/v1/me", config),
        api.get("/api/v1/member/bookings", config),
      ]);
      if (!isCurrent()) return "ABORTED";

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
      let authoritativeCountFromBookings: number | null = null;

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
            : typeof rawBookedId === "string" && /^\d+$/.test(rawBookedId.trim())
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

        const isBookingActive = bookingStatusStr.toLowerCase() !== "cancelled";

        if (bookedScheduleId === targetSessionId) {
          const parsedCount = parseNonNegativeInt(
            b.schedule.participants_count
          );
          if (parsedCount !== null) {
            authoritativeCountFromBookings = parsedCount;
          }
          if (isBookingActive) {
            foundActiveBooking = true;
            break;
          }
        }
      }

      // The public poll owns session status. Use a private response count only
      // before the first live observation, or to reconcile a booking conflict.
      const canApplyBooking = () =>
        bookingRevision === bookingRevisionRef.current &&
        scheduleRef.current?.status !== "cancelled";

      if (reconcileConflict && authoritativeCountFromBookings === null) {
        if (!scheduleDate) throw new Error("Tanggal sesi belum tersedia.");
        const schedulesRes = await api.get("/api/v1/class-schedules", {
          ...config,
          params: { date_from: scheduleDate, date_to: scheduleDate },
        });
        if (!isCurrent()) return "ABORTED";

        const raw = findScheduleItem(schedulesRes.data?.data, targetSessionId);
        const current = normalizeScheduleItem(raw, false);
        if (!isValidNormalizedSchedule(current) || current.date !== scheduleDate) {
          throw new Error("Jumlah peserta sesi belum dapat diverifikasi. Silakan coba lagi.");
        }
        acceptSnapshot(current, observation);
      } else {
        if (reconcileConflict) {
          // A valid booking row can reconcile personal status and count, but
          // only the public endpoint can confirm today's schedule status.
          const publicOutcome = await pollScheduleStatus(true);
          if (!isCurrent()) return "ABORTED";
          if (publicOutcome !== "UPDATED" && publicOutcome !== "UNCHANGED") {
            throw new Error("Status sesi belum dapat diverifikasi. Silakan coba lagi.");
          }
        }
        if (
          canApplyBooking() && authoritativeCountFromBookings !== null &&
          (reconcileConflict || acceptedObservationRef.current === 0)
        ) {
          acceptSnapshot({ id: targetSessionId, participants_count: authoritativeCountFromBookings }, observation);
        }
      }

      setMembershipData(parsedMembership);
      if (canApplyBooking()) setHasBooked(foundActiveBooking);
      if (reconcileConflict) needsConflictReconciliationRef.current = false;
      setVerificationError(null);
      return "UPDATED";
    } catch (err: unknown) {
      if (!isCurrent() || isRequestCanceled(err)) return "ABORTED";
      const error = err as AxiosErrorResponse;
      setVerificationError(error.response?.data?.message || error.message ||
        "Gagal memuat status membership atau riwayat booking Anda.");
      return "FAILED";
    } finally {
      // A silent verification can replace initial or manual verification.
      // Only the newest live request may settle the shared loading state.
      if (isCurrent()) {
        verifyAbortRef.current = null;
        setIsVerifyingEligibility(false);
      }
    }
  }, [abortVerification, acceptSnapshot, isActive, isAuthLoading, pollScheduleStatus, scheduleDate, scheduleId, userToken]);

  const onRefresh = useCallback(async () => {
    if (!isActive() || isAuthLoading || !scheduleId || isBookingInFlightRef.current) return;
    const refresh = ++refreshSeqRef.current;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const [poll, verification] = needsConflictReconciliationRef.current
        ? ["UNCHANGED", await verifyBookingAndMembership(true)]
        : await Promise.all([pollScheduleStatus(true), verifyBookingAndMembership(true)]);
      if (refresh !== refreshSeqRef.current || !isActive()) return;
      if (poll === "MISSING") {
        setRefreshError("Sesi tidak ditemukan saat memperbarui. Data terakhir tetap ditampilkan.");
      } else if (poll === "FAILED" || verification === "FAILED") {
        setRefreshError("Gagal memperbarui data terbaru. Data terakhir tetap ditampilkan.");
      } else if (poll === "ABORTED" || verification === "ABORTED") {
        setRefreshError("Pembaruan terhenti. Silakan coba lagi.");
      }
    } finally {
      if (refresh === refreshSeqRef.current) setRefreshing(false);
    }
  }, [isActive, isAuthLoading, pollScheduleStatus, scheduleId, verifyBookingAndMembership]);

  // --- F3: Automatic Local Clock Updater (Periodic + Exact Session Start/End Deadline Timers + AppState) ---
  useFocusEffect(
    useCallback(() => {
      if (isAuthLoading || !scheduleId || !scheduleDate || !scheduleStartTime || !scheduleEndTime) return;

      focusedRef.current = true;
      let pollIntervalId: ReturnType<typeof setInterval> | null = null;
      let intervalId: ReturnType<typeof setInterval> | null = null;
      let startDeadlineTimeoutId: ReturnType<typeof setTimeout> | null = null;
      let endDeadlineTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const stopActivities = () => {
        if (pollIntervalId) {
          clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
        abortPoll();
        abortVerification();
        refreshSeqRef.current += 1;
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        if (startDeadlineTimeoutId) {
          clearTimeout(startDeadlineTimeoutId);
          startDeadlineTimeoutId = null;
        }
        if (endDeadlineTimeoutId) {
          clearTimeout(endDeadlineTimeoutId);
          endDeadlineTimeoutId = null;
        }
      };

      const startActivities = () => {
        stopActivities();
        if (!isActive()) return;
        setRefreshing(false);
        if (!isBookingInFlightRef.current) {
          void verifyBookingAndMembership();
          if (!needsConflictReconciliationRef.current) void pollScheduleStatus();
        }
        pollIntervalId = setInterval(() => { void pollScheduleStatus(); }, POLL_INTERVAL_MS);

        const currentNow = Date.now();
        setNowTimestamp(currentNow);

        // 1. Periodic 5s local clock tick while screen is focused and app is in foreground
        intervalId = setInterval(() => {
          if (AppState.currentState === "active") {
            setNowTimestamp(Date.now());
          }
        }, 5000);

        // 2. Exact deadline timer for sessionStartMs so button disables at the exact second the session starts
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

        // 3. Exact deadline timer for sessionEndMs
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

      let currentAppState = AppState.currentState;
      startActivities();

      const subscription = AppState.addEventListener(
        "change",
        (nextAppState: AppStateStatus) => {
          if (nextAppState === currentAppState) return;
          currentAppState = nextAppState;
          if (nextAppState === "active") {
            startActivities();
          } else {
            stopActivities();
            setRefreshing(false);
          }
        }
      );

      return () => {
        focusedRef.current = false;
        stopActivities();
        subscription.remove();
      };
    }, [abortPoll, abortVerification, isActive, isAuthLoading, pollScheduleStatus,
      scheduleDate, scheduleEndTime, scheduleId, scheduleStartTime, verifyBookingAndMembership])
  );

  // --- BOOKING VALIDATION COMPUTATION (F2, F3, F4, F7, F8) ---
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

  // F4: Strictly only "scheduled" status is allowed to book per backend contract
  const isScheduledStatus = rawStatus === "scheduled";

  // F2: Check membership validity on schedule.date (Rule B6)
  const membershipCheck = useMemo(
    () =>
      schedule
        ? evaluateMembershipOnSessionDate(membershipData, schedule.date)
        : { eligible: false, reason: "Data sesi belum siap." },
    [membershipData, schedule]
  );

  // Determine disabled reason in priority order (F3: "Sesi sudah dimulai" when start time passed)
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
    !isAuthLoading &&
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

  // --- BOOKING ACTION HANDLERS (AC2, AC3, F3, F6) ---
  const handleBooking = () => {
    const currentNow = Date.now();
    setNowTimestamp(currentNow);
    if (needsConflictReconciliationRef.current || currentNow >= sessionStartMs || !canBook) {
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
    // Lock synchronously: two taps can arrive before React renders disabled.
    if (!isActive() || isAuthLoading || isBookingInFlightRef.current ||
        needsConflictReconciliationRef.current) return;
    const currentNow = Date.now();
    setNowTimestamp(currentNow);
    if (currentNow >= sessionStartMs || !canBook) {
      setPopup({
        visible: true,
        type: "error",
        title: "Waktu Habis",
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

    // F6: Invalidate any in-flight verification requests started before this POST
    mutationEpochRef.current += 1;
    verifySeqRef.current += 1;
    abortPoll();
    if (verifyAbortRef.current) {
      verifyAbortRef.current.abort();
      verifyAbortRef.current = null;
    }

    let reconcileSchedule = false;
    let reconcileBooking = false;
    const bookingSeq = ++bookingSeqRef.current;
    isBookingInFlightRef.current = true;
    setIsBooking(true);

    try {
      const resolvedToken = reqContextToken || (await getToken());
      if (
        bookingSeqRef.current !== bookingSeq ||
        activeSessionIdRef.current !== targetSessionId ||
        activeTokenRef.current !== reqContextToken ||
        !isActive() || scheduleRef.current?.status !== "scheduled"
      ) return;
      const headers = resolvedToken
        ? { Authorization: `Bearer ${resolvedToken}` }
        : undefined;

      // POST /api/v1/member/class-schedules/{classSchedule}/booking
      const postRes = await api.post(
        `/api/v1/member/class-schedules/${targetSessionId}/booking`,
        {},
        { headers, timeout: REQUEST_TIMEOUT_MS }
      );

      // F6: Verify session and auth context are still identical before applying POST result
      if (
        bookingSeqRef.current !== bookingSeq ||
        activeSessionIdRef.current !== targetSessionId ||
        activeTokenRef.current !== reqContextToken
      ) {
        return;
      }

      // Bump epoch again so any stray response from before POST completion is strictly rejected
      mutationEpochRef.current += 1;

      // The POST resource provides an authoritative count. If omitted,
      // leave the current count intact until the next public snapshot.
      const returnedCount = parseNonNegativeInt(postRes.data?.data?.schedule?.participants_count);
      if (returnedCount !== null) {
        acceptSnapshot({ id: targetSessionId, participants_count: returnedCount }, ++observationRef.current);
      }

      reconcileSchedule = true;
      setHasBooked(true);
      setVerificationError(null);
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
        bookingSeqRef.current !== bookingSeq ||
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
        if (error.response?.status === 409) {
          // Keep stale callbacks locked until GET reconciliation succeeds.
          // A conflict is not a new booking success and must not increment count.
          needsConflictReconciliationRef.current = true;
          setIsVerifyingEligibility(true);
        } else if (!error.response?.status || error.response.status >= 500 ||
                   error.response.status === 422) {
          // A timed-out POST may have succeeded. A 422 can mean the session was
          // cancelled or started while the request was on its way.
          reconcileSchedule = true;
          reconcileBooking = !error.response?.status || error.response.status >= 500;
        }
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
      // An obsolete operation must not unlock a newer account's booking.
      if (
        bookingSeqRef.current === bookingSeq &&
        activeSessionIdRef.current === targetSessionId &&
        activeTokenRef.current === reqContextToken
      ) {
        isBookingInFlightRef.current = false;
        setIsBooking(false);
        // Verification rejects results during a POST. Start it only after the
        // submit lock is released; the conflict ref still blocks duplicate POSTs.
        if ((needsConflictReconciliationRef.current || reconcileBooking) && isActive()) {
          await verifyBookingAndMembership();
        }
        // A focus/foreground entry automatically reconciles if POST ended away.
        if (reconcileSchedule && bookingSeqRef.current === bookingSeq && isActive()) {
          await pollScheduleStatus();
        }
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
                Ket: {schedule.cancel_reason === undefined
                  ? "Alasan pembatalan belum tersedia."
                  : schedule.cancel_reason || "Tidak ada alasan spesifik."}
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

          {/* F8: Participant Counter — only render ParticipantCounter when min is a valid integer >= 0 */}
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
                  onPress={() => { void verifyBookingAndMembership(); }}
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
                  disabled={isBooking || !canBook || isCancelled || isSessionStarted}
                  onPress={closePopup}
                  className="flex-1 py-3.5 rounded-xl bg-zinc-800 border border-zinc-700 items-center justify-center"
                >
                  <Text className="text-sm font-bold text-zinc-300">Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={isBooking || !canBook || isSessionStarted}
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