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
});
