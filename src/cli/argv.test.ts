import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  isRootHelpInvocation,
  isRootVersionInvocation,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it.each([
    {
      name: "help flag",
      argv: ["node", "orionclaw", "--help"],
      expected: true,
    },
    {
      name: "version flag",
      argv: ["node", "orionclaw", "-V"],
      expected: true,
    },
    {
      name: "normal command",
      argv: ["node", "orionclaw", "status"],
      expected: false,
    },
    {
      name: "root -v alias",
      argv: ["node", "orionclaw", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "orionclaw", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "root -v alias with log-level",
      argv: ["node", "orionclaw", "--log-level", "debug", "-v"],
      expected: true,
    },
    {
      name: "subcommand -v should not be treated as version",
      argv: ["node", "orionclaw", "acp", "-v"],
      expected: false,
    },
    {
      name: "root -v alias with equals profile",
      argv: ["node", "orionclaw", "--profile=work", "-v"],
      expected: true,
    },
    {
      name: "subcommand path after global root flags should not be treated as version",
      argv: ["node", "orionclaw", "--dev", "skills", "list", "-v"],
      expected: false,
    },
  ])("detects help/version flags: $name", ({ argv, expected }) => {
    expect(hasHelpOrVersion(argv)).toBe(expected);
  });

  it.each([
    {
      name: "root --version",
      argv: ["node", "orionclaw", "--version"],
      expected: true,
    },
    {
      name: "root -V",
      argv: ["node", "orionclaw", "-V"],
      expected: true,
    },
    {
      name: "root -v alias with profile",
      argv: ["node", "orionclaw", "--profile", "work", "-v"],
      expected: true,
    },
    {
      name: "subcommand version flag",
      argv: ["node", "orionclaw", "status", "--version"],
      expected: false,
    },
    {
      name: "unknown root flag with version",
      argv: ["node", "orionclaw", "--unknown", "--version"],
      expected: false,
    },
  ])("detects root-only version invocations: $name", ({ argv, expected }) => {
    expect(isRootVersionInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "root --help",
      argv: ["node", "orionclaw", "--help"],
      expected: true,
    },
    {
      name: "root -h",
      argv: ["node", "orionclaw", "-h"],
      expected: true,
    },
    {
      name: "root --help with profile",
      argv: ["node", "orionclaw", "--profile", "work", "--help"],
      expected: true,
    },
    {
      name: "subcommand --help",
      argv: ["node", "orionclaw", "status", "--help"],
      expected: false,
    },
    {
      name: "help before subcommand token",
      argv: ["node", "orionclaw", "--help", "status"],
      expected: false,
    },
    {
      name: "help after -- terminator",
      argv: ["node", "orionclaw", "nodes", "run", "--", "git", "--help"],
      expected: false,
    },
    {
      name: "unknown root flag before help",
      argv: ["node", "orionclaw", "--unknown", "--help"],
      expected: false,
    },
    {
      name: "unknown root flag after help",
      argv: ["node", "orionclaw", "--help", "--unknown"],
      expected: false,
    },
  ])("detects root-only help invocations: $name", ({ argv, expected }) => {
    expect(isRootHelpInvocation(argv)).toBe(expected);
  });

  it.each([
    {
      name: "single command with trailing flag",
      argv: ["node", "orionclaw", "status", "--json"],
      expected: ["status"],
    },
    {
      name: "two-part command",
      argv: ["node", "orionclaw", "agents", "list"],
      expected: ["agents", "list"],
    },
    {
      name: "terminator cuts parsing",
      argv: ["node", "orionclaw", "status", "--", "ignored"],
      expected: ["status"],
    },
  ])("extracts command path: $name", ({ argv, expected }) => {
    expect(getCommandPath(argv, 2)).toEqual(expected);
  });

  it.each([
    {
      name: "returns first command token",
      argv: ["node", "orionclaw", "agents", "list"],
      expected: "agents",
    },
    {
      name: "returns null when no command exists",
      argv: ["node", "orionclaw"],
      expected: null,
    },
  ])("returns primary command: $name", ({ argv, expected }) => {
    expect(getPrimaryCommand(argv)).toBe(expected);
  });

  it.each([
    {
      name: "detects flag before terminator",
      argv: ["node", "orionclaw", "status", "--json"],
      flag: "--json",
      expected: true,
    },
    {
      name: "ignores flag after terminator",
      argv: ["node", "orionclaw", "--", "--json"],
      flag: "--json",
      expected: false,
    },
  ])("parses boolean flags: $name", ({ argv, flag, expected }) => {
    expect(hasFlag(argv, flag)).toBe(expected);
  });

  it.each([
    {
      name: "value in next token",
      argv: ["node", "orionclaw", "status", "--timeout", "5000"],
      expected: "5000",
    },
    {
      name: "value in equals form",
      argv: ["node", "orionclaw", "status", "--timeout=2500"],
      expected: "2500",
    },
    {
      name: "missing value",
      argv: ["node", "orionclaw", "status", "--timeout"],
      expected: null,
    },
    {
      name: "next token is another flag",
      argv: ["node", "orionclaw", "status", "--timeout", "--json"],
      expected: null,
    },
    {
      name: "flag appears after terminator",
      argv: ["node", "orionclaw", "--", "--timeout=99"],
      expected: undefined,
    },
  ])("extracts flag values: $name", ({ argv, expected }) => {
    expect(getFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "orionclaw", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "orionclaw", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "orionclaw", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it.each([
    {
      name: "missing flag",
      argv: ["node", "orionclaw", "status"],
      expected: undefined,
    },
    {
      name: "missing value",
      argv: ["node", "orionclaw", "status", "--timeout"],
      expected: null,
    },
    {
      name: "valid positive integer",
      argv: ["node", "orionclaw", "status", "--timeout", "5000"],
      expected: 5000,
    },
    {
      name: "invalid integer",
      argv: ["node", "orionclaw", "status", "--timeout", "nope"],
      expected: undefined,
    },
  ])("parses positive integer flag values: $name", ({ argv, expected }) => {
    expect(getPositiveIntFlagValue(argv, "--timeout")).toBe(expected);
  });

  it("builds parse argv from raw args", () => {
    const cases = [
      {
        rawArgs: ["node", "orionclaw", "status"],
        expected: ["node", "orionclaw", "status"],
      },
      {
        rawArgs: ["node-22", "orionclaw", "status"],
        expected: ["node-22", "orionclaw", "status"],
      },
      {
        rawArgs: ["node-22.2.0.exe", "orionclaw", "status"],
        expected: ["node-22.2.0.exe", "orionclaw", "status"],
      },
      {
        rawArgs: ["node-22.2", "orionclaw", "status"],
        expected: ["node-22.2", "orionclaw", "status"],
      },
      {
        rawArgs: ["node-22.2.exe", "orionclaw", "status"],
        expected: ["node-22.2.exe", "orionclaw", "status"],
      },
      {
        rawArgs: ["/usr/bin/node-22.2.0", "orionclaw", "status"],
        expected: ["/usr/bin/node-22.2.0", "orionclaw", "status"],
      },
      {
        rawArgs: ["node24", "orionclaw", "status"],
        expected: ["node24", "orionclaw", "status"],
      },
      {
        rawArgs: ["/usr/bin/node24", "orionclaw", "status"],
        expected: ["/usr/bin/node24", "orionclaw", "status"],
      },
      {
        rawArgs: ["node24.exe", "orionclaw", "status"],
        expected: ["node24.exe", "orionclaw", "status"],
      },
      {
        rawArgs: ["nodejs", "orionclaw", "status"],
        expected: ["nodejs", "orionclaw", "status"],
      },
      {
        rawArgs: ["node-dev", "orionclaw", "status"],
        expected: ["node", "orionclaw", "node-dev", "orionclaw", "status"],
      },
      {
        rawArgs: ["orionclaw", "status"],
        expected: ["node", "orionclaw", "status"],
      },
      {
        rawArgs: ["bun", "src/entry.ts", "status"],
        expected: ["bun", "src/entry.ts", "status"],
      },
    ] as const;

    for (const testCase of cases) {
      const parsed = buildParseArgv({
        programName: "orionclaw",
        rawArgs: [...testCase.rawArgs],
      });
      expect(parsed).toEqual([...testCase.expected]);
    }
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "orionclaw",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "orionclaw", "status"]);
  });

  it("decides when to migrate state", () => {
    const nonMutatingArgv = [
      ["node", "orionclaw", "status"],
      ["node", "orionclaw", "health"],
      ["node", "orionclaw", "sessions"],
      ["node", "orionclaw", "config", "get", "update"],
      ["node", "orionclaw", "config", "unset", "update"],
      ["node", "orionclaw", "models", "list"],
      ["node", "orionclaw", "models", "status"],
      ["node", "orionclaw", "memory", "status"],
      ["node", "orionclaw", "agent", "--message", "hi"],
    ] as const;
    const mutatingArgv = [
      ["node", "orionclaw", "agents", "list"],
      ["node", "orionclaw", "message", "send"],
    ] as const;

    for (const argv of nonMutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(false);
    }
    for (const argv of mutatingArgv) {
      expect(shouldMigrateState([...argv])).toBe(true);
    }
  });

  it.each([
    { path: ["status"], expected: false },
    { path: ["config", "get"], expected: false },
    { path: ["models", "status"], expected: false },
    { path: ["agents", "list"], expected: true },
  ])("reuses command path for migrate state decisions: $path", ({ path, expected }) => {
    expect(shouldMigrateStateFromPath(path)).toBe(expected);
  });
});
