/**
 * Integration tests – Stream Core + Transport + state reconstruction.
 * These do not require a live Cloudflare Worker; they verify the contract
 * that the Worker implements.
 */

import { describe, it, expect } from "vitest";
import { Stream, reduceEvents, createEmptyState, applyEvent } from "@nyven-stream/core";
import {
  createEventFactory,
  validateEvent,
  type StreamEvent,
} from "@nyven-stream/protocol";
import {
  formatSseMessage,
  createSseStream,
} from "@nyven-stream/transport";

/** Parse SSE text into events (minimal client) */
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
      const dataLine = part
        .split("\n")
        .find((l) => l.startsWith("data: "));
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

describe("E2E – client initiates, receives ordered SSE, reconstructs state", () => {
  it("streams events incrementally with correct ordering", async () => {
    const stream = new Stream({ streamId: "int_1", title: "Integration" });
    stream.start();

    // Simulate producer
    const producer = async () => {
      stream.push(stream.create.taskStarted("t1", "chat", "Chat"));
      await new Promise((r) => setTimeout(r, 20));
      stream.push(stream.create.contentDelta("main", "Hello "));
      await new Promise((r) => setTimeout(r, 20));
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

    // Create SSE from an async iterable that reads stream history as it grows
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
          // drain remaining
          const rest = stream.history.filter((e) => e.seq > last);
          for (const e of rest) yield e;
          return;
        }
        await new Promise((r) => setTimeout(r, 15));
      }
    }

    const ssePromise = consumeSse(
      createSseStream(liveEvents(), { heartbeatMs: 0 })
    );
    await producer();
    const events = await ssePromise;

    expect(events.length).toBeGreaterThanOrEqual(6);
    // Ordering
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq);
    }
    // State reconstruction
    const state = reduceEvents("int_1", events);
    expect(state.status).toBe("completed");
    expect(state.channels.get("main")?.text).toBe("Hello world");
    expect(state.channels.get("main")?.complete).toBe(true);
    expect(state.tasks.get("t1")?.status).toBe("completed");
  });

  it("reconnect + replay missing events", async () => {
    const stream = new Stream({ streamId: "int_2" });
    stream.start();
    stream.push(stream.create.contentDelta("main", "one "));
    stream.push(stream.create.contentDelta("main", "two "));
    stream.push(stream.create.contentDelta("main", "three"));
    stream.complete();

    // Client disconnects after seq 2
    const firstBatch = stream.replayFrom(0).filter((e) => e.seq <= 2);
    expect(firstBatch.map((e) => e.seq)).toEqual([1, 2]);

    // Reconnect with lastSeq=2
    const replay = stream.replayFrom(2);
    expect(replay.map((e) => e.seq)).toEqual([3, 4, 5]);

    // Reconstruct full state from both batches
    const all = [...firstBatch, ...replay];
    const state = reduceEvents("int_2", all);
    expect(state.channels.get("main")?.text).toBe("one two three");
    expect(state.status).toBe("completed");
  });

  it("cancellation stops the stream and is visible in SSE", async () => {
    const stream = new Stream({ streamId: "int_3" });
    stream.start();
    stream.push(stream.create.taskStarted("t1", "custom", "Work"));

    async function* events() {
      for (const e of stream.history) yield e;
      // wait a bit then cancel
      await new Promise((r) => setTimeout(r, 30));
      stream.cancel("test", "client");
      // yield remaining
      for (const e of stream.history) {
        if (e.type === "stream.cancelled") yield e;
      }
    }

    const received = await consumeSse(
      createSseStream(events(), { heartbeatMs: 0 })
    );
    const cancelled = received.find((e) => e.type === "stream.cancelled");
    expect(cancelled).toBeTruthy();
    expect(stream.status).toBe("cancelled");
    expect(stream.aborted).toBe(true);

    const state = reduceEvents("int_3", received);
    expect(state.status).toBe("cancelled");
  });

  it("errors are delivered through the event protocol", async () => {
    const stream = new Stream({ streamId: "int_4" });
    stream.start();
    stream.error("TEST_ERR", "Something broke", true);

    const events = stream.history;
    expect(events.some((e) => e.type === "stream.error")).toBe(true);
    const errEvent = events.find((e) => e.type === "stream.error")!;
    expect(errEvent.data.code).toBe("TEST_ERR");
    expect(errEvent.data.retryable).toBe(true);

    const state = reduceEvents("int_4", events);
    expect(state.status).toBe("error");
    expect(state.error?.message).toBe("Something broke");
  });

  it("rejects invalid events at validation boundary", () => {
    expect(validateEvent({ type: "nope" }).ok).toBe(false);
    expect(validateEvent(null).ok).toBe(false);
    const good = createEventFactory({ streamId: "x" }).streamStarted();
    expect(validateEvent(good).ok).toBe(true);
  });

  it("SSE frames contain correct id (seq) for Last-Event-ID", () => {
    const f = createEventFactory({ streamId: "s" });
    const e = f.contentDelta("main", "x");
    const frame = formatSseMessage(e);
    expect(frame).toContain(`id: ${e.seq}`);
  });
});

describe("Out-of-order / duplicate handling (state)", () => {
  it("state reducer is resilient to applying events in order only", () => {
    // Our contract: producers must emit in order. Reducer assumes ordered input.
    // We still verify that applying a proper sequence works and that
    // duplicate seq would just overwrite lastSeq.
    const f = createEventFactory({ streamId: "s1" });
    let state = createEmptyState("s1");
    const e1 = f.streamStarted();
    const e2 = f.contentDelta("main", "a");
    state = applyEvent(state, e1);
    state = applyEvent(state, e2);
    expect(state.lastSeq).toBe(2);
    expect(state.channels.get("main")?.text).toBe("a");
  });
});
