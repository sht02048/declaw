import { findStandaloneSkills } from "./inventory.js";
import { findMainTranscripts, readTranscript } from "./transcripts.js";
import { usesIn } from "./uses.js";

export interface ReportOptions {
  configDir: string;
  now: Date;
}

export interface StandaloneSkill {
  kind: "standalone-skill";
  name: string;
  uses: number;
  lastUse: Date | null;
}

export type Installation = StandaloneSkill;

export interface Report {
  installations: Installation[];
}

export async function report({ configDir }: ReportOptions): Promise<Report> {
  const skills = await findStandaloneSkills(configDir);
  const usage = new Map<string, { uses: number; lastUse: Date | null }>();
  for (const skill of skills) usage.set(skill.name, { uses: 0, lastUse: null });

  for (const file of await findMainTranscripts(configDir)) {
    for await (const entry of readTranscript(file)) {
      for (const use of usesIn(entry)) {
        const stats = usage.get(use.name);
        if (!stats) continue;
        stats.uses += 1;
        if (stats.lastUse === null || use.at > stats.lastUse) stats.lastUse = use.at;
      }
    }
  }

  return {
    installations: skills.map((skill) => ({
      kind: "standalone-skill",
      name: skill.name,
      ...usage.get(skill.name)!,
    })),
  };
}
