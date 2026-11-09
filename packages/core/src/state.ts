/**
 * Stream State Manager
 *
 * Maintains a derived, UI-friendly view of a stream from the event log.
 * Supports nested tasks, content channels, activities, tools, files, sources.
 */

import type {
  StreamEvent,
  TaskId,
  TaskKind,
  SourceId,
  FileId,
  ToolCallId,
} from "@nyven-stream/protocol";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TaskState {
  id: TaskId;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  parentTaskId?: TaskId;
  percent?: number | null;
  message?: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: { code: string; message: string };
  children: TaskId[];
}

export interface ContentChannel {
  channel: string;
  text: string;
  complete: boolean;
  mime?: string;
}

export interface ActivityState {
  key: string;
  label: string;
  status?: "running" | "success" | "error" | "pending";
  detail?: string;
  icon?: string;
  updatedAt: string;
}

export interface ToolCallState {
  id: ToolCallId;
  name: string;
  description?: string;
  status: "running" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  result?: unknown;
  error?: { code: string; message: string };
  startedAt?: string;
  durationMs?: number;
}

export interface FileState {
  id: FileId;
  path: string;
  language?: string;
  content: string;
  status: "created" | "modified" | "deleted";
}

export interface SourceState {
  id: SourceId;
  title: string;
  url: string;
  snippet?: string;
  favicon?: string;
  rank?: number;
}

/** Status visible in UI state (derived from protocol events). */
export type StreamViewStatus =
  | "idle"
  | "active"
  | "completed"
  | "error"
  | "cancelled";

export interface StreamViewState {

  streamId: string;
  status: StreamViewStatus;
  title?: string;
  tasks: Map<TaskId, TaskState>;
  rootTaskIds: TaskId[];
  channels: Map<string, ContentChannel>;
  activities: Map<string, ActivityState>;
  tools: Map<ToolCallId, ToolCallState>;
  files: Map<FileId, FileState>;
  sources: Map<SourceId, SourceState>;
  lastSeq: number;
  error?: { code: string; message: string };
}

export function createEmptyState(streamId: string): StreamViewState {
  return {
    streamId,
    status: "idle",
    tasks: new Map(),
    rootTaskIds: [],
    channels: new Map(),
    activities: new Map(),
    tools: new Map(),
    files: new Map(),
    sources: new Map(),
    lastSeq: 0,
  };
}

/**
 * Apply a single event to state (pure, returns new state).
 * Designed for immutable updates so React can detect changes.
 */
export function applyEvent(
  prev: StreamViewState,
  event: StreamEvent
): StreamViewState {
  // Shallow clone containers we might mutate
  const state: StreamViewState = {
    ...prev,
    tasks: new Map(prev.tasks),
    channels: new Map(prev.channels),
    activities: new Map(prev.activities),
    tools: new Map(prev.tools),
    files: new Map(prev.files),
    sources: new Map(prev.sources),
    rootTaskIds: [...prev.rootTaskIds],
    lastSeq: event.seq,
  };

  switch (event.type) {
    case "stream.started":
      state.status = "active";
      state.title = event.data.title;
      break;

    case "stream.completed":
      state.status = "completed";
      break;

    case "stream.error":
      state.status = "error";
      state.error = { code: event.data.code, message: event.data.message };
      break;

    case "stream.cancelled":
      state.status = "cancelled";
      break;

    case "task.started": {
      const t = event.data;
      const task: TaskState = {
        id: t.taskId,
        kind: t.kind,
        title: t.title,
        status: "running",
        parentTaskId: t.parentTaskId,
        startedAt: event.ts,
        children: [],
      };
      state.tasks.set(t.taskId, task);
      if (t.parentTaskId) {
        const parent = state.tasks.get(t.parentTaskId);
        if (parent) {
          parent.children = [...parent.children, t.taskId];
          state.tasks.set(t.parentTaskId, { ...parent });
        }
      } else {
        state.rootTaskIds.push(t.taskId);
      }
      break;
    }

    case "task.progress": {
      const task = state.tasks.get(event.data.taskId);
      if (task) {
        state.tasks.set(event.data.taskId, {
          ...task,
          percent: event.data.percent,
          message: event.data.message,
        });
      }
      break;
    }

    case "task.completed": {
      const task = state.tasks.get(event.data.taskId);
      if (task) {
        state.tasks.set(event.data.taskId, {
          ...task,
          status: "completed",
          result: event.data.result,
          completedAt: event.ts,
        });
      }
      break;
    }

    case "task.failed": {
      const task = state.tasks.get(event.data.taskId);
      if (task) {
        state.tasks.set(event.data.taskId, {
          ...task,
          status: "failed",
          error: { code: event.data.code, message: event.data.message },
          completedAt: event.ts,
        });
      }
      break;
    }

    case "task.cancelled": {
      const task = state.tasks.get(event.data.taskId);
      if (task) {
        state.tasks.set(event.data.taskId, {
          ...task,
          status: "cancelled",
          completedAt: event.ts,
        });
      }
      break;
    }

    case "content.delta": {
      const ch = state.channels.get(event.data.channel) ?? {
        channel: event.data.channel,
        text: "",
        complete: false,
        mime: event.data.mime,
      };
      state.channels.set(event.data.channel, {
        ...ch,
        text: ch.text + event.data.text,
        mime: event.data.mime ?? ch.mime,
      });
      break;
    }

    case "content.replace": {
      state.channels.set(event.data.channel, {
        channel: event.data.channel,
        text: event.data.text,
        complete: false,
        mime: event.data.mime,
      });
      break;
    }

    case "content.complete": {
      const ch = state.channels.get(event.data.channel);
      if (ch) {
        state.channels.set(event.data.channel, {
          ...ch,
          text: event.data.text ?? ch.text,
          complete: true,
        });
      }
      break;
    }

    case "activity.update": {
      state.activities.set(event.data.key, {
        key: event.data.key,
        label: event.data.label,
        status: event.data.status,
        detail: event.data.detail,
        icon: event.data.icon,
        updatedAt: event.ts,
      });
      break;
    }

    case "activity.clear": {
      if (event.data.key) {
        state.activities.delete(event.data.key);
      } else {
        state.activities.clear();
      }
      break;
    }

    case "tool.started": {
      state.tools.set(event.data.toolCallId, {
        id: event.data.toolCallId,
        name: event.data.name,
        description: event.data.description,
        status: "running",
        startedAt: event.ts,
      });
      break;
    }

    case "tool.input": {
      const tool = state.tools.get(event.data.toolCallId);
      if (tool) {
        state.tools.set(event.data.toolCallId, {
          ...tool,
          input: event.data.input,
        });
      }
      break;
    }

    case "tool.output": {
      const tool = state.tools.get(event.data.toolCallId);
      if (tool) {
        state.tools.set(event.data.toolCallId, {
          ...tool,
          output: event.data.partial
            ? (typeof tool.output === "string"
                ? tool.output + String(event.data.output)
                : event.data.output)
            : event.data.output,
        });
      }
      break;
    }

    case "tool.completed": {
      const tool = state.tools.get(event.data.toolCallId);
      if (tool) {
        state.tools.set(event.data.toolCallId, {
          ...tool,
          status: "completed",
          result: event.data.result,
          durationMs: event.data.durationMs,
        });
      }
      break;
    }

    case "tool.failed": {
      const tool = state.tools.get(event.data.toolCallId);
      if (tool) {
        state.tools.set(event.data.toolCallId, {
          ...tool,
          status: "failed",
          error: { code: event.data.code, message: event.data.message },
        });
      }
      break;
    }

    case "file.created": {
      state.files.set(event.data.fileId, {
        id: event.data.fileId,
        path: event.data.path,
        language: event.data.language,
        content: "",
        status: "created",
      });
      break;
    }

    case "file.modified": {
      const f = state.files.get(event.data.fileId);
      if (f) {
        state.files.set(event.data.fileId, {
          ...f,
          status: "modified",
          language: event.data.language ?? f.language,
        });
      }
      break;
    }

    case "file.deleted": {
      const f = state.files.get(event.data.fileId);
      if (f) {
        state.files.set(event.data.fileId, { ...f, status: "deleted" });
      }
      break;
    }

    case "file.content.delta": {
      const f = state.files.get(event.data.fileId) ?? {
        id: event.data.fileId,
        path: event.data.path,
        content: "",
        status: "created" as const,
      };
      state.files.set(event.data.fileId, {
        ...f,
        content: event.data.replace
          ? event.data.text
          : f.content + event.data.text,
      });
      break;
    }

    case "search.source": {
      state.sources.set(event.data.sourceId, {
        id: event.data.sourceId,
        title: event.data.title,
        url: event.data.url,
        snippet: event.data.snippet,
        favicon: event.data.favicon,
        rank: event.data.rank,
      });
      break;
    }

    // search.started / search.completed / progress / heartbeat – no state change needed yet
    default:
      break;
  }

  return state;
}

/** Reduce a full event log into state */
export function reduceEvents(
  streamId: string,
  events: readonly StreamEvent[]
): StreamViewState {
  return events.reduce(applyEvent, createEmptyState(streamId));
}
