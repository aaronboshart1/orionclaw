/**
 * OrionClaw — ImplicitFeedbackCollector
 *
 * Automatically tracks implicit signals from workflow execution.
 */

import type { ImplicitFeedback, ExecutionTrace } from '../types.js';
import { ImplicitSignal } from '../types.js';

export class ImplicitFeedbackCollector {
  private signals: ImplicitFeedback[] = [];

  /** Record a signal. */
  record(signal: ImplicitSignal, workflowId: string, nodeId?: string, value?: number): void {
    this.signals.push({
      signal,
      workflowId,
      nodeId,
      value,
      timestamp: new Date().toISOString(),
    });
  }

  /** Auto-extract signals from a completed trace. */
  extractFromTrace(trace: ExecutionTrace): ImplicitFeedback[] {
    const extracted: ImplicitFeedback[] = [];
    const results = trace.results instanceof Map
      ? Object.fromEntries(trace.results)
      : trace.results;

    // Workflow completion signal
    const allCompleted = Object.values(results).every(
      r => r.status === 'COMPLETED' || r.status === 'SKIPPED',
    );
    if (allCompleted) {
      const fb: ImplicitFeedback = {
        signal: ImplicitSignal.TASK_COMPLETED,
        workflowId: trace.workflowId,
        timestamp: new Date().toISOString(),
      };
      extracted.push(fb);
      this.signals.push(fb);
    }

    // Response time signal
    if (trace.durationMs !== undefined) {
      const fb: ImplicitFeedback = {
        signal: ImplicitSignal.RESPONSE_TIME,
        workflowId: trace.workflowId,
        value: trace.durationMs,
        timestamp: new Date().toISOString(),
      };
      extracted.push(fb);
      this.signals.push(fb);
    }

    return extracted;
  }

  /** Record task abandonment. */
  recordAbandoned(workflowId: string): void {
    this.record(ImplicitSignal.ABANDONED, workflowId);
  }

  /** Record that user accepted result without changes. */
  recordAccepted(workflowId: string): void {
    this.record(ImplicitSignal.ACCEPTED, workflowId);
  }

  /** Record that user edited the result. */
  recordEdited(workflowId: string, nodeId?: string): void {
    this.record(ImplicitSignal.EDITED, workflowId, nodeId);
  }

  /** Record that workflow was restarted. */
  recordRestarted(workflowId: string): void {
    this.record(ImplicitSignal.RESTARTED, workflowId);
  }

  /** Get all collected signals for a workflow. */
  getSignals(workflowId?: string): ImplicitFeedback[] {
    if (!workflowId) return [...this.signals];
    return this.signals.filter(s => s.workflowId === workflowId);
  }

  /** Clear signals. */
  clear(): void {
    this.signals = [];
  }
}
