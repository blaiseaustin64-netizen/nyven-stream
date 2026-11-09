/**
 * End-to-end pipeline without a live Cloudflare isolate:
 * ProducerRegistry → runProducer → Stream → SSE frames → parse → state
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Stream, reduceEvents } from "../packages/core/src/index.ts";
import {
  createProducerRegistry,
  registerDemoProducers,
  runProducer,
} from "../packages/adapters/src/index.ts";
import {
  createSseStream,
  formatSseMessage,
} from "../packages/transport/src/index.ts";
import { validateEvent, type StreamEvent } from "../packages/protocol/src/index.ts";
import {
  deriveActivitySummary,
  shouldShowActivityIndicator,
} from "../packages/renderer/src/labels.ts";

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

describe("Worker-equivalent pipeline", () => {
  it("registry → producer → stream → SSE → state", async () => {
    const registry = createProducerRegistry();
    registerDemoProducers(registry);
    const producer = registry.require("final-only");

    const stream = new Stream({ streamId: "pipe1", title: "final-only" });
    stream.start();

    async function* live() {
      let last = 0;
      const done = runProducer({
        stream,
        producer,
        signal: new AbortController().signal,
        capability: "final-only",
      });
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
            await done;
            return;
          }
        }
        if (
          stream.status === "completed" ||
          stream.status === "error" ||
          stream.status === "cancelled"
        ) {
          for (const e of stream.history.filter((e) => e.seq > last)) yield e;
          await done;
          return;
        }
        await new Promise((r) => setTimeout(r, 5));
      }
    }

    const events = await consumeSse(
      createSseStream(live(), { heartbeatMs: 0 })
    );
    assert.ok(events.length >= 2);
    const state = reduceEvents("pipe1", events);
    assert.equal(state.status, "completed");
    assert.ok(state.channels.get("main")?.text.includes("Final answer"));
    // no invented activity for final-only
    assert.equal(state.activities.size, 0);
    assert.equal(deriveActivitySummary(state), "Done");
  });

  it("cancel propagates to cancelled state", async () => {
    const registry = createProducerRegistry();
    registerDemoProducers(registry);
    const stream = new Stream({ streamId: "pipe2" });
    stream.start();
    const ac = new AbortController();
    const p = runProducer({
      stream,
      producer: registry.require("long"),
      signal: ac.signal,
      capability: "long",
    });
    await new Promise((r) => setTimeout(r, 30));
    ac.abort();
    stream.cancel("test", "client");
    await p;
    assert.equal(stream.status, "cancelled");
  });

  it("SSE frame includes seq as id for reconnection", () => {
    const stream = new Stream({ streamId: "pipe3" });
    stream.start();
    const e = stream.history[0];
    const frame = formatSseMessage(e);
    assert.ok(frame.includes(`id: ${e.seq}`));
  });

  it("search capability yields sources without renderer inventing them", async () => {
    const registry = createProducerRegistry();
    registerDemoProducers(registry);
    const stream = new Stream({ streamId: "pipe4" });
    stream.start();
    await runProducer({
      stream,
      producer: registry.require("search"),
      signal: new AbortController().signal,
      capability: "search",
      input: { query: "test" },
    });
    const state = reduceEvents("pipe4", stream.history);
    assert.ok(state.sources.size >= 1);
    assert.ok(shouldShowActivityIndicator(state) || state.status === "completed");
  });
});
