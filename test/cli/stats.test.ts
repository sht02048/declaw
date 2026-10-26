import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../../src/cli/main.js";
import { fakeConfigDir, skillToolCall, userPrompt } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

async function exampleConfig() {
  const config = await fakeConfigDir();
  await config.standaloneSkill("linear-ticket");
  await config.standaloneSkill("ux-writing");
  await config.transcript({ project: "/work/app", session: "s1" }, [
    userPrompt("open a ticket", "2026-09-28T07:15:00.000Z"),
    skillToolCall("linear-ticket", "2026-10-09T10:30:00.000Z"),
  ]);
  return config;
}

async function runCli(argv: string[], env: Record<string, string>, homeDir = "/nonexistent") {
  let stdout = "";
  let stderr = "";
  const exitCode = await run(argv, {
    env,
    homeDir,
    now: () => now,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { exitCode, stdout, stderr };
}

describe("declaw stats", () => {
  it("prints the Report as JSON with --json", async () => {
    const config = await exampleConfig();

    const { exitCode, stdout } = await runCli(["stats", "--json"], {
      CLAUDE_CONFIG_DIR: config.path,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      period: { start: "2026-09-28T07:15:00.000Z", end: "2026-10-26T00:00:00.000Z" },
      installations: [
        {
          kind: "standalone-skill",
          name: "linear-ticket",
          installedAt: "2026-09-01T00:00:00.000Z",
          status: "used",
          uses: 1,
          lastUse: "2026-10-09T10:30:00.000Z",
        },
        {
          kind: "standalone-skill",
          name: "ux-writing",
          installedAt: "2026-09-01T00:00:00.000Z",
          status: "unused",
          uses: 0,
          lastUse: null,
        },
      ],
    });
  });

  it("reads the default config directory under home when CLAUDE_CONFIG_DIR is unset", async () => {
    const config = await exampleConfig();

    const { stdout } = await runCli(["stats", "--json"], {}, dirname(config.path));

    expect(JSON.parse(stdout).installations).toHaveLength(2);
  });

  it("honours CLAUDE_CONFIG_DIR over the default under home", async () => {
    const config = await exampleConfig();
    const elsewhere = await fakeConfigDir();
    await elsewhere.standaloneSkill("only-in-default");

    const { stdout } = await runCli(
      ["stats", "--json"],
      { CLAUDE_CONFIG_DIR: config.path },
      dirname(elsewhere.path),
    );

    const names = JSON.parse(stdout).installations.map((i: { name: string }) => i.name);
    expect(names).toEqual(["linear-ticket", "ux-writing"]);
  });

  it("prints each skill with its Uses and last Use, under the covered period", async () => {
    const config = await exampleConfig();

    const { exitCode, stdout } = await runCli(["stats"], { CLAUDE_CONFIG_DIR: config.path });

    expect(exitCode).toBe(0);
    const lines = stdout.split("\n");
    expect(lines[0]).toBe("Usage Stats from 2026-09-28 to 2026-10-26");
    expect(lines.find((line) => line.includes("linear-ticket"))).toMatch(
      /Standalone Skill\s+linear-ticket\s+1\s+2026-10-09/,
    );
    expect(lines.find((line) => line.includes("ux-writing"))).toMatch(
      /Standalone Skill\s+ux-writing\s+0\s+never$/,
    );
  });
});
