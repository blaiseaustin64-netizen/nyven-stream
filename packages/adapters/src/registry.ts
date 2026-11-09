/**
 * ProducerRegistry – extensible map from capability id → StreamProducer.
 *
 * Stream Core never imports this. The Worker (or any host) owns a registry
 * instance and registers producers at startup.
 */

import type { StreamProducer } from "./types";

export class ProducerRegistry {
  private producers = new Map<string, StreamProducer>();

  /**
   * Register a producer under a capability key.
   * Throws if the key is already taken (fail-fast; use replace to override).
   */
  register(capability: string, producer: StreamProducer): this {
    const key = normalizeCapability(capability);
    if (!key) {
      throw new Error("capability must be a non-empty string");
    }
    if (this.producers.has(key)) {
      throw new Error(
        `Producer already registered for capability "${key}". Use replace() to override.`
      );
    }
    this.producers.set(key, producer);
    return this;
  }

  /**
   * Register or replace a producer.
   */
  replace(capability: string, producer: StreamProducer): this {
    const key = normalizeCapability(capability);
    if (!key) {
      throw new Error("capability must be a non-empty string");
    }
    this.producers.set(key, producer);
    return this;
  }

  /**
   * Resolve a producer. Returns undefined if unknown.
   */
  get(capability: string): StreamProducer | undefined {
    return this.producers.get(normalizeCapability(capability));
  }

  /**
   * Resolve or throw.
   */
  require(capability: string): StreamProducer {
    const p = this.get(capability);
    if (!p) {
      throw new ProducerNotFoundError(capability);
    }
    return p;
  }

  has(capability: string): boolean {
    return this.producers.has(normalizeCapability(capability));
  }

  /** List registered capability keys (sorted). */
  list(): string[] {
    return Array.from(this.producers.keys()).sort();
  }

  get size(): number {
    return this.producers.size;
  }

  clear(): void {
    this.producers.clear();
  }
}

export class ProducerNotFoundError extends Error {
  readonly code = "UNKNOWN_CAPABILITY";
  readonly capability: string;
  constructor(capability: string) {
    super(`No producer registered for capability "${capability}"`);
    this.name = "ProducerNotFoundError";
    this.capability = capability;
  }
}

function normalizeCapability(capability: string): string {
  return String(capability ?? "")
    .trim()
    .toLowerCase();
}

/** Create an empty registry (hosts populate it). */
export function createProducerRegistry(): ProducerRegistry {
  return new ProducerRegistry();
}
