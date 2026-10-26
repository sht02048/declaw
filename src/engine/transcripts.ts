import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

export type TranscriptEntry = Record<string, unknown>;

export async function findMainTranscripts(configDir: string): Promise<string[]> {
  const projectsDir = join(configDir, "projects");
  const projects = await readdir(projectsDir, { withFileTypes: true });
  const files: string[] = [];
  for (const project of projects.filter((entry) => entry.isDirectory())) {
    const projectDir = join(projectsDir, project.name);
    const sessions = await readdir(projectDir, { withFileTypes: true });
    for (const session of sessions) {
      if (session.isFile() && session.name.endsWith(".jsonl")) {
        files.push(join(projectDir, session.name));
      }
    }
  }
  return files;
}

export async function* readTranscript(file: string): AsyncGenerator<TranscriptEntry> {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === "") continue;
    yield JSON.parse(line) as TranscriptEntry;
  }
}
