import { join } from "node:path";
import { listDir } from "./fs.js";

const SYNCED_SKILLS_DIR = "synced";

export interface StandaloneSkillEntry {
  name: string;
  path: string;
}

export async function findStandaloneSkills(configDir: string): Promise<StandaloneSkillEntry[]> {
  const skillsDir = join(configDir, "skills");
  const entries = await listDir(skillsDir);
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== SYNCED_SKILLS_DIR)
    .map((entry) => ({ name: entry.name, path: join(skillsDir, entry.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
