// ─── LLM Orchestrator ───────────────────────────────────────────
// This module is the bridge between the agent loop and the LLM adapters.
// It handles: message building, vision fallback, JSON parsing, and logging.
// All provider-specific logic lives in the adapters/ directory.

import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";
import { createProvider, getProviderName } from "./adapters/factory.js";
import { log, logLLMCall, logDetail } from "./logger.js";
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

const MODEL = process.env.MODEL_NAME || "gpt-4o";
const ENABLE_VISION =
  (process.env.ENABLE_VISION || "true").toLowerCase() === "true";

// Create the provider once at module load time
let provider: LLMProvider;
try {
  provider = createProvider();
} catch (err: any) {
  console.error(`\n  ❌ Failed to initialize LLM provider: ${err.message}\n`);
  process.exit(1);
}

/**
 * Build the messages array for the LLM request.
 * If includeImage is true and a valid screenshotPath is provided,
 * the annotated screenshot is attached as a base64 image.
 */
function buildMessages(
  systemPrompt: string,
  userGoal: string,
  snapshotText: string,
  screenshotPath?: string,
  includeImage: boolean = true
): ChatMessage[] {
  const contentParts: ContentPart[] = [];

  // Text content: the user goal + current snapshot
  contentParts.push({
    type: "text",
    text: `## USER GOAL\n${userGoal}\n\n## CURRENT PAGE SNAPSHOT\n${snapshotText}`,
  });

  // Optionally attach the annotated screenshot as an image
  if (includeImage && screenshotPath && fs.existsSync(screenshotPath)) {
    const imageBuffer = fs.readFileSync(screenshotPath);
    const base64Image = imageBuffer.toString("base64");
    const ext = path.extname(screenshotPath).replace(".", "");
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";

    contentParts.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64Image}`,
        detail: "low", // Use "low" to save tokens; switch to "high" if needed
      },
    });
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: contentParts },
  ];
}

/**
 * Call the LLM with the current page snapshot and optionally an annotated screenshot.
 * Returns a structured response with reasoning, actions, and status.
 *
 * If the model does not support vision (image input), the request is automatically
 * retried without the screenshot attachment.
 *
 * @param step - The current step number (for logging)
 */
export async function planActions(
  systemPrompt: string,
  userGoal: string,
  snapshotText: string,
  screenshotPath?: string,
  step: number = 0
): Promise<LLMResponse> {
  const useVision = ENABLE_VISION && !!screenshotPath;

  const chatOptions: ChatOptions = {
    model: MODEL,
    temperature: 0.1,
    max_tokens: 1024,
    response_format: { type: "json_object" },
  };

  // Try with vision first, then fall back to text-only if the model rejects images
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

      // Log the LLM call details to the log file
      logLLMCall({
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
        // Validate required fields
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

      // Log the failed LLM call
      logLLMCall({
        step,
        provider: provider.name,
        model: MODEL,
        vision: includeImage,
        inputSize: snapshotText.length,
        latencyMs: 0,
        retries: 0,
        status: "ERROR",
        error: errorMsg,
      });

      // If the error is about image support, retry without the image
      const isVisionError =
        includeImage &&
        (errorMsg.includes("image input") ||
          errorMsg.includes("vision") ||
          errorMsg.includes("multimodal") ||
          errorMsg.includes("does not support"));

      if (isVisionError) {
        log(
          "👁️",
          `Vision not supported by ${provider.name}. Falling back to text-only...`
        );
        // Will retry the loop iteration with includeImage = false
        continue;
      }

      // For any other error, throw it upward
      throw err;
    }
  }

  // Should not reach here, but safety fallback
  return {
    reasoning: "Failed to get a response from the LLM after retries.",
    status: "error",
    actions: [],
    result: null,
    _raw: "",
    _usedVision: false,
    _provider: provider.name,
  };
}

/**
 * Get the name of the currently active LLM provider (for external logging).
 */
export function getActiveProviderName(): string {
  return provider.name;
}

/**
 * Get the configured model name (for external logging).
 */
export function getModelName(): string {
  return MODEL;
}
