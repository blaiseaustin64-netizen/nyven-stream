import type { StreamProducer } from "../types";

export interface WorkersAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface WorkersAITextGenerationBinding {
  run(
    model: string,
    input: {
      messages: WorkersAIMessage[];
      stream: true;
      max_tokens: number;
      temperature: number;
    }
  ): Promise<ReadableStream<Uint8Array>>;
}

const DEFAULT_MODEL = "@cf/qwen/qwen3.8-27b";
const SYSTEM_PROMPT =
  "You are NYVEN, a helpful, accurate, thoughtful AI assistant. Answer naturally and clearly. Do not claim to have performed actions you have not performed.";

function readMessages(input: unknown): WorkersAIMessage[] {
  if (!input || typeof input !== "object") {
    throw new Error("Chat input must be an object containing a prompt or messages.");
  }

  const value = input as Record<string, unknown>;
  const messages: WorkersAIMessage[] = [];

  if (Array.isArray(value.messages)) {
    for (const item of value.messages.slice(-24)) {
      if (!item || typeof item !== "object") continue;
      const message = item as Record<string, unknown>;
      const role = message.role;
      const content = message.content;
      if (
        (role === "system" || role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.trim()
      ) {
        messages.push({ role, content: content.slice(0, 24_000) });
      }
    }
  } else if (typeof value.prompt === "string" && value.prompt.trim()) {
    messages.push({ role: "user", content: value.prompt.slice(0, 24_000) });
  }

  if (!messages.some((message) => message.role === "user")) {
    throw new Error("A non-empty user message is required.");
  }

  if (messages[0]?.role !== "system") {
    messages.unshift({ role: "system", content: SYSTEM_PROMPT });
  }

  return messages;
}

function extractText(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed || trimmed === "[DONE]") return "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Ignore non-JSON SSE comments/metadata rather than leaking protocol text.
    return "";
  }

  if (!parsed || typeof parsed !== "object") return "";
  const record = parsed as Record<string, unknown>;
  if (typeof record.response === "string") return record.response;
  if (typeof record.text === "string") return record.text;
  if (record.result && typeof record.result === "object") {
    const result = record.result as Record<string, unknown>;
    if (typeof result.response === "string") return result.response;
  }
  if (record.error) {
    throw new Error("Workers AI could not complete the generation request.");
  }
  return "";
}

function parseSseFrame(frame: string): string {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  return data.length ? extractText(data.join("\n")) : "";
}

/**
 * Real Cloudflare Workers AI producer. It forwards model token deltas into
 * NYVEN STREAM's existing content.delta protocol; it does not create its own
 * HTTP/SSE transport or simulated activity.
 */
export function createWorkersAIChatProducer(
  ai: WorkersAITextGenerationBinding,
  model = DEFAULT_MODEL
): StreamProducer {
  return {
    id: "cloudflare-workers-ai.chat",
    description: `Real streamed chat responses from Cloudflare Workers AI (${model})`,
    async run({ stream, signal, input }) {
      const messages = readMessages(input);
      const taskId = "model_generation";
      const startedAt = Date.now();

      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      stream.push(
        stream.create.taskStarted(taskId, "generation", "Generating response", {
          meta: { provider: "cloudflare-workers-ai", model },
        })
      );

      const modelStream = await ai.run(model, {
        messages,
        stream: true,
        max_tokens: 2048,
        temperature: 0.7,
      });

      const reader = modelStream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let emittedAnyText = false;

      const onAbort = () => {
        void reader.cancel().catch(() => undefined);
      };
      signal.addEventListener("abort", onAbort, { once: true });

      const emitFrame = (frame: string) => {
        const text = parseSseFrame(frame);
        if (!text) return;
        emittedAnyText = true;
        stream.push(stream.create.contentDelta("main", text, taskId));
      };

      try {
        while (true) {
          if (signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.search(/\r?\n\r?\n/);
          while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? "\n\n";
            buffer = buffer.slice(boundary + separator.length);
            emitFrame(frame);
            boundary = buffer.search(/\r?\n\r?\n/);
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) emitFrame(buffer);
      } finally {
        signal.removeEventListener("abort", onAbort);
        reader.releaseLock();
      }

      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (!emittedAnyText) {
        throw new Error("Workers AI returned an empty response.");
      }

      stream.push(
        stream.create.taskCompleted(taskId, {
          durationMs: Date.now() - startedAt,
        })
      );
      stream.push(
        stream.create.raw({
          type: "content.complete",
          data: { channel: "main" },
        } as any)
      );
    },
  };
}
