// ─── LLM Provider Factory ───────────────────────────────────────
// Creates the correct adapter based on the LLM_PROVIDER env var.

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
 * Create an LLM provider adapter based on the LLM_PROVIDER environment variable.
 *
 * Supported values:
 * - "openai"   — OpenAI, OpenRouter, or any OpenAI-compatible API
 * - "nvidia"   — NVIDIA NIM API
 * - "llamacpp" — Local llama.cpp server (or compatible: Ollama, LM Studio, vLLM)
 *
 * Defaults to "openai" if LLM_PROVIDER is not set.
 */
export function createProvider(): LLMProvider {
  const provider = (
    process.env.LLM_PROVIDER || "openai"
  ).toLowerCase() as string;

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
 * Get the resolved provider name from the environment (for logging).
 */
export function getProviderName(): string {
  return (process.env.LLM_PROVIDER || "openai").toLowerCase();
}
