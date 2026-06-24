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
 */
function loadCredentials(): CredentialSet {
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
 * Load DATA_* variables (large data payloads for form filling).
 *
 * Any env var starting with DATA_ is treated as big data payload:
 *   DATA_ARTICLE=My 5000-word article... → placeholder {{DATA_ARTICLE}}
 *
 * This keeps massive payloads out of the LLM context window.
 */
function loadDataVariables(): CredentialSet {
  const data: CredentialSet = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("DATA_") && value) {
      const placeholder = `{{${key}}}`;
      data[placeholder] = value;
    }
  }
  return data;
}

/**
 * Substitute ONLY credential placeholders.
 * Used internally, or for scenarios where DATA variables shouldn't be substituted.
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
 * Substitute BOTH credentials AND data variables in a value string.
 * Called by browser.fill() — NOT by the LLM context builder.
 */
export function substituteAll(value: string): string {
  // Apply credentials first (they mask values)
  let result = substituteCredentials(value);
  // Then apply data variables
  const dataVars = loadDataVariables();
  for (const [placeholder, realValue] of Object.entries(dataVars)) {
    result = result.replaceAll(placeholder, realValue);
  }
  return result;
}

/**
 * Build a sanitized version of the user goal that replaces any raw
 * credential values with their placeholders, so the LLM never sees
 * passwords or emails in plain text.
 * 
 * Also replaces massive DATA variables with their placeholders to 
 * prevent token bloat in the prompt.
 */
export function sanitizeGoal(goal: string): string {
  let sanitized = goal;
  
  // Existing credential masking ({{EMAIL}})
  const credentials = loadCredentials();
  for (const [placeholder, realValue] of Object.entries(credentials)) {
    if (realValue && sanitized.includes(realValue)) {
      sanitized = sanitized.replaceAll(realValue, placeholder);
    }
  }

  // Data variable masking ({{DATA_ARTICLE}})
  const dataVars = loadDataVariables();
  for (const [placeholder, realValue] of Object.entries(dataVars)) {
    if (realValue && sanitized.includes(realValue)) {
      sanitized = sanitized.replaceAll(realValue, placeholder);
    }
  }

  return sanitized;
}

/**
 * Return all currently configured credential keys (for the settings UI).
 */
export function listCredentialKeys(): string[] {
  return Object.keys(loadCredentials());
}

/**
 * Return all currently configured data keys.
 */
export function listDataKeys(): string[] {
  return Object.keys(loadDataVariables());
}


