export function Header() {
  return (
    <header className="border-b border-slate-800/80 bg-surface-raised/50 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-nyven-500 to-nyven-700 flex items-center justify-center text-sm font-bold shadow-lg shadow-nyven-900/40">
            N
          </div>
          <div>
            <div className="font-semibold tracking-tight">NYVEN STREAM</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">
              Playground
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700">
            Protocol v0.1
          </span>
          <span className="hidden sm:inline">Independent · Simulation</span>
        </div>
      </div>
    </header>
  );
}
