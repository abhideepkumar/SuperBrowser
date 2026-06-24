import { execFile } from "child_process";
import * as util from "util";
import { getEncoding } from "js-tiktoken";

const execFileAsync = util.promisify(execFile);

// Shared tokenizer instance (using o200k_base which is standard for GPT-4o)
// It's a close enough approximation for Claude and Nvidia models as well.
const tokenizer = getEncoding("o200k_base");

export interface SizedSnapshotResult {
  success: boolean;
  output: string;
  tokensUsed: number;
  compressionLevel: "safe" | "compact" | "depth_limit";
  error?: string;
}

/**
 * Utility to run an agent-browser command and return its stdout.
 */
async function runAgentBrowser(args: string[], timeoutMs = 30000): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const cmd = process.platform === "win32" ? "agent-browser.cmd" : "agent-browser";
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      timeout: timeoutMs,
      shell: process.platform === "win32",
    });
    if (stderr && stderr.toLowerCase().includes("error")) {
      return { success: false, output: stdout, error: stderr };
    }
    return { success: true, output: stdout };
  } catch (err: any) {
    return {
      success: false,
      output: err.stdout || "",
      error: err.stderr || err.message || "Unknown error",
    };
  }
}

/**
 * Get the AX Tree snapshot compressed natively to fit within the provided token budget.
 */
export async function getOptimizedSnapshot(
  tokenBudget: number,
  sessionId: string = "default"
): Promise<SizedSnapshotResult> {
  const baseArgs = ["--session-name", sessionId, "snapshot"];

  // Step 1: Safe Baseline (Interactive + Cursor-interactive)
  const safeRes = await runAgentBrowser([...baseArgs, "-i", "-C"]);
  if (!safeRes.success) {
    return { ...safeRes, tokensUsed: 0, compressionLevel: "safe" };
  }
  
  const safeTokens = tokenizer.encode(safeRes.output).length;
  if (safeTokens <= tokenBudget) {
    return {
      success: true,
      output: safeRes.output,
      tokensUsed: safeTokens,
      compressionLevel: "safe",
    };
  }

  // Step 2: Compact Structural Elements
  // Drops the -C (so we only get strictly interactive elements) and adds -c (compacts empty structures)
  const compactRes = await runAgentBrowser([...baseArgs, "-i", "-c"]);
  if (!compactRes.success) {
    // If the compact command fails for some reason, return the safe one anyway
    return { ...safeRes, tokensUsed: safeTokens, compressionLevel: "safe" };
  }

  const compactTokens = tokenizer.encode(compactRes.output).length;
  if (compactTokens <= tokenBudget) {
    return {
      success: true,
      output: compactRes.output,
      tokensUsed: compactTokens,
      compressionLevel: "compact",
    };
  }

  // Step 3: Aggressive Depth Limit
  // Capping depth to 5 flattens massive mega-menus or deep article structures
  const depthRes = await runAgentBrowser([...baseArgs, "-i", "-c", "-d", "5"]);
  if (!depthRes.success) {
    return { ...compactRes, tokensUsed: compactTokens, compressionLevel: "compact" };
  }

  const depthTokens = tokenizer.encode(depthRes.output).length;
  
  // Return this regardless of whether it fits. 
  // If it's STILL over budget, the Context Assembler will handle the hard truncation.
  return {
    success: true,
    output: depthRes.output,
    tokensUsed: depthTokens,
    compressionLevel: "depth_limit",
  };
}

/**
 * Expose token counting globally so the Assembler and Summarizer can use it.
 */
export function countTokens(text: string): number {
  return tokenizer.encode(text).length;
}
