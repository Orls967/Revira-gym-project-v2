import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api from '../../lib/api';
import { MOCK_HOURS, OperationalHour } from '../../mocks/homeData';
import { ChatAdminButton } from '../../components/ChatAdminButton';
import { MembershipPlanCard } from '../../components/MembershipPlanCard';
import { useAuth } from '../../context/AuthContext';
import { MembershipPlan, parseMembershipPlans, getMembershipAction, hasPendingApplication, MEMBERSHIP_ACTION_LABEL } from '../../lib/membership';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profileStatus, refreshUser } = useAuth();
  const pending = profileStatus === 'loaded' && hasPendingApplication(user);
  const action = getMembershipAction(user?.membership);

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [hours, setHours] = useState<OperationalHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (isSilent = false) => {
    try {
      if (!isSilent) setError(null);

      let fetchedPlans: MembershipPlan[] = [];
      let fetchedHours = MOCK_HOURS;

      try {
        const plansRes = await api.get('/api/v1/membership-plans');
        if (plansRes.data?.data) {
          fetchedPlans = parseMembershipPlans(plansRes.data.data);
        }
      } catch {
        if (!isSilent) {
          setError('Gagal memuat paket membership. Silakan coba lagi.');
        }
      }

      try {
        const hoursRes = await api.get('/operational-hours');
        if (hoursRes.data?.data) {
          fetchedHours = hoursRes.data.data;
        }
      } catch {
        if (!isSilent) {
          console.log('Endpoint operational-hours belum siap, menggunakan Mock Data');
        }
      }

      setPlans(fetchedPlans);
      setHours(fetchedHours);
    } catch {
      if (!isSilent) setError('Gagal memuat data Beranda.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    const intervalId = setInterval(() => {
      loadData(true);
    }, 15000);

    return () => clearInterval(intervalId);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, []);

  // PERBAIKAN POIN 4: Mengirimkan ID paket melalui parameter URL
  const handleSelectPlan = (plan: MembershipPlan) => {
    if (pending) return;
    if (profileStatus !== 'loaded') {
      if (profileStatus === 'error') void refreshUser();
      return;
    }
    router.push({ pathname: '/membership/apply', params: { planId: plan.id } } as any);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-zinc-950 justify-center items-center">
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text className="text-zinc-400 mt-4 text-base font-medium">Memuat data Beranda...</Text>
      </View>
    );
  }

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
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 20,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#f59e0b"
          colors={['#f59e0b']}
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
          <View className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 items-center">
            <Text className="text-zinc-400 text-base text-center">
              Belum ada paket keanggotaan aktif saat ini.
            </Text>
          </View>
        ) : (
          plans.map((plan) => (
            <MembershipPlanCard key={plan.id} plan={plan} disabled={pending || profileStatus === 'loading' || profileStatus === 'idle'} label={profileStatus === 'loaded' ? (pending ? 'Menunggu Verifikasi' : MEMBERSHIP_ACTION_LABEL[action]) : profileStatus === 'error' ? 'Periksa Profil' : 'Memuat Profil'} onPress={() => handleSelectPlan(plan)} />
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

      {/* Tombol Chat Admin */}
      <View className="mt-8">
        <ChatAdminButton context="home" />
      </View>
    </ScrollView>
  );
}