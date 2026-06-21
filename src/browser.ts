import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface BrowserResult {
  success: boolean;
  output: string;
  error?: string;
}

function runCmd(command: string, timeoutMs: number = 30000): Promise<BrowserResult> {
  return new Promise((resolve) => {
    // Using shell: true so that we can run global/PATH commands correctly
    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    let timer: NodeJS.Timeout | null = setTimeout(() => {
      timer = null;
      child.kill();
      resolve({
        success: false,
        output: stdout.trim(),
        error: "Command timed out",
      });
    }, timeoutMs);

    // Using the 'exit' event instead of 'close'.
    // The 'exit' event fires as soon as the main command process exits,
    // even if background daemon processes are still holding stdio handles.
    child.on("exit", (code, signal) => {
      if (timer) {
        clearTimeout(timer);
      }
      if (code === 0) {
        resolve({ success: true, output: stdout.trim() });
      } else {
        resolve({
          success: false,
          output: stdout.trim(),
          error: stderr.trim() || `Exit code ${code}, signal ${signal}`,
        });
      }
    });

    child.on("error", (err) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        success: false,
        output: stdout.trim(),
        error: err.message,
      });
    });
  });
}

/**
 * Navigate to a URL in the browser.
 */
export function openUrl(url: string): Promise<BrowserResult> {
  return runCmd(`agent-browser open "${url}"`, 15000);
}

/**
 * Capture an accessibility-tree snapshot of the current page.
 * Returns the text representation with @e references.
 */
export function snapshot(): Promise<BrowserResult> {
  return runCmd("agent-browser snapshot -i", 15000);
}

/**
 * Capture an annotated screenshot and save it to the given path.
 * The screenshot will have bounding boxes with @e labels overlaid.
 */
export function screenshot(savePath: string): Promise<BrowserResult> {
  // Ensure the directory exists
  const dir = path.dirname(savePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return runCmd(`agent-browser screenshot "${savePath}"`, 15000);
}

/**
 * Click on an element by its @e reference.
 */
export function click(ref: string): Promise<BrowserResult> {
  return runCmd(`agent-browser click "${ref}"`, 10000);
}

/**
 * Fill an input field identified by its @e reference with the given value.
 */
export function fill(ref: string, value: string): Promise<BrowserResult> {
  // Escape double quotes inside the value
  const escaped = value.replace(/"/g, '\\"');
  return runCmd(`agent-browser fill "${ref}" "${escaped}"`, 10000);
}

/**
 * Select an option from a dropdown identified by its @e reference.
 */
export function selectOption(ref: string, value: string): Promise<BrowserResult> {
  const escaped = value.replace(/"/g, '\\"');
  return runCmd(`agent-browser select "${ref}" "${escaped}"`, 10000);
}

/**
 * Scroll the page in a given direction.
 */
export function scroll(direction: "up" | "down" = "down"): Promise<BrowserResult> {
  return runCmd(
    `agent-browser execute "window.scrollBy(0, ${direction === "down" ? 600 : -600})"`,
    10000
  );
}

/**
 * Close the browser session.
 */
export function close(): Promise<BrowserResult> {
  return runCmd("agent-browser close", 10000);
}
