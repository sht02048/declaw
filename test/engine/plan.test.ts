import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isRemovable, planCleanup, report, type Installation, type Report } from "../../src/engine/index.js";
import { fakeConfigDir } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");
const backupDir = "/home/me/.declaw/backups/2026-10-26T00-00-00Z";

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
    const result = await report({ ...config.paths, now });

    const plan = planCleanup(named(result, "vercel@claude-plugins-official"), {
      configDir: config.path,
      backupDir,
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
    const result = await report({ ...config.paths, now });

    const plan = planCleanup(named(result, "find-skills"), { configDir: config.path, backupDir });

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
    const result = await report({ ...config.paths, now });

    const plan = planCleanup(named(result, "ux-writing"), { configDir: config.path, backupDir });

    expect(plan).toEqual([
      { kind: "move-to-trash", name: "ux-writing", path: join(config.path, "skills", "ux-writing") },
    ]);
  });

  it("never plans anything for a Synced Skill, which cannot be selected", async () => {
    const config = await fakeConfigDir();
    await config.syncedSkill("brand-voice");
    await config.standaloneSkill("ux-writing");
    const result = await report({ ...config.paths, now });
    const [synced, real] = named(result, "anthropic-skills:brand-voice", "ux-writing");

    const plan = planCleanup([synced!, real!], { configDir: config.path, backupDir });

    expect(plan.map((action) => action.name)).toEqual(["ux-writing"]);
    expect(isRemovable(synced!)).toBe(false);
    expect(isRemovable(real!)).toBe(true);
  });

  it("plans removing a Standalone MCP Server at user scope after a backup, with the command that adds it back", async () => {
    const config = await fakeConfigDir();
    await config.mcpServer("context7", { type: "http", url: "https://mcp.context7.com/mcp" });
    const result = await report({ ...config.paths, now });

    const plan = planCleanup(named(result, "context7"), { configDir: config.path, backupDir });

    expect(plan).toEqual([
      {
        kind: "remove-mcp-server",
        name: "context7",
        scope: "user",
        backupPath: `${backupDir}/context7.json`,
        removeArgs: ["mcp", "remove", "context7", "--scope", "user"],
        removeCommand: "claude mcp remove context7 --scope user",
        addBackCommand: `claude mcp add-json context7 "$(cat '${backupDir}/context7.json')" --scope user`,
      },
    ]);
  });

  it("quotes a server name and backup path the shell would split, and keeps the backup file name safe", async () => {
    const config = await fakeConfigDir();
    await config.mcpServer("it's/docs", { command: "docs" });
    const result = await report({ ...config.paths, now });
    const quirkyBackupDir = "/home/me/My Backups/it's";

    const plan = planCleanup(named(result, "it's/docs"), { configDir: config.path, backupDir: quirkyBackupDir });

    expect(plan).toEqual([
      expect.objectContaining({
        backupPath: "/home/me/My Backups/it's/it_s_docs.json",
        removeArgs: ["mcp", "remove", "it's/docs", "--scope", "user"],
        removeCommand: "claude mcp remove 'it'\\''s/docs' --scope user",
        addBackCommand: `claude mcp add-json 'it'\\''s/docs' "$(cat '/home/me/My Backups/it'\\''s/it_s_docs.json')" --scope user`,
      }),
    ]);
  });

  it("gives servers whose backup file names would clash, even only by case, distinct backup paths", async () => {
    const config = await fakeConfigDir();
    for (const name of ["my/docs", "my_docs", "My_Docs", "my_docs-2"]) await config.mcpServer(name, { command: "docs" });
    const result = await report({ ...config.paths, now });

    const plan = planCleanup(named(result, "my/docs", "my_docs", "My_Docs", "my_docs-2"), {
      configDir: config.path,
      backupDir,
    });

    expect(plan.map((action) => action.kind === "remove-mcp-server" && action.backupPath)).toEqual([
      `${backupDir}/my_docs.json`,
      `${backupDir}/my_docs-2.json`,
      `${backupDir}/My_Docs-3.json`,
      `${backupDir}/my_docs-2-2.json`,
    ]);
  });
});
