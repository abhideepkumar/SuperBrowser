import * as fs from "fs";
import * as path from "path";

// ─── Log Directory Setup ─────────────────────────────────────────
const LOGS_DIR = path.resolve("logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function makeTimestampFilename(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

export interface LLMCallInfo {
  step: number;
  provider: string;
  model: string;
  vision: boolean;
  inputSize: number;
  latencyMs: number;
  retries: number;
  tokensUsed?: { prompt?: number; completion?: number; total?: number };
  status: "SUCCESS" | "ERROR";
  error?: string;
}

// ─── Per-Run Logger Class ────────────────────────────────────────
/**
 * RunLogger is instantiated once per agent run. Each instance writes to
 * its own isolated log file, preventing data corruption across concurrent
 * or sequential runs sharing the same process.
 */
export class RunLogger {
  private readonly logStream: fs.WriteStream;
  readonly logFilePath: string;

  constructor(runId: string) {
    this.logFilePath = path.join(LOGS_DIR, `run_${runId}.log`);
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: "a" });
  }

  // ── Private helpers ────────────────────────────────────────────

  private getTimestamp(): string {
    return new Date().toLocaleTimeString();
  }

  private write(line: string): void {
    this.logStream.write(line + "\n");
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Log a message with an icon to both console and the run's log file.
   */
  log(icon: string, message: string): void {
    const time = this.getTimestamp();
    console.log(`  ${icon}  [${time}] ${message}`);
    this.write(`[${time}] ${message}`);
  }

  /**
   * Log a section header to both console and the log file.
   */
  logSection(title: string): void {
    const separator = "─".repeat(60);
    console.log(`\n${separator}`);
    console.log(`  ${title}`);
    console.log(`${separator}`);
    this.write("");
    this.write(separator);
    this.write(`  ${title}`);
    this.write(separator);
  }

  /**
   * Log detailed data to the file only (not shown on console).
   * Use this for verbose data like full snapshots, raw LLM responses, etc.
   */
  logDetail(label: string, data: string): void {
    this.write("");
    this.write(`┌── ${label} ${"─".repeat(Math.max(0, 54 - label.length))}┐`);
    this.write(data);
    this.write(`└${"─".repeat(58)}┘`);
    this.write("");
  }

  /**
   * Log a browser action result to the log file.
   */
  logActionResult(
    action: string,
    success: boolean,
    output: string,
    error?: string
  ): void {
    const status = success ? "SUCCESS" : "FAILED";
    this.write(`  [ACTION] ${action} → ${status}`);
    if (output) this.write(`    stdout: ${output.substring(0, 500)}`);
    if (error) this.write(`    error:  ${error.substring(0, 500)}`);
  }

  /**
   * Log the final result to both console and the log file.
   */
  logResult(result: string | null): void {
    const text = result ?? "No result returned.";
    console.log("\n  Result:\n");
    console.log(`  ${text}`);
    console.log();
    this.write("");
    this.write("  RESULT:");
    this.write(`  ${text}`);
    this.write("");
  }

  /**
   * Log an error to both console and the log file.
   */
  logError(message: string, detail?: string): void {
    console.error(`\n  ${message}`);
    if (detail) console.error(`  ${detail}\n`);
    this.write("");
    this.write(`  ERROR: ${message}`);
    if (detail) this.write(`  DETAIL: ${detail}`);
    this.write("");
  }

  /**
   * Log the run configuration at startup.
   */
  logConfig(config: Record<string, string>): void {
    this.write("");
    this.write("┌── RUN CONFIGURATION ──────────────────────────────────────┐");
    for (const [key, value] of Object.entries(config)) {
      const masked = key.includes("KEY") ? value.substring(0, 12) + "..." : value;
      this.write(`  ${key}: ${masked}`);
    }
    this.write(`  LOG_FILE: ${this.logFilePath}`);
    this.write("└──────────────────────────────────────────────────────────┘");
    this.write("");
  }

  /**
   * Log a comprehensive LLM call summary block.
   */
  logLLMCall(info: LLMCallInfo): void {
    const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
    const tokensStr = info.tokensUsed
      ? `prompt=${info.tokensUsed.prompt ?? "?"}, completion=${info.tokensUsed.completion ?? "?"}, total=${info.tokensUsed.total ?? "?"}`
      : "(not reported)";

    this.write("");
    this.write(`┌── LLM CALL [Step ${info.step}] ${"─".repeat(Math.max(0, 44 - String(info.step).length))}┐`);
    this.write(`  PROVIDER:   ${info.provider}`);
    this.write(`  MODEL:      ${info.model}`);
    this.write(`  VISION:     ${info.vision ? "yes" : "no"}`);
    this.write(`  INPUT_SIZE: ${info.inputSize} chars`);
    this.write(`  TIMESTAMP:  ${timestamp}`);
    this.write(`  LATENCY:    ${info.latencyMs}ms`);
    this.write(`  RETRIES:    ${info.retries}`);
    this.write(`  TOKENS:     ${tokensStr}`);
    this.write(`  STATUS:     ${info.status}`);
    if (info.error) this.write(`  ERROR:      ${info.error}`);
    this.write("└──────────────────────────────────────────────────────────┘");
    this.write("");
  }

  /**
   * Flush and close the log stream. MUST be called before a run ends.
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      this.logStream.end(() => resolve());
    });
  }
}

// ─── Server-Level (Non-Run) Logging ─────────────────────────────
/**
 * Simple global logger for server startup messages and non-run events.
 * Does NOT write to file — server-level logs go to stdout/stderr only.
 */
export function serverLog(icon: string, message: string): void {
  const time = new Date().toLocaleTimeString();
  console.log(`  ${icon}  [${time}] ${message}`);
}

// ─── Convenience factory ─────────────────────────────────────────
/**
 * Create a RunLogger using the current timestamp as the run ID.
 * Use this for CLI runs where no explicit run ID is provided.
 */
export function createTimestampLogger(): RunLogger {
  return new RunLogger(makeTimestampFilename());
}
