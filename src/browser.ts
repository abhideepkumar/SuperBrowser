import { execFile } from "child_process";
import * as util from "util";
import * as fs from "fs";
import * as path from "path";
import { substituteAll } from "./credentials.js";

const execFileAsync = util.promisify(execFile);

export interface BrowserResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface SnapshotResult extends BrowserResult {}

function sessionArgs(sessionId?: string): string[] {
  return ["--session-name", sessionId || "default"];
}

/**
 * Executes agent-browser CLI using safely escaped argument arrays.
 * Bypasses string interpolation to completely eliminate shell injection risks.
 */
async function runCmd(
  args: string[],
  timeoutMs: number = 25000
): Promise<BrowserResult> {
  try {
    const cmd = process.platform === "win32" ? "agent-browser.cmd" : "agent-browser";
    const { stdout, stderr } = await execFileAsync(cmd, args, { 
      timeout: timeoutMs,
      shell: process.platform === "win32" // required on Windows for .cmd, Node safely escapes the args array
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
 * Initialize a browser session.
 */
export function initBrowser(sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "open", "about:blank"]);
}

/**
 * Close the browser session.
 */
export function close(sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "close"]);
}

/**
 * Close all active sessions.
 */
export function closeAllBrowsers(): Promise<BrowserResult> {
  return runCmd(["close", "--all"]);
}

/**
 * Open a specific URL.
 */
export function openUrl(url: string, sessionId: string = "default"): Promise<BrowserResult> {
  const safeUrl = substituteAll(url);
  return runCmd([...sessionArgs(sessionId), "open", safeUrl]);
}

/**
 * Take an accessibility tree snapshot (interactive elements only).
 */
export function snapshot(sessionId: string = "default"): Promise<SnapshotResult> {
  return runCmd([...sessionArgs(sessionId), "snapshot", "-i"]);
}

/**
 * Save a screenshot to disk.
 */
export function screenshot(filepath: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "screenshot", filepath]);
}

/**
 * Execute arbitrary JavaScript in the page context.
 */
export function execute(js: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "eval", js]);
}

// ─── Interaction Commands ────────────────────────────────────────

export function click(ref: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "click", ref]);
}

export function fill(ref: string, text: string, sessionId: string = "default"): Promise<BrowserResult> {
  const safeText = substituteAll(text);
  
  if (safeText.length > 5000 && process.platform === "win32") {
    console.warn("⚠️ WARNING: Payload exceeds 5000 chars. This may fail on Windows due to cmd.exe limits.");
  }
  
  return runCmd([...sessionArgs(sessionId), "fill", ref, safeText]);
}

export function selectOption(ref: string, value: string, sessionId: string = "default"): Promise<BrowserResult> {
  const safeValue = substituteAll(value);
  return runCmd([...sessionArgs(sessionId), "select", ref, safeValue]);
}

export function hover(ref: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "hover", ref]);
}

export function scrollIntoView(ref: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "scrollintoview", ref]);
}

export function waitForElement(selector: string, timeoutMs: number = 5000, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "wait", selector], timeoutMs + 2000);
}

export function pressKey(key: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "press", key]);
}

export function clear(ref: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "fill", ref, ""]);
}

export function uploadFile(ref: string, filePath: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "upload", ref, filePath], 30000);
}

export function dragDrop(fromRef: string, toRef: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "drag", fromRef, toRef]);
}

export function scroll(direction: "up" | "down", sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "scroll", direction]);
}

export function clickAtCoordinates(x: number, y: number, sessionId: string = "default"): Promise<BrowserResult> {
  const js = `document.elementFromPoint(${x}, ${y})?.click()`;
  return execute(js, sessionId);
}

export function typeAtFocus(text: string, sessionId: string = "default"): Promise<BrowserResult> {
  return runCmd([...sessionArgs(sessionId), "keyboard", "type", text]);
}

// ─── Custom Extraction Commands ──────────────────────────────────

/**
 * Extract an HTML table as structured JSON.
 * Returns JSON array string mapped to headers.
 */
export async function extractTable(
  selector: string,
  sessionId: string = "default"
): Promise<BrowserResult & { tableData?: Record<string, string>[] }> {
  const js = `(function() {
    var table = document.querySelector('${selector}');
    if (!table) return JSON.stringify({ error: 'Table not found' });
    var headers = Array.from(table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td'))
      .map(th => th.textContent.trim());
    var rows = Array.from(table.querySelectorAll('tbody tr, tr:not(:first-child)'));
    var data = rows.map(row => {
      var cells = Array.from(row.querySelectorAll('td, th'));
      var obj = {};
      cells.forEach((cell, i) => { obj[headers[i] || 'col' + i] = cell.textContent.trim(); });
      return obj;
    });
    return JSON.stringify(data);
  })()`;

  const result = await runCmd(
    [...sessionArgs(sessionId), "eval", js],
    15000
  );

  if (result.success && result.output) {
    try {
      const tableData = JSON.parse(result.output);
      return { ...result, tableData };
    } catch {
      return { ...result, error: "Failed to parse table JSON" };
    }
  }
  return result;
}
