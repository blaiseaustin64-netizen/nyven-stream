import React, { memo } from "react";
import type { TaskState } from "@nyven-stream/core";
import { StatusDot, statusToTone } from "./StatusDot";

interface Props {
  tasks: Map<string, TaskState>;
  rootIds: string[];
  depth?: number;
}

function TaskRow({
  task,
  depth,
  tasks,
}: {
  task: TaskState;
  depth: number;
  tasks: Map<string, TaskState>;
}) {
  return (
    <div style={{ paddingLeft: depth * 14 }} className="py-1">
      <div className="flex items-center gap-2 text-sm">
        {task.status === "running" ? (
          <span
            className="w-3.5 h-3.5 rounded-full border-2 border-nyven-400 border-t-transparent ns-spin shrink-0"
            aria-hidden
          />
        ) : (
          <StatusDot
            tone={statusToTone(task.status)}
            className="w-2 h-2"
            label={task.status}
          />
        )}
        <span className="text-slate-200 truncate">{task.title}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-600 shrink-0">
          {task.kind}
        </span>
        {typeof task.percent === "number" && (
          <span className="text-xs text-slate-500 ml-auto tabular-nums">
            {task.percent}%
          </span>
        )}
      </div>
      {task.message && (
        <div
          className="text-xs text-slate-500 mt-0.5"
          style={{ paddingLeft: 22 }}
        >
          {task.message}
        </div>
      )}
      {task.error && (
        <div
          className="text-xs text-red-400/90 mt-0.5"
          style={{ paddingLeft: 22 }}
        >
          {task.error.message}
        </div>
      )}
      {task.children.map((cid) => {
        const child = tasks.get(cid);
        if (!child) return null;
        return (
          <TaskRow key={cid} task={child} depth={depth + 1} tasks={tasks} />
        );
      })}
    </div>
  );
}

export const TaskTree = memo(function TaskTree({
  tasks,
  rootIds,
  depth = 0,
}: Props) {
  if (rootIds.length === 0) return null;
  return (
    <div role="list" aria-label="Tasks">
      {rootIds.map((id) => {
        const task = tasks.get(id);
        if (!task) return null;
        return (
          <div key={id} role="listitem">
            <TaskRow task={task} depth={depth} tasks={tasks} />
          </div>
        );
      })}
    </div>
  );
});
