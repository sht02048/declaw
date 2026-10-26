import { dirname, join } from "node:path";
import { findStandaloneSkills } from "./inventory.js";
import { findPlugins, type ComponentKind, type PluginEntry } from "./plugins.js";
import { partiallyReadable, readable, unreadable, type ReadStatus } from "./read-status.js";
import { readSkillUsageCounter, type SkillUsageCounterRead } from "./skill-usage.js";
import { findMainTranscripts, readTranscript } from "./transcripts.js";
import { entryTimestamp, usesIn } from "./uses.js";

export type { ReadStatus } from "./read-status.js";

export interface ReportOptions {
  configDir: string;
  configFile?: string;
  now: Date;
}

export interface CoveredPeriod {
  start: Date | null;
  end: Date;
}

export type Unknown = "unknown";

export interface StandaloneSkill {
  kind: "standalone-skill";
  name: string;
  uses: number | Unknown;
  lastUse: Date | null | Unknown;
  linked?: { target: string };
  synced?: true;
}

export interface Component {
  kind: ComponentKind;
  name: string;
  uses: number | Unknown;
  lastUse: Date | null | Unknown;
}

export interface Plugin {
  kind: "plugin";
  name: string;
  enabled: boolean;
  hooks: number;
  uses: number | Unknown;
  lastUse: Date | null | Unknown;
  components: Component[];
}

export type Installation = Plugin | StandaloneSkill;

export interface DataSources {
  transcripts: ReadStatus;
  skillUsageCounter: ReadStatus;
}

export interface Report {
  period: CoveredPeriod;
  sources: DataSources;
  installations: Installation[];
}

type Usage = Pick<StandaloneSkill, "uses" | "lastUse">;

const SKILL_TOOL_KINDS = new Set<ComponentKind>(["skill", "command"]);

export async function report({
  configDir,
  configFile = join(dirname(configDir), ".claude.json"),
  now,
}: ReportOptions): Promise<Report> {
  const plugins = await findPlugins(configDir);
  const skills = await findStandaloneSkills(configDir);
  const skillToolNames = new Set(skills.map((skill) => skill.name));
  for (const plugin of plugins) {
    for (const component of plugin.components) {
      if (SKILL_TOOL_KINDS.has(component.kind)) skillToolNames.add(component.name);
    }
  }
  const transcripts = await readTranscriptUsage(configDir, skillToolNames);
  const counter = await readSkillUsageCounter(configFile);

  const usageOf = (name: string, extendedByCounter: boolean): Usage => {
    const inPeriod = transcripts.usage === null ? null : (transcripts.usage.get(name) ?? NO_USE);
    if (extendedByCounter) {
      return { uses: inPeriod?.uses ?? "unknown", lastUse: lastUseOf(name, inPeriod, counter) };
    }
    return inPeriod ?? { uses: "unknown", lastUse: "unknown" };
  };

  return {
    period: { start: transcripts.start, end: now },
    sources: { transcripts: transcripts.status, skillUsageCounter: counter.status },
    installations: [
      ...plugins.map((plugin) => pluginInstallation(plugin, usageOf, transcripts)),
      ...skills.map((skill): StandaloneSkill => ({
        kind: "standalone-skill",
        name: skill.name,
        ...usageOf(skill.name, true),
        ...(skill.linked && { linked: skill.linked }),
        ...(skill.synced && { synced: skill.synced }),
      })),
    ],
  };
}

function pluginInstallation(
  plugin: PluginEntry,
  usageOf: (name: string, extendedByCounter: boolean) => Usage,
  transcripts: TranscriptUsage,
): Plugin {
  const components = plugin.components.map(
    (component): Component => ({
      ...component,
      ...usageOf(component.name, SKILL_TOOL_KINDS.has(component.kind)),
    }),
  );
  let uses: number | Unknown = transcripts.usage === null ? "unknown" : 0;
  for (const component of components) {
    uses = uses === "unknown" || component.uses === "unknown" ? "unknown" : uses + component.uses;
  }
  return {
    kind: "plugin",
    name: plugin.key,
    enabled: plugin.enabled,
    hooks: plugin.hooks,
    uses,
    lastUse: latestLastUse(
      components.map((component) => component.lastUse),
      transcripts.start,
    ),
    components,
  };
}

// An unknown last Use is never inside the covered period, since readable transcripts would have
// shown it, so it can only be ignored next to a known last Use that falls inside the period.
function latestLastUse(lastUses: Usage["lastUse"][], periodStart: Date | null): Usage["lastUse"] {
  let latest: Date | null = null;
  let anyUnknown = false;
  for (const lastUse of lastUses) {
    if (lastUse === "unknown") anyUnknown = true;
    else latest = later(latest, lastUse);
  }
  if (!anyUnknown) return latest;
  return latest !== null && periodStart !== null && latest >= periodStart ? latest : "unknown";
}

interface InPeriodUsage {
  uses: number;
  lastUse: Date | null;
}

const NO_USE: InPeriodUsage = { uses: 0, lastUse: null };

interface TranscriptUsage {
  status: ReadStatus;
  start: Date | null;
  usage: Map<string, InPeriodUsage> | null;
}

async function readTranscriptUsage(configDir: string, skillNames: Set<string>): Promise<TranscriptUsage> {
  let files: string[];
  try {
    files = await findMainTranscripts(configDir);
  } catch {
    return { status: unreadable("transcripts folder could not be read"), start: null, usage: null };
  }

  const usage = new Map<string, InPeriodUsage>();
  for (const name of skillNames) usage.set(name, { uses: 0, lastUse: null });
  let start: Date | null = null;
  let skippedLines = 0;
  let unreadableFiles = 0;

  for (const file of files) {
    try {
      for await (const entry of readTranscript(file, () => skippedLines++)) {
        const at = entryTimestamp(entry);
        if (at !== null && (start === null || at < start)) start = at;
        for (const use of usesIn(entry)) {
          const stats = usage.get(use.name);
          if (!stats) continue;
          stats.uses += 1;
          stats.lastUse = later(stats.lastUse, use.at);
        }
      }
    } catch {
      unreadableFiles += 1;
    }
  }

  const problems = [
    skippedLines > 0 && `${skippedLines} unparsable transcript ${plural(skippedLines, "line")} skipped`,
    unreadableFiles > 0 && `${unreadableFiles} transcript ${plural(unreadableFiles, "file")} could not be read`,
  ].filter((problem) => problem !== false);
  const status = problems.length === 0 ? readable : partiallyReadable(problems.join("; "));
  return { status, start, usage };
}

function lastUseOf(
  name: string,
  inPeriod: InPeriodUsage | null,
  counter: SkillUsageCounterRead,
): Date | null | Unknown {
  const counterKnows = counter.status.status !== "unreadable" && !counter.skippedSkills.has(name);
  if (counterKnows) {
    if (inPeriod === null) return counter.lastUses.get(name) ?? "unknown";
    return later(inPeriod.lastUse, counter.lastUses.get(name) ?? null);
  }
  return inPeriod?.lastUse ?? "unknown";
}

function later(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
