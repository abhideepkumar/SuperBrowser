import { ChatMessage, ContentPart } from "../types.js";
import { countTokens, getOptimizedSnapshot } from "./snapshot.js";
import { ActionMemoryManager } from "./summarizer.js";
import { serverLog } from "../logger.js";


// A 1080p high-res image costs exactly 1105 tokens in OpenAI's pricing model.
// We reserve 1200 to be perfectly safe across all providers.
const VISION_TOKEN_RESERVE = 1200;

// Hard requirement: always leave room for the LLM to reply without getting cut off.
const RESPONSE_RESERVE = 2048;

export interface AssemblerParams {
  systemPrompt: string;
  sanitizedGoal: string;
  memory: ActionMemoryManager;
  enableVision: boolean;
  screenshotPath?: string;
  sessionId?: string;
}

export interface AssembledContext {
  messages: ChatMessage[];
  contextReport: string;
}

/**
 * Deterministically assembles the exact LLM prompt.
 * Calculates exact token counts and iteratively compresses the AX tree so it never crashes.
 */
export async function assembleContext(params: AssemblerParams): Promise<AssembledContext> {
  // 1. Get max limit from environment or default to a safe 32k.
  const maxTokens = Number(process.env.LLM_CONTEXT_WINDOW) || 32000;

  // 2. Reserve tokens for the LLM response and vision (if active)
  let budgetRemaining = maxTokens - RESPONSE_RESERVE;
  if (params.enableVision && params.screenshotPath) {
    budgetRemaining -= VISION_TOKEN_RESERVE;
  }

  // 3. Calculate exact tokens for fixed strings
  const systemTokens = countTokens(params.systemPrompt);
  const goalText = `## USER GOAL\n${params.sanitizedGoal}`;
  const goalTokens = countTokens(goalText);

  let historyText = `## WHAT I HAVE DONE SO FAR\n${params.memory.getHistoryPayload()}`;
  let historyTokens = countTokens(historyText);

  // Enforce a hard cap on history to prevent context overflow (max 25% of window)
  const maxHistoryTokens = Math.floor(maxTokens * 0.25);
  if (historyTokens > maxHistoryTokens) {
    const safeCharLength = Math.floor(maxHistoryTokens * (historyText.length / historyTokens));
    // Keep the most recent history by slicing from the end
    historyText = "..." + historyText.substring(historyText.length - safeCharLength);
    historyTokens = countTokens(historyText);
  }

  // Subtract fixed strings from the budget
  budgetRemaining -= (systemTokens + goalTokens + historyTokens);

  // 4. Fetch the optimized AX Tree using the remaining budget
  // We leave a 500 token buffer just to be extremely safe.
  const axTreeBudget = Math.max(100, budgetRemaining - 500);
  const snapResult = await getOptimizedSnapshot(axTreeBudget, params.sessionId);

  let finalTreeText = snapResult.output;
  let finalTreeTokens = snapResult.tokensUsed;

  // 5. Ultimate Fallback: Hard Truncation
  // If the Sizer's most aggressive depth limit STILL exceeded the budget, we hard truncate it.
  if (finalTreeTokens > axTreeBudget) {
    // A crude but effective approximation: ratio of tokens vs characters.
    const charToTokenRatio = finalTreeText.length / finalTreeTokens;
    const safeCharLength = Math.floor(axTreeBudget * charToTokenRatio);

    const warning = "\n\n[... snapshot truncated due to size limits. Use scrolling or narrower search to see more ...]";
    finalTreeText = finalTreeText.substring(0, safeCharLength - warning.length) + warning;
    finalTreeTokens = countTokens(finalTreeText);
    serverLog("✂️", `AX Tree exceeded budget of ${axTreeBudget} tokens after all compression attempts. Hard truncating snapshot.`);

  }

  const pageStateText = `## CURRENT PAGE STATE\n${finalTreeText}`;

  // 6. Build User Message Content
  // If vision is enabled, we use the ContentPart array. Otherwise, just a string.
  let userContent: string | ContentPart[];

  const fullText = [goalText, historyText, pageStateText].join('\n\n');

  if (params.enableVision && params.screenshotPath) {
    // Note: The actual base64 injection is typically handled by the adapter later,
    // or we construct the image URL format here. For simplicity, we just pass the path
    // and let the adapter convert it, or assume it's pre-converted. 
    // In our architecture, the `vision` wrapper usually handles the base64 conversion.
    // So we just provide the structured ContentPart array.
    userContent = [
      { type: "text", text: fullText },
      { type: "image_url", image_url: { url: params.screenshotPath, detail: "high" } }
    ];
  } else {
    userContent = fullText;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: userContent }
  ];

  const totalUsed = systemTokens + goalTokens + historyTokens + finalTreeTokens + (params.enableVision ? VISION_TOKEN_RESERVE : 0);
  const usagePct = ((totalUsed / maxTokens) * 100).toFixed(1);

  const contextReport = `Context assembled: ${totalUsed}/${maxTokens} tokens (${usagePct}%). AX Tree: ${finalTreeTokens}t [${snapResult.compressionLevel}].`;

  return { messages, contextReport };
}
