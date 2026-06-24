// ─── NVIDIA NIM Adapter ─────────────────────────────────────────
// Handles: NVIDIA NIM API (integrate.api.nvidia.com).
// Uses the OpenAI SDK since NIM exposes an OpenAI-compatible endpoint.
//
// Multi-key support:
//   NVIDIA_API_KEY=nvapi-primary
//   NVIDIA_API_KEY_2=nvapi-backup
//   NVIDIA_BASE_URL_2=https://alternate-nim-endpoint/v1  (optional per key)

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

const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

interface KeyConfig {
  apiKey: string;
  baseURL: string;
  label: string;
}

function normalizeBaseURL(url: string): string {
  return url
    .trim()
    .replace(/\/chat\/completions\/?$/, "")
    .replace(/\/chat\/?$/, "")
    .replace(/\/+$/, "");
}

function loadNvidiaKeys(): KeyConfig[] {
  const keys: KeyConfig[] = [];
  const defaultBase = normalizeBaseURL(
    process.env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL
  );

  // Primary key
  if (process.env.NVIDIA_API_KEY) {
    keys.push({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: defaultBase,
      label: "nvidia[key1]",
    });
  }

  // Additional numbered keys
  let i = 2;
  while (true) {
    const key = process.env[`NVIDIA_API_KEY_${i}`];
    if (!key) break;
    keys.push({
      apiKey: key,
      baseURL: normalizeBaseURL(
        process.env[`NVIDIA_BASE_URL_${i}`] || DEFAULT_NVIDIA_BASE_URL
      ),
      label: `nvidia[key${i}]`,
    });
    i++;
  }

  return keys;
}

/**
 * Adapter for NVIDIA NIM API with multi-key rotation support.
 * On 429 rate limit → rotates to next key immediately.
 * On 5xx / timeout → retries same key (up to 2 times) then rotates.
 * All keys exhausted → throws to trigger provider-level fallback.
 */
export class NvidiaAdapter implements LLMProvider {
  readonly name = "nvidia";
  private keys: KeyConfig[];
  private clients: OpenAI[];

  constructor() {
    this.keys = loadNvidiaKeys();

    if (this.keys.length === 0) {
      throw new Error(
        "NVIDIA_API_KEY is required when LLM_PROVIDER=nvidia. Set it in your .env file."
      );
    }

    this.clients = this.keys.map(
      (k) => new OpenAI({ apiKey: k.apiKey, baseURL: k.baseURL })
    );

    if (this.keys.length > 1) {
      serverLog(
        "🔑",
        `[nvidia] Loaded ${this.keys.length} API keys (will rotate on rate limit).`
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
    const MAX_RETRIES_PER_KEY = 2;

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
            { timeout: 60000 } // 60s — NIM models can be slow to cold-start
          );

          const content = response.choices[0]?.message?.content ?? "{}";
          const usage = response.usage;

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
            errorMsg.toLowerCase().includes("rate limit") ||
            errorMsg.toLowerCase().includes("too many requests");

          const isInvalidKey = status === 401 || status === 403;

          const isTransient =
            !status ||
            status >= 500 ||
            errorMsg.toLowerCase().includes("timeout") ||
            errorMsg.toLowerCase().includes("bad gateway") ||
            errorMsg.toLowerCase().includes("service unavailable") ||
            err.name === "APIConnectionTimeoutError" ||
            err.name === "APIConnectionError";

          if (isRateLimit || isInvalidKey) {
            const reason = isRateLimit ? "rate limited" : "invalid key";
            serverLog(
              "🔄",
              `[${keyLabel}] ${reason}.${
                keyIdx < this.keys.length - 1
                  ? ` Rotating to ${this.keys[keyIdx + 1].label}...`
                  : " No more keys."
              }`
            );
            break;
          }

          if (isTransient && keyAttempts <= MAX_RETRIES_PER_KEY) {
            const delay = Math.round(
              1500 * Math.pow(2, keyAttempts - 1) + Math.random() * 500
            );
            serverLog(
              "⏳",
              `[${keyLabel}] Transient error (attempt ${keyAttempts}/${MAX_RETRIES_PER_KEY}): ${errorMsg.trim()}. Retrying in ${delay}ms...`
            );
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          serverLog(
            "🔄",
            `[${keyLabel}] Exhausted retries.${
              keyIdx < this.keys.length - 1
                ? ` Rotating to ${this.keys[keyIdx + 1].label}...`
                : " No more keys."
            }`
          );
          break;
        }
      }
    }

    throw new Error(
      `[nvidia] All ${this.keys.length} API key(s) failed. Triggering provider fallback.`
    );
  }
}
