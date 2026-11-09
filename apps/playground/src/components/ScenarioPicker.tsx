export interface ScenarioOption {
  id: string;
  title: string;
  description: string;
}

interface Props {
  scenarios: ScenarioOption[];
  activeId: string | null;
  running: boolean;
  onSelect: (id: string) => void;
  onStop: () => void;
  onReset: () => void;
}

export function ScenarioPicker({
  scenarios,
  activeId,
  running,
  onSelect,
  onStop,
  onReset,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-surface-raised/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Capabilities</h2>
        {running && (
          <button
            type="button"
            className="text-xs px-2 py-1 rounded-lg text-red-400 border border-red-600/30 bg-red-600/10 hover:bg-red-600/20"
            onClick={onStop}
          >
            Stop
          </button>
        )}
      </div>

      <div className="space-y-1.5" role="list">
        {scenarios.map((s) => {
          const isActive = activeId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="listitem"
              disabled={running && !isActive}
              onClick={() => onSelect(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-nyven-500/40 ${
                isActive
                  ? "bg-nyven-600/20 border border-nyven-500/40 text-white"
                  : "hover:bg-slate-800/60 border border-transparent text-slate-300"
              } disabled:opacity-40`}
            >
              <div className="font-medium text-sm">{s.title}</div>
              <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                {s.description}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="w-full text-xs text-slate-400 hover:text-slate-200 py-2"
        onClick={onReset}
      >
        Reset
      </button>

      <p className="text-[10px] text-slate-600 leading-relaxed pt-2 border-t border-slate-800">
        Demo producers implement the same{" "}
        <strong className="text-slate-500">StreamProducer</strong> contract.
        The view is <strong className="text-slate-500">@nyven-stream/renderer</strong>.
      </p>
    </div>
  );
}
