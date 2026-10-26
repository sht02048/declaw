import { dirname, join } from "node:path";
import { findStandaloneSkills } from "./inventory.js";
import { partiallyReadable, readable, type ReadStatus } from "./read-status.js";
import { readSkillUsageCounter } from "./skill-usage.js";
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
  uses: number;
  lastUse: Date | null | Unknown;
}

export type Installation = StandaloneSkill;

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

  const counter = await readSkillUsageCounter(configFile);
  const counterReadable = counter.status.status !== "unreadable";

  return {
    period: { start, end: now },
    sources: {
      transcripts:
        skippedLines === 0
          ? readable
          : partiallyReadable(
              `${skippedLines} unparsable transcript ${skippedLines === 1 ? "line" : "lines"} skipped`,
            ),
      skillUsageCounter: counter.status,
    },
    installations: skills.map((skill) => {
      const { uses, lastUse } = usage.get(skill.name)!;
      return {
        kind: "standalone-skill",
        name: skill.name,
        uses,
        lastUse: counterReadable
          ? later(lastUse, counter.lastUses.get(skill.name) ?? null)
          : (lastUse ?? "unknown"),
      };
    }),
  };
}

function later(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}
