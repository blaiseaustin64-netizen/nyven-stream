import { describe, it, expect } from "vitest";
import {
  PROTOCOL_VERSION,
  createEventFactory,
  validateEvent,
  assertEvent,
  isStreamEvent,
  isTaskEvent,
  isContentEvent,
  isToolEvent,
  isFileEvent,
  isSearchEvent,
  type StreamEvent,
} from "../index";

describe("Protocol – Event Factory", () => {
  it("creates events with correct version and sequential numbering", () => {
    const factory = createEventFactory({ streamId: "stream_abc" });
    const e1 = factory.streamStarted({ title: "Test" });
    const e2 = factory.contentDelta("main", "hello");
    const e3 = factory.activityUpdate("a1", "Working");

    expect(e1.v).toBe(PROTOCOL_VERSION);
    expect(e1.streamId).toBe("stream_abc");
    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e3.seq).toBe(3);
    expect(typeof e1.id).toBe("string");
    expect(e1.id.length).toBeGreaterThan(5);
    expect(typeof e1.ts).toBe("string");
    expect(new Date(e1.ts).toISOString()).toBe(e1.ts);
  });

  it("respects startSeq for reconnection", () => {
    const factory = createEventFactory({ streamId: "s1", startSeq: 10 });
    const e = factory.heartbeat();
    expect(e.seq).toBe(11);
  });

  it("supports custom id generator", () => {
    let n = 0;
    const factory = createEventFactory({
      streamId: "s1",
      idGenerator: () => `custom_${++n}`,
    });
    const e = factory.streamStarted();
    expect(e.id).toBe("custom_1");
  });

  it("creates typed task events with parent support", () => {
    const factory = createEventFactory({ streamId: "s1" });
    const parent = factory.taskStarted("t1", "agent", "Agent");
    const child = factory.taskStarted("t2", "search", "Search", {
      parentTaskId: "t1",
    });

    expect(parent.type).toBe("task.started");
    expect(parent.data.taskId).toBe("t1");
    expect(parent.data.kind).toBe("agent");
    expect(child.data.parentTaskId).toBe("t1");
    expect(child.taskId).toBe("t2");
  });

  it("creates content, activity, tool, search helpers", () => {
    const f = createEventFactory({ streamId: "s1" });
    expect(f.contentDelta("main", "x").data.text).toBe("x");
    expect(f.activityUpdate("k", "L").data.label).toBe("L");
    expect(f.toolStarted("tc1", "calc").data.name).toBe("calc");
    expect(f.searchSource("src1", "Title", "https://ex.com").data.url).toBe(
      "https://ex.com"
    );
  });

  it("exposes currentSeq", () => {
    const f = createEventFactory({ streamId: "s1" });
    expect(f.currentSeq).toBe(0);
    f.streamStarted();
    expect(f.currentSeq).toBe(1);
  });
});

describe("Protocol – Validation", () => {
  const validEvent: StreamEvent = {
    v: PROTOCOL_VERSION,
    id: "evt_1",
    streamId: "s1",
    ts: new Date().toISOString(),
    seq: 1,
    type: "stream.started",
    data: {},
  };

  it("accepts valid events", () => {
    const result = validateEvent(validEvent);
    expect(result.ok).toBe(true);
    expect(result.event).toEqual(validEvent);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects non-objects and missing envelope fields", () => {
    expect(validateEvent(null).ok).toBe(false);
    expect(validateEvent(undefined).ok).toBe(false);
    expect(validateEvent("string").ok).toBe(false);
    expect(validateEvent({}).ok).toBe(false);
    expect(validateEvent({ type: "stream.started" }).ok).toBe(false);
  });

  it("rejects wrong protocol version", () => {
    const bad = { ...validEvent, v: "99.0.0" };
    const result = validateEvent(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("version"))).toBe(true);
  });

  it("rejects invalid seq", () => {
    expect(validateEvent({ ...validEvent, seq: 0 }).ok).toBe(false);
    expect(validateEvent({ ...validEvent, seq: -1 }).ok).toBe(false);
    expect(validateEvent({ ...validEvent, seq: "1" as any }).ok).toBe(false);
  });

  it("assertEvent throws on invalid", () => {
    expect(() => assertEvent({})).toThrow(/Invalid StreamEvent/);
    expect(() => assertEvent(validEvent)).not.toThrow();
  });
});

describe("Protocol – Type guards", () => {
  const factory = createEventFactory({ streamId: "s1" });

  it("isStreamEvent", () => {
    expect(isStreamEvent(factory.streamStarted())).toBe(true);
    expect(isStreamEvent({ foo: 1 })).toBe(false);
  });

  it("category guards", () => {
    const task = factory.taskStarted("t1", "chat", "C");
    const content = factory.contentDelta("main", "hi");
    const tool = factory.toolStarted("tc1", "x");
    const search = factory.searchSource("s1", "T", "https://x.com");

    expect(isTaskEvent(task)).toBe(true);
    expect(isContentEvent(content)).toBe(true);
    expect(isToolEvent(tool)).toBe(true);
    expect(isSearchEvent(search)).toBe(true);

    expect(isTaskEvent(content)).toBe(false);
    expect(isContentEvent(task)).toBe(false);
  });
});
