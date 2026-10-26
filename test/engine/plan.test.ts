import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isRemovable, planCleanup, report, type Installation, type Report } from "../../src/engine/index.js";
import { fakeConfigDir } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

function named(result: Report, ...names: string[]): Installation[] {
  return names.map((name) => {
    const installation = result.installations.find((candidate) => candidate.name === name);
    if (!installation) throw new Error(`no Installation named ${name}`);
    return installation;
  });
}

describe("planCleanup", () => {
  it("plans a Plugin's uninstall at user scope with the command that reinstalls it", async () => {
    const config = await fakeConfigDir();
    await config.plugin("vercel@claude-plugins-official", { skills: ["deploy"] });
    const result = await report({ configDir: config.path, now });

    const plan = planCleanup(named(result, "vercel@claude-plugins-official"), {
      configDir: config.path,
    });

    expect(plan).toEqual([
      {
        kind: "uninstall-plugin",
        name: "vercel@claude-plugins-official",
        scope: "user",
        reinstallCommand: "claude plugin install vercel@claude-plugins-official --scope user",
      },
    ]);
  });

  it("plans removing only the link for a Linked Skill, keeping its target", async () => {
    const config = await fakeConfigDir();
    const target = join(config.home, "My Skills", "it's-mine");
    await config.linkedSkill("find-skills", { target });
    const result = await report({ configDir: config.path, now });

    const plan = planCleanup(named(result, "find-skills"), { configDir: config.path });

    const path = join(config.path, "skills", "find-skills");
    expect(plan).toEqual([
      {
        kind: "remove-link",
        name: "find-skills",
        path,
        target,
        relinkCommand: `ln -s '${join(config.home, "My Skills", "it'\\''s-mine")}' '${path}'`,
      },
    ]);
  });

  it("plans moving a real Standalone Skill's folder to the system trash", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("ux-writing");
    const result = await report({ configDir: config.path, now });

    const plan = planCleanup(named(result, "ux-writing"), { configDir: config.path });

    expect(plan).toEqual([
      { kind: "move-to-trash", name: "ux-writing", path: join(config.path, "skills", "ux-writing") },
    ]);
  });

  it("never plans anything for a Synced Skill, which cannot be selected", async () => {
    const config = await fakeConfigDir();
    await config.syncedSkill("brand-voice");
    await config.standaloneSkill("ux-writing");
    const result = await report({ configDir: config.path, now });
    const [synced, real] = named(result, "anthropic-skills:brand-voice", "ux-writing");

    const plan = planCleanup([synced!, real!], { configDir: config.path });

    expect(plan.map((action) => action.name)).toEqual(["ux-writing"]);
    expect(isRemovable(synced!)).toBe(false);
    expect(isRemovable(real!)).toBe(true);
  });
});
