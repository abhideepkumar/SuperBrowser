// src/hooks/useSocket.ts
// Connects the socket to the store, wires all server events.
//
// H1 Fix: Store handler references so socket.off(event, handler) removes
// ONLY our specific listeners, not all listeners on that event name.

import { useEffect, useRef } from "react";
import { connect } from "../services/socket";
import { useAgentStore } from "../store/useAgentStore";
import type { AgentEvent } from "../types";

export function useSocket() {
  const processEvent = useAgentStore((s) => s.processEvent);
  const setStatus = useAgentStore((s) => s.setStatus);
  const setInteractiveScreenshot = useAgentStore((s) => s.setInteractiveScreenshot);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = connect();

    // ── Define named handlers so we can remove them precisely ──────
    const handleAgentEvent = (event: AgentEvent) => {
      processEvent(event);
    };

    const handleDone = (data: { runId: string; result: string | null; totalSteps: number }) => {
      processEvent({ type: "done", runId: data.runId, result: data.result, timestamp: Date.now() });
    };

    const handleError = (data: { runId: string; message: string }) => {
      processEvent({ type: "error", runId: data.runId, error: data.message, timestamp: Date.now() });
    };

    const handlePaused = (data: { runId: string; screenshotBase64?: string }) => {
      processEvent({ type: "paused", runId: data.runId, timestamp: Date.now() });
      if (data.screenshotBase64) {
        setInteractiveScreenshot(data.screenshotBase64);
      }
    };

    const handleResumed = (data: { runId: string }) => {
      processEvent({ type: "resumed", runId: data.runId, timestamp: Date.now() });
      setInteractiveScreenshot(null);
    };

    const handleInteractiveUpdate = (data: {
      action: string;
      success: boolean;
      screenshotBase64?: string;
      error?: string;
    }) => {
      if (data.screenshotBase64) {
        setInteractiveScreenshot(data.screenshotBase64);
      }
    };

    const handleAborted = () => {
      setStatus("aborted");
    };

    // ── Register ──────────────────────────────────────────────────
    socket.on("agent:event", handleAgentEvent);
    socket.on("agent:done", handleDone);
    socket.on("agent:error", handleError);
    socket.on("agent:paused", handlePaused);
    socket.on("agent:resumed", handleResumed);
    socket.on("agent:interactive_update", handleInteractiveUpdate);
    socket.on("agent:aborted", handleAborted);

    // ── Cleanup — removes ONLY our handlers (H1 fix) ──────────────
    return () => {
      socket.off("agent:event", handleAgentEvent);
      socket.off("agent:done", handleDone);
      socket.off("agent:error", handleError);
      socket.off("agent:paused", handlePaused);
      socket.off("agent:resumed", handleResumed);
      socket.off("agent:interactive_update", handleInteractiveUpdate);
      socket.off("agent:aborted", handleAborted);
      initialized.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
