import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { onTestFinished } from "vitest";

export type TranscriptLine = Record<string, unknown>;

export interface TranscriptLocation {
  project: string;
  session: string;
}

export interface PluginFixture {
  scope?: "user" | "project" | "local";
  version?: string;
  installedAt?: string;
  manifest?: JsonObject | null;
  skills?: string[];
  commands?: string[];
  agents?: string[];
  mcpServers?: JsonObject;
}

type JsonObject = Record<string, unknown>;

export class FakeConfigDir {
  private readonly installRecords: Record<string, JsonObject[]> = {};

  constructor(readonly path: string) {}

  async plugin(key: string, fixture: PluginFixture = {}): Promise<this> {
    const [name, marketplace] = key.split("@") as [string, string];
    const version = fixture.version ?? "1.0.0";
    const installPath = join(this.path, "plugins", "cache", marketplace, name, version);
    await mkdir(installPath, { recursive: true });
    const manifest = fixture.manifest === undefined ? { name } : fixture.manifest;
    if (manifest !== null) {
      await writeJson(join(installPath, ".claude-plugin", "plugin.json"), manifest);
    }
    for (const skill of fixture.skills ?? []) {
      await writeSkillFolder(join(installPath, "skills", skill), skill);
    }
    for (const command of fixture.commands ?? []) {
      await writeMarkdown(join(installPath, "commands", `${command}.md`), command);
    }
    for (const agent of fixture.agents ?? []) {
      await writeMarkdown(join(installPath, "agents", `${agent}.md`), agent);
    }
    if (fixture.mcpServers) {
      await writeJson(join(installPath, ".mcp.json"), { mcpServers: fixture.mcpServers });
    }

    const scope = fixture.scope ?? "user";
    const installedAt = fixture.installedAt ?? "2026-09-01T00:00:00.000Z";
    (this.installRecords[key] ??= []).push({
      scope,
      ...(scope === "user" ? {} : { projectPath: "/work/app" }),
      installPath,
      version,
      installedAt,
      lastUpdated: installedAt,
    });
    await writeJson(join(this.path, "plugins", "installed_plugins.json"), {
      version: 2,
      plugins: this.installRecords,
    });
    return this;
  }

  async enabledPlugins(enabledPlugins: Record<string, boolean>): Promise<this> {
    await writeJson(join(this.path, "settings.json"), { enabledPlugins });
    return this;
  }

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

async function writeMarkdown(file: string, name: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `---\nname: ${name}\ndescription: ${name}\n---\n\nDo the ${name} thing.\n`);
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2));
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
