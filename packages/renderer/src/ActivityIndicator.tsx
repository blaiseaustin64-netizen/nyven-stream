import React from "react";
import type { StreamViewState } from "@nyven-stream/core";
import {
  deriveActivitySummary,
  hasExpandableDetails,
  shouldShowActivityIndicator,
} from "./labels";
import { StatusDot, statusToTone } from "./StatusDot";

interface Props {
  state: StreamViewState;
  expanded: boolean;
  onToggle: () => void;
  expandable: boolean;
}

export function ActivityIndicator({
  state,
  expanded,
  onToggle,
  expandable,
}: Props) {
  if (!shouldShowActivityIndicator(state)) return null;

  const summary = deriveActivitySummary(state);
  if (!summary) return null;

  const tone = statusToTone(
    state.status === "active"
      ? "running"
      : state.status
  );

  const canExpand = expandable && hasExpandableDetails(state);

  return (
    <div className="ns-activity-indicator rounded-xl border border-slate-800/80 bg-surface-raised/80 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-slate-800/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-nyven-500/50 focus-visible:ring-inset"
        onClick={() => canExpand && onToggle()}
        aria-expanded={canExpand ? expanded : undefined}
        aria-controls={canExpand ? "ns-activity-panel" : undefined}
        disabled={!canExpand}
      >
        <StatusDot tone={tone} label={state.status} />
        <span className="flex-1 min-w-0 text-sm text-slate-200 truncate">
          {summary}
        </span>
        {canExpand && (
          <span className="text-[11px] text-slate-500 shrink-0">
            {expanded ? "Hide" : "Details"}
          </span>
        )}
      </button>
    </div>
  );
}
