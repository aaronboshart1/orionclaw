import { describe, it, expect } from 'vitest';
import {
  NodeType,
  EdgeCondition,
  NodeStatus,
  ImplicitSignal,
  FeedbackCategory,
} from '../types.js';

describe('OrionClaw types', () => {
  it('NodeType enum has all expected values', () => {
    expect(NodeType.AGENT).toBe('AGENT');
    expect(NodeType.TOOL).toBe('TOOL');
    expect(NodeType.ROUTER).toBe('ROUTER');
    expect(NodeType.PARALLEL).toBe('PARALLEL');
    expect(NodeType.JOIN).toBe('JOIN');
    expect(NodeType.SUBGRAPH).toBe('SUBGRAPH');
    expect(NodeType.HUMAN).toBe('HUMAN');
    expect(NodeType.REDUCER).toBe('REDUCER');
    expect(Object.keys(NodeType)).toHaveLength(8);
  });

  it('EdgeCondition enum has all expected values', () => {
    expect(EdgeCondition.ALWAYS).toBe('ALWAYS');
    expect(EdgeCondition.ON_SUCCESS).toBe('ON_SUCCESS');
    expect(EdgeCondition.ON_FAILURE).toBe('ON_FAILURE');
    expect(EdgeCondition.CONDITIONAL).toBe('CONDITIONAL');
  });

  it('NodeStatus enum has all expected values', () => {
    expect(NodeStatus.PENDING).toBe('PENDING');
    expect(NodeStatus.RUNNING).toBe('RUNNING');
    expect(NodeStatus.COMPLETED).toBe('COMPLETED');
    expect(NodeStatus.FAILED).toBe('FAILED');
    expect(NodeStatus.SKIPPED).toBe('SKIPPED');
    expect(NodeStatus.WAITING_HUMAN).toBe('WAITING_HUMAN');
  });

  it('ImplicitSignal enum has all expected values', () => {
    expect(Object.keys(ImplicitSignal)).toHaveLength(6);
  });

  it('FeedbackCategory enum has all expected values', () => {
    expect(Object.keys(FeedbackCategory)).toHaveLength(6);
  });
});
