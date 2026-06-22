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
    variant === "danger" ? ["#EF4444", "#DC2626"]
    : variant === "ghost" ? ["#F1F5F9", "#E2E8F0"]
    : ["#0F172A", "#1E293B"]; // Dark Charcoal Premium Primary Look

  const isGhost = variant === "ghost";

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
      style={[
        styles.wrapper,
        isGhost && styles.ghostBorder,
        disabled && styles.disabled,
        style
      ]}
    >
      <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradient}>
        {loading ? (
          <ActivityIndicator size="small" color={isGhost ? Colors.textSecondary : "#FFFFFF"} />
        ) : (
          <>
            {icon}
            <Text style={[
              styles.label,
              { color: isGhost ? Colors.textSecondary : "#FFFFFF" },
              icon ? { marginLeft: 6 } : undefined
            ]}>
              {label}
            </Text>
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
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  ghostBorder: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  label: {
    fontWeight: "600",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  disabled: { opacity: 0.4 },
});
