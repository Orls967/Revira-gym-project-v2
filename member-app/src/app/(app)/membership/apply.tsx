import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PAYMENT_INSTRUCTIONS } from '@/constants/payment';
import { compressPaymentReceipt } from '@/lib/image';

interface Plan {
  id: number;
  name: string;
  price: number;
  duration_days: number;
}

export default function ApplyMembershipScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  
  // Poin 4: Tangkap planId dari URL agar paket yang diklik di Beranda terpilih otomatis
  const { planId } = useLocalSearchParams<{ planId?: string }>();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  
  // Poin 3: Logika penentuan tanggal (B3) diperbaiki agar tidak bergeser zona waktu
  const getMinDate = () => new Date();
  const getDefaultStartDate = () => {
    // Jika ada membership aktif, set default mengikuti end_date
    if (user?.membership?.end_date) {
      // Pastikan parsing tanggal aman dari pergeseran WITA
      const [year, month, day] = user.membership.end_date.split('-');
      const endDate = new Date(Number(year), Number(month) - 1, Number(day));
      endDate.setDate(endDate.getDate() + 1);
      return endDate > new Date() ? endDate : new Date();
    }
    // Jika tidak ada, default hari ini
    return new Date();
  };

  const [startDate, setStartDate] = useState<Date>(getDefaultStartDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Poin 1: Ubah value backend dari 'cash' menjadi 'on_the_spot'
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'on_the_spot'>('transfer');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingPlans, setFetchingPlans] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Poin 2: Cek status pending untuk memblokir form
  const isPending = user?.membership?.status === 'pending';

  useEffect(() => {
    if (!isPending) {
      fetchPlans();
    }
  }, [isPending]);

  // Efek terpisah untuk men-set default paket jika data plans dan planId sudah siap (Poin 4)
  useEffect(() => {
    if (plans.length > 0) {
      if (planId) {
        const foundPlan = plans.find(p => p.id === Number(planId));
        if (foundPlan) setSelectedPlan(foundPlan);
      } else if (!selectedPlan) {
        setSelectedPlan(plans[0]);
      }
    }
  }, [plans, planId]);

  const fetchPlans = async () => {
    try {
      const res = await apiClient.get('/api/v1/membership-plans');
      const data = res.data.data || res.data;
      setPlans(data);
    } catch (err) {
      Alert.alert('Error', 'Gagal memuat data paket membership.');
    } finally {
      setFetchingPlans(false);
    }
  };

  const handlePickImage = async (useCamera: boolean = false) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Izin Ditolak', 'Akses dibutuhkan untuk mengambil atau memilih bukti pembayaran.');
      return;
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });

    if (!result.canceled && result.assets[0]?.uri) {
      try {
        const compressedUri = await compressPaymentReceipt(result.assets[0].uri);
        setReceiptUri(compressedUri);
        setErrors((prev) => ({ ...prev, receipt_image: '' }));
      } catch {
        Alert.alert('Error', 'Gagal memproses gambar bukti transfer.');
      }
    }
  };

  const handleSubmit = async () => {
    if (!selectedPlan) {
      Alert.alert('Peringatan', 'Silakan pilih paket terlebih dahulu.');
      return;
    }
    if (paymentMethod === 'transfer' && !receiptUri) {
      setErrors((prev) => ({ ...prev, receipt_image: 'Bukti transfer wajib diunggah.' }));
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const formData = new FormData();
      formData.append('membership_plan_id', String(selectedPlan.id));
      
      // Poin 3: Gunakan format tanggal YYYY-MM-DD secara lokal agar tidak bergeser zona waktu
      const localDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
      formData.append('start_date', localDateStr);
      
      formData.append('payment_method', paymentMethod);

      if (paymentMethod === 'transfer' && receiptUri) {
        const filename = receiptUri.split('/').pop() || 'receipt.jpg';
        formData.append('receipt_image', {
          uri: receiptUri,
          name: filename,
          type: 'image/jpeg',
        } as any);
      }

      await apiClient.post('/api/v1/member/memberships', formData);
      if (refreshUser) await refreshUser();
      
      Alert.alert('Sukses', 'Pengajuan membership berhasil dikirim.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
    } catch (err: any) {
      // Poin 5: Tampilkan error dari backend termasuk membership dan membership_plan_id
      if (err.response?.status === 422 && err.response?.data?.errors) {
        const apiErrors: Record<string, string> = {};
        const errorMessages: string[] = [];
        
        Object.keys(err.response.data.errors).forEach((key) => {
          const errMsg = err.response.data.errors[key][0];
          apiErrors[key] = errMsg;
          errorMessages.push(`${key}: ${errMsg}`);
        });
        
        setErrors(apiErrors);
        
        // Memunculkan alert dengan pesan yang jelas (jika bukan error field biasa)
        if (apiErrors.membership || apiErrors.membership_plan_id) {
            Alert.alert('Validasi Gagal', errorMessages.join('\n'));
        }
      } else {
        Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan saat mengajukan.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Poin 2: Menutupi form jika statusnya pending (B2)
  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-950 p-6">
        <Ionicons name="time-outline" size={64} color="#f59e0b" />
        <Text className="mt-4 text-center text-xl font-bold text-white">Menunggu Verifikasi</Text>
        <Text className="mt-2 text-center text-zinc-400">
          Pengajuan perpanjangan membership kamu sedang diproses oleh admin. Silakan cek secara berkala.
        </Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-6 rounded-xl bg-zinc-800 px-6 py-3">
          <Text className="font-semibold text-white">Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-zinc-950 p-4">
      <Text className="mb-4 text-2xl font-bold text-white">
        {user?.membership ? 'Perpanjang Membership' : 'Pendaftaran Membership'}
      </Text>

      {/* Ringkasan Profil Pemohon */}
      <View className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <Text className="text-xs text-zinc-400">Data Pemohon</Text>
        <Text className="text-base font-semibold text-white">{user?.name}</Text>
        <Text className="text-sm text-zinc-300">{user?.email} • {user?.phone || '-'}</Text>
      </View>

      {/* 1. Pilih Paket */}
      <Text className="mb-2 text-base font-semibold text-white">1. Pilih Paket</Text>
      {fetchingPlans ? (
        <ActivityIndicator color="#f59e0b" className="my-4" />
      ) : (
        plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            onPress={() => setSelectedPlan(plan)}
            className={`mb-3 rounded-xl border p-4 ${
              selectedPlan?.id === plan.id ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            <View className="flex-row justify-between">
              <Text className="font-bold text-white">{plan.name}</Text>
              <Text className="font-bold text-amber-500">Rp {plan.price.toLocaleString('id-ID')}</Text>
            </View>
            <Text className="mt-1 text-xs text-zinc-400">{plan.duration_days} Hari</Text>
          </TouchableOpacity>
        ))
      )}
      {errors.membership_plan_id && <Text className="mb-2 text-xs text-red-500">{errors.membership_plan_id}</Text>}

      {/* 2. Tanggal Mulai */}
      <Text className="mb-2 mt-4 text-base font-semibold text-white">2. Tanggal Mulai</Text>
      <TouchableOpacity
        onPress={() => setShowDatePicker(true)}
        className="mb-2 flex-row items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4"
      >
        <Text className="text-white">
          {startDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
        <Ionicons name="calendar-outline" size={20} color="#f59e0b" />
      </TouchableOpacity>
      <Text className="text-xs text-zinc-500 mb-2">
        {user?.membership?.end_date ? 'Default: Melanjutkan dari masa aktif sebelumnya' : 'Default: Hari ini'}
      </Text>
      {showDatePicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          minimumDate={getMinDate()}
          onChange={(_, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (date) setStartDate(date);
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
            onPress={() => setPaymentMethod(method)}
            className={`flex-1 items-center rounded-xl border p-3 ${
              paymentMethod === method ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            <Text className="capitalize font-semibold text-white">
              {method === 'transfer' ? 'Transfer Bank' : 'Bayar di Tempat'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {errors.payment_method && <Text className="mb-2 text-xs text-red-500">{errors.payment_method}</Text>}

      {/* 4. Upload Bukti Transfer */}
      {paymentMethod === 'transfer' && (
        <View className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <Text className="text-xs text-zinc-400">Instruksi Transfer</Text>
          <Text className="mt-1 font-bold text-amber-500">
            {PAYMENT_INSTRUCTIONS.bankName} {PAYMENT_INSTRUCTIONS.accountNumber}
          </Text>
          <Text className="text-sm font-semibold text-white">a.n. {PAYMENT_INSTRUCTIONS.accountName}</Text>
          <Text className="mt-2 text-xs text-zinc-400">{PAYMENT_INSTRUCTIONS.instruction}</Text>

          <Text className="mb-2 mt-4 text-sm font-semibold text-white">Upload Bukti Transfer</Text>
          {receiptUri ? (
            <View className="items-center">
              <Image source={{ uri: receiptUri }} className="h-48 w-full rounded-lg" resizeMode="cover" />
              <TouchableOpacity onPress={() => setReceiptUri(null)} className="mt-2 rounded-lg bg-red-600/20 px-4 py-2">
                <Text className="text-xs font-semibold text-red-400">Hapus Foto</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => handlePickImage(false)}
                className="flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 p-4"
              >
                <Ionicons name="images-outline" size={24} color="#f59e0b" />
                <Text className="mt-1 text-xs text-zinc-300">Galeri</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handlePickImage(true)}
                className="flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-800/50 p-4"
              >
                <Ionicons name="camera-outline" size={24} color="#f59e0b" />
                <Text className="mt-1 text-xs text-zinc-300">Kamera</Text>
              </TouchableOpacity>
            </View>
          )}
          {errors.receipt_image && <Text className="mt-1 text-xs text-red-500">{errors.receipt_image}</Text>}
        </View>
      )}

      {/* Tombol Submit */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={loading}
        className="mb-10 items-center justify-center rounded-xl bg-amber-500 py-4 active:bg-amber-600 disabled:opacity-50"
      >
        {loading ? <ActivityIndicator color="#000" /> : <Text className="font-bold text-black">Kirim Pengajuan</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}