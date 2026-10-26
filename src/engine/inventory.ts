import type { Dirent } from "node:fs";
import { readlink, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { listDir } from "./fs.js";

const SYNCED_SKILLS_DIR = "synced";

export interface StandaloneSkillEntry {
  name: string;
  path: string;
  linked?: { target: string };
}

export async function findStandaloneSkills(configDir: string): Promise<StandaloneSkillEntry[]> {
  const skillsDir = join(configDir, "skills");
  const skills: StandaloneSkillEntry[] = [];
  for (const entry of await listDir(skillsDir)) {
    if (entry.name === SYNCED_SKILLS_DIR) continue;
    const path = join(skillsDir, entry.name);
    if (entry.isDirectory()) {
      skills.push({ name: entry.name, path });
    } else if (await isLinkToFolder(entry, path)) {
      const target = resolve(skillsDir, await readlink(path));
      skills.push({ name: entry.name, path, linked: { target } });
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function isLinkToFolder(entry: Dirent, path: string): Promise<boolean> {
  if (!entry.isSymbolicLink()) return false;
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
