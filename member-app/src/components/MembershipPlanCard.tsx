import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MembershipPlan } from '@/lib/membership';
import { formatRupiah } from '@/utils/formatCurrency';

export function MembershipPlanCard({ plan, selected = false, disabled = false, label, onPress }: {
  plan: MembershipPlan; selected?: boolean; disabled?: boolean; label: string; onPress: () => void;
}) {
  return (
    <View className={`mb-4 rounded-2xl border p-5 ${selected ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
      <View className="flex-row justify-between items-center">
        <Text className="text-white text-lg font-bold flex-1 pr-3">{plan.name}</Text>
        <Text className="text-amber-400 text-xs font-semibold">{plan.duration_days} Hari</Text>
      </View>
      <Text className="text-amber-400 text-2xl font-extrabold mt-3 mb-5">{formatRupiah(plan.price)}</Text>
      <TouchableOpacity disabled={disabled} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${label} ${plan.name}, ${formatRupiah(plan.price)}`} onPress={onPress} className="bg-amber-500 min-h-[52px] rounded-xl items-center justify-center">
        <Text className="text-zinc-950 font-bold text-base">{label}</Text>
      </TouchableOpacity>
    </View>
  );
}
