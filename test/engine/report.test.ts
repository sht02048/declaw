import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { report } from "../../src/engine/index.js";
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

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "linear-ticket",
        installedAt,
        status: "used",
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

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "orca-linear",
        installedAt,
        status: "used",
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

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toContainEqual({
      kind: "standalone-skill",
      name: "ux-writing",
      installedAt,
      status: "unused",
      recommended: true,
      uses: 0,
      lastUse: null,
    });
  });

  it("reports an empty period when no transcripts exist yet", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");

    const result = await report({ configDir: config.path, now });

    expect(result).toEqual({
      period: { start: null, end: now },
      installations: [
        {
          kind: "standalone-skill",
          name: "linear-ticket",
          installedAt,
          status: "too-new",
          recommended: false,
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

    const result = await report({ configDir: config.path, now });

    expect(result.period).toEqual({
      start: new Date("2026-09-28T07:15:00.000Z"),
      end: now,
    });
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

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "find-skills",
        installedAt,
        status: "used",
        recommended: false,
        uses: 2,
        lastUse: new Date("2026-10-11T09:00:00.000Z"),
        linked: { target: join(config.home, ".agents", "skills", "find-skills") },
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

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "release-notes",
        installedAt,
        status: "used",
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

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "anthropic-skills:docx",
        installedAt,
        status: "used",
        recommended: false,
        uses: 2,
        lastUse: new Date("2026-10-07T09:00:00.000Z"),
        synced: true,
      },
    ]);
  });
});
