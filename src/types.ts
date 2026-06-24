// ─── Shared Types for the LLM Adapter Pattern ──────────────────
// These interfaces decouple the agent logic from any specific LLM provider.

/**
 * A single content part within a chat message.
 * Supports both text and image (vision) inputs.
 */
export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail: "low" | "high" };
}

/**
 * A chat message in the OpenAI-compatible format.
 * Content can be a plain string or an array of ContentParts (for vision).
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

/**
 * Options passed to the LLM provider for a chat completion request.
 */
export interface ChatOptions {
  model: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

/**
 * The result returned by an LLM provider after a chat completion.
 * Contains the raw response text plus metadata for logging.
 */
export interface ChatResult {
  /** The raw text content returned by the LLM */
  content: string;
  /** Which adapter handled this request */
  provider: string;
  /** The model that was used */
  model: string;
  /** Wall-clock time for the entire request (including retries) in ms */
  latencyMs: number;
  /** How many retry attempts were made before success */
  retries: number;
  /** Optional token usage information (if the provider returns it) */
  tokensUsed?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
}

/**
 * The contract that every LLM provider adapter must implement.
 */
export interface LLMProvider {
  /** Human-readable name of this provider (e.g., "openai", "nvidia", "llamacpp") */
  readonly name: string;

  /**
   * Send a chat completion request to the provider.
   * The adapter is responsible for retries, timeouts, and error handling.
   */
  chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult>;
}

// ─── Agent-Level Types (unchanged from original llm.ts) ─────────

/**
 * A browser action that the LLM has decided to execute.
 */
export interface AgentAction {
  type:
    | "click"
    | "fill"
    | "select"
    | "navigate"
    | "scroll"
    | "hover"
    | "wait"
    | "upload"
    | "extract_table"
    | "scrape_to_cloud"
    | "assert_visible"
    | "press_key"
    | "clear"
    | "drag_drop"
    | "execute_js";
  ref?: string;
  value?: string;
  toRef?: string;
  timeout?: number;
  destination?: string;
}

/**
 * The structured response from the LLM planning step.
 * Parsed from the raw JSON returned by the model.
 */
export interface LLMResponse {
  reasoning: string;
  status: "continue" | "done" | "error" | "ask_user";
  actions: AgentAction[];
  result: string | null;
  /** Optional suggested answer choices (for ask_user status) */
  options?: string[];
  /** The raw string returned by the LLM (for logging) */
  _raw?: string;
  /** Whether the screenshot was actually used in the request */
  _usedVision?: boolean;
  /** Which provider handled the request */
  _provider?: string;
  /** Latency of the LLM call in ms */
  _latencyMs?: number;
  /** Number of retries before success */
  _retries?: number;
  /** Token usage from the provider */
  _tokensUsed?: {
    prompt?: number;
    completion?: number;
    total?: number;
  };
}
