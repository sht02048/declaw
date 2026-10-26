import { describe, expect, it } from "vitest";
import { report, type Plugin, type Report } from "../../src/engine/index.js";
import { fakeConfigDir, skillToolCall } from "../support/fake-config-dir.js";

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

  it("uses the marketplace entry as the manifest when the plugin has no manifest", async () => {
    const config = await fakeConfigDir();
    await config.plugin("example-bundle@market", {
      manifest: null,
      marketplaceEntry: {
        skills: ["./skill-a", "./skill-b"],
        mcpServers: { docs: { type: "http", url: "https://docs.example.com/mcp" } },
      },
      files: {
        "skill-a/SKILL.md": "---\nname: skill-a\n---\n",
        "skill-b/SKILL.md": "---\nname: skill-b\n---\n",
        "README.md": "Raw files only.",
      },
    });

    const result = await report({ configDir: config.path, now });

    expect(plugins(result)[0]?.components.map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "skill example-bundle:skill-a",
      "skill example-bundle:skill-b",
      "mcp-server example-bundle:docs",
    ]);
  });

  it("uses a non-strict marketplace entry as the manifest even when a manifest exists", async () => {
    const config = await fakeConfigDir();
    await config.plugin("curated@market", {
      manifest: { name: "curated", agents: ["./agents/author-choice.md"] },
      marketplaceEntry: { strict: false, agents: ["./agents/curated-choice.md"] },
      files: {
        "agents/author-choice.md": "---\nname: author-choice\n---\n",
        "agents/curated-choice.md": "---\nname: curated-choice\n---\n",
      },
    });

    const result = await report({ configDir: config.path, now });

    expect(plugins(result)[0]?.components.map(({ kind, name }) => `${kind} ${name}`)).toEqual([
      "agent curated:curated-choice",
    ]);
  });

  it("counts the hooks a Plugin runs from its hook configuration", async () => {
    const config = await fakeConfigDir();
    const command = (script: string) => ({
      type: "command",
      command: `node "\${CLAUDE_PLUGIN_ROOT}"/scripts/${script}.cjs`,
    });
    await config.plugin("oh-my-claudecode@omc", {
      manifest: {
        name: "oh-my-claudecode",
        hooks: "./extra-hooks.json",
      },
      hooks: {
        SessionStart: [{ matcher: "startup", hooks: [command("session"), command("memory")] }],
        UserPromptSubmit: [{ hooks: [command("keywords")] }],
      },
      files: {
        "extra-hooks.json": JSON.stringify({
          hooks: { PostToolUse: [{ matcher: "Write|Edit", hooks: [command("verify")] }] },
        }),
      },
    });
    await config.plugin("quiet@market");

    const result = await report({ configDir: config.path, now });

    expect(
      Object.fromEntries(plugins(result).map((plugin) => [plugin.name, plugin.hooks])),
    ).toEqual({ "oh-my-claudecode@omc": 4, "quiet@market": 0 });
  });
});

describe("report: plugin skill Uses", () => {
  it("counts a plugin-qualified Skill tool call as a Use of its Component and Plugin, by manifest name", async () => {
    const config = await fakeConfigDir();
    await config.plugin("omc-tools@omc", {
      manifest: { name: "oh-my-claudecode" },
      skills: ["plan", "review", "ralph"],
      agents: ["executor"],
    });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("oh-my-claudecode:plan", "2026-10-02T09:00:00.000Z"),
      skillToolCall("omc-tools:plan", "2026-10-03T09:00:00.000Z"),
    ]);
    await config.transcript({ project: "/work/site", session: "s2" }, [
      skillToolCall("oh-my-claudecode:review", "2026-10-11T09:00:00.000Z"),
      skillToolCall("oh-my-claudecode:plan", "2026-10-07T09:00:00.000Z"),
    ]);

    const result = await report({ configDir: config.path, now });

    expect(plugins(result)).toEqual([
      {
        kind: "plugin",
        name: "omc-tools@omc",
        enabled: true,
        hooks: 0,
        uses: 3,
        lastUse: new Date("2026-10-11T09:00:00.000Z"),
        components: [
          {
            kind: "skill",
            name: "oh-my-claudecode:plan",
            uses: 2,
            lastUse: new Date("2026-10-07T09:00:00.000Z"),
          },
          { kind: "skill", name: "oh-my-claudecode:ralph", uses: 0, lastUse: null },
          {
            kind: "skill",
            name: "oh-my-claudecode:review",
            uses: 1,
            lastUse: new Date("2026-10-11T09:00:00.000Z"),
          },
          { kind: "agent", name: "oh-my-claudecode:executor", uses: 0, lastUse: null },
        ],
      },
    ]);
  });
});
