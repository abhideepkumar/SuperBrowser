// src/theme/colors.ts — Design tokens

export const Colors = {
  // Backgrounds
  bg: "#070B14",
  bgCard: "rgba(255,255,255,0.04)",
  bgGlass: "rgba(255,255,255,0.07)",
  bgGlassStrong: "rgba(255,255,255,0.12)",

  // Borders
  border: "rgba(255,255,255,0.10)",
  borderGlow: "rgba(99,179,237,0.35)",

  // Neon accents
  cyan: "#63B3ED",
  cyanGlow: "rgba(99,179,237,0.20)",
  purple: "#B794F4",
  purpleGlow: "rgba(183,148,244,0.20)",
  green: "#68D391",
  greenGlow: "rgba(104,211,145,0.20)",
  red: "#FC8181",
  redGlow: "rgba(252,129,129,0.20)",
  amber: "#F6AD55",

  // Text
  textPrimary: "#F7FAFC",
  textSecondary: "#A0AEC0",
  textMuted: "#4A5568",
  textCyan: "#63B3ED",
  textPurple: "#B794F4",

  // Gradient stops
  gradientStart: "#070B14",
  gradientMid: "#0D1526",
  gradientEnd: "#111827",
} as const;

// expo-linear-gradient v13+ requires readonly tuples, not plain string[].
// Using 'as const' at the tuple level satisfies readonly [ColorValue, ColorValue, ...ColorValue[]].
export const Gradients = {
  background: [Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const,
  cyan: ["rgba(99,179,237,0.15)", "rgba(99,179,237,0)"] as const,
  purple: ["rgba(183,148,244,0.15)", "rgba(183,148,244,0)"] as const,
  runButton: ["#2B6CB0", "#553C9A"] as const,
  success: ["#276749", "#2F855A"] as const,
  error: ["#742A2A", "#9B2C2C"] as const,
} as const;
