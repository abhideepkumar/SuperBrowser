// ─── SuperBrowser API + WebSocket Server ────────────────────────
// Express REST API + Socket.io real-time streaming server.
//
// Start with:  npm run server
// Default port: 3000  (override with SERVER_PORT env var)

import { createServer } from "http";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { Server as SocketServer, type Socket } from "socket.io";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

import { runAgent, type AgentEvent, type AgentRunConfig } from "./agent.js";
import * as browser from "./browser.js";
import { RunLogger } from "./logger.js";
import { serverLog } from "./logger.js";

config();

// ─── Types ───────────────────────────────────────────────────────

interface RunRecord {
  id: string;
  goal: string;
  status: "running" | "done" | "error" | "aborted" | "max_steps";
  startedAt: number;
  finishedAt?: number;
  totalSteps: number;
  result: string | null;
  error?: string;
  events: AgentEvent[];
  logFilePath?: string;
}

interface ActiveSession {
  runId: string;
  socketId: string;
  paused: boolean;
  abortController: AbortController;
}

// ─── State ───────────────────────────────────────────────────────

const PORT = parseInt(process.env.SERVER_PORT || "3000", 10);
const DATA_DIR = path.resolve("data");
const RUNS_FILE = path.join(DATA_DIR, "runs.json");

// In-memory store
const runHistory: Map<string, RunRecord> = new Map();
const activeSessions: Map<string, ActiveSession> = new Map(); // socketId → session

// ─── Persistence ─────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function persistRuns(): Promise<void> {
  try {
    ensureDataDir();
    const finished = Array.from(runHistory.values()).filter(
      (r) => r.status !== "running"
    );
    // Keep last 50 in memory too — prune oldest (C3: prevent memory leak)
    if (finished.length > 50) {
      const toEvict = finished
        .sort((a, b) => a.startedAt - b.startedAt)
        .slice(0, finished.length - 50);
      for (const r of toEvict) runHistory.delete(r.id);
    }
    const records = finished.slice(-50);
    // Async write — don't block the event loop (M2)
    await fs.promises.writeFile(
      RUNS_FILE,
      JSON.stringify(records, null, 2),
      "utf-8"
    );
  } catch (err: any) {
    serverLog("⚠️", `Failed to persist runs: ${err.message}`);
  }
}

function loadRuns(): void {
  try {
    if (fs.existsSync(RUNS_FILE)) {
      const raw = fs.readFileSync(RUNS_FILE, "utf-8");
      const records: RunRecord[] = JSON.parse(raw);
      for (const r of records) {
        runHistory.set(r.id, r);
      }
      serverLog("📂", `Loaded ${records.length} historical run(s) from disk.`);
    }
  } catch (err: any) {
    serverLog("⚠️", `Failed to load runs from disk: ${err.message}`);
  }
}

// ─── App Setup ───────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 5e6, // 5MB — for screenshot data
});

app.use(cors());
app.use(express.json());

// ─── REST API ────────────────────────────────────────────────────

/**
 * GET /api/health
 * Quick health check with active config info.
 */
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    provider: process.env.LLM_PROVIDER || "openai",
    model: process.env.MODEL_NAME || "gpt-4o",
    vision: process.env.ENABLE_VISION || "true",
    maxSteps: process.env.MAX_STEPS || "20",
    activeSessions: activeSessions.size,
    totalRuns: runHistory.size,
    timestamp: Date.now(),
  });
});

/**
 * GET /api/config
 * Returns current LLM + server configuration (no secrets).
 */
app.get("/api/config", (_req: Request, res: Response) => {
  res.json({
    provider: process.env.LLM_PROVIDER || "openai",
    model: process.env.MODEL_NAME || "gpt-4o",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    vision: process.env.ENABLE_VISION || "true",
    maxSteps: process.env.MAX_STEPS || "20",
    serverPort: PORT,
    // Credential keys (not values) for the settings screen
    credentialKeys: (() => {
      const keys: string[] = [];
      for (const k of Object.keys(process.env)) {
        if (k.startsWith("CRED_")) keys.push(k);
      }
      return keys;
    })(),
  });
});

/**
 * POST /api/config
 * Update config at runtime (provider, model, credentials).
 * Changes are applied to process.env immediately — active runs are unaffected.
 */
app.post("/api/config", (req: Request, res: Response) => {
  const { provider, model, baseUrl, vision, maxSteps, credentials } = req.body as {
    provider?: string;
    model?: string;
    baseUrl?: string;
    vision?: string;
    maxSteps?: string;
    credentials?: Record<string, string>;
  };

  if (provider) process.env.LLM_PROVIDER = provider;
  if (model) process.env.MODEL_NAME = model;
  if (baseUrl) process.env.OPENAI_BASE_URL = baseUrl;
  if (vision !== undefined) process.env.ENABLE_VISION = vision;
  if (maxSteps) process.env.MAX_STEPS = maxSteps;

  // Set credential env vars — these will be picked up lazily by credentials.ts
  if (credentials) {
    for (const [key, value] of Object.entries(credentials)) {
      if (key.startsWith("CRED_")) {
        process.env[key] = value;
      }
    }
  }

  serverLog("⚙️", `Config updated: provider=${process.env.LLM_PROVIDER}, model=${process.env.MODEL_NAME}`);
  res.json({ ok: true });
});

/**
 * GET /api/runs
 * List all historical runs (newest first), limited to 50.
 */
app.get("/api/runs", (_req: Request, res: Response) => {
  const runs = Array.from(runHistory.values())
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 50)
    .map(({ events: _, ...summary }) => summary); // strip events from list view
  res.json(runs);
});

/**
 * GET /api/runs/:id
 * Full run detail including all events.
 */
app.get("/api/runs/:id", (req: Request, res: Response) => {
  const run = runHistory.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  res.json(run);
});

/**
 * DELETE /api/runs/:id
 * Remove a run from history.
 */
app.delete("/api/runs/:id", (req: Request, res: Response) => {
  if (!runHistory.has(req.params.id)) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  runHistory.delete(req.params.id);
  persistRuns();
  res.json({ ok: true });
});

/**
 * GET /api/runs/:id/screenshots/:step
 * Serve a screenshot image for a specific run step.
 */
app.get("/api/runs/:id/screenshots/:step", (req: Request, res: Response) => {
  const { id, step } = req.params;

  // C1: Validate inputs to prevent path traversal attacks
  // Run ID must match our generated format
  if (!/^run_[a-f0-9]{16}$/.test(id)) {
    res.status(400).json({ error: "Invalid run ID" });
    return;
  }
  // Step must be a non-negative integer or the word 'paused'/'interactive'
  if (!/^(\d+|paused|interactive)$/.test(step)) {
    res.status(400).json({ error: "Invalid step" });
    return;
  }

  const imgPath = path.resolve(`screenshots/${id}/step_${step}.png`);
  // Double-check the resolved path stays inside the screenshots dir
  const screenshotsRoot = path.resolve("screenshots");
  if (!imgPath.startsWith(screenshotsRoot + path.sep)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!fs.existsSync(imgPath)) {
    res.status(404).json({ error: "Screenshot not found" });
    return;
  }
  res.sendFile(imgPath);
});

// ─── WebSocket Event Handling ─────────────────────────────────────

io.on("connection", (socket: Socket) => {
  serverLog("🔌", `Client connected: ${socket.id}`);

  // ── client:run ───────────────────────────────────────────────
  socket.on("client:run", async (data: { goal: string; provider?: string }) => {
    // Kill any existing session from this socket
    const existing = activeSessions.get(socket.id);
    if (existing) {
      existing.abortController.abort();
      activeSessions.delete(socket.id);
    }

    // Use crypto.randomUUID() — guaranteed unique, no millisecond collision risk (H5)
    const runId = `run_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const logger = new RunLogger(runId);
    const abortController = new AbortController();

    const session: ActiveSession = {
      runId,
      socketId: socket.id,
      paused: false,
      abortController,
    };
    activeSessions.set(socket.id, session);

    const record: RunRecord = {
      id: runId,
      goal: data.goal,
      status: "running",
      startedAt: Date.now(),
      totalSteps: 0,
      result: null,
      events: [],
      logFilePath: logger.logFilePath,
    };
    runHistory.set(runId, record);

    serverLog("🚀", `Starting run ${runId} — Goal: "${data.goal.substring(0, 60)}..."`);

    const agentConfig: AgentRunConfig = {
      goal: data.goal,
      runId,
      logger,
      providerOverride: data.provider,
      abortSignal: abortController.signal,
      isPaused: () => activeSessions.get(socket.id)?.paused ?? false,

      onEvent: (event: AgentEvent) => {
        // Stream event to the mobile client FIRST (with screenshot)
        socket.emit("agent:event", event);

        // Store event WITHOUT screenshot bytes — prevents RAM blowup (M4/C3)
        const storedEvent: AgentEvent = { ...event };
        delete (storedEvent as any).screenshotBase64;
        record.events.push(storedEvent);

        // Update step count
        if (event.step) record.totalSteps = event.step;
      },
    };

    try {
      const result = await runAgent(agentConfig);

      record.status = result.reason === "done" ? "done"
        : result.reason === "aborted" ? "aborted"
        : result.reason === "max_steps" ? "max_steps"
        : "error";
      record.result = result.result;
      record.error = result.error;
      record.finishedAt = Date.now();
      record.totalSteps = result.totalSteps;

      if (result.reason === "done") {
        socket.emit("agent:done", {
          runId,
          result: result.result,
          totalSteps: result.totalSteps,
        });
        serverLog("✅", `Run ${runId} completed in ${result.totalSteps} steps.`);
      } else if (result.reason === "aborted") {
        socket.emit("agent:aborted", { runId });
        serverLog("🛑", `Run ${runId} aborted.`);
      } else {
        socket.emit("agent:error", {
          runId,
          message: result.error ?? "Unknown error",
          totalSteps: result.totalSteps,
        });
        serverLog("❌", `Run ${runId} failed: ${result.error}`);
      }
    } catch (err: any) {
      record.status = "error";
      record.error = err.message;
      record.finishedAt = Date.now();
      socket.emit("agent:error", { runId, message: err.message });
      serverLog("❌", `Run ${runId} threw: ${err.message}`);
    } finally {
      activeSessions.delete(socket.id);
      // Fire-and-forget persist (async, won't block socket loop)
      persistRuns().catch((e) => serverLog("⚠️", `Persist error: ${e.message}`));
    }
  });

  // ── client:pause ─────────────────────────────────────────────
  socket.on("client:pause", () => {
    const session = activeSessions.get(socket.id);
    if (session) {
      session.paused = true;
      serverLog("⏸️", `Run ${session.runId} paused by client.`);

      // Take a fresh screenshot to give the client a current view
      // .catch() prevents unhandled rejection crashing Node (C2)
      const screenshotPath = path.resolve(`screenshots/${session.runId}/paused.png`);
      browser
        .screenshot(screenshotPath, session.runId)
        .then((ssResult) => {
          let screenshotBase64: string | undefined;
          if (ssResult.success && fs.existsSync(screenshotPath)) {
            screenshotBase64 = fs.readFileSync(screenshotPath).toString("base64");
          }
          socket.emit("agent:paused", {
            runId: session.runId,
            reason: "manual",
            screenshotBase64,
          });
        })
        .catch((err: Error) => {
          serverLog("⚠️", `Pause screenshot failed: ${err.message}`);
          // Still emit paused even without screenshot
          socket.emit("agent:paused", { runId: session.runId, reason: "manual" });
        });
    }
  });

  // ── client:resume ────────────────────────────────────────────
  socket.on("client:resume", () => {
    const session = activeSessions.get(socket.id);
    if (session) {
      session.paused = false;
      serverLog("▶️", `Run ${session.runId} resumed by client.`);
      socket.emit("agent:resumed", { runId: session.runId });
    }
  });

  // ── client:stop ──────────────────────────────────────────────
  socket.on("client:stop", () => {
    const session = activeSessions.get(socket.id);
    if (session) {
      serverLog("🛑", `Run ${session.runId} stopped by client.`);
      session.abortController.abort();
    }
  });

  // ── client:click (Human-in-the-Loop coordinate click) ────────
  socket.on(
    "client:click",
    async (data: { xFrac: number; yFrac: number }) => {
      const session = activeSessions.get(socket.id);
      if (!session || !session.paused) {
        socket.emit("server:error", {
          message: "No paused session. Pause the agent first.",
        });
        return;
      }

      serverLog("🖱️", `Interactive click at (${data.xFrac.toFixed(2)}, ${data.yFrac.toFixed(2)}) on run ${session.runId}`);
      const result = await browser.clickAtCoordinates(
        data.xFrac,
        data.yFrac,
        session.runId
      );

      // Take fresh screenshot and stream it back
      if (result.success) {
        const ssPath = path.resolve(`screenshots/${session.runId}/interactive.png`);
        const ssResult = await browser.screenshot(ssPath, session.runId);
        let screenshotBase64: string | undefined;
        if (ssResult.success && fs.existsSync(ssPath)) {
          screenshotBase64 = fs.readFileSync(ssPath).toString("base64");
        }
        socket.emit("agent:interactive_update", {
          action: "click",
          success: true,
          screenshotBase64,
        });
      } else {
        socket.emit("agent:interactive_update", {
          action: "click",
          success: false,
          error: result.error,
        });
      }
    }
  );

  // ── client:type (Human-in-the-Loop text input) ────────────────
  socket.on("client:type", async (data: { text: string }) => {
    const session = activeSessions.get(socket.id);
    if (!session || !session.paused) {
      socket.emit("server:error", {
        message: "No paused session. Pause the agent first.",
      });
      return;
    }

    serverLog("⌨️", `Interactive type "${data.text.substring(0, 30)}..." on run ${session.runId}`);
    const result = await browser.typeAtFocus(data.text, session.runId);

    const ssPath = path.resolve(`screenshots/${session.runId}/interactive.png`);
    const ssResult = await browser.screenshot(ssPath, session.runId);
    let screenshotBase64: string | undefined;
    if (ssResult.success && fs.existsSync(ssPath)) {
      screenshotBase64 = fs.readFileSync(ssPath).toString("base64");
    }

    socket.emit("agent:interactive_update", {
      action: "type",
      success: result.success,
      error: result.error,
      screenshotBase64,
    });
  });

  // ── disconnect ───────────────────────────────────────────────
  socket.on("disconnect", () => {
    const session = activeSessions.get(socket.id);
    if (session) {
      serverLog("🔌", `Client ${socket.id} disconnected — aborting run ${session.runId}`);
      session.abortController.abort();
      activeSessions.delete(socket.id);
    } else {
      serverLog("🔌", `Client disconnected: ${socket.id}`);
    }
  });
});

// ─── Start Server ─────────────────────────────────────────────────

loadRuns();

httpServer.listen(PORT, () => {
  serverLog("🚀", `SuperBrowser Server listening on http://localhost:${PORT}`);
  serverLog("📡", `WebSocket ready — connect your React Native app!`);
  serverLog("🔧", `REST API docs:`);
  serverLog("   ", `  GET  /api/health`);
  serverLog("   ", `  GET  /api/config`);
  serverLog("   ", `  POST /api/config`);
  serverLog("   ", `  GET  /api/runs`);
  serverLog("   ", `  GET  /api/runs/:id`);
  serverLog("   ", `  GET  /api/runs/:id/screenshots/:step`);
  serverLog("   ", `  DELETE /api/runs/:id`);
});
