import { describe, it, expect } from "vitest";
import {
  Stream,
  StreamRegistry,
  applyEvent,
  createEmptyState,
  reduceEvents,
} from "../index";
import { createEventFactory, PROTOCOL_VERSION } from "@nyven-stream/protocol";

describe("Stream lifecycle", () => {
  it("starts idle and transitions correctly", () => {
    const statuses: string[] = [];
    const s = new Stream({
      title: "Demo",
      onStatusChange: (st) => statuses.push(st),
    });
    expect(s.status).toBe("idle");
    expect(s.eventCount).toBe(0);

    const started = s.start();
    expect(s.status).toBe("active");
    expect(started.type).toBe("stream.started");
    expect(started.data.title).toBe("Demo");
    expect(s.eventCount).toBe(1);

    const completed = s.complete();
    expect(s.status).toBe("completed");
    expect(completed.type).toBe("stream.completed");
    expect(statuses).toContain("active");
    expect(statuses).toContain("completed");
  });

  it("rejects start when not idle", () => {
    const s = new Stream();
    s.start();
    expect(() => s.start()).toThrow(/Cannot start/);
  });

  it("rejects push when not active", () => {
    const s = new Stream();
    expect(() => s.push({} as any)).toThrow();
    s.start();
    s.complete();
    expect(() => s.push({} as any)).toThrow(/Cannot push/);
  });

  it("rejects events with mismatched streamId", () => {
    const s = new Stream({ streamId: "mine" });
    s.start();
    const foreign = createEventFactory({ streamId: "other" }).contentDelta(
      "main",
      "x"
    );
    expect(() => s.push(foreign)).toThrow(/streamId mismatch/);
  });

  it("emits via onEvent callback", () => {
    const received: any[] = [];
    const s = new Stream({ onEvent: (e) => received.push(e) });
    s.start();
    s.push(s.create.contentDelta("main", "hi"));
    s.complete();
    expect(received).toHaveLength(3);
    expect(received[0].type).toBe("stream.started");
    expect(received[1].type).toBe("content.delta");
    expect(received[2].type).toBe("stream.completed");
  });
});

describe("Stream cancellation & AbortSignal", () => {
  it("cancels and aborts signal", () => {
    const s = new Stream();
    s.start();
    expect(s.aborted).toBe(false);
    const cancelled = s.cancel("user request", "client");
    expect(s.status).toBe("cancelled");
    expect(s.aborted).toBe(true);
    expect(cancelled.type).toBe("stream.cancelled");
    expect(cancelled.data.by).toBe("client");
    expect(cancelled.data.reason).toBe("user request");
  });

  it("is idempotent on already terminal streams", () => {
    const s = new Stream();
    s.start();
    s.cancel();
    const second = s.cancel("again");
    expect(second.type).toBe("stream.cancelled");
  });

  it("error transitions to error status", () => {
    const s = new Stream();
    s.start();
    const err = s.error("TIMEOUT", "Model timed out", true, { retryAfter: 5 });
    expect(s.status).toBe("error");
    expect(err.data.code).toBe("TIMEOUT");
    expect(err.data.retryable).toBe(true);
  });

  it("cannot error a completed stream", () => {
    const s = new Stream();
    s.start();
    s.complete();
    expect(() => s.error("X", "y")).toThrow();
  });
});

describe("Content accumulation & replacement", () => {
  it("accumulates content.delta and handles replace/complete", () => {
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
    expect(state.channels.get("main")?.text).toBe("Replaced");
    expect(state.channels.get("main")?.complete).toBe(true);
  });

  it("supports multiple channels", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.push(s.create.contentDelta("main", "A"));
    s.push(s.create.contentDelta("thinking", "B"));
    s.complete();
    const state = reduceEvents("s1", s.history);
    expect(state.channels.get("main")?.text).toBe("A");
    expect(state.channels.get("thinking")?.text).toBe("B");
  });
});

describe("Nested task management", () => {
  it("builds parent-child relationships", () => {
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
    s.push(s.create.taskProgress("parent", { percent: 50 }));
    s.push(s.create.taskCompleted("parent", { durationMs: 500 }));
    s.complete();

    const state = reduceEvents("s1", s.history);
    expect(state.rootTaskIds).toEqual(["parent"]);
    const parent = state.tasks.get("parent")!;
    expect(parent.children).toEqual(["child1", "child2"]);
    expect(parent.status).toBe("completed");
    expect(state.tasks.get("child1")?.status).toBe("completed");
    expect(state.tasks.get("child2")?.status).toBe("running");
  });

  it("handles task failed and cancelled", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.push(s.create.taskStarted("t1", "custom", "Work"));
    s.push(
      s.create.taskFailed("t1", {
        code: "ERR",
        message: "boom",
        retryable: false,
      })
    );
    s.complete();
    const state = reduceEvents("s1", s.history);
    expect(state.tasks.get("t1")?.status).toBe("failed");
    expect(state.tasks.get("t1")?.error?.code).toBe("ERR");
  });
});

describe("Multiple concurrent streams", () => {
  it("registry isolates streams", () => {
    const reg = new StreamRegistry();
    const a = reg.create({ streamId: "a" });
    const b = reg.create({ streamId: "b" });
    a.start();
    b.start();
    a.push(a.create.contentDelta("main", "from A"));
    b.push(b.create.contentDelta("main", "from B"));
    expect(reg.size).toBe(2);
    expect(reg.get("a")?.history.some((e) => e.type === "content.delta")).toBe(
      true
    );
    expect(
      reg.get("b")?.history.find((e) => e.type === "content.delta")?.data
    ).toMatchObject({ text: "from B" });
    reg.delete("a");
    expect(reg.get("a")).toBeUndefined();
    expect(reg.size).toBe(1);
  });
});

describe("Event ordering & replay", () => {
  it("maintains sequential order in history", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    for (let i = 0; i < 5; i++) {
      s.push(s.create.contentDelta("main", String(i)));
    }
    s.complete();
    const seqs = s.history.map((e) => e.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("replayFrom returns only events after lastSeq", () => {
    const s = new Stream({ streamId: "s1" });
    s.start(); // seq 1
    s.push(s.create.contentDelta("main", "a")); // 2
    s.push(s.create.contentDelta("main", "b")); // 3
    s.push(s.create.contentDelta("main", "c")); // 4
    s.complete(); // 5

    const replay = s.replayFrom(2);
    expect(replay.map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(replay[0].type).toBe("content.delta");
  });

  it("replayFrom(0) returns all events", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.complete();
    expect(s.replayFrom(0)).toHaveLength(2);
  });
});

describe("State reducer edge cases", () => {
  it("createEmptyState has correct defaults", () => {
    const st = createEmptyState("sid");
    expect(st.streamId).toBe("sid");
    expect(st.status).toBe("idle");
    expect(st.tasks.size).toBe(0);
    expect(st.lastSeq).toBe(0);
  });

  it("handles activity clear", () => {
    let state = createEmptyState("s1");
    const f = createEventFactory({ streamId: "s1" });
    state = applyEvent(state, f.activityUpdate("k1", "One"));
    state = applyEvent(state, f.activityUpdate("k2", "Two"));
    expect(state.activities.size).toBe(2);
    state = applyEvent(
      state,
      f.raw({ type: "activity.clear", data: { key: "k1" } } as any)
    );
    expect(state.activities.has("k1")).toBe(false);
    expect(state.activities.has("k2")).toBe(true);
    state = applyEvent(
      state,
      f.raw({ type: "activity.clear", data: {} } as any)
    );
    expect(state.activities.size).toBe(0);
  });

  it("handles file and tool events", () => {
    const s = new Stream({ streamId: "s1" });
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
    s.push(s.create.toolStarted("tc1", "read_file", "Read a.ts"));
    s.push(
      s.create.raw({
        type: "tool.completed",
        data: { toolCallId: "tc1", result: "ok", durationMs: 10 },
      } as any)
    );
    s.complete();
    const state = reduceEvents("s1", s.history);
    expect(state.files.get("f1")?.content).toBe("const x = 1;");
    expect(state.tools.get("tc1")?.status).toBe("completed");
  });

  it("stream.error sets state error", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.error("X", "fail");
    const state = reduceEvents("s1", s.history);
    expect(state.status).toBe("error");
    expect(state.error?.code).toBe("X");
  });
});
