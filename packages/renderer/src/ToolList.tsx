import React, { memo, useState } from "react";
import type { ToolCallState } from "@nyven-stream/core";
import { StatusDot, statusToTone } from "./StatusDot";
import { toolCompletedLabel, toolRunningLabel } from "./labels";

interface Props {
  tools: Map<string, ToolCallState>;
}

export const ToolList = memo(function ToolList({ tools }: Props) {
  const list = Array.from(tools.values());
  if (list.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Tools">
      {list.map((t) => (
        <ToolRow key={t.id} tool={t} />
      ))}
    </ul>
  );
});

function ToolRow({ tool }: { tool: ToolCallState }) {
  const [open, setOpen] = useState(false);
  const label =
    tool.status === "running"
      ? toolRunningLabel(tool)
      : tool.status === "completed"
        ? toolCompletedLabel(tool)
        : tool.name;

  const hasDetails =
    tool.input != null || tool.output != null || tool.result != null || tool.error;

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-800/30 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-nyven-500/40"
        onClick={() => hasDetails && setOpen((v) => !v)}
        aria-expanded={hasDetails ? open : undefined}
        disabled={!hasDetails}
      >
        <StatusDot tone={statusToTone(tool.status)} label={tool.status} />
        <span className="flex-1 text-slate-200 truncate">{label}</span>
        {tool.durationMs != null && (
          <span className="text-[11px] text-slate-500 tabular-nums">
            {tool.durationMs}ms
          </span>
        )}
      </button>
      {open && hasDetails && (
        <div className="px-3 pb-2.5 text-xs text-slate-400 space-y-1 border-t border-slate-800/80 pt-2 font-mono">
          {tool.error && (
            <div className="text-red-400">
              {tool.error.code}: {tool.error.message}
            </div>
          )}
          {tool.result != null && (
            <div className="text-emerald-400/80 truncate">
              → {safeStringify(tool.result)}
            </div>
          )}
          {tool.input != null && (
            <div className="truncate opacity-70">
              in: {safeStringify(tool.input)}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function safeStringify(v: unknown): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return s.length > 160 ? s.slice(0, 157) + "…" : s;
  } catch {
    return String(v);
  }
}
