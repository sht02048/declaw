import { describe, expect, it } from "vitest";
import { report, type Report } from "../../src/engine/index.js";
import { fakeConfigDir, skillToolCall, userPrompt } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");
const periodStart = "2026-09-28T07:15:00.000Z";

function usageStatuses(result: Report): Record<string, string> {
  return Object.fromEntries(result.installations.map((i) => [i.name, i.usageStatus]));
}

describe("report: Usage Statuses", () => {
  it("judges an Installation installed after the covered period began by its Uses alone", async () => {
    const config = await fakeConfigDir();
    await config.plugin("new-used@market", { installedAt: "2026-10-20T00:00:00.000Z", skills: ["work"] });
    await config.plugin("new-idle@market", { installedAt: "2026-10-20T00:00:00.000Z" });
    await config.standaloneSkill("new-skill", { createdAt: "2026-10-20T00:00:00.000Z" });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
      skillToolCall("new-used:work", "2026-10-21T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "new-idle@market", usageStatus: "unused", recommended: true },
      { name: "new-skill", usageStatus: "unused", recommended: true },
      { name: "new-used@market", usageStatus: "used", recommended: false },
    ]);
  });

  it("reads a Plugin's install time from its install record", async () => {
    const config = await fakeConfigDir();
    await config.plugin("new@market", { installedAt: "2026-10-20T00:00:00.000Z" });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "new@market", installedAt: new Date("2026-10-20T00:00:00.000Z") },
    ]);
  });

  it("reads a Standalone Skill copied with old timestamps as installed at its creation time", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("copied-skill", {
      createdAt: "2026-10-20T00:00:00.000Z",
      modifiedAt: "2025-01-01T00:00:00.000Z",
    });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "copied-skill", usageStatus: "unused", installedAt: new Date("2026-10-20T00:00:00.000Z") },
    ]);
  });

  it("falls back to a folder's modification time when the filesystem has no creation time", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("new-skill", { createdAt: null, modifiedAt: "2026-10-20T00:00:00.000Z" });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "new-skill", installedAt: new Date("2026-10-20T00:00:00.000Z") },
    ]);
  });

  it("reads a Linked Skill's install time from the link itself, not its target", async () => {
    const config = await fakeConfigDir();
    await config.linkedSkill("new-link", {
      createdAt: "2026-10-20T00:00:00.000Z",
      targetCreatedAt: "2026-01-01T00:00:00.000Z",
    });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "new-link", installedAt: new Date("2026-10-20T00:00:00.000Z") },
    ]);
  });

  it("marks everything Unused while no transcripts cover any period", async () => {
    const config = await fakeConfigDir();
    await config.plugin("old@market", { installedAt: "2025-01-01T00:00:00.000Z" });
    await config.standaloneSkill("old-skill", { createdAt: "2025-01-01T00:00:00.000Z" });

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "old@market", usageStatus: "unused", recommended: true },
      { name: "old-skill", usageStatus: "unused", recommended: true },
    ]);
  });

  it("marks an Installation with a Use in the period Used, and one without Unused", async () => {
    const config = await fakeConfigDir();
    await config.plugin("vercel@market", { skills: ["deploy"] });
    await config.plugin("idle@market", { skills: ["nap"] });
    await config.standaloneSkill("linear-ticket");
    await config.standaloneSkill("ux-writing");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("ship it", periodStart),
      skillToolCall("vercel:deploy", "2026-10-02T09:00:00.000Z"),
      skillToolCall("linear-ticket", "2026-10-03T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(usageStatuses(result)).toEqual({
      "vercel@market": "used",
      "idle@market": "unused",
      "linear-ticket": "used",
      "ux-writing": "unused",
    });
  });

  it("marks an Installation Used when the per-skill counter knows a last Use before the period", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("orca-linear");
    await config.skillUsage("orca-linear", "2026-08-14T12:00:00.000Z");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "orca-linear", uses: 0, usageStatus: "used", recommended: false },
    ]);
  });

  it("never calls an Installation Unused when only an unreadable source could know its last Use", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("orca-linear");
    await config.plugin("switched-off@market", { skills: ["work"] });
    await config.enabledPlugins({ "switched-off@market": false });
    await config.corruptConfigFile();
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "switched-off@market", lastUse: "unknown", usageStatus: "unknown", recommended: true },
      { name: "orca-linear", lastUse: "unknown", usageStatus: "unknown", recommended: false },
    ]);
  });
});

function recommended(result: Report): string[] {
  return result.installations.filter((i) => i.recommended).map((i) => i.name);
}

describe("report: sorting", () => {
  it("lists Unused Installations first by oldest install, then the rest by oldest last Use", async () => {
    const config = await fakeConfigDir();
    await config.plugin("a-unused-recent@market", { installedAt: "2026-09-20T00:00:00.000Z" });
    await config.plugin("b-used-late@market", { skills: ["work"] });
    await config.standaloneSkill("c-unused-oldest", { createdAt: "2026-01-01T00:00:00.000Z" });
    await config.linkedSkill("d-unused-middle", { createdAt: "2026-06-01T00:00:00.000Z" });
    await config.standaloneSkill("e-used-early");
    await config.standaloneSkill("f-used-recent-install", { createdAt: "2026-10-01T00:00:00.000Z" });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("go", periodStart),
      skillToolCall("e-used-early", "2026-10-02T09:00:00.000Z"),
      skillToolCall("f-used-recent-install", "2026-10-05T09:00:00.000Z"),
      skillToolCall("b-used-late:work", "2026-10-09T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations.map((i) => i.name)).toEqual([
      "c-unused-oldest",
      "d-unused-middle",
      "a-unused-recent@market",
      "e-used-early",
      "f-used-recent-install",
      "b-used-late@market",
    ]);
  });
});

describe("report: the recommended Cleanup set", () => {
  it("recommends Unused Installations and leaves Used ones out", async () => {
    const config = await fakeConfigDir();
    await config.plugin("idle@market", { skills: ["nap"] });
    await config.plugin("busy@market", { skills: ["work"] });
    await config.standaloneSkill("ux-writing");
    await config.linkedSkill("find-skills");
    await config.standaloneSkill("linear-ticket");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("go", periodStart),
      skillToolCall("busy:work", "2026-10-02T09:00:00.000Z"),
      skillToolCall("linear-ticket", "2026-10-03T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(recommended(result).sort()).toEqual(["find-skills", "idle@market", "ux-writing"]);
  });

  it("recommends a disabled Plugin even when it saw a Use", async () => {
    const config = await fakeConfigDir();
    await config.plugin("switched-off@market", { skills: ["work"] });
    await config.enabledPlugins({ "switched-off@market": false });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("go", periodStart),
      skillToolCall("switched-off:work", "2026-10-02T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(recommended(result)).toEqual(["switched-off@market"]);
  });

  it("recommends recently installed Unused or disabled Installations", async () => {
    const config = await fakeConfigDir();
    await config.plugin("fresh@market", { installedAt: "2026-10-20T00:00:00.000Z" });
    await config.plugin("fresh-off@market", { installedAt: "2026-10-20T00:00:00.000Z" });
    await config.enabledPlugins({ "fresh-off@market": false });
    await config.standaloneSkill("fresh-skill", { createdAt: "2026-10-20T00:00:00.000Z" });
    await config.linkedSkill("fresh-link", { createdAt: "2026-10-20T00:00:00.000Z" });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("go", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(recommended(result).sort()).toEqual(["fresh-link", "fresh-off@market", "fresh-skill", "fresh@market"]);
  });

  it("never recommends a Synced Skill, even an Unused one", async () => {
    const config = await fakeConfigDir();
    await config.syncedSkill("docx");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("go", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "anthropic-skills:docx", usageStatus: "unused", recommended: false },
    ]);
  });
});
