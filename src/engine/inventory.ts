import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface StandaloneSkillEntry {
  name: string;
  path: string;
}

export async function findStandaloneSkills(configDir: string): Promise<StandaloneSkillEntry[]> {
  const skillsDir = join(configDir, "skills");
  const entries = await readdir(skillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: join(skillsDir, entry.name) }));
}
