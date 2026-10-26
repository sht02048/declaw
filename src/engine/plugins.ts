import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { listDir } from "./fs.js";

type JsonObject = Record<string, unknown>;

export type ComponentKind = "skill" | "command" | "agent" | "mcp-server";

export interface ComponentEntry {
  kind: ComponentKind;
  name: string;
}

export interface PluginEntry {
  key: string;
  enabled: boolean;
  components: ComponentEntry[];
}

export async function findPlugins(configDir: string): Promise<PluginEntry[]> {
  const installed = await readJson(join(configDir, "plugins", "installed_plugins.json"));
  const settings = await readJson(join(configDir, "settings.json"));
  const enabledPlugins = asObject(settings?.enabledPlugins);

  const plugins: PluginEntry[] = [];
  for (const [key, records] of Object.entries(asObject(installed?.plugins))) {
    const record = (Array.isArray(records) ? records : [])
      .map(asObject)
      .find((candidate) => candidate.scope === "user");
    if (!record || typeof record.installPath !== "string") continue;

    const manifest = await readJson(join(record.installPath, ".claude-plugin", "plugin.json"));
    const setting = enabledPlugins[key];
    const enabled = typeof setting === "boolean" ? setting : manifest?.defaultEnabled !== false;
    const namespace = typeof manifest?.name === "string" ? manifest.name : pluginName(key);
    const components = await findComponents(record.installPath, namespace, manifest ?? {});
    plugins.push({ key, enabled, components });
  }
  return plugins.sort((a, b) => a.key.localeCompare(b.key));
}

async function findComponents(
  root: string,
  namespace: string,
  manifest: JsonObject,
): Promise<ComponentEntry[]> {
  const named = (kind: ComponentKind, names: string[]): ComponentEntry[] =>
    [...new Set(names)].sort().map((name) => ({ kind, name: `${namespace}:${name}` }));

  const skillDirs = [join(root, "skills"), ...pathsIn(root, manifest.skills)];
  const commandPaths = manifest.commands === undefined ? [join(root, "commands")] : pathsIn(root, manifest.commands);
  const agentPaths = manifest.agents === undefined ? [join(root, "agents")] : pathsIn(root, manifest.agents);

  return [
    ...named("skill", await collect(skillDirs, skillsIn)),
    ...named("command", await collect(commandPaths, markdownNamesIn)),
    ...named("agent", await collect(agentPaths, markdownNamesIn)),
    ...named("mcp-server", await mcpServerKeys(root, manifest.mcpServers)),
  ];
}

function pathsIn(root: string, value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((path): path is string => typeof path === "string").map((path) => join(root, path));
}

async function collect(paths: string[], find: (path: string) => Promise<string[]>): Promise<string[]> {
  const names: string[] = [];
  for (const path of paths) names.push(...(await find(path)));
  return names;
}

async function skillsIn(dir: string): Promise<string[]> {
  if (await exists(join(dir, "SKILL.md"))) return [basename(dir)];
  const names: string[] = [];
  for (const entry of await listDir(dir)) {
    if (await exists(join(dir, entry.name, "SKILL.md"))) names.push(entry.name);
  }
  return names;
}

async function markdownNamesIn(path: string): Promise<string[]> {
  if (path.endsWith(".md")) return (await exists(path)) ? [basename(path, ".md")] : [];
  return (await listDir(path))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => basename(entry.name, ".md"));
}

async function mcpServerKeys(root: string, declared: unknown): Promise<string[]> {
  const configs: JsonObject[] = [];
  const defaultConfig = await readJson(join(root, ".mcp.json"));
  if (defaultConfig) configs.push(defaultConfig);
  for (const item of Array.isArray(declared) ? declared : [declared]) {
    if (typeof item === "string") {
      const fromFile = await readJson(join(root, item));
      if (fromFile) configs.push(fromFile);
    } else if (typeof item === "object" && item !== null) {
      configs.push(asObject(item));
    }
  }
  return configs.flatMap((config) =>
    Object.keys(config.mcpServers === undefined ? config : asObject(config.mcpServers)),
  );
}

function pluginName(key: string): string {
  const at = key.lastIndexOf("@");
  return at > 0 ? key.slice(0, at) : key;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(file: string): Promise<JsonObject | null> {
  try {
    return asObject(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
