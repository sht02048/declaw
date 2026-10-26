import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { report, type ReportOptions } from "../../src/engine/index.js";
import { fakeConfigDir, hookRun, skillToolCall, userPrompt } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");
const installedAt = new Date("2026-09-01T00:00:00.000Z");

describe("report: Standalone Skill Usage Stats", () => {
  it("counts Skill tool calls as Uses of a Standalone Skill", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("linear-ticket", "2026-10-08T09:00:00.000Z"),
      skillToolCall("linear-ticket", "2026-10-09T10:30:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "linear-ticket",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 2,
        lastUse: new Date("2026-10-09T10:30:00.000Z"),
      },
    ]);
  });

  it("aggregates Uses across every project's transcripts", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("orca-linear");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("orca-linear", "2026-10-02T09:00:00.000Z"),
    ]);
    await config.transcript({ project: "/work/site", session: "s2" }, [
      skillToolCall("orca-linear", "2026-10-12T09:00:00.000Z"),
    ]);
    await config.transcript({ project: "/home/me/notes", session: "s3" }, [
      skillToolCall("orca-linear", "2026-10-05T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "orca-linear",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 3,
        lastUse: new Date("2026-10-12T09:00:00.000Z"),
      },
    ]);
  });

  it("shows zero Uses and no last Use for a skill never called in the period", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.standaloneSkill("ux-writing");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("write the copy", "2026-10-02T09:00:00.000Z"),
      skillToolCall("linear-ticket", "2026-10-02T09:01:00.000Z"),
      skillToolCall("skills:ux-writing", "2026-10-02T09:02:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toContainEqual({
      kind: "standalone-skill",
      name: "ux-writing",
      installedAt,
      usageStatus: "unused",
      recommended: true,
      uses: 0,
      lastUse: null,
    });
  });

  it("reports an empty period when no transcripts exist yet", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");

    const result = await report({ ...config.paths, now });

    expect(result).toEqual({
      period: { start: null, end: now },
      sources: {
        installRecords: { status: "readable" },
        settings: { status: "readable" },
        pluginFiles: { status: "readable" },
        transcripts: { status: "readable" },
        skillUsageCounter: { status: "readable" },
      },
      installations: [
        {
          kind: "standalone-skill",
          name: "linear-ticket",
          installedAt,
          usageStatus: "unused",
          recommended: true,
          uses: 0,
          lastUse: null,
        },
      ],
    });
  });

  it("covers the period from the earliest transcript timestamp up to now", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("fix the build", "2026-10-03T08:00:00.000Z"),
      skillToolCall("linear-ticket", "2026-10-08T09:00:00.000Z"),
    ]);
    await config.transcript({ project: "/work/app", session: "s2" }, [
      hookRun("SessionStart", "2026-09-28T07:15:00.000Z"),
      userPrompt("hello", "2026-09-28T07:15:01.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.period).toEqual({
      start: new Date("2026-09-28T07:15:00.000Z"),
      end: now,
    });
  });
});

describe("report: config file", () => {
  it("reads the skill usage counter only from the config file it is given", async () => {
    const config = await fakeConfigDir({ configFileInConfigDir: true });
    await config.standaloneSkill("linear-ticket");
    await config.skillUsage("linear-ticket", "2026-08-30T12:00:00.000Z");

    // @ts-expect-error the config file has no default, so callers resolve it the way the CLI does
    const withoutConfigFile: ReportOptions = { configDir: config.path, now };
    expect(withoutConfigFile).not.toHaveProperty("configFile");
    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "linear-ticket", lastUse: new Date("2026-08-30T12:00:00.000Z") },
    ]);
  });
});

describe("report: Linked Skills and Synced Skills", () => {
  it("labels a link into another tool's skill folder as a Linked Skill with its target", async () => {
    const config = await fakeConfigDir();
    await config.linkedSkill("find-skills");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("find-skills", "2026-10-04T09:00:00.000Z"),
      skillToolCall("find-skills", "2026-10-11T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "find-skills",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 2,
        lastUse: new Date("2026-10-11T09:00:00.000Z"),
        linked: { target: join(config.home, ".agents", "skills", "find-skills") },
      },
    ]);
  });

  it("ignores a plain file sitting directly in the user's skills folder", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("review");
    await config.skillsFolderFile("AGENTS.md", "Notes for agents.");

    const result = await report({ ...config.paths, now });

    expect(result.installations.map((installation) => installation.name)).toEqual(["review"]);
  });

  it("lists only folders with a SKILL.md as Standalone Skills, never dot-folders", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("review");
    await config.skillsFolderDir(".cache", { "SKILL.md": "cached" });
    await config.skillsFolderDir("notes", { "README.md": "Notes." });
    await config.skillsFolderDir("empty");

    const result = await report({ ...config.paths, now });

    expect(result.installations.map((installation) => installation.name)).toEqual(["review"]);
  });

  it("ignores a link to a folder without a SKILL.md", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("review");
    const target = join(config.home, "code", "not-a-skill");
    await mkdir(target, { recursive: true });
    await symlink(target, join(config.path, "skills", "not-a-skill"));

    const result = await report({ ...config.paths, now });

    expect(result.installations.map((installation) => installation.name)).toEqual(["review"]);
  });

  it("lists a link whose target no longer exists as a broken Linked Skill", async () => {
    const config = await fakeConfigDir();
    const target = join(config.home, ".agents", "skills", "gone-skill");
    await config.brokenLinkedSkill("gone-skill", { target });
    await config.brokenLinkedSkill("used-gone-skill");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("used-gone-skill", "2026-10-04T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "gone-skill",
        installedAt,
        usageStatus: "unused",
        recommended: true,
        uses: 0,
        lastUse: null,
        linked: { target, broken: true },
      },
      {
        kind: "standalone-skill",
        name: "used-gone-skill",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 1,
        lastUse: new Date("2026-10-04T09:00:00.000Z"),
        linked: { target: join(config.home, ".agents", "skills", "used-gone-skill"), broken: true },
      },
    ]);
  });

  it("shows the absolute target of a relative link into a personal repository", async () => {
    const config = await fakeConfigDir();
    const target = join(config.home, "code", "my-skills", "release-notes");
    await config.linkedSkill("release-notes", { target, relative: true });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("release-notes", "2026-10-06T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "release-notes",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 1,
        lastUse: new Date("2026-10-06T09:00:00.000Z"),
        linked: { target },
      },
    ]);
  });

  it("labels a skill in the claude.ai-synced area a Synced Skill counted by its qualified name", async () => {
    const config = await fakeConfigDir();
    await config.syncedSkill("docx");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("anthropic-skills:docx", "2026-10-03T09:00:00.000Z"),
      skillToolCall("docx", "2026-10-05T09:00:00.000Z"),
      skillToolCall("anthropic-skills:docx", "2026-10-07T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "anthropic-skills:docx",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 2,
        lastUse: new Date("2026-10-07T09:00:00.000Z"),
        synced: true,
      },
    ]);
  });
});

describe("report: skill history from the per-skill counter", () => {
  it("shows the counter's last Use with zero in-period Uses for a skill absent from transcripts", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("orca-linear");
    await config.skillUsage("orca-linear", "2026-08-14T12:00:00.000Z", 30);
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "orca-linear",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 0,
        lastUse: new Date("2026-08-14T12:00:00.000Z"),
      },
    ]);
  });

  it("shows the later last Use when both transcripts and the counter have one", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.standaloneSkill("ux-writing");
    await config.skillUsage("linear-ticket", "2026-10-20T08:00:00.000Z", 12);
    await config.skillUsage("ux-writing", "2026-07-01T08:00:00.000Z", 4);
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("linear-ticket", "2026-10-09T10:30:00.000Z"),
      skillToolCall("ux-writing", "2026-10-11T10:30:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "ux-writing",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 1,
        lastUse: new Date("2026-10-11T10:30:00.000Z"),
      },
      {
        kind: "standalone-skill",
        name: "linear-ticket",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 1,
        lastUse: new Date("2026-10-20T08:00:00.000Z"),
      },
    ]);
  });

  it("never takes a last Use or Use count from the per-plugin counter", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills", { skills: ["commit"] });
    await config.standaloneSkill("linear-ticket");
    await config.pluginUsage("skills@sht02048-skills", "2026-10-20T08:00:00.000Z", 95);
    await config.pluginUsage("linear-ticket", "2026-10-20T08:00:00.000Z", 95);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      {
        name: "skills@sht02048-skills",
        uses: 0,
        lastUse: null,
        components: [{ name: "skills:commit", uses: 0, lastUse: null }],
      },
      { kind: "standalone-skill", name: "linear-ticket", uses: 0, lastUse: null },
    ]);
  });
});

describe("report: plugin skill history from the per-skill counter", () => {
  it("extends a plugin skill's last Use, and its Plugin's, without adding in-period Uses", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills", { skills: ["commit", "pr"] });
    await config.skillUsage("skills:commit", "2026-08-30T12:00:00.000Z", 35);
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("skills:pr", "2026-10-02T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "plugin",
        name: "skills@sht02048-skills",
        installedAt,
        usageStatus: "used",
        recommended: false,
        enabled: true,
        hooks: 0,
        uses: 1,
        lastUse: new Date("2026-10-02T09:00:00.000Z"),
        components: [
          {
            kind: "skill",
            name: "skills:commit",
            uses: 0,
            lastUse: new Date("2026-08-30T12:00:00.000Z"),
          },
          { kind: "skill", name: "skills:pr", uses: 1, lastUse: new Date("2026-10-02T09:00:00.000Z") },
        ],
      },
    ]);
  });

  it("shows a Plugin's last Use from the counter when no Component was used in the period", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills", { skills: ["commit"] });
    await config.skillUsage("skills:commit", "2026-08-30T12:00:00.000Z", 35);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "skills@sht02048-skills", uses: 0, lastUse: new Date("2026-08-30T12:00:00.000Z") },
    ]);
  });
});

describe("report: read status of each data source", () => {
  it("marks every source readable when all of them parse", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("linear-ticket", "2026-10-09T10:30:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.sources).toEqual({
      installRecords: { status: "readable" },
      settings: { status: "readable" },
      pluginFiles: { status: "readable" },
      transcripts: { status: "readable" },
      skillUsageCounter: { status: "readable" },
    });
  });

  it("skips a transcript line that cannot be parsed and marks transcripts partially readable", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("linear-ticket", "2026-10-08T09:00:00.000Z"),
      '{"type":"assistant","timestamp":"2026-10-08T09:05:00.000Z","message":{"content":[{"ty',
      skillToolCall("linear-ticket", "2026-10-09T10:30:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.sources.transcripts).toEqual({
      status: "partial",
      reason: "1 unparsable transcript line skipped",
    });
    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "linear-ticket",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 2,
        lastUse: new Date("2026-10-09T10:30:00.000Z"),
      },
    ]);
  });

  it("marks a corrupt counter file unreadable and shows a last Use it alone could know as unknown", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.standaloneSkill("orca-linear");
    await config.corruptConfigFile();
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("linear-ticket", "2026-10-09T10:30:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.sources.skillUsageCounter).toEqual({
      status: "unreadable",
      reason: "config file is not valid JSON",
    });
    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "orca-linear",
        installedAt,
        usageStatus: "unknown",
        recommended: false,
        uses: 0,
        lastUse: "unknown",
      },
      {
        kind: "standalone-skill",
        name: "linear-ticket",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 1,
        lastUse: new Date("2026-10-09T10:30:00.000Z"),
      },
    ]);
  });

  it("marks a missing counter file unreadable rather than treating it as no history", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("orca-linear");
    await config.removeConfigFile();

    const result = await report({ ...config.paths, now });

    expect(result.sources.skillUsageCounter).toEqual({
      status: "unreadable",
      reason: "config file not found",
    });
    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "orca-linear",
        installedAt,
        usageStatus: "unknown",
        recommended: false,
        uses: 0,
        lastUse: "unknown",
      },
    ]);
  });

  it("marks the counter unreadable when skillUsage is not a record of skills", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("orca-linear");
    await writeFile(config.configFile, JSON.stringify({ skillUsage: [1, 2, 3] }));

    const result = await report({ ...config.paths, now });

    expect(result.sources.skillUsageCounter).toEqual({
      status: "unreadable",
      reason: "skillUsage in config file is not an object",
    });
    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "orca-linear",
        installedAt,
        usageStatus: "unknown",
        recommended: false,
        uses: 0,
        lastUse: "unknown",
      },
    ]);
  });

  it("skips a counter record it cannot read and marks the counter partially readable", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("orca-linear");
    await config.standaloneSkill("ux-writing");
    await writeFile(
      config.configFile,
      JSON.stringify({
        skillUsage: {
          "orca-linear": { usageCount: 30, lastUsedAt: 1786708800000 },
          "ux-writing": { usageCount: 2, lastUsedAt: "yesterday" },
        },
      }),
    );

    const result = await report({ ...config.paths, now });

    expect(result.sources.skillUsageCounter).toEqual({
      status: "partial",
      reason: "1 unreadable skillUsage record skipped",
    });
    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "ux-writing",
        installedAt,
        usageStatus: "unknown",
        recommended: false,
        uses: 0,
        lastUse: "unknown",
      },
      {
        kind: "standalone-skill",
        name: "orca-linear",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 0,
        lastUse: new Date("2026-08-14T12:00:00.000Z"),
      },
    ]);
  });

  it("counts the other transcripts and marks transcripts partially readable when one cannot be opened", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("linear-ticket", "2026-10-08T09:00:00.000Z"),
    ]);
    await config.transcript({ project: "/work/app", session: "s2" }, [
      skillToolCall("linear-ticket", "2026-10-09T09:00:00.000Z"),
    ]);
    await chmod(join(config.path, "projects", "-work-app", "s2.jsonl"), 0o000);

    const result = await report({ ...config.paths, now });

    expect(result.sources.transcripts).toEqual({
      status: "partial",
      reason: "1 transcript file could not be read",
    });
    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "linear-ticket",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: 1,
        lastUse: new Date("2026-10-08T09:00:00.000Z"),
      },
    ]);
  });

  it("marks transcripts unreadable and shows Uses as unknown when they cannot be listed", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("orca-linear");
    await config.standaloneSkill("ux-writing");
    await config.skillUsage("orca-linear", "2026-08-14T12:00:00.000Z");
    await writeFile(join(config.path, "projects"), "not a directory");

    const result = await report({ ...config.paths, now });

    expect(result.sources.transcripts).toEqual({
      status: "unreadable",
      reason: "transcripts folder could not be read",
    });
    expect(result.period).toEqual({ start: null, end: now });
    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "ux-writing",
        installedAt,
        usageStatus: "unknown",
        recommended: false,
        uses: "unknown",
        lastUse: "unknown",
      },
      {
        kind: "standalone-skill",
        name: "orca-linear",
        installedAt,
        usageStatus: "used",
        recommended: false,
        uses: "unknown",
        lastUse: new Date("2026-08-14T12:00:00.000Z"),
      },
    ]);
  });

  it("marks missing install records unreadable", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.removeInstallRecords();

    const result = await report({ ...config.paths, now });

    expect(result.sources.installRecords).toEqual({
      status: "unreadable",
      reason: "install records not found",
    });
    expect(result.installations.map((installation) => installation.name)).toEqual(["linear-ticket"]);
  });

  it("marks corrupt install records unreadable instead of failing the Report", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills", { skills: ["commit"] });
    await config.standaloneSkill("linear-ticket");
    await config.corruptInstallRecords();

    const result = await report({ ...config.paths, now });

    expect(result.sources.installRecords).toEqual({
      status: "unreadable",
      reason: "install records is not valid JSON",
    });
    expect(result.installations.map((installation) => installation.name)).toEqual(["linear-ticket"]);
  });

  it("shows a Plugin's Uses as unknown when transcripts cannot be listed", async () => {
    const config = await fakeConfigDir();
    await config.plugin("oh-my-claudecode@omc", { skills: ["review"], agents: ["executor"] });
    await writeFile(join(config.path, "projects"), "not a directory");

    const result = await report({ ...config.paths, now });

    expect(result.installations).toEqual([
      {
        kind: "plugin",
        name: "oh-my-claudecode@omc",
        installedAt,
        usageStatus: "unknown",
        recommended: false,
        enabled: true,
        hooks: 0,
        uses: "unknown",
        lastUse: "unknown",
        components: [
          { kind: "skill", name: "oh-my-claudecode:review", uses: "unknown", lastUse: "unknown" },
          { kind: "agent", name: "oh-my-claudecode:executor", uses: "unknown", lastUse: "unknown" },
        ],
      },
    ]);
  });

  it("keeps a Plugin's in-period last Use when the counter is unreadable", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills", { skills: ["commit", "pr"] });
    await config.corruptConfigFile();
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("skills:pr", "2026-10-02T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      {
        name: "skills@sht02048-skills",
        uses: 1,
        lastUse: new Date("2026-10-02T09:00:00.000Z"),
        components: [
          { name: "skills:commit", uses: 0, lastUse: "unknown" },
          { name: "skills:pr", uses: 1, lastUse: new Date("2026-10-02T09:00:00.000Z") },
        ],
      },
    ]);
  });

  it("shows a Plugin's last Use as unknown when only an unreadable counter could know it", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills", { skills: ["commit"] });
    await config.corruptConfigFile();
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-10-02T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "skills@sht02048-skills", uses: 0, lastUse: "unknown" },
    ]);
  });

  it("shows a Plugin's last Use as unknown when an unreadable transcript could hold a later one", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills", { skills: ["commit", "pr"] });
    await config.corruptConfigFile();
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("skills:pr", "2026-10-02T09:00:00.000Z"),
    ]);
    await config.transcript({ project: "/work/app", session: "s2" }, [
      skillToolCall("skills:commit", "2026-10-20T09:00:00.000Z"),
    ]);
    await chmod(join(config.path, "projects", "-work-app", "s2.jsonl"), 0o000);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "skills@sht02048-skills", uses: 1, lastUse: "unknown" },
    ]);
  });
});
