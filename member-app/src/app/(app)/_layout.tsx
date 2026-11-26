import { Tabs, Redirect } from 'expo-router';
import { ActivityIndicator, View, Platform } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons'; // Import ikon bawaan Expo

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const { isLoading, userToken } = useAuth();
  if (isLoading) return <View className="flex-1 items-center justify-center bg-zinc-950"><ActivityIndicator color="#f59e0b" /></View>;
  if (!userToken) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#18181b', // zinc-900
          borderTopColor: '#27272a', // zinc-800
          height: Platform.OS === 'ios' ? 60 + insets.bottom : 65 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#f59e0b', // amber-500
        tabBarInactiveTintColor: '#71717a', // zinc-500
      }}
    >
      <Tabs.Screen name="membership/apply" options={{ href: null }} />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Beranda',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size || 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedules"
        options={{
          title: 'Jadwal',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size || 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="preview-components"
        options={{
          title: 'Komponen',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube" size={size || 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}