// ─── LLM Provider Factory ───────────────────────────────────────
// Creates the correct adapter(s) based on LLM_PROVIDER env var,
// with an optional runtime override for dynamic provider switching.
//
// ── Single Provider ──────────────────────────────────────────────
//   LLM_PROVIDER=openai
//
// ── Provider-Level Fallback Chain (comma-separated) ──────────────
//   LLM_PROVIDER=openai,nvidia,llamacpp
//   → Tries OpenAI (with all its keys) first.
//   → If all OpenAI keys fail → tries NVIDIA (with all its keys).
//   → If NVIDIA fails → tries local LlamaCpp.
//
// ── Per-Provider Multi-Key (within each provider) ────────────────
//   OPENAI_API_KEY=sk-primary
//   OPENAI_API_KEY_2=sk-backup       ← tried if primary is rate limited
//   OPENAI_API_KEY_3=sk-third-backup ← tried if backup is also rate limited
//
//   NVIDIA_API_KEY=nvapi-primary
//   NVIDIA_API_KEY_2=nvapi-backup
//
// ── Full Resilience Example ──────────────────────────────────────
//   LLM_PROVIDER=openai,nvidia
//   OPENAI_API_KEY=sk-key1
//   OPENAI_API_KEY_2=sk-key2
//   NVIDIA_API_KEY=nvapi-key1
//
//   Execution order on failure:
//   openai[key1] → openai[key2] → nvidia[key1] → THROW

import { config } from "dotenv";
import type { LLMProvider, ChatMessage, ChatOptions, ChatResult } from "../types.js";
import { OpenAIAdapter } from "./openai.js";
import { NvidiaAdapter } from "./nvidia.js";
import { LlamaCppAdapter } from "./llamacpp.js";
import { serverLog } from "../logger.js";

config();

export type ProviderName = "openai" | "nvidia" | "llamacpp";

// ─── Fallback Chain ──────────────────────────────────────────────

/**
 * FallbackChain wraps multiple LLM providers and tries them in order.
 *
 * Each provider handles its OWN key-level rotation internally.
 * FallbackChain only steps in when an entire provider exhausts all its keys.
 *
 * This is transparent to the caller — it receives a single LLMProvider
 * and never needs to know how many providers or keys are underneath.
 */
class FallbackChain implements LLMProvider {
  readonly name: string;
  private providers: LLMProvider[];

  constructor(providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackChain requires at least one provider.");
    }
    this.providers = providers;
    // e.g. "openai→nvidia→llamacpp"
    this.name = providers.map((p) => p.name).join("→");
  }

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];

      try {
        const result = await provider.chat(messages, options);

        // Log if we had to fall back to a secondary provider
        if (i > 0) {
          serverLog(
            "✅",
            `[fallback] Provider "${provider.name}" succeeded after ${i} provider(s) failed.`
          );
        }

        return result;
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));

        const isLastProvider = i === this.providers.length - 1;
        if (isLastProvider) {
          serverLog(
            "❌",
            `[fallback] All providers exhausted. Last error from "${provider.name}": ${lastError.message}`
          );
        } else {
          serverLog(
            "⚠️",
            `[fallback] Provider "${provider.name}" failed: ${lastError.message}. Trying "${this.providers[i + 1].name}"...`
          );
        }
      }
    }

    throw lastError ?? new Error("[fallback] All LLM providers in the chain failed.");
  }
}

// ─── Provider Instantiation ──────────────────────────────────────

/**
 * Instantiate a single named provider. Throws on misconfiguration.
 * Each adapter handles its own multi-key loading internally.
 */
function instantiateProvider(name: string): LLMProvider {
  switch (name) {
    case "openai":
      return new OpenAIAdapter();
    case "nvidia":
      return new NvidiaAdapter();
    case "llamacpp":
      return new LlamaCppAdapter();
    default:
      throw new Error(
        `Unknown LLM provider: "${name}". Supported values: openai, nvidia, llamacpp`
      );
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Create the active LLM provider from config.
 *
 * Resolution order:
 *   1. `override` argument (used by server.ts for per-run dynamic switching)
 *   2. `LLM_PROVIDER` environment variable
 *   3. Default: "openai"
 *
 * Returns a single LLMProvider (or a FallbackChain that acts as one).
 * The caller never needs to know if it's a single provider or a chain.
 *
 * Throws an Error on unknown provider names — never calls process.exit().
 */
export function createProvider(override?: string): LLMProvider {
  const providerSpec = (
    override ||
    process.env.LLM_PROVIDER ||
    "openai"
  ).toLowerCase().trim();

  // Parse comma-separated provider names, strip whitespace
  const providerNames = providerSpec
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (providerNames.length === 0) {
    throw new Error("LLM_PROVIDER is empty. Set at least one provider.");
  }

  // Single provider — return directly (no FallbackChain overhead)
  if (providerNames.length === 1) {
    return instantiateProvider(providerNames[0]);
  }

  // Multiple providers — build a FallbackChain
  // Each provider is instantiated eagerly so config errors surface at startup
  const providers: LLMProvider[] = [];
  const failed: string[] = [];

  for (const name of providerNames) {
    try {
      providers.push(instantiateProvider(name));
    } catch (err: any) {
      // A provider might not be configured (missing API key)
      // Log it as a warning and skip — don't crash if at least one works
      serverLog(
        "⚠️",
        `[factory] Provider "${name}" skipped (not configured): ${err.message}`
      );
      failed.push(name);
    }
  }

  if (providers.length === 0) {
    throw new Error(
      `All providers in LLM_PROVIDER chain failed to initialize: ${failed.join(", ")}`
    );
  }

  if (providers.length === 1) {
    // Only one provider configured successfully — no chain needed
    return providers[0];
  }

  serverLog(
    "🔗",
    `[factory] LLM FallbackChain active: ${providers.map((p) => p.name).join(" → ")}` +
      (failed.length > 0 ? ` (skipped: ${failed.join(", ")})` : "")
  );

  return new FallbackChain(providers);
}

/**
 * Get the resolved provider spec string (for display/logging only).
 * Returns the raw comma-separated string, not the resolved chain.
 */
export function getProviderName(override?: string): string {
  return (override || process.env.LLM_PROVIDER || "openai").toLowerCase();
}
