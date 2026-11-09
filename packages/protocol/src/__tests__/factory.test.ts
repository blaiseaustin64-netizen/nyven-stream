/**
 * Basic protocol factory tests.
 * Run with: npx tsx --test or similar once configured.
 */

import { createEventFactory, PROTOCOL_VERSION } from "../index";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

const factory = createEventFactory({ streamId: "test_stream" });

const started = factory.streamStarted({ title: "Test" });
assert(started.v === PROTOCOL_VERSION, "version");
assert(started.type === "stream.started", "type");
assert(started.streamId === "test_stream", "streamId");
assert(started.seq === 1, "first seq");
assert(typeof started.id === "string", "id");
assert(typeof started.ts === "string", "ts");

const delta = factory.contentDelta("main", "hello");
assert(delta.seq === 2, "seq increments");
assert(delta.data.text === "hello", "text");

const task = factory.taskStarted("t1", "chat", "Hello");
assert(task.data.taskId === "t1", "taskId");
assert(task.data.kind === "chat", "kind");

console.log("protocol factory tests: PASS");
