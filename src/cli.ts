#!/usr/bin/env npx tsx
// ─── CLI Entry Point ─────────────────────────────────────────────
// This file is the terminal entry point for the SuperBrowser agent.
// It wires up the runAgent() library function with console I/O and
// exits the process when done.
//
// Usage:
//   npx tsx src/cli.ts "Go to https://example.com and find the title"

import { config } from "dotenv";
import { runAgent, type AgentEvent } from "./agent.js";
import { createTimestampLogger } from "./logger.js";

config();

async function main(): Promise<void> {
  const rawGoal = process.argv.slice(2).join(" ").trim();

  if (!rawGoal) {
    console.error('\n  Usage: npx tsx src/cli.ts "<your goal here>"\n');
    console.error('  Example: npx tsx src/cli.ts "Go to https://books.toscrape.com and find the price of the first book"\n');
    process.exit(1);
  }

  const logger = createTimestampLogger();
  const runId = `cli_${Date.now()}`;

  console.log(`\n  🚀 SuperBrowser CLI`);
  console.log(`  Goal: ${rawGoal}`);
  console.log(`  Log:  ${logger.logFilePath}\n`);

  let lastStep = 0;

  const result = await runAgent({
    goal: rawGoal,
    runId,
    logger,
    onEvent: (event: AgentEvent) => {
      // The agent already logs most things via logger.log().
      // Here we only print events that need special CLI treatment.
      switch (event.type) {
        case "paused":
          console.log("\n  ⏸️  Agent is paused. (Run the server for interactive control.)\n");
          break;
        case "done":
          console.log(`\n  ✅ Goal completed in ${lastStep} step(s).`);
          if (event.result) {
            console.log(`\n  Result:\n  ${event.result}\n`);
          }
          break;
        case "error":
          console.error(`\n  ❌ Agent error: ${event.error}\n`);
          break;
        case "max_steps_reached":
          console.error(`\n  ⚠️  Max steps reached.\n`);
          break;
        case "step_started":
          lastStep = event.step ?? lastStep;
          break;
        default:
          break;
      }
    },
  });

  // Exit with appropriate code
  if (result.reason === "done") {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error("\n  Fatal error:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
