import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyState,
  applyEvent,
  reduceEvents,
  Stream,
} from "../packages/core/src/index.ts";
import { createEventFactory } from "../packages/protocol/src/index.ts";
import {
  deriveActivitySummary,
  shouldShowActivityIndicator,
  hasExpandableDetails,
  taskKindLabel,
  toolRunningLabel,
  fileBasename,
  sourceDomain,
  streamStatusLabel,
} from "../packages/renderer/src/labels.ts";

describe("Renderer labels – no invented work", () => {
  it("empty/idle state has no activity summary theater", () => {
    const st = createEmptyState("s1");
    assert.equal(deriveActivitySummary(st), "");
    assert.equal(shouldShowActivityIndicator(st), false);
  });

  it("content-only stream does not invent Searching/Thinking labels", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.push(s.create.contentDelta("main", "Hello"));
    s.complete();
    const st = reduceEvents("s1", s.history);
    // After complete, summary is "Done" — not fake search/think
    assert.equal(deriveActivitySummary(st), "Done");
    assert.ok(!/search|analyz|think/i.test(deriveActivitySummary(st)));
  });

  it("uses real activity labels from events", () => {
    let st = createEmptyState("s1");
    const f = createEventFactory({ streamId: "s1" });
    st = applyEvent(st, f.streamStarted());
    st = applyEvent(
      st,
      f.activityUpdate("a1", "Querying search engines…", { status: "running" })
    );
    assert.equal(deriveActivitySummary(st), "Querying search engines…");
    assert.equal(shouldShowActivityIndicator(st), true);
  });

  it("running task title drives summary", () => {
    let st = createEmptyState("s1");
    const f = createEventFactory({ streamId: "s1" });
    st = applyEvent(st, f.streamStarted());
    st = applyEvent(st, f.taskStarted("t1", "search", "Web search"));
    assert.equal(deriveActivitySummary(st), "Web search");
  });

  it("tool running uses friendly label", () => {
    assert.ok(
      toolRunningLabel({
        id: "1",
        name: "web_search",
        status: "running",
      }).toLowerCase().includes("search")
    );
  });

  it("taskKindLabel maps known kinds", () => {
    assert.equal(
      taskKindLabel({
        id: "1",
        kind: "research",
        title: "R",
        status: "running",
        children: [],
      }),
      "Researching"
    );
  });

  it("fileBasename and sourceDomain helpers", () => {
    assert.equal(fileBasename("src/components/Button.tsx"), "Button.tsx");
    assert.equal(sourceDomain("https://www.example.com/path"), "example.com");
  });

  it("streamStatusLabel covers lifecycle", () => {
    assert.equal(streamStatusLabel("cancelled"), "Stopped");
    assert.equal(streamStatusLabel("error"), "Error");
    assert.equal(streamStatusLabel("completed"), "Completed");
  });
});

describe("State integration for renderer", () => {
  it("nested tasks reconstruct for TaskTree", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.push(s.create.taskStarted("p", "agent", "Agent"));
    s.push(
      s.create.taskStarted("c", "search", "Sub", { parentTaskId: "p" })
    );
    s.push(s.create.taskCompleted("c", { durationMs: 1 }));
    s.complete();
    const st = reduceEvents("s1", s.history);
    assert.deepEqual(st.rootTaskIds, ["p"]);
    assert.deepEqual(st.tasks.get("p")?.children, ["c"]);
    assert.equal(st.tasks.get("c")?.status, "completed");
    assert.equal(hasExpandableDetails(st), true);
  });

  it("sources and files appear progressively in state", () => {
    const s = new Stream({ streamId: "s1" });
    s.start();
    s.push(
      s.create.searchSource("s1", "A", "https://a.com", { rank: 1 })
    );
    let st = reduceEvents("s1", s.history);
    assert.equal(st.sources.size, 1);
    s.push(
      s.create.raw({
        type: "file.created",
        data: { fileId: "f1", path: "a.ts" },
      } as any)
    );
    st = reduceEvents("s1", s.history);
    assert.equal(st.files.size, 1);
    s.complete();
  });

  it("error and cancelled states are distinct", () => {
    const a = new Stream({ streamId: "e1" });
    a.start();
    a.error("X", "fail");
    assert.equal(reduceEvents("e1", a.history).status, "error");

    const b = new Stream({ streamId: "c1" });
    b.start();
    b.cancel("stop", "client");
    assert.equal(reduceEvents("c1", b.history).status, "cancelled");
  });

  it("replay reconstructs identical state", () => {
    const s = new Stream({ streamId: "r1" });
    s.start();
    s.push(s.create.contentDelta("main", "Hi"));
    s.push(s.create.contentDelta("main", " there"));
    s.complete();
    const full = reduceEvents("r1", s.history);
    const mid = 2;
    const part1 = s.history.filter((e) => e.seq <= mid);
    const part2 = s.replayFrom(mid);
    const rebuilt = reduceEvents("r1", [...part1, ...part2]);
    assert.equal(rebuilt.channels.get("main")?.text, full.channels.get("main")?.text);
    assert.equal(rebuilt.status, full.status);
  });

  it("unknown event types do not crash reducer", () => {
    let st = createEmptyState("s1");
    const f = createEventFactory({ streamId: "s1" });
    st = applyEvent(st, f.streamStarted());
    // Force an unknown type through applyEvent default branch
    const weird = {
      ...f.heartbeat(),
      type: "future.unknown.event" as any,
      data: { foo: 1 },
    };
    assert.doesNotThrow(() => {
      st = applyEvent(st, weird as any);
    });
    assert.equal(st.status, "active");
  });
});
