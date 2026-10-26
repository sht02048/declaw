import { lutimes, mkdir, mkdtemp, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
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

export interface PluginFixture {
  scope?: "user" | "project" | "local";
  version?: string;
  installedAt?: string;
  manifest?: JsonObject | null;
  skills?: string[];
  commands?: string[];
  agents?: string[];
  mcpServers?: JsonObject;
  hooks?: JsonObject;
  files?: Record<string, string>;
  marketplaceEntry?: JsonObject;
}

type JsonObject = Record<string, unknown>;

export class FakeConfigDir {
  private readonly installRecords: Record<string, JsonObject[]> = {};
  private readonly marketplaceEntries: Record<string, JsonObject[]> = {};

  constructor(
    readonly path: string,
    readonly configFile: string,
  ) {}

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
    if (fixture.hooks) {
      await writeJson(join(installPath, "hooks", "hooks.json"), { hooks: fixture.hooks });
    }
    for (const [relativePath, content] of Object.entries(fixture.files ?? {})) {
      const file = join(installPath, relativePath);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
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

    const entries = (this.marketplaceEntries[marketplace] ??= []);
    if (!entries.some((entry) => entry.name === name)) {
      entries.push({ name, source: `./plugins/${name}`, ...fixture.marketplaceEntry });
    }
    await this.writeMarketplaces();
    return this;
  }

  private async writeMarketplaces(): Promise<void> {
    const known: JsonObject = {};
    for (const [marketplace, plugins] of Object.entries(this.marketplaceEntries)) {
      const installLocation = join(this.path, "plugins", "marketplaces", marketplace);
      await writeJson(join(installLocation, ".claude-plugin", "marketplace.json"), {
        name: marketplace,
        owner: { name: "Marketplace Owner" },
        plugins,
      });
      known[marketplace] = {
        source: { source: "git", url: `https://github.com/example/${marketplace}.git` },
        installLocation,
        lastUpdated: "2026-09-01T00:00:00.000Z",
      };
    }
    await writeJson(join(this.path, "plugins", "known_marketplaces.json"), known);
  }

  get installRecordsFile(): string {
    return join(this.path, "plugins", "installed_plugins.json");
  }

  async removeInstallRecords(): Promise<this> {
    await rm(this.installRecordsFile);
    return this;
  }

  async corruptInstallRecords(): Promise<this> {
    const records = JSON.stringify({ version: 2, plugins: this.installRecords });
    await writeFile(this.installRecordsFile, records.slice(0, records.length / 2));
    return this;
  }

  async enabledPlugins(enabledPlugins: Record<string, boolean>): Promise<this> {
    await writeJson(join(this.path, "settings.json"), { enabledPlugins });
    return this;
  }

  get paths(): { configDir: string; configFile: string } {
    return { configDir: this.path, configFile: this.configFile };
  }

  get home(): string {
    return dirname(this.path);
  }

  async standaloneSkill(name: string, { createdAt = DEFAULT_CREATED_AT } = {}): Promise<this> {
    const dir = join(this.path, "skills", name);
    await writeSkillFolder(dir, name);
    await backdate(dir, createdAt);
    return this;
  }

  async skillsFolderFile(name: string, content = ""): Promise<this> {
    const skillsDir = join(this.path, "skills");
    await mkdir(skillsDir, { recursive: true });
    await writeFile(join(skillsDir, name), content);
    return this;
  }

  async skillsFolderDir(name: string, files: Record<string, string> = {}): Promise<this> {
    const dir = join(this.path, "skills", name);
    await mkdir(dir, { recursive: true });
    for (const [file, content] of Object.entries(files)) await writeFile(join(dir, file), content);
    return this;
  }

  async linkedSkill(
    name: string,
    {
      target = join(this.home, ".agents", "skills", name),
      relative = false,
      createdAt = DEFAULT_CREATED_AT,
      targetCreatedAt = DEFAULT_CREATED_AT,
    } = {},
  ): Promise<this> {
    await writeSkillFolder(target, name);
    await backdate(target, targetCreatedAt);
    const skillsDir = join(this.path, "skills");
    await mkdir(skillsDir, { recursive: true });
    const link = join(skillsDir, name);
    await symlink(relative ? relativePath(skillsDir, target) : target, link);
    await lutimes(link, new Date(createdAt), new Date(createdAt));
    return this;
  }

  async syncedSkill(
    name: string,
    account = "org_account",
    { createdAt = DEFAULT_CREATED_AT } = {},
  ): Promise<this> {
    const accountDir = join(this.path, "skills", "synced", account);
    const dir = join(accountDir, name);
    await writeSkillFolder(dir, name);
    await backdate(dir, createdAt);
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

  async subagentTranscript(
    { project, session, agentId }: TranscriptLocation & { agentId: string },
    lines: TranscriptLine[],
  ): Promise<this> {
    const file = join(
      this.path,
      "projects",
      encodeProjectDir(project),
      session,
      "subagents",
      `agent-${agentId}.jsonl`,
    );
    await mkdir(dirname(file), { recursive: true });
    const agentLines = lines.map((line) => ({
      ...line,
      sessionId: session,
      cwd: project,
      agentId,
      isSidechain: true,
    }));
    await writeFile(file, agentLines.map((line) => JSON.stringify(line)).join("\n") + "\n");
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
  await writeJson(join(path, "plugins", "installed_plugins.json"), { version: 2, plugins: {} });
  return new FakeConfigDir(path, configFile);
}

export const SENSITIVE_CONFIG_FILE_KEYS = {
  oauthAccount: { accountUuid: "fake-account-uuid", emailAddress: "fake@example.com" },
  userID: "fake-user-id",
  machineID: "fake-machine-id",
  mcpServers: { secret: { type: "http", url: "https://fake.example.com/mcp?token=fake-token" } },
};

const DEFAULT_CREATED_AT = "2026-09-01T00:00:00.000Z";

async function backdate(path: string, createdAt: string): Promise<void> {
  const at = new Date(createdAt);
  await utimes(path, at, at);
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

export function slashCommand(
  name: string,
  timestamp: string,
  { args }: { args?: string } = {},
): TranscriptLine {
  const tags = [
    `<command-message>${name}</command-message>`,
    `<command-name>/${name}</command-name>`,
    ...(args === undefined ? [] : [`<command-args>${args}</command-args>`]),
  ];
  return userPrompt(tags.join("\n"), timestamp);
}

export function hookRun(
  hookEvent: string,
  timestamp: string,
  {
    type = "hook_success",
    command = "node ./hook.cjs",
    content,
  }: { type?: string; command?: string; content?: string } = {},
): TranscriptLine {
  return {
    type: "attachment",
    timestamp,
    attachment: {
      type,
      hookName: `${hookEvent}:startup`,
      hookEvent,
      command,
      exitCode: 0,
      ...(content === undefined ? {} : { content }),
    },
  };
}

export function stopHookSummary(timestamp: string, command: string): TranscriptLine {
  return {
    type: "system",
    subtype: "stop_hook_summary",
    timestamp,
    hookCount: 1,
    hookInfos: [{ command }],
    hookErrors: [],
    preventedContinuation: false,
  };
}

export function mcpToolCall(toolName: string, timestamp: string): TranscriptLine {
  toolUseCounter += 1;
  return {
    type: "assistant",
    timestamp,
    isSidechain: false,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: `toolu_${toolUseCounter}`, name: toolName, input: {} }],
    },
  };
}

export function agentToolCall(
  subagentType: string,
  timestamp: string,
  { tool = "Agent" }: { tool?: "Agent" | "Task" } = {},
): TranscriptLine {
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
          name: tool,
          input: {
            subagent_type: subagentType,
            description: `Run ${subagentType}`,
            prompt: "Do the delegated work.",
          },
        },
      ],
    },
  };
}
