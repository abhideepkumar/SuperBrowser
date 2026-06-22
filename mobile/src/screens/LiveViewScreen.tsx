// screens/LiveViewScreen.tsx
// Real-time agent view with tappable screenshot, reasoning timeline,
// and Human-in-the-Loop interactive fallback controls.

import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, TextInput, Dimensions,
  KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import {
  Pause, Play, Square, Send, ChevronDown,
} from "lucide-react-native";

import { GlassCard } from "../components/GlassCard";
import { GlowButton } from "../components/GlowButton";
import { StatusBadge } from "../components/StatusBadge";
import { TerminalRow } from "../components/TerminalRow";
import { Colors, Gradients } from "../theme/colors";
import { useAgentStore } from "../store/useAgentStore";
import { pauseRun, resumeRun, stopRun, sendClick, sendType, sendUserResponse } from "../services/socket";

const { width: SCREEN_W } = Dimensions.get("window");
// The browser viewport the server uses (agent-browser default)
const BROWSER_W = 1280;
const BROWSER_H = 720;

export function LiveViewScreen() {
  const insets = useSafeAreaInsets();
  const timelineRef = useRef<ScrollView>(null);

  const status = useAgentStore((s) => s.status);
  const currentStep = useAgentStore((s) => s.currentStep);
  const maxSteps = useAgentStore((s) => s.maxSteps);
  const steps = useAgentStore((s) => s.steps);
  const screenshotBase64 = useAgentStore((s) => s.screenshotBase64);
  const interactiveScreenshot = useAgentStore((s) => s.interactiveScreenshot);
  const result = useAgentStore((s) => s.result);
  const error = useAgentStore((s) => s.error);
  const goal = useAgentStore((s) => s.goal);
  const pendingQuestion = useAgentStore((s) => s.pendingQuestion);
  const pendingOptions = useAgentStore((s) => s.pendingOptions);

  const [typeText, setTypeText] = useState("");
  const [answerText, setAnswerText] = useState("");

  // The screenshot shown: when paused use the interactive one, else the latest agent screenshot
  const displayedScreenshot = interactiveScreenshot ?? screenshotBase64;
  const imageUri = displayedScreenshot ? `data:image/png;base64,${displayedScreenshot}` : null;

  // Calculate the displayed image height maintaining 16:9 aspect ratio
  const imageW = SCREEN_W - 32; // card padding
  const imageH = Math.round(imageW * (BROWSER_H / BROWSER_W));

  // Handle tap on the screenshot — convert pixel tap to fractional coords
  const handleImageTap = useCallback((evt: any) => {
    if (status !== "paused") {
      Alert.alert("Agent Running", "Pause the agent first to take control.", [{ text: "OK" }]);
      return;
    }
    const { locationX, locationY } = evt.nativeEvent;
    const xFrac = Math.max(0, Math.min(1, locationX / imageW));
    const yFrac = Math.max(0, Math.min(1, locationY / imageH));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sendClick(xFrac, yFrac);
  }, [status, imageW, imageH]);

  const handleSendType = () => {
    if (!typeText.trim()) return;
    sendType(typeText.trim());
    setTypeText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePause = () => { pauseRun(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); };
  const handleResume = () => { resumeRun(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); };
  const handleStop = () => {
    Alert.alert("Stop Agent?", "This will abort the current run.", [
      { text: "Cancel", style: "cancel" },
      { text: "Stop", style: "destructive", onPress: () => { stopRun(); } },
    ]);
  };

  // ── Feedback loop: send answer to the agent ──
  const handleSendAnswer = (answer: string) => {
    if (!answer.trim()) return;
    sendUserResponse(answer.trim());
    setAnswerText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleSkipQuestion = () => {
    sendUserResponse("(skipped — please proceed with your best judgment)");
    setAnswerText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const latestStep = steps[currentStep - 1];
  const allSteps = [...steps].reverse(); // newest first

  return (
    <LinearGradient colors={Gradients.background} style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={timelineRef}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Status header ── */}
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <View style={styles.headerLeft}>
              <StatusBadge status={status} />
              {status === "running" && (
                <Text style={styles.stepCounter}>
                  Step {currentStep} / {maxSteps}
                </Text>
              )}
            </View>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${maxSteps > 0 ? (currentStep / maxSteps) * 100 : 0}%` },
                ]}
              />
            </View>
          </View>

          {/* Goal pill */}
          {goal ? (
            <Text style={styles.goalText} numberOfLines={2}>🎯 {goal}</Text>
          ) : null}

          {/* ── Browser Screenshot Viewer ── */}
          <GlassCard
            style={styles.screenshotCard}
            innerStyle={{ padding: 0, overflow: "hidden" }}
            glowColor={status === "paused" ? Colors.amber : Colors.cyan}
          >
            {status === "paused" && (
              <View style={styles.pausedBanner}>
                <Text style={styles.pausedBannerText}>
                  🖱️  You're in control — tap to click, type below
                </Text>
              </View>
            )}

            <TouchableOpacity
              activeOpacity={0.95}
              onPress={handleImageTap}
              style={[styles.imageContainer, { height: imageH }]}
            >
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={{ width: imageW, height: imageH, borderRadius: 8 }}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.placeholderImg, { height: imageH }]}>
                  <Text style={styles.placeholderIcon}>🖥️</Text>
                  <Text style={styles.placeholderText}>
                    {status === "idle"
                      ? "Start a run to see the browser here"
                      : "Waiting for first screenshot..."}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* LLM meta strip */}
            {latestStep?.provider && (
              <View style={styles.metaStrip}>
                <Text style={styles.metaText}>🔌 {latestStep.provider}</Text>
                {latestStep.latencyMs !== undefined && (
                  <Text style={styles.metaText}>⏱ {latestStep.latencyMs}ms</Text>
                )}
                {latestStep.tokensUsed?.total && (
                  <Text style={styles.metaText}>🪙 {latestStep.tokensUsed.total} tokens</Text>
                )}
              </View>
            )}
          </GlassCard>

          {/* ── Type input (visible when paused) ── */}
          {status === "paused" && (
            <GlassCard style={styles.typeCard} glowColor={Colors.amber}>
              <Text style={styles.typeLabel}>Type into focused element</Text>
              <View style={styles.typeRow}>
                <TextInput
                  style={styles.typeInput}
                  placeholder="Enter text to type..."
                  placeholderTextColor={Colors.textMuted}
                  value={typeText}
                  onChangeText={setTypeText}
                  onSubmitEditing={handleSendType}
                  returnKeyType="send"
                  autoFocus={false}
                />
                <TouchableOpacity style={styles.sendBtn} onPress={handleSendType}>
                  <Send size={18} color={Colors.cyan} />
                </TouchableOpacity>
              </View>
            </GlassCard>
          )}

          {/* ── Feedback Loop: Question Card (visible when LLM asks the user) ── */}
          {status === "waiting_for_user" && pendingQuestion && (
            <GlassCard style={styles.askCard} glowColor={Colors.purple}>
              <View style={styles.askHeader}>
                <Text style={styles.askIcon}>❓</Text>
                <Text style={styles.askLabel}>Agent needs your help</Text>
              </View>
              <Text style={styles.askQuestion}>{pendingQuestion}</Text>

              {/* Quick-tap option buttons */}
              {pendingOptions.length > 0 && (
                <View style={styles.optionsRow}>
                  {pendingOptions.map((opt, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.optionBtn}
                      activeOpacity={0.7}
                      onPress={() => handleSendAnswer(opt)}
                    >
                      <Text style={styles.optionText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Free-text answer input */}
              <View style={styles.answerRow}>
                <TextInput
                  style={styles.answerInput}
                  placeholder="Or type your answer..."
                  placeholderTextColor={Colors.textMuted}
                  value={answerText}
                  onChangeText={setAnswerText}
                  onSubmitEditing={() => handleSendAnswer(answerText)}
                  returnKeyType="send"
                  autoFocus={true}
                />
                <TouchableOpacity
                  style={styles.answerSendBtn}
                  onPress={() => handleSendAnswer(answerText)}
                >
                  <Send size={18} color={Colors.purple} />
                </TouchableOpacity>
              </View>

              {/* Skip button */}
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={handleSkipQuestion}
                activeOpacity={0.6}
              >
                <Text style={styles.skipText}>Skip — let agent decide</Text>
              </TouchableOpacity>
            </GlassCard>
          )}

          {/* ── Result / Error card ── */}
          {(status === "done" || status === "error" || status === "max_steps") && (
            <GlassCard
              style={styles.resultCard}
              glowColor={status === "done" ? Colors.green : Colors.red}
            >
              <Text style={status === "done" ? styles.resultTitle : styles.errorTitle}>
                {status === "done" ? "✅ Goal Completed" : status === "max_steps" ? "⚠️ Max Steps Reached" : "❌ Agent Error"}
              </Text>
              <Text style={styles.resultText}>{result ?? error ?? "No detail available."}</Text>
            </GlassCard>
          )}

          {/* ── Reasoning Timeline ── */}
          {allSteps.length > 0 && (
            <>
              <View style={styles.timelineHeader}>
                <Text style={styles.sectionLabel}>Reasoning Timeline</Text>
                <ChevronDown size={14} color={Colors.textMuted} />
              </View>
              {/* H6: filter undefined holes from sparse array before rendering */}
              {allSteps.filter(Boolean).map((s, i) => (
                <TerminalRow
                  key={`step-${s.step}-${i}`}
                  step={s.step}
                  reasoning={s.reasoning}
                  actions={s.actions}
                  actionLog={s.actionLog}
                  provider={s.provider}
                  latencyMs={s.latencyMs}
                  tokensUsed={s.tokensUsed}
                />
              ))}
            </>
          )}
        </ScrollView>

        {/* ── Floating Control Bar ── */}
        {(status === "running" || status === "paused" || status === "waiting_for_user") && (
          <View style={[styles.controlBar, { paddingBottom: insets.bottom + 12 }]}>
          <GlassCard style={styles.controls} innerStyle={{ padding: 8 }} glowColor={Colors.border}>
              <View style={styles.controlsInner}>
                {status === "running" ? (
                  <GlowButton
                    label="Pause"
                    onPress={handlePause}
                    variant="ghost"
                    style={styles.controlBtn}
                    icon={<Pause size={15} color={Colors.amber} />}
                  />
                ) : (
                  <GlowButton
                    label="Resume"
                    onPress={handleResume}
                    variant="ghost"
                    style={styles.controlBtn}
                    icon={<Play size={15} color={Colors.green} />}
                  />
                )}
                <GlowButton
                  label="Stop"
                  onPress={handleStop}
                  variant="danger"
                  style={styles.controlBtn}
                  icon={<Square size={15} color={Colors.textPrimary} />}
                />
              </View>
            </GlassCard>
          </View>
        )}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepCounter: { color: Colors.textSecondary, fontSize: 13, fontWeight: "600" },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.cyan,
    borderRadius: 2,
  },
  goalText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 16,
    lineHeight: 19,
  },
  screenshotCard: { marginBottom: 16, padding: 0, overflow: "hidden" },
  pausedBanner: {
    backgroundColor: "#FEF3C7",
    borderBottomWidth: 1,
    borderColor: "rgba(217,119,6,0.15)",
    padding: 12,
    alignItems: "center",
  },
  pausedBannerText: { color: "#D97706", fontSize: 12, fontWeight: "600" },
  imageContainer: {
    width: "100%",
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderImg: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  placeholderIcon: { fontSize: 42 },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 30,
  },
  metaStrip: {
    flexDirection: "row",
    gap: 16,
    padding: 12,
    borderTopWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  metaText: { color: Colors.textMuted, fontSize: 11 },
  typeCard: { marginBottom: 16 },
  typeLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 8 },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  typeInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    paddingVertical: 12,
  },
  sendBtn: { padding: 6 },
  resultCard: { marginBottom: 20 },
  resultTitle: { color: Colors.green, fontSize: 15, fontWeight: "700", marginBottom: 8 },
  errorTitle: { color: Colors.red, fontSize: 15, fontWeight: "700", marginBottom: 8 },
  resultText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 8,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  controlBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: "rgba(248,250,252,0.92)",
  },
  controls: { padding: 0, elevation: 8, shadowColor: "#0F172A", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 12 },
  controlsInner: { flexDirection: "row", gap: 10 },
  controlBtn: { flex: 1 },
  // ── Feedback loop question card styles ──
  askCard: { marginBottom: 16 },
  askHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  askIcon: { fontSize: 20 },
  askLabel: {
    color: Colors.purple,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  askQuestion: {
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  optionBtn: {
    backgroundColor: "#E0E7FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  optionText: {
    color: "#4F46E5",
    fontSize: 13,
    fontWeight: "600",
  },
  answerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  answerInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    paddingVertical: 12,
  },
  answerSendBtn: { padding: 6 },
  skipBtn: {
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
  },
});
