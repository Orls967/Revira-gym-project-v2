import React, { useState, useEffect } from "react";
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
import { StatusBadge } from "@/components/StatusBadge";
import { ClassSchedule } from "@/types/schedule";

// Definisikan tipe error lokal untuk Axios
interface AxiosErrorResponse {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
  message?: string;
}

type PopupState = {
  visible: boolean;
  type: "confirm" | "success" | "error" | "unauthorized";
  title: string;
  message: string;
};

export default function ScheduleDetailScreen() {
  const { scheduleData } = useLocalSearchParams<{ scheduleData: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, userToken } = useAuth();

  // Parse data dari halaman sebelumnya
  const schedule: ClassSchedule = scheduleData ? JSON.parse(scheduleData) : null;

  // Local State untuk AC2 (Update counter & status tanpa reload)
  const [localParticipants, setLocalParticipants] = useState(
    schedule?.current_participants || 0
  );
  const [hasBooked, setHasBooked] = useState(false);

  // Loading States
  const [isCheckingBooking, setIsCheckingBooking] = useState(true);
  const [isBooking, setIsBooking] = useState(false);

  // Custom Themed Popup State
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

  // Cek Status Booking Sendiri (SCRUM-70)
  useEffect(() => {
    let ignore = false;
    if (!schedule) return;

    async function checkUserBooking() {
      try {
        const token = userToken || (await getToken());
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const res = await api.get("/api/v1/member/bookings", { headers });
        if (!ignore) {
          const bookings = res.data?.data || [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const alreadyBooked = bookings.some(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (b: any) =>
              b.schedule_id === schedule.id ||
              b.class_schedule_id === schedule.id
          );
          setHasBooked(alreadyBooked);
        }
      } catch {
        // Abaikan error fetch, anggap belum booking
      } finally {
        if (!ignore) setIsCheckingBooking(false);
      }
    }

    checkUserBooking();

    return () => {
      ignore = true;
    };
  }, [schedule, userToken]);

  if (!schedule) {
    return (
      <View
        className="flex-1 items-center justify-center bg-zinc-950 px-6"
        style={{ paddingTop: insets.top }}
      >
        <Ionicons name="alert-circle-outline" size={48} color="#f87171" />
        <Text className="text-white text-lg font-bold mt-3">
          Data Sesi Tidak Ditemukan
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

  // Format Tanggal Indonesia (Contoh: Sabtu, 10 Oktober 2026)
  const formattedDate = new Date(
    `${schedule.date}T00:00:00`
  ).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // --- LOGIKA VALIDASI TOMBOL (AC1 & AC4) ---
  const isCancelled = schedule.status === "cancelled";
  const isFull = localParticipants >= schedule.max_participants;

  // Cek apakah sesi sudah lewat (menggabungkan date dan start_time)
  const sessionDateTime = new Date(`${schedule.date}T${schedule.start_time}`);
  const isSessionStarted = new Date() >= sessionDateTime;

  // Type casting agar TypeScript mengenali properti is_active
  const currentUser = user as UserData & { is_active?: boolean };
  const isMemberActive = currentUser?.is_active !== false;

  let buttonDisabledReason = "";
  if (isCancelled) buttonDisabledReason = "Sesi telah dibatalkan.";
  else if (!isMemberActive)
    buttonDisabledReason = "Membership Anda belum aktif.";
  else if (isSessionStarted)
    buttonDisabledReason = "Sesi kelas sudah dimulai/berakhir.";
  else if (hasBooked) buttonDisabledReason = "Anda sudah mem-booking sesi ini.";
  else if (isFull) buttonDisabledReason = "Kapasitas kelas sudah penuh.";

  const canBook = buttonDisabledReason === "";

  // --- HANDLER BOOKING (AC3) ---
  const handleBooking = () => {
    setPopup({
      visible: true,
      type: "confirm",
      title: "Konfirmasi Booking",
      message: `Apakah Anda yakin ingin mem-booking sesi kelas ini?`,
    });
  };

  const confirmBookingAction = async () => {
    setIsBooking(true);
    try {
      const token = userToken || (await getToken());
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      // POST /api/v1/member/class-schedules/{id}/booking
      await api.post(
        `/api/v1/member/class-schedules/${schedule.id}/booking`,
        {},
        { headers }
      );

      // AC2: Update counter & status tombol tanpa reload
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
      {/* Header Selaras dengan Jadwal Kelas */}
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

        <StatusBadge
          status={isCancelled ? "cancelled" : isFull ? "full" : "scheduled"}
        />
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
        {/* Banner Pembatalan (AC4) */}
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

        {/* Kartu Utama Informasi Kelas */}
        <View
          className={`p-5 rounded-2xl border mb-6 ${
            isCancelled
              ? "bg-red-950/20 border-red-900/40"
              : "bg-zinc-900 border-zinc-800"
          }`}
        >
          {/* Judul & Instruktur */}
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

          {/* Detail Tanggal & Waktu */}
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

          {/* Kuota & Counter Peserta (Komponen SCRUM-59 dari Amel) */}
          <View className="pt-4 flex-row items-center justify-between">
            <ParticipantCounter
              current={localParticipants}
              min={
                (schedule as ClassSchedule & { min_participants?: number })
                  .min_participants || 5
              }
            />

            <View className="items-end">
              <Text className="text-[11px] text-zinc-400 font-medium">
                Kapasitas Maksimal
              </Text>
              <Text
                className={`text-xs font-bold mt-0.5 ${
                  isFull ? "text-red-400" : "text-white"
                }`}
              >
                {localParticipants} / {schedule.max_participants} Peserta
              </Text>
            </View>
          </View>
        </View>

        {/* --- AREA TOMBOL BOOKING --- */}
        {isCheckingBooking ? (
          <View className="py-6 items-center justify-center">
            <ActivityIndicator size="small" color="#fbbf24" />
            <Text className="text-zinc-400 text-xs mt-2">
              Memeriksa status booking...
            </Text>
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

            {/* Pesan Alasan Tombol Nonaktif (AC1) */}
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
            {/* if (hasBooked) { <CancelBookingButton scheduleId={schedule.id} /> } */}
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
            {/* Icon Header Popup */}
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

            {/* Judul & Pesan Popup */}
            <Text className="text-xl font-extrabold text-white text-center mb-2">
              {popup.title}
            </Text>
            <Text className="text-sm text-zinc-400 text-center leading-5 mb-5">
              {popup.message}
            </Text>

            {/* Box Ringkasan Sesi (Hanya saat Konfirmasi atau Sukses) */}
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

            {/* Tombol Aksi Popup */}
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
