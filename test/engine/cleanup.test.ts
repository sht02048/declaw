import { lstat, readdir, readFile } from "node:fs/promises";
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
});
