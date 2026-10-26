import { plural } from "../plural.js";
import { UsageLedger, type UsageTally } from "./attribution.js";
import { findStandaloneSkills } from "./inventory.js";
import { findPlugins, type ComponentKind, type PluginRecord } from "./plugins.js";
import { partiallyReadable, readable, unreadable, type ReadStatus, type Unknown } from "./read-status.js";
import { lastUseOf, later, readSkillUsageCounter } from "./skill-usage.js";
import { judge, sortForCleanup, type UsageStatus } from "./usage-status.js";
import { findTranscripts, readTranscript } from "./transcripts.js";
import { lineTimestamp, usesIn } from "./uses.js";

export type { ReadStatus, Unknown } from "./read-status.js";
export type { UsageStatus } from "./usage-status.js";
export { isRemovable, planCleanup } from "./plan.js";
export type { PlannedAction, PlanOptions } from "./plan.js";
export { cleanup } from "./cleanup.js";
export type {
  ClaudeRunner,
  ClaudeRunResult,
  CleanupOptions,
  CleanupOutcome,
  TrashMover,
} from "./cleanup.js";

export interface ReportOptions {
  configDir: string;
  configFile: string;
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
  usageStatus: UsageStatus;
  recommended: boolean;
  uses: number | Unknown;
  lastUse: Date | null | Unknown;
  linked?: { target: string; broken?: true };
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
  installedAt: Date | null;
  usageStatus: UsageStatus;
  recommended: boolean;
  enabled: boolean | Unknown;
  hooks: number | Unknown;
  uses: number | Unknown;
  lastUse: Date | null | Unknown;
  components: Component[];
}

export type Installation = Plugin | StandaloneSkill;

export interface DataSources {
  installRecords: ReadStatus;
  settings: ReadStatus;
  pluginFiles: ReadStatus;
  transcripts: ReadStatus;
  skillUsageCounter: ReadStatus;
}

export interface Report {
  period: CoveredPeriod;
  sources: DataSources;
  installations: Installation[];
}

type Usage = Pick<StandaloneSkill, "uses" | "lastUse">;

const COUNTED_BY_SKILL_USAGE = new Set<ComponentKind>(["skill", "command"]);

export async function report({
  configDir,
  configFile,
  now,
}: ReportOptions): Promise<Report> {
  const { installRecords, settings, pluginFiles, plugins } = await findPlugins(configDir);
  const skills = await findStandaloneSkills(configDir);
  const transcripts = await readTranscriptUsage(configDir, new UsageLedger(plugins, skills));
  const counter = await readSkillUsageCounter(configFile);

  const usageOf = (inPeriod: UsageTally | null, counterKey: string | null): Usage => {
    if (counterKey !== null) {
      return { uses: inPeriod?.uses ?? "unknown", lastUse: lastUseOf(counterKey, inPeriod, counter) };
    }
    return inPeriod ?? { uses: "unknown", lastUse: "unknown" };
  };

  return {
    period: { start: transcripts.start, end: now },
    sources: {
      installRecords,
      settings,
      pluginFiles,
      transcripts: transcripts.status,
      skillUsageCounter: counter.status,
    },
    installations: sortForCleanup<Installation>([
      ...plugins.map((plugin) =>
        judge(pluginInstallation(plugin, usageOf, transcripts), transcripts.start),
      ),
      ...skills.map((skill) =>
        judge(
          {
            kind: "standalone-skill" as const,
            name: skill.name,
            installedAt: skill.createdAt,
            ...usageOf(transcripts.ledger?.skill(skill.name) ?? null, skill.name),
            ...(skill.linked && { linked: skill.linked }),
            ...(skill.synced && { synced: skill.synced }),
          },
          transcripts.start,
        ),
      ),
    ]),
  };
}

function pluginInstallation(
  plugin: PluginRecord,
  usageOf: (inPeriod: UsageTally | null, counterKey: string | null) => Usage,
  transcripts: TranscriptUsage,
): Omit<Plugin, "usageStatus" | "recommended"> {
  const components = (plugin.components === "unknown" ? [] : plugin.components).map(
    (component): Component => ({
      ...component,
      ...usageOf(
        transcripts.ledger?.component(component) ?? null,
        COUNTED_BY_SKILL_USAGE.has(component.kind) ? component.name : null,
      ),
    }),
  );
  let uses: number | Unknown = transcripts.ledger === null || plugin.components === "unknown" ? "unknown" : 0;
  for (const component of components) {
    uses = uses === "unknown" || component.uses === "unknown" ? "unknown" : uses + component.uses;
  }
  return {
    kind: "plugin",
    name: plugin.key,
    installedAt: plugin.installedAt,
    enabled: plugin.enabled,
    hooks: plugin.hooks,
    uses,
    lastUse:
      plugin.components === "unknown"
        ? "unknown"
        : latestLastUse(
            components.map((component) => component.lastUse),
            transcripts.status.status === "readable" ? transcripts.start : null,
          ),
    components,
  };
}

// An unknown last Use is never inside the covered period, since fully readable transcripts would
// have shown it, so it can only be ignored next to a known last Use that falls inside the period.
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

interface TranscriptUsage {
  status: ReadStatus;
  start: Date | null;
  ledger: UsageLedger | null;
}

async function readTranscriptUsage(configDir: string, ledger: UsageLedger): Promise<TranscriptUsage> {
  let files: string[];
  try {
    files = await findTranscripts(configDir);
  } catch {
    return { status: unreadable("transcripts folder could not be read"), start: null, ledger: null };
  }

  let start: Date | null = null;
  let skippedLines = 0;
  let unreadableFiles = 0;

  for (const file of files) {
    try {
      for await (const line of readTranscript(file, () => skippedLines++)) {
        const at = lineTimestamp(line);
        if (at !== null && (start === null || at < start)) start = at;
        for (const use of usesIn(line)) ledger.record(use);
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
  return { status, start, ledger };
}
