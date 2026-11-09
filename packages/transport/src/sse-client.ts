/**
 * SSE Client with reconnection support.
 * Uses native EventSource where possible; falls back to fetch streams.
 */

import { validateEvent, type StreamEvent } from "@nyven-stream/protocol";

export interface SseClientOptions {
  url: string;
  /** Last acknowledged sequence for reconnection */
  lastSeq?: number;
  headers?: Record<string, string>;
  onEvent: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  /** Reconnect delay base (ms) */
  reconnectBaseMs?: number;
  maxReconnectAttempts?: number;
}

export class SseClient {
  private options: SseClientOptions;
  private abort: AbortController | null = null;
  private attempts = 0;
  private closed = false;
  private lastSeq: number;

  constructor(options: SseClientOptions) {
    this.options = options;
    this.lastSeq = options.lastSeq ?? 0;
  }

  async connect(): Promise<void> {
    if (this.closed) return;
    this.abort = new AbortController();

    const url = new URL(this.options.url);
    if (this.lastSeq > 0) {
      url.searchParams.set("lastSeq", String(this.lastSeq));
    }

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          ...this.options.headers,
        },
        signal: this.abort.signal,
      });

      if (!res.ok) {
        throw new Error(`SSE connection failed: ${res.status} ${res.statusText}`);
      }

      if (!res.body) {
        throw new Error("No response body");
      }

      this.attempts = 0;
      this.options.onOpen?.();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let dataLines: string[] = [];
        let eventType = "message";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          } else if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line === "") {
            // dispatch
            if (dataLines.length > 0) {
              const raw = dataLines.join("\n");
              if (raw === "[DONE]") {
                this.options.onClose?.();
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                const result = validateEvent(parsed);
                if (result.ok && result.event) {
                  this.lastSeq = result.event.seq;
                  this.options.onEvent(result.event);
                }
              } catch {
                // ignore malformed
              }
            }
            dataLines = [];
            eventType = "message";
          }
        }
      }

      this.options.onClose?.();
    } catch (err) {
      if (this.abort?.signal.aborted || this.closed) return;
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
      await this.scheduleReconnect();
    }
  }

  private async scheduleReconnect() {
    const max = this.options.maxReconnectAttempts ?? 10;
    if (this.attempts >= max) {
      this.options.onError?.(new Error("Max reconnect attempts reached"));
      return;
    }
    this.attempts += 1;
    const base = this.options.reconnectBaseMs ?? 1000;
    const delay = Math.min(base * 2 ** (this.attempts - 1), 30_000);
    await new Promise((r) => setTimeout(r, delay));
    if (!this.closed) {
      this.connect();
    }
  }

  close() {
    this.closed = true;
    this.abort?.abort();
  }

  get lastAcknowledgedSeq(): number {
    return this.lastSeq;
  }
}
