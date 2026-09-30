import { View, Text } from "react-native";

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-zinc-900 px-6">
      <Text className="text-3xl font-extrabold text-amber-400">
        Revira Gym
      </Text>
      <Text className="mt-2 text-center text-sm font-medium text-zinc-300">
        Expo SDK 57 + NativeWind v4 Active
      </Text>
      <View className="mt-6 rounded-2xl bg-amber-500 px-6 py-3">
        <Text className="font-bold text-zinc-950">NativeWind Verified</Text>
      </View>
    </View>
  );
}