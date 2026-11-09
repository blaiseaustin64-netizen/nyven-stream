# NYVEN STREAM

**Universal, provider-independent streaming engine for NYVEN.**

Standalone project — does **not** depend on or modify the production NYVEN codebase.

## Architecture

```
packages/
  protocol/     Versioned event types + factory + validation
  core/         Stream lifecycle, registry, state reducer
  transport/    SSE client & server helpers (Web Streams)
  renderer/     React UI primitives (planned)
  adapters/     Future provider / tool adapters

apps/
  playground/   Interactive simulation playground
  worker/       Cloudflare Worker backend (SSE)
```

## Event Protocol (v0.1)

Strongly typed events for stream/task lifecycle, content, activity, tools, files, search, progress, heartbeats. Every event carries `v`, `id`, `streamId`, `ts`, `seq`.

## Phase 2 status

| Component | Status |
|-----------|--------|
| Event protocol + factory + validation | Implemented & tested |
| Stream core + registry + state reducer | Implemented & tested |
| SSE transport helpers | Implemented & tested |
| Automated tests (lifecycle, nesting, concurrency, cancel, error, replay, ordering) | **30/30 PASS** |
| Cloudflare Worker (POST create, GET SSE, cancel, reconnection) | Implemented |
| Adapter contract + ProducerRegistry | Implemented |
| Worker dispatches via registry (no runScenario architecture) | Implemented |
| Demo producers implement StreamProducer | Implemented |
| Experience renderer (`@nyven-stream/renderer`) | Implemented |
| Playground uses shared renderer package | Implemented |
| Playground simulations | Implemented |
| Real model adapters | Not yet |

## Worker endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/v1/streams` | Create stream. Body: `{ title?, scenario?, meta? }`. Returns `{ streamId, sseUrl }` |
| GET | `/v1/streams/:id` | SSE stream. Supports `?lastSeq=` and `Last-Event-ID` header for reconnection |
| POST | `/v1/streams/:id/cancel` | Cancel stream |

Scenarios (simulations until real adapters): `chat` (default), `search`, `planning`, `coding`, `agent`, `error`, `long`.

## Tests

```bash
# Node built-in runner (no Vitest install required)
npm test
# or:
node --experimental-strip-types --experimental-loader ./tests/ts-loader.mjs --test tests/*.node.test.ts
```

Coverage includes:
- Event creation & sequential numbering
- Validation & invalid events
- Stream lifecycle
- Content accumulation / replace
- Nested tasks
- Concurrent streams (registry)
- Cancellation (AbortSignal)
- Stream errors
- Event ordering
- Replay from sequence number
- SSE frame format + end-to-end consume + state reconstruction

## Local development

```bash
cd nyven-stream
npm install          # workspaces + wrangler
npm test             # unit + integration
npm run dev:playground   # Vite playground :5173
npm run dev:worker       # wrangler dev :8787
```

### Testing SSE manually

```bash
# Terminal 1
npm run dev:worker

# Terminal 2 – create stream
curl -s -X POST http://localhost:8787/v1/streams \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"chat"}' | jq

# Connect SSE (replace STREAM_ID)
curl -N "http://localhost:8787/v1/streams/STREAM_ID"

# Reconnect with lastSeq
curl -N "http://localhost:8787/v1/streams/STREAM_ID?lastSeq=3"

# Cancel
curl -X POST http://localhost:8787/v1/streams/STREAM_ID/cancel
```

## Cloudflare configuration

- `wrangler.toml` included — free tier compatible
- In-memory stream registry (per isolate). Suitable for development and low traffic
- For multi-isolate production reconnection, add a Durable Object later (optional paid)
- No KV, R2, or paid services required for core streaming

## Expected costs

- **Development**: $0 (Cloudflare Workers free tier + local wrangler)
- **Low production traffic**: typically within free tier (100k requests/day)
- **Higher scale**: Workers paid plan only if you exceed free limits; Durable Objects only if you need cross-isolate stream state

## Principles

1. One engine for every capability  
2. Events are truth — no fake progress in the engine  
3. Transport / orchestration / UI stay independent  
4. Provider-agnostic  
5. Independent of the main NYVEN repository  

## License

MIT
