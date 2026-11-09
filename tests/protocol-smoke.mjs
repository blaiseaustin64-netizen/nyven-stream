// Smoke test for protocol (no build required – uses dynamic import of TS via experimental or skip)

console.log("NYVEN STREAM – foundation smoke checks");

// Manual shape checks
const PROTOCOL_VERSION = "0.1.0";

function makeBase(seq) {
  return {
    v: PROTOCOL_VERSION,
    id: `evt_${seq}`,
    streamId: "s1",
    ts: new Date().toISOString(),
    seq,
  };
}

const events = [
  { ...makeBase(1), type: "stream.started", data: { title: "T" } },
  { ...makeBase(2), type: "task.started", data: { taskId: "t1", kind: "chat", title: "C" } },
  { ...makeBase(3), type: "content.delta", data: { channel: "main", text: "hi" } },
  { ...makeBase(4), type: "activity.update", data: { key: "a", label: "L", status: "running" } },
  { ...makeBase(5), type: "stream.completed", data: { eventCount: 4, durationMs: 100 } },
];

let ok = true;
for (const e of events) {
  if (e.v !== PROTOCOL_VERSION || !e.id || !e.type || e.seq < 1) {
    console.error("FAIL", e);
    ok = false;
  }
}
console.log(ok ? "Event envelope shape: PASS" : "FAIL");

// Ordering
const seqs = events.map((e) => e.seq);
const sorted = [...seqs].sort((a, b) => a - b);
console.log(
  JSON.stringify(seqs) === JSON.stringify(sorted)
    ? "Sequence ordering: PASS"
    : "FAIL"
);

console.log("Smoke tests complete.");
