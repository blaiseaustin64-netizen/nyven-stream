/**
 * NYVEN STREAM Event Protocol v0.1
 *
 * Versioned, strongly-typed event protocol for universal streaming.
 * All events are JSON-serializable and designed for SSE transport.
 */

/** Protocol version – bump on breaking changes */
export const PROTOCOL_VERSION = "0.1.0" as const;

/** Unique identifiers */
export type StreamId = string;
export type TaskId = string;
export type EventId = string;
export type SourceId = string;
export type FileId = string;
export type ToolCallId = string;

/** ISO-8601 timestamp */
export type Timestamp = string;

/** Base envelope shared by every event */
export interface StreamEventBase {
  /** Protocol version */
  v: typeof PROTOCOL_VERSION;
  /** Unique event ID (UUID or monotonic) */
  id: EventId;
  /** Stream this event belongs to */
  streamId: StreamId;
  /** Optional parent task (for nested tasks) */
  taskId?: TaskId;
  /** Wall-clock time the event was produced */
  ts: Timestamp;
  /** Sequence number within the stream (for ordering & reconnection) */
  seq: number;
}

/* ------------------------------------------------------------------ */
/*  Stream lifecycle                                                   */
/* ------------------------------------------------------------------ */

export type StreamLifecycleEvent =
  | StreamStartedEvent
  | StreamCompletedEvent
  | StreamErrorEvent
  | StreamCancelledEvent
  | StreamReconnectedEvent;

export interface StreamStartedEvent extends StreamEventBase {
  type: "stream.started";
  data: {
    /** Optional human-readable title */
    title?: string;
    /** Client-supplied metadata */
    meta?: Record<string, unknown>;
  };
}

export interface StreamCompletedEvent extends StreamEventBase {
  type: "stream.completed";
  data: {
    /** Total events emitted (excluding this one) */
    eventCount: number;
    durationMs: number;
  };
}

export interface StreamErrorEvent extends StreamEventBase {
  type: "stream.error";
  data: {
    code: string;
    message: string;
    /** Whether the stream can be retried */
    retryable: boolean;
    details?: unknown;
  };
}

export interface StreamCancelledEvent extends StreamEventBase {
  type: "stream.cancelled";
  data: {
    reason?: string;
    /** Who initiated the cancellation */
    by: "client" | "server" | "timeout";
  };
}

export interface StreamReconnectedEvent extends StreamEventBase {
  type: "stream.reconnected";
  data: {
    /** Last sequence number the client acknowledged */
    lastSeq: number;
    /** How many events were replayed */
    replayed: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Task lifecycle                                                     */
/* ------------------------------------------------------------------ */

export type TaskLifecycleEvent =
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  | TaskCancelledEvent;

export interface TaskStartedEvent extends StreamEventBase {
  type: "task.started";
  data: {
    taskId: TaskId;
    /** Task kind – drives UI renderer selection */
    kind: TaskKind;
    title: string;
    /** Optional parent task for nesting */
    parentTaskId?: TaskId;
    meta?: Record<string, unknown>;
  };
}

export interface TaskProgressEvent extends StreamEventBase {
  type: "task.progress";
  data: {
    taskId: TaskId;
    /** 0–100 or null when indeterminate */
    percent?: number | null;
    message?: string;
    /** Arbitrary progress payload */
    detail?: unknown;
  };
}

export interface TaskCompletedEvent extends StreamEventBase {
  type: "task.completed";
  data: {
    taskId: TaskId;
    result?: unknown;
    durationMs: number;
  };
}

export interface TaskFailedEvent extends StreamEventBase {
  type: "task.failed";
  data: {
    taskId: TaskId;
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface TaskCancelledEvent extends StreamEventBase {
  type: "task.cancelled";
  data: {
    taskId: TaskId;
    reason?: string;
  };
}

/** Canonical task kinds – extensible via string */
export type TaskKind =
  | "chat"
  | "thinking"
  | "search"
  | "research"
  | "planning"
  | "coding"
  | "build"
  | "agent"
  | "tool"
  | "analysis"
  | "math"
  | "design"
  | "writing"
  | "custom"
  | (string & {});

/* ------------------------------------------------------------------ */
/*  Content streaming                                                  */
/* ------------------------------------------------------------------ */

export type ContentEvent = ContentDeltaEvent | ContentReplaceEvent | ContentCompleteEvent;

export interface ContentDeltaEvent extends StreamEventBase {
  type: "content.delta";
  data: {
    /** Target content channel (e.g. "main", "thinking", "code") */
    channel: string;
    /** Incremental text */
    text: string;
    /** Optional MIME hint */
    mime?: string;
  };
}

export interface ContentReplaceEvent extends StreamEventBase {
  type: "content.replace";
  data: {
    channel: string;
    text: string;
    mime?: string;
  };
}

export interface ContentCompleteEvent extends StreamEventBase {
  type: "content.complete";
  data: {
    channel: string;
    /** Final full text (optional if client already has deltas) */
    text?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Activity / thinking indicators                                     */
/* ------------------------------------------------------------------ */

export type ActivityEvent = ActivityUpdateEvent | ActivityClearEvent;

export interface ActivityUpdateEvent extends StreamEventBase {
  type: "activity.update";
  data: {
    /** Stable key so UI can update the same indicator */
    key: string;
    label: string;
    /** Optional status badge */
    status?: "running" | "success" | "error" | "pending";
    /** Optional detail line */
    detail?: string;
    /** Icon hint for renderer */
    icon?: string;
  };
}

export interface ActivityClearEvent extends StreamEventBase {
  type: "activity.clear";
  data: {
    key?: string; // omit to clear all
  };
}

/* ------------------------------------------------------------------ */
/*  Tool execution                                                     */
/* ------------------------------------------------------------------ */

export type ToolEvent =
  | ToolCallStartedEvent
  | ToolCallInputEvent
  | ToolCallOutputEvent
  | ToolCallCompletedEvent
  | ToolCallFailedEvent;

export interface ToolCallStartedEvent extends StreamEventBase {
  type: "tool.started";
  data: {
    toolCallId: ToolCallId;
    name: string;
    /** Human-readable description */
    description?: string;
  };
}

export interface ToolCallInputEvent extends StreamEventBase {
  type: "tool.input";
  data: {
    toolCallId: ToolCallId;
    input: unknown;
  };
}

export interface ToolCallOutputEvent extends StreamEventBase {
  type: "tool.output";
  data: {
    toolCallId: ToolCallId;
    /** Incremental or final output chunk */
    output: unknown;
    partial?: boolean;
  };
}

export interface ToolCallCompletedEvent extends StreamEventBase {
  type: "tool.completed";
  data: {
    toolCallId: ToolCallId;
    result?: unknown;
    durationMs: number;
  };
}

export interface ToolCallFailedEvent extends StreamEventBase {
  type: "tool.failed";
  data: {
    toolCallId: ToolCallId;
    code: string;
    message: string;
  };
}

/* ------------------------------------------------------------------ */
/*  File events                                                        */
/* ------------------------------------------------------------------ */

export type FileEvent =
  | FileCreatedEvent
  | FileModifiedEvent
  | FileDeletedEvent
  | FileContentDeltaEvent;

export interface FileCreatedEvent extends StreamEventBase {
  type: "file.created";
  data: {
    fileId: FileId;
    path: string;
    language?: string;
    size?: number;
  };
}

export interface FileModifiedEvent extends StreamEventBase {
  type: "file.modified";
  data: {
    fileId: FileId;
    path: string;
    language?: string;
  };
}

export interface FileDeletedEvent extends StreamEventBase {
  type: "file.deleted";
  data: {
    fileId: FileId;
    path: string;
  };
}

export interface FileContentDeltaEvent extends StreamEventBase {
  type: "file.content.delta";
  data: {
    fileId: FileId;
    path: string;
    /** Incremental content */
    text: string;
    /** Whether this is a full replace */
    replace?: boolean;
  };
}

/* ------------------------------------------------------------------ */
/*  Search / source events                                              */
/* ------------------------------------------------------------------ */

export type SearchEvent =
  | SearchStartedEvent
  | SearchQueryEvent
  | SearchSourceFoundEvent
  | SearchCompletedEvent;

export interface SearchStartedEvent extends StreamEventBase {
  type: "search.started";
  data: {
    query: string;
  };
}

export interface SearchQueryEvent extends StreamEventBase {
  type: "search.query";
  data: {
    query: string;
    engine?: string;
  };
}

export interface SearchSourceFoundEvent extends StreamEventBase {
  type: "search.source";
  data: {
    sourceId: SourceId;
    title: string;
    url: string;
    snippet?: string;
    favicon?: string;
    rank?: number;
  };
}

export interface SearchCompletedEvent extends StreamEventBase {
  type: "search.completed";
  data: {
    sourceCount: number;
    durationMs: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Progress (generic)                                                 */
/* ------------------------------------------------------------------ */

export interface ProgressEvent extends StreamEventBase {
  type: "progress";
  data: {
    key: string;
    current: number;
    total?: number;
    unit?: string;
    message?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Heartbeat / keepalive                                              */
/* ------------------------------------------------------------------ */

export interface HeartbeatEvent extends StreamEventBase {
  type: "heartbeat";
  data: {
    /** Optional server load or status */
    status?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Union of all events                                                */
/* ------------------------------------------------------------------ */

export type StreamEvent =
  | StreamLifecycleEvent
  | TaskLifecycleEvent
  | ContentEvent
  | ActivityEvent
  | ToolEvent
  | FileEvent
  | SearchEvent
  | ProgressEvent
  | HeartbeatEvent;

/** Helper to extract the event type string */
export type StreamEventType = StreamEvent["type"];

/** Type guard helpers */
export function isStreamEvent(value: unknown): value is StreamEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "v" in value &&
    "id" in value &&
    "type" in value &&
    "streamId" in value &&
    "ts" in value &&
    "seq" in value
  );
}

export function isTaskEvent(
  event: StreamEvent
): event is TaskLifecycleEvent {
  return event.type.startsWith("task.");
}

export function isContentEvent(event: StreamEvent): event is ContentEvent {
  return event.type.startsWith("content.");
}

export function isToolEvent(event: StreamEvent): event is ToolEvent {
  return event.type.startsWith("tool.");
}

export function isFileEvent(event: StreamEvent): event is FileEvent {
  return event.type.startsWith("file.");
}

export function isSearchEvent(event: StreamEvent): event is SearchEvent {
  return event.type.startsWith("search.");
}
