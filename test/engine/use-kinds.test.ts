import { describe, expect, it } from "vitest";
import { report, type Plugin, type Report } from "../../src/engine/index.js";
import {
  agentToolCall,
  fakeConfigDir,
  mcpToolCall,
  slashCommand,
} from "../support/fake-config-dir.js";

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

describe("report: MCP tool Uses", () => {
  it("counts an MCP tool call as a Use of the Plugin's MCP server, splitting names by known plugins and server keys", async () => {
    const config = await fakeConfigDir();
    await config.plugin("oh-my-claudecode@omc", {
      mcpServers: { t: { command: "node", args: ["./bridge/mcp-server.cjs"] } },
    });
    await config.plugin("data_tools@market", {
      mcpServers: { db_admin: { command: "db-server" } },
    });
    await config.plugin("vercel@claude-plugins-official", {
      mcpServers: {
        vercel: { type: "http", url: "https://mcp.vercel.com" },
        "chrome.devtools": { command: "devtools-server" },
      },
    });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      mcpToolCall("mcp__plugin_oh-my-claudecode_t__ast_grep_search", "2026-10-05T09:00:00.000Z"),
      mcpToolCall("mcp__plugin_oh-my-claudecode_t__lsp_hover", "2026-10-06T09:00:00.000Z"),
      mcpToolCall("mcp__plugin_data_tools_db_admin__run_query", "2026-10-06T10:00:00.000Z"),
      mcpToolCall("mcp__plugin_vercel_vercel__list_projects", "2026-10-07T09:00:00.000Z"),
      mcpToolCall("mcp__plugin_vercel_chrome_devtools__take_screenshot", "2026-10-08T09:00:00.000Z"),
      mcpToolCall("mcp__plugin_vercel_unknown__call", "2026-10-09T09:00:00.000Z"),
      mcpToolCall("mcp__context7__query-docs", "2026-10-09T09:00:00.000Z"),
    ]);

    const result = await report({ configDir: config.path, now });

    expect(
      plugins(result).map(({ name, uses, components }) => ({
        name,
        uses,
        components: components.map(({ name, uses, lastUse }) => ({ name, uses, lastUse })),
      })),
    ).toEqual([
      {
        name: "data_tools@market",
        uses: 1,
        components: [
          { name: "data_tools:db_admin", uses: 1, lastUse: new Date("2026-10-06T10:00:00.000Z") },
        ],
      },
      {
        name: "oh-my-claudecode@omc",
        uses: 2,
        components: [
          { name: "oh-my-claudecode:t", uses: 2, lastUse: new Date("2026-10-06T09:00:00.000Z") },
        ],
      },
      {
        name: "vercel@claude-plugins-official",
        uses: 2,
        components: [
          {
            name: "vercel:chrome.devtools",
            uses: 1,
            lastUse: new Date("2026-10-08T09:00:00.000Z"),
          },
          { name: "vercel:vercel", uses: 1, lastUse: new Date("2026-10-07T09:00:00.000Z") },
        ],
      },
    ]);
  });
});
