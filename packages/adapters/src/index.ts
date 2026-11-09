/**
 * @nyven-stream/adapters
 *
 * Universal StreamProducer contract + registry.
 * Demo producers live under ./demo (optional).
 */

export type {
  StreamProducer,
  StreamProducerContext,
  CreateStreamRequest,
  SafeErrorInfo,
} from "./types";
export { toSafeError } from "./types";

export {
  ProducerRegistry,
  ProducerNotFoundError,
  createProducerRegistry,
} from "./registry";

export { runProducer } from "./run";
export type { RunProducerOptions } from "./run";

// Demo producers are re-exported for convenience in dev/tests.
// Production hosts may choose not to register them.
export {
  demoChatProducer,
  demoSearchProducer,
  demoCodingProducer,
  demoAgentProducer,
  demoPlanningProducer,
  demoErrorProducer,
  demoLongProducer,
  demoFinalOnlyProducer,
  registerDemoProducers,
} from "./demo/index";
