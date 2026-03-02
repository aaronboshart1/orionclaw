# OrionClaw Orchestration Skill

## Trigger
`/orion` — Graph-based multi-agent orchestration commands.

## Commands

### `/orion plan <task description>`
Analyze a task and generate an orchestration plan (workflow graph) without executing it.
Shows the selected pattern, node decomposition, and estimated cost.

### `/orion run <task description>`
Plan and execute a workflow for the given task. Spawns agents, tracks progress, and returns results.

### `/orion status [workflow_id]`
Show the current status of a running workflow or the most recent one.
Displays node statuses, progress percentage, and elapsed time.

### `/orion history [limit]`
List recent workflow executions with their outcomes. Default limit: 10.

### `/orion lessons [query]`
Search or list hindsight lessons learned from past workflows.
Without a query, shows the most recent lessons sorted by confidence.

### `/orion agents`
List all registered agents with their capabilities, performance stats, and cost tiers.

## Examples

```
/orion plan Research the top 5 JavaScript frameworks and write a comparison report
/orion run Build a landing page with hero section, features, and pricing
/orion status abc123
/orion history 5
/orion lessons "deployment failures"
/orion agents
```

## How It Works

OrionClaw decomposes tasks into directed acyclic graphs (DAGs) where:
- **Nodes** are agents, tools, routers, or human checkpoints
- **Edges** define data flow and conditions
- **State** flows between nodes with typed entries
- **Lessons** from past executions improve future plans

Patterns: sequential, parallel, router, pipeline, hierarchical, auto.
