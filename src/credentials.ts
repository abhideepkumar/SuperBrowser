import { config } from "dotenv";
config();

interface CredentialSet {
  [placeholder: string]: string;
}

/**
 * Load credentials from environment variables.
 * Add your site-specific credentials as env vars:
 *   CRED_EMAIL=user@example.com
 *   CRED_PASSWORD=secret123
 *
 * These map to placeholders {{EMAIL}} and {{PASSWORD}} in the agent prompt.
 */
function loadCredentials(): CredentialSet {
  const creds: CredentialSet = {};

  // Scan env vars starting with CRED_
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("CRED_") && value) {
      // CRED_EMAIL -> {{EMAIL}}
      const placeholder = `{{${key.replace("CRED_", "")}}}`;
      creds[placeholder] = value;
    }
  }

  return creds;
}

const credentials = loadCredentials();

/**
 * Inject credential placeholders into the user goal.
 * e.g., "Login with user@example.com" is NOT modified.
 * The system prompt tells the LLM to use {{EMAIL}} and {{PASSWORD}}.
 * This function is for the reverse: substituting placeholders back to
 * real values in the LLM's output before executing browser actions.
 */
export function substituteCredentials(value: string): string {
  let result = value;
  for (const [placeholder, realValue] of Object.entries(credentials)) {
    result = result.replace(placeholder, realValue);
  }
  return result;
}

/**
 * Build a "sanitized" version of the user goal that replaces real
 * credential values with placeholders, so the LLM never sees raw passwords.
 */
export function sanitizeGoal(goal: string): string {
  let sanitized = goal;
  for (const [placeholder, realValue] of Object.entries(credentials)) {
    if (realValue && sanitized.includes(realValue)) {
      sanitized = sanitized.replace(new RegExp(escapeRegex(realValue), "g"), placeholder);
    }
  }
  return sanitized;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
