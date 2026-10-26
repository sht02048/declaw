import { readable, readJsonFile, unreadable, type ReadStatus } from "./read-status.js";

export type SkillLastUses = Map<string, Date>;

export interface SkillUsageCounterRead {
  status: ReadStatus;
  lastUses: SkillLastUses;
}

export async function readSkillUsageCounter(configFile: string): Promise<SkillUsageCounterRead> {
  const lastUses: SkillLastUses = new Map();
  const file = await readJsonFile(configFile, "config file");
  if (!file.ok) return { status: file.status, lastUses };

  const counter = (file.value as { skillUsage?: unknown } | null)?.skillUsage;
  if (counter === undefined) return { status: readable, lastUses };
  if (typeof counter !== "object" || counter === null || Array.isArray(counter)) {
    return { status: unreadable("skillUsage in config file is not an object"), lastUses };
  }
  for (const [skill, record] of Object.entries(counter)) {
    const lastUsedAt = (record as { lastUsedAt?: unknown } | null)?.lastUsedAt;
    if (typeof lastUsedAt === "number") lastUses.set(skill, new Date(lastUsedAt));
  }
  return { status: readable, lastUses };
}
