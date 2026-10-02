import React, { forwardRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  isPassword?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(
  ({ label, error, isPassword = false, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <View className="w-full mb-4">
        <Text className="text-zinc-300 text-sm font-semibold mb-1.5">
          {label}
        </Text>

        <View
          className={`w-full flex-row items-center bg-zinc-900 border rounded-xl px-4 py-3.5 ${
            error ? "border-red-500" : "border-zinc-800 focus:border-amber-400"
          }`}
        >
          <TextInput
            ref={ref}
            className="flex-1 text-white text-base p-0"
            placeholderTextColor="#71717a"
            secureTextEntry={isPassword && !showPassword}
            {...props}
          />

          {isPassword && (
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="ml-2"
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color="#a1a1aa"
              />
            </TouchableOpacity>
          )}
        </View>

        {error ? (
          <Text className="text-red-400 text-xs mt-1 font-medium">{error}</Text>
        ) : null}
      </View>
    );
  }
);

TextField.displayName = "TextField";