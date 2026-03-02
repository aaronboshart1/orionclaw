/**
 * OrionClaw — HindsightProcessor
 *
 * Post-workflow lesson extraction, confidence decay, and JSONL persistence.
 * Implements LessonProvider for the ContextAssembler.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ExecutionTrace, HindsightLesson, LessonType } from '../types.js';
import type { LessonProvider } from '../state/context-assembler.js';

const DEFAULT_DATA_DIR = path.join(
  process.env['HOME'] ?? '/tmp',
  '.orionclaw',
  'workspace',
  'orchestration',
);
const LESSONS_FILE = 'lessons.jsonl';
const DEFAULT_DECAY_RATE = 0.05; // per day
const MIN_CONFIDENCE = 0.1;

export class HindsightProcessor implements LessonProvider {
  private dataDir: string;
  private lessonsPath: string;
  private lessons: HindsightLesson[] = [];
  private loaded = false;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.lessonsPath = path.join(this.dataDir, LESSONS_FILE);
  }

  /** Load lessons from JSONL file. */
  async load(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const content = await fs.readFile(this.lessonsPath, 'utf-8');
      this.lessons = content
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as HindsightLesson);
    } catch {
      this.lessons = [];
    }
    this.loaded = true;
  }

  /** Save all lessons to JSONL. */
  private async save(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const content = this.lessons.map(l => JSON.stringify(l)).join('\n') + '\n';
    await fs.writeFile(this.lessonsPath, content, 'utf-8');
  }

  /**
   * Extract lessons from a completed workflow trace.
   * In production this would call Haiku 4.5 — here we do rule-based extraction.
   */
  async processTrace(trace: ExecutionTrace): Promise<HindsightLesson[]> {
    if (!this.loaded) await this.load();

    const newLessons: HindsightLesson[] = [];
    const now = new Date().toISOString();
    const results = trace.results instanceof Map
      ? Object.fromEntries(trace.results)
      : trace.results;

    // Extract lessons from node results
    const nodeIds = Object.keys(results);
    const failedNodes = nodeIds.filter(id => results[id].status === 'FAILED');
    const completedNodes = nodeIds.filter(id => results[id].status === 'COMPLETED');

    // Lesson: workflow completion pattern
    if (failedNodes.length === 0 && completedNodes.length > 0) {
      newLessons.push({
        id: crypto.randomUUID(),
        taskPattern: `workflow:${trace.workflowId}`,
        lesson: `Workflow with ${completedNodes.length} nodes completed successfully in ${trace.durationMs ?? 0}ms`,
        confidence: 0.7,
        type: 'outcome' as LessonType,
        appliesTo: completedNodes,
        createdAt: now,
        decayRate: DEFAULT_DECAY_RATE,
      });
    }

    // Lesson: failure patterns
    for (const nodeId of failedNodes) {
      const result = results[nodeId];
      newLessons.push({
        id: crypto.randomUUID(),
        taskPattern: `failure:${nodeId}`,
        lesson: `Node ${nodeId} failed: ${result.error ?? 'unknown error'}. Consider adding fallback or retry logic.`,
        confidence: 0.8,
        type: 'process' as LessonType,
        appliesTo: [nodeId],
        createdAt: now,
        decayRate: DEFAULT_DECAY_RATE,
      });
    }

    // Lesson: slow nodes
    for (const nodeId of completedNodes) {
      const result = results[nodeId];
      if (result.durationMs && result.durationMs > 60000) {
        newLessons.push({
          id: crypto.randomUUID(),
          taskPattern: `slow:${nodeId}`,
          lesson: `Node ${nodeId} took ${Math.round(result.durationMs / 1000)}s — consider optimizing or using a faster model.`,
          confidence: 0.6,
          type: 'process' as LessonType,
          appliesTo: [nodeId],
          createdAt: now,
          decayRate: DEFAULT_DECAY_RATE,
        });
      }
    }

    this.lessons.push(...newLessons);
    await this.save();
    return newLessons;
  }

  /** Apply confidence decay and prune low-confidence lessons. */
  async decay(): Promise<number> {
    if (!this.loaded) await this.load();

    const now = Date.now();
    let pruned = 0;

    this.lessons = this.lessons.filter(lesson => {
      const ageMs = now - new Date(lesson.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      lesson.confidence = lesson.confidence * Math.pow(1 - lesson.decayRate, ageDays);

      if (lesson.confidence < MIN_CONFIDENCE) {
        pruned++;
        return false;
      }
      return true;
    });

    await this.save();
    return pruned;
  }

  /** LessonProvider interface — search for relevant lessons. */
  async search(taskDescription: string): Promise<HindsightLesson[]> {
    if (!this.loaded) await this.load();

    const query = taskDescription.toLowerCase();
    const scored = this.lessons
      .map(lesson => {
        let score = lesson.confidence;
        // Simple keyword matching
        const words = query.split(/\s+/);
        for (const word of words) {
          if (word.length < 3) continue;
          if (lesson.lesson.toLowerCase().includes(word)) score += 0.1;
          if (lesson.taskPattern.toLowerCase().includes(word)) score += 0.2;
          for (const tag of lesson.appliesTo) {
            if (tag.toLowerCase().includes(word)) score += 0.15;
          }
        }
        return { lesson, score };
      })
      .filter(s => s.score > MIN_CONFIDENCE)
      .sort((a, b) => b.score - a.score);

    // Mark as used
    const results = scored.slice(0, 10).map(s => {
      s.lesson.lastUsed = new Date().toISOString();
      return s.lesson;
    });

    if (results.length > 0) {
      await this.save();
    }

    return results;
  }

  /** Get all stored lessons. */
  async getAllLessons(): Promise<HindsightLesson[]> {
    if (!this.loaded) await this.load();
    return [...this.lessons];
  }
}
