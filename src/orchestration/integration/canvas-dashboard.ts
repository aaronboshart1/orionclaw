/**
 * OrionClaw — Canvas Dashboard
 *
 * Generates live workflow visualization HTML for the Canvas.
 */

import type { ExecutionEvent, NodeResult, Node } from '../types.js';
import { NodeStatus } from '../types.js';
import type { WorkflowGraph } from '../graph/workflow-graph.js';

const STATUS_ICONS: Record<string, string> = {
  [NodeStatus.PENDING]: '⏳',
  [NodeStatus.RUNNING]: '🔄',
  [NodeStatus.COMPLETED]: '✅',
  [NodeStatus.FAILED]: '❌',
  [NodeStatus.SKIPPED]: '⏭️',
  [NodeStatus.WAITING_HUMAN]: '👤',
};

const STATUS_COLORS: Record<string, string> = {
  [NodeStatus.PENDING]: '#6b7280',
  [NodeStatus.RUNNING]: '#3b82f6',
  [NodeStatus.COMPLETED]: '#22c55e',
  [NodeStatus.FAILED]: '#ef4444',
  [NodeStatus.SKIPPED]: '#9ca3af',
  [NodeStatus.WAITING_HUMAN]: '#f59e0b',
};

export interface DashboardState {
  workflowId: string;
  graph: WorkflowGraph;
  results: Map<string, NodeResult>;
  events: ExecutionEvent[];
  startedAt: string;
  elapsedMs: number;
}

/**
 * Generate a complete HTML dashboard for the current workflow state.
 */
export function generateDashboardHtml(state: DashboardState): string {
  const nodes = state.graph.getNodes();
  const nodeCards = nodes.map(node => generateNodeCard(node, state.results.get(node.id))).join('\n');

  const feedEntries = state.events
    .slice(-20)
    .reverse()
    .map(e => generateFeedEntry(e))
    .join('\n');

  const completedCount = [...state.results.values()].filter(
    r => r.status === NodeStatus.COMPLETED,
  ).length;
  const totalNodes = nodes.length;
  const overallPct = totalNodes > 0 ? Math.round((completedCount / totalNodes) * 100) : 0;
  const elapsed = formatDuration(state.elapsedMs);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OrionClaw — ${state.workflowId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding: 12px 16px; background: #1e293b; border-radius: 8px; }
    .header h1 { font-size: 18px; color: #38bdf8; }
    .header .stats { font-size: 14px; color: #94a3b8; }
    .progress-bar { width: 100%; height: 6px; background: #334155; border-radius: 3px; margin-bottom: 16px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #22c55e); transition: width 0.5s; border-radius: 3px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .node-card { background: #1e293b; border-radius: 8px; padding: 12px; border-left: 4px solid #334155; }
    .node-card .name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
    .node-card .type { font-size: 12px; color: #64748b; text-transform: uppercase; }
    .node-card .status { font-size: 13px; margin-top: 6px; }
    .node-card .duration { font-size: 12px; color: #64748b; margin-top: 4px; }
    .feed { background: #1e293b; border-radius: 8px; padding: 12px; max-height: 300px; overflow-y: auto; }
    .feed h2 { font-size: 14px; color: #94a3b8; margin-bottom: 8px; }
    .feed-entry { padding: 6px 0; border-bottom: 1px solid #334155; font-size: 13px; }
    .feed-entry:last-child { border-bottom: none; }
    .feed-entry .time { color: #64748b; font-size: 11px; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔮 OrionClaw</h1>
    <div class="stats">${completedCount}/${totalNodes} nodes • ${overallPct}% • ${elapsed}</div>
  </div>
  <div class="progress-bar"><div class="progress-fill" style="width:${overallPct}%"></div></div>
  <div class="grid">
    ${nodeCards}
  </div>
  <div class="feed">
    <h2>Activity Feed</h2>
    ${feedEntries || '<div class="feed-entry">No events yet</div>'}
  </div>
</body>
</html>`;
}

function generateNodeCard(node: Node, result?: NodeResult): string {
  const status = result?.status ?? NodeStatus.PENDING;
  const icon = STATUS_ICONS[status] ?? '⏳';
  const color = STATUS_COLORS[status] ?? '#6b7280';
  const duration = result?.durationMs ? formatDuration(result.durationMs) : '';

  return `<div class="node-card" style="border-left-color:${color}">
  <div class="name">${icon} ${escapeHtml(node.name)}</div>
  <div class="type">${node.type}</div>
  <div class="status">${status}</div>
  ${duration ? `<div class="duration">${duration}</div>` : ''}
</div>`;
}

function generateFeedEntry(event: ExecutionEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const icon = event.type.includes('failed') ? '❌'
    : event.type.includes('completed') ? '✅'
    : event.type.includes('started') ? '🔄'
    : event.type.includes('human') ? '👤'
    : '📊';

  const nodeLabel = event.nodeId ? ` [${event.nodeId}]` : '';
  const msg = event.type.replace(/_/g, ' ');

  return `<div class="feed-entry">
  <span class="time">${time}</span> ${icon}${nodeLabel} ${msg}
</div>`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
