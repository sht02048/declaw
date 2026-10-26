import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
    await writeSkillFolder(join(this.path, "skills", name), name);
    return this;
  }

  async linkedSkill(name: string): Promise<this> {
    const target = join(dirname(this.path), ".agents", "skills", name);
    await writeSkillFolder(target, name);
    await mkdir(join(this.path, "skills"), { recursive: true });
    await symlink(target, join(this.path, "skills", name));
    return this;
  }

  async syncedSkill(name: string, account = "org_account"): Promise<this> {
    const accountDir = join(this.path, "skills", "synced", account);
    await writeSkillFolder(join(accountDir, name), name);
    await writeFile(join(accountDir, "manifest.json"), JSON.stringify({ skills: [name] }));
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
  const root = await mkdtemp(join(tmpdir(), "declaw-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const path = join(root, ".claude");
  await mkdir(path);
  return new FakeConfigDir(path);
}

async function writeSkillFolder(dir: string, name: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n\nDo the ${name} thing.\n`,
  );
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
