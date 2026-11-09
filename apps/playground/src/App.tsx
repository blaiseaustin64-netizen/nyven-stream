import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyEvent,
  createEmptyState,
  type StreamViewState,
  Stream,
} from "@nyven-stream/core";
import type { StreamEvent } from "@nyven-stream/protocol";
import {
  createProducerRegistry,
  registerDemoProducers,
  runProducer,
  type StreamProducer,
} from "@nyven-stream/adapters";
import { StreamView } from "@nyven-stream/renderer";
import { ScenarioPicker, type ScenarioOption } from "./components/ScenarioPicker";
import { Header } from "./components/Header";
import { MessageInput } from "./components/MessageInput";
import {
  checkWorkerHealth,
  connectWorkerSse,
  createWorkerStream,
  getWorkerBaseUrl,
  type WorkerStreamSession,
} from "./workerClient";

const registry = createProducerRegistry();
registerDemoProducers(registry);

const SCENARIOS: ScenarioOption[] = [
  {
    id: "chat",
    title: "Normal Chat",
    description: "Workers AI (Worker mode) or demo producer (Local)",
  },
  { id: "search", title: "Web Search", description: "Demo: activity + sources + answer" },
  { id: "planning", title: "Planning", description: "Demo: nested plan steps" },
  { id: "coding", title: "Code / Files", description: "Demo: file events + code" },
  { id: "agent", title: "Nested Agent", description: "Demo: agent + tools" },
  { id: "error", title: "Error", description: "Demo: safe error presentation" },
  { id: "long", title: "Cancellation", description: "Demo: long work — use Stop" },
  { id: "final-only", title: "Final only", description: "Demo: no intermediate activity" },
];

type Mode = "local" | "worker";

/** Build the request input for a capability from the user message. */
function buildInput(capability: string, message: string): unknown {
  const text = message.trim();
  if (capability === "chat") {
    return {
      prompt: text,
      messages: [{ role: "user", content: text }],
    };
  }
  if (capability === "search") {
    return { query: text || "NYVEN STREAM architecture" };
  }
  // Other demo producers ignore input; pass message when present for future use.
  return text ? { prompt: text } : {};
}

export default function App() {
  const [mode, setMode] = useState<Mode>("worker");
  const [state, setState] = useState<StreamViewState | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("chat");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [eventLog, setEventLog] = useState<StreamEvent[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [liveStream, setLiveStream] = useState<Stream | null>(null);
  const [workerSession, setWorkerSession] =
    useState<WorkerStreamSession | null>(null);
  const [workerStatus, setWorkerStatus] = useState<string>("");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const known = useMemo(() => new Set(registry.list()), []);

  const selectedScenario = SCENARIOS.find((s) => s.id === selectedId);
  const isRealAi = mode === "worker" && selectedId === "chat";
  const requiresMessage = selectedId === "chat";

  useEffect(() => {
    if (mode !== "worker") {
      setWorkerStatus("");
      return;
    }
    let cancelled = false;
    checkWorkerHealth().then((h) => {
      if (cancelled) return;
      if (h.ok) {
        setWorkerStatus(`Connected · ${getWorkerBaseUrl()}`);
        setConnectionError(null);
      } else {
        setWorkerStatus("");
        setConnectionError(
          `Worker unreachable at ${getWorkerBaseUrl()}. Start with: npm run dev:worker`
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const stop = useCallback(() => {
    abortController?.abort();
    if (
      liveStream &&
      (liveStream.status === "active" || liveStream.status === "starting")
    ) {
      liveStream.cancel("user stop", "client");
    }
    if (workerSession) {
      void workerSession.cancel();
      setWorkerSession(null);
    }
    setRunning(false);
  }, [abortController, liveStream, workerSession]);

  const reset = useCallback(() => {
    stop();
    setState(null);
    setEventLog([]);
    setActiveId(null);
    setLiveStream(null);
    setConnectionError(null);
  }, [stop]);

  const pushEventToState = useCallback((event: StreamEvent, streamId: string) => {
    setEventLog((prev) => [...prev, event]);
    setState((prev) =>
      prev
        ? applyEvent(prev, event)
        : applyEvent(createEmptyState(streamId), event)
    );
  }, []);

  const runLocal = useCallback(
    async (id: string, input: unknown) => {
      abortController?.abort();
      liveStream?.cancel("superseded", "client");

      const ac = new AbortController();
      setAbortController(ac);
      setRunning(true);
      setActiveId(id);
      setEventLog([]);
      setConnectionError(null);

      const stream = new Stream({
        title: id,
        meta: { simulation: true, capability: id, mode: "local" },
        onEvent: (event) => pushEventToState(event, stream.id),
      });
      setLiveStream(stream);
      setState(createEmptyState(stream.id));
      stream.start();

      ac.signal.addEventListener(
        "abort",
        () => {
          if (stream.status === "active" || stream.status === "starting") {
            stream.cancel("user stop", "client");
          }
        },
        { once: true }
      );

      try {
        const producer = registry.require(id) as StreamProducer;
        await runProducer({
          stream,
          producer,
          signal: ac.signal,
          capability: id,
          input,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        setRunning(false);
        setAbortController(null);
      }
    },
    [abortController, liveStream, pushEventToState]
  );

  const runWorker = useCallback(
    async (id: string, input: unknown) => {
      stop();
      setRunning(true);
      setActiveId(id);
      setEventLog([]);
      setState(null);
      setConnectionError(null);

      try {
        const health = await checkWorkerHealth();
        if (!health.ok) {
          setConnectionError(
            `Worker unreachable at ${getWorkerBaseUrl()}. ${health.error || ""} Start with: npm run dev:worker`
          );
          setRunning(false);
          return;
        }

        const created = await createWorkerStream(id, input);
        setState(createEmptyState(created.streamId));

        const session = connectWorkerSse(created.sseUrl, {
          onEvent: (event) => {
            pushEventToState(event, created.streamId);
            if (
              event.type === "stream.completed" ||
              event.type === "stream.error" ||
              event.type === "stream.cancelled"
            ) {
              setRunning(false);
            }
          },
          onError: (err) => {
            setConnectionError(err.message);
            setRunning(false);
          },
          onClose: () => setRunning(false),
        });
        setWorkerSession(session);
      } catch (err) {
        setConnectionError(
          err instanceof Error ? err.message : "Failed to start Worker stream"
        );
        setRunning(false);
      }
    },
    [pushEventToState, stop]
  );

  const handleSend = useCallback(() => {
    const id = selectedId;
    if (!id) return;
    if (!known.has(id) && mode === "local") return;

    const trimmed = message.trim();
    if (requiresMessage && !trimmed) {
      setConnectionError("Enter a message before sending Normal Chat.");
      return;
    }

    const input = buildInput(id, message);
    // Clear input after a successful send kickoff
    setMessage("");
    setConnectionError(null);

    if (mode === "worker") void runWorker(id, input);
    else void runLocal(id, input);
  }, [
    selectedId,
    known,
    mode,
    message,
    requiresMessage,
    runWorker,
    runLocal,
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-surface text-slate-100">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6">
        {/* Mode toggle */}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-500 text-xs uppercase tracking-wider">
            Mode
          </span>
          <div className="inline-flex rounded-lg border border-slate-800 overflow-hidden">
            <button
              type="button"
              className={`px-3 py-1.5 text-xs ${
                mode === "local"
                  ? "bg-nyven-600/30 text-white"
                  : "text-slate-400 hover:bg-slate-800/60"
              }`}
              onClick={() => {
                reset();
                setMode("local");
              }}
            >
              Local demo
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 text-xs ${
                mode === "worker"
                  ? "bg-nyven-600/30 text-white"
                  : "text-slate-400 hover:bg-slate-800/60"
              }`}
              onClick={() => {
                reset();
                setMode("worker");
              }}
            >
              Worker SSE
            </button>
          </div>
          {mode === "worker" && workerStatus && (
            <span className="text-xs text-emerald-400/90">{workerStatus}</span>
          )}
          {isRealAi && (
            <span className="text-xs text-emerald-400/90">
              Normal Chat → Cloudflare Workers AI
            </span>
          )}
        </div>

        {connectionError && (
          <div
            className="rounded-xl border border-amber-600/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-200"
            role="alert"
          >
            {connectionError}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-72 shrink-0">
            <ScenarioPicker
              scenarios={SCENARIOS}
              activeId={selectedId}
              running={running}
              onSelect={(id) => {
                if (!running) setSelectedId(id);
              }}
              onStop={stop}
              onReset={reset}
            />
            <p className="mt-3 text-[11px] text-slate-600 leading-relaxed px-1">
              Select a capability, type a message, then Send. In Worker mode,{" "}
              <strong className="text-slate-400">Normal Chat</strong> uses the
              real Workers AI binding — other capabilities stay as demos.
            </p>
          </aside>

          <section className="flex-1 min-w-0 space-y-4">
            <MessageInput
              value={message}
              onChange={setMessage}
              onSend={handleSend}
              disabled={running}
              realAi={isRealAi}
              requireText={requiresMessage}
              capabilityLabel={selectedScenario?.title}
              placeholder={
                isRealAi
                  ? "Ask NYVEN anything… (Workers AI)"
                  : selectedId === "chat"
                    ? "Message for demo chat…"
                    : "Optional note, then Send to run the demo…"
              }
            />

            {state ? (
              <StreamView state={state} onCancel={running ? stop : undefined} />
            ) : (
              <div className="rounded-xl border border-slate-800/80 bg-surface-raised p-10 sm:p-12 text-center text-slate-400">
                <div className="text-3xl mb-4 opacity-30" aria-hidden>
                  ◈
                </div>
                <p className="text-lg font-medium text-slate-300 mb-2">
                  NYVEN STREAM Experience
                </p>
                <p className="text-sm max-w-md mx-auto leading-relaxed">
                  {mode === "worker"
                    ? "Worker mode is connected to the SSE gateway. Choose Normal Chat, enter a message, and Send to stream a real Workers AI response."
                    : "Local mode runs demo producers in-browser. Select a capability and Send."}
                </p>
                {activeId && (
                  <p className="text-xs text-slate-500 mt-3">
                    Last run: {activeId}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="rounded-xl border border-slate-800/80 overflow-hidden bg-surface-raised/40">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-400 hover:text-slate-200"
            onClick={() => setShowLog((v) => !v)}
            aria-expanded={showLog}
          >
            <span>
              Event log{" "}
              <span className="text-slate-600">({eventLog.length})</span>
            </span>
            <span className="text-xs">{showLog ? "Hide" : "Show"}</span>
          </button>
          {showLog && (
            <div className="border-t border-slate-800 max-h-56 overflow-auto p-3 font-mono text-[11px] space-y-1">
              {eventLog.length === 0 && (
                <div className="text-slate-600">No events yet</div>
              )}
              {eventLog.map((e) => (
                <div key={e.id} className="flex gap-3">
                  <span className="text-slate-600 w-8 shrink-0">{e.seq}</span>
                  <span className="text-nyven-400 w-36 shrink-0">{e.type}</span>
                  <span className="text-slate-500 truncate">
                    {JSON.stringify(e.data).slice(0, 100)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-800/60 py-4 text-center text-xs text-slate-600">
        NYVEN STREAM · {mode === "worker" ? "Worker SSE" : "Local"}
        {isRealAi ? " · Workers AI chat" : ""} · Renderer v0.1
      </footer>
    </div>
  );
}
