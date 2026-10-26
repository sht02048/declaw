import { UsageLedger } from "./attribution.js";
import { findStandaloneSkills } from "./inventory.js";
import { findPlugins, type ComponentKind, type PluginEntry } from "./plugins.js";
import { judge, sortForCleanup, type Status } from "./statuses.js";
import { findTranscripts, readTranscript } from "./transcripts.js";
import { entryTimestamp, usesIn } from "./uses.js";

export type { Status } from "./statuses.js";


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
  installedAt: Date | null;
  status: Status;
  recommended: boolean;
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
  installedAt: Date | null;
  status: Status;
  recommended: boolean;
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

  for (const file of await findTranscripts(configDir)) {
    for await (const entry of readTranscript(file)) {
      const at = entryTimestamp(entry);
      if (at !== null && (start === null || at < start)) start = at;
      for (const use of usesIn(entry)) usage.record(use);
    }
  }

  return {
    period: { start, end: now },
    installations: sortForCleanup<Installation>([
      ...plugins.map((plugin) => judge(pluginInstallation(plugin, usage), start)),
      ...skills.map((skill) =>
        judge(
          {
            kind: "standalone-skill" as const,
            name: skill.name,
            installedAt: skill.createdAt,
            ...usage.skill(skill.name),
            ...(skill.linked && { linked: skill.linked }),
            ...(skill.synced && { synced: skill.synced }),
          },
          start,
        ),
      ),
    ]),
  };
}

function pluginInstallation(
  plugin: PluginEntry,
  usage: UsageLedger,
): Omit<Plugin, "status" | "recommended"> {
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
    installedAt: plugin.installedAt,
    enabled: plugin.enabled,
    hooks: plugin.hooks,
    uses,
    lastUse,
    components,
  };
}
