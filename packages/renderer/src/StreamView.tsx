import React, { useMemo, useState } from "react";
import type { StreamViewProps } from "./types";
import { ActivityIndicator } from "./ActivityIndicator";
import { ActivityDetails } from "./ActivityDetails";
import { ContentArea } from "./ContentArea";
import { StreamControls } from "./StreamControls";
import { hasExpandableDetails } from "./labels";
import "./styles.css";

/**
 * Primary NYVEN STREAM experience surface.
 * Renders derived StreamViewState only — no transport, no providers.
 */
export function StreamView({
  state,
  onCancel,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  className = "",
  hideCancel,
}: StreamViewProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const setExpanded = (v: boolean) => {
    if (onExpandedChange) onExpandedChange(v);
    if (controlledExpanded === undefined) setInternalExpanded(v);
  };

  const expandable = useMemo(() => hasExpandableDetails(state), [state]);

  return (
    <div
      className={`ns-stream-view space-y-3 ${className}`}
      data-status={state.status}
      role="region"
      aria-label={state.title ? `Stream: ${state.title}` : "Stream"}
    >
      <StreamControls
        state={state}
        onCancel={onCancel}
        hideCancel={hideCancel}
      />

      <div className="rounded-xl border border-slate-800/80 bg-surface-raised/50 overflow-hidden">
        <ActivityIndicator
          state={state}
          expanded={expanded}
          onToggle={() => setExpanded(!expanded)}
          expandable={expandable}
        />
        {expanded && expandable && <ActivityDetails state={state} />}
      </div>

      <ContentArea state={state} />

      {state.status === "error" && state.error && (
        <div
          className="rounded-xl border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-300"
          role="alert"
        >
          <div className="font-medium text-red-200">{state.error.code}</div>
          <div className="mt-0.5 text-red-300/90">{state.error.message}</div>
        </div>
      )}

      {state.status === "cancelled" && (
        <div
          className="rounded-xl border border-amber-600/25 bg-amber-600/10 px-4 py-3 text-sm text-amber-200/90"
          role="status"
        >
          Stream stopped.
        </div>
      )}
    </div>
  );
}
