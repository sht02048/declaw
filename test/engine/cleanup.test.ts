import { lstat, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanup, report, type Installation, type Report } from "../../src/engine/index.js";
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
    const result = await report({ configDir: config.path, now });
    const { trash, claude, options } = effectsFor(config);

    const outcomes = await cleanup(named(result, "find-skills"), options);

    expect(outcomes).toEqual([expect.objectContaining({ name: "find-skills", result: "removed" })]);
    expect(await exists(join(config.path, "skills", "find-skills"))).toBe(false);
    expect(await readdir(target)).toEqual(["SKILL.md"]);
    expect(await readFile(join(target, "SKILL.md"), "utf8")).toBe(before);
    expect(trash.moves).toEqual([]);
    expect(claude.calls).toEqual([]);
  });

  it("moves a real Standalone Skill's folder through the trash mover instead of deleting it", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("ux-writing");
    const folder = join(config.path, "skills", "ux-writing");
    const before = await readFile(join(folder, "SKILL.md"), "utf8");
    const result = await report({ configDir: config.path, now });
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
    const result = await report({ configDir: config.path, now });
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
    const result = await report({ configDir: config.path, now });
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
    const result = await report({ configDir: config.path, now });
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
    const result = await report({ configDir: config.path, now });
    const { trash, claude, options } = effectsFor(config);

    const outcomes = await cleanup(named(result, "ux-writing", "anthropic-skills:brand-voice"), options);

    expect(outcomes.map((outcome) => outcome.name)).toEqual(["ux-writing"]);
    expect(trash.moves).toEqual([join(config.path, "skills", "ux-writing")]);
    expect(claude.calls).toEqual([]);
    expect((await readdir(join(config.path, "skills"))).sort()).toEqual(["find-skills", "keep-me", "synced"]);
    expect(await readdir(join(config.path, "skills", "synced", "org_account"))).toContain("brand-voice");
    const after = await report({ configDir: config.path, now });
    expect(after.installations.map((installation) => installation.name).sort()).toEqual([
      "anthropic-skills:brand-voice",
      "find-skills",
      "idle@market",
      "keep-me",
    ]);
  });

  it("reports a Plugin uninstall as not implemented yet and leaves the Plugin installed", async () => {
    const config = await fakeConfigDir();
    await config.plugin("idle@market", { skills: ["nap"] });
    await config.standaloneSkill("ux-writing");
    const result = await report({ configDir: config.path, now });
    const { claude, options } = effectsFor(config);

    const outcomes = await cleanup(named(result, "idle@market", "ux-writing"), options);

    expect(outcomes).toEqual([
      expect.objectContaining({
        name: "idle@market",
        result: "failed",
        message: "Plugin uninstall is not implemented yet",
      }),
      expect.objectContaining({ name: "ux-writing", result: "removed" }),
    ]);
    expect(claude.calls).toEqual([]);
    const after = await report({ configDir: config.path, now });
    expect(after.installations.map((installation) => installation.name)).toEqual(["idle@market"]);
  });
});
