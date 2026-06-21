// screens/HistoryScreen.tsx
import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet,
  TouchableOpacity, RefreshControl, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Trash2, Clock, Hash } from "lucide-react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

import { GlassCard } from "../components/GlassCard";
import { StatusBadge } from "../components/StatusBadge";
import { Colors, Gradients } from "../theme/colors";
import { fetchRuns, deleteRun, type RunSummary } from "../services/api";
import type { RunStatus } from "../types";

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(start: number, end?: number): string {
  if (!end) return "—";
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const data = await fetchRuns();
      setRuns(data);
    } catch (e: any) {
      // silently fail — server may not be connected
    }
  }, []);

  // Reload every time this screen comes into focus
  useFocusEffect(useCallback(() => { loadRuns(); }, [loadRuns]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRuns();
    setRefreshing(false);
  };

  const handleDelete = (run: RunSummary) => {
    Alert.alert("Delete Run?", `"${run.goal.substring(0, 60)}..."`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await deleteRun(run.id);
            setRuns((prev) => prev.filter((r) => r.id !== run.id));
          } catch {
            Alert.alert("Error", "Could not delete run.");
          }
        },
      },
    ]);
  };

  const renderRun = ({ item }: { item: RunSummary }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate("HistoryDetail", { runId: item.id })}
      activeOpacity={0.8}
    >
      <GlassCard style={styles.card}>
        <View style={styles.cardHeader}>
          <StatusBadge status={item.status as RunStatus} />
          <Text style={styles.dateText}>{formatDate(item.startedAt)}</Text>
          <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={12}>
            <Trash2 size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.goalText} numberOfLines={2}>{item.goal}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Hash size={11} color={Colors.textMuted} />
            <Text style={styles.metaText}>{item.totalSteps} steps</Text>
          </View>
          <View style={styles.metaItem}>
            <Clock size={11} color={Colors.textMuted} />
            <Text style={styles.metaText}>{formatDuration(item.startedAt, item.finishedAt)}</Text>
          </View>
        </View>

        {item.result && (
          <View style={styles.resultPreview}>
            <Text style={styles.resultText} numberOfLines={2}>{item.result}</Text>
          </View>
        )}
      </GlassCard>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={Gradients.background} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Run History</Text>
        <Text style={styles.subtitle}>{runs.length} run{runs.length !== 1 ? "s" : ""}</Text>
      </View>

      <FlatList
        data={runs}
        keyExtractor={(item) => item.id}
        renderItem={renderRun}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 20 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.cyan} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyText}>No runs yet</Text>
            <Text style={styles.emptySubtext}>Completed runs will appear here</Text>
          </View>
        }
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: "800" },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  card: { marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  dateText: { flex: 1, color: Colors.textMuted, fontSize: 11 },
  goalText: { color: Colors.textPrimary, fontSize: 14, fontWeight: "500", lineHeight: 20, marginBottom: 10 },
  metaRow: { flexDirection: "row", gap: 16 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: Colors.textMuted, fontSize: 11 },
  resultPreview: {
    marginTop: 10, padding: 10,
    backgroundColor: Colors.greenGlow,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.green + "33",
  },
  resultText: { color: Colors.green, fontSize: 12, lineHeight: 18 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 100, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { color: Colors.textSecondary, fontSize: 17, fontWeight: "600" },
  emptySubtext: { color: Colors.textMuted, fontSize: 13 },
});
