import { describe, it, expect } from 'vitest';
import { WorkflowState } from '../state/workflow-state.js';

describe('WorkflowState', () => {
  it('put and get', () => {
    const s = new WorkflowState();
    s.put('key1', 'value1', 'agent-a', 'output');
    expect(s.get('key1')).toBe('value1');
    expect(s.has('key1')).toBe(true);
    expect(s.has('nope')).toBe(false);
  });

  it('getEntry returns full entry', () => {
    const s = new WorkflowState();
    s.put('k', 42, 'p', 'decision', 'persistent');
    const entry = s.getEntry('k');
    expect(entry?.value).toBe(42);
    expect(entry?.producer).toBe('p');
    expect(entry?.type).toBe('decision');
    expect(entry?.ttl).toBe('persistent');
    expect(entry?.version).toBe(1);
  });

  it('versioning increments on update', () => {
    const s = new WorkflowState();
    s.put('k', 'v1', 'p');
    s.put('k', 'v2', 'p');
    expect(s.getEntry('k')?.version).toBe(2);
    expect(s.get('k')).toBe('v2');
  });

  it('getByProducer', () => {
    const s = new WorkflowState();
    s.put('a', 1, 'agent-x', 'output');
    s.put('b', 2, 'agent-y', 'output');
    s.put('c', 3, 'agent-x', 'decision');
    expect(s.getByProducer('agent-x')).toHaveLength(2);
  });

  it('getByType', () => {
    const s = new WorkflowState();
    s.put('a', 1, 'p', 'decision');
    s.put('b', 2, 'p', 'artifact');
    s.put('c', 3, 'p', 'decision');
    expect(s.getByType('decision')).toHaveLength(2);
    expect(s.getByType('artifact')).toHaveLength(1);
  });

  it('getPersistable', () => {
    const s = new WorkflowState();
    s.put('a', 1, 'p', 'output', 'persistent');
    s.put('b', 2, 'p', 'output', 'workflow');
    s.put('c', 3, 'p', 'output', 'persistent');
    expect(s.getPersistable()).toHaveLength(2);
  });

  it('getSummary truncates', () => {
    const s = new WorkflowState();
    s.put('k', 'x'.repeat(100), 'p');
    const summary = s.getSummary(50);
    expect(summary.length).toBeLessThanOrEqual(70); // 50 + "...(truncated)"
  });

  it('getHistory tracks all writes', () => {
    const s = new WorkflowState();
    s.put('a', 1, 'p');
    s.put('a', 2, 'p');
    s.put('b', 3, 'q');
    expect(s.getHistory()).toHaveLength(3);
  });

  it('serialization round-trip', () => {
    const s = new WorkflowState();
    s.put('k1', 'v1', 'p1', 'output', 'persistent');
    s.put('k2', { nested: true }, 'p2', 'artifact');

    const json = s.toJSON();
    const s2 = WorkflowState.fromJSON(json);

    expect(s2.get('k1')).toBe('v1');
    expect(s2.get('k2')).toEqual({ nested: true });
    expect(s2.getHistory()).toHaveLength(2);
    expect(s2.getEntry('k1')?.ttl).toBe('persistent');
  });
});
