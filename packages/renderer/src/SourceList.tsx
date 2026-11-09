import React, { memo } from "react";
import type { SourceState } from "@nyven-stream/core";
import { sourceDomain, sourceTitle } from "./labels";

interface Props {
  sources: Map<string, SourceState>;
}

export const SourceList = memo(function SourceList({ sources }: Props) {
  const list = Array.from(sources.values()).sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99)
  );
  if (list.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Sources">
      {list.map((s) => (
        <li key={s.id}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 border border-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-nyven-500/40"
          >
            <div className="flex items-start gap-2">
              {s.rank != null && (
                <span className="text-xs text-slate-600 font-mono mt-0.5 tabular-nums">
                  {s.rank}
                </span>
              )}
              <div className="min-w-0">
                <div className="text-sm text-nyven-300 font-medium truncate">
                  {sourceTitle(s)}
                </div>
                <div className="text-xs text-slate-500 truncate mt-0.5">
                  {sourceDomain(s.url)}
                </div>
                {s.snippet && (
                  <div className="text-xs text-slate-400 mt-1.5 line-clamp-2">
                    {s.snippet}
                  </div>
                )}
              </div>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
});
