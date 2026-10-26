import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative as relativePath } from "node:path";
import { onTestFinished } from "vitest";

export type TranscriptLine = Record<string, unknown>;

export interface TranscriptLocation {
  project: string;
  session: string;
}

export interface FakeConfigDirOptions {
  configFileInConfigDir?: boolean;
}

export class FakeConfigDir {
  constructor(
    readonly path: string,
    readonly configFile: string,
  ) {}

  get home(): string {
    return dirname(this.path);
  }

  async standaloneSkill(name: string): Promise<this> {
    await writeSkillFolder(join(this.path, "skills", name), name);
    return this;
  }

  async linkedSkill(
    name: string,
    { target = join(this.home, ".agents", "skills", name), relative = false } = {},
  ): Promise<this> {
    await writeSkillFolder(target, name);
    const skillsDir = join(this.path, "skills");
    await mkdir(skillsDir, { recursive: true });
    await symlink(relative ? relativePath(skillsDir, target) : target, join(skillsDir, name));
    return this;
  }

  async syncedSkill(name: string, account = "org_account"): Promise<this> {
    const accountDir = join(this.path, "skills", "synced", account);
    await writeSkillFolder(join(accountDir, name), name);
    await writeFile(join(accountDir, "manifest.json"), JSON.stringify({ skills: [name] }));
    return this;
  }

  async skillUsage(skill: string, lastUsedAt: string, usageCount = 1): Promise<this> {
    const config = JSON.parse(await readFile(this.configFile, "utf8"));
    config.skillUsage = {
      ...config.skillUsage,
      [skill]: { usageCount, lastUsedAt: new Date(lastUsedAt).getTime() },
    };
    await writeFile(this.configFile, JSON.stringify(config));
    return this;
  }

  async corruptConfigFile(): Promise<this> {
    const config = JSON.stringify({ ...SENSITIVE_CONFIG_FILE_KEYS, skillUsage: {} });
    await writeFile(this.configFile, config.slice(0, config.length / 2));
    return this;
  }

  async removeConfigFile(): Promise<this> {
    await rm(this.configFile);
    return this;
  }

  async pluginUsage(plugin: string, lastUsedAt: string, usageCount = 1): Promise<this> {
    const config = JSON.parse(await readFile(this.configFile, "utf8"));
    config.pluginUsage = {
      ...config.pluginUsage,
      [plugin]: { usageCount, lastUsedAt: new Date(lastUsedAt).getTime() },
    };
    await writeFile(this.configFile, JSON.stringify(config));
    return this;
  }

  async transcript(
    { project, session }: TranscriptLocation,
    lines: (TranscriptLine | string)[],
  ): Promise<this> {
    const file = join(this.path, "projects", encodeProjectDir(project), `${session}.jsonl`);
    await mkdir(dirname(file), { recursive: true });
    const text = lines.map((line) =>
      typeof line === "string" ? line : JSON.stringify({ sessionId: session, cwd: project, ...line }),
    );
    await writeFile(file, text.join("\n") + "\n");
    return this;
  }
}

export async function fakeConfigDir(options: FakeConfigDirOptions = {}): Promise<FakeConfigDir> {
  const root = await mkdtemp(join(tmpdir(), "declaw-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const path = join(root, ".claude");
  await mkdir(path);
  const configFile = join(options.configFileInConfigDir ? path : root, ".claude.json");
  await writeFile(configFile, JSON.stringify(SENSITIVE_CONFIG_FILE_KEYS));
  return new FakeConfigDir(path, configFile);
}

export const SENSITIVE_CONFIG_FILE_KEYS = {
  oauthAccount: { accountUuid: "fake-account-uuid", emailAddress: "fake@example.com" },
  userID: "fake-user-id",
  machineID: "fake-machine-id",
  mcpServers: { secret: { type: "http", url: "https://fake.example.com/mcp?token=fake-token" } },
};

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
