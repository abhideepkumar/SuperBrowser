import { z } from "zod";

// ─── Zod Schema for LLM Response Validation ──────────────────────
// Every response from the LLM is validated against this schema before
// it ever touches the action executor. This prevents silent misparsing.

const AgentActionSchema = z.object({
  type: z.enum([
    "click", "fill", "select", "navigate", "scroll", "hover",
    "wait", "upload", "extract_table", "scrape_to_cloud",
    "assert_visible", "press_key", "clear", "drag_drop", "execute_js",
  ]),
  ref: z.string().optional(),
  value: z.string().optional(),
  toRef: z.string().optional(),
  timeout: z.number().optional(),
  destination: z.string().optional(),
});

export const LLMResponseSchema = z.object({
  reasoning: z.string().default("No reasoning provided."),
  status: z.enum(["continue", "done", "error", "ask_user"]).default("error"),
  actions: z.array(AgentActionSchema).default([]),
  result: z.string().nullable().default(null),
  options: z.array(z.string()).optional(),
});

export type ValidatedLLMResponse = z.infer<typeof LLMResponseSchema>;
