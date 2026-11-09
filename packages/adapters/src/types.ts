/**
 * Universal StreamProducer contract for NYVEN STREAM.
 *
 * A producer is NOT a streaming engine. It only emits NYVEN STREAM events
 * into an existing Stream from @nyven-stream/core.
 *
 * Providers (Gemini, …) and capabilities (search, BUILD, agents, …)
 * both implement this same contract.
 */

import type { Stream } from "@nyven-stream/core";

/**
 * Context passed to every producer invocation.
 *
 * - stream: the live Stream instance (already started by the host)
 * - signal: AbortSignal linked to client cancel / timeout / disconnect
 * - input: capability-specific payload (opaque to the engine)
 * - meta: optional client/host metadata
 * - capability: the registry key that selected this producer
 */
export interface StreamProducerContext {
  readonly stream: Stream;
  readonly signal: AbortSignal;
  readonly input: unknown;
  readonly meta?: Record<string, unknown>;
  readonly capability: string;
}

/**
 * A StreamProducer performs work and emits protocol events onto `context.stream`.
 *
 * Lifecycle expectations:
 * 1. Host creates Stream and calls stream.start()
 * 2. Host invokes producer.run(context)
 * 3. Producer pushes events via stream.push / stream.create / helpers
 * 4. Producer ends by:
 *    - stream.complete(), or
 *    - stream.error(...), or
 *    - observing signal.aborted and letting the host cancel, or
 *    - calling stream.cancel(...) itself if appropriate
 *
 * Rules:
 * - Do NOT invent fake progress or activity text.
 * - Do NOT talk to SSE, HTTP, or React.
 * - Do NOT leak secrets, stack traces, or credentials into events.
 * - Respect AbortSignal; stop work promptly when aborted.
 */
export interface StreamProducer {
  /**
   * Human-readable id for logging (optional; registry key is authoritative).
   */
  readonly id?: string;

  /**
   * Optional static description for discovery/docs.
   */
  readonly description?: string;

  /**
   * Execute the capability. Must not throw uncaught — prefer stream.error().
   * Throwing is allowed; the host will map it to a safe stream.error.
   */
  run(context: StreamProducerContext): Promise<void>;
}

/**
 * Generic create-stream request used by the Worker gateway.
 * Extensible: any capability string may be registered later.
 */
export interface CreateStreamRequest {
  /** Registry key of the producer to run */
  capability: string;
  /** Capability-specific input (opaque) */
  input?: unknown;
  /** Optional stream title */
  title?: string;
  /** Client/host metadata (stored on stream.started meta) */
  meta?: Record<string, unknown>;
}

/**
 * Safe error information safe to emit on the stream / return to clients.
 */
export interface SafeErrorInfo {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Map an unknown thrown value to a safe public error.
 * Never exposes stack traces, API keys, or internal paths.
 */
export function toSafeError(err: unknown): SafeErrorInfo {
  if (err instanceof DOMException && err.name === "AbortError") {
    return {
      code: "CANCELLED",
      message: "Stream was cancelled",
      retryable: false,
    };
  }
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const e = err as { code: unknown; message: unknown; retryable?: unknown };
    return {
      code: String(e.code || "PRODUCER_ERROR"),
      message: String(e.message || "Producer failed"),
      retryable: Boolean(e.retryable),
    };
  }
  if (err instanceof Error) {
    // Do not forward raw Error.message if it might contain secrets;
    // use a generic message for unknown errors.
    const msg = err.message;
    const looksSensitive =
      /api[_-]?key|token|secret|password|authorization|bearer/i.test(msg);
    return {
      code: "PRODUCER_ERROR",
      message: looksSensitive ? "Producer failed" : msg || "Producer failed",
      retryable: false,
    };
  }
  return {
    code: "PRODUCER_ERROR",
    message: "Producer failed",
    retryable: false,
  };
}
