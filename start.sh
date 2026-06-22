#!/bin/bash
# When PLAYWRIGHT_BROWSERS_PATH=0, Playwright installs Chromium locally
# inside the project dir (./ms-playwright/), which persists to runtime on Render.
CHROME_PATH=$(find ./ms-playwright -name "chrome" -type f 2>/dev/null | head -1)

if [ -z "$CHROME_PATH" ]; then
  # Fallback: search the full project tree
  CHROME_PATH=$(find /opt/render/project -name "chrome" -type f 2>/dev/null | head -1)
fi

if [ -z "$CHROME_PATH" ]; then
  echo "❌ Chrome binary not found. Make sure build command ran: PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium"
  exit 1
fi

echo "✅ Chrome found at: $CHROME_PATH"
export AGENT_BROWSER_EXECUTABLE_PATH="$CHROME_PATH"

# --no-sandbox is required in cloud/containerized environments (no root access)
export AGENT_BROWSER_ARGS="--no-sandbox,--disable-setuid-sandbox"

npx tsx src/server.ts
