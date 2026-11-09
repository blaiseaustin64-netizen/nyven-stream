# Architecture notes (Phase 3C)

## One engine

```
Capability → StreamProducer → Stream Core → Protocol events → Transport → Renderer
```

No per-capability streaming systems.

## Layers

| Package | Responsibility |
|---------|----------------|
| protocol | Event types, factory, validation |
| core | Stream lifecycle, registry, state reducer |
| transport | SSE encode/decode, client reconnect |
| adapters | StreamProducer contract, ProducerRegistry, demos |
| renderer | React experience from StreamViewState |
| worker | HTTP gateway + producer dispatch + SSE |
| playground | Host UI: local or Worker modes |

## Extending

```ts
registry.register("design", designProducer);
```

No core/renderer changes required for new event combinations that fit the protocol.

## Media

No first-class image events yet; use `file.*` / `content` + mime / meta.
