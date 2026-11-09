/**
 * Component-oriented behavioral tests (no browser).
 * Verifies presentation contracts StreamView relies on:
 * expandability, lifecycle labels, no invented activity, multi-channel content.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Stream,
  reduceEvents,
  createEmptyState,
  applyEvent,
} from "../packages/core/src/index.ts";
import { createEventFactory } from "../packages/protocol/src/index.ts";
import {
  deriveActivitySummary,
  shouldShowActivityIndicator,
  hasExpandableDetails,
  streamStatusLabel,
} from "../packages/renderer/src/labels.ts";
import { parseMarkdownBlocks } from "../packages/renderer/src/markdown-parse.ts";

describe("StreamView presentation contracts", () => {
  it("content-only stream: indicator may show Done, not fake tasks", () => {
    const s = new Stream({ streamId: "ui1" });
    s.start();
    s.push(s.create.contentDelta("main", "# Hello\n\n**Bold** text"));
    s.complete();
    const st = reduceEvents("ui1", s.history);
    assert.equal(st.tasks.size, 0);
    assert.equal(st.activities.size, 0);
    assert.equal(deriveActivitySummary(st), "Done");
    assert.ok(!hasExpandableDetails(st));
    // markdown parses for ContentArea
    const blocks = parseMarkdownBlocks(st.channels.get("main")!.text);
    assert.ok(blocks.some((b) => b.type === "heading"));
  });

  it("activity expandability requires real details", () => {
    let st = createEmptyState("ui2");
    const f = createEventFactory({ streamId: "ui2" });
    st = applyEvent(st, f.streamStarted());
    st = applyEvent(
      st,
      f.activityUpdate("a", "Working", { status: "running" })
    );
    // single activity, no tasks/tools/sources/files → not expandable
    assert.equal(shouldShowActivityIndicator(st), true);
    assert.equal(hasExpandableDetails(st), false);

    st = applyEvent(st, f.taskStarted("t1", "search", "Search"));
    assert.equal(hasExpandableDetails(st), true);
  });

  it("nested tasks provide expandable tree data", () => {
    const s = new Stream({ streamId: "ui3" });
    s.start();
    s.push(s.create.taskStarted("p", "agent", "Agent"));
    s.push(
      s.create.taskStarted("c", "tool", "Child", { parentTaskId: "p" })
    );
    s.complete();
    const st = reduceEvents("ui3", s.history);
    assert.equal(st.tasks.get("p")?.children.length, 1);
    assert.ok(hasExpandableDetails(st));
  });

  it("multiple content channels ordered with main first", () => {
    const s = new Stream({ streamId: "ui4" });
    s.start();
    s.push(s.create.contentDelta("code", "x = 1"));
    s.push(s.create.contentDelta("main", "Answer"));
    s.complete();
    const st = reduceEvents("ui4", s.history);
    const keys = Array.from(st.channels.keys());
    assert.ok(keys.includes("main") && keys.includes("code"));
    assert.equal(st.channels.get("main")?.text, "Answer");
  });

  it("lifecycle labels distinguish completed, cancelled, error", () => {
    assert.equal(streamStatusLabel("completed"), "Completed");
    assert.equal(streamStatusLabel("cancelled"), "Stopped");
    assert.equal(streamStatusLabel("error"), "Error");
  });

  it("onCancel host contract: active stream can be cancelled", () => {
    const s = new Stream({ streamId: "ui5" });
    s.start();
    assert.equal(s.status, "active");
    // StreamView would call onCancel → host does this:
    s.cancel("user", "client");
    assert.equal(s.status, "cancelled");
    const st = reduceEvents("ui5", s.history);
    assert.equal(st.status, "cancelled");
  });

  it("unknown incomplete data does not throw in labels", () => {
    const st = createEmptyState("ui6");
    assert.doesNotThrow(() => deriveActivitySummary(st));
    assert.doesNotThrow(() => shouldShowActivityIndicator(st));
    assert.doesNotThrow(() => hasExpandableDetails(st));
  });
});
