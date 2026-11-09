# Local development

## Prerequisites

- Node.js 20+
- npm 10+

## Install

```bash
cd nyven-stream
npm install
```

## Run playground (local demo producers)

```bash
npm run dev:playground
# http://localhost:5173
```

Mode **Local demo** runs producers in the browser via Stream Core + renderer.

## Run Worker + playground (real SSE pipeline)

Terminal 1:

```bash
npm run dev:worker
# http://127.0.0.1:8787
```

Terminal 2:

```bash
npm run dev:playground
```

In the playground, switch mode to **Worker SSE**, then pick a capability.

Optional env (playground):

```bash
# apps/playground/.env.local
VITE_WORKER_URL=http://127.0.0.1:8787
```

## Tests

```bash
npm test
```

## Pipeline under test (Worker mode)

```
Demo StreamProducer
  → Stream Core (Worker)
  → SSE transport
  → Playground SseClient
  → applyEvent / state
  → @nyven-stream/renderer
```

## Cancellation

Stop in the UI calls `POST /v1/streams/:id/cancel` (Worker mode) or `stream.cancel` (local mode).

## Reconnection

SSE client sends `?lastSeq=` / respects `Last-Event-ID`. Stream Core `replayFrom` supplies missing events while the stream remains in memory on the isolate.
