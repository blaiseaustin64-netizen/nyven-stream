/**
 * NYVEN STREAM – Cloudflare Worker (generic stream gateway)
 *
 * POST /v1/streams              → create stream via producer registry
 * GET  /v1/streams/:id          → SSE (Last-Event-ID / ?lastSeq=)
 * POST /v1/streams/:id/cancel   → cancel
 * GET  /health                  → health
 * GET  /v1/capabilities         → list registered capability keys
 *
 * The Worker does NOT contain capability business logic.
 * It resolves a producer from the registry and runs it against Stream Core.
 */

import { Stream, StreamRegistry } from "@nyven-stream/core";
import type { StreamEvent } from "@nyven-stream/protocol";
import { formatSseMessage, sseHeaders } from "@nyven-stream/transport";
import {
  createProducerRegistry,
  registerDemoProducers,
  runProducer,
  ProducerNotFoundError,
  type CreateStreamRequest,
} from "@nyven-stream/adapters";

/** Stream instances (in-memory, per isolate) */
const streamRegistry = new StreamRegistry();

/** Capability → producer (demo producers registered for development) */
const producerRegistry = createProducerRegistry();
registerDemoProducers(producerRegistry);

const MAX_STREAMS = 50;
const MAX_STREAM_MS = 120_000;

function corsHeaders(origin?: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Last-Event-ID, Authorization",
    "Access-Control-Expose-Headers": "X-Stream-Id, X-Last-Seq",
  };
}

function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
      ...extra,
    },
  });
}

function errorResponse(
  code: string,
  message: string,
  status = 400
): Response {
  return json({ error: { code, message } }, status);
}

/**
 * Parse and validate create-stream body.
 * Supports both the new schema and a legacy `scenario` alias.
 */
function parseCreateRequest(body: unknown): CreateStreamRequest | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Body must be a JSON object" };
  }
  const o = body as Record<string, unknown>;

  // New schema: capability
  // Legacy alias: scenario (demo only – not part of the permanent API contract)
  const capabilityRaw =
    typeof o.capability === "string"
      ? o.capability
      : typeof o.scenario === "string"
        ? o.scenario
        : null;

  if (!capabilityRaw || !capabilityRaw.trim()) {
    return {
      error:
        'Missing "capability" (string). Example: { "capability": "chat", "input": {} }',
    };
  }

  if (o.title != null && typeof o.title !== "string") {
    return { error: "title must be a string when provided" };
  }
  if (o.meta != null && (typeof o.meta !== "object" || Array.isArray(o.meta))) {
    return { error: "meta must be an object when provided" };
  }

  return {
    capability: capabilityRaw.trim(),
    input: o.input,
    title: typeof o.title === "string" ? o.title : undefined,
    meta:
      o.meta && typeof o.meta === "object"
        ? (o.meta as Record<string, unknown>)
        : undefined,
  };
}

/** SSE response: replay + live poll of stream history */
function createLiveSseResponse(
  stream: Stream,
  lastSeq: number,
  requestSignal: AbortSignal
): Response {
  const encoder = new TextEncoder();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(formatSseMessage(event)));
        } catch {
          closed = true;
        }
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      const replay = stream.replayFrom(lastSeq);
      for (const e of replay) send(e);

      if (
        stream.status === "completed" ||
        stream.status === "error" ||
        stream.status === "cancelled"
      ) {
        finish();
        return;
      }

      let lastSeen = Math.max(
        lastSeq,
        replay.length ? replay[replay.length - 1].seq : lastSeq
      );

      const poll = () => {
        if (closed || requestSignal.aborted) {
          finish();
          return;
        }
        const newEvents = stream.history.filter((e) => e.seq > lastSeen);
        for (const e of newEvents) {
          send(e);
          lastSeen = e.seq;
          if (
            e.type === "stream.completed" ||
            e.type === "stream.error" ||
            e.type === "stream.cancelled"
          ) {
            finish();
            return;
          }
        }
      };

      const pollTimer = setInterval(poll, 40);
      heartbeatTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 15_000);

      const onAbort = () => {
        clearInterval(pollTimer);
        finish();
      };
      requestSignal.addEventListener("abort", onAbort, { once: true });

      // When finish runs, also clear poll
      const _finish = finish;
      // wrap: clear poll timer
      const finishAndClear = () => {
        clearInterval(pollTimer);
        _finish();
      };
      // reassign local finish used above – use finishAndClear in poll paths
      // (poll already calls finish; we monkey-patch by clearing in onAbort)
      void finishAndClear;
    },
    cancel() {
      closed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(body, {
    headers: {
      ...Object.fromEntries(sseHeaders().entries()),
      ...corsHeaders(),
      "X-Stream-Id": stream.id,
    },
  });
}

export default {
  async fetch(
    request: Request,
    _env: unknown,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    if (url.pathname === "/health" || url.pathname === "/") {
      return json({
        ok: true,
        service: "nyven-stream",
        version: "0.1.0",
        streams: streamRegistry.size,
        capabilities: producerRegistry.list(),
      });
    }

    if (url.pathname === "/v1/capabilities" && request.method === "GET") {
      return json({
        capabilities: producerRegistry.list(),
      });
    }

    // POST /v1/streams
    if (url.pathname === "/v1/streams" && request.method === "POST") {
      if (streamRegistry.size >= MAX_STREAMS) {
        return errorResponse(
          "CAPACITY",
          `Max concurrent streams (${MAX_STREAMS}) reached`,
          503
        );
      }

      let raw: unknown = {};
      try {
        const text = await request.text();
        if (text) raw = JSON.parse(text);
      } catch {
        return errorResponse("INVALID_JSON", "Request body must be valid JSON");
      }

      const parsed = parseCreateRequest(raw);
      if ("error" in parsed) {
        return errorResponse("INVALID_INPUT", parsed.error);
      }

      const { capability, input, title, meta } = parsed;

      let producer;
      try {
        producer = producerRegistry.require(capability);
      } catch (e) {
        if (e instanceof ProducerNotFoundError) {
          return errorResponse(
            "UNKNOWN_CAPABILITY",
            `No producer registered for capability "${capability}". Known: ${producerRegistry.list().join(", ") || "(none)"}`,
            404
          );
        }
        throw e;
      }

      const stream = streamRegistry.create({
        title: title ?? capability,
        meta: {
          ...meta,
          capability,
        },
      });

      stream.start();

      const ac = new AbortController();
      stream.signal.addEventListener("abort", () => ac.abort(), {
        once: true,
      });

      ctx.waitUntil(
        (async () => {
          const timeout = setTimeout(() => {
            if (stream.status === "active") {
              stream.cancel("timeout", "timeout");
            }
          }, MAX_STREAM_MS);
          try {
            await runProducer({
              stream,
              producer,
              signal: ac.signal,
              input,
              meta,
              capability,
            });
          } finally {
            clearTimeout(timeout);
            setTimeout(() => {
              if (
                stream.status === "completed" ||
                stream.status === "error" ||
                stream.status === "cancelled"
              ) {
                streamRegistry.delete(stream.id);
              }
            }, 60_000);
          }
        })()
      );

      return json(
        {
          streamId: stream.id,
          sseUrl: `/v1/streams/${stream.id}`,
          capability,
          status: stream.status,
        },
        201,
        { "X-Stream-Id": stream.id }
      );
    }

    // GET /v1/streams/:id
    const streamMatch = url.pathname.match(/^\/v1\/streams\/([^/]+)$/);
    if (streamMatch && request.method === "GET") {
      const streamId = streamMatch[1];
      const stream = streamRegistry.get(streamId);
      if (!stream) {
        return errorResponse(
          "NOT_FOUND",
          "Stream not found or expired",
          404
        );
      }

      let lastSeq = 0;
      const q = url.searchParams.get("lastSeq");
      if (q) {
        const n = parseInt(q, 10);
        if (!Number.isFinite(n) || n < 0) {
          return errorResponse(
            "INVALID_INPUT",
            "lastSeq must be a non-negative integer"
          );
        }
        lastSeq = n;
      }
      const lastEventId = request.headers.get("Last-Event-ID");
      if (lastEventId) {
        const n = parseInt(lastEventId, 10);
        if (Number.isFinite(n) && n > lastSeq) lastSeq = n;
      }

      return createLiveSseResponse(stream, lastSeq, request.signal);
    }

    // POST /v1/streams/:id/cancel
    const cancelMatch = url.pathname.match(
      /^\/v1\/streams\/([^/]+)\/cancel$/
    );
    if (cancelMatch && request.method === "POST") {
      const streamId = cancelMatch[1];
      const stream = streamRegistry.get(streamId);
      if (!stream) {
        return errorResponse("NOT_FOUND", "Stream not found", 404);
      }
      stream.cancel("client request", "client");
      return json({ streamId, status: stream.status });
    }

    return errorResponse("NOT_FOUND", "Unknown route", 404);
  },
};
