// screens/SettingsScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  Switch, TouchableOpacity, Alert, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react-native";

import { GlassCard } from "../components/GlassCard";
import { GlowButton } from "../components/GlowButton";
import { Colors, Gradients } from "../theme/colors";
import { useSettingsStore } from "../store/useSettingsStore";
import { fetchHealth, updateConfig } from "../services/api";

const PROVIDERS = [
  { value: "openai",   label: "OpenAI / OpenRouter" },
  { value: "nvidia",   label: "NVIDIA NIM" },
  { value: "llamacpp", label: "llama.cpp (Local)" },
];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { serverUrl, provider, model, setServerUrl, setProvider, setModel } = useSettingsStore();

  const [urlInput, setUrlInput] = useState(serverUrl);
  const [modelInput, setModelInput] = useState(model);
  const [selectedProvider, setSelectedProvider] = useState(provider);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [vision, setVision] = useState(true);
  const [maxSteps, setMaxSteps] = useState("20");
  const [pingStatus, setPingStatus] = useState<"idle" | "ok" | "fail" | "loading">("idle");
  const [saving, setSaving] = useState(false);

  const testConnection = async () => {
    setPingStatus("loading");
    try {
      const health = await fetchHealth();
      setPingStatus("ok");
      setSelectedProvider(health.provider);
      setModelInput(health.model);
      setVision(health.vision === "true");
      setMaxSteps(health.maxSteps);
    } catch {
      setPingStatus("fail");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setServerUrl(urlInput.trim());
      setProvider(selectedProvider);
      setModel(modelInput.trim());

      const credentials: Record<string, string> = {};
      if (credEmail) credentials["CRED_EMAIL"] = credEmail;
      if (credPassword) credentials["CRED_PASSWORD"] = credPassword;

      await updateConfig({
        provider: selectedProvider,
        model: modelInput.trim(),
        vision: String(vision),
        maxSteps,
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
      });

      Alert.alert("Saved", "Settings applied to the server.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Could not update server config.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient colors={Gradients.background} style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.title}>Settings</Text>

        {/* ── Server Connection ── */}
        <Text style={styles.sectionLabel}>Server Connection</Text>
        <GlassCard style={styles.card} glowColor={pingStatus === "ok" ? Colors.green : pingStatus === "fail" ? Colors.red : undefined}>
          <Text style={styles.fieldLabel}>Server URL</Text>
          <TextInput
            style={styles.input}
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="http://192.168.0.114:3000"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            keyboardType="url"
          />
          <View style={styles.pingRow}>
            <GlowButton
              label="Test Connection"
              onPress={testConnection}
              variant="ghost"
              loading={pingStatus === "loading"}
              style={{ flex: 1 }}
              icon={<RefreshCw size={14} color={Colors.cyan} />}
            />
            {pingStatus === "ok" && <CheckCircle size={20} color={Colors.green} />}
            {pingStatus === "fail" && <XCircle size={20} color={Colors.red} />}
          </View>
        </GlassCard>

        {/* ── LLM Configuration ── */}
        <Text style={styles.sectionLabel}>LLM Provider</Text>
        <GlassCard style={styles.card}>
          {PROVIDERS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[styles.providerRow, selectedProvider === p.value && styles.providerSelected]}
              onPress={() => setSelectedProvider(p.value)}
            >
              <View style={[styles.radioOuter, selectedProvider === p.value && styles.radioOuterSelected]}>
                {selectedProvider === p.value && <View style={styles.radioInner} />}
              </View>
              <Text style={[styles.providerLabel, selectedProvider === p.value && { color: Colors.cyan }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Model Name</Text>
          <TextInput
            style={styles.input}
            value={modelInput}
            onChangeText={setModelInput}
            placeholder="e.g. gpt-4o, qwen/qwen3-80b, gemma-3-27b-it:free"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Vision (Screenshots)</Text>
              <Text style={styles.fieldDesc}>Send screenshots to the LLM for visual understanding</Text>
            </View>
            <Switch
              value={vision}
              onValueChange={setVision}
              trackColor={{ false: "#E2E8F0", true: "#BFDBFE" }}
              thumbColor={vision ? Colors.cyan : "#94A3B8"}
            />
          </View>

          <Text style={styles.fieldLabel}>Max Steps</Text>
          <TextInput
            style={styles.input}
            value={maxSteps}
            onChangeText={setMaxSteps}
            keyboardType="number-pad"
            placeholder="20"
            placeholderTextColor={Colors.textMuted}
          />
        </GlassCard>

        {/* ── Credentials ── */}
        <Text style={styles.sectionLabel}>Credentials</Text>
        <GlassCard style={styles.card}>
          <Text style={styles.fieldDesc}>
            Used for login automation. The LLM sees {"{{EMAIL}}"} and {"{{PASSWORD}}"} placeholders — never the real values.
          </Text>
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Email</Text>
          <TextInput
            style={styles.input}
            value={credEmail}
            onChangeText={setCredEmail}
            placeholder="user@example.com"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={styles.input}
            value={credPassword}
            onChangeText={setCredPassword}
            placeholder="••••••••"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
          />
        </GlassCard>

        {/* ── Save ── */}
        <GlowButton
          label="Save Settings"
          onPress={handleSave}
          loading={saving}
          style={{ marginTop: 8 }}
        />

        <Text style={styles.hint}>
          💡 Changes to provider, model, and credentials are applied instantly to the running server — no restart needed.
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20 },
  title: { color: Colors.textPrimary, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginBottom: 24 },
  sectionLabel: { color: Colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, marginTop: 8 },
  card: { marginBottom: 20 },
  fieldLabel: { color: Colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 6 },
  fieldDesc: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  input: {
    color: Colors.textPrimary, fontSize: 14,
    backgroundColor: "#F1F5F9",
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 14,
  },
  pingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  providerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  providerSelected: { backgroundColor: "#EFF6FF" },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.textMuted,
    alignItems: "center", justifyContent: "center",
  },
  radioOuterSelected: { borderColor: Colors.cyan },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.cyan },
  providerLabel: { color: Colors.textSecondary, fontSize: 14, fontWeight: "500" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 12 },
  hint: { color: Colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 16, textAlign: "center" },
});
