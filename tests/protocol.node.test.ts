/**
 * Protocol tests – Node built-in test runner + strip-types
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_VERSION,
  createEventFactory,
  validateEvent,
  assertEvent,
  isStreamEvent,
  isTaskEvent,
  isContentEvent,
  type StreamEvent,
} from "../packages/protocol/src/index.ts";

describe("Protocol – Event Factory", () => {
  it("creates events with correct version and sequential numbering", () => {
    const factory = createEventFactory({ streamId: "stream_abc" });
    const e1 = factory.streamStarted({ title: "Test" });
    const e2 = factory.contentDelta("main", "hello");
    const e3 = factory.activityUpdate("a1", "Working");

    assert.equal(e1.v, PROTOCOL_VERSION);
    assert.equal(e1.streamId, "stream_abc");
    assert.equal(e1.seq, 1);
    assert.equal(e2.seq, 2);
    assert.equal(e3.seq, 3);
    assert.equal(typeof e1.id, "string");
    assert.ok(e1.id.length > 5);
    assert.equal(typeof e1.ts, "string");
    assert.equal(new Date(e1.ts).toISOString(), e1.ts);
  });

  it("respects startSeq for reconnection", () => {
    const factory = createEventFactory({ streamId: "s1", startSeq: 10 });
    const e = factory.heartbeat();
    assert.equal(e.seq, 11);
  });

  it("supports custom id generator", () => {
    let n = 0;
    const factory = createEventFactory({
      streamId: "s1",
      idGenerator: () => `custom_${++n}`,
    });
    const e = factory.streamStarted();
    assert.equal(e.id, "custom_1");
  });

  it("creates typed task events with parent support", () => {
    const factory = createEventFactory({ streamId: "s1" });
    const parent = factory.taskStarted("t1", "agent", "Agent");
    const child = factory.taskStarted("t2", "search", "Search", {
      parentTaskId: "t1",
    });
    assert.equal(parent.type, "task.started");
    assert.equal(parent.data.taskId, "t1");
    assert.equal(child.data.parentTaskId, "t1");
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
    assert.equal(result.ok, true);
    assert.deepEqual(result.event, validEvent);
  });

  it("rejects non-objects and missing fields", () => {
    assert.equal(validateEvent(null).ok, false);
    assert.equal(validateEvent({}).ok, false);
    assert.equal(validateEvent({ type: "stream.started" }).ok, false);
  });

  it("rejects wrong protocol version", () => {
    const bad = { ...validEvent, v: "99.0.0" };
    const result = validateEvent(bad);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("version")));
  });

  it("rejects invalid seq", () => {
    assert.equal(validateEvent({ ...validEvent, seq: 0 }).ok, false);
    assert.equal(validateEvent({ ...validEvent, seq: -1 }).ok, false);
  });

  it("assertEvent throws on invalid", () => {
    assert.throws(() => assertEvent({}), /Invalid StreamEvent/);
    assert.doesNotThrow(() => assertEvent(validEvent));
  });
});

describe("Protocol – Type guards", () => {
  const factory = createEventFactory({ streamId: "s1" });

  it("isStreamEvent and category guards", () => {
    assert.equal(isStreamEvent(factory.streamStarted()), true);
    assert.equal(isStreamEvent({ foo: 1 }), false);
    assert.equal(isTaskEvent(factory.taskStarted("t1", "chat", "C")), true);
    assert.equal(isContentEvent(factory.contentDelta("main", "hi")), true);
  });
});
