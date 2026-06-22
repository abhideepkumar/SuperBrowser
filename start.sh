#!/bin/bash
# SuperBrowser production start script
# Uses Browserless (remote browser) — no local Chromium required.
# Set AGENT_BROWSER_PROVIDER=browserless and BROWSERLESS_API_KEY in Render env vars.

set -e

echo "🚀 Starting SuperBrowser Server..."
npx tsx src/server.ts
