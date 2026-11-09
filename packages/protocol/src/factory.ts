/**
 * Event factory helpers.
 * Guarantees correct envelope fields and sequential numbering.
 */

import {
  PROTOCOL_VERSION,
  type StreamEvent,
  type StreamId,
  type TaskId,
  type EventId,
  type Timestamp,
  type TaskKind,
  type StreamStartedEvent,
  type StreamCompletedEvent,
  type StreamErrorEvent,
  type StreamCancelledEvent,
  type TaskStartedEvent,
  type TaskProgressEvent,
  type TaskCompletedEvent,
  type TaskFailedEvent,
  type ContentDeltaEvent,
  type ActivityUpdateEvent,
  type ToolCallStartedEvent,
  type SearchSourceFoundEvent,
  type HeartbeatEvent,
} from "./types";

export interface EventFactoryOptions {
  streamId: StreamId;
  /** Starting sequence (for reconnection) */
  startSeq?: number;
  /** Custom ID generator */
  idGenerator?: () => EventId;
}

function defaultId(): EventId {
  // Simple unique id – in production prefer crypto.randomUUID()
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): Timestamp {
  return new Date().toISOString();
}

/**
 * Creates a sequential event factory bound to a stream.
 */
export function createEventFactory(options: EventFactoryOptions) {
  let seq = options.startSeq ?? 0;
  const genId = options.idGenerator ?? defaultId;
  const { streamId } = options;

  function nextBase(taskId?: TaskId) {
    seq += 1;
    return {
      v: PROTOCOL_VERSION,
      id: genId(),
      streamId,
      taskId,
      ts: now(),
      seq,
    } as const;
  }

  return {
    get currentSeq() {
      return seq;
    },

    streamStarted(data: StreamStartedEvent["data"] = {}): StreamStartedEvent {
      return { ...nextBase(), type: "stream.started", data };
    },

    streamCompleted(data: StreamCompletedEvent["data"]): StreamCompletedEvent {
      return { ...nextBase(), type: "stream.completed", data };
    },

    streamError(data: StreamErrorEvent["data"]): StreamErrorEvent {
      return { ...nextBase(), type: "stream.error", data };
    },

    streamCancelled(data: StreamCancelledEvent["data"]): StreamCancelledEvent {
      return { ...nextBase(), type: "stream.cancelled", data };
    },

    taskStarted(
      taskId: TaskId,
      kind: TaskKind,
      title: string,
      extra: Partial<TaskStartedEvent["data"]> = {}
    ): TaskStartedEvent {
      return {
        ...nextBase(taskId),
        type: "task.started",
        data: { taskId, kind, title, ...extra },
      };
    },

    taskProgress(
      taskId: TaskId,
      data: Omit<TaskProgressEvent["data"], "taskId">
    ): TaskProgressEvent {
      return {
        ...nextBase(taskId),
        type: "task.progress",
        data: { taskId, ...data },
      };
    },

    taskCompleted(
      taskId: TaskId,
      data: Omit<TaskCompletedEvent["data"], "taskId">
    ): TaskCompletedEvent {
      return {
        ...nextBase(taskId),
        type: "task.completed",
        data: { taskId, ...data },
      };
    },

    taskFailed(
      taskId: TaskId,
      data: Omit<TaskFailedEvent["data"], "taskId">
    ): TaskFailedEvent {
      return {
        ...nextBase(taskId),
        type: "task.failed",
        data: { taskId, ...data },
      };
    },

    contentDelta(
      channel: string,
      text: string,
      taskId?: TaskId,
      mime?: string
    ): ContentDeltaEvent {
      return {
        ...nextBase(taskId),
        type: "content.delta",
        data: { channel, text, mime },
      };
    },

    activityUpdate(
      key: string,
      label: string,
      extra: Partial<ActivityUpdateEvent["data"]> = {},
      taskId?: TaskId
    ): ActivityUpdateEvent {
      return {
        ...nextBase(taskId),
        type: "activity.update",
        data: { key, label, ...extra },
      };
    },

    toolStarted(
      toolCallId: string,
      name: string,
      description?: string,
      taskId?: TaskId
    ): ToolCallStartedEvent {
      return {
        ...nextBase(taskId),
        type: "tool.started",
        data: { toolCallId, name, description },
      };
    },

    searchSource(
      sourceId: string,
      title: string,
      url: string,
      extra: Partial<SearchSourceFoundEvent["data"]> = {},
      taskId?: TaskId
    ): SearchSourceFoundEvent {
      return {
        ...nextBase(taskId),
        type: "search.source",
        data: { sourceId, title, url, ...extra },
      };
    },

    heartbeat(status?: string): HeartbeatEvent {
      return {
        ...nextBase(),
        type: "heartbeat",
        data: { status },
      };
    },

    /** Raw escape hatch – use only when the typed helpers are insufficient */
    raw<T extends StreamEvent>(partial: Omit<T, keyof ReturnType<typeof nextBase>> & { type: T["type"] }): T {
      return { ...nextBase((partial as any).taskId), ...partial } as T;
    },
  };
}

export type EventFactory = ReturnType<typeof createEventFactory>;
