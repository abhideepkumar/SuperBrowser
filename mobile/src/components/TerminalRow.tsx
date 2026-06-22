// src/components/TerminalRow.tsx — One step in the reasoning timeline
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Colors } from "../theme/colors";

interface Action {
  type: string;
  ref?: string;
  value?: string;
  success?: boolean;
}

interface Props {
  step: number;
  reasoning?: string;
  actions?: Array<{ type: string; ref?: string; value?: string }>;
  actionLog?: Action[];
  provider?: string;
  latencyMs?: number;
  tokensUsed?: { prompt?: number; completion?: number; total?: number };
}

const ACTION_ICONS: Record<string, string> = {
  click: "🖱️", fill: "⌨️", navigate: "🌐", scroll: "📜", select: "📋",
};

export function TerminalRow({ step, reasoning, actions, actionLog, provider, latencyMs, tokensUsed }: Props) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={styles.container}>
      {/* Step header */}
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(!expanded)}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepNum}>{step}</Text>
        </View>
        <Text style={styles.reasoning} numberOfLines={expanded ? undefined : 2}>{reasoning ?? "Thinking..."}</Text>
        <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {/* Meta row */}
          {provider && (
            <View style={styles.metaRow}>
              <Text style={styles.meta}>🔌 {provider}</Text>
              {latencyMs !== undefined && <Text style={styles.meta}>⏱ {latencyMs}ms</Text>}
              {tokensUsed?.total && <Text style={styles.meta}>🪙 {tokensUsed.total} tok</Text>}
            </View>
          )}

          {/* Planned actions */}
          {actions && actions.length > 0 && (
            <View style={styles.section}>
              {actions.map((a, i) => (
                <View key={i} style={styles.actionRow}>
                  <Text style={styles.actionIcon}>{ACTION_ICONS[a.type] ?? "⚙️"}</Text>
                  <Text style={styles.actionText}>
                    {a.type}({a.ref ?? ""}{a.value ? `, "${a.value.substring(0, 20)}"` : ""})
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Executed action results */}
          {actionLog && actionLog.length > 0 && (
            <View style={styles.section}>
              {actionLog.map((a, i) => (
                <View key={i} style={styles.actionRow}>
                  <Text style={a.success ? styles.successIcon : styles.failIcon}>{a.success ? "✅" : "❌"}</Text>
                  <Text style={styles.actionText}>
                    {a.type}({a.ref ?? ""}{a.value ? `, "${a.value.substring(0, 20)}"` : ""})
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
      <View style={styles.connector} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 2 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
    // Soft shadow for log headers
    shadowColor: "#0F172A",
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  stepBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#EFF6FF",
    borderWidth: 1, borderColor: "#BFDBFE",
    alignItems: "center", justifyContent: "center",
  },
  stepNum: { color: "#1E40AF", fontSize: 11, fontWeight: "700" },
  reasoning: { flex: 1, color: Colors.textPrimary, fontSize: 13, lineHeight: 18 },
  chevron: { color: Colors.textMuted, fontSize: 10, marginTop: 4 },
  body: {
    marginTop: 4, marginLeft: 34,
    backgroundColor: "#F8FAFC",
    borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  metaRow: { flexDirection: "row", gap: 12, marginBottom: 8 },
  meta: { color: Colors.textMuted, fontSize: 11 },
  section: { gap: 6 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionIcon: { fontSize: 13 },
  actionText: {
    color: "#0F172A",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  successIcon: { fontSize: 13 },
  failIcon: { fontSize: 13 },
  connector: { width: 2, height: 8, backgroundColor: "#E2E8F0", marginLeft: 23 },
});
