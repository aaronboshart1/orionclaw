/**
 * OrionClaw — WorkflowState
 *
 * Per-workflow key-value state store with typed entries and history tracking.
 */

import type { StateEntry, StateEntryType, StateTTL, WorkflowStateData } from '../types.js';

export class WorkflowState {
  private entries: Map<string, StateEntry> = new Map();
  private changeLog: Array<{ key: string; value: unknown; producer: string; timestamp: string }> = [];

  put(
    key: string,
    value: unknown,
    producer: string,
    type: StateEntryType = 'intermediate',
    ttl: StateTTL = 'workflow',
  ): void {
    const now = new Date().toISOString();
    const existing = this.entries.get(key);
    this.entries.set(key, {
      key,
      value,
      producer,
      type,
      ttl,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      version: (existing?.version ?? 0) + 1,
    });
    this.changeLog.push({ key, value, producer, timestamp: now });
  }

  get(key: string): unknown | undefined {
    return this.entries.get(key)?.value;
  }

  getEntry(key: string): StateEntry | undefined {
    return this.entries.get(key);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  getByProducer(producer: string): StateEntry[] {
    return [...this.entries.values()].filter(e => e.producer === producer);
  }

  getByType(type: StateEntryType): StateEntry[] {
    return [...this.entries.values()].filter(e => e.type === type);
  }

  getPersistable(): StateEntry[] {
    return [...this.entries.values()].filter(e => e.ttl === 'persistent');
  }

  getSummary(maxChars = 4000): string {
    const lines: string[] = [];
    for (const entry of this.entries.values()) {
      const valStr = typeof entry.value === 'string'
        ? entry.value
        : JSON.stringify(entry.value);
      lines.push(`[${entry.type}] ${entry.key} (by ${entry.producer}): ${valStr}`);
    }
    const full = lines.join('\n');
    return full.length <= maxChars ? full : full.slice(0, maxChars) + '\n...(truncated)';
  }

  getHistory(): Array<{ key: string; value: unknown; producer: string; timestamp: string }> {
    return [...this.changeLog];
  }

  toJSON(): WorkflowStateData {
    const entries: Record<string, StateEntry> = {};
    for (const [k, v] of this.entries) entries[k] = v;
    return { entries, history: [...this.changeLog] };
  }

  static fromJSON(data: WorkflowStateData): WorkflowState {
    const state = new WorkflowState();
    for (const [k, v] of Object.entries(data.entries)) state.entries.set(k, v);
    state.changeLog.push(...data.history);
    return state;
  }
}
