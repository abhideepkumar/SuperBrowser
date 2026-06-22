// src/types.ts — Shared types mirroring the backend AgentEvent interface

export type AgentEventType =
  | "started"
  | "step_started"
  | "snapshot_taken"
  | "screenshot_taken"
  | "llm_planned"
  | "action_executing"
  | "action_done"
  | "paused"
  | "resumed"
  | "ask_user"
  | "user_responded"
  | "done"
  | "error"
  | "max_steps_reached";

export interface AgentEvent {
  type: AgentEventType;
  runId: string;
  step?: number;
  maxSteps?: number;
  reasoning?: string;
  status?: string;
  actions?: Array<{ type: string; ref?: string; value?: string }>;
  actionType?: string;
  actionRef?: string;
  actionValue?: string;
  actionSuccess?: boolean;
  screenshotBase64?: string;
  screenshotPath?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  tokensUsed?: { prompt?: number; completion?: number; total?: number };
  usedVision?: boolean;
  result?: string | null;
  error?: string;
  /** The question text (for ask_user events) */
  question?: string;
  /** Optional suggested answer choices (for ask_user events) */
  options?: string[];
  /** The user's response (for user_responded events) */
  userAnswer?: string;
  timestamp: number;
}

export type RunStatus = "idle" | "running" | "paused" | "waiting_for_user" | "done" | "error" | "aborted" | "max_steps";
