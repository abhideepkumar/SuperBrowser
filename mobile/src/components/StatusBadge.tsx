// src/components/StatusBadge.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../theme/colors";
import type { RunStatus } from "../types";

const CONFIG: Record<RunStatus, { color: string; bg: string; label: string }> = {
  idle:       { color: Colors.textMuted,     bg: "rgba(74,85,104,0.2)",   label: "Idle" },
  running:    { color: Colors.cyan,           bg: Colors.cyanGlow,         label: "Running" },
  paused:     { color: Colors.amber,          bg: "rgba(246,173,85,0.15)", label: "Paused" },
  done:       { color: Colors.green,          bg: Colors.greenGlow,        label: "Done ✓" },
  error:      { color: Colors.red,            bg: Colors.redGlow,          label: "Failed" },
  aborted:    { color: Colors.textSecondary,  bg: "rgba(160,174,192,0.1)", label: "Stopped" },
  max_steps:  { color: Colors.amber,          bg: "rgba(246,173,85,0.15)", label: "Max Steps" },
};

export function StatusBadge({ status }: { status: RunStatus }) {
  const { color, bg, label } = CONFIG[status];
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor: color + "44" }]}>
      {status === "running" && <View style={[styles.dot, { backgroundColor: color }]} />}
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
