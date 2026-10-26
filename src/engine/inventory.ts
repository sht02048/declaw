import { lstat, readlink, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isSkillFolder, listDir } from "./fs.js";

const SYNCED_SKILLS_DIR = "synced";
const SYNCED_SKILLS_NAMESPACE = "anthropic-skills";

export interface StandaloneSkillRecord {
  name: string;
  path: string;
  createdAt: Date;
  linked?: { target: string; broken?: true };
  synced?: true;
}

export async function findStandaloneSkills(configDir: string): Promise<StandaloneSkillRecord[]> {
  const skillsDir = join(configDir, "skills");
  const skills: StandaloneSkillRecord[] = [];
  for (const dirent of await listDir(skillsDir)) {
    if (dirent.name === SYNCED_SKILLS_DIR || dirent.name.startsWith(".")) continue;
    const path = join(skillsDir, dirent.name);
    if (dirent.isDirectory()) {
      if (!(await isSkillFolder(path))) continue;
      skills.push({ name: dirent.name, path, createdAt: await createdAt(path) });
    } else if (dirent.isSymbolicLink()) {
      const linkTo = await linkTargetOf(path);
      if (linkTo === "not a skill") continue;
      const target = resolve(skillsDir, await readlink(path));
      const linked = linkTo === "missing" ? { target, broken: true as const } : { target };
      skills.push({ name: dirent.name, path, createdAt: await createdAt(path), linked });
    }
  }
  skills.push(...(await findSyncedSkills(join(skillsDir, SYNCED_SKILLS_DIR))));
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

async function findSyncedSkills(syncedDir: string): Promise<StandaloneSkillRecord[]> {
  const skills: StandaloneSkillRecord[] = [];
  for (const account of await listDir(syncedDir)) {
    if (!account.isDirectory()) continue;
    const accountDir = join(syncedDir, account.name);
    for (const dirent of await listDir(accountDir)) {
      const path = join(accountDir, dirent.name);
      if (!dirent.isDirectory() || !(await isSkillFolder(path))) continue;
      skills.push({
        name: `${SYNCED_SKILLS_NAMESPACE}:${dirent.name}`,
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
  // A copy that preserved times carries an old mtime, so mtime is only a stand-in
  // on filesystems that report no birth time (0).
  return new Date(birthtimeMs > 0 ? birthtimeMs : mtimeMs);
}

async function linkTargetOf(link: string): Promise<"skill" | "missing" | "not a skill"> {
  try {
    return (await stat(link)).isDirectory() && (await isSkillFolder(link)) ? "skill" : "not a skill";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP" ? "missing" : "not a skill";
  }
}
