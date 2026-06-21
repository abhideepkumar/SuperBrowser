import { config } from "dotenv";
config();

interface CredentialSet {
  [placeholder: string]: string;
}

/**
 * Load credentials from environment variables ON DEMAND.
 *
 * Any env var starting with CRED_ is treated as a credential:
 *   CRED_EMAIL=user@example.com    → placeholder {{EMAIL}}
 *   CRED_PASSWORD=secret123        → placeholder {{PASSWORD}}
 *
 * Called lazily (not cached) so that runtime credential updates
 * from the Settings screen take effect immediately without restart.
 */
function loadCredentials(): CredentialSet {
  // Do NOT call config() here again — it does a synchronous disk read.
  // Runtime updates from POST /api/config write directly to process.env,
  // which we read below. The top-level config() at module load is enough.
  const creds: CredentialSet = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("CRED_") && value) {
      const placeholder = `{{${key.replace("CRED_", "")}}}`;
      creds[placeholder] = value;
    }
  }
  return creds;
}

/**
 * Substitute credential placeholders in a string with real values.
 * e.g., fill(@e3, "{{EMAIL}}") → fill(@e3, "user@example.com")
 *
 * Called per browser action. Credentials are loaded fresh each time
 * so that runtime updates (from the Settings screen) take effect.
 */
export function substituteCredentials(value: string): string {
  const credentials = loadCredentials();
  let result = value;
  for (const [placeholder, realValue] of Object.entries(credentials)) {
    result = result.replaceAll(placeholder, realValue);
  }
  return result;
}

/**
 * Build a sanitized version of the user goal that replaces any raw
 * credential values with their placeholders, so the LLM never sees
 * passwords or emails in plain text.
 */
export function sanitizeGoal(goal: string): string {
  const credentials = loadCredentials();
  let sanitized = goal;
  for (const [placeholder, realValue] of Object.entries(credentials)) {
    if (realValue && sanitized.includes(realValue)) {
      sanitized = sanitized.replace(
        new RegExp(escapeRegex(realValue), "g"),
        placeholder
      );
    }
  }
  return sanitized;
}

/**
 * Return all currently configured credentials as a map of
 * placeholder → masked value (for display in the settings UI).
 * Real values are never returned to the client.
 */
export function listCredentialKeys(): string[] {
  return Object.keys(loadCredentials());
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
