import type { StandaloneSkillEntry } from "./inventory.js";
import type { ComponentEntry, ComponentKind, PluginEntry } from "./plugins.js";
import type { Use, UseKind } from "./uses.js";

export interface UsageTally {
  uses: number;
  lastUse: Date | null;
}

interface McpServerPrefix {
  prefix: string;
  component: string;
}

const USE_KIND_OF: Record<ComponentKind, UseKind> = {
  skill: "invoke",
  command: "invoke",
  agent: "agent",
  "mcp-server": "mcp",
};

export class UsageLedger {
  private readonly tallies = new Map<string, UsageTally>();
  private readonly mcpPrefixes: McpServerPrefix[] = [];

  constructor(plugins: PluginEntry[], skills: StandaloneSkillEntry[]) {
    for (const skill of skills) this.open("invoke", skill.name);
    for (const plugin of plugins) {
      for (const component of plugin.components === "unknown" ? [] : plugin.components) {
        this.open(USE_KIND_OF[component.kind], component.name);
        if (component.kind === "mcp-server") this.addMcpServer(plugin, component);
      }
    }
    this.mcpPrefixes.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  record(use: Use): void {
    const name = use.kind === "mcp" ? this.mcpServerOf(use.name) : use.name;
    const tally = name === undefined ? undefined : this.tallies.get(key(use.kind, name));
    if (!tally) return;
    tally.uses += 1;
    if (tally.lastUse === null || use.at > tally.lastUse) tally.lastUse = use.at;
  }

  skill(name: string): UsageTally {
    return { ...this.tallies.get(key("invoke", name))! };
  }

  component(component: ComponentEntry): UsageTally {
    return { ...this.tallies.get(key(USE_KIND_OF[component.kind], component.name))! };
  }

  private open(kind: UseKind, name: string): void {
    if (!this.tallies.has(key(kind, name))) this.tallies.set(key(kind, name), { uses: 0, lastUse: null });
  }

  private addMcpServer(plugin: PluginEntry, component: ComponentEntry): void {
    const server = component.name.slice(plugin.namespace.length + 1);
    const pluginNames = new Set([plugin.namespace, pluginNameOf(plugin.key)]);
    for (const pluginName of pluginNames) {
      const prefix = `mcp__plugin_${toolNamePart(pluginName)}_${toolNamePart(server)}__`;
      this.mcpPrefixes.push({ prefix, component: component.name });
    }
  }

  private mcpServerOf(toolName: string): string | undefined {
    return this.mcpPrefixes.find(({ prefix }) => toolName.startsWith(prefix))?.component;
  }
}

function key(kind: UseKind, name: string): string {
  return `${kind} ${name}`;
}

function pluginNameOf(key: string): string {
  const at = key.lastIndexOf("@");
  return at > 0 ? key.slice(0, at) : key;
}

function toolNamePart(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "_");
}
