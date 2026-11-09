import React, { memo } from "react";
import type { ContentChannel, StreamViewState } from "@nyven-stream/core";
import { SafeMarkdown } from "./markdown";

interface Props {
  state: StreamViewState;
}

/** Prefer main, then other channels in stable order. */
function orderedChannels(
  channels: Map<string, ContentChannel>
): ContentChannel[] {
  const all = Array.from(channels.values()).filter((c) => c.text);
  const main = all.filter((c) => c.channel === "main");
  const rest = all
    .filter((c) => c.channel !== "main")
    .sort((a, b) => a.channel.localeCompare(b.channel));
  return [...main, ...rest];
}

export const ContentArea = memo(function ContentArea({ state }: Props) {
  const channels = orderedChannels(state.channels);
  if (channels.length === 0) return null;

  const streaming = state.status === "active";

  return (
    <div className="space-y-3" aria-live="polite" aria-relevant="additions">
      {channels.map((ch) => (
        <article
          key={ch.channel}
          className="rounded-xl border border-slate-800/80 bg-surface-raised/60 p-4 sm:p-5 ns-fade"
        >
          {ch.channel !== "main" && (
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
              {ch.channel}
            </div>
          )}
          <div className="relative">
            <SafeMarkdown text={ch.text} />
            {streaming && !ch.complete && ch.channel === "main" && (
              <span
                className="inline-block w-1.5 h-4 bg-nyven-400 ml-0.5 align-middle ns-caret"
                aria-hidden
              />
            )}
          </div>
        </article>
      ))}
    </div>
  );
});
