import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface BrowserResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Run an agent-browser CLI command and return its result.
 *
 * @param command    - The full command string to execute
 * @param timeoutMs  - Hard timeout in milliseconds
 */
function runCmd(command: string, timeoutMs: number = 30000): Promise<BrowserResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    let timer: NodeJS.Timeout | null = setTimeout(() => {
      timer = null;
      child.kill();
      resolve({
        success: false,
        output: stdout.trim(),
        error: "Command timed out",
      });
    }, timeoutMs);

    // Use 'exit' (not 'close') so we don't wait for background daemon handles
    child.on("exit", (code, signal) => {
      if (timer) clearTimeout(timer);
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
      if (timer) clearTimeout(timer);
      resolve({
        success: false,
        output: stdout.trim(),
        error: err.message,
      });
    });
  });
}

/**
 * Build the --session flag string for agent-browser commands.
 * Using named sessions ensures complete isolation between concurrent runs.
 */
function sessionFlag(sessionId: string): string {
  return `--session "${sessionId}"`;
}

// ─── Standard Browser Actions ────────────────────────────────────

/**
 * Navigate to a URL.
 */
export function openUrl(
  url: string,
  sessionId: string = "default"
): Promise<BrowserResult> {
  return runCmd(`agent-browser ${sessionFlag(sessionId)} open "${url}"`, 15000);
}

/**
 * Capture an accessibility-tree snapshot of the current page.
 */
export function snapshot(
  sessionId: string = "default"
): Promise<BrowserResult> {
  return runCmd(`agent-browser ${sessionFlag(sessionId)} snapshot -i`, 15000);
}

/**
 * Capture an annotated screenshot and save it to the given path.
 */
export function screenshot(
  savePath: string,
  sessionId: string = "default"
): Promise<BrowserResult> {
  const dir = path.dirname(savePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return runCmd(
    `agent-browser ${sessionFlag(sessionId)} screenshot "${savePath}"`,
    15000
  );
}

/**
 * Click on an element by its @e reference.
 */
export function click(
  ref: string,
  sessionId: string = "default"
): Promise<BrowserResult> {
  return runCmd(
    `agent-browser ${sessionFlag(sessionId)} click "${ref}"`,
    10000
  );
}

/**
 * Fill an input field by its @e reference.
 */
export function fill(
  ref: string,
  value: string,
  sessionId: string = "default"
): Promise<BrowserResult> {
  const escaped = value.replace(/"/g, '\\"');
  return runCmd(
    `agent-browser ${sessionFlag(sessionId)} fill "${ref}" "${escaped}"`,
    10000
  );
}

/**
 * Select an option from a dropdown by its @e reference.
 */
export function selectOption(
  ref: string,
  value: string,
  sessionId: string = "default"
): Promise<BrowserResult> {
  const escaped = value.replace(/"/g, '\\"');
  return runCmd(
    `agent-browser ${sessionFlag(sessionId)} select "${ref}" "${escaped}"`,
    10000
  );
}

/**
 * Scroll the page in a direction.
 */
export function scroll(
  direction: "up" | "down" = "down",
  sessionId: string = "default"
): Promise<BrowserResult> {
  const px = direction === "down" ? 600 : -600;
  return runCmd(
    `agent-browser ${sessionFlag(sessionId)} execute "window.scrollBy(0, ${px})"`,
    10000
  );
}

/**
 * Close the browser session.
 */
export function close(
  sessionId: string = "default"
): Promise<BrowserResult> {
  return runCmd(
    `agent-browser ${sessionFlag(sessionId)} close`,
    10000
  );
}

// ─── Interactive Fallback Actions (Human-in-the-Loop) ────────────

/**
 * Click at fractional page coordinates (Human-in-the-Loop).
 *
 * xFrac and yFrac are values from 0.0 to 1.0 representing the tap position
 * as a fraction of the browser viewport (default 1280×720).
 *
 * The element under the calculated pixel coordinate is focused and clicked.
 * A new snapshot should be taken immediately after to reflect the updated state.
 */
export function clickAtCoordinates(
  xFrac: number,
  yFrac: number,
  sessionId: string = "default"
): Promise<BrowserResult> {
  // Default agent-browser viewport dimensions
  const viewW = 1280;
  const viewH = 720;
  const x = Math.round(Math.max(0, Math.min(1, xFrac)) * viewW);
  const y = Math.round(Math.max(0, Math.min(1, yFrac)) * viewH);

  // Use elementFromPoint to find and interact with the element at these coords.
  // We dispatch both a mousedown/mouseup sequence AND .click() for maximum
  // compatibility across different frameworks (React, Angular, vanilla JS).
  const js = [
    `(function(){`,
    `  var el = document.elementFromPoint(${x}, ${y});`,
    `  if (!el) return;`,
    `  el.focus();`,
    `  el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, clientX:${x}, clientY:${y}}));`,
    `  el.dispatchEvent(new MouseEvent('mouseup',   {bubbles:true, clientX:${x}, clientY:${y}}));`,
    `  el.click();`,
    `})()`,
  ].join(" ");

  const escaped = js.replace(/"/g, '\\"');
  return runCmd(
    `agent-browser ${sessionFlag(sessionId)} execute "${escaped}"`,
    10000
  );
}

/**
 * Type text into the currently focused element (Human-in-the-Loop).
 *
 * Dispatches native input/change events after setting the value so that
 * React, Vue, and Angular controlled inputs respond correctly.
 * For contenteditable elements, falls back to document.execCommand insertText.
 */
export function typeAtFocus(
  text: string,
  sessionId: string = "default"
): Promise<BrowserResult> {
  // Escape backslashes and double quotes for shell safety
  const safeText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

  const js = [
    `(function(){`,
    `  var el = document.activeElement;`,
    `  if (!el) return;`,
    `  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {`,
    `    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');`,
    `    if (nativeInputValueSetter && nativeInputValueSetter.set) nativeInputValueSetter.set.call(el, "${safeText}");`,
    `    else el.value = "${safeText}";`,
    `    el.dispatchEvent(new Event('input',  {bubbles:true}));`,
    `    el.dispatchEvent(new Event('change', {bubbles:true}));`,
    `  } else if (el.isContentEditable) {`,
    `    document.execCommand('selectAll', false, null);`,
    `    document.execCommand('insertText', false, "${safeText}");`,
    `  }`,
    `})()`,
  ].join(" ");

  const escaped = js.replace(/"/g, '\\"');
  return runCmd(
    `agent-browser ${sessionFlag(sessionId)} execute "${escaped}"`,
    10000
  );
}
