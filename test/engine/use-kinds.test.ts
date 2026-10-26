import { describe, expect, it } from "vitest";
import { report, type Plugin, type Report } from "../../src/engine/index.js";
import { agentToolCall, fakeConfigDir, slashCommand } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

function plugins(result: Report): Plugin[] {
  return result.installations.filter((installation) => installation.kind === "plugin");
}

describe("report: agent Uses", () => {
  it("counts Agent and Task tool calls for a plugin's subagent type as Uses of that agent", async () => {
    const config = await fakeConfigDir();
    await config.plugin("omc-tools@omc", {
      manifest: { name: "oh-my-claudecode" },
      agents: ["verifier"],
    });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      agentToolCall("oh-my-claudecode:verifier", "2026-10-05T09:00:00.000Z"),
      agentToolCall("oh-my-claudecode:verifier", "2026-10-09T09:00:00.000Z", { tool: "Task" }),
    ]);

    const result = await report({ configDir: config.path, now });

    expect(plugins(result)[0]).toMatchObject({
      name: "omc-tools@omc",
      uses: 2,
      lastUse: new Date("2026-10-09T09:00:00.000Z"),
      components: [
        {
          kind: "agent",
          name: "oh-my-claudecode:verifier",
          uses: 2,
          lastUse: new Date("2026-10-09T09:00:00.000Z"),
        },
      ],
    });
  });

  it("does not count built-in subagent types", async () => {
    const config = await fakeConfigDir();
    await config.plugin("omc-tools@omc", {
      manifest: { name: "oh-my-claudecode" },
      agents: ["explore"],
    });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      agentToolCall("general-purpose", "2026-10-05T09:00:00.000Z"),
      agentToolCall("Explore", "2026-10-05T09:01:00.000Z"),
      agentToolCall("Plan", "2026-10-05T09:02:00.000Z", { tool: "Task" }),
    ]);

    const result = await report({ configDir: config.path, now });

    expect(plugins(result)[0]).toMatchObject({ uses: 0, lastUse: null });
  });
});

describe("report: slash command Uses", () => {
  it("counts a user-typed slash command naming a known Component or Standalone Skill as a Use", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills", { skills: ["pr-review-diagnosis"] });
    await config.plugin("vercel@claude-plugins-official", { commands: ["status"] });
    await config.standaloneSkill("linear-ticket");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      slashCommand("skills:pr-review-diagnosis", "2026-10-13T06:23:13.862Z"),
      slashCommand("vercel:status", "2026-10-14T06:00:00.000Z", { args: "--prod" }),
      slashCommand("linear-ticket", "2026-10-15T06:00:00.000Z"),
    ]);

    const result = await report({ configDir: config.path, now });

    expect(
      result.installations.map(({ name, uses, lastUse }) => ({ name, uses, lastUse })),
    ).toEqual([
      {
        name: "skills@sht02048-skills",
        uses: 1,
        lastUse: new Date("2026-10-13T06:23:13.862Z"),
      },
      {
        name: "vercel@claude-plugins-official",
        uses: 1,
        lastUse: new Date("2026-10-14T06:00:00.000Z"),
      },
      { name: "linear-ticket", uses: 1, lastUse: new Date("2026-10-15T06:00:00.000Z") },
    ]);
  });

  it("does not count built-in slash commands", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills", { skills: ["commit"], commands: ["model"] });
    await config.standaloneSkill("linear-ticket");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      slashCommand("model", "2026-10-13T06:00:00.000Z", { args: "opus" }),
      slashCommand("clear", "2026-10-13T06:01:00.000Z"),
      slashCommand("plugin", "2026-10-13T06:02:00.000Z"),
    ]);

    const result = await report({ configDir: config.path, now });

    expect(result.installations.map(({ name, uses }) => ({ name, uses }))).toEqual([
      { name: "skills@sht02048-skills", uses: 0 },
      { name: "linear-ticket", uses: 0 },
    ]);
  });
});
