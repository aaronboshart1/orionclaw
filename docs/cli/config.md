---
summary: "CLI reference for `orionclaw config` (get/set/unset/file/validate)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `orionclaw config`

Config helpers: get/set/unset/validate values by path and print the active
config file. Run without a subcommand to open
the configure wizard (same as `orionclaw configure`).

## Examples

```bash
orionclaw config file
orionclaw config get browser.executablePath
orionclaw config set browser.executablePath "/usr/bin/google-chrome"
orionclaw config set agents.defaults.heartbeat.every "2h"
orionclaw config set agents.list[0].tools.exec.node "node-id-or-name"
orionclaw config unset tools.web.search.apiKey
orionclaw config validate
orionclaw config validate --json
```

## Paths

Paths use dot or bracket notation:

```bash
orionclaw config get agents.defaults.workspace
orionclaw config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
orionclaw config get agents.list
orionclaw config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--strict-json` to require JSON5 parsing. `--json` remains supported as a legacy alias.

```bash
orionclaw config set agents.defaults.heartbeat.every "0m"
orionclaw config set gateway.port 19001 --strict-json
orionclaw config set channels.whatsapp.groups '["*"]' --strict-json
```

## Subcommands

- `config file`: Print the active config file path (resolved from `OPENCLAW_CONFIG_PATH` or default location).

Restart the gateway after edits.

## Validate

Validate the current config against the active schema without starting the
gateway.

```bash
orionclaw config validate
orionclaw config validate --json
```
