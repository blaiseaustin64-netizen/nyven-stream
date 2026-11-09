import { describe, it, expect } from "vitest";
import {
  formatSseMessage,
  createSseStream,
  sseHeaders,
  createSseResponse,
} from "../sse-server";
import { createEventFactory, validateEvent } from "@nyven-stream/protocol";

describe("SSE server helpers", () => {
  it("formatSseMessage produces valid SSE frame", () => {
    const f = createEventFactory({ streamId: "s1" });
    const event = f.streamStarted({ title: "T" });
    const frame = formatSseMessage(event);
    expect(frame).toContain("event: message");
    expect(frame).toContain(`id: ${event.seq}`);
    expect(frame).toContain("data: ");
    expect(frame.endsWith("\n\n")).toBe(true);

    // Extract data and validate
    const dataLine = frame
      .split("\n")
      .find((l) => l.startsWith("data: "))!
      .slice(6);
    const parsed = JSON.parse(dataLine);
    expect(validateEvent(parsed).ok).toBe(true);
    expect(parsed.seq).toBe(event.seq);
  });

  it("sseHeaders sets required content type", () => {
    const h = sseHeaders();
    expect(h.get("Content-Type")).toBe("text/event-stream");
    expect(h.get("Cache-Control")).toContain("no-cache");
  });

  it("createSseStream yields encoded events then DONE", async () => {
    const f = createEventFactory({ streamId: "s1" });
    const events = [f.streamStarted(), f.contentDelta("main", "hi"), f.streamCompleted({ eventCount: 2, durationMs: 10 })];

    const stream = createSseStream(events, { heartbeatMs: 0 });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toContain("stream.started");
    expect(text).toContain("content.delta");
    expect(text).toContain("stream.completed");
    expect(text).toContain("data: [DONE]");
  });

  it("createSseResponse returns proper Response", async () => {
    const f = createEventFactory({ streamId: "s1" });
    const res = createSseResponse([f.streamStarted()], { heartbeatMs: 0 });
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.body).toBeTruthy();
  });

  it("aborts stream on signal", async () => {
    const ac = new AbortController();
    const f = createEventFactory({ streamId: "s1" });

    async function* slow() {
      yield f.streamStarted();
      await new Promise((r) => setTimeout(r, 50));
      ac.abort();
      yield f.contentDelta("main", "should not fully process");
    }

    const stream = createSseStream(slow(), { signal: ac.signal, heartbeatMs: 0 });
    const reader = stream.getReader();
    const chunks: string[] = [];
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value));
      }
    } catch {
      // expected on abort in some runtimes
    }
    const text = chunks.join("");
    expect(text).toContain("stream.started");
  });
});
