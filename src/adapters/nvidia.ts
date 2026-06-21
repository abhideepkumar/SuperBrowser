// ─── NVIDIA NIM Adapter ─────────────────────────────────────────
// Handles: NVIDIA NIM API (integrate.api.nvidia.com).
// Uses the OpenAI SDK since NIM exposes an OpenAI-compatible endpoint.

import OpenAI from "openai";
import { config } from "dotenv";
import type {
  LLMProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
} from "../types.js";
import { log } from "../logger.js";

config();

const DEFAULT_NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * Adapter for NVIDIA NIM API.
 * NIM exposes an OpenAI-compatible /v1/chat/completions endpoint.
 * Uses moderate retry (NIM is usually reliable).
 */
export class NvidiaAdapter implements LLMProvider {
  readonly name = "nvidia";
  private client: OpenAI;

  constructor() {
    let baseURL =
      process.env.NVIDIA_BASE_URL || DEFAULT_NVIDIA_BASE_URL;

    // Strip trailing slashes and '/chat/completions' or '/chat' to handle user misconfigurations
    baseURL = baseURL
      .trim()
      .replace(/\/chat\/completions\/?$/, "")
      .replace(/\/chat\/?$/, "")
      .replace(/\/+$/, "");

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new Error(
        "NVIDIA_API_KEY is required when LLM_PROVIDER=nvidia. Set it in your .env file."
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): Promise<ChatResult> {
    const maxRetries = 2; // NIM is usually reliable, fewer retries needed
    const initialDelayMs = 1500;
    let attempt = 0;
    let totalRetries = 0;
    const startTime = Date.now();

    const openaiMessages =
      messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

    while (true) {
      try {
        const response = await this.client.chat.completions.create(
          {
            model: options.model,
            messages: openaiMessages,
            temperature: options.temperature ?? 0.1,
            max_tokens: options.max_tokens ?? 1024,
            response_format: options.response_format,
          },
          {
            timeout: 60000, // 60 seconds — NIM models can be slower to cold-start
          }
        );

        const content = response.choices[0]?.message?.content ?? "{}";
        const usage = response.usage;

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
        attempt++;
        totalRetries++;

        const status = err.status || err.statusCode;
        const errorMsg = err.message || String(err);

        const isTransient =
          status === 429 ||
          !status ||
          status >= 500 ||
          errorMsg.toLowerCase().includes("timeout") ||
          errorMsg.toLowerCase().includes("bad gateway") ||
          errorMsg.toLowerCase().includes("service unavailable") ||
          err.name === "APIConnectionTimeoutError" ||
          err.name === "APIConnectionError";

        if (isTransient && attempt <= maxRetries) {
          const baseDelay = initialDelayMs * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 500;
          const delay = Math.round(baseDelay + jitter);

          log(
            "⏳",
            `[${this.name}] LLM call failed (attempt ${attempt}/${maxRetries}): ${errorMsg.trim()}. Retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
  }
}
