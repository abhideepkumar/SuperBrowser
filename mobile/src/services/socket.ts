// src/services/socket.ts
// Singleton Socket.io client with typed event helpers.

import { io, type Socket } from "socket.io-client";
import { useSettingsStore } from "../store/useSettingsStore";

let socket: Socket | null = null;
let connectedUrl: string | null = null;

export function getSocket(): Socket {
  if (!socket) throw new Error("Socket not connected. Call connect() first.");
  return socket;
}

/**
 * Connect (or reconnect) to the server.
 *
 * H2 Fix: If the stored serverUrl has changed since last connect,
 * tear down the old socket and create a new one. This handles the case
 * where the user updates the server URL in Settings without restarting.
 */
export function connect(): Socket {
  const { serverUrl } = useSettingsStore.getState();

  // If connected to the right URL, reuse
  if (socket?.connected && connectedUrl === serverUrl) return socket;

  // URL changed or socket dropped — rebuild
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    connectedUrl = null;
  }

  socket = io(serverUrl, {
    transports: ["websocket"],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    timeout: 10000,
  });
  connectedUrl = serverUrl;

  socket.on("connect", () => console.log("[Socket] Connected:", socket?.id));
  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
    // On clean disconnect triggered by us, don't mark as stale
    if (reason !== "io client disconnect") {
      connectedUrl = null; // force reconnect on next connect()
    }
  });
  socket.on("connect_error", (err) => console.error("[Socket] Error:", err.message));

  return socket;
}

export function disconnect(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    connectedUrl = null;
  }
}

// ── Typed emit helpers ─────────────────────────────────────────────

export function startRun(goal: string, provider?: string): void {
  getSocket().emit("client:run", { goal, provider });
}

export function pauseRun(): void {
  getSocket().emit("client:pause");
}

export function resumeRun(): void {
  getSocket().emit("client:resume");
}

export function stopRun(): void {
  getSocket().emit("client:stop");
}

export function sendClick(xFrac: number, yFrac: number): void {
  getSocket().emit("client:click", { xFrac, yFrac });
}

export function sendType(text: string): void {
  getSocket().emit("client:type", { text });
}

// Automatically reconnect when serverUrl changes in settings
let lastServerUrl = useSettingsStore.getState().serverUrl;
useSettingsStore.subscribe((state) => {
  if (state.serverUrl !== lastServerUrl) {
    lastServerUrl = state.serverUrl;
    if (socket) {
      connect();
    }
  }
});

