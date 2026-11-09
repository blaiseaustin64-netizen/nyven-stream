import React from "react";
import type { StreamViewState } from "@nyven-stream/core";
import { streamStatusLabel } from "./labels";
import { StatusDot, statusToTone } from "./StatusDot";

interface Props {
  state: StreamViewState;
  onCancel?: () => void;
  hideCancel?: boolean;
}

export function StreamControls({ state, onCancel, hideCancel }: Props) {
  const active = state.status === "active";
  const showStop = active && onCancel && !hideCancel;

  return (
    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
      <div className="flex items-center gap-2">
        <StatusDot tone={statusToTone(state.status)} label={state.status} />
        <span className="capitalize">{streamStatusLabel(state.status)}</span>
        {state.lastSeq > 0 && (
          <span className="text-slate-600 tabular-nums">· seq {state.lastSeq}</span>
        )}
      </div>
      {showStop && (
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-red-400 border border-red-600/30 bg-red-600/10 hover:bg-red-600/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 transition-colors"
          aria-label="Stop stream"
        >
          Stop
        </button>
      )}
    </div>
  );
}
