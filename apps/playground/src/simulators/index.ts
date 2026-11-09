/**
 * Simulated event producers for the playground.
 * Clearly marked as simulations – not part of the real engine.
 */

import { Stream, type StreamOptions } from "@nyven-stream/core";
import type { StreamEvent } from "@nyven-stream/protocol";

export type ScenarioId =
  | "chat"
  | "search"
  | "research"
  | "planning"
  | "coding"
  | "agent"
  | "error"
  | "cancel";

export interface Scenario {
  id: ScenarioId;
  title: string;
  description: string;
  run: (onEvent: (e: StreamEvent) => void, signal: AbortSignal) => Promise<void>;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

async function emit(
  stream: Stream,
  factory: () => StreamEvent,
  onEvent: (e: StreamEvent) => void
) {
  if (stream.aborted) throw new DOMException("Aborted", "AbortError");
  const event = factory();
  stream.push(event);
  onEvent(event);
}

/** Normal chat with expandable thinking */
const chatScenario: Scenario = {
  id: "chat",
  title: "Normal Chat",
  description: "Expandable thinking indicator + progressive content streaming",
  async run(onEvent, signal) {
    const stream = new Stream({ title: "Chat", onEvent });
    stream.start();

    const thinkingId = "task_thinking";
    await emit(
      stream,
      () =>
        stream.create.taskStarted(thinkingId, "thinking", "Thinking", {
          meta: { simulation: true },
        }),
      onEvent
    );

    await sleep(400, signal);
    await emit(
      stream,
      () =>
        stream.create.activityUpdate("think", "Analyzing the request…", {
          status: "running",
          icon: "brain",
        }),
      onEvent
    );

    await sleep(600, signal);
    await emit(
      stream,
      () =>
        stream.create.activityUpdate("think", "Formulating response…", {
          status: "running",
          icon: "brain",
        }),
      onEvent
    );

    await sleep(500, signal);
    await emit(
      stream,
      () =>
        stream.create.taskCompleted(thinkingId, {
          durationMs: 1500,
        }),
      onEvent
    );
    await emit(
      stream,
      () =>
        stream.create.activityUpdate("think", "Ready", {
          status: "success",
          icon: "check",
        }),
      onEvent
    );

    // Stream content
    const parts = [
      "Here's a concise answer to your question.\n\n",
      "NYVEN STREAM is designed as a **universal** streaming engine. ",
      "It uses a versioned event protocol so every capability—chat, search, coding, agents—",
      "can publish progress through the same infrastructure.\n\n",
      "You never need a second streaming system when you add a new feature.",
    ];

    for (const part of parts) {
      await sleep(120 + Math.random() * 80, signal);
      await emit(
        stream,
        () => stream.create.contentDelta("main", part),
        onEvent
      );
    }

    await emit(
      stream,
      () =>
        stream.create.raw({
          type: "content.complete",
          data: { channel: "main" },
        } as any),
      onEvent
    );

    stream.complete();
  },
};

/** Search activity */
const searchScenario: Scenario = {
  id: "search",
  title: "Web Search",
  description: "Live searching activity + source discovery events",
  async run(onEvent, signal) {
    const stream = new Stream({ title: "Search", onEvent });
    stream.start();

    const taskId = "task_search";
    await emit(
      stream,
      () => stream.create.taskStarted(taskId, "search", "Searching the web"),
      onEvent
    );

    await emit(
      stream,
      () =>
        stream.create.activityUpdate("search", "Querying search engines…", {
          status: "running",
          icon: "search",
        }),
      onEvent
    );

    await sleep(400, signal);

    await emit(
      stream,
      () =>
        stream.create.raw({
          type: "search.started",
          data: { query: "NYVEN STREAM architecture" },
        } as any),
      onEvent
    );

    const sources = [
      {
        id: "s1",
        title: "Universal Streaming Protocols for AI Agents",
        url: "https://example.com/streaming-protocols",
        snippet: "A survey of event-driven architectures for multi-capability AI systems…",
      },
      {
        id: "s2",
        title: "Server-Sent Events in Modern Frontends",
        url: "https://example.com/sse-guide",
        snippet: "Why SSE remains the best fit for unidirectional AI response streaming…",
      },
      {
        id: "s3",
        title: "Building Provider-Agnostic LLM UIs",
        url: "https://example.com/provider-agnostic",
        snippet: "Adapters, event buses, and why your UI should never talk to a model directly…",
      },
    ];

    for (let i = 0; i < sources.length; i++) {
      await sleep(350, signal);
      const s = sources[i];
      await emit(
        stream,
        () =>
          stream.create.searchSource(s.id, s.title, s.url, {
            snippet: s.snippet,
            rank: i + 1,
          }),
        onEvent
      );
      await emit(
        stream,
        () =>
          stream.create.activityUpdate("search", `Found ${i + 1} sources…`, {
            status: "running",
            icon: "search",
          }),
        onEvent
      );
    }

    await sleep(300, signal);
    await emit(
      stream,
      () =>
        stream.create.raw({
          type: "search.completed",
          data: { sourceCount: sources.length, durationMs: 1400 },
        } as any),
      onEvent
    );

    await emit(
      stream,
      () =>
        stream.create.activityUpdate("search", "Search complete", {
          status: "success",
          icon: "check",
        }),
      onEvent
    );

    // Answer based on sources
    const answer =
      "Based on the retrieved sources, a universal streaming engine should:\n\n" +
      "1. Own a strongly-typed event protocol\n" +
      "2. Keep transport, orchestration and rendering independent\n" +
      "3. Support nested tasks and genuine progress events\n";

    for (const word of answer.split(/(?<=\s)/)) {
      await sleep(25, signal);
      await emit(stream, () => stream.create.contentDelta("main", word), onEvent);
    }

    await emit(
      stream,
      () => stream.create.taskCompleted(taskId, { durationMs: 2200 }),
      onEvent
    );
    stream.complete();
  },
};

/** Planning */
const planningScenario: Scenario = {
  id: "planning",
  title: "Planning",
  description: "Structured plan creation + individual task progress",
  async run(onEvent, signal) {
    const stream = new Stream({ title: "Plan", onEvent });
    stream.start();

    const planId = "task_plan";
    await emit(
      stream,
      () => stream.create.taskStarted(planId, "planning", "Creating plan"),
      onEvent
    );

    await emit(
      stream,
      () =>
        stream.create.activityUpdate("plan", "Drafting plan…", {
          status: "running",
          icon: "list",
        }),
      onEvent
    );

    await sleep(500, signal);

    const steps = [
      { id: "step1", title: "Gather requirements" },
      { id: "step2", title: "Design event protocol" },
      { id: "step3", title: "Implement stream core" },
      { id: "step4", title: "Build playground" },
      { id: "step5", title: "Write tests & docs" },
    ];

    for (const step of steps) {
      await emit(
        stream,
        () =>
          stream.create.taskStarted(step.id, "custom", step.title, {
            parentTaskId: planId,
          }),
        onEvent
      );
      await sleep(200, signal);
    }

    await emit(
      stream,
      () =>
        stream.create.activityUpdate("plan", "Plan ready – executing", {
          status: "running",
        }),
      onEvent
    );

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await sleep(400, signal);
      await emit(
        stream,
        () =>
          stream.create.taskProgress(step.id, {
            percent: 50,
            message: "In progress…",
          }),
        onEvent
      );
      await sleep(350, signal);
      await emit(
        stream,
        () =>
          stream.create.taskCompleted(step.id, {
            durationMs: 750,
          }),
        onEvent
      );
      await emit(
        stream,
        () =>
          stream.create.taskProgress(planId, {
            percent: Math.round(((i + 1) / steps.length) * 100),
            message: `Completed ${i + 1}/${steps.length}`,
          }),
        onEvent
      );
    }

    await emit(
      stream,
      () => stream.create.taskCompleted(planId, { durationMs: 4500 }),
      onEvent
    );
    await emit(
      stream,
      () =>
        stream.create.activityUpdate("plan", "All steps complete", {
          status: "success",
          icon: "check",
        }),
      onEvent
    );

    await emit(
      stream,
      () =>
        stream.create.contentDelta(
          "main",
          "Plan executed successfully. All five steps finished."
        ),
      onEvent
    );

    stream.complete();
  },
};

/** Coding / build */
const codingScenario: Scenario = {
  id: "coding",
  title: "Code Streaming",
  description: "File creation + progressive code content",
  async run(onEvent, signal) {
    const stream = new Stream({ title: "Coding", onEvent });
    stream.start();

    const taskId = "task_code";
    await emit(
      stream,
      () => stream.create.taskStarted(taskId, "coding", "Generating component"),
      onEvent
    );

    await emit(
      stream,
      () =>
        stream.create.activityUpdate("code", "Creating files…", {
          status: "running",
          icon: "code",
        }),
      onEvent
    );

    await sleep(300, signal);

    const fileId = "file_button";
    await emit(
      stream,
      () =>
        stream.create.raw({
          type: "file.created",
          data: {
            fileId,
            path: "src/components/Button.tsx",
            language: "tsx",
          },
        } as any),
      onEvent
    );

    const code = `import React from "react";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
}

export function Button({ children, onClick, variant = "primary" }: ButtonProps) {
  const base = "px-4 py-2 rounded-lg font-medium transition";
  const styles = variant === "primary"
    ? "bg-blue-600 hover:bg-blue-500 text-white"
    : "bg-transparent hover:bg-slate-800 text-slate-300";

  return (
    <button className={\`\${base} \${styles}\`} onClick={onClick}>
      {children}
    </button>
  );
}
`;

    // Stream code in chunks
    const chunkSize = 40;
    for (let i = 0; i < code.length; i += chunkSize) {
      await sleep(40, signal);
      const chunk = code.slice(i, i + chunkSize);
      await emit(
        stream,
        () =>
          stream.create.raw({
            type: "file.content.delta",
            data: { fileId, path: "src/components/Button.tsx", text: chunk },
          } as any),
        onEvent
      );
    }

    await emit(
      stream,
      () =>
        stream.create.activityUpdate("code", "File written", {
          status: "success",
          icon: "check",
        }),
      onEvent
    );

    await emit(
      stream,
      () => stream.create.taskCompleted(taskId, { durationMs: 1800 }),
      onEvent
    );

    await emit(
      stream,
      () =>
        stream.create.contentDelta(
          "main",
          "Created `src/components/Button.tsx` with a reusable Button component."
        ),
      onEvent
    );

    stream.complete();
  },
};

/** Nested agent */
const agentScenario: Scenario = {
  id: "agent",
  title: "Nested Agent",
  description: "Parent agent with nested tool-using sub-tasks",
  async run(onEvent, signal) {
    const stream = new Stream({ title: "Agent", onEvent });
    stream.start();

    const agentId = "task_agent";
    await emit(
      stream,
      () => stream.create.taskStarted(agentId, "agent", "Research Agent"),
      onEvent
    );

    await emit(
      stream,
      () =>
        stream.create.activityUpdate("agent", "Orchestrating…", {
          status: "running",
          icon: "bot",
        }),
      onEvent
    );

    // Nested search task
    const searchId = "task_nested_search";
    await emit(
      stream,
      () =>
        stream.create.taskStarted(searchId, "search", "Gather sources", {
          parentTaskId: agentId,
        }),
      onEvent
    );

    await sleep(400, signal);
    await emit(
      stream,
      () =>
        stream.create.searchSource(
          "ns1",
          "Agent architectures 2025",
          "https://example.com/agents",
          { snippet: "Hierarchical agents with nested tool use…" }
        ),
      onEvent
    );
    await emit(
      stream,
      () => stream.create.taskCompleted(searchId, { durationMs: 600 }),
      onEvent
    );

    // Nested tool call
    const toolId = "tool_calc";
    await emit(
      stream,
      () =>
        stream.create.toolStarted(toolId, "calculator", "Compute final score"),
      onEvent
    );
    await sleep(300, signal);
    await emit(
      stream,
      () =>
        stream.create.raw({
          type: "tool.input",
          data: { toolCallId: toolId, input: { expression: "0.85 * 100" } },
        } as any),
      onEvent
    );
    await sleep(250, signal);
    await emit(
      stream,
      () =>
        stream.create.raw({
          type: "tool.completed",
          data: { toolCallId: toolId, result: 85, durationMs: 250 },
        } as any),
      onEvent
    );

    await emit(
      stream,
      () => stream.create.taskCompleted(agentId, { durationMs: 1600 }),
      onEvent
    );

    await emit(
      stream,
      () =>
        stream.create.contentDelta(
          "main",
          "Agent finished. Confidence score: 85. Sources gathered and tool executed successfully."
        ),
      onEvent
    );

    stream.complete();
  },
};

/** Error scenario */
const errorScenario: Scenario = {
  id: "error",
  title: "Error Handling",
  description: "Demonstrates stream.error and task.failed",
  async run(onEvent, signal) {
    const stream = new Stream({ title: "Error Demo", onEvent });
    stream.start();

    const taskId = "task_fail";
    await emit(
      stream,
      () => stream.create.taskStarted(taskId, "custom", "Risky operation"),
      onEvent
    );

    await sleep(600, signal);
    await emit(
      stream,
      () =>
        stream.create.taskFailed(taskId, {
          code: "PROVIDER_TIMEOUT",
          message: "Upstream model timed out after 30s",
          retryable: true,
        }),
      onEvent
    );

    stream.error("PROVIDER_TIMEOUT", "Upstream model timed out after 30s", true);
  },
};

/** Cancellation */
const cancelScenario: Scenario = {
  id: "cancel",
  title: "Cancellation",
  description: "Stream that can be cancelled mid-flight (use Stop button)",
  async run(onEvent, signal) {
    const stream = new Stream({ title: "Long Task", onEvent });
    stream.start();

    const taskId = "task_long";
    await emit(
      stream,
      () => stream.create.taskStarted(taskId, "custom", "Long-running work"),
      onEvent
    );

    for (let i = 1; i <= 20; i++) {
      await sleep(400, signal);
      await emit(
        stream,
        () =>
          stream.create.taskProgress(taskId, {
            percent: i * 5,
            message: `Step ${i}/20`,
          }),
        onEvent
      );
      await emit(
        stream,
        () =>
          stream.create.activityUpdate("long", `Working… ${i * 5}%`, {
            status: "running",
          }),
        onEvent
      );
    }

    await emit(
      stream,
      () => stream.create.taskCompleted(taskId, { durationMs: 8000 }),
      onEvent
    );
    stream.complete();
  },
};

export const scenarios: Scenario[] = [
  chatScenario,
  searchScenario,
  planningScenario,
  codingScenario,
  agentScenario,
  errorScenario,
  cancelScenario,
];

export function getScenario(id: ScenarioId): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}
