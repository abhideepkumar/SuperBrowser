// ─── Agent Core Library ──────────────────────────────────────────
// This module exports runAgent() — a pure library function with no
// side effects (no process.exit, no process.argv, no hardcoded paths).
//
// For CLI usage, see src/cli.ts.
// For server/WebSocket usage, see src/server.ts.

import * as fs from "fs";
import * as path from "path";
import * as browser from "./browser.js";
import { planActions, type AgentAction } from "./llm.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { substituteCredentials, sanitizeGoal } from "./credentials.js";
import { config } from "dotenv";
import type { RunLogger } from "./logger.js";

config();

// ─── Public Types ────────────────────────────────────────────────

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
  actions?: AgentAction[];
  actionType?: string;
  actionRef?: string;
  actionValue?: string;
  actionSuccess?: boolean;
  /** Base64-encoded PNG of the current browser screenshot */
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

export interface AgentRunConfig {
  /** The user's automation goal */
  goal: string;
  /** Unique identifier for this run (used for session isolation + log naming) */
  runId: string;
  /** Per-run logger instance */
  logger: RunLogger;
  /** Maximum number of loop iterations (default: process.env.MAX_STEPS || 20) */
  maxSteps?: number;
  /** Delay in ms after page actions to let the page settle (default: 2500) */
  settleDelayMs?: number;
  /** Delay in ms between individual actions (default: 800) */
  actionDelayMs?: number;
  /**
   * Callback fired on every significant agent event.
   * The server uses this to stream events to the mobile client via WebSocket.
   */
  onEvent: (event: AgentEvent) => void;
  /**
   * If defined, called before each step. Return true to pause the loop.
   * The agent will wait (polling every 500ms) until this returns false.
   */
  isPaused?: () => boolean;
  /**
   * Signal to abort the run entirely. The agent checks this before each step.
   */
  abortSignal?: AbortSignal;
  /** Optional LLM provider override (overrides LLM_PROVIDER env var) */
  providerOverride?: string;
  /**
   * Called when the LLM asks the user a question (status: "ask_user").
   * The agent loop will AWAIT the returned Promise — it must resolve
   * with the user's answer string. The answer is then injected into
   * the next LLM planning call as additional context.
   */
  onAskUser?: (question: string, options?: string[]) => Promise<string>;
}

export interface AgentRunResult {
  success: boolean;
  result: string | null;
  totalSteps: number;
  reason: "done" | "error" | "max_steps" | "aborted";
  error?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read a screenshot file and return it as a base64 string.
 * Returns undefined if the file doesn't exist or can't be read.
 */
function readScreenshotAsBase64(screenshotPath: string): string | undefined {
  try {
    if (fs.existsSync(screenshotPath)) {
      return fs.readFileSync(screenshotPath).toString("base64");
    }
  } catch {
    // Non-fatal — screenshot is optional
  }
  return undefined;
}

/**
 * Emit an event and also mirror key fields to the run log.
 */
function emit(
  config: AgentRunConfig,
  partial: Omit<AgentEvent, "runId" | "timestamp">
): void {
  const event: AgentEvent = {
    ...partial,
    runId: config.runId,
    timestamp: Date.now(),
  };
  config.onEvent(event);
}

// ─── Action Executor ────────────────────────────────────────────

async function executeAction(
  action: AgentAction,
  runConfig: AgentRunConfig
): Promise<boolean> {
  const { logger, runId } = runConfig;

  switch (action.type) {
    case "click": {
      if (!action.ref) {
        logger.log("⚠️", "Click action missing ref, skipping.");
        return false;
      }
      logger.log("🖱️", `Clicking ${action.ref}`);
      emit(runConfig, {
        type: "action_executing",
        actionType: "click",
        actionRef: action.ref,
      });
      const result = await browser.click(action.ref, runId);
      logger.logActionResult(`click(${action.ref})`, result.success, result.output, result.error);
      emit(runConfig, {
        type: "action_done",
        actionType: "click",
        actionRef: action.ref,
        actionSuccess: result.success,
        error: result.error,
      });
      if (!result.success) logger.log("❌", `Click failed: ${result.error}`);
      return result.success;
    }

    case "fill": {
      if (!action.ref || action.value === undefined) {
        logger.log("⚠️", "Fill action missing ref or value, skipping.");
        return false;
      }
      const realValue = substituteCredentials(action.value);
      const display = realValue !== action.value ? "••••••••" : action.value;
      logger.log("⌨️", `Filling ${action.ref} with "${display}"`);
      emit(runConfig, {
        type: "action_executing",
        actionType: "fill",
        actionRef: action.ref,
        actionValue: display,
      });
      const result = await browser.fill(action.ref, realValue, runId);
      logger.logActionResult(`fill(${action.ref}, "${display}")`, result.success, result.output, result.error);
      emit(runConfig, {
        type: "action_done",
        actionType: "fill",
        actionRef: action.ref,
        actionSuccess: result.success,
        error: result.error,
      });
      if (!result.success) logger.log("❌", `Fill failed: ${result.error}`);
      return result.success;
    }

    case "select": {
      if (!action.ref || !action.value) {
        logger.log("⚠️", "Select action missing ref or value, skipping.");
        return false;
      }
      logger.log("📋", `Selecting "${action.value}" in ${action.ref}`);
      emit(runConfig, {
        type: "action_executing",
        actionType: "select",
        actionRef: action.ref,
        actionValue: action.value,
      });
      const result = await browser.selectOption(action.ref, action.value, runId);
      logger.logActionResult(`select(${action.ref}, "${action.value}")`, result.success, result.output, result.error);
      emit(runConfig, {
        type: "action_done",
        actionType: "select",
        actionRef: action.ref,
        actionSuccess: result.success,
        error: result.error,
      });
      if (!result.success) logger.log("❌", `Select failed: ${result.error}`);
      return result.success;
    }

    case "navigate": {
      if (!action.value) {
        logger.log("⚠️", "Navigate action missing URL, skipping.");
        return false;
      }
      logger.log("🌐", `Navigating to ${action.value}`);
      emit(runConfig, {
        type: "action_executing",
        actionType: "navigate",
        actionValue: action.value,
      });
      const result = await browser.openUrl(action.value, runId);
      logger.logActionResult(`navigate(${action.value})`, result.success, result.output, result.error);
      emit(runConfig, {
        type: "action_done",
        actionType: "navigate",
        actionValue: action.value,
        actionSuccess: result.success,
        error: result.error,
      });
      if (!result.success) logger.log("❌", `Navigate failed: ${result.error}`);
      return result.success;
    }

    case "scroll": {
      const dir = (action.value === "up" ? "up" : "down") as "up" | "down";
      logger.log("📜", `Scrolling ${dir}`);
      emit(runConfig, {
        type: "action_executing",
        actionType: "scroll",
        actionValue: dir,
      });
      const result = await browser.scroll(dir, runId);
      logger.logActionResult(`scroll(${dir})`, result.success, result.output, result.error);
      emit(runConfig, {
        type: "action_done",
        actionType: "scroll",
        actionValue: dir,
        actionSuccess: result.success,
        error: result.error,
      });
      if (!result.success) logger.log("❌", `Scroll failed: ${result.error}`);
      return result.success;
    }

    default:
      logger.log("⚠️", `Unknown action type: ${(action as any).type}`);
      return false;
  }
}

// ─── Main Agent Loop ─────────────────────────────────────────────

/**
 * Run the browser automation agent loop.
 *
 * This is a pure library function — no process.exit(), no process.argv.
 * Safe to call from CLI, HTTP handler, or WebSocket session manager.
 *
 * @returns AgentRunResult with success status, extracted result, and reason
 */
export async function runAgent(runConfig: AgentRunConfig): Promise<AgentRunResult> {
  const {
    goal,
    runId,
    logger,
    maxSteps = parseInt(process.env.MAX_STEPS || "20", 10),
    settleDelayMs = 2500,
    actionDelayMs = 800,
    isPaused,
    abortSignal,
    providerOverride,
  } = runConfig;

  const sanitizedGoal = sanitizeGoal(goal);

  // Screenshot directory is namespaced by runId to prevent concurrent run conflicts
  const screenshotDir = path.resolve(`screenshots/${runId}`);
  fs.mkdirSync(screenshotDir, { recursive: true });

  logger.logConfig({
    GOAL: sanitizedGoal,
    RUN_ID: runId,
    LLM_PROVIDER: providerOverride || process.env.LLM_PROVIDER || "openai",
    MODEL_NAME: process.env.MODEL_NAME || "gpt-4o",
    ENABLE_VISION: process.env.ENABLE_VISION || "true",
    MAX_STEPS: String(maxSteps),
    SETTLE_DELAY_MS: String(settleDelayMs),
    ACTION_DELAY_MS: String(actionDelayMs),
  });

  logger.logSection("🚀 SUPER BROWSER AGENT");
  logger.log("🎯", `Goal: ${sanitizedGoal}`);
  logger.log("⚙️", `Run ID: ${runId}`);
  logger.log("⚙️", `Max steps: ${maxSteps}`);
  logger.log("📝", `Log file: ${logger.logFilePath}`);

  emit(runConfig, { type: "started", result: null });

  // H4: Wrap everything so logger.close() is guaranteed on all exit paths,
  // including exceptions thrown by planActions().
  try {
  // ─── Navigate to URL if present in goal ───────────────────────
  const urlMatch = goal.match(/https?:\/\/[^\s"',)]+/);
  if (urlMatch) {
    logger.logSection("PHASE 1: OBSERVATION — Opening Browser");
    logger.log("🌐", `Navigating to ${urlMatch[0]}`);
    const navResult = await browser.openUrl(urlMatch[0], runId);
    logger.logActionResult(`openUrl(${urlMatch[0]})`, navResult.success, navResult.output, navResult.error);

    if (!navResult.success) {
      const errMsg = `Failed to open URL: ${navResult.error}`;
      logger.log("❌", errMsg);
      emit(runConfig, { type: "error", error: errMsg, result: null });
      await browser.close(runId);
      await logger.close();
      return { success: false, result: null, totalSteps: 0, reason: "error", error: errMsg };
    }

    logger.log("✅", "Page opened successfully.");
    await sleep(settleDelayMs);
  }

  // ─── Main Loop ─────────────────────────────────────────────────
    let consecutiveSnapshotFailures = 0;
    const MAX_SNAPSHOT_FAILURES = 3;
    /** Holds the user's answer to inject into the next LLM call */
    let pendingUserAnswer: string | null = null;

    for (let step = 0; step < maxSteps; step++) {
    // Check abort signal
    if (abortSignal?.aborted) {
      logger.log("🛑", "Run aborted by external signal.");
      await browser.close(runId);
      await logger.close();
      return { success: false, result: null, totalSteps: step, reason: "aborted" };
    }

    // Check pause state — wait until resumed
    if (isPaused?.()) {
      logger.log("⏸️", "Run paused. Waiting for resume...");
      emit(runConfig, { type: "paused", step });
      while (isPaused()) {
        if (abortSignal?.aborted) break;
        await sleep(500);
      }
      if (abortSignal?.aborted) {
        await browser.close(runId);
        await logger.close();
        return { success: false, result: null, totalSteps: step, reason: "aborted" };
      }
      logger.log("▶️", "Run resumed.");
      emit(runConfig, { type: "resumed", step });
    }

    logger.logSection(`STEP ${step + 1} / ${maxSteps}`);
    emit(runConfig, { type: "step_started", step: step + 1, maxSteps });

    // --- Phase 1: Observe ---
    logger.log("📸", "Taking snapshot...");
    const snap = await browser.snapshot(runId);
    logger.logActionResult("snapshot()", snap.success, snap.output, snap.error);

    if (!snap.success) {
      consecutiveSnapshotFailures++;
      logger.log("❌", `Snapshot failed (attempt ${consecutiveSnapshotFailures}/${MAX_SNAPSHOT_FAILURES}): ${snap.error}`);

      // H3: Don't silently burn maxSteps on infrastructure failures
      if (consecutiveSnapshotFailures >= MAX_SNAPSHOT_FAILURES) {
        const errMsg = `Snapshot failed ${MAX_SNAPSHOT_FAILURES} times in a row. Aborting.`;
        logger.logError(errMsg);
        emit(runConfig, { type: "error", error: errMsg, result: null });
        await browser.close(runId);
        return { success: false, result: null, totalSteps: step + 1, reason: "error", error: errMsg };
      }

      logger.log("⏳", "Retrying in 3 seconds...");
      await sleep(3000);
      continue;
    }
    consecutiveSnapshotFailures = 0; // reset on success

    emit(runConfig, { type: "snapshot_taken", step: step + 1 });

    // Take annotated screenshot
    const screenshotPath = path.join(screenshotDir, `step_${step}.png`);
    logger.log("📷", `Taking screenshot → ${screenshotPath}`);
    const ssResult = await browser.screenshot(screenshotPath, runId);
    logger.logActionResult(`screenshot(${screenshotPath})`, ssResult.success, ssResult.output, ssResult.error);

    if (!ssResult.success) {
      logger.log("⚠️", `Screenshot failed (non-fatal): ${ssResult.error}`);
    }

    // Read screenshot as base64 for streaming to the mobile client
    const screenshotBase64 = readScreenshotAsBase64(screenshotPath);
    emit(runConfig, {
      type: "screenshot_taken",
      step: step + 1,
      screenshotBase64,
      screenshotPath: ssResult.success ? screenshotPath : undefined,
    });

    // Truncate long snapshots to avoid token overflow
    let snapshotText =
      snap.output.length > 8000
        ? snap.output.substring(0, 8000) + "\n\n[... snapshot truncated for token limit ...]"
        : snap.output;

    // Inject the user's answer from a previous ask_user round
    if (pendingUserAnswer) {
      snapshotText += `\n\n## USER RESPONSE\nThe user answered your previous question: "${pendingUserAnswer}"`;
      logger.log("💬", `Injecting user answer into LLM context: "${pendingUserAnswer}"`);
      pendingUserAnswer = null; // consume it
    }

    logger.log("📝", `Snapshot length: ${snapshotText.length} chars`);
    logger.logDetail("AX TREE SNAPSHOT", snap.output);

    // --- Phase 2: Plan ---
    logger.log("🧠", "Sending to LLM for planning...");
    const response = await planActions(
      SYSTEM_PROMPT,
      sanitizedGoal,
      snapshotText,
      ssResult.success ? screenshotPath : undefined,
      step + 1,
      logger,
      providerOverride
    );

    logger.log("💭", `Reasoning: ${response.reasoning}`);
    logger.log("📊", `Status: ${response.status}`);
    logger.log("📋", `Actions: ${response.actions.length}`);
    if (response._provider) {
      logger.log("🔌", `Provider: ${response._provider} | Latency: ${response._latencyMs ?? "?"}ms | Retries: ${response._retries ?? 0}`);
    }
    if (response._tokensUsed) {
      logger.log("🪙", `Tokens: prompt=${response._tokensUsed.prompt ?? "?"}, completion=${response._tokensUsed.completion ?? "?"}, total=${response._tokensUsed.total ?? "?"}`);
    }

    logger.logDetail("RAW LLM RESPONSE", response._raw || "(empty)");
    logger.logDetail("PARSED LLM ACTIONS", JSON.stringify(response.actions, null, 2));

    emit(runConfig, {
      type: "llm_planned",
      step: step + 1,
      reasoning: response.reasoning,
      status: response.status,
      actions: response.actions,
      provider: response._provider,
      model: process.env.MODEL_NAME,
      latencyMs: response._latencyMs,
      tokensUsed: response._tokensUsed,
      usedVision: response._usedVision,
    });

    // --- Check terminal states ---
    if (response.status === "done") {
      logger.logSection("✅ GOAL COMPLETED");
      logger.logResult(response.result);
      emit(runConfig, { type: "done", result: response.result });
      await browser.close(runId);
      await logger.close();
      return {
        success: true,
        result: response.result,
        totalSteps: step + 1,
        reason: "done",
      };
    }

    if (response.status === "error") {
      logger.logSection("❌ AGENT ERROR");
      logger.logError(response.reasoning, response.result ?? undefined);
      emit(runConfig, {
        type: "error",
        reasoning: response.reasoning,
        result: response.result,
        error: response.reasoning,
      });
      await browser.close(runId);
      await logger.close();
      return {
        success: false,
        result: response.result,
        totalSteps: step + 1,
        reason: "error",
        error: response.reasoning,
      };
    }

    // --- Check: LLM is asking the user a question ---
    if (response.status === "ask_user") {
      const question = response.result ?? response.reasoning;
      const options = response.options;

      logger.logSection("❓ ASKING USER");
      logger.log("🗣️", `Question: ${question}`);
      if (options?.length) {
        logger.log("📋", `Options: ${options.join(", ")}`);
      }

      emit(runConfig, {
        type: "ask_user",
        step: step + 1,
        question,
        options,
        screenshotBase64,
        reasoning: response.reasoning,
      });

      // Suspend the loop — wait for the user's answer
      let userAnswer = "";
      if (runConfig.onAskUser) {
        userAnswer = await runConfig.onAskUser(question, options);
      } else {
        // No handler registered (e.g. CLI mode) — skip with a default
        logger.log("⚠️", "No onAskUser handler registered. Skipping question.");
        userAnswer = "(no response — please proceed with your best judgment)";
      }

      logger.log("💬", `User answered: ${userAnswer}`);
      emit(runConfig, {
        type: "user_responded",
        step: step + 1,
        question,
        userAnswer,
      });

      // Store the answer so it gets injected into the NEXT LLM call
      pendingUserAnswer = userAnswer;
      continue; // Go to next iteration — re-snapshot + plan with the answer
    }

    // --- Phase 3: Execute ---
    if (response.actions.length === 0) {
      logger.log("⏳", "No actions returned. Waiting for page to settle...");
      await sleep(settleDelayMs);
      continue;
    }

    for (const action of response.actions) {
      if (abortSignal?.aborted) break;
      const ok = await executeAction(action, runConfig);
      if (!ok) {
        logger.log("⚠️", "Action failed. Will re-snapshot and retry on next loop.");
      }
      await sleep(actionDelayMs);
    }

    logger.log("⏳", "Waiting for page to settle...");
    await sleep(settleDelayMs);
  }

    // Reached max steps
    logger.logSection("⚠️ MAX STEPS REACHED");
    logger.log("🛑", `Agent ran for ${maxSteps} steps without completing the goal.`);
    logger.log("📷", `Check screenshots/${runId}/ for the last page state.`);

    emit(runConfig, {
      type: "max_steps_reached",
      maxSteps,
      result: null,
      error: `Reached maximum of ${maxSteps} steps without completing the goal.`,
    });

    await browser.close(runId);
    return {
      success: false,
      result: null,
      totalSteps: maxSteps,
      reason: "max_steps",
      error: `Reached maximum of ${maxSteps} steps.`,
    };
  } finally {
    // Guaranteed cleanup — file descriptor never leaks
    await logger.close().catch(() => {}); // ignore double-close
  }
}
