import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Stream,
  reduceEvents,
  createEmptyState,
  applyEvent,
} from "../packages/core/src/index.ts";
import {
  createEventFactory,
  validateEvent,
  type StreamEvent,
} from "../packages/protocol/src/index.ts";
import {
  formatSseMessage,
  createSseStream,
} from "../packages/transport/src/index.ts";

async function consumeSse(
  stream: ReadableStream<Uint8Array>
): Promise<StreamEvent[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: StreamEvent[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const raw = dataLine.slice(6);
      if (raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        const result = validateEvent(parsed);
        if (result.ok && result.event) events.push(result.event);
      } catch {
        /* ignore */
      }
    }
  }
  return events;
}

describe("E2E streaming", () => {
  it("ordered SSE + state reconstruction", async () => {
    const stream = new Stream({ streamId: "int_1", title: "Integration" });
    stream.start();

    const producer = async () => {
      stream.push(stream.create.taskStarted("t1", "chat", "Chat"));
      await new Promise((r) => setTimeout(r, 15));
      stream.push(stream.create.contentDelta("main", "Hello "));
      await new Promise((r) => setTimeout(r, 15));
      stream.push(stream.create.contentDelta("main", "world"));
      stream.push(
        stream.create.raw({
          type: "content.complete",
          data: { channel: "main" },
        } as any)
      );
      stream.push(stream.create.taskCompleted("t1", { durationMs: 50 }));
      stream.complete();
    };

    async function* liveEvents() {
      let last = 0;
      while (true) {
        const batch = stream.history.filter((e) => e.seq > last);
        for (const e of batch) {
          yield e;
          last = e.seq;
          if (
            e.type === "stream.completed" ||
            e.type === "stream.error" ||
            e.type === "stream.cancelled"
          ) {
            return;
          }
        }
        if (
          stream.status === "completed" ||
          stream.status === "error" ||
          stream.status === "cancelled"
        ) {
          for (const e of stream.history.filter((e) => e.seq > last)) yield e;
          return;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    const ssePromise = consumeSse(
      createSseStream(liveEvents(), { heartbeatMs: 0 })
    );
    await producer();
    const events = await ssePromise;

    assert.ok(events.length >= 6);
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i].seq > events[i - 1].seq);
    }
    const state = reduceEvents("int_1", events);
    assert.equal(state.status, "completed");
    assert.equal(state.channels.get("main")?.text, "Hello world");
    assert.equal(state.channels.get("main")?.complete, true);
  });

  it("reconnect + replay", () => {
    const stream = new Stream({ streamId: "int_2" });
    stream.start();
    stream.push(stream.create.contentDelta("main", "one "));
    stream.push(stream.create.contentDelta("main", "two "));
    stream.push(stream.create.contentDelta("main", "three"));
    stream.complete();

    const firstBatch = stream.replayFrom(0).filter((e) => e.seq <= 2);
    assert.deepEqual(
      firstBatch.map((e) => e.seq),
      [1, 2]
    );
    const replay = stream.replayFrom(2);
    assert.deepEqual(
      replay.map((e) => e.seq),
      [3, 4, 5]
    );
    const state = reduceEvents("int_2", [...firstBatch, ...replay]);
    assert.equal(state.channels.get("main")?.text, "one two three");
    assert.equal(state.status, "completed");
  });

  it("cancellation visible in protocol", async () => {
    const stream = new Stream({ streamId: "int_3" });
    stream.start();
    stream.push(stream.create.taskStarted("t1", "custom", "Work"));

    async function* events() {
      for (const e of stream.history) yield e;
      await new Promise((r) => setTimeout(r, 20));
      stream.cancel("test", "client");
      for (const e of stream.history) {
        if (e.type === "stream.cancelled") yield e;
      }
    }

    const received = await consumeSse(
      createSseStream(events(), { heartbeatMs: 0 })
    );
    assert.ok(received.some((e) => e.type === "stream.cancelled"));
    assert.equal(stream.status, "cancelled");
    assert.equal(stream.aborted, true);
    const state = reduceEvents("int_3", received);
    assert.equal(state.status, "cancelled");
  });

  it("errors via protocol", () => {
    const stream = new Stream({ streamId: "int_4" });
    stream.start();
    stream.error("TEST_ERR", "Something broke", true);
    const errEvent = stream.history.find((e) => e.type === "stream.error")!;
    assert.equal(errEvent.data.code, "TEST_ERR");
    assert.equal(errEvent.data.retryable, true);
    const state = reduceEvents("int_4", stream.history);
    assert.equal(state.status, "error");
  });

  it("SSE frame has id for Last-Event-ID", () => {
    const f = createEventFactory({ streamId: "s" });
    const e = f.contentDelta("main", "x");
    const frame = formatSseMessage(e);
    assert.ok(frame.includes(`id: ${e.seq}`));
  });

  it("invalid events rejected", () => {
    assert.equal(validateEvent({ type: "nope" }).ok, false);
    assert.equal(validateEvent(null).ok, false);
    const good = createEventFactory({ streamId: "x" }).streamStarted();
    assert.equal(validateEvent(good).ok, true);
  });
});
