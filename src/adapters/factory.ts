// ─── LLM Provider Factory ───────────────────────────────────────
// Creates the correct adapter based on the LLM_PROVIDER env var,
// with an optional runtime override for dynamic provider switching.

import { config } from "dotenv";
import type { LLMProvider } from "../types.js";
import { OpenAIAdapter } from "./openai.js";
import { NvidiaAdapter } from "./nvidia.js";
import { LlamaCppAdapter } from "./llamacpp.js";

config();

/**
 * Supported provider names.
 */
export type ProviderName = "openai" | "nvidia" | "llamacpp";

/**
 * Create an LLM provider adapter.
 *
 * Resolution order:
 *   1. `override` argument (used for per-run dynamic switching)
 *   2. `LLM_PROVIDER` environment variable
 *   3. Default: "openai"
 *
 * Throws an Error on unknown/misconfigured providers — never calls process.exit().
 *
 * Supported values:
 *   "openai"   — OpenAI, OpenRouter, or any OpenAI-compatible API
 *   "nvidia"   — NVIDIA NIM API
 *   "llamacpp" — Local llama.cpp server (or compatible: Ollama, LM Studio, vLLM)
 */
export function createProvider(override?: string): LLMProvider {
  const provider = (
    override ||
    process.env.LLM_PROVIDER ||
    "openai"
  ).toLowerCase();

  switch (provider) {
    case "openai":
      return new OpenAIAdapter();

    case "nvidia":
      return new NvidiaAdapter();

    case "llamacpp":
      return new LlamaCppAdapter();

    default:
      throw new Error(
        `Unknown LLM_PROVIDER: "${provider}". ` +
          `Supported values: openai, nvidia, llamacpp`
      );
  }
}

/**
 * Get the resolved provider name from env (or override), for display/logging.
 */
export function getProviderName(override?: string): string {
  return (override || process.env.LLM_PROVIDER || "openai").toLowerCase();
}
