import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api from '../../lib/api';
import { MOCK_PLANS, MOCK_HOURS, MembershipPlan, OperationalHour } from '../../mocks/homeData';
import { formatRupiah } from '../../utils/formatCurrency';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [hours, setHours] = useState<OperationalHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);

      let fetchedPlans = MOCK_PLANS;
      let fetchedHours = MOCK_HOURS;

      // 1. Coba panggil API /membership-plans (SCRUM-93)
      try {
        const plansRes = await api.get('/membership-plans');
        if (plansRes.data?.data) {
          fetchedPlans = plansRes.data.data;
        }
      } catch (err) {
        // Jika endpoint belum di-merge / 404, otomatis gunakan MOCK_PLANS
        console.log('Endpoint plans belum siap, menggunakan Mock Data');
      }

      // 2. Coba panggil API /operational-hours
      try {
        const hoursRes = await api.get('/operational-hours');
        if (hoursRes.data?.data) {
          fetchedHours = hoursRes.data.data;
        }
      } catch (err) {
        // Fallback ke MOCK_HOURS
        console.log('Endpoint operational-hours belum siap, menggunakan Mock Data');
      }

      // Filter hanya paket yang aktif
      setPlans(fetchedPlans.filter((p) => p.is_active));
      setHours(fetchedHours);
    } catch (err) {
      setError('Gagal memuat data Beranda.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  // Handler Tombol Pilih Paket (Placeholder sampai SCRUM-74 Sprint 3)
  const handleSelectPlan = (plan: MembershipPlan) => {
    Alert.alert(
      'Pilih Paket',
      `Anda memilih paket ${plan.name}. Alur pendaftaran akan tersedia di SCRUM-74 (Sprint 3).`,
      [{ text: 'OK' }]
    );
  };

  // State Loading (Skeleton Placeholder)
  if (loading) {
    return (
      <View className="flex-1 bg-zinc-950 justify-center items-center">
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text className="text-zinc-400 mt-4 text-base font-medium">Memuat data Beranda...</Text>
      </View>
    );
  }

  // State Error dengan Tombol Coba Lagi
  if (error) {
    return (
      <View className="flex-1 bg-zinc-950 justify-center items-center px-8">
        <Text className="text-red-500 font-bold text-lg mb-5 text-center">{error}</Text>
        <TouchableOpacity
          onPress={() => {
            setLoading(true);
            loadData();
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Coba muat ulang data"
          className="bg-amber-500 px-8 min-h-[48px] justify-center rounded-xl"
        >
          <Text className="text-zinc-950 font-bold text-base">Coba Lagi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-zinc-950"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 20,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#f59e0b"
          progressViewOffset={insets.top}
        />
      }
    >
      {/* Header */}
      <View className="mb-8 flex-row justify-between items-center">
        <View>
          <Text className="text-zinc-400 text-base font-medium">Selamat Datang di</Text>
          <Text className="text-amber-400 text-3xl font-extrabold tracking-wide mt-0.5">
            REVIRA GYM
          </Text>
        </View>
      </View>

      {/* Kartu Paket Keanggotaan */}
      <View className="mb-10">
        <Text className="text-white text-xl font-bold mb-5">Pilihan Paket Member</Text>

        {plans.length === 0 ? (
          /* Tampilan Kosong (Empty State) */
          <View className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 items-center">
            <Text className="text-zinc-400 text-base text-center">
              Belum ada paket keanggotaan aktif saat ini.
            </Text>
          </View>
        ) : (
          plans.map((plan) => (
            <View
              key={plan.id}
              className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 mb-4"
            >
              <View className="flex-row justify-between items-center">
                <Text className="text-white text-lg font-bold flex-1 pr-3">{plan.name}</Text>
                <View className="bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20">
                  <Text className="text-amber-400 text-xs font-semibold">
                    {plan.duration_in_days} Hari
                  </Text>
                </View>
              </View>

              <Text className="text-amber-400 text-2xl font-extrabold mt-3 mb-5">
                {formatRupiah(plan.price)}
              </Text>

              {/* Tombol Ajakan Mendaftar (Point 4 Jira) */}
              <TouchableOpacity
                onPress={() => handleSelectPlan(plan)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Pilih paket ${plan.name}, ${formatRupiah(plan.price)}`}
                className="bg-amber-500 min-h-[52px] rounded-xl items-center justify-center"
              >
                <Text className="text-zinc-950 font-bold text-base">Pilih Paket</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Jam Operasional */}
      <View>
        <Text className="text-white text-xl font-bold mb-5">Jam Operasional</Text>
        <View className="bg-zinc-900 px-5 py-2 rounded-2xl border border-zinc-800">
          {hours.map((item, idx) => (
            <View
              key={idx}
              className={`flex-row justify-between items-center py-4 ${
                idx !== hours.length - 1 ? 'border-b border-zinc-800' : ''
              }`}
            >
              <Text className="text-zinc-300 text-base font-medium">{item.day}</Text>
              {item.is_closed ? (
                <Text className="text-red-400 text-base font-bold">Tutup / Libur</Text>
              ) : (
                <Text className="text-amber-400 text-base font-semibold">
                  {item.open_time} - {item.close_time}
                </Text>
              )}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}