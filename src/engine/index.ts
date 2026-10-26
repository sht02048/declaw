import { UsageLedger } from "./attribution.js";
import { findStandaloneSkills } from "./inventory.js";
import { findPlugins, type ComponentKind, type PluginEntry } from "./plugins.js";
import { findMainTranscripts, readTranscript } from "./transcripts.js";
import { entryTimestamp, usesIn } from "./uses.js";

export interface ReportOptions {
  configDir: string;
  now: Date;
}

export interface CoveredPeriod {
  start: Date | null;
  end: Date;
}

export interface StandaloneSkill {
  kind: "standalone-skill";
  name: string;
  uses: number;
  lastUse: Date | null;
  linked?: { target: string };
  synced?: true;
}

export interface Component {
  kind: ComponentKind;
  name: string;
  uses: number;
  lastUse: Date | null;
}

export interface Plugin {
  kind: "plugin";
  name: string;
  enabled: boolean;
  hooks: number;
  uses: number;
  lastUse: Date | null;
  components: Component[];
}

export type Installation = Plugin | StandaloneSkill;

export interface Report {
  period: CoveredPeriod;
  installations: Installation[];
}

export async function report({ configDir, now }: ReportOptions): Promise<Report> {
  const plugins = await findPlugins(configDir);
  const skills = await findStandaloneSkills(configDir);
  const usage = new UsageLedger(plugins, skills);
  let start: Date | null = null;

  for (const file of await findMainTranscripts(configDir)) {
    for await (const entry of readTranscript(file)) {
      const at = entryTimestamp(entry);
      if (at !== null && (start === null || at < start)) start = at;
      for (const use of usesIn(entry)) usage.record(use);
    }
  }

  return {
    period: { start, end: now },
    installations: [
      ...plugins.map((plugin) => pluginInstallation(plugin, usage)),
      ...skills.map((skill): StandaloneSkill => ({
        kind: "standalone-skill",
        name: skill.name,
        ...usage.skill(skill.name),
        ...(skill.linked && { linked: skill.linked }),
        ...(skill.synced && { synced: skill.synced }),
      })),
    ],
  };
}

function pluginInstallation(plugin: PluginEntry, usage: UsageLedger): Plugin {
  const components = plugin.components.map(
    (component): Component => ({
      ...component,
      ...usage.component(component),
    }),
  );
  let uses = 0;
  let lastUse: Date | null = null;
  for (const component of components) {
    uses += component.uses;
    if (component.lastUse !== null && (lastUse === null || component.lastUse > lastUse)) {
      lastUse = component.lastUse;
    }
  }
  return {
    kind: "plugin",
    name: plugin.key,
    enabled: plugin.enabled,
    hooks: plugin.hooks,
    uses,
    lastUse,
    components,
  };
}
