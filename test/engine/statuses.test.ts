import { describe, expect, it } from "vitest";
import { report, type Report } from "../../src/engine/index.js";
import { fakeConfigDir, skillToolCall, userPrompt } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");
const periodStart = "2026-09-28T07:15:00.000Z";

function statuses(result: Report): Record<string, string> {
  return Object.fromEntries(result.installations.map((i) => [i.name, i.status]));
}

describe("report: Statuses", () => {
  it("marks a Plugin installed after the covered period began Too New, by its install record", async () => {
    const config = await fakeConfigDir();
    await config.plugin("old@market", { installedAt: "2026-09-01T00:00:00.000Z" });
    await config.plugin("new@market", { installedAt: "2026-10-20T00:00:00.000Z" });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(statuses(result)).toEqual({ "old@market": "unused", "new@market": "too-new" });
  });

  it("marks a Standalone Skill whose folder was created after the period began Too New", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("old-skill", { createdAt: "2026-09-01T00:00:00.000Z" });
    await config.standaloneSkill("new-skill", { createdAt: "2026-10-20T00:00:00.000Z" });
    await config.syncedSkill("new-synced", "org_account", { createdAt: "2026-10-20T00:00:00.000Z" });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(statuses(result)).toEqual({
      "old-skill": "unused",
      "new-skill": "too-new",
      "anthropic-skills:new-synced": "too-new",
    });
  });

  it("keeps a Standalone Skill copied with old timestamps Too New, by its creation time", async () => {
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
      { name: "copied-skill", status: "too-new", installedAt: new Date("2026-10-20T00:00:00.000Z") },
    ]);
  });

  it("falls back to a folder's modification time when the filesystem has no creation time", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("new-skill", { createdAt: null, modifiedAt: "2026-10-20T00:00:00.000Z" });
    await config.standaloneSkill("old-skill", { createdAt: null, modifiedAt: "2026-09-01T00:00:00.000Z" });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(statuses(result)).toEqual({ "old-skill": "unused", "new-skill": "too-new" });
  });

  it("judges a Linked Skill by the link's own time, not its target's", async () => {
    const config = await fakeConfigDir();
    await config.linkedSkill("new-link", {
      createdAt: "2026-10-20T00:00:00.000Z",
      targetCreatedAt: "2026-01-01T00:00:00.000Z",
    });
    await config.linkedSkill("old-link", {
      createdAt: "2026-09-01T00:00:00.000Z",
      targetCreatedAt: "2026-10-20T00:00:00.000Z",
    });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(statuses(result)).toEqual({ "new-link": "too-new", "old-link": "unused" });
  });

  it("marks everything Too New while no transcripts cover any period", async () => {
    const config = await fakeConfigDir();
    await config.plugin("old@market", { installedAt: "2025-01-01T00:00:00.000Z" });
    await config.standaloneSkill("old-skill", { createdAt: "2025-01-01T00:00:00.000Z" });

    const result = await report({ ...config.paths, now });

    expect(statuses(result)).toEqual({ "old@market": "too-new", "old-skill": "too-new" });
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

    expect(statuses(result)).toEqual({
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
      { name: "orca-linear", uses: 0, status: "used", recommended: false },
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
      { name: "switched-off@market", lastUse: "unknown", status: "unknown", recommended: true },
      { name: "orca-linear", lastUse: "unknown", status: "unknown", recommended: false },
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
    await config.standaloneSkill("f-too-new-used", { createdAt: "2026-10-01T00:00:00.000Z" });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("go", periodStart),
      skillToolCall("e-used-early", "2026-10-02T09:00:00.000Z"),
      skillToolCall("f-too-new-used", "2026-10-05T09:00:00.000Z"),
      skillToolCall("b-used-late:work", "2026-10-09T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations.map((i) => i.name)).toEqual([
      "c-unused-oldest",
      "d-unused-middle",
      "a-unused-recent@market",
      "e-used-early",
      "f-too-new-used",
      "b-used-late@market",
    ]);
  });

  it("puts Installations with no last Use ahead of used ones after the Unused", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("used-skill");
    await config.standaloneSkill("fresh-skill", { createdAt: "2026-10-20T00:00:00.000Z" });
    await config.standaloneSkill("idle-skill");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("go", periodStart),
      skillToolCall("used-skill", "2026-10-02T09:00:00.000Z"),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations.map((i) => i.name)).toEqual([
      "idle-skill",
      "fresh-skill",
      "used-skill",
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

  it("never recommends a Too New Installation, even an Unused or disabled one", async () => {
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

    expect(recommended(result)).toEqual([]);
  });

  it("never recommends a Synced Skill, even an Unused one", async () => {
    const config = await fakeConfigDir();
    await config.syncedSkill("docx");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("go", periodStart),
    ]);

    const result = await report({ ...config.paths, now });

    expect(result.installations).toMatchObject([
      { name: "anthropic-skills:docx", status: "unused", recommended: false },
    ]);
  });
});
