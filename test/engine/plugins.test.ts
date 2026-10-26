import { describe, expect, it } from "vitest";
import { report, type Plugin, type Report } from "../../src/engine/index.js";
import { fakeConfigDir } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

function plugins(result: Report): Plugin[] {
  return result.installations.filter((installation) => installation.kind === "plugin");
}

describe("report: Plugin Inventory", () => {
  it("lists every user-scope Plugin from the install records and no project-scope ones", async () => {
    const config = await fakeConfigDir();
    await config.plugin("skills@sht02048-skills");
    await config.plugin("vercel@claude-plugins-official");
    await config.plugin("frontend-design@claude-plugins-official", { scope: "project" });

    const result = await report({ configDir: config.path, now });

    expect(plugins(result).map((plugin) => plugin.name)).toEqual([
      "skills@sht02048-skills",
      "vercel@claude-plugins-official",
    ]);
  });

  it("follows the user-scope enabledPlugins setting, falling back to the manifest default", async () => {
    const config = await fakeConfigDir();
    await config.plugin("on@market");
    await config.plugin("off@market");
    await config.plugin("default-off@market", {
      manifest: { name: "default-off", defaultEnabled: false },
    });
    await config.plugin("default-on@market");
    await config.plugin("forced-on@market", {
      manifest: { name: "forced-on", defaultEnabled: false },
    });
    await config.enabledPlugins({ "on@market": true, "off@market": false, "forced-on@market": true });

    const result = await report({ configDir: config.path, now });

    expect(
      Object.fromEntries(plugins(result).map((plugin) => [plugin.name, plugin.enabled])),
    ).toEqual({
      "on@market": true,
      "off@market": false,
      "default-off@market": false,
      "default-on@market": true,
      "forced-on@market": true,
    });
  });

  it("finds Components in the plugin's default folders, namespaced by its manifest name", async () => {
    const config = await fakeConfigDir();
    await config.plugin("vercel@claude-plugins-official", {
      skills: ["deploy", "env"],
      commands: ["status"],
      agents: ["ai-architect"],
      mcpServers: { vercel: { type: "http", url: "https://mcp.vercel.com" } },
    });

    const result = await report({ configDir: config.path, now });

    expect(plugins(result)[0]?.components).toEqual([
      { kind: "skill", name: "vercel:deploy", uses: 0, lastUse: null },
      { kind: "skill", name: "vercel:env", uses: 0, lastUse: null },
      { kind: "command", name: "vercel:status", uses: 0, lastUse: null },
      { kind: "agent", name: "vercel:ai-architect", uses: 0, lastUse: null },
      { kind: "mcp-server", name: "vercel:vercel", uses: 0, lastUse: null },
    ]);
  });

  it("adds manifest skill paths, replaces default commands and agents, and merges MCP servers", async () => {
    const config = await fakeConfigDir();
    await config.plugin("toolkit@market", {
      manifest: {
        name: "toolkit",
        skills: ["./extra-skills/", "./standalone/solo"],
        commands: ["./cmds/", "./more/one-off.md"],
        agents: "./crew/reviewer.md",
        mcpServers: ["./servers.json", { inline: { command: "inline-server" } }],
      },
      skills: ["builtin"],
      commands: ["ignored-command"],
      agents: ["ignored-agent"],
      mcpServers: { "from-default": { command: "default-server" } },
      files: {
        "extra-skills/added/SKILL.md": "---\nname: added\n---\n",
        "standalone/solo/SKILL.md": "---\nname: solo\n---\n",
        "cmds/ship.md": "Ship it.",
        "more/one-off.md": "Once.",
        "crew/reviewer.md": "---\nname: reviewer\n---\n",
        "servers.json": JSON.stringify({ mcpServers: { "from-file": { command: "file-server" } } }),
      },
    });

    const result = await report({ configDir: config.path, now });

    expect(plugins(result)[0]?.components.map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "skill toolkit:added",
      "skill toolkit:builtin",
      "skill toolkit:solo",
      "command toolkit:one-off",
      "command toolkit:ship",
      "agent toolkit:reviewer",
      "mcp-server toolkit:from-default",
      "mcp-server toolkit:from-file",
      "mcp-server toolkit:inline",
    ]);
  });
});
