/**
 * OrionClaw — ReflectionFeedbackCollector
 *
 * At configurable sample rate, prompts for open-ended "How did that go?" feedback.
 */

export interface ReflectionEntry {
  workflowId: string;
  reflection: string;
  timestamp: string;
}

export class ReflectionFeedbackCollector {
  private sampleRate: number;
  private reflections: ReflectionEntry[] = [];
  private executionCount = 0;

  constructor(sampleRate = 0.1) {
    this.sampleRate = Math.max(0, Math.min(1, sampleRate));
  }

  /** Check if we should request reflection for this workflow. */
  shouldRequestReflection(): boolean {
    this.executionCount++;
    return Math.random() < this.sampleRate;
  }

  /** Record a reflection response. */
  addReflection(workflowId: string, reflection: string): void {
    this.reflections.push({
      workflowId,
      reflection,
      timestamp: new Date().toISOString(),
    });
  }

  /** Get reflection for a specific workflow. */
  getReflection(workflowId: string): ReflectionEntry | undefined {
    return this.reflections.find(r => r.workflowId === workflowId);
  }

  /** Get all reflections. */
  getAllReflections(): ReflectionEntry[] {
    return [...this.reflections];
  }

  /** Get the current sample rate. */
  getSampleRate(): number {
    return this.sampleRate;
  }

  /** Update the sample rate. */
  setSampleRate(rate: number): void {
    this.sampleRate = Math.max(0, Math.min(1, rate));
  }

  /** Get stats. */
  getStats(): { executionCount: number; reflectionCount: number; sampleRate: number } {
    return {
      executionCount: this.executionCount,
      reflectionCount: this.reflections.length,
      sampleRate: this.sampleRate,
    };
  }

  /** Clear reflections. */
  clear(): void {
    this.reflections = [];
    this.executionCount = 0;
  }
}
