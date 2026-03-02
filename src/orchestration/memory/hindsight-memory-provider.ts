/**
 * OrionClaw — HindsightMemoryProvider
 *
 * Implements MemoryProvider interface using the Hindsight API.
 * Gives agents access to long-term memory during orchestration.
 */

import type { MemoryProvider } from '../state/context-assembler.js';
import { HindsightApiClient } from './hindsight-api.js';

export class HindsightMemoryProvider implements MemoryProvider {
  private client: HindsightApiClient;
  private bankId: string;

  constructor(options?: { client?: HindsightApiClient; bankId?: string; url?: string }) {
    this.client = options?.client ?? new HindsightApiClient(options?.url);
    this.bankId = options?.bankId ?? 'jarvis-core';
  }

  async recall(query: string, maxTokens: number): Promise<string> {
    return this.client.recall(this.bankId, query, maxTokens);
  }
}
