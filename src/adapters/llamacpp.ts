// ─── llama.cpp / Local Server Adapter ───────────────────────────
// Handles: llama.cpp server, Ollama, LM Studio, vLLM, or any local
// server exposing an OpenAI-compatible /v1/chat/completions endpoint.
// Uses raw fetch() — no OpenAI SDK dependency for local inference.

import { config } from "dotenv";
import type {
  LLMProvider,
  ChatMessage,
  ChatOptions,
  ChatResult,
} from "../types.js";

config();

const DEFAULT_LLAMACPP_URL = "http://localhost:8080";

/**
 * Adapter for local llama.cpp-compatible servers.
 * Uses raw fetch() to avoid SDK dependency for local inference.
 * No retry logic — local servers don't have rate limits.
 */
export class LlamaCppAdapter implements LLMProvider {
  readonly name = "llamacpp";
  private baseURL: string;

  constructor() {
    let url = process.env.LLAMACPP_URL || DEFAULT_LLAMACPP_URL;
    // Normalize: strip trailing slashes and any trailing path segments
    url = url
      .trim()
      .replace(/\/chat\/completions\/?$/, "")
      .replace(/\/chat\/?$/, "")
      .replace(/\/v1\/?$/, "")
      .replace(/\/+$/, "");
    this.baseURL = url;
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): Promise<ChatResult> {
    const startTime = Date.now();
    const model = process.env.LLAMACPP_MODEL || options.model || "local-model";

    const endpoint = `${this.baseURL}/v1/chat/completions`;

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.max_tokens ?? 1024,
    };

    // Only include response_format if specified — some local servers don't support it
    if (options.response_format) {
      body.response_format = options.response_format;
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000), // 120 seconds — local models can be slow
      });
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      if (
        errorMsg.includes("ECONNREFUSED") ||
        errorMsg.includes("fetch failed")
      ) {
        throw new Error(
          `Cannot connect to local LLM server at ${this.baseURL}. ` +
            `Make sure llama.cpp server (or compatible) is running.\n` +
            `Start it with: ./llama-server -m your-model.gguf --port 8080`
        );
      }
      throw err;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(no body)");
      throw new Error(
        `Local LLM server returned ${response.status}: ${errorBody}`
      );
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const content = data.choices?.[0]?.message?.content ?? "{}";
    const usage = data.usage;

    return {
      content,
      provider: this.name,
      model,
      latencyMs: Date.now() - startTime,
      retries: 0, // No retries for local server
      tokensUsed: usage
        ? {
            prompt: usage.prompt_tokens,
            completion: usage.completion_tokens,
            total: usage.total_tokens,
          }
        : undefined,
    };
  }
}
