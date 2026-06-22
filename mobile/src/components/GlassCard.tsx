// src/components/GlassCard.tsx
// Glassmorphic card using expo-blur.
//
// Design decisions:
// - style prop applies to the OUTER wrapper (borders, margin, shadow)
// - innerStyle prop applies to the INNER content container (padding override)
// - BlurView must have flex:1 or a fixed height to render on Android
// - On Android, BlurView renders as a plain semi-transparent view (platform limitation)

import React from "react";
import {
  View, StyleSheet, Platform,
  type ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { Colors } from "../theme/colors";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  innerStyle?: ViewStyle;
  intensity?: number;
  glowColor?: string;
}

export function GlassCard({
  children,
  style,
  innerStyle,
  intensity = 10,
  glowColor,
}: Props) {
  const glowShadow: ViewStyle = {
    shadowColor: glowColor ?? "#0F172A",
    shadowOpacity: glowColor ? 0.08 : 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  };

  return (
    <View style={[styles.wrapper, glowShadow, style]}>
      <BlurView intensity={intensity} tint="light" style={styles.blur}>
        <View style={[styles.inner, innerStyle]}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    // Required on Android — BlurView needs a measurable container
    ...(Platform.OS === "android" ? { minHeight: 1 } : {}),
  },
  blur: {
    // flex:1 causes issues when parent has no fixed height.
    // Use undefined and let content drive height.
  },
  inner: {
    padding: 16,
  },
});
