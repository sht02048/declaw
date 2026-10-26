import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { onTestFinished } from "vitest";

export type TranscriptLine = Record<string, unknown>;

export interface TranscriptLocation {
  project: string;
  session: string;
}

export class FakeConfigDir {
  constructor(readonly path: string) {}

  async standaloneSkill(name: string): Promise<this> {
    const dir = join(this.path, "skills", name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${name} skill\n---\n\nDo the ${name} thing.\n`,
    );
    return this;
  }

  async transcript(
    { project, session }: TranscriptLocation,
    lines: TranscriptLine[],
  ): Promise<this> {
    const file = join(this.path, "projects", encodeProjectDir(project), `${session}.jsonl`);
    await mkdir(dirname(file), { recursive: true });
    const sessionLines = lines.map((line) => ({ sessionId: session, cwd: project, ...line }));
    await writeFile(file, sessionLines.map((line) => JSON.stringify(line)).join("\n") + "\n");
    return this;
  }
}

export async function fakeConfigDir(): Promise<FakeConfigDir> {
  const path = await mkdtemp(join(tmpdir(), "declaw-config-"));
  onTestFinished(() => rm(path, { recursive: true, force: true }));
  return new FakeConfigDir(path);
}

function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

let toolUseCounter = 0;

export function skillToolCall(skill: string, timestamp: string): TranscriptLine {
  toolUseCounter += 1;
  return {
    type: "assistant",
    timestamp,
    isSidechain: false,
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: `toolu_${toolUseCounter}`,
          name: "Skill",
          input: { skill },
        },
      ],
    },
  };
}

export function userPrompt(text: string, timestamp: string): TranscriptLine {
  return {
    type: "user",
    timestamp,
    isSidechain: false,
    message: { role: "user", content: text },
    origin: { kind: "human" },
  };
}

export function hookRun(hookEvent: string, timestamp: string): TranscriptLine {
  return {
    type: "attachment",
    timestamp,
    attachment: {
      type: "hook_success",
      hookName: `${hookEvent}:startup`,
      hookEvent,
      command: "node ./hook.cjs",
      exitCode: 0,
    },
  };
}
