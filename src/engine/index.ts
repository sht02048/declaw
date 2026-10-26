import { findStandaloneSkills } from "./inventory.js";
import { findPlugins } from "./plugins.js";
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
}

export interface Plugin {
  kind: "plugin";
  name: string;
  enabled: boolean;
  uses: number;
  lastUse: Date | null;
}

export type Installation = Plugin | StandaloneSkill;

export interface Report {
  period: CoveredPeriod;
  installations: Installation[];
}

export async function report({ configDir, now }: ReportOptions): Promise<Report> {
  const plugins = await findPlugins(configDir);
  const skills = await findStandaloneSkills(configDir);
  const usage = new Map<string, { uses: number; lastUse: Date | null }>();
  for (const skill of skills) usage.set(skill.name, { uses: 0, lastUse: null });
  let start: Date | null = null;

  for (const file of await findMainTranscripts(configDir)) {
    for await (const entry of readTranscript(file)) {
      const at = entryTimestamp(entry);
      if (at !== null && (start === null || at < start)) start = at;
      for (const use of usesIn(entry)) {
        const stats = usage.get(use.name);
        if (!stats) continue;
        stats.uses += 1;
        if (stats.lastUse === null || use.at > stats.lastUse) stats.lastUse = use.at;
      }
    }
  }

  return {
    period: { start, end: now },
    installations: [
      ...plugins.map((plugin): Plugin => ({
        kind: "plugin",
        name: plugin.key,
        enabled: plugin.enabled,
        uses: 0,
        lastUse: null,
      })),
      ...skills.map((skill): StandaloneSkill => ({
        kind: "standalone-skill",
        name: skill.name,
        ...usage.get(skill.name)!,
      })),
    ],
  };
}
