import type { StandaloneSkillEntry } from "./inventory.js";
import type { ComponentEntry, ComponentKind, PluginEntry } from "./plugins.js";
import type { Use, UseKind } from "./uses.js";

export interface UsageTally {
  uses: number;
  lastUse: Date | null;
}

const USE_KIND_OF: Record<ComponentKind, UseKind | null> = {
  skill: "invoke",
  command: "invoke",
  agent: "agent",
  "mcp-server": null,
};

export class UsageLedger {
  private readonly tallies = new Map<string, UsageTally>();

  constructor(plugins: PluginEntry[], skills: StandaloneSkillEntry[]) {
    for (const skill of skills) this.open("invoke", skill.name);
    for (const plugin of plugins) {
      for (const component of plugin.components) {
        const kind = USE_KIND_OF[component.kind];
        if (kind) this.open(kind, component.name);
      }
    }
  }

  record(use: Use): void {
    const tally = this.tallies.get(key(use.kind, use.name));
    if (!tally) return;
    tally.uses += 1;
    if (tally.lastUse === null || use.at > tally.lastUse) tally.lastUse = use.at;
  }

  skill(name: string): UsageTally {
    return { ...this.tallies.get(key("invoke", name))! };
  }

  component(component: ComponentEntry): UsageTally {
    const kind = USE_KIND_OF[component.kind];
    const tally = kind && this.tallies.get(key(kind, component.name));
    return tally ? { ...tally } : { uses: 0, lastUse: null };
  }

  private open(kind: UseKind, name: string): void {
    if (!this.tallies.has(key(kind, name))) this.tallies.set(key(kind, name), { uses: 0, lastUse: null });
  }
}

function key(kind: UseKind, name: string): string {
  return `${kind} ${name}`;
}
