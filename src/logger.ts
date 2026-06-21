import * as fs from "fs";
import * as path from "path";

// ─── Log File Setup ─────────────────────────────────────────────
const LOGS_DIR = path.resolve("logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Generate a timestamped filename: run_2026-06-19_17-35-20.log
const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const LOG_FILE = path.join(LOGS_DIR, `run_${timestamp}.log`);

// Open a write stream in append mode
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

/**
 * Get a formatted timestamp string for log entries.
 */
function getTimestamp(): string {
  return new Date().toLocaleTimeString();
}

/**
 * Write a line to the log file only (no console output).
 */
function writeToFile(line: string): void {
  logStream.write(line + "\n");
}

/**
 * Log a message with an icon to both console and the log file.
 */
export function log(icon: string, message: string): void {
  const time = getTimestamp();
  const consoleLine = `  ${icon}  [${time}] ${message}`;
  const fileLine = `[${time}] ${message}`;
  console.log(consoleLine);
  writeToFile(fileLine);
}

/**
 * Log a section header to both console and the log file.
 */
export function logSection(title: string): void {
  const separator = "─".repeat(60);
  console.log(`\n${separator}`);
  console.log(`  ${title}`);
  console.log(`${separator}`);

  writeToFile("");
  writeToFile(separator);
  writeToFile(`  ${title}`);
  writeToFile(separator);
}

/**
 * Log detailed data to the file only (not shown on console).
 * Use this for verbose data like full snapshots, raw LLM responses, etc.
 */
export function logDetail(label: string, data: string): void {
  writeToFile("");
  writeToFile(`┌── ${label} ${"─".repeat(Math.max(0, 54 - label.length))}┐`);
  writeToFile(data);
  writeToFile(`└${"─".repeat(58)}┘`);
  writeToFile("");
}

/**
 * Log an action result (browser command output) to the log file.
 */
export function logActionResult(action: string, success: boolean, output: string, error?: string): void {
  const status = success ? "SUCCESS" : "FAILED";
  writeToFile(`  [ACTION] ${action} → ${status}`);
  if (output) {
    writeToFile(`    stdout: ${output.substring(0, 500)}`);
  }
  if (error) {
    writeToFile(`    error:  ${error.substring(0, 500)}`);
  }
}

/**
 * Log the final result to both console and the log file.
 */
export function logResult(result: string | null): void {
  const text = result ?? "No result returned.";
  console.log("\n  Result:\n");
  console.log(`  ${text}`);
  console.log();

  writeToFile("");
  writeToFile("  RESULT:");
  writeToFile(`  ${text}`);
  writeToFile("");
}

/**
 * Log an error to both console and the log file.
 */
export function logError(message: string, detail?: string): void {
  console.error(`\n  ${message}`);
  if (detail) console.error(`  ${detail}\n`);

  writeToFile("");
  writeToFile(`  ERROR: ${message}`);
  if (detail) writeToFile(`  DETAIL: ${detail}`);
  writeToFile("");
}

/**
 * Log the run configuration at startup.
 */
export function logConfig(config: Record<string, string>): void {
  writeToFile("");
  writeToFile("┌── RUN CONFIGURATION ──────────────────────────────────────┐");
  for (const [key, value] of Object.entries(config)) {
    // Mask API keys in the log file
    const masked = key.includes("KEY") ? value.substring(0, 12) + "..." : value;
    writeToFile(`  ${key}: ${masked}`);
  }
  writeToFile(`  LOG_FILE: ${LOG_FILE}`);
  writeToFile("└──────────────────────────────────────────────────────────┘");
  writeToFile("");
}

/**
 * Log a comprehensive LLM call summary to the log file.
 * Called after each LLM request completes (success or failure).
 */
export function logLLMCall(info: {
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
}): void {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  const tokensStr = info.tokensUsed
    ? `prompt=${info.tokensUsed.prompt ?? "?"}, completion=${info.tokensUsed.completion ?? "?"}, total=${info.tokensUsed.total ?? "?"}`
    : "(not reported)";

  writeToFile("");
  writeToFile(`┌── LLM CALL [Step ${info.step}] ${"─".repeat(Math.max(0, 44 - String(info.step).length))}┐`);
  writeToFile(`  PROVIDER: ${info.provider}`);
  writeToFile(`  MODEL: ${info.model}`);
  writeToFile(`  VISION: ${info.vision ? "yes" : "no"}`);
  writeToFile(`  INPUT_SIZE: ${info.inputSize} chars`);
  writeToFile(`  TIMESTAMP: ${timestamp}`);
  writeToFile(`  LATENCY: ${info.latencyMs}ms`);
  writeToFile(`  RETRIES: ${info.retries}`);
  writeToFile(`  TOKENS: ${tokensStr}`);
  writeToFile(`  STATUS: ${info.status}`);
  if (info.error) {
    writeToFile(`  ERROR: ${info.error}`);
  }
  writeToFile("└──────────────────────────────────────────────────────────┘");
  writeToFile("");
}

/**
 * Flush and close the log stream. Call before process exit.
 */
export function closeLog(): Promise<void> {
  return new Promise((resolve) => {
    logStream.end(() => resolve());
  });
}

/**
 * Get the path to the current log file.
 */
export function getLogFilePath(): string {
  return LOG_FILE;
}

