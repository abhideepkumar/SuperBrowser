// src/services/api.ts
// Axios HTTP client for SuperBrowser REST API.

import axios from "axios";
import { useSettingsStore } from "../store/useSettingsStore";

function getClient() {
  const { serverUrl } = useSettingsStore.getState();
  return axios.create({
    baseURL: `${serverUrl}/api`,
    timeout: 10000,
    headers: { "Content-Type": "application/json" },
  });
}

export interface HealthResponse {
  status: string;
  provider: string;
  model: string;
  vision: string;
  maxSteps: string;
  activeSessions: number;
  totalRuns: number;
  timestamp: number;
}

export interface ConfigResponse {
  provider: string;
  model: string;
  baseUrl: string;
  vision: string;
  maxSteps: string;
  serverPort: number;
  credentialKeys: string[];
}

export interface RunSummary {
  id: string;
  goal: string;
  status: "running" | "done" | "error" | "aborted" | "max_steps";
  startedAt: number;
  finishedAt?: number;
  totalSteps: number;
  result: string | null;
  error?: string;
  logFilePath?: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await getClient().get<HealthResponse>("/health");
  return data;
}

export async function fetchConfig(): Promise<ConfigResponse> {
  const { data } = await getClient().get<ConfigResponse>("/config");
  return data;
}

export async function updateConfig(config: Partial<{
  provider: string;
  model: string;
  baseUrl: string;
  vision: string;
  maxSteps: string;
  credentials: Record<string, string>;
}>): Promise<void> {
  await getClient().post("/config", config);
}

export async function fetchRuns(): Promise<RunSummary[]> {
  const { data } = await getClient().get<RunSummary[]>("/runs");
  return data;
}

export async function fetchRun(id: string): Promise<RunSummary & { events: any[] }> {
  const { data } = await getClient().get(`/runs/${id}`);
  return data;
}

export async function deleteRun(id: string): Promise<void> {
  await getClient().delete(`/runs/${id}`);
}

export function screenshotUrl(runId: string, step: number): string {
  const { serverUrl } = useSettingsStore.getState();
  return `${serverUrl}/api/runs/${runId}/screenshots/${step}`;
}
