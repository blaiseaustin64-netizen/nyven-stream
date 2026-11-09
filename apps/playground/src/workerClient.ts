/**
 * Real Worker SSE client for playground "Worker" mode.
 * Uses transport SseClient + fetch against the local Worker gateway.
 * Does not invent events when the connection fails.
 */

import type { StreamEvent } from "@nyven-stream/protocol";
import { SseClient } from "@nyven-stream/transport";

export interface WorkerCreateResult {
  streamId: string;
  sseUrl: string;
  capability: string;
  status: string;
}

export interface WorkerStreamSession {
  streamId: string;
  close: () => void;
  cancel: () => Promise<void>;
}

const DEFAULT_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_WORKER_URL) ||
  "http://127.0.0.1:8787";

export function getWorkerBaseUrl(): string {
  return DEFAULT_BASE.replace(/\/$/, "");
}

export async function createWorkerStream(
  capability: string,
  input?: unknown,
  baseUrl = getWorkerBaseUrl()
): Promise<WorkerCreateResult> {
  const res = await fetch(`${baseUrl}/v1/streams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      capability,
      input: input ?? {},
      title: capability,
      meta: { client: "playground" },
    }),
  });
  if (!res.ok) {
    let msg = `Worker returned ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message || body?.error?.code || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export function connectWorkerSse(
  ssePath: string,
  handlers: {
    onEvent: (e: StreamEvent) => void;
    onError?: (err: Error) => void;
    onOpen?: () => void;
    onClose?: () => void;
    lastSeq?: number;
  },
  baseUrl = getWorkerBaseUrl()
): WorkerStreamSession {
  const url = ssePath.startsWith("http")
    ? ssePath
    : `${baseUrl}${ssePath.startsWith("/") ? "" : "/"}${ssePath}`;

  const streamId =
    ssePath.split("/").filter(Boolean).pop() || "unknown";

  const client = new SseClient({
    url,
    lastSeq: handlers.lastSeq ?? 0,
    onEvent: handlers.onEvent,
    onError: handlers.onError,
    onOpen: handlers.onOpen,
    onClose: handlers.onClose,
    maxReconnectAttempts: 5,
    reconnectBaseMs: 800,
  });

  // fire and forget connect loop
  void client.connect();

  return {
    streamId,
    close: () => client.close(),
    cancel: async () => {
      client.close();
      try {
        await fetch(`${baseUrl}/v1/streams/${streamId}/cancel`, {
          method: "POST",
        });
      } catch {
        /* host may already be gone */
      }
    },
  };
}

export async function checkWorkerHealth(
  baseUrl = getWorkerBaseUrl()
): Promise<{ ok: boolean; capabilities?: string[]; error?: string }> {
  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      ok: true,
      capabilities: data.capabilities,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Worker unreachable",
    };
  }
}
