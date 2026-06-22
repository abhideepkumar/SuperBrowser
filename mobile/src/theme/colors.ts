// src/theme/colors.ts — Design tokens

export const Colors = {
  // Backgrounds
  bg: "#F8FAFC",
  bgCard: "#FFFFFF",
  bgGlass: "rgba(255,255,255,0.85)",
  bgGlassStrong: "rgba(255,255,255,0.95)",

  // Borders
  border: "#E2E8F0",
  borderGlow: "rgba(59, 130, 246, 0.12)",

  // Neon accents -> Refined solid accents
  cyan: "#3B82F6",
  cyanGlow: "rgba(59, 130, 246, 0.08)",
  purple: "#6366F1",
  purpleGlow: "rgba(99, 102, 241, 0.08)",
  green: "#10B981",
  greenGlow: "rgba(16, 185, 129, 0.08)",
  red: "#EF4444",
  redGlow: "rgba(239, 68, 68, 0.08)",
  amber: "#F59E0B",

  // Text
  textPrimary: "#0F172A",
  textSecondary: "#334155",
  textMuted: "#64748B",
  textCyan: "#2563EB",
  textPurple: "#4F46E5",

  // Gradient stops
  gradientStart: "#F8FAFC",
  gradientMid: "#F1F5F9",
  gradientEnd: "#E2E8F0",
} as const;

// expo-linear-gradient v13+ requires readonly tuples, not plain string[].
export const Gradients = {
  background: [Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd] as const,
  cyan: ["rgba(59, 130, 246, 0.06)", "rgba(59, 130, 246, 0)"] as const,
  purple: ["rgba(99, 102, 241, 0.06)", "rgba(99, 102, 241, 0)"] as const,
  runButton: ["#0F172A", "#1E293B"] as const, // Premium dark charcoal solid look
  success: ["#10B981", "#059669"] as const,
  error: ["#EF4444", "#DC2626"] as const,
} as const;
