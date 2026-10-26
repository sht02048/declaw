import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative as relativePath } from "node:path";
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
  hooks?: JsonObject;
  files?: Record<string, string>;
  marketplaceEntry?: JsonObject;
}

type JsonObject = Record<string, unknown>;

export class FakeConfigDir {
  private readonly installRecords: Record<string, JsonObject[]> = {};
  private readonly marketplaceEntries: Record<string, JsonObject[]> = {};

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

  async enabledPlugins(enabledPlugins: Record<string, boolean>): Promise<this> {
    await writeJson(join(this.path, "settings.json"), { enabledPlugins });
    return this;
  }

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
