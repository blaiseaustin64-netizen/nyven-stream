/**
 * Lightweight runtime validation for StreamEvents.
 * Keeps the core free of heavy schema libraries.
 */

import { isStreamEvent, PROTOCOL_VERSION, type StreamEvent } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  event?: StreamEvent;
}

export function validateEvent(value: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isStreamEvent(value)) {
    return { ok: false, errors: ["Not a StreamEvent envelope"] };
  }

  if (value.v !== PROTOCOL_VERSION) {
    errors.push(`Unsupported protocol version: ${value.v}`);
  }

  if (typeof value.seq !== "number" || value.seq < 1) {
    errors.push("seq must be a positive number");
  }

  if (!value.type || typeof value.type !== "string") {
    errors.push("type is required");
  }

  if (!value.streamId) {
    errors.push("streamId is required");
  }

  return {
    ok: errors.length === 0,
    errors,
    event: errors.length === 0 ? value : undefined,
  };
}

/** Assert and narrow – throws on invalid */
export function assertEvent(value: unknown): asserts value is StreamEvent {
  const result = validateEvent(value);
  if (!result.ok) {
    throw new Error(`Invalid StreamEvent: ${result.errors.join("; ")}`);
  }
}
