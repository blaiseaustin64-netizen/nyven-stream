# How to create a NYVEN STREAM adapter

## Core idea

**There is only one NYVEN STREAM engine.**

An adapter (also called a **StreamProducer**) is **not** a streaming engine.  
It is a small unit of work that **emits NYVEN STREAM protocol events** into an existing `Stream`.

```
Provider / Tool / Capability
            ↓
      StreamProducer  (adapter)
            ↓
      Stream Core     (packages/core)
            ↓
      Protocol events
            ↓
      Transport (SSE)
            ↓
      Renderer → User
```

NYVEN owns the stream experience. Providers only supply intelligence or side effects.

---

## Contract

```ts
interface StreamProducer {
  id?: string;
  description?: string;
  run(context: StreamProducerContext): Promise<void>;
}

interface StreamProducerContext {
  stream: Stream;          // already started by the host
  signal: AbortSignal;     // cancel / timeout / disconnect
  input: unknown;          // capability-specific payload
  meta?: Record<string, unknown>;
  capability: string;      // registry key
}
```

Location: `@nyven-stream/adapters` → `packages/adapters/src/types.ts`

### What a producer may do

- `stream.push(stream.create.contentDelta("main", "..."))`
- `stream.create.taskStarted(...)` / progress / completed / failed
- Nested tasks via `parentTaskId`
- `activity.update` only when it reflects real work
- `tool.*` events for real tool invocations
- `search.source` for real sources
- `file.*` for real file operations
- `stream.complete()` / `stream.error(...)` / respect cancel

### What a producer must NOT do

- Invent fake “Thinking…”, “Almost done…” progress
- Import or depend on SSE, React, or Worker HTTP details
- Put secrets, API keys, or stack traces into events
- Create a second streaming system

If a provider only returns one final string:

```ts
stream.push(stream.create.raw({
  type: "content.replace",
  data: { channel: "main", text: finalAnswer },
} as any));
stream.complete();
```

That is valid and preferred over fake intermediate steps.

---

## Registry

```ts
import {
  createProducerRegistry,
  registerDemoProducers,
} from "@nyven-stream/adapters";

const registry = createProducerRegistry();

// Demo only (dev / playground)
registerDemoProducers(registry);

// Real capability
registry.register("research", researchProducer);
```

- Keys are normalized to lowercase.
- `register` fails on duplicates; use `replace` to override.
- Stream Core never imports the registry. The **Worker** (or any host) owns it.

---

## Running a producer (host side)

```ts
import { Stream } from "@nyven-stream/core";
import { runProducer } from "@nyven-stream/adapters";

const stream = new Stream({ title: "Research" });
stream.start();

await runProducer({
  stream,
  producer: registry.require("research"),
  signal: abortController.signal,
  capability: "research",
  input: { query: "…" },
  meta: { userId: "…" },
});
```

`runProducer` maps:

| Situation | Result |
|-----------|--------|
| Normal return, stream still active | `stream.complete()` |
| `AbortError` / aborted signal | `stream.cancel(...)` if still active |
| Thrown error | `stream.error(safeCode, safeMessage)` — no secret leakage |

---

## Worker request schema

```http
POST /v1/streams
Content-Type: application/json

{
  "capability": "search",
  "input": { "query": "nyven stream architecture" },
  "title": "Optional title",
  "meta": { "client": "playground" }
}
```

Response:

```json
{
  "streamId": "stream_…",
  "sseUrl": "/v1/streams/stream_…",
  "capability": "search",
  "status": "active"
}
```

Then connect with `GET /v1/streams/:id` (SSE).

Legacy field `scenario` is accepted as an alias for `capability` for older demo clients; prefer `capability`.

List keys: `GET /v1/capabilities`

---

## Cancellation flow

```
User Stop → POST /v1/streams/:id/cancel
         → stream.cancel() → AbortSignal aborted
         → producer sees signal / AbortError
         → stops provider/tool work
         → stream status = cancelled
         → SSE ends
```

Producers should pass `signal` into any async I/O they start.

---

## Error flow

```
producer throws / calls stream.error
    → stream.error event (safe message)
    → status = error
    → SSE delivers stream.error then [DONE]
```

Never put credentials or stack traces in `message`.

---

## Example: future capability without touching core

```ts
// packages/adapters-design/src/producer.ts  (future package)
import type { StreamProducer } from "@nyven-stream/adapters";

export const designProducer: StreamProducer = {
  id: "nyven.design",
  description: "NYVEN DESIGN capability",
  async run({ stream, signal, input }) {
    const prompt = (input as { prompt?: string })?.prompt ?? "";
    stream.push(stream.create.taskStarted("design", "design", "Design"));
    // … call real tools/models, emit file/content events …
    // respect signal
    stream.push(stream.create.contentDelta("main", `Design for: ${prompt}`));
    stream.push(stream.create.taskCompleted("design", { durationMs: 0 }));
    stream.complete();
  },
};

// In Worker bootstrap only:
// registry.register("design", designProducer);
```

**No changes** to `packages/protocol`, `packages/core`, or `packages/transport` are required for a new capability that fits existing event types.

---

## Media / images (protocol note)

There is no first-class `image.*` event yet. For now:

- Use `file.created` + `file.content.delta` with a path/mime, or
- Use `content.delta` with `mime` (e.g. image URL or description), or
- Put structured refs in `meta` / tool results.

A dedicated media event can be added later with a protocol version bump if needed. Do not invent a second streaming system for images.

---

## Testing

```bash
node --experimental-strip-types \
  --experimental-loader ./tests/ts-loader.mjs \
  --test tests/adapters.node.test.ts
```

Use **demo** or **custom test producers** only — never live provider credentials in unit tests.

---

## Checklist for a new adapter

1. Implement `StreamProducer.run`
2. Emit only real work as events
3. Honor `AbortSignal`
4. End with complete / error / cancel
5. `registry.register("your-capability", producer)` in the host
6. Call `POST /v1/streams` with `{ "capability": "your-capability", "input": { … } }`
7. Do not modify Stream Core
