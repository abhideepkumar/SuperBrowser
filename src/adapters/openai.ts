// ─── OpenAI / OpenRouter Adapter ────────────────────────────────
// Handles: OpenAI direct, OpenRouter, and any OpenAI-compatible API.

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

/**
 * Adapter for OpenAI-compatible APIs (OpenAI, OpenRouter, etc.).
 * Includes exponential backoff retry for 429 rate limits and transient errors.
 */
export class OpenAIAdapter implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor() {
    let baseURL = process.env.OPENAI_BASE_URL || undefined;
    if (baseURL) {
      // Strip trailing slashes and '/chat/completions' or '/chat' to handle user misconfigurations
      baseURL = baseURL
        .trim()
        .replace(/\/chat\/completions\/?$/, "")
        .replace(/\/chat\/?$/, "")
        .replace(/\/+$/, "");
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL,
    });
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): Promise<ChatResult> {
    const maxRetries = 4;
    const initialDelayMs = 2000;
    let attempt = 0;
    let totalRetries = 0;
    const startTime = Date.now();

    // Cast messages to OpenAI's expected type (they are structurally compatible)
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
            timeout: 45000, // 45 seconds timeout per request
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

        const isRateLimit =
          status === 429 ||
          errorMsg.includes("429") ||
          errorMsg.toLowerCase().includes("rate limit") ||
          errorMsg.toLowerCase().includes("too many requests");

        const isTransient =
          !status ||
          status >= 500 ||
          errorMsg.includes("500") ||
          errorMsg.includes("502") ||
          errorMsg.includes("503") ||
          errorMsg.includes("504") ||
          errorMsg.toLowerCase().includes("timeout") ||
          errorMsg.toLowerCase().includes("bad gateway") ||
          errorMsg.toLowerCase().includes("service unavailable") ||
          err.name === "APIConnectionTimeoutError" ||
          err.name === "APIConnectionError";

        if ((isRateLimit || isTransient) && attempt <= maxRetries) {
          // Exponential backoff with random jitter
          const baseDelay = initialDelayMs * Math.pow(2.5, attempt - 1);
          const jitter = Math.random() * 1000;
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
