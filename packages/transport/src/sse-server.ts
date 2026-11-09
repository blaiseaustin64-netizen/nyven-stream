/**
 * Server-side SSE helpers using Web Streams API.
 * Compatible with Cloudflare Workers, Deno, Node 18+, Bun, etc.
 */

import type { StreamEvent } from "@nyven-stream/protocol";

const encoder = new TextEncoder();

/** Format a single SSE message */
export function formatSseMessage(event: StreamEvent, eventName = "message"): string {
  const data = JSON.stringify(event);
  return `event: ${eventName}\ndata: ${data}\nid: ${event.seq}\n\n`;
}

/** Create a ReadableStream that emits SSE from an async iterable of events */
export function createSseStream(
  events: AsyncIterable<StreamEvent> | Iterable<StreamEvent>,
  options: {
    heartbeatMs?: number;
    signal?: AbortSignal;
  } = {}
): ReadableStream<Uint8Array> {
  const { heartbeatMs = 15_000, signal } = options;

  return new ReadableStream({
    async start(controller) {
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(formatSseMessage(event)));
      };

      const cleanup = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      };

      signal?.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      if (heartbeatMs > 0) {
        heartbeatTimer = setInterval(() => {
          // plain comment keepalive
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        }, heartbeatMs);
      }

      try {
        for await (const event of events as AsyncIterable<StreamEvent>) {
          if (signal?.aborted) break;
          send(event);
        }
        // final done signal
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        // emit a structured error if possible
        console.error("SSE stream error", err);
      } finally {
        cleanup();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      }
    },
  });
}

/** Standard SSE response headers */
export function sseHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    ...extra,
  });
}

/** Convenience – create a full Response */
export function createSseResponse(
  events: AsyncIterable<StreamEvent> | Iterable<StreamEvent>,
  options: {
    heartbeatMs?: number;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {}
): Response {
  const stream = createSseStream(events, {
    heartbeatMs: options.heartbeatMs,
    signal: options.signal,
  });
  return new Response(stream, {
    headers: sseHeaders(options.headers),
  });
}
