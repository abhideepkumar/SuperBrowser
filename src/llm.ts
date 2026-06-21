// ─── LLM Orchestrator ───────────────────────────────────────────
// This module is the bridge between the agent loop and the LLM adapters.
// It handles: message building, vision fallback, JSON parsing, and logging.
// All provider-specific logic lives in the adapters/ directory.
//
// DESIGN NOTE: The provider is NOT created at module load time. It is
// instantiated lazily inside planActions() so that:
//   1. A bad config throws an error (not process.exit) — safe in a server.
//   2. The provider can be switched dynamically between runs.

import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";
import { createProvider } from "./adapters/factory.js";
import type { RunLogger } from "./logger.js";
import type {
  LLMProvider,
  ChatMessage,
  ContentPart,
  ChatOptions,
  LLMResponse,
  AgentAction,
} from "./types.js";

// Re-export types that agent.ts needs
export type { AgentAction, LLMResponse };

config();

/**
 * Build the messages array for the LLM request.
 * Supports optional vision (base64 screenshot attachment).
 */
function buildMessages(
  systemPrompt: string,
  userGoal: string,
  snapshotText: string,
  screenshotPath?: string,
  includeImage: boolean = true
): ChatMessage[] {
  const contentParts: ContentPart[] = [];

  contentParts.push({
    type: "text",
    text: `## USER GOAL\n${userGoal}\n\n## CURRENT PAGE SNAPSHOT\n${snapshotText}`,
  });

  if (includeImage && screenshotPath && fs.existsSync(screenshotPath)) {
    const imageBuffer = fs.readFileSync(screenshotPath);
    const base64Image = imageBuffer.toString("base64");
    const ext = path.extname(screenshotPath).replace(".", "");
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";

    contentParts.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64Image}`,
        detail: "low",
      },
    });
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: contentParts },
  ];
}

/**
 * Call the LLM with the current page snapshot and optionally a screenshot.
 * Returns a structured response with reasoning, actions, and status.
 *
 * The LLM provider is created lazily here so that failures throw an Error
 * instead of calling process.exit() — safe to call from a server context.
 *
 * @param systemPrompt  - The system prompt
 * @param userGoal      - The user's goal string
 * @param snapshotText  - The AX tree snapshot text
 * @param screenshotPath - Optional path to the annotated screenshot
 * @param step          - The current step number (for logging)
 * @param logger        - The per-run RunLogger instance
 * @param providerOverride - Optional provider name to override LLM_PROVIDER env var
 */
export async function planActions(
  systemPrompt: string,
  userGoal: string,
  snapshotText: string,
  screenshotPath: string | undefined,
  step: number,
  logger: RunLogger,
  providerOverride?: string
): Promise<LLMResponse> {
  // Lazy provider instantiation — throws, never exits
  let provider: LLMProvider;
  try {
    provider = createProvider(providerOverride);
  } catch (err: any) {
    throw new Error(`Failed to initialize LLM provider: ${err.message}`);
  }

  const model = process.env.MODEL_NAME || "gpt-4o";
  const enableVision =
    (process.env.ENABLE_VISION || "true").toLowerCase() === "true";
  const useVision = enableVision && !!screenshotPath;

  const chatOptions: ChatOptions = {
    model,
    temperature: 0.1,
    max_tokens: 1024,
    response_format: { type: "json_object" },
  };

  // Try with vision first; fall back to text-only if the model rejects images
  for (const includeImage of useVision ? [true, false] : [false]) {
    try {
      const messages = buildMessages(
        systemPrompt,
        userGoal,
        snapshotText,
        screenshotPath,
        includeImage
      );

      const result = await provider.chat(messages, chatOptions);

      logger.logLLMCall({
        step,
        provider: result.provider,
        model: result.model,
        vision: includeImage,
        inputSize: snapshotText.length,
        latencyMs: result.latencyMs,
        retries: result.retries,
        tokensUsed: result.tokensUsed,
        status: "SUCCESS",
      });

      try {
        const parsed = JSON.parse(result.content) as LLMResponse;
        if (!parsed.status) parsed.status = "error";
        if (!parsed.actions) parsed.actions = [];
        if (!parsed.reasoning) parsed.reasoning = "No reasoning provided.";
        if (parsed.result === undefined) parsed.result = null;
        parsed._raw = result.content;
        parsed._usedVision = includeImage;
        parsed._provider = result.provider;
        parsed._latencyMs = result.latencyMs;
        parsed._retries = result.retries;
        parsed._tokensUsed = result.tokensUsed;
        return parsed;
      } catch {
        return {
          reasoning: `Failed to parse LLM response: ${result.content}`,
          status: "error",
          actions: [],
          result: null,
          _raw: result.content,
          _usedVision: includeImage,
          _provider: result.provider,
          _latencyMs: result.latencyMs,
          _retries: result.retries,
          _tokensUsed: result.tokensUsed,
        };
      }
    } catch (err: any) {
      const errorMsg = err.message || String(err);

      logger.logLLMCall({
        step,
        provider: provider.name,
        model,
        vision: includeImage,
        inputSize: snapshotText.length,
        latencyMs: 0,
        retries: 0,
        status: "ERROR",
        error: errorMsg,
      });

      const isVisionError =
        includeImage &&
        (errorMsg.includes("image input") ||
          errorMsg.includes("vision") ||
          errorMsg.includes("multimodal") ||
          errorMsg.includes("does not support"));

      if (isVisionError) {
        logger.log(
          "👁️",
          `Vision not supported by ${provider.name}. Falling back to text-only...`
        );
        continue;
      }

      throw err;
    }
  }

  // Safety fallback (should never be reached)
  return {
    reasoning: "Failed to get a response from the LLM after all attempts.",
    status: "error",
    actions: [],
    result: null,
    _raw: "",
    _usedVision: false,
    _provider: provider!.name,
  };
}

/**
 * Get the name of the active LLM provider from env (for display).
 */
export function getActiveProviderName(): string {
  return (process.env.LLM_PROVIDER || "openai").toLowerCase();
}

/**
 * Get the configured model name (for display).
 */
export function getModelName(): string {
  return process.env.MODEL_NAME || "gpt-4o";
}
