// src/screens/OnboardingScreen.tsx
import React, { useState } from "react";
import {
  View, Text, TextInput, StyleSheet, Dimensions,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, XCircle, ArrowRight, Server, Shield, Sparkles } from "lucide-react-native";
import { Colors } from "../theme/colors";
import { GlowButton } from "../components/GlowButton";
import { GlassCard } from "../components/GlassCard";
import { useSettingsStore } from "../store/useSettingsStore";
import { fetchHealth, updateConfig } from "../services/api";

const { width: SCREEN_W } = Dimensions.get("window");

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { serverUrl, setServerUrl, setProvider, setModel, setCompletedOnboarding } = useSettingsStore();

  const [step, setStep] = useState(1);
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  
  const [pingStatus, setPingStatus] = useState<"idle" | "ok" | "fail" | "loading">("idle");
  const [saving, setSaving] = useState(false);

  const testConnection = async () => {
    setPingStatus("loading");
    try {
      // Temporarily set the url in store so fetchHealth runs against it
      await setServerUrl(urlInput.trim());
      const health = await fetchHealth();
      setPingStatus("ok");
      setProvider(health.provider);
      setModel(health.model);
    } catch {
      setPingStatus("fail");
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else {
      // Step 3: Save credentials and complete onboarding
      setSaving(true);
      try {
        await setServerUrl(urlInput.trim());
        const credentials: Record<string, string> = {};
        if (credEmail) credentials["CRED_EMAIL"] = credEmail;
        if (credPassword) credentials["CRED_PASSWORD"] = credPassword;

        if (Object.keys(credentials).length > 0) {
          await updateConfig({
            credentials,
          });
        }
      } catch (e) {
        // Silently continue or alert if needed
      } finally {
        setSaving(false);
        await setCompletedOnboarding(true);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brandTitle}>SuperBrowser</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>v1.0</Text>
          </View>
        </View>

        {/* Dynamic Step Content */}
        <View style={styles.cardContainer}>
          {step === 1 && (
            <View style={styles.stepContent}>
              <View style={[styles.iconContainer, { backgroundColor: "#EEF2F6" }]}>
                <Sparkles size={40} color={Colors.cyan} />
              </View>
              <Text style={styles.title}>Autonomous AI Agent</Text>
              <Text style={styles.description}>
                SuperBrowser converts your natural language goals into autonomous browser workflows. 
                It plans actions, handles errors, and extracts data with zero selector maintenance.
              </Text>
            </View>
          )}

          {step === 2 && (
            <View style={styles.stepContent}>
              <View style={[styles.iconContainer, { backgroundColor: "#EEF2F6" }]}>
                <Server size={40} color={Colors.purple} />
              </View>
              <Text style={styles.title}>Connect Your Node Server</Text>
              <Text style={styles.description}>
                Provide the local or remote URL of your running SuperBrowser backend server.
              </Text>

              <TextInput
                style={styles.input}
                value={urlInput}
                onChangeText={(t) => {
                  setUrlInput(t);
                  setPingStatus("idle");
                }}
                placeholder="http://192.168.0.114:3000"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                keyboardType="url"
              />

              <View style={styles.pingRow}>
                <TouchableOpacity 
                  style={[styles.testBtn, pingStatus === "loading" && styles.disabledBtn]} 
                  onPress={testConnection}
                  disabled={pingStatus === "loading"}
                >
                  {pingStatus === "loading" ? (
                    <ActivityIndicator size="small" color={Colors.textSecondary} />
                  ) : (
                    <Text style={styles.testBtnText}>Test Connection</Text>
                  )}
                </TouchableOpacity>
                {pingStatus === "ok" && <CheckCircle size={20} color={Colors.green} />}
                {pingStatus === "fail" && <XCircle size={20} color={Colors.red} />}
              </View>
            </View>
          )}

          {step === 3 && (
            <View style={styles.stepContent}>
              <View style={[styles.iconContainer, { backgroundColor: "#EEF2F6" }]}>
                <Shield size={40} color={Colors.green} />
              </View>
              <Text style={styles.title}>Secure Credential Vault</Text>
              <Text style={styles.description}>
                Add login credentials for secure browser automation. Passwords are encrypted on your backend.
              </Text>

              <TextInput
                style={styles.input}
                value={credEmail}
                onChangeText={setCredEmail}
                placeholder="Default Email (e.g. email@example.com)"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <TextInput
                style={styles.input}
                value={credPassword}
                onChangeText={setCredPassword}
                placeholder="Default Password"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
              />
            </View>
          )}
        </View>

        {/* Footer & Controls */}
        <View style={styles.footer}>
          {/* Step indicators */}
          <View style={styles.indicatorRow}>
            <View style={[styles.dot, step === 1 && styles.activeDot]} />
            <View style={[styles.dot, step === 2 && styles.activeDot]} />
            <View style={[styles.dot, step === 3 && styles.activeDot]} />
          </View>

          {/* Buttons */}
          <View style={styles.btnRow}>
            {step > 1 ? (
              <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 60 }} />
            )}

            <GlowButton
              label={step === 3 ? (saving ? "Saving..." : "Get Started") : "Continue"}
              onPress={handleNext}
              disabled={saving}
              style={styles.nextBtn}
              icon={step < 3 ? <ArrowRight size={16} color="#FFFFFF" /> : undefined}
            />
          </View>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  badge: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#1E40AF",
    fontSize: 10,
    fontWeight: "700",
  },
  cardContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  stepContent: {
    width: "100%",
    backgroundColor: Colors.bgCard,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 24,
  },
  input: {
    width: "100%",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  pingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    width: "100%",
    marginTop: 4,
  },
  testBtn: {
    flex: 1,
    backgroundColor: "#E2E8F0",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  testBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  disabledBtn: {
    opacity: 0.6,
  },
  footer: {
    gap: 20,
    marginTop: 20,
  },
  indicatorRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
  },
  activeDot: {
    width: 24,
    backgroundColor: Colors.cyan,
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  backBtnText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  nextBtn: {
    width: 140,
  },
});
