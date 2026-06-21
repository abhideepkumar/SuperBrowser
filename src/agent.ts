#!/usr/bin/env npx tsx

import * as browser from "./browser.js";
import { planActions, getActiveProviderName, getModelName, type AgentAction } from "./llm.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { substituteCredentials, sanitizeGoal } from "./credentials.js";
import { config } from "dotenv";
import * as path from "path";
import {
  log,
  logSection,
  logDetail,
  logActionResult,
  logResult,
  logError,
  logConfig,
  closeLog,
  getLogFilePath,
} from "./logger.js";

config();

// ─── Configuration ──────────────────────────────────────────────
const MAX_STEPS = parseInt(process.env.MAX_STEPS || "20", 10);
const SETTLE_DELAY_MS = 2500; // Wait for page to settle after actions
const ACTION_DELAY_MS = 800; // Wait between individual actions

// ─── Helpers ────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Action Executor ────────────────────────────────────────────
async function executeAction(action: AgentAction): Promise<boolean> {
  switch (action.type) {
    case "click": {
      if (!action.ref) {
        log("⚠️", `Click action missing ref, skipping.`);
        return false;
      }
      log("🖱️", `Clicking ${action.ref}`);
      const result = await browser.click(action.ref);
      logActionResult(`click(${action.ref})`, result.success, result.output, result.error);
      if (!result.success) {
        log("❌", `Click failed: ${result.error}`);
        return false;
      }
      return true;
    }

    case "fill": {
      if (!action.ref || action.value === undefined) {
        log("⚠️", `Fill action missing ref or value, skipping.`);
        return false;
      }
      // Substitute credential placeholders with real values
      const realValue = substituteCredentials(action.value);
      // Log with masked value if it's a credential
      const display = realValue !== action.value ? "••••••••" : action.value;
      log("⌨️", `Filling ${action.ref} with "${display}"`);
      const result = await browser.fill(action.ref, realValue);
      logActionResult(`fill(${action.ref}, "${display}")`, result.success, result.output, result.error);
      if (!result.success) {
        log("❌", `Fill failed: ${result.error}`);
        return false;
      }
      return true;
    }

    case "select": {
      if (!action.ref || !action.value) {
        log("⚠️", `Select action missing ref or value, skipping.`);
        return false;
      }
      log("📋", `Selecting "${action.value}" in ${action.ref}`);
      const result = await browser.selectOption(action.ref, action.value);
      logActionResult(`select(${action.ref}, "${action.value}")`, result.success, result.output, result.error);
      if (!result.success) {
        log("❌", `Select failed: ${result.error}`);
        return false;
      }
      return true;
    }

    case "navigate": {
      if (!action.value) {
        log("⚠️", `Navigate action missing URL, skipping.`);
        return false;
      }
      log("🌐", `Navigating to ${action.value}`);
      const result = await browser.openUrl(action.value);
      logActionResult(`navigate(${action.value})`, result.success, result.output, result.error);
      if (!result.success) {
        log("❌", `Navigate failed: ${result.error}`);
        return false;
      }
      return true;
    }

    case "scroll": {
      const dir = (action.value === "up" ? "up" : "down") as "up" | "down";
      log("📜", `Scrolling ${dir}`);
      const result = await browser.scroll(dir);
      logActionResult(`scroll(${dir})`, result.success, result.output, result.error);
      if (!result.success) {
        log("❌", `Scroll failed: ${result.error}`);
        return false;
      }
      return true;
    }

    default:
      log("⚠️", `Unknown action type: ${(action as any).type}`);
      return false;
  }
}

// ─── Main Agent Loop ────────────────────────────────────────────
async function main(): Promise<void> {
  // Parse the user goal from CLI arguments
  const rawGoal = process.argv.slice(2).join(" ").trim();
  if (!rawGoal) {
    console.error("\n  Usage: npx tsx src/agent.ts \"<your goal here>\"\n");
    console.error('  Example: npx tsx src/agent.ts "Go to https://books.toscrape.com and find the price of the first book"\n');
    process.exit(1);
  }

  // Sanitize the goal to replace real credentials with placeholders
  const userGoal = sanitizeGoal(rawGoal);

  // Log run configuration to file
  logConfig({
    GOAL: userGoal,
    LLM_PROVIDER: getActiveProviderName(),
    MODEL_NAME: getModelName(),
    ENABLE_VISION: process.env.ENABLE_VISION || "true",
    MAX_STEPS: String(MAX_STEPS),
    SETTLE_DELAY_MS: String(SETTLE_DELAY_MS),
    ACTION_DELAY_MS: String(ACTION_DELAY_MS),
  });

  logSection("🚀 SUPER BROWSER AGENT");
  log("🎯", `Goal: ${userGoal}`);
  log("⚙️", `Max steps: ${MAX_STEPS}`);
  log("📝", `Log file: ${getLogFilePath()}`);

  // ─── Extract URL from goal or use a default ────────────
  const urlMatch = rawGoal.match(/https?:\/\/[^\s"',)]+/);
  if (urlMatch) {
    logSection("PHASE 1: OBSERVATION — Opening Browser");
    log("🌐", `Navigating to ${urlMatch[0]}`);
    const navResult = await browser.openUrl(urlMatch[0]);
    logActionResult(`openUrl(${urlMatch[0]})`, navResult.success, navResult.output, navResult.error);
    if (!navResult.success) {
      log("❌", `Failed to open URL: ${navResult.error}`);
      await closeLog();
      process.exit(1);
    }
    log("✅", "Page opened successfully.");
    await sleep(SETTLE_DELAY_MS);
  }

  // ─── Main Loop ──────────────────────────────────────────
  for (let step = 0; step < MAX_STEPS; step++) {
    logSection(`STEP ${step + 1} / ${MAX_STEPS}`);

    // --- Phase 1: Observe ---
    log("📸", "Taking snapshot...");
    const snap = await browser.snapshot();
    logActionResult("snapshot()", snap.success, snap.output, snap.error);
    if (!snap.success) {
      log("❌", `Snapshot failed: ${snap.error}`);
      log("⏳", "Retrying in 3 seconds...");
      await sleep(3000);
      continue;
    }

    const screenshotPath = path.resolve(`screenshots/step_${step}.png`);
    log("📷", `Taking annotated screenshot → ${screenshotPath}`);
    const ssResult = await browser.screenshot(screenshotPath);
    logActionResult(`screenshot(${screenshotPath})`, ssResult.success, ssResult.output, ssResult.error);
    if (!ssResult.success) {
      log("⚠️", `Screenshot failed (non-fatal): ${ssResult.error}`);
    }

    // Truncate long snapshots to avoid token overflow
    const snapshotText =
      snap.output.length > 8000
        ? snap.output.substring(0, 8000) + "\n\n[... snapshot truncated for token limit ...]"
        : snap.output;

    log("📝", `Snapshot length: ${snap.output.length} chars`);

    // Log the full snapshot to file for debugging
    logDetail("AX TREE SNAPSHOT", snap.output);

    // --- Phase 2: Plan ---
    log("🧠", `Sending to LLM for planning... [${getActiveProviderName()}/${getModelName()}]`);
    const response = await planActions(
      SYSTEM_PROMPT,
      userGoal,
      snapshotText,
      ssResult.success ? screenshotPath : undefined,
      step + 1
    );

    log("💭", `Reasoning: ${response.reasoning}`);
    log("📊", `Status: ${response.status}`);
    log("📋", `Actions: ${response.actions.length}`);
    if (response._usedVision !== undefined) {
      log("👁️", `Vision used: ${response._usedVision ? "yes" : "no (text-only fallback)"}`);
    }
    if (response._provider) {
      log("🔌", `Provider: ${response._provider} | Latency: ${response._latencyMs ?? "?"}ms | Retries: ${response._retries ?? 0}`);
    }
    if (response._tokensUsed) {
      log("🪙", `Tokens: prompt=${response._tokensUsed.prompt ?? "?"}, completion=${response._tokensUsed.completion ?? "?"}, total=${response._tokensUsed.total ?? "?"}`);
    }

    // Log the full raw LLM response to file
    logDetail("RAW LLM RESPONSE", response._raw || "(empty)");
    logDetail("PARSED LLM ACTIONS", JSON.stringify(response.actions, null, 2));

    // --- Check terminal states ---
    if (response.status === "done") {
      logSection("✅ GOAL COMPLETED");
      logResult(response.result);
      await browser.close();
      log("📝", `Full log saved to: ${getLogFilePath()}`);
      await closeLog();
      return;
    }

    if (response.status === "error") {
      logSection("❌ AGENT ERROR");
      logError(response.reasoning, response.result ?? undefined);
      await browser.close();
      log("📝", `Full log saved to: ${getLogFilePath()}`);
      await closeLog();
      process.exit(1);
    }

    // --- Phase 3: Execute ---
    if (response.actions.length === 0) {
      log("⏳", "No actions returned. Waiting for page to settle...");
      await sleep(SETTLE_DELAY_MS);
      continue;
    }

    for (const action of response.actions) {
      const ok = await executeAction(action);
      if (!ok) {
        log("⚠️", "Action failed. Will re-snapshot and retry on next loop.");
      }
      await sleep(ACTION_DELAY_MS);
    }

    // Wait for page to settle after executing actions
    log("⏳", "Waiting for page to settle...");
    await sleep(SETTLE_DELAY_MS);
  }

  // Reached max steps
  logSection("⚠️ MAX STEPS REACHED");
  log("🛑", `Agent ran for ${MAX_STEPS} steps without completing the goal.`);
  log("📷", `Check screenshots/ folder for the last page state.`);
  log("📝", `Full log saved to: ${getLogFilePath()}`);
  await browser.close();
  await closeLog();
  process.exit(1);
}

// ─── Entry Point ────────────────────────────────────────────────
main().catch(async (err) => {
  console.error("\n  Fatal error:", err.message);
  logError("Fatal error", err.message);
  await browser.close();
  log("📝", `Full log saved to: ${getLogFilePath()}`);
  await closeLog();
  process.exit(1);
});
