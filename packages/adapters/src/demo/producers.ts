/**
 * Demo / simulation producers.
 *
 * These implement StreamProducer for playground and local testing only.
 * They are NOT part of the universal engine and must not be treated as
 * production capability logic.
 *
 * Marked clearly so they can be replaced by real adapters later.
 */

import type { StreamProducer, StreamProducerContext } from "../types";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/** Demo chat: thinking task + progressive content */
export const demoChatProducer: StreamProducer = {
  id: "demo.chat",
  description: "Simulation – expandable thinking + content deltas",
  async run({ stream, signal }: StreamProducerContext) {
    const thinkId = "think";
    stream.push(
      stream.create.taskStarted(thinkId, "thinking", "Thinking", {
        meta: { simulation: true },
      })
    );
    stream.push(
      stream.create.activityUpdate("think", "Analyzing…", {
        status: "running",
        icon: "brain",
      })
    );
    await sleep(200, signal);
    stream.push(
      stream.create.activityUpdate("think", "Ready", {
        status: "success",
        icon: "check",
      })
    );
    stream.push(stream.create.taskCompleted(thinkId, { durationMs: 200 }));

    const parts = [
      "This is a **demo chat** stream via the adapter contract.\n\n",
      "Events come from a `StreamProducer`, not from a hardcoded Worker switch.\n\n",
      "- Universal protocol\n- Shared renderer\n- One stream engine\n\n",
      "```ts\nconst ok = true;\n```\n\n",
      "Real model adapters will replace this producer later.",
    ];
    for (const p of parts) {
      await sleep(80, signal);
      stream.push(stream.create.contentDelta("main", p));
    }
    stream.push(
      stream.create.raw({
        type: "content.complete",
        data: { channel: "main" },
      } as any)
    );
    stream.complete();
  },
};

/** Demo search: sources + short answer */
export const demoSearchProducer: StreamProducer = {
  id: "demo.search",
  description: "Simulation – search activity + source events",
  async run({ stream, signal, input }: StreamProducerContext) {
    const query =
      typeof input === "object" &&
      input &&
      "query" in input &&
      typeof (input as any).query === "string"
        ? (input as any).query
        : "demo query";

    const taskId = "task_search";
    stream.push(stream.create.taskStarted(taskId, "search", "Searching"));
    stream.push(
      stream.create.activityUpdate("search", "Querying…", { status: "running" })
    );
    stream.push(
      stream.create.raw({
        type: "search.started",
        data: { query },
      } as any)
    );
    await sleep(150, signal);
    stream.push(
      stream.create.searchSource(
        "s1",
        "Example Source",
        "https://example.com",
        { snippet: "A relevant snippet", rank: 1 }
      )
    );
    await sleep(100, signal);
    stream.push(
      stream.create.searchSource(
        "s2",
        "Another Source",
        "https://example.org",
        { rank: 2 }
      )
    );
    stream.push(
      stream.create.raw({
        type: "search.completed",
        data: { sourceCount: 2, durationMs: 250 },
      } as any)
    );
    stream.push(
      stream.create.activityUpdate("search", "Done", { status: "success" })
    );
    for (const part of [
      `Results for “${query}”. `,
      "Two demo sources were emitted as search.source events.",
    ]) {
      await sleep(60, signal);
      stream.push(stream.create.contentDelta("main", part));
    }
    stream.push(stream.create.taskCompleted(taskId, { durationMs: 400 }));
    stream.complete();
  },
};

/** Demo coding: file.created + content deltas */
export const demoCodingProducer: StreamProducer = {
  id: "demo.coding",
  description: "Simulation – file creation and code streaming",
  async run({ stream, signal }: StreamProducerContext) {
    const taskId = "task_code";
    stream.push(stream.create.taskStarted(taskId, "coding", "Write file"));
    stream.push(
      stream.create.raw({
        type: "file.created",
        data: { fileId: "f1", path: "hello.ts", language: "ts" },
      } as any)
    );
    const code = 'export const hello = "world";\n';
    for (let i = 0; i < code.length; i += 8) {
      await sleep(30, signal);
      stream.push(
        stream.create.raw({
          type: "file.content.delta",
          data: {
            fileId: "f1",
            path: "hello.ts",
            text: code.slice(i, i + 8),
          },
        } as any)
      );
    }
    stream.push(stream.create.contentDelta("main", "Created hello.ts"));
    stream.push(stream.create.taskCompleted(taskId, { durationMs: 300 }));
    stream.complete();
  },
};

/** Demo agent: nested tasks + tool */
export const demoAgentProducer: StreamProducer = {
  id: "demo.agent",
  description: "Simulation – nested agent with tool call",
  async run({ stream, signal }: StreamProducerContext) {
    const agentId = "agent1";
    stream.push(stream.create.taskStarted(agentId, "agent", "Agent"));
    stream.push(
      stream.create.taskStarted("sub", "search", "Sub-search", {
        parentTaskId: agentId,
      })
    );
    await sleep(100, signal);
    stream.push(
      stream.create.searchSource("s1", "Nested source", "https://ex.com")
    );
    stream.push(stream.create.taskCompleted("sub", { durationMs: 100 }));
    stream.push(stream.create.toolStarted("tc1", "calc", "Compute"));
    await sleep(80, signal);
    stream.push(
      stream.create.raw({
        type: "tool.completed",
        data: { toolCallId: "tc1", result: 42, durationMs: 80 },
      } as any)
    );
    stream.push(
      stream.create.contentDelta("main", "Agent done. Result: 42")
    );
    stream.push(stream.create.taskCompleted(agentId, { durationMs: 250 }));
    stream.complete();
  },
};

/** Demo planning: parent plan + child steps */
export const demoPlanningProducer: StreamProducer = {
  id: "demo.planning",
  description: "Simulation – structured plan with step progress",
  async run({ stream, signal }: StreamProducerContext) {
    const planId = "plan";
    stream.push(stream.create.taskStarted(planId, "planning", "Plan"));
    const steps = ["Gather", "Design", "Implement"];
    for (let i = 0; i < steps.length; i++) {
      const id = `step${i + 1}`;
      stream.push(
        stream.create.taskStarted(id, "custom", steps[i], {
          parentTaskId: planId,
        })
      );
      await sleep(80, signal);
      stream.push(
        stream.create.taskCompleted(id, { durationMs: 80 })
      );
      stream.push(
        stream.create.taskProgress(planId, {
          percent: Math.round(((i + 1) / steps.length) * 100),
          message: `${i + 1}/${steps.length}`,
        })
      );
    }
    stream.push(stream.create.taskCompleted(planId, { durationMs: 300 }));
    stream.push(
      stream.create.contentDelta("main", "Plan complete.")
    );
    stream.complete();
  },
};

/** Demo error: intentional failure via protocol */
export const demoErrorProducer: StreamProducer = {
  id: "demo.error",
  description: "Simulation – task.failed + stream.error",
  async run({ stream, signal }: StreamProducerContext) {
    stream.push(stream.create.taskStarted("t1", "custom", "Will fail"));
    await sleep(100, signal);
    stream.push(
      stream.create.taskFailed("t1", {
        code: "SIMULATED_ERROR",
        message: "Intentional failure for testing",
        retryable: true,
      })
    );
    stream.error("SIMULATED_ERROR", "Intentional failure for testing", true);
  },
};

/** Demo long-running work for cancellation tests */
export const demoLongProducer: StreamProducer = {
  id: "demo.long",
  description: "Simulation – long progress loop (use Stop to cancel)",
  async run({ stream, signal }: StreamProducerContext) {
    const taskId = "task_long";
    stream.push(stream.create.taskStarted(taskId, "custom", "Long work"));
    for (let i = 1; i <= 20; i++) {
      await sleep(200, signal);
      stream.push(
        stream.create.taskProgress(taskId, {
          percent: Math.round((i / 20) * 100),
          message: `Step ${i}/20`,
        })
      );
    }
    stream.push(stream.create.taskCompleted(taskId, { durationMs: 4000 }));
    stream.complete();
  },
};

/** Instant final response only – no intermediate activity (valid pattern) */
export const demoFinalOnlyProducer: StreamProducer = {
  id: "demo.final-only",
  description: "Simulation – single final content.replace, no fake progress",
  async run({ stream }: StreamProducerContext) {
    stream.push(
      stream.create.raw({
        type: "content.replace",
        data: {
          channel: "main",
          text: "Final answer only. No invented intermediate steps.",
        },
      } as any)
    );
    stream.push(
      stream.create.raw({
        type: "content.complete",
        data: { channel: "main" },
      } as any)
    );
    stream.complete();
  },
};
