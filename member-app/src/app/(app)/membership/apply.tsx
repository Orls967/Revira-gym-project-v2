import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useMembershipApplication } from '@/hooks/useMembershipApplication';
import { ApiError, apiClient } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PAYMENT_INSTRUCTIONS } from '@/constants/payment';
import { compressPaymentReceipt, ReceiptTooLargeError } from '@/lib/image';
import { MembershipPlanCard } from '@/components/MembershipPlanCard';
import { MembershipPlan, parseMembershipPlans, getMembershipAction, hasPendingApplication, MEMBERSHIP_ACTION_TITLE } from '@/lib/membership';

type Plan = MembershipPlan;

type FieldKey = 'membership_plan_id' | 'start_date' | 'payment_method' | 'receipt_image';
const FIELD_KEYS: FieldKey[] = ['membership_plan_id', 'start_date', 'payment_method', 'receipt_image'];
type FieldErrors = Partial<Record<FieldKey, string>>;

/* ------------------------------------------------------------------ */
/* Tanggal berbasis kalender WITA (Asia/Makassar, UTC+8, tanpa DST).   */
/* Semua logika memakai string 'YYYY-MM-DD' agar tidak bergantung pada */
/* timezone perangkat. Date lokal hanya dipakai untuk DateTimePicker.  */
/* ------------------------------------------------------------------ */
const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

const getWitaTodayYmd = (): string => {
  const d = new Date(Date.now() + WITA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const addDaysYmd = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

const ymdToLocalDate = (ymd: string, hour = 12): Date => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0);
};

const localDateToYmd = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/* ------------------------------------------------------------------ */
/* Parser error API                                                    */
/* ------------------------------------------------------------------ */
const parseApiError = (err: any) => {
  const status: number | undefined = err instanceof ApiError ? err.status : err?.response?.status;
  const data = err instanceof ApiError ? { errors: err.errors, message: err.message } : err?.response?.data;
  const rawErrors: Record<string, unknown> =
    data?.errors && typeof data.errors === 'object' ? data.errors : {};

  const fieldErrors: FieldErrors = {};
  const otherMessages: string[] = [];

  Object.entries(rawErrors).forEach(([key, val]) => {
    const msg = Array.isArray(val) ? String(val[0]) : String(val);
    if ((FIELD_KEYS as string[]).includes(key)) {
      fieldErrors[key as FieldKey] = msg;
    } else {
      // key tidak dikenal (mis. "membership") -> jadi pesan umum, bukan hilang
      otherMessages.push(msg);
    }
  });

  const message: string | undefined = typeof data?.message === 'string' ? data.message : undefined;
  return { status, fieldErrors, otherMessages, message, hasResponse: err instanceof ApiError || !!err?.response };
};

export default function ApplyMembershipScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, userToken, refreshUser, profileStatus } = useAuth();
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const requestedPlanId = planId ? Number(planId) : null;

  const u = user;

  /* ---------------- Status pengajuan ---------------- */
  const serverSupportsPending = typeof u?.has_pending_application === 'boolean';
  const { receipt: lastApplication, knownPending, notePending } = useMembershipApplication(
    serverSupportsPending ? undefined : u?.id, userToken,
  );
  // A successful POST or duplicate response is stronger than the pre-submit /me snapshot.
  // Keep it during refresh/failure, then let the next verified profile replace it.
  const [confirmedSubmission, setConfirmedSubmission] = useState<{ token: typeof userToken; profile: typeof u } | null>(null);
  const submissionPending = confirmedSubmission !== null &&
    confirmedSubmission.token === userToken && confirmedSubmission.profile === u;
  const isPending = submissionPending || (!serverSupportsPending && knownPending) ||
    (profileStatus === 'loaded' && hasPendingApplication(u));
  const confirmPending = (applicationId?: number) => {
    if (serverSupportsPending) setConfirmedSubmission({ token: userToken, profile: u });
    else notePending(applicationId);
  };
  const currentSession = useRef(userToken);
  useEffect(() => { currentSession.current = userToken; }, [userToken]);
  const submitting = useRef(false);
  const choosing = useRef(false);

  /* ---------------- Jenis pengajuan & tanggal ---------------- */
  const action = getMembershipAction(u?.membership);
  const isRenewal = action === 'renew';
  const endDate: string | undefined = u?.membership?.end_date?.slice(0, 10);

  // Hari ini (WITA) disimpan di state agar bisa dihitung ulang saat picker dibuka
  // dan saat aplikasi kembali dari background (pergantian hari).
  const [todayYmd, setTodayYmd] = useState<string>(getWitaTodayYmd);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTodayYmd(getWitaTodayYmd());
    });
    return () => sub.remove();
  }, []);

  const defaultStartYmd = useMemo(() => {
    if (isRenewal && endDate) {
      const next = addDaysYmd(endDate, 1);
      // Membership sudah expired (next <= hari ini) -> mulai hari ini
      return next > todayYmd ? next : todayYmd;
    }
    return todayYmd;
  }, [isRenewal, endDate, todayYmd]);

  const [startYmd, setStartYmd] = useState<string>(defaultStartYmd);
  const startTouched = useRef(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Data membership bisa datang setelah render pertama: perbarui default selama belum diubah manual
  useEffect(() => {
    if (!startTouched.current) setStartYmd(defaultStartYmd);
  }, [defaultStartYmd]);

  /* ---------------- Paket ---------------- */
  const [plans, setPlans] = useState<Plan[]>([]);
  const [fetchingPlans, setFetchingPlans] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const planTouched = useRef(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  /* ---------------- Form ---------------- */
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'on_the_spot'>('transfer');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false); // kamera/galeri sedang dibuka atau foto sedang diproses

  const clearError = (key: FieldKey) => {
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    setFormError(null);
  };

  // Tanggal yang sudah lampau (mis. lewat tengah malam WITA) tidak boleh tersisa
  useEffect(() => {
    if (startYmd < todayYmd) {
      setStartYmd(todayYmd);
      setErrors((prev) => ({
        ...prev,
        start_date: 'Tanggal mulai sudah terlewat dan diperbarui ke hari ini.',
      }));
    }
  }, [todayYmd, startYmd]);

  useEffect(() => {
    if (isPending) return;
    let cancelled = false;

    const loadPlans = async () => {
      try {
        const res = await apiClient.get('/api/v1/membership-plans');
        const data = res.data?.data ?? res.data;
        const list = parseMembershipPlans(data);
        if (!cancelled) setPlans(list);
      } catch {
        if (!cancelled) Alert.alert('Error', 'Gagal memuat data paket membership.');
      } finally {
        if (!cancelled) setFetchingPlans(false);
      }
    };

    loadPlans();
    return () => {
      cancelled = true;
    };
  }, [isPending]);

  // Tentukan pilihan paket setelah data paket dimuat (F4)
  useEffect(() => {
    if (fetchingPlans) return;

    if (planTouched.current) {
      // Pilihan manual tidak ditimpa; hanya dikosongkan bila paketnya hilang dari daftar
      if (selectedPlanId !== null && !plans.some((p) => p.id === selectedPlanId)) {
        setSelectedPlanId(null);
        setPlanNotice('Paket yang kamu pilih tidak lagi tersedia. Silakan pilih paket yang masih aktif.');
      }
      return;
    }

    if (requestedPlanId !== null) {
      if (plans.some((p) => p.id === requestedPlanId)) {
        setSelectedPlanId(requestedPlanId);
        setPlanNotice(null);
      } else {
        setSelectedPlanId(null);
        setPlanNotice('Paket yang kamu pilih sebelumnya tidak tersedia. Silakan pilih paket yang masih aktif.');
      }
    } else if (selectedPlanId === null && plans.length > 0) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, fetchingPlans, requestedPlanId, selectedPlanId]);

  const handleSelectPlan = (plan: Plan) => {
    planTouched.current = true;
    setSelectedPlanId(plan.id);
    setPlanNotice(null);
    clearError('membership_plan_id');
  };

  const handleOpenDatePicker = () => {
    setTodayYmd(getWitaTodayYmd()); // hitung ulang batas minimum saat picker dibuka
    setShowDatePicker(true);
  };

  const handlePickImage = async (useCamera: boolean = false) => {
    if (choosing.current || submitting.current) return;
    choosing.current = true;
    setPicking(true);

    try {
      // Hanya kamera yang butuh izin runtime. Galeri memakai pemilih foto sistem
      // sehingga tidak perlu izin storage (dan tidak ditolak karena izin).
      if (useCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          if (permission.canAskAgain) {
            Alert.alert(
              'Izin Kamera Ditolak',
              'Izin kamera dibutuhkan untuk memotret bukti transfer. Kamu juga bisa memilih foto dari galeri.'
            );
          } else {
            Alert.alert(
              'Izin Kamera Diblokir',
              'Izin kamera sudah ditolak permanen. Aktifkan lewat pengaturan aplikasi, atau pilih foto dari galeri.',
              [
                { text: 'Batal', style: 'cancel' },
                { text: 'Buka Pengaturan', onPress: () => Linking.openSettings() },
              ]
            );
          }
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });

      // Dibatalkan pengguna bukan error; bukti sebelumnya tetap dipertahankan
      const asset = result.canceled ? undefined : result.assets?.[0];
      if (!asset?.uri) return;

      try {
        const compressedUri = await compressPaymentReceipt(asset.uri, asset.width);
        // receiptUri baru diganti setelah foto pengganti berhasil diproses
        setReceiptUri(compressedUri);
        clearError('receipt_image');
      } catch (e) {
        // Foto pengganti gagal diproses. Jangan kirim bukti yang sudah ingin diganti.
        setReceiptUri(null);
        if (e instanceof ReceiptTooLargeError) {
          setErrors((prev) => ({
            ...prev,
            receipt_image: 'Ukuran foto masih lebih dari 2 MB setelah dikompres. Silakan pilih foto lain.',
          }));
        } else {
          setErrors((prev) => ({
            ...prev,
            receipt_image: 'Foto tidak dapat diproses. Pastikan formatnya gambar (JPG/PNG), lalu coba lagi.',
          }));
        }
      }
    } catch {
      // Kamera/galeri gagal dibuka (mis. perangkat tanpa kamera, aplikasi pemilih foto error)
      Alert.alert(
        'Tidak Dapat Membuka ' + (useCamera ? 'Kamera' : 'Galeri'),
        useCamera
          ? 'Kamera tidak dapat dibuka. Coba lagi atau pilih foto dari galeri.'
          : 'Galeri tidak dapat dibuka. Coba lagi atau gunakan kamera.'
      );
    } finally {
      choosing.current = false;
      setPicking(false);
    }
  };

  const handleSubmit = async () => {
    // Jangan kirim selama status membership belum terverifikasi dari server
    if (submitting.current || choosing.current || loading || picking || isPending || profileStatus !== 'loaded') return;

    if (!selectedPlan) {
      setErrors((prev) => ({ ...prev, membership_plan_id: 'Silakan pilih paket yang masih aktif.' }));
      return;
    }
    if (paymentMethod === 'transfer' && !PAYMENT_INSTRUCTIONS.confirmed) {
      setFormError(PAYMENT_INSTRUCTIONS.instruction);
      return;
    }
    if (paymentMethod === 'transfer' && !receiptUri) {
      setErrors((prev) => ({ ...prev, receipt_image: 'Bukti transfer wajib diunggah.' }));
      return;
    }

    // Validasi ulang tanggal tepat sebelum POST (hari bisa berganti saat form terbuka)
    const currentToday = getWitaTodayYmd();
    if (startYmd < currentToday) {
      setTodayYmd(currentToday);
      setStartYmd(currentToday);
      setErrors((prev) => ({
        ...prev,
        start_date: 'Tanggal mulai sudah terlewat dan diperbarui ke hari ini. Periksa kembali lalu kirim ulang.',
      }));
      return;
    }

    const requestSession = userToken;
    submitting.current = true;
    setLoading(true);
    setErrors({});
    setFormError(null);

    try {
      const formData = new FormData();
      formData.append('membership_plan_id', String(selectedPlan.id));
      formData.append('start_date', startYmd);
      formData.append('payment_method', paymentMethod);

      if (paymentMethod === 'transfer' && receiptUri) {
        const filename = receiptUri.split('/').pop() || 'receipt.jpg';
        formData.append('receipt_image', {
          uri: receiptUri,
          name: filename,
          type: 'image/jpeg',
        } as any);
      }

      const response = await apiClient.post('/api/v1/member/memberships', formData);
      if (currentSession.current !== requestSession) return;

      // Langsung tampilkan "Menunggu Verifikasi" dari respons sukses, tanpa menunggu /me
      confirmPending(response.data?.data?.membership?.id);
      try {
        if (refreshUser) await refreshUser();
      } catch {
        // gagal refresh tidak boleh membatalkan status sukses
      }
    } catch (err: any) {
      if (currentSession.current !== requestSession) return;
      const pendingMessages = err instanceof ApiError ? err.errors?.membership : err.response?.data?.errors?.membership;
      if ((err.status ?? err.response?.status) === 422 && Array.isArray(pendingMessages) && pendingMessages.some((message: string) => /menunggu verifikasi|pengajuan.*pending/i.test(message))) confirmPending();
      const { status, fieldErrors, otherMessages, message, hasResponse } = parseApiError(err);
      setErrors(fieldErrors);

      // F5: key tidak dikenal / error non-field tetap tampil lewat banner
      let banner: string | null = null;
      if (!hasResponse) {
        banner = 'Tidak dapat terhubung ke server. Periksa koneksi internet kamu lalu coba lagi.';
      } else if (otherMessages.length > 0) {
        banner = otherMessages.join('\n');
      } else if (Object.keys(fieldErrors).length === 0) {
        banner = message || 'Terjadi kesalahan saat mengajukan. Silakan coba lagi.';
      }
      setFormError(banner);

      // Pengajuan ganda / konflik: sinkronkan data /me
      if (status === 409 || (status === 422 && otherMessages.length > 0)) {
        try {
          if (refreshUser) await refreshUser();
        } catch {
          /* abaikan */
        }
      }
    } finally {
      submitting.current = false;
      if (currentSession.current === requestSession) setLoading(false);
    }
  };

  /* ---------------- Layar Menunggu Verifikasi (B2) ---------------- */
  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950 p-6">
        <Ionicons name="time-outline" size={64} color="#f59e0b" />
        <Text className="mt-4 text-center text-xl font-bold text-white">Menunggu Verifikasi</Text>
        <Text className="mt-2 text-center text-zinc-400">
          Pengajuan membership terakhir diketahui menunggu verifikasi admin. Silakan periksa kembali secara berkala.
        </Text>
        <TouchableOpacity onPress={() => router.replace('/(app)')} className="mt-6 rounded-xl bg-zinc-800 px-6 py-3">
          <Text className="font-semibold text-white">Kembali ke Beranda</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ---------------- Profil gagal dimuat: form tidak dibuka ---------------- */
  if (profileStatus === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950 p-6">
        <Ionicons name="cloud-offline-outline" size={64} color="#f59e0b" />
        <Text className="mt-4 text-center text-xl font-bold text-white">Gagal Memuat Profil</Text>
        <Text className="mt-2 text-center text-zinc-400">
          Status membership kamu belum bisa dipastikan, jadi pengajuan belum bisa dibuka. Periksa koneksi internet
          lalu coba lagi.
        </Text>
        <TouchableOpacity onPress={() => void refreshUser()} className="mt-6 rounded-xl bg-amber-500 px-6 py-3">
          <Text className="font-bold text-black">Coba Lagi</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} className="mt-3 rounded-xl bg-zinc-800 px-6 py-3">
          <Text className="font-semibold text-white">Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ---------------- Profil masih diperiksa ---------------- */
  if (profileStatus !== 'loaded') {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950 p-6">
        <ActivityIndicator color="#f59e0b" size="large" />
        <Text className="mt-4 text-center text-zinc-400">Memeriksa status membership...</Text>
      </View>
    );
  }

  const phone = u?.phone_number ?? '-';

  return (
    <ScrollView className="flex-1 bg-zinc-950 px-4" style={{ marginTop: insets.top }} contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}>
      <Text className="mb-4 text-2xl font-bold text-white">{MEMBERSHIP_ACTION_TITLE[action]}</Text>

      {!serverSupportsPending && lastApplication && !knownPending && (
        <View className="mb-4 rounded-xl border border-amber-500 p-3">
          <Text className="text-amber-400">Pengajuan terakhir tercatat menunggu verifikasi. Status terbaru belum dapat dipastikan. Periksa kembali atau hubungi admin sebelum mengajukan ulang.</Text>
          <TouchableOpacity onPress={() => void refreshUser()}><Text className="mt-2 text-white">Periksa kembali</Text></TouchableOpacity>
        </View>
      )}
      {/* Data pemohon (hanya baca) */}
      <View className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <Text className="text-xs text-zinc-400">Data Pemohon</Text>
        <Text className="text-base font-semibold text-white">{u?.name}</Text>
        <Text className="text-sm text-zinc-300">
          {u?.email} | {phone}
        </Text>
      </View>

      {/* 1. Pilih Paket */}
      <Text className="mb-2 text-base font-semibold text-white">1. Pilih Paket</Text>
      {planNotice && (
        <View className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <Text className="text-sm text-amber-400">{planNotice}</Text>
        </View>
      )}
      {fetchingPlans ? (
        <ActivityIndicator color="#f59e0b" className="my-4" />
      ) : plans.length === 0 ? (
        <Text className="mb-3 text-sm text-zinc-400">Belum ada paket aktif yang tersedia saat ini.</Text>
      ) : (
        plans.map((plan) => (
          <MembershipPlanCard key={plan.id} plan={plan} selected={selectedPlanId === plan.id} label={selectedPlanId === plan.id ? 'Dipilih' : 'Pilih Paket'} onPress={() => handleSelectPlan(plan)} />
        ))
      )}
      {errors.membership_plan_id && <Text className="mb-2 text-xs text-red-500">{errors.membership_plan_id}</Text>}

      {/* 2. Tanggal Mulai */}
      <Text className="mb-2 mt-4 text-base font-semibold text-white">2. Tanggal Mulai</Text>
      <TouchableOpacity
        onPress={handleOpenDatePicker}
        className="mb-2 flex-row items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4"
      >
        <Text className="text-white">
          {ymdToLocalDate(startYmd).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
        <Ionicons name="calendar-outline" size={20} color="#f59e0b" />
      </TouchableOpacity>
      <Text className="mb-2 text-xs text-zinc-500">
        {isRenewal && endDate
          ? defaultStartYmd === todayYmd
            ? 'Membership sebelumnya sudah berakhir, default: hari ini (WITA)'
            : 'Default: sehari setelah masa aktif sebelumnya berakhir'
          : 'Default: hari ini (WITA)'}
      </Text>
      {showDatePicker && (
        <DateTimePicker
          value={ymdToLocalDate(startYmd)}
          mode="date"
          minimumDate={ymdToLocalDate(todayYmd, 0)}
          onChange={(event, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (event.type === 'set' && date) {
              startTouched.current = true;
              setStartYmd(localDateToYmd(date));
              clearError('start_date');
            }
          }}
        />
      )}
      {errors.start_date && <Text className="mb-2 text-xs text-red-500">{errors.start_date}</Text>}

      {/* 3. Metode Pembayaran */}
      <Text className="mb-2 mt-4 text-base font-semibold text-white">3. Metode Pembayaran</Text>
      <View className="mb-4 flex-row gap-3">
        {(['transfer', 'on_the_spot'] as const).map((method) => (
          <TouchableOpacity
            key={method}
            onPress={() => {
              setPaymentMethod(method);
              clearError('payment_method');
              clearError('receipt_image');
            }}
            className={`flex-1 items-center rounded-xl border p-3 ${
              paymentMethod === method ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            <Text className="font-semibold text-white">
              {method === 'transfer' ? 'Transfer Bank' : 'Bayar di Tempat'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {errors.payment_method && <Text className="mb-2 text-xs text-red-500">{errors.payment_method}</Text>}

      {/* 4. Bukti Transfer */}
      {paymentMethod === 'transfer' && (
        <View className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <Text className="text-xs text-zinc-400">Instruksi Transfer</Text>
          {PAYMENT_INSTRUCTIONS.confirmed && (
            <>
              <Text className="mt-1 font-bold text-amber-500">{PAYMENT_INSTRUCTIONS.bankName} {PAYMENT_INSTRUCTIONS.accountNumber}</Text>
              <Text className="text-sm font-semibold text-white">a.n. {PAYMENT_INSTRUCTIONS.accountName}</Text>
            </>
          )}
          <Text className="mt-2 text-xs text-zinc-400">{PAYMENT_INSTRUCTIONS.instruction}</Text>

          <Text className="mb-2 mt-4 text-sm font-semibold text-white">Upload Bukti Transfer</Text>
          {receiptUri && (
            <Image source={{ uri: receiptUri }} className="mb-3 h-48 w-full rounded-lg" resizeMode="cover" />
          )}
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => handlePickImage(false)}
              disabled={picking}
              className="flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 p-4 disabled:opacity-50"
            >
              <Ionicons name="images-outline" size={24} color="#f59e0b" />
              <Text className="mt-1 text-xs text-zinc-300">{receiptUri ? 'Ganti dari Galeri' : 'Galeri'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handlePickImage(true)}
              disabled={picking}
              className="flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 p-4 disabled:opacity-50"
            >
              <Ionicons name="camera-outline" size={24} color="#f59e0b" />
              <Text className="mt-1 text-xs text-zinc-300">{receiptUri ? 'Ganti dari Kamera' : 'Kamera'}</Text>
            </TouchableOpacity>
          </View>
          {receiptUri && (
            <TouchableOpacity
              onPress={() => setReceiptUri(null)}
              disabled={picking}
              className="mt-2 items-center rounded-lg bg-red-600/20 px-4 py-2 disabled:opacity-50"
            >
              <Text className="text-xs font-semibold text-red-400">Hapus Foto</Text>
            </TouchableOpacity>
          )}
          {picking && <ActivityIndicator color="#f59e0b" className="mt-2" />}
          {errors.receipt_image && <Text className="mt-1 text-xs text-red-500">{errors.receipt_image}</Text>}
        </View>
      )}

      {/* 5. Ringkasan */}
      <View className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <Text className="mb-2 text-base font-semibold text-white">Ringkasan</Text>
        <Text className="text-sm text-zinc-300">Paket: {selectedPlan?.name ?? '-'}</Text>
        <Text className="text-sm text-zinc-300">
          Harga: {selectedPlan ? `Rp ${selectedPlan.price.toLocaleString('id-ID')}` : '-'}
        </Text>
        <Text className="text-sm text-zinc-300">
          Mulai:{' '}
          {ymdToLocalDate(startYmd).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
        <Text className="text-sm text-zinc-300">
          Pembayaran: {paymentMethod === 'transfer' ? 'Transfer Bank' : 'Bayar di Tempat'}
        </Text>
        {paymentMethod === 'transfer' && receiptUri && (
          <Image source={{ uri: receiptUri }} className="mt-2 h-16 w-16 rounded-md" resizeMode="cover" />
        )}
      </View>

      {formError && (
        <View className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <Text className="text-sm text-red-400">{formError}</Text>
        </View>
      )}

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={loading || picking}
        className="mb-10 items-center justify-center rounded-xl bg-amber-500 py-4 active:bg-amber-600 disabled:opacity-50"
      >
        {loading ? <ActivityIndicator color="#000" /> : <Text className="font-bold text-black">Kirim Pengajuan</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
} 