// screens/HistoryDetailScreen.tsx
// Full step-by-step replay of a past run.
import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Share, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { Share2, Copy } from "lucide-react-native";

import { GlassCard } from "../components/GlassCard";
import { StatusBadge } from "../components/StatusBadge";
import { TerminalRow } from "../components/TerminalRow";
import { Colors, Gradients } from "../theme/colors";
import { fetchRun, type RunSummary } from "../services/api";
import type { AgentEvent, RunStatus } from "../types";

type RouteParams = { runId: string };

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function HistoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<Record<string, RouteParams>, string>>();
  const { runId } = route.params;

  const [run, setRun] = useState<(RunSummary & { events: AgentEvent[] }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRun(runId).then((data) => {
      setRun(data as any);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [runId]);

  const handleCopyResult = () => {
    if (run?.result) {
      // Clipboard needs @react-native-clipboard/clipboard — use Share as fallback
      Share.share({ message: run.result });
    }
  };

  const handleShare = () => {
    if (!run) return;
    Share.share({
      message: `SuperBrowser Run Result\n\nGoal: ${run.goal}\n\nResult: ${run.result ?? "No result"}`,
    });
  };

  if (loading) {
    return (
      <LinearGradient colors={Gradients.background} style={styles.center}>
        <ActivityIndicator size="large" color={Colors.cyan} />
      </LinearGradient>
    );
  }

  if (!run) {
    return (
      <LinearGradient colors={Gradients.background} style={styles.center}>
        <Text style={styles.errorText}>Run not found</Text>
      </LinearGradient>
    );
  }

  // Build step summaries from events
  const stepMap: Record<number, { reasoning?: string; actions?: any[]; actionLog: any[]; screenshotBase64?: string; provider?: string; latencyMs?: number; tokensUsed?: any }> = {};

  for (const evt of run.events) {
    const step = evt.step;
    if (!step) continue;
    if (!stepMap[step]) stepMap[step] = { actionLog: [] };

    if (evt.type === "llm_planned") {
      stepMap[step].reasoning = evt.reasoning;
      stepMap[step].actions = evt.actions;
      stepMap[step].provider = evt.provider;
      stepMap[step].latencyMs = evt.latencyMs;
      stepMap[step].tokensUsed = evt.tokensUsed;
    }
    if (evt.type === "action_done") {
      stepMap[step].actionLog.push({
        type: evt.actionType ?? "",
        ref: evt.actionRef,
        value: evt.actionValue,
        success: evt.actionSuccess,
      });
    }
  }

  const stepNumbers = Object.keys(stepMap).map(Number).sort((a, b) => b - a);
  const totalTokens = Object.values(stepMap).reduce(
    (acc, s) => acc + (s.tokensUsed?.total ?? 0), 0
  );

  return (
    <LinearGradient colors={Gradients.background} style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }]}>

        {/* ── Run summary card ── */}
        <GlassCard style={styles.summaryCard} glowColor={run.status === "done" ? Colors.green : Colors.red}>
          <View style={styles.summaryHeader}>
            <StatusBadge status={run.status as RunStatus} />
            <TouchableOpacity onPress={handleShare}>
              <Share2 size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.goalText}>{run.goal}</Text>
          <Text style={styles.dateText}>{formatDate(run.startedAt)}</Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{run.totalSteps}</Text>
              <Text style={styles.statLabel}>Steps</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>{totalTokens.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Tokens</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>
                {run.finishedAt ? `${Math.round((run.finishedAt - run.startedAt) / 1000)}s` : "—"}
              </Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
          </View>
        </GlassCard>

        {/* ── Result card ── */}
        {run.result && (
          <GlassCard style={styles.resultCard} glowColor={Colors.green}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>✅ Result</Text>
              <TouchableOpacity onPress={handleCopyResult} style={styles.copyBtn}>
                <Copy size={14} color={Colors.cyan} />
                <Text style={styles.copyLabel}>Share</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.resultText}>{run.result}</Text>
          </GlassCard>
        )}

        {run.error && (
          <GlassCard style={styles.errorCard} glowColor={Colors.red}>
            <Text style={styles.errorTitle}>❌ Error</Text>
            <Text style={styles.errorDetail}>{run.error}</Text>
          </GlassCard>
        )}

        {/* ── Step replay ── */}
        {stepNumbers.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Step Replay (newest first)</Text>
            {stepNumbers.map((step) => (
              <TerminalRow
                key={step}
                step={step}
                reasoning={stepMap[step].reasoning}
                actions={stepMap[step].actions}
                actionLog={stepMap[step].actionLog}
                provider={stepMap[step].provider}
                latencyMs={stepMap[step].latencyMs}
                tokensUsed={stepMap[step].tokensUsed}
              />
            ))}
          </>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16 },
  summaryCard: { marginBottom: 16 },
  summaryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  goalText: { color: Colors.textPrimary, fontSize: 15, fontWeight: "700", lineHeight: 22, marginBottom: 6 },
  dateText: { color: Colors.textMuted, fontSize: 11, marginBottom: 16, fontWeight: "500" },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  stat: { alignItems: "center", gap: 2 },
  statVal: { color: Colors.textPrimary, fontSize: 20, fontWeight: "800" },
  statLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: "600" },
  statDivider: { width: 1, height: 30, backgroundColor: Colors.border },
  resultCard: { marginBottom: 16 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  resultTitle: { color: "#059669", fontSize: 14, fontWeight: "700" },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  copyLabel: { color: Colors.textCyan, fontSize: 12, fontWeight: "600" },
  resultText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  errorCard: { marginBottom: 16 },
  errorTitle: { color: Colors.red, fontSize: 14, fontWeight: "700", marginBottom: 8 },
  errorDetail: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  sectionLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, marginTop: 8 },
  errorText: { color: Colors.red, fontSize: 16 },
});
