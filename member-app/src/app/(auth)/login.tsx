import React, { useState, useRef } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  TextInput,
} from "react-native";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { Ionicons } from "@expo/vector-icons";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const passwordInputRef = useRef<TextInput>(null);

  const validate = (): boolean => {
    let isValid = true;
    setEmailError("");
    setPasswordError("");
    setApiError(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setEmailError("Email wajib diisi");
      isValid = false;
    } else if (!emailRegex.test(email.trim())) {
      setEmailError("Format email tidak valid");
      isValid = false;
    }

    if (!password) {
      setPasswordError("Password wajib diisi");
      isValid = false;
    }

    return isValid;
  };

  const onSubmit = async () => {
    if (!validate() || isLoading) return;

    setIsLoading(true);
    setApiError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      if (email.trim().toLowerCase() === "member@revira.com" && password === "password123") {
        setApiError(null);
      } else {
        setApiError("Email atau password salah.");
      }
    } catch {
      setApiError("Terjadi kesalahan koneksi. Periksa internet Anda.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      className="flex-1 bg-zinc-950 w-full"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingBottom: 140, // Memberi ruang ekstra tinggi agar tombol Masuk terangkat bebas di atas keyboard
          paddingTop: 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        horizontal={false}
        bounces={false}
        className="w-full px-6"
      >
        {/* Branding Revira Gym */}
        <View className="items-center mb-8">
          <View className="w-16 h-16 bg-amber-400/10 rounded-2xl items-center justify-center border border-amber-400/20 mb-3">
            <Ionicons name="barbell" size={32} color="#fbbf24" />
          </View>
          <Text className="text-3xl font-extrabold text-amber-400 tracking-wider">
            REVIRA GYM
          </Text>
          <Text className="text-sm text-zinc-400 mt-1 font-medium text-center">
            Sistem Informasi & Manajemen Member
          </Text>
        </View>

        {/* Banner Error API */}
        {apiError && (
          <View className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 mb-5 flex-row items-center">
            <Ionicons name="alert-circle-outline" size={20} color="#f87171" />
            <Text className="text-red-400 text-sm ml-2.5 flex-1 font-medium">
              {apiError}
            </Text>
          </View>
        )}

        {/* Formulir Login */}
        <View className="w-full">
          <TextField
            label="Email Member"
            placeholder="nama@email.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (emailError) setEmailError("");
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
            error={emailError}
            editable={!isLoading}
          />

          <TextField
            ref={passwordInputRef}
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (passwordError) setPasswordError("");
            }}
            isPassword
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            error={passwordError}
            editable={!isLoading}
          />

          <View className="mt-4">
            <Button
              title="Masuk"
              onPress={onSubmit}
              loading={isLoading}
            />
          </View>
        </View>

        {/* Footer Info */}
        <View className="mt-10 items-center">
          <Text className="text-zinc-500 text-xs">
            Revira Gym BJM • v1.0.0 (Expo SDK 57)
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}