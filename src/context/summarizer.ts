import { createProvider } from "../adapters/factory.js";
import { countTokens } from "./snapshot.js";
import { serverLog } from "../logger.js";

/**
 * Maintains a compressed memory of what the agent has done.
 * Keeps the last N actions verbatim and uses an LLM to semantically compress older ones.
 * Implements "Error Pinning" to prevent infinite loops.
 */
export class ActionMemoryManager {
  private verbatimBuffer: string[] = [];
  private compactSummary: string = "";
  private pinnedError: string | null = null;
  
  // How many actions to keep verbatim before triggering compression
  private readonly VERBATIM_WINDOW = 3;

  /**
   * Add a new action to the memory buffer.
   * If it's an error, it gets pinned so the LLM doesn't forget it.
   * If the buffer gets too long, it triggers auto-compaction.
   */
  async add(actionText: string, success: boolean, errorMessage?: string): Promise<void> {
    if (!success && errorMessage) {
      this.pinnedError = errorMessage;
    } else {
      this.pinnedError = null;
    }

    this.verbatimBuffer.push(actionText);

    if (this.verbatimBuffer.length > this.VERBATIM_WINDOW) {
      await this.compactOldest();
    }
  }

  /**
   * Spawns a fast LLM call to semantically compress the oldest action into the summary.
   */
  private async compactOldest(): Promise<void> {
    const oldestAction = this.verbatimBuffer.shift();
    if (!oldestAction) return;

    // Fast, cheap model for summarization if available, else just use default
    const provider = createProvider();

    const prompt = `You are the memory manager for an AI browser agent. 
Update the ongoing memory summary by incorporating the new action.

CURRENT SUMMARY:
${this.compactSummary || "No previous actions."}

NEW ACTION TO INCORPORATE:
${oldestAction}

INSTRUCTIONS:
- Write a single, concise paragraph (max 3 sentences) summarizing what has been accomplished so far.
- Focus ONLY on state changes (e.g., "Navigated to home, searched for shoes, and clicked the first result").
- Do NOT include your own thoughts, just the compressed facts.`;

    try {
      const result = await provider.chat(
        [
          { role: "system", content: "You are a highly concise memory compression algorithm." },
          { role: "user", content: prompt }
        ],
        { 
          model: process.env.MODEL_NAME || "gpt-4o", 
          max_tokens: 150,
          temperature: 0.1 
        }
      );
      this.compactSummary = result.content.trim();
      serverLog("🧠", `Auto-compacted memory: ${this.compactSummary}`);
    } catch (err: any) {
      serverLog("⚠️", `Memory compaction failed: ${err.message}. Falling back to basic append.`);
      // Fallback if LLM call fails (e.g., rate limit)
      this.compactSummary = this.compactSummary 
        ? `${this.compactSummary} → ${oldestAction}` 
        : oldestAction;
        
      if (this.compactSummary.length > 1000) {
         // Smart truncation: preserve the oldest context (start) and newest context (end)
         const oldest = this.compactSummary.substring(0, 250);
         const newest = this.compactSummary.substring(this.compactSummary.length - 250);
         this.compactSummary = `${oldest}\n... [middle history truncated] ...\n${newest}`;
      }
    }
  }

  /**
   * Formats the memory exactly for injection into the Assembler.
   */
  getHistoryPayload(): string {
    const parts: string[] = [];
    
    if (this.compactSummary) {
      parts.push(`PREVIOUS CONTEXT:\n${this.compactSummary}`);
    }

    if (this.verbatimBuffer.length > 0) {
      parts.push(`RECENT ACTIONS:\n${this.verbatimBuffer.map((a, i) => `${i + 1}. ${a}`).join('\n')}`);
    } else {
      parts.push("RECENT ACTIONS:\nNone.");
    }

    if (this.pinnedError) {
      parts.push(`IMMEDIATE FEEDBACK (CRITICAL):\nYour last action failed: ${this.pinnedError}\nYou MUST fix this error on your next turn.`);
    }

    return parts.join('\n\n');
  }

  /**
   * Expose exact token count of the payload for the Assembler.
   */
  getTokenCount(): number {
    return countTokens(this.getHistoryPayload());
  }
}
