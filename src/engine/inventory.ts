import type { Dirent } from "node:fs";
import { lstat, readlink, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { listDir } from "./fs.js";

const SYNCED_SKILLS_DIR = "synced";
const SYNCED_SKILLS_NAMESPACE = "anthropic-skills";

export interface StandaloneSkillEntry {
  name: string;
  path: string;
  createdAt: Date;
  linked?: { target: string };
  synced?: true;
}

export async function findStandaloneSkills(configDir: string): Promise<StandaloneSkillEntry[]> {
  const skillsDir = join(configDir, "skills");
  const skills: StandaloneSkillEntry[] = [];
  for (const entry of await listDir(skillsDir)) {
    if (entry.name === SYNCED_SKILLS_DIR) continue;
    const path = join(skillsDir, entry.name);
    if (entry.isDirectory()) {
      skills.push({ name: entry.name, path, createdAt: await createdAt(path) });
    } else if (await isLinkToFolder(entry, path)) {
      const target = resolve(skillsDir, await readlink(path));
      skills.push({ name: entry.name, path, createdAt: await createdAt(path), linked: { target } });
    }
  }
  skills.push(...(await findSyncedSkills(join(skillsDir, SYNCED_SKILLS_DIR))));
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function findSyncedSkills(syncedDir: string): Promise<StandaloneSkillEntry[]> {
  const skills: StandaloneSkillEntry[] = [];
  for (const account of await listDir(syncedDir)) {
    if (!account.isDirectory()) continue;
    const accountDir = join(syncedDir, account.name);
    for (const entry of await listDir(accountDir)) {
      if (!entry.isDirectory()) continue;
      const path = join(accountDir, entry.name);
      skills.push({
        name: `${SYNCED_SKILLS_NAMESPACE}:${entry.name}`,
        path,
        createdAt: await createdAt(path),
        synced: true,
      });
    }
  }
  return skills;
}

async function createdAt(path: string): Promise<Date> {
  const { birthtimeMs, mtimeMs } = await lstat(path);
  // Some Linux filesystems report no birth time (0), and a copy that preserved
  // times can carry an mtime older than its birth time; the earlier one wins.
  return new Date(birthtimeMs > 0 ? Math.min(birthtimeMs, mtimeMs) : mtimeMs);
}

async function isLinkToFolder(entry: Dirent, path: string): Promise<boolean> {
  if (!entry.isSymbolicLink()) return false;
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
