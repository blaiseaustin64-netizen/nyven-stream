import { useCallback, useRef } from "react";

export interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** Show that real Workers AI will be used */
  realAi?: boolean;
  capabilityLabel?: string;
  /** When true, Send requires non-empty text (chat). */
  requireText?: boolean;
}

/**
 * Chat composer for the playground.
 * Enter sends; Shift+Enter inserts a newline.
 */
export function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Type a message…",
  realAi = false,
  capabilityLabel,
  requireText = true,
}: MessageInputProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && (!requireText || value.trim().length > 0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSend) onSend();
      }
    },
    [canSend, onSend]
  );

  return (
    <div className="rounded-xl border border-slate-800/80 bg-surface-raised/80 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          {capabilityLabel ? (
            <>
              Capability:{" "}
              <span className="text-slate-300">{capabilityLabel}</span>
            </>
          ) : (
            "Select a capability, then send a message"
          )}
        </span>
        {realAi && (
          <span className="px-2 py-0.5 rounded-md bg-emerald-600/15 text-emerald-400 border border-emerald-600/30">
            Workers AI
          </span>
        )}
        {!realAi && capabilityLabel && (
          <span className="px-2 py-0.5 rounded-md bg-slate-700/40 text-slate-400 border border-slate-700">
            Demo
          </span>
        )}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-y min-h-[72px] max-h-48 rounded-lg bg-black/30 border border-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-nyven-500/40 disabled:opacity-50"
        aria-label="Message"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-600">
          Enter to send · Shift+Enter for newline
        </span>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-nyven-600 hover:bg-nyven-500 text-white disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-nyven-500/50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
