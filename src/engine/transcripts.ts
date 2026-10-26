import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { listDir } from "./fs.js";

export type TranscriptEntry = Record<string, unknown>;

export async function findTranscripts(configDir: string): Promise<string[]> {
  const projectsDir = join(configDir, "projects");
  const files: string[] = [];
  for (const project of await listDir(projectsDir)) {
    if (!project.isDirectory()) continue;
    const projectDir = join(projectsDir, project.name);
    for (const session of await listDir(projectDir)) {
      if (session.isFile() && session.name.endsWith(".jsonl")) {
        files.push(join(projectDir, session.name));
      } else if (session.isDirectory()) {
        files.push(...(await jsonlFilesIn(join(projectDir, session.name, "subagents"))));
      }
    }
  }
  return files;
}

async function jsonlFilesIn(dir: string): Promise<string[]> {
  return (await listDir(dir))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(dir, entry.name));
}

export async function* readTranscript(file: string): AsyncGenerator<TranscriptEntry> {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === "") continue;
    yield JSON.parse(line) as TranscriptEntry;
  }
}
