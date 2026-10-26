import { readFile } from "node:fs/promises";

export type SkillLastUses = Map<string, Date>;

export async function readSkillLastUses(configFile: string): Promise<SkillLastUses> {
  const config = JSON.parse(await readFile(configFile, "utf8")) as { skillUsage?: unknown };
  const lastUses: SkillLastUses = new Map();
  const counter = config.skillUsage;
  if (typeof counter !== "object" || counter === null) return lastUses;
  for (const [skill, record] of Object.entries(counter)) {
    const lastUsedAt = (record as { lastUsedAt?: unknown } | null)?.lastUsedAt;
    if (typeof lastUsedAt === "number") lastUses.set(skill, new Date(lastUsedAt));
  }
  return lastUses;
}
