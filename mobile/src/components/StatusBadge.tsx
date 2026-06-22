// src/components/StatusBadge.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../theme/colors";
import type { RunStatus } from "../types";

const CONFIG: Record<RunStatus, { color: string; bg: string; label: string }> = {
  idle:             { color: "#64748B", bg: "#F1F5F9", label: "Idle" },
  running:          { color: "#2563EB", bg: "#DBEAFE", label: "Running" },
  paused:           { color: "#D97706", bg: "#FEF3C7", label: "Paused" },
  waiting_for_user: { color: "#4F46E5", bg: "#E0E7FF", label: "Waiting for You" },
  done:             { color: "#059669", bg: "#D1FAE5", label: "Done ✓" },
  error:            { color: "#DC2626", bg: "#FEE2E2", label: "Failed" },
  aborted:          { color: "#475569", bg: "#E2E8F0", label: "Stopped" },
  max_steps:        { color: "#D97706", bg: "#FEF3C7", label: "Max Steps" },
};

export function StatusBadge({ status }: { status: RunStatus }) {
  const { color, bg, label } = CONFIG[status];
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: color + "22" }]}>
      {(status === "running" || status === "waiting_for_user") && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
