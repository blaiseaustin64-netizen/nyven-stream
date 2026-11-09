import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Stream,
  StreamRegistry,
  applyEvent,
  createEmptyState,
  reduceEvents,
} from "../packages/core/src/index.ts";
import { createEventFactory } from "../packages/protocol/src/index.ts";

describe("Stream lifecycle", () => {
  it("starts idle and transitions correctly", () => {
    const statuses: string[] = [];
    const s = new Stream({
      title: "Demo",
      onStatusChange: (st) => statuses.push(st),
    });
    assert.equal(s.status, "idle");
    const started = s.start();
    assert.equal(s.status, "active");
    assert.equal(started.type, "stream.started");
    assert.equal(started.data.title, "Demo");
    const completed = s.complete();
    assert.equal(s.status, "completed");
    assert.equal(completed.type, "stream.completed");
    assert.ok(statuses.includes("active"));
    assert.ok(statuses.includes("completed"));
  });

  it("rejects invalid transitions", () => {
    const s = new Stream();
    s.start();
    assert.throws(() => s.start(), /Cannot start/);
    s.complete();
    assert.throws(() => s.push({} as any), /Cannot push/);
  });

  it("rejects mismatched streamId", () => {
    const s = new Stream({ streamId: "mine" });
    s.start();
    const foreign = createEventFactory({ streamId: "other" }).contentDelta(
      "main",
      "x"
    );
    assert.throws(() => s.push(foreign), /streamId mismatch/);
  });

  it("emits via onEvent", () => {
    const received: any[] = [];
    const s = new Stream({ onEvent: (e) => received.push(e) });
    s.start();
    s.push(s.create.contentDelta("main", "hi"));
    s.complete();
    assert.equal(received.length, 3);
    assert.equal(received[0].type, "stream.started");
    assert.equal(received[2].type, "stream.completed");
  });
});

describe("Cancellation & errors", () => {
  it("cancels and aborts signal", () => {
    const s = new Stream();
    s.start();
    assert.equal(s.aborted, false);
    const cancelled = s.cancel("user request", "client");
    assert.equal(s.status, "cancelled");
    assert.equal(s.aborted, true);
    assert.equal(cancelled.type, "stream.cancelled");
    assert.equal(cancelled.data.by, "client");
  });

  it("error transitions", () => {
    const s = new Stream();
    s.start();
    const err = s.error("TIMEOUT", "Model timed out", true);
    assert.equal(s.status, "error");
    assert.equal(err.data.code, "TIMEOUT");
    assert.equal(err.data.retryable, true);
  });

  it("cannot error completed stream", () => {
    const s = new Stream();
    s.start();
    s.complete();
    assert.throws(() => s.error("X", "y"));
  });
});

describe("Content accumulation", () => {
  it("accumulates deltas and handles replace", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.push(s.create.contentDelta("main", "Hello "));
    s.push(s.create.contentDelta("main", "world"));
    s.push(
      s.create.raw({
        type: "content.replace",
        data: { channel: "main", text: "Replaced" },
      } as any)
    );
    s.push(
      s.create.raw({
        type: "content.complete",
        data: { channel: "main" },
      } as any)
    );
    s.complete();
    const state = reduceEvents("s1", s.history);
    assert.equal(state.channels.get("main")?.text, "Replaced");
    assert.equal(state.channels.get("main")?.complete, true);
  });

  it("multiple channels", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.push(s.create.contentDelta("main", "A"));
    s.push(s.create.contentDelta("thinking", "B"));
    s.complete();
    const state = reduceEvents("s1", s.history);
    assert.equal(state.channels.get("main")?.text, "A");
    assert.equal(state.channels.get("thinking")?.text, "B");
  });
});

describe("Nested tasks", () => {
  it("parent-child relationships", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.push(s.create.taskStarted("parent", "agent", "Agent"));
    s.push(
      s.create.taskStarted("child1", "search", "Search", {
        parentTaskId: "parent",
      })
    );
    s.push(
      s.create.taskStarted("child2", "tool", "Tool", { parentTaskId: "parent" })
    );
    s.push(s.create.taskCompleted("child1", { durationMs: 100 }));
    s.push(s.create.taskCompleted("parent", { durationMs: 500 }));
    s.complete();
    const state = reduceEvents("s1", s.history);
    assert.deepEqual(state.rootTaskIds, ["parent"]);
    const parent = state.tasks.get("parent")!;
    assert.deepEqual(parent.children, ["child1", "child2"]);
    assert.equal(parent.status, "completed");
    assert.equal(state.tasks.get("child1")?.status, "completed");
  });
});

describe("Concurrent streams & registry", () => {
  it("isolates streams", () => {
    const reg = new StreamRegistry();
    const a = reg.create({ streamId: "a" });
    const b = reg.create({ streamId: "b" });
    a.start();
    b.start();
    a.push(a.create.contentDelta("main", "from A"));
    b.push(b.create.contentDelta("main", "from B"));
    assert.equal(reg.size, 2);
    assert.ok(reg.get("a")?.history.some((e) => e.type === "content.delta"));
    reg.delete("a");
    assert.equal(reg.get("a"), undefined);
    assert.equal(reg.size, 1);
  });
});

describe("Ordering & replay", () => {
  it("sequential order", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    for (let i = 0; i < 5; i++) {
      s.push(s.create.contentDelta("main", String(i)));
    }
    s.complete();
    const seqs = s.history.map((e) => e.seq);
    assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7]);
  });

  it("replayFrom", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.push(s.create.contentDelta("main", "a"));
    s.push(s.create.contentDelta("main", "b"));
    s.push(s.create.contentDelta("main", "c"));
    s.complete();
    const replay = s.replayFrom(2);
    assert.deepEqual(
      replay.map((e) => e.seq),
      [3, 4, 5]
    );
  });
});

describe("State edge cases", () => {
  it("activity clear, files, tools, errors", () => {
    let state = createEmptyState("s1");
    const f = createEventFactory({ streamId: "s1" });
    state = applyEvent(state, f.activityUpdate("k1", "One"));
    state = applyEvent(state, f.activityUpdate("k2", "Two"));
    assert.equal(state.activities.size, 2);
    state = applyEvent(
      state,
      f.raw({ type: "activity.clear", data: { key: "k1" } } as any)
    );
    assert.equal(state.activities.has("k1"), false);

    const s = new Stream({ streamId: "s2" });
    s.start();
    s.push(
      s.create.raw({
        type: "file.created",
        data: { fileId: "f1", path: "a.ts", language: "ts" },
      } as any)
    );
    s.push(
      s.create.raw({
        type: "file.content.delta",
        data: { fileId: "f1", path: "a.ts", text: "const x = 1;" },
      } as any)
    );
    s.push(s.create.toolStarted("tc1", "read_file"));
    s.push(
      s.create.raw({
        type: "tool.completed",
        data: { toolCallId: "tc1", result: "ok", durationMs: 10 },
      } as any)
    );
    s.error("X", "fail");
    const st = reduceEvents("s2", s.history);
    assert.equal(st.files.get("f1")?.content, "const x = 1;");
    assert.equal(st.tools.get("tc1")?.status, "completed");
    assert.equal(st.status, "error");
    assert.equal(st.error?.code, "X");
  });
});
