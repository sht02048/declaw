import { dirname, join } from "node:path";
import { findStandaloneSkills } from "./inventory.js";
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
  const transcripts = await readTranscriptUsage(configDir, new Set(skills.map((skill) => skill.name)));
  const counter = await readSkillUsageCounter(configFile);

  return {
    period: { start: transcripts.start, end: now },
    sources: { transcripts: transcripts.status, skillUsageCounter: counter.status },
    installations: skills.map((skill) => {
      const inPeriod = transcripts.usage?.get(skill.name) ?? null;
      return {
        kind: "standalone-skill",
        name: skill.name,
        uses: inPeriod?.uses ?? "unknown",
        lastUse: lastUseOf(skill.name, inPeriod, counter),
        ...(skill.linked && { linked: skill.linked }),
        ...(skill.synced && { synced: skill.synced }),
      };
    }),
  };
}

interface InPeriodUsage {
  uses: number;
  lastUse: Date | null;
}

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
