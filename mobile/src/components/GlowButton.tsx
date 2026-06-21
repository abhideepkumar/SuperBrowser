// src/components/GlowButton.tsx
import React from "react";
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Colors } from "../theme/colors";

interface Props {
  label: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
}

export function GlowButton({ label, onPress, variant = "primary", loading, disabled, style, icon }: Props) {
  const gradientColors: [string, string] =
    variant === "danger" ? ["#742A2A", "#9B2C2C"]
    : variant === "ghost" ? ["rgba(255,255,255,0.05)", "rgba(255,255,255,0.08)"]
    : ["#2B6CB0", "#553C9A"];

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      disabled={disabled || loading}
      style={[styles.wrapper, disabled && styles.disabled, style]}
    >
      <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradient}>
        {loading ? (
          <ActivityIndicator size="small" color={Colors.textPrimary} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, icon ? { marginLeft: 6 } : undefined]}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: Colors.cyan,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  label: {
    color: Colors.textPrimary,
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.5,
  },
  disabled: { opacity: 0.4 },
});
