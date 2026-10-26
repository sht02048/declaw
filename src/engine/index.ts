import { dirname, join } from "node:path";
import { findStandaloneSkills } from "./inventory.js";
import { partiallyReadable, readable, type ReadStatus } from "./read-status.js";
import { readSkillLastUses } from "./skill-usage.js";
import { findMainTranscripts, readTranscript } from "./transcripts.js";
import { entryTimestamp, usesIn } from "./uses.js";

export interface ReportOptions {
  configDir: string;
  configFile?: string;
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

export type Installation = StandaloneSkill;

export type { ReadStatus } from "./read-status.js";

export interface DataSources {
  transcripts: ReadStatus;
  skillUsageCounter: ReadStatus;
}

export interface Report {
  period: CoveredPeriod;
  sources: DataSources;
  installations: Installation[];
}

export async function report({
  configDir,
  configFile = join(dirname(configDir), ".claude.json"),
  now,
}: ReportOptions): Promise<Report> {
  const skills = await findStandaloneSkills(configDir);
  const usage = new Map<string, { uses: number; lastUse: Date | null }>();
  for (const skill of skills) usage.set(skill.name, { uses: 0, lastUse: null });
  let start: Date | null = null;
  let skippedLines = 0;

  for (const file of await findMainTranscripts(configDir)) {
    for await (const entry of readTranscript(file, () => skippedLines++)) {
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

  const skillLastUses = await readSkillLastUses(configFile);
  for (const [name, stats] of usage) {
    const counted = skillLastUses.get(name);
    if (counted && (stats.lastUse === null || counted > stats.lastUse)) stats.lastUse = counted;
  }

  return {
    period: { start, end: now },
    sources: {
      transcripts:
        skippedLines === 0
          ? readable
          : partiallyReadable(
              `${skippedLines} unparsable transcript ${skippedLines === 1 ? "line" : "lines"} skipped`,
            ),
      skillUsageCounter: readable,
    },
    installations: skills.map((skill) => ({
      kind: "standalone-skill",
      name: skill.name,
      ...usage.get(skill.name)!,
    })),
  };
}
