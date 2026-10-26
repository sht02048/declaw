import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanup,
  report,
  type ClaudeRun,
  type ClaudeRunner,
  type Installation,
  type Report,
} from "../../src/engine/index.js";
import { fakeConfigDir } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

function named(result: Report, ...names: string[]): Installation[] {
  return names.map((name) => {
    const installation = result.installations.find((candidate) => candidate.name === name);
    if (!installation) throw new Error(`no Installation named ${name}`);
    return installation;
  });
}

function fakeClaude(results: Record<string, ClaudeRun> = {}) {
  const calls: string[][] = [];
  const claude: ClaudeRunner = async (args) => {
    calls.push(args);
    const pluginId = args[2]!;
    return results[pluginId] ?? { exitCode: 0, output: `✔ Successfully uninstalled plugin: ${pluginId}\n` };
  };
  return { calls, claude };
}

async function twoPlugins() {
  const config = await fakeConfigDir();
  await config.plugin("vercel@claude-plugins-official", { skills: ["deploy"] });
  await config.plugin("idle@market", { skills: ["nap"] });
  return { config, result: await report({ configDir: config.path, now }) };
}

describe("cleanup of Plugins", () => {
  it("uninstalls each selected Plugin through claude plugin uninstall at user scope", async () => {
    const { config, result } = await twoPlugins();
    const { calls, claude } = fakeClaude();

    const outcomes = await cleanup(named(result, "vercel@claude-plugins-official", "idle@market"), {
      configDir: config.path,
      claude,
    });

    expect(calls).toEqual([
      ["plugin", "uninstall", "vercel@claude-plugins-official", "--scope", "user"],
      ["plugin", "uninstall", "idle@market", "--scope", "user"],
    ]);
    expect(outcomes.map(({ name, outcome }) => ({ name, outcome }))).toEqual([
      { name: "vercel@claude-plugins-official", outcome: "removed" },
      { name: "idle@market", outcome: "removed" },
    ]);
  });

  it("reports a failed uninstall with the command's output as-is and goes on with the rest", async () => {
    const { config, result } = await twoPlugins();
    const failure =
      '✘ Failed to uninstall plugin "vercel@claude-plugins-official": settings_still_on\n  see `claude plugin disable`\n';
    const { calls, claude } = fakeClaude({
      "vercel@claude-plugins-official": { exitCode: 1, output: failure },
    });

    const outcomes = await cleanup(named(result, "vercel@claude-plugins-official", "idle@market"), {
      configDir: config.path,
      claude,
    });

    expect(calls).toHaveLength(2);
    expect(outcomes.map(({ name, outcome }) => ({ name, outcome }))).toEqual([
      { name: "vercel@claude-plugins-official", outcome: "failed" },
      { name: "idle@market", outcome: "removed" },
    ]);
    expect(outcomes[0]).toMatchObject({ output: failure });
  });

  it("reports a failure when claude cannot be run at all and goes on with the rest", async () => {
    const { config, result } = await twoPlugins();
    const calls: string[][] = [];
    const claude: ClaudeRunner = async (args) => {
      calls.push(args);
      if (calls.length === 1) throw new Error("spawn claude ENOENT");
      return { exitCode: 0, output: "" };
    };

    const outcomes = await cleanup(named(result, "vercel@claude-plugins-official", "idle@market"), {
      configDir: config.path,
      claude,
    });

    expect(calls).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({ outcome: "failed", output: "spawn claude ENOENT" });
    expect(outcomes[1]).toMatchObject({ outcome: "removed" });
  });

  it("never deletes a Plugin's files itself", async () => {
    const { config, result } = await twoPlugins();
    const { claude } = fakeClaude();

    await cleanup(named(result, "idle@market"), { configDir: config.path, claude });

    const installPath = join(config.path, "plugins", "cache", "market", "idle", "1.0.0");
    await expect(readdir(installPath)).resolves.toContain(".claude-plugin");
  });

  it("calls claude only for Plugins in the selection", async () => {
    const { config } = await twoPlugins();
    await config.standaloneSkill("ux-writing");
    const result = await report({ configDir: config.path, now });
    const { calls, claude } = fakeClaude();

    await cleanup(named(result, "ux-writing", "idle@market"), { configDir: config.path, claude });

    expect(calls).toEqual([["plugin", "uninstall", "idle@market", "--scope", "user"]]);
  });
});
