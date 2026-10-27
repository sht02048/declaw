import type { StandaloneSkillRecord } from "./inventory.js";
import type { McpServerRecord } from "./mcp-servers.js";
import { pluginName, type ComponentKind, type ComponentRecord, type PluginRecord } from "./plugins.js";
import type { Use, UseKind } from "./uses.js";

export interface UsageTally {
  uses: number;
  lastUse: Date | null;
}

interface McpServerPrefix {
  prefix: string;
  tally: string;
}

const USE_KIND_OF: Record<ComponentKind, UseKind> = {
  skill: "invoke",
  command: "invoke",
  agent: "agent",
  "mcp-server": "mcp",
};

export class UsageTallies {
  private readonly tallies = new Map<string, UsageTally>();
  private readonly mcpPrefixes: McpServerPrefix[] = [];

  constructor(plugins: PluginRecord[], skills: StandaloneSkillRecord[], mcpServers: McpServerRecord[]) {
    for (const skill of skills) this.startTally(key("invoke", skill.name));
    for (const plugin of plugins) {
      for (const component of plugin.components === "unknown" ? [] : plugin.components) {
        this.startTally(key(USE_KIND_OF[component.kind], component.name));
        if (component.kind === "mcp-server") this.addMcpServer(plugin, component);
      }
    }
    for (const server of mcpServers) {
      this.startTally(standaloneMcpServerKey(server.name));
      this.mcpPrefixes.push({ prefix: `mcp__${toolNamePart(server.name)}__`, tally: standaloneMcpServerKey(server.name) });
    }
    // The sort is stable, so a Plugin's prefix stays ahead of an equal Standalone MCP Server prefix.
    this.mcpPrefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  record(use: Use): void {
    const tallyKey = use.kind === "mcp" ? this.mcpTallyOf(use.name) : key(use.kind, use.name);
    const tally = tallyKey === undefined ? undefined : this.tallies.get(tallyKey);
    if (!tally) return;
    tally.uses += 1;
    if (tally.lastUse === null || use.at > tally.lastUse) tally.lastUse = use.at;
  }

  skill(name: string): UsageTally {
    return { ...this.tallies.get(key("invoke", name))! };
  }

  component(component: ComponentRecord): UsageTally {
    return { ...this.tallies.get(key(USE_KIND_OF[component.kind], component.name))! };
  }

  mcpServer(name: string): UsageTally {
    return { ...this.tallies.get(standaloneMcpServerKey(name))! };
  }

  private startTally(tallyKey: string): void {
    if (!this.tallies.has(tallyKey)) this.tallies.set(tallyKey, { uses: 0, lastUse: null });
  }

  private addMcpServer(plugin: PluginRecord, component: ComponentRecord): void {
    const server = component.name.slice(plugin.namespace.length + 1);
    const pluginNames = new Set([plugin.namespace, pluginName(plugin.key)]);
    for (const pluginName of pluginNames) {
      const prefix = `mcp__plugin_${toolNamePart(pluginName)}_${toolNamePart(server)}__`;
      this.mcpPrefixes.push({ prefix, tally: key("mcp", component.name) });
    }
  }

  private mcpTallyOf(toolName: string): string | undefined {
    return this.mcpPrefixes.find(({ prefix }) => toolName.startsWith(prefix))?.tally;
  }
}

function key(kind: UseKind, name: string): string {
  return `${kind} ${name}`;
}

function standaloneMcpServerKey(name: string): string {
  return `standalone-mcp ${name}`;
}

function toolNamePart(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}
