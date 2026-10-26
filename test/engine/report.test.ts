import { describe, expect, it } from "vitest";
import { report } from "../../src/engine/index.js";
import { fakeConfigDir, hookRun, skillToolCall, userPrompt } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

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
      uses: 0,
      lastUse: null,
    });
  });

  it("lists only real-folder Standalone Skills", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.linkedSkill("find-skills");
    await config.syncedSkill("docx");

    const result = await report({ configDir: config.path, now });

    expect(result.installations.map((installation) => installation.name)).toEqual([
      "linear-ticket",
    ]);
  });

  it("reports an empty period when no transcripts exist yet", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");

    const result = await report({ configDir: config.path, now });

    expect(result).toEqual({
      period: { start: null, end: now },
      installations: [
        { kind: "standalone-skill", name: "linear-ticket", uses: 0, lastUse: null },
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

describe("report: skill history from the per-skill counter", () => {
  it("shows the counter's last Use with zero in-period Uses for a skill absent from transcripts", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("orca-linear");
    await config.skillUsage("orca-linear", "2026-08-14T12:00:00.000Z", 30);
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "orca-linear",
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

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "linear-ticket",
        uses: 1,
        lastUse: new Date("2026-10-20T08:00:00.000Z"),
      },
      {
        kind: "standalone-skill",
        name: "ux-writing",
        uses: 1,
        lastUse: new Date("2026-10-11T10:30:00.000Z"),
      },
    ]);
  });

  it("never takes a last Use or Use count from the per-plugin counter", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.pluginUsage("linear-ticket", "2026-10-20T08:00:00.000Z", 95);

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toEqual([
      { kind: "standalone-skill", name: "linear-ticket", uses: 0, lastUse: null },
    ]);
  });
});
