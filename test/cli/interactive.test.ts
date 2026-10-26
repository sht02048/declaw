import { describe, expect, it } from "vitest";
import { run, type InteractiveSession } from "../../src/cli/main.js";
import { fakeConfigDir, userPrompt } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

async function runCli(argv: string[], env: Record<string, string>) {
  const sessions: InteractiveSession[] = [];
  let stderr = "";
  const exitCode = await run(argv, {
    env,
    homeDir: "/nonexistent",
    now: () => now,
    stdout: () => {},
    stderr: (text) => (stderr += text),
    interactive: async (session) => {
      sessions.push(session);
      return 0;
    },
  });
  return { exitCode, sessions, stderr };
}

async function exampleConfig() {
  const config = await fakeConfigDir({ configFileInConfigDir: true });
  await config.standaloneSkill("ux-writing");
  await config.transcript({ project: "/work/app", session: "s1" }, [
    userPrompt("hello", "2026-09-28T07:15:00.000Z"),
  ]);
  return config;
}

describe("declaw", () => {
  it("opens the interactive list on the Report of the config directory", async () => {
    const config = await exampleConfig();

    const { exitCode, sessions } = await runCli([], { CLAUDE_CONFIG_DIR: config.path });

    expect(exitCode).toBe(0);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.dryRun).toBe(false);
    expect(sessions[0]!.configDir).toBe(config.path);
    expect(sessions[0]!.report.installations.map((i) => i.name)).toEqual(["ux-writing"]);
  });

  it("opens it as a dry run with --dry-run", async () => {
    const config = await exampleConfig();

    const { sessions } = await runCli(["--dry-run"], { CLAUDE_CONFIG_DIR: config.path });

    expect(sessions.map((session) => session.dryRun)).toEqual([true]);
  });

  it("rejects an unknown flag without opening the list", async () => {
    const config = await exampleConfig();

    const { exitCode, sessions, stderr } = await runCli(["--yes"], { CLAUDE_CONFIG_DIR: config.path });

    expect(exitCode).toBe(1);
    expect(sessions).toEqual([]);
    expect(stderr).toContain("Usage: declaw [--dry-run]");
  });
});
