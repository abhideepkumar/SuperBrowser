// src/store/useAgentStore.ts
// Zustand global store for active run state and streaming events.

import { create } from "zustand";
import type { AgentEvent, RunStatus } from "../types";

interface StepSummary {
  step: number;
  reasoning?: string;
  actions?: AgentEvent["actions"];
  screenshotBase64?: string;
  provider?: string;
  latencyMs?: number;
  tokensUsed?: AgentEvent["tokensUsed"];
  actionLog: Array<{ type: string; ref?: string; value?: string; success?: boolean }>;
}

interface AgentState {
  // Active run
  runId: string | null;
  goal: string;
  status: RunStatus;
  currentStep: number;
  maxSteps: number;
  totalTokens: number;
  result: string | null;
  error: string | null;
  steps: StepSummary[];
  // Current screenshot (latest)
  screenshotBase64: string | null;
  // Interactive fallback
  interactiveScreenshot: string | null;
  // Feedback loop
  pendingQuestion: string | null;
  pendingOptions: string[];

  // Actions
  startRun: (goal: string) => void;
  setStatus: (status: RunStatus) => void;
  processEvent: (event: AgentEvent) => void;
  setInteractiveScreenshot: (base64: string | null) => void;
  clearPendingQuestion: () => void;
  reset: () => void;
}

const INITIAL: Omit<AgentState, "startRun" | "setStatus" | "processEvent" | "setInteractiveScreenshot" | "clearPendingQuestion" | "reset"> = {
  runId: null,
  goal: "",
  status: "idle",
  currentStep: 0,
  maxSteps: 20,
  totalTokens: 0,
  result: null,
  error: null,
  steps: [],
  screenshotBase64: null,
  interactiveScreenshot: null,
  pendingQuestion: null,
  pendingOptions: [],
};

export const useAgentStore = create<AgentState>((set, get) => ({
  ...INITIAL,

  startRun: (goal) => set({ ...INITIAL, goal, status: "running" }),

  setStatus: (status) => set({ status }),

  processEvent: (event) => {
    const state = get();

    switch (event.type) {
      case "started":
        set({ runId: event.runId, status: "running", steps: [], currentStep: 0, result: null, error: null });
        break;

      case "step_started":
        set({ currentStep: event.step ?? state.currentStep, maxSteps: event.maxSteps ?? state.maxSteps });
        // Ensure a slot exists for this step
        if (event.step) {
          const steps = [...state.steps];
          if (!steps[event.step - 1]) {
            steps[event.step - 1] = { step: event.step, actionLog: [] };
          }
          set({ steps });
        }
        break;

      case "screenshot_taken":
        if (event.screenshotBase64) {
          set({ screenshotBase64: event.screenshotBase64 });
          if (event.step) {
            set((s) => {
              const steps = [...s.steps];
              const idx = event.step! - 1;
              steps[idx] = { ...(steps[idx] ?? { step: event.step!, actionLog: [] }), screenshotBase64: event.screenshotBase64 };
              return { steps };
            });
          }
        }
        break;

      case "llm_planned":
        if (event.step) {
          set((s) => {
            const steps = [...s.steps];
            const idx = event.step! - 1;
            const tokens = event.tokensUsed?.total ?? 0;
            steps[idx] = {
              ...(steps[idx] ?? { step: event.step!, actionLog: [] }),
              reasoning: event.reasoning,
              actions: event.actions,
              provider: event.provider,
              latencyMs: event.latencyMs,
              tokensUsed: event.tokensUsed,
            };
            return { steps, totalTokens: s.totalTokens + tokens };
          });
        }
        break;

      case "action_done":
        if (state.currentStep > 0) {
          set((s) => {
            const steps = [...s.steps];
            const idx = s.currentStep - 1;
            if (!steps[idx]) steps[idx] = { step: s.currentStep, actionLog: [] };
            steps[idx] = {
              ...steps[idx],
              actionLog: [
                ...steps[idx].actionLog,
                { type: event.actionType ?? "", ref: event.actionRef, value: event.actionValue, success: event.actionSuccess },
              ],
            };
            return { steps };
          });
        }
        break;

      case "paused":
        set({ status: "paused" });
        break;

      case "resumed":
        set({ status: "running" });
        break;

      case "ask_user":
        set({
          status: "waiting_for_user",
          pendingQuestion: event.question ?? "The agent needs your input.",
          pendingOptions: event.options ?? [],
        });
        if (event.screenshotBase64) {
          set({ screenshotBase64: event.screenshotBase64 });
        }
        break;

      case "user_responded":
        set({
          status: "running",
          pendingQuestion: null,
          pendingOptions: [],
        });
        break;

      case "done":
        set({ status: "done", result: event.result ?? null });
        break;

      case "error":
        set({ status: "error", error: event.error ?? event.reasoning ?? "Unknown error" });
        break;

      case "max_steps_reached":
        set({ status: "max_steps", error: event.error ?? null });
        break;
    }
  },

  setInteractiveScreenshot: (base64) => set({ interactiveScreenshot: base64 }),

  clearPendingQuestion: () => set({ pendingQuestion: null, pendingOptions: [] }),

  reset: () => set({ ...INITIAL }),
}));
