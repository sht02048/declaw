import { lstat, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanup, report, type ClaudeRunner, type Installation, type Report } from "../../src/engine/index.js";
import { fakeConfigDir, type FakeConfigDir } from "../support/fake-config-dir.js";
import { fakeClaude, fakeTrash } from "../support/fake-effects.js";

const now = new Date("2026-10-26T00:00:00.000Z");

function named(result: Report, ...names: string[]): Installation[] {
  return names.map((name) => {
    const installation = result.installations.find((candidate) => candidate.name === name);
    if (!installation) throw new Error(`no Installation named ${name}`);
    return installation;
  });
}

function effectsFor(config: FakeConfigDir, options: { failOn?: string[] } = {}) {
  const trash = fakeTrash(join(config.home, ".Trash"), options);
  const claude = fakeClaude();
  return { trash, claude, options: { configDir: config.path, trash: trash.move, runClaude: claude.run } };
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

describe("cleanup", () => {
  it("removes only the link of a Linked Skill and leaves its target unchanged", async () => {
    const config = await fakeConfigDir();
    const target = join(config.home, ".agents", "skills", "find-skills");
    await config.linkedSkill("find-skills", { target });
    const before = await readFile(join(target, "SKILL.md"), "utf8");
    const result = await report({ ...config.paths, now });
    const { trash, claude, options } = effectsFor(config);

    const outcomes = await cleanup(named(result, "find-skills"), options);

    expect(outcomes).toEqual([expect.objectContaining({ name: "find-skills", result: "removed" })]);
    expect(await exists(join(config.path, "skills", "find-skills"))).toBe(false);
    expect(await readdir(target)).toEqual(["SKILL.md"]);
    expect(await readFile(join(target, "SKILL.md"), "utf8")).toBe(before);
    expect(trash.moves).toEqual([]);
    expect(claude.calls).toEqual([]);
  });

  it("removes only the link of a broken Linked Skill", async () => {
    const config = await fakeConfigDir();
    await config.brokenLinkedSkill("gone-skill");
    const result = await report({ ...config.paths, now });
    const { trash, claude, options } = effectsFor(config);

    const outcomes = await cleanup(named(result, "gone-skill"), options);

    expect(outcomes).toEqual([
      expect.objectContaining({ name: "gone-skill", result: "removed", action: expect.objectContaining({ kind: "remove-link" }) }),
    ]);
    expect(await exists(join(config.path, "skills", "gone-skill"))).toBe(false);
    expect(trash.moves).toEqual([]);
    expect(claude.calls).toEqual([]);
  });

  it("moves a real Standalone Skill's folder through the trash mover instead of deleting it", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("ux-writing");
    const folder = join(config.path, "skills", "ux-writing");
    const before = await readFile(join(folder, "SKILL.md"), "utf8");
    const result = await report({ ...config.paths, now });
    const { trash, options } = effectsFor(config);

    const outcomes = await cleanup(named(result, "ux-writing"), options);

    expect(outcomes).toEqual([expect.objectContaining({ name: "ux-writing", result: "removed" })]);
    expect(trash.moves).toEqual([folder]);
    expect(await exists(folder)).toBe(false);
    expect(await readFile(join(trash.dir, "ux-writing", "SKILL.md"), "utf8")).toBe(before);
  });

  it("reports a failed Installation and still cleans up the rest", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("stuck");
    await config.standaloneSkill("ux-writing");
    await config.linkedSkill("find-skills");
    const stuck = join(config.path, "skills", "stuck");
    const result = await report({ ...config.paths, now });
    const { trash, options } = effectsFor(config, { failOn: [stuck] });

    const outcomes = await cleanup(named(result, "stuck", "ux-writing", "find-skills"), options);

    expect(outcomes).toEqual([
      expect.objectContaining({
        name: "stuck",
        result: "failed",
        message: `could not move ${stuck} to the trash`,
      }),
      expect.objectContaining({ name: "ux-writing", result: "removed" }),
      expect.objectContaining({ name: "find-skills", result: "removed" }),
    ]);
    expect(await exists(stuck)).toBe(true);
    expect(trash.moves).toEqual([join(config.path, "skills", "ux-writing")]);
    expect(await exists(join(config.path, "skills", "find-skills"))).toBe(false);
  });

  it("leaves a Linked Skill alone when its link became a real folder since the Report", async () => {
    const config = await fakeConfigDir();
    await config.linkedSkill("find-skills");
    const result = await report({ ...config.paths, now });
    const path = join(config.path, "skills", "find-skills");
    await rm(path);
    await config.standaloneSkill("find-skills");
    const { trash, options } = effectsFor(config);

    const outcomes = await cleanup(named(result, "find-skills"), options);

    expect(outcomes).toEqual([
      expect.objectContaining({ name: "find-skills", result: "failed", message: `${path} is no longer a link` }),
    ]);
    expect(await readdir(path)).toEqual(["SKILL.md"]);
    expect(trash.moves).toEqual([]);
  });

  it("leaves a real Standalone Skill alone when its folder became a link since the Report", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("ux-writing");
    const result = await report({ ...config.paths, now });
    const path = join(config.path, "skills", "ux-writing");
    await rm(path, { recursive: true });
    const target = join(config.home, "repo", "ux-writing");
    await config.linkedSkill("ux-writing", { target });
    const { trash, options } = effectsFor(config);

    const outcomes = await cleanup(named(result, "ux-writing"), options);

    expect(outcomes).toEqual([
      expect.objectContaining({ name: "ux-writing", result: "failed", message: `${path} is no longer a folder` }),
    ]);
    expect((await lstat(path)).isSymbolicLink()).toBe(true);
    expect(await readdir(target)).toEqual(["SKILL.md"]);
    expect(trash.moves).toEqual([]);
  });

  it("touches only the selected Installations", async () => {
    const config = await fakeConfigDir();
    await config.plugin("idle@market", { skills: ["nap"] });
    await config.standaloneSkill("keep-me");
    await config.standaloneSkill("ux-writing");
    await config.linkedSkill("find-skills");
    await config.syncedSkill("brand-voice");
    const result = await report({ ...config.paths, now });
    const { trash, claude, options } = effectsFor(config);

    const outcomes = await cleanup(named(result, "ux-writing", "anthropic-skills:brand-voice"), options);

    expect(outcomes.map((outcome) => outcome.name)).toEqual(["ux-writing"]);
    expect(trash.moves).toEqual([join(config.path, "skills", "ux-writing")]);
    expect(claude.calls).toEqual([]);
    expect((await readdir(join(config.path, "skills"))).sort()).toEqual(["find-skills", "keep-me", "synced"]);
    expect(await readdir(join(config.path, "skills", "synced", "org_account"))).toContain("brand-voice");
    const after = await report({ ...config.paths, now });
    expect(after.installations.map((installation) => installation.name).sort()).toEqual([
      "anthropic-skills:brand-voice",
      "find-skills",
      "idle@market",
      "keep-me",
    ]);
  });
});

function withClaude(config: FakeConfigDir, runClaude: ClaudeRunner) {
  return { configDir: config.path, trash: fakeTrash(join(config.home, ".Trash")).move, runClaude };
}

async function twoPlugins() {
  const config = await fakeConfigDir();
  await config.plugin("vercel@claude-plugins-official", { skills: ["deploy"] });
  await config.plugin("idle@market", { skills: ["nap"] });
  return { config, result: await report({ ...config.paths, now }) };
}

describe("cleanup of Plugins", () => {
  it("uninstalls each selected Plugin through claude plugin uninstall at user scope", async () => {
    const { config, result } = await twoPlugins();
    const { calls, run: claude } = fakeClaude();

    const outcomes = await cleanup(
      named(result, "vercel@claude-plugins-official", "idle@market"),
      withClaude(config, claude),
    );

    expect(calls).toEqual([
      ["plugin", "uninstall", "vercel@claude-plugins-official", "--scope", "user"],
      ["plugin", "uninstall", "idle@market", "--scope", "user"],
    ]);
    expect(outcomes.map(({ name, result }) => ({ name, result }))).toEqual([
      { name: "vercel@claude-plugins-official", result: "removed" },
      { name: "idle@market", result: "removed" },
    ]);
  });

  it("reports a failed uninstall with the command's output as-is and goes on with the rest", async () => {
    const { config, result } = await twoPlugins();
    const failure =
      '✘ Failed to uninstall plugin "vercel@claude-plugins-official": settings_still_on\n  see `claude plugin disable`\n';
    const { calls, run: claude } = fakeClaude({
      "vercel@claude-plugins-official": { exitCode: 1, output: failure },
    });

    const outcomes = await cleanup(
      named(result, "vercel@claude-plugins-official", "idle@market"),
      withClaude(config, claude),
    );

    expect(calls).toHaveLength(2);
    expect(outcomes.map(({ name, result }) => ({ name, result }))).toEqual([
      { name: "vercel@claude-plugins-official", result: "failed" },
      { name: "idle@market", result: "removed" },
    ]);
    expect(outcomes[0]).toMatchObject({ message: failure });
  });

  it("reports a failure when claude cannot be run at all and goes on with the rest", async () => {
    const { config, result } = await twoPlugins();
    const calls: string[][] = [];
    const claude: ClaudeRunner = async (args) => {
      calls.push(args);
      if (calls.length === 1) throw new Error("spawn claude ENOENT");
      return { exitCode: 0, output: "" };
    };

    const outcomes = await cleanup(
      named(result, "vercel@claude-plugins-official", "idle@market"),
      withClaude(config, claude),
    );

    expect(calls).toHaveLength(2);
    expect(outcomes[0]).toMatchObject({ result: "failed", message: "spawn claude ENOENT" });
    expect(outcomes[1]).toMatchObject({ result: "removed" });
  });

  it("never deletes a Plugin's files itself", async () => {
    const { config, result } = await twoPlugins();
    const { run: claude } = fakeClaude();

    await cleanup(named(result, "idle@market"), withClaude(config, claude));

    const installPath = join(config.path, "plugins", "cache", "market", "idle", "1.0.0");
    await expect(readdir(installPath)).resolves.toContain(".claude-plugin");
  });

  it("calls claude only for Plugins in the selection", async () => {
    const { config } = await twoPlugins();
    await config.standaloneSkill("ux-writing");
    const result = await report({ ...config.paths, now });
    const { calls, run: claude } = fakeClaude();

    await cleanup(named(result, "ux-writing", "idle@market"), withClaude(config, claude));

    expect(calls).toEqual([["plugin", "uninstall", "idle@market", "--scope", "user"]]);
  });
});
