import { plural } from "../plural.js";
import {
  isJsonObject,
  partiallyReadable,
  readable,
  readJsonFile,
  unreadable,
  type ReadStatus,
  type Unknown,
} from "./read-status.js";

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

  if (!isJsonObject(file.value)) {
    return { status: unreadable("config file is not a JSON object"), lastUses, skippedSkills };
  }
  const counter = file.value.skillUsage;
  if (counter === undefined) return { status: readable, lastUses, skippedSkills };
  if (!isJsonObject(counter)) {
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
      : partiallyReadable(`${skipped} unreadable skillUsage ${plural(skipped, "record")} skipped`);
  return { status, lastUses, skippedSkills };
}

export function lastUseOf(
  name: string,
  inPeriod: { lastUse: Date | null } | null,
  counter: SkillUsageCounterRead,
): Date | null | Unknown {
  const counterKnows = counter.status.status !== "unreadable" && !counter.skippedSkills.has(name);
  if (counterKnows) {
    if (inPeriod === null) return counter.lastUses.get(name) ?? "unknown";
    return later(inPeriod.lastUse, counter.lastUses.get(name) ?? null);
  }
  return inPeriod?.lastUse ?? "unknown";
}

export function later(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}
