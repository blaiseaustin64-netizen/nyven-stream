import React, { memo } from "react";
import type { StreamViewState } from "@nyven-stream/core";
import { TaskTree } from "./TaskTree";
import { ToolList } from "./ToolList";
import { SourceList } from "./SourceList";
import { FileList } from "./FileList";
import { StatusDot, statusToTone } from "./StatusDot";
import { activityLine } from "./labels";

interface Props {
  state: StreamViewState;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

export const ActivityDetails = memo(function ActivityDetails({ state }: Props) {
  const activities = Array.from(state.activities.values());
  const hasTasks = state.tasks.size > 0;
  const hasTools = state.tools.size > 0;
  const hasSources = state.sources.size > 0;
  const hasFiles = state.files.size > 0;
  const hasActivities = activities.length > 0;

  if (!hasTasks && !hasTools && !hasSources && !hasFiles && !hasActivities) {
    return (
      <p className="text-sm text-slate-500 px-1 py-2">No detailed activity yet.</p>
    );
  }

  return (
    <div
      id="ns-activity-panel"
      className="space-y-4 px-3.5 py-3 border-t border-slate-800"
    >
      {hasActivities && (
        <Section title="Activity">
          <ul className="space-y-1.5">
            {activities.map((a) => (
              <li key={a.key} className="flex items-start gap-2 text-sm">
                <StatusDot
                  tone={statusToTone(a.status)}
                  className="mt-1.5"
                  label={a.status}
                />
                <div className="min-w-0">
                  <div className="text-slate-200">{activityLine(a)}</div>
                  {a.detail && (
                    <div className="text-xs text-slate-500 mt-0.5">{a.detail}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {hasTasks && (
        <Section title="Tasks">
          <TaskTree tasks={state.tasks} rootIds={state.rootTaskIds} />
        </Section>
      )}

      {hasTools && (
        <Section title="Tools">
          <ToolList tools={state.tools} />
        </Section>
      )}

      {hasSources && (
        <Section title="Sources">
          <SourceList sources={state.sources} />
        </Section>
      )}

      {hasFiles && (
        <Section title="Files">
          <FileList files={state.files} />
        </Section>
      )}
    </div>
  );
});
