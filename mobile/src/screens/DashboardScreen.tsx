// screens/DashboardScreen.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform, Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { Clock, ChevronRight, Wifi, WifiOff, Settings as SettingsIcon } from "lucide-react-native";

import { GlassCard } from "../components/GlassCard";
import { GlowButton } from "../components/GlowButton";
import { StatusBadge } from "../components/StatusBadge";
import { Colors, Gradients } from "../theme/colors";
import { useAgentStore } from "../store/useAgentStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { fetchHealth, fetchRuns, type RunSummary } from "../services/api";
import { startRun } from "../services/socket";

const PLAYBOOKS = [
  { label: "🔍 Scrape Prices", goal: "Go to https://books.toscrape.com and list the prices of the first 5 books" },
  { label: "📰 Check News",    goal: "Go to https://news.ycombinator.com and list the top 5 story titles" },
  { label: "🌍 Get IP Info",   goal: "Go to https://httpbin.org/ip and tell me the IP address" },
];

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const [goal, setGoal] = useState("");
  const [connected, setConnected] = useState(false);
  const [recentRuns, setRecentRuns] = useState<RunSummary[]>([]);
  const [serverInfo, setServerInfo] = useState<{ provider: string; model: string } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const status = useAgentStore((s) => s.status);
  const currentStep = useAgentStore((s) => s.currentStep);
  const agentGoal = useAgentStore((s) => s.goal);
  const startAgentRun = useAgentStore((s) => s.startRun);
  const { serverUrl } = useSettingsStore();

  // Pulse animation for the connection dot
  useEffect(() => {
    if (connected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [connected]);

  useEffect(() => {
    let mounted = true;
    async function ping() {
      try {
        const h = await fetchHealth();
        if (!mounted) return;
        setConnected(true);
        setServerInfo({ provider: h.provider, model: h.model });
        const runs = await fetchRuns();
        if (mounted) setRecentRuns(runs.slice(0, 3));
      } catch {
        if (mounted) setConnected(false);
      }
    }
    ping();
    const interval = setInterval(ping, 10000);
    return () => { mounted = false; clearInterval(interval); };
  // M3: serverUrl must be in deps — effect must restart when URL changes in Settings
  }, [serverUrl]);

  function handleRun() {
    if (!goal.trim() || !connected) return;
    startAgentRun(goal);
    startRun(goal);
    navigation.navigate("LiveView");
    setGoal("");
  }

  function handlePlaybook(g: string) {
    setGoal(g);
  }

  return (
    <LinearGradient colors={Gradients.background} style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Header ── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>SuperBrowser</Text>
              <Text style={styles.subtitle}>AI Browser Automation</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate("Settings")} style={styles.settingsBtn}>
              <SettingsIcon size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* ── Server Status ── */}
          <GlassCard style={styles.statusCard} glowColor={connected ? Colors.cyan : Colors.red}>
            <View style={styles.statusRow}>
              <View style={styles.statusLeft}>
                <Animated.View style={[styles.statusDot, { backgroundColor: connected ? Colors.green : Colors.red, transform: [{ scale: pulseAnim }] }]} />
                <View>
                  <Text style={styles.statusText}>{connected ? "Connected" : "Disconnected"}</Text>
                  <Text style={styles.statusSub}>{connected && serverInfo ? `${serverInfo.provider} · ${serverInfo.model}` : serverUrl}</Text>
                </View>
              </View>
              {connected ? <Wifi size={18} color={Colors.cyan} /> : <WifiOff size={18} color={Colors.red} />}
            </View>
          </GlassCard>

          {/* ── Active run strip ── */}
          {(status === "running" || status === "paused") && (
            <TouchableOpacity onPress={() => navigation.navigate("LiveView")}>
              <GlassCard style={styles.activeCard} glowColor={Colors.purple}>
                <View style={styles.activeRow}>
                  <StatusBadge status={status} />
                  <Text style={styles.activeGoal} numberOfLines={1}>{agentGoal}</Text>
                  <Text style={styles.stepCount}>Step {currentStep}</Text>
                  <ChevronRight size={16} color={Colors.purple} />
                </View>
              </GlassCard>
            </TouchableOpacity>
          )}

          {/* ── Goal input ── */}
          <GlassCard style={styles.inputCard} glowColor={Colors.cyanGlow}>
            <Text style={styles.inputLabel}>What do you want to automate?</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Go to https://amazon.com and find the price of AirPods Pro..."
              placeholderTextColor={Colors.textMuted}
              value={goal}
              onChangeText={setGoal}
              multiline
              returnKeyType="done"
              onSubmitEditing={handleRun}
            />
            <GlowButton
              label={connected ? "▶  RUN" : "⚠  No Server"}
              onPress={handleRun}
              disabled={!goal.trim() || !connected || status === "running"}
              style={styles.runBtn}
            />
          </GlassCard>

          {/* ── Playbooks ── */}
          <Text style={styles.sectionLabel}>Quick Runs</Text>
          <View style={styles.playbooksRow}>
            {PLAYBOOKS.map((p) => (
              <TouchableOpacity key={p.label} style={styles.playbookChip} onPress={() => handlePlaybook(p.goal)}>
                <Text style={styles.playbookLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Recent runs ── */}
          {recentRuns.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Recent Runs</Text>
                <TouchableOpacity onPress={() => navigation.navigate("History")}>
                  <Text style={styles.seeAll}>See all →</Text>
                </TouchableOpacity>
              </View>
              {recentRuns.map((run) => (
                <TouchableOpacity key={run.id} onPress={() => navigation.navigate("HistoryDetail", { runId: run.id })}>
                  <GlassCard style={styles.runCard}>
                    <View style={styles.runRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.runGoal} numberOfLines={1}>{run.goal}</Text>
                        <View style={styles.runMeta}>
                          <Clock size={11} color={Colors.textMuted} />
                          <Text style={styles.runTime}>{new Date(run.startedAt).toLocaleDateString()}</Text>
                          <Text style={styles.runSteps}>{run.totalSteps} steps</Text>
                        </View>
                      </View>
                      <StatusBadge status={run.status as any} />
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              ))}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { color: Colors.textPrimary, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: Colors.textMuted, fontSize: 13, marginTop: 1 },
  settingsBtn: { padding: 8, backgroundColor: "#FFFFFF", borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  statusCard: { marginBottom: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: Colors.textPrimary, fontWeight: "600", fontSize: 14 },
  statusSub: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },
  activeCard: { marginBottom: 16, borderColor: Colors.purple + "33" },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  activeGoal: { flex: 1, color: Colors.textSecondary, fontSize: 13 },
  stepCount: { color: Colors.purple, fontSize: 12, fontWeight: "600" },
  inputCard: { marginBottom: 24 },
  inputLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600", marginBottom: 10 },
  textInput: {
    color: Colors.textPrimary, fontSize: 14, lineHeight: 22,
    minHeight: 90, maxHeight: 160,
    backgroundColor: "#F1F5F9", borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
    marginBottom: 12, textAlignVertical: "top",
  },
  runBtn: { marginTop: 4 },
  sectionLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  seeAll: { color: Colors.cyan, fontSize: 13, fontWeight: "600" },
  playbooksRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  playbookChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: Colors.border,
  },
  playbookLabel: { color: Colors.textSecondary, fontSize: 13, fontWeight: "500" },
  runCard: { marginBottom: 8 },
  runRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  runGoal: { color: Colors.textPrimary, fontSize: 13, fontWeight: "600", marginBottom: 4 },
  runMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  runTime: { color: Colors.textMuted, fontSize: 11 },
  runSteps: { color: Colors.textMuted, fontSize: 11 },
});
