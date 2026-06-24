// ─── OpenAI / OpenRouter Adapter ────────────────────────────────
// Handles: OpenAI direct, OpenRouter, and any OpenAI-compatible API.
//
// Multi-key support:
//   OPENAI_API_KEY=sk-primary-key
//   OPENAI_API_KEY_2=sk-backup-key
//   OPENAI_API_KEY_3=sk-third-key
//   OPENAI_BASE_URL_2=https://different-endpoint.com/v1  (optional per key)
//
// On rate limit (429) → immediately rotates to next key (no wait).
// On server error (5xx) → retries on same key with backoff, then rotates.
// When all keys exhausted → throws to trigger provider-level fallback.

import OpenAI from "openai";
import { config } from "dotenv";
import type {
  LLMProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
} from "../types.js";
import { serverLog } from "../logger.js";

config();

interface KeyConfig {
  apiKey: string;
  baseURL?: string;
  label: string; // e.g. "openai[key1]", "openai[key2]"
}

/**
 * Load all configured API keys for OpenAI-compatible providers.
 * Primary key:  OPENAI_API_KEY  + OPENAI_BASE_URL (optional)
 * Extra keys:   OPENAI_API_KEY_2 + OPENAI_BASE_URL_2 (optional)
 *               OPENAI_API_KEY_3 + OPENAI_BASE_URL_3 (optional)
 *               ... (no limit)
 */
function loadOpenAIKeys(): KeyConfig[] {
  const keys: KeyConfig[] = [];

  // Primary key
  const primaryKey = process.env.OPENAI_API_KEY;
  if (primaryKey) {
    keys.push({
      apiKey: primaryKey,
      baseURL: normalizeBaseURL(process.env.OPENAI_BASE_URL),
      label: "openai[key1]",
    });
  }

  // Additional numbered keys: OPENAI_API_KEY_2, OPENAI_API_KEY_3, ...
  let i = 2;
  while (true) {
    const key = process.env[`OPENAI_API_KEY_${i}`];
    if (!key) break;
    keys.push({
      apiKey: key,
      // Each extra key can optionally point to a different base URL
      // (e.g., key2 = OpenRouter, key3 = Azure OpenAI endpoint)
      baseURL: normalizeBaseURL(
        process.env[`OPENAI_BASE_URL_${i}`] || process.env.OPENAI_BASE_URL
      ),
      label: `openai[key${i}]`,
    });
    i++;
  }

  return keys;
}

function normalizeBaseURL(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url
    .trim()
    .replace(/\/chat\/completions\/?$/, "")
    .replace(/\/chat\/?$/, "")
    .replace(/\/+$/, "");
}

/**
 * Adapter for OpenAI-compatible APIs (OpenAI, OpenRouter, Azure OpenAI, etc.).
 *
 * Supports multiple API keys with automatic rotation:
 *   - 429 rate limit  → switch to next key immediately
 *   - 5xx / timeout   → retry same key (up to 2 times), then switch key
 *   - All keys failed → throw (triggers provider-level fallback in FallbackChain)
 */
export class OpenAIAdapter implements LLMProvider {
  readonly name = "openai";
  private keys: KeyConfig[];
  private clients: OpenAI[];

  constructor() {
    this.keys = loadOpenAIKeys();

    if (this.keys.length === 0) {
      throw new Error(
        "No OpenAI API key found. Set OPENAI_API_KEY in your .env file."
      );
    }

    // Pre-build one OpenAI client per key
    this.clients = this.keys.map(
      (k) => new OpenAI({ apiKey: k.apiKey, baseURL: k.baseURL })
    );

    if (this.keys.length > 1) {
      serverLog(
        "🔑",
        `[openai] Loaded ${this.keys.length} API keys (will rotate on rate limit).`
      );
    }
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): Promise<ChatResult> {
    const openaiMessages =
      messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    const startTime = Date.now();
    let totalRetries = 0;
    const MAX_RETRIES_PER_KEY = 2; // 5xx retries before rotating key

    // Try each key in order
    for (let keyIdx = 0; keyIdx < this.keys.length; keyIdx++) {
      const keyLabel = this.keys[keyIdx].label;
      const client = this.clients[keyIdx];
      let keyAttempts = 0;

      while (keyAttempts <= MAX_RETRIES_PER_KEY) {
        try {
          const response = await client.chat.completions.create(
            {
              model: options.model,
              messages: openaiMessages,
              temperature: options.temperature ?? 0.1,
              max_tokens: options.max_tokens ?? 1024,
              response_format: options.response_format,
            },
            { timeout: 45000 }
          );

          const content = response.choices[0]?.message?.content ?? "{}";
          const usage = response.usage;

          // Log if we had to rotate keys
          if (keyIdx > 0) {
            serverLog("✅", `[${keyLabel}] Succeeded after key rotation.`);
          }

          return {
            content,
            provider: this.name,
            model: options.model,
            latencyMs: Date.now() - startTime,
            retries: totalRetries,
            tokensUsed: usage
              ? {
                  prompt: usage.prompt_tokens,
                  completion: usage.completion_tokens,
                  total: usage.total_tokens,
                }
              : undefined,
          };
        } catch (err: any) {
          totalRetries++;
          keyAttempts++;

          const status = err.status || err.statusCode;
          const errorMsg = err.message || String(err);

          const isRateLimit =
            status === 429 ||
            errorMsg.includes("429") ||
            errorMsg.toLowerCase().includes("rate limit") ||
            errorMsg.toLowerCase().includes("too many requests");

          const isTransient =
            !status ||
            status >= 500 ||
            errorMsg.toLowerCase().includes("timeout") ||
            errorMsg.toLowerCase().includes("bad gateway") ||
            errorMsg.toLowerCase().includes("service unavailable") ||
            err.name === "APIConnectionTimeoutError" ||
            err.name === "APIConnectionError";

          const isFatal =
            status === 400 || // Bad request (wrong model name, etc.)
            status === 401 || // Invalid API key — rotate immediately
            status === 403;   // Forbidden

          if (isRateLimit || status === 401) {
            // Rate limited or invalid key → skip remaining retries for this key
            const reason = isRateLimit ? "rate limited" : "invalid key";
            serverLog(
              "🔄",
              `[${keyLabel}] ${reason}.${
                keyIdx < this.keys.length - 1
                  ? ` Rotating to ${this.keys[keyIdx + 1].label}...`
                  : " No more keys."
              }`
            );
            break; // Break inner while → advance to next key
          }

          if (isTransient && keyAttempts <= MAX_RETRIES_PER_KEY) {
            // Transient server error → retry same key with backoff
            const delay =
              Math.round(1500 * Math.pow(2, keyAttempts - 1) + Math.random() * 500);
            serverLog(
              "⏳",
              `[${keyLabel}] Transient error (attempt ${keyAttempts}/${MAX_RETRIES_PER_KEY}): ${errorMsg.trim()}. Retrying in ${delay}ms...`
            );
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          if (isFatal && !isRateLimit && status !== 401) {
            // Hard failure (bad request) — not key-related, throw immediately
            throw err;
          }

          // All retries on this key exhausted → rotate to next key
          serverLog(
            "🔄",
            `[${keyLabel}] Exhausted retries: ${errorMsg.trim()}.${
              keyIdx < this.keys.length - 1
                ? ` Rotating to ${this.keys[keyIdx + 1].label}...`
                : " No more keys."
            }`
          );
          break; // Break inner while → advance to next key
        }
      }
    }

    // All keys exhausted — throw so FallbackChain can try the next provider
    throw new Error(
      `[openai] All ${this.keys.length} API key(s) failed. Triggering provider fallback.`
    );
  }
}
