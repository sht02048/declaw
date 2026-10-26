import { partiallyReadable, readable, readJsonFile, unreadable, type ReadStatus } from "./read-status.js";

export type SkillLastUses = Map<string, Date>;

export interface SkillUsageCounterRead {
  status: ReadStatus;
  lastUses: SkillLastUses;
  skippedSkills: Set<string>;
}

export async function readSkillUsageCounter(configFile: string): Promise<SkillUsageCounterRead> {
  const lastUses: SkillLastUses = new Map();
  const skippedSkills = new Set<string>();
  const file = await readJsonFile(configFile, "config file");
  if (!file.ok) return { status: file.status, lastUses, skippedSkills };

  if (!isRecord(file.value)) {
    return { status: unreadable("config file is not a JSON object"), lastUses, skippedSkills };
  }
  const counter = file.value.skillUsage;
  if (counter === undefined) return { status: readable, lastUses, skippedSkills };
  if (!isRecord(counter)) {
    return {
      status: unreadable("skillUsage in config file is not an object"),
      lastUses,
      skippedSkills,
    };
  }
  for (const [skill, record] of Object.entries(counter)) {
    const lastUsedAt = (record as { lastUsedAt?: unknown } | null)?.lastUsedAt;
    const at = typeof lastUsedAt === "number" ? new Date(lastUsedAt) : null;
    if (at !== null && !Number.isNaN(at.getTime())) lastUses.set(skill, at);
    else skippedSkills.add(skill);
  }
  const skipped = skippedSkills.size;
  const status =
    skipped === 0
      ? readable
      : partiallyReadable(`${skipped} unreadable skillUsage ${skipped === 1 ? "record" : "records"} skipped`);
  return { status, lastUses, skippedSkills };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
