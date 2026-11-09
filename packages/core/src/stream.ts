/**
 * Stream Core
 *
 * Manages a single stream lifecycle, event emission, cancellation,
 * and basic state. Provider- and transport-agnostic.
 */

import {
  createEventFactory,
  type EventFactory,
  type StreamEvent,
  type StreamId,
  type TaskId,
  type StreamStartedEvent,
  type StreamCompletedEvent,
  type StreamErrorEvent,
  type StreamCancelledEvent,
} from "@nyven-stream/protocol";

export type StreamStatus =
  | "idle"
  | "starting"
  | "active"
  | "completing"
  | "completed"
  | "error"
  | "cancelled";

export interface StreamOptions {
  streamId?: StreamId;
  title?: string;
  meta?: Record<string, unknown>;
  /** Called for every emitted event */
  onEvent?: (event: StreamEvent) => void;
  /** Called when status changes */
  onStatusChange?: (status: StreamStatus) => void;
}

export class Stream {
  readonly id: StreamId;
  private _status: StreamStatus = "idle";
  private factory: EventFactory;
  private events: StreamEvent[] = [];
  private abortController = new AbortController();
  private startedAt: number | null = null;
  private options: StreamOptions;

  constructor(options: StreamOptions = {}) {
    this.id =
      options.streamId ??
      `stream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.options = options;
    this.factory = createEventFactory({ streamId: this.id });
  }

  get status(): StreamStatus {
    return this._status;
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  get eventCount(): number {
    return this.events.length;
  }

  get history(): readonly StreamEvent[] {
    return this.events;
  }

  private setStatus(status: StreamStatus) {
    if (this._status === status) return;
    this._status = status;
    this.options.onStatusChange?.(status);
  }

  private emit(event: StreamEvent) {
    this.events.push(event);
    this.options.onEvent?.(event);
  }

  /** Start the stream – emits stream.started */
  start(): StreamStartedEvent {
    if (this._status !== "idle") {
      throw new Error(`Cannot start stream in status ${this._status}`);
    }
    this.setStatus("starting");
    this.startedAt = Date.now();
    const event = this.factory.streamStarted({
      title: this.options.title,
      meta: this.options.meta,
    });
    this.emit(event);
    this.setStatus("active");
    return event;
  }

  /** Emit an arbitrary event (must belong to this stream) */
  push(event: StreamEvent): void {
    if (this._status !== "active" && this._status !== "starting") {
      throw new Error(`Cannot push events in status ${this._status}`);
    }
    if (event.streamId !== this.id) {
      throw new Error("Event streamId mismatch");
    }
    this.emit(event);
  }

  /** Convenience – create & push via factory */
  get create(): EventFactory {
    return this.factory;
  }

  /** Complete successfully */
  complete(): StreamCompletedEvent {
    if (this._status !== "active") {
      throw new Error(`Cannot complete stream in status ${this._status}`);
    }
    this.setStatus("completing");
    const durationMs = this.startedAt ? Date.now() - this.startedAt : 0;
    const event = this.factory.streamCompleted({
      eventCount: this.events.length,
      durationMs,
    });
    this.emit(event);
    this.setStatus("completed");
    return event;
  }

  /** Fail the stream */
  error(code: string, message: string, retryable = false, details?: unknown): StreamErrorEvent {
    if (this._status === "completed" || this._status === "cancelled") {
      throw new Error(`Cannot error stream in status ${this._status}`);
    }
    const event = this.factory.streamError({ code, message, retryable, details });
    this.emit(event);
    this.setStatus("error");
    return event;
  }

  /** Cancel the stream */
  cancel(reason?: string, by: "client" | "server" | "timeout" = "client"): StreamCancelledEvent {
    if (
      this._status === "completed" ||
      this._status === "cancelled" ||
      this._status === "error"
    ) {
      // already terminal
      return this.events.find((e) => e.type === "stream.cancelled") as StreamCancelledEvent;
    }
    this.abortController.abort(reason);
    const event = this.factory.streamCancelled({ reason, by });
    this.emit(event);
    this.setStatus("cancelled");
    return event;
  }

  /** Replay events after a given sequence (for reconnection) */
  replayFrom(lastSeq: number): StreamEvent[] {
    return this.events.filter((e) => e.seq > lastSeq);
  }

  /** Check if aborted */
  get aborted(): boolean {
    return this.abortController.signal.aborted;
  }
}

/** Simple in-memory registry for concurrent streams */
export class StreamRegistry {
  private streams = new Map<StreamId, Stream>();

  create(options?: StreamOptions): Stream {
    const stream = new Stream(options);
    this.streams.set(stream.id, stream);
    return stream;
  }

  get(id: StreamId): Stream | undefined {
    return this.streams.get(id);
  }

  delete(id: StreamId): boolean {
    return this.streams.delete(id);
  }

  get size(): number {
    return this.streams.size;
  }

  list(): StreamId[] {
    return Array.from(this.streams.keys());
  }
}
