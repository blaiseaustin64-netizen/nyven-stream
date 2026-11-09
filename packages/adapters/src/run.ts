/**
 * Host-side helper: run a StreamProducer against an already-started Stream.
 * Maps aborts and exceptions to stream terminal states without leaking secrets.
 */

import type { Stream } from "@nyven-stream/core";
import type { StreamProducer, StreamProducerContext } from "./types";
import { toSafeError } from "./types";

export interface RunProducerOptions {
  stream: Stream;
  producer: StreamProducer;
  signal: AbortSignal;
  input?: unknown;
  meta?: Record<string, unknown>;
  capability: string;
}

/**
 * Execute a producer. Assumes stream.start() has already been called.
 * On AbortError → ensures stream is cancelled if still active.
 * On other errors → stream.error with a safe message.
 * If producer already completed/errored/cancelled the stream, does nothing extra.
 */
export async function runProducer(options: RunProducerOptions): Promise<void> {
  const { stream, producer, signal, input, meta, capability } = options;

  const context: StreamProducerContext = {
    stream,
    signal,
    input: input ?? {},
    meta,
    capability,
  };

  // If already aborted before start, cancel immediately.
  if (signal.aborted) {
    if (stream.status === "active" || stream.status === "starting") {
      stream.cancel("aborted before producer start", "client");
    }
    return;
  }

  try {
    await producer.run(context);

    // If producer returned without completing, and not aborted, complete.
    if (stream.status === "active") {
      if (signal.aborted) {
        stream.cancel("client abort", "client");
      } else {
        stream.complete();
      }
    }
  } catch (err) {
    if (signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      if (
        stream.status === "active" ||
        stream.status === "starting"
      ) {
        stream.cancel("cancelled", "client");
      }
      return;
    }

    if (
      stream.status === "active" ||
      stream.status === "starting"
    ) {
      const safe = toSafeError(err);
      stream.error(safe.code, safe.message, safe.retryable);
    }
    // If stream already terminal, swallow.
  }
}
