import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  TouchableOpacityProps,
} from "react-native";

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  loading = false,
  disabled,
  onPress,
  ...props
}) => {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={isDisabled}
      className={`w-full py-4 rounded-xl items-center justify-center flex-row shadow-sm ${
        isDisabled ? "bg-amber-500/50" : "bg-amber-400 active:bg-amber-500"
      }`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color="#09090b" size="small" />
      ) : (
        <Text className="text-zinc-950 font-bold text-base">{title}</Text>
      )}
    </TouchableOpacity>
  );
};