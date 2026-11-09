/**
 * Derive human-friendly presentation labels from stream state.
 * Never invents work — only reflects what events already produced.
 */

import type {
  StreamViewState,
  TaskState,
  ActivityState,
  ToolCallState,
  FileState,
  SourceState,
} from "@nyven-stream/core";

/** Compact one-line summary for the activity indicator. Empty if nothing to show. */
export function deriveActivitySummary(state: StreamViewState): string {
  // Prefer live activity labels (already user-facing from producers)
  const activities = Array.from(state.activities.values());
  const runningAct = activities.find((a) => a.status === "running");
  if (runningAct?.label) return runningAct.label;

  const latestAct = activities.sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "")
  )[0];
  if (latestAct?.status === "running" && latestAct.label) return latestAct.label;

  // Running tasks
  const runningTasks = Array.from(state.tasks.values()).filter(
    (t) => t.status === "running"
  );
  if (runningTasks.length === 1) {
    return runningTasks[0].title || taskKindLabel(runningTasks[0]);
  }
  if (runningTasks.length > 1) {
    return `${runningTasks.length} tasks in progress`;
  }

  // Running tools
  const runningTools = Array.from(state.tools.values()).filter(
    (t) => t.status === "running"
  );
  if (runningTools.length === 1) {
    return toolRunningLabel(runningTools[0]);
  }
  if (runningTools.length > 1) {
    return `Using ${runningTools.length} tools`;
  }

  // Stream-level status when active but no detail yet
  if (state.status === "active") {
    if (state.title) return state.title;
    return "Working…";
  }

  if (state.status === "completed") return "Done";
  if (state.status === "cancelled") return "Stopped";
  if (state.status === "error") {
    return state.error?.message || "Something went wrong";
  }

  return "";
}

export function taskKindLabel(task: TaskState): string {
  const kind = String(task.kind || "task");
  const map: Record<string, string> = {
    chat: "Conversation",
    thinking: "Thinking",
    search: "Searching",
    research: "Researching",
    planning: "Planning",
    coding: "Coding",
    build: "Building",
    agent: "Agent",
    tool: "Tool",
    analysis: "Analyzing",
    math: "Calculating",
    design: "Designing",
    writing: "Writing",
    custom: "Working",
  };
  return map[kind] || task.title || kind;
}

export function toolRunningLabel(tool: ToolCallState): string {
  const name = (tool.name || "tool").toLowerCase();
  if (name.includes("search") || name.includes("web")) return "Searching the web";
  if (name.includes("calc") || name.includes("math")) return "Calculating";
  if (name.includes("read") || name.includes("file")) return "Reading files";
  if (tool.description) return tool.description;
  return `Using ${tool.name}`;
}

export function toolCompletedLabel(tool: ToolCallState): string {
  return `${tool.name || "Tool"} completed`;
}

export function fileStatusLabel(file: FileState): string {
  switch (file.status) {
    case "created":
      return `Created ${fileBasename(file.path)}`;
    case "modified":
      return `Updated ${fileBasename(file.path)}`;
    case "deleted":
      return `Removed ${fileBasename(file.path)}`;
    default:
      return fileBasename(file.path);
  }
}

export function fileBasename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Whether the compact indicator should show (any meaningful activity or active stream). */
export function shouldShowActivityIndicator(state: StreamViewState): boolean {
  if (state.activities.size > 0) return true;
  if (state.tasks.size > 0) return true;
  if (state.tools.size > 0) return true;
  if (state.status === "active") return true;
  if (state.status === "error" || state.status === "cancelled") return true;
  return false;
}

/** Whether expanded panel has anything substantive beyond the one-liner. */
export function hasExpandableDetails(state: StreamViewState): boolean {
  return (
    state.tasks.size > 0 ||
    state.tools.size > 0 ||
    state.sources.size > 0 ||
    state.files.size > 0 ||
    state.activities.size > 1 ||
    Array.from(state.tasks.values()).some((t) => t.children.length > 0)
  );
}

export function streamStatusLabel(status: StreamViewState["status"]): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    case "error":
      return "Error";
    case "cancelled":
      return "Stopped";
    default:
      return String(status);
  }
}

/** Safe activity line from ActivityState (producer-supplied label only). */
export function activityLine(a: ActivityState): string {
  return a.label || a.key;
}

export function sourceTitle(s: SourceState): string {
  return s.title || sourceDomain(s.url) || "Source";
}
