import React, { memo, useState } from "react";
import type { FileState } from "@nyven-stream/core";
import { fileBasename } from "./labels";

interface Props {
  files: Map<string, FileState>;
}

export const FileList = memo(function FileList({ files }: Props) {
  const list = Array.from(files.values());
  if (list.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Files">
      {list.map((f) => (
        <FileRow key={f.id} file={f} />
      ))}
    </ul>
  );
});

function FileRow({ file }: { file: FileState }) {
  const [open, setOpen] = useState(false);
  const mark =
    file.status === "created" ? "+" : file.status === "deleted" ? "–" : "~";

  return (
    <li className="rounded-lg border border-slate-800 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-nyven-500/40"
        onClick={() => file.content && setOpen((v) => !v)}
        aria-expanded={file.content ? open : undefined}
        disabled={!file.content}
      >
        <span className="text-slate-500 font-mono text-xs w-3">{mark}</span>
        <span className="font-mono text-nyven-300 text-xs truncate">
          {file.path}
        </span>
        {file.language && (
          <span className="ml-auto text-[10px] text-slate-600 uppercase">
            {file.language}
          </span>
        )}
      </button>
      {open && file.content && (
        <pre className="px-3 py-2 text-xs font-mono text-slate-300 bg-black/30 overflow-x-auto max-h-56 border-t border-slate-800 whitespace-pre-wrap">
          {file.content}
        </pre>
      )}
    </li>
  );
}
