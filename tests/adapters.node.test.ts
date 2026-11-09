import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Stream } from "../packages/core/src/index.ts";
import {
  createProducerRegistry,
  ProducerNotFoundError,
  runProducer,
  toSafeError,
  demoChatProducer,
  demoErrorProducer,
  demoLongProducer,
  demoFinalOnlyProducer,
  registerDemoProducers,
  type StreamProducer,
} from "../packages/adapters/src/index.ts";

describe("ProducerRegistry", () => {
  it("registers and resolves producers", () => {
    const reg = createProducerRegistry();
    reg.register("chat", demoChatProducer);
    assert.equal(reg.has("chat"), true);
    assert.equal(reg.has("CHAT"), true); // normalized
    assert.equal(reg.get("chat"), demoChatProducer);
    assert.deepEqual(reg.list(), ["chat"]);
  });

  it("rejects duplicate registration", () => {
    const reg = createProducerRegistry();
    reg.register("chat", demoChatProducer);
    assert.throws(() => reg.register("chat", demoChatProducer), /already registered/);
  });

  it("replace overrides", () => {
    const reg = createProducerRegistry();
    reg.register("chat", demoChatProducer);
    reg.replace("chat", demoFinalOnlyProducer);
    assert.equal(reg.get("chat"), demoFinalOnlyProducer);
  });

  it("require throws ProducerNotFoundError", () => {
    const reg = createProducerRegistry();
    assert.throws(() => reg.require("missing"), ProducerNotFoundError);
  });

  it("registerDemoProducers adds multiple keys", () => {
    const reg = createProducerRegistry();
    registerDemoProducers(reg);
    assert.ok(reg.size >= 7);
    assert.ok(reg.has("search"));
    assert.ok(reg.has("coding"));
  });
});

describe("runProducer", () => {
  it("runs producer and completes stream", async () => {
    const stream = new Stream({ streamId: "t1", title: "test" });
    stream.start();
    await runProducer({
      stream,
      producer: demoFinalOnlyProducer,
      signal: new AbortController().signal,
      capability: "final-only",
    });
    assert.equal(stream.status, "completed");
    assert.ok(stream.history.some((e) => e.type === "content.replace"));
  });

  it("maps producer throw to stream.error safely", async () => {
    const bad: StreamProducer = {
      async run() {
        throw new Error("secret api_key=sk-xxx blew up");
      },
    };
    const stream = new Stream({ streamId: "t2" });
    stream.start();
    await runProducer({
      stream,
      producer: bad,
      signal: new AbortController().signal,
      capability: "bad",
    });
    assert.equal(stream.status, "error");
    const err = stream.history.find((e) => e.type === "stream.error")!;
    assert.equal(err.data.code, "PRODUCER_ERROR");
    // must not leak the key-looking message verbatim as-is if sensitive
    assert.equal(err.data.message, "Producer failed");
  });

  it("demo error producer ends in error status", async () => {
    const stream = new Stream({ streamId: "t3" });
    stream.start();
    await runProducer({
      stream,
      producer: demoErrorProducer,
      signal: new AbortController().signal,
      capability: "error",
    });
    assert.equal(stream.status, "error");
  });

  it("cancellation via AbortSignal stops producer", async () => {
    const stream = new Stream({ streamId: "t4" });
    stream.start();
    const ac = new AbortController();
    const runPromise = runProducer({
      stream,
      producer: demoLongProducer,
      signal: ac.signal,
      capability: "long",
    });
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    // Also cancel stream like Worker would
    stream.cancel("test", "client");
    await runPromise;
    assert.equal(stream.status, "cancelled");
    assert.equal(stream.aborted, true);
  });

  it("chat producer emits task and content events", async () => {
    const stream = new Stream({ streamId: "t5" });
    stream.start();
    await runProducer({
      stream,
      producer: demoChatProducer,
      signal: new AbortController().signal,
      capability: "chat",
    });
    assert.equal(stream.status, "completed");
    assert.ok(stream.history.some((e) => e.type === "task.started"));
    assert.ok(stream.history.some((e) => e.type === "content.delta"));
  });
});

describe("toSafeError", () => {
  it("handles AbortError", () => {
    const e = toSafeError(new DOMException("Aborted", "AbortError"));
    assert.equal(e.code, "CANCELLED");
  });

  it("redacts sensitive messages", () => {
    const e = toSafeError(new Error("invalid API_KEY provided"));
    assert.equal(e.message, "Producer failed");
  });

  it("passes through structured errors", () => {
    const e = toSafeError({
      code: "RATE_LIMIT",
      message: "Slow down",
      retryable: true,
    });
    assert.equal(e.code, "RATE_LIMIT");
    assert.equal(e.retryable, true);
  });
});

describe("Future capability without core changes", () => {
  it("custom producer registers and runs without touching core", async () => {
    const reg = createProducerRegistry();
    const custom: StreamProducer = {
      id: "future.design",
      async run({ stream }) {
        stream.push(
          stream.create.taskStarted("d1", "design", "Generate layout")
        );
        stream.push(
          stream.create.contentDelta(
            "main",
            "Hypothetical DESIGN capability output."
          )
        );
        stream.push(stream.create.taskCompleted("d1", { durationMs: 1 }));
        stream.complete();
      },
    };
    reg.register("design", custom);
    assert.ok(reg.has("design"));

    const stream = new Stream({ streamId: "future1" });
    stream.start();
    await runProducer({
      stream,
      producer: reg.require("design"),
      signal: new AbortController().signal,
      capability: "design",
      input: { prompt: "landing page" },
    });
    assert.equal(stream.status, "completed");
    assert.ok(
      stream.history.some(
        (e) => e.type === "task.started" && (e as any).data.kind === "design"
      )
    );
  });
});
