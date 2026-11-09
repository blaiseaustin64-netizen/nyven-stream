/**
 * Register all demo producers onto a registry.
 * Used by the Worker in development and by tests.
 */

import type { ProducerRegistry } from "../registry";
import {
  demoAgentProducer,
  demoChatProducer,
  demoCodingProducer,
  demoErrorProducer,
  demoFinalOnlyProducer,
  demoLongProducer,
  demoPlanningProducer,
  demoSearchProducer,
} from "./producers";

/**
 * Registers demo capabilities. Keys are capability ids used in API requests.
 * These are simulations only.
 */
export function registerDemoProducers(registry: ProducerRegistry): void {
  registry
    .register("chat", demoChatProducer)
    .register("search", demoSearchProducer)
    .register("coding", demoCodingProducer)
    .register("agent", demoAgentProducer)
    .register("planning", demoPlanningProducer)
    .register("error", demoErrorProducer)
    .register("long", demoLongProducer)
    .register("final-only", demoFinalOnlyProducer);

  // Aliases that older clients might still send as "scenario"
  registry.replace("demo.chat", demoChatProducer);
  registry.replace("demo.search", demoSearchProducer);
}
