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
  hooks: number;
  components: ComponentEntry[];
}

export async function findPlugins(configDir: string): Promise<PluginEntry[]> {
  const installed = await readJson(join(configDir, "plugins", "installed_plugins.json"));
  const settings = await readJson(join(configDir, "settings.json"));
  const enabledPlugins = asObject(settings?.enabledPlugins);
  const marketplaces = asObject(
    await readJson(join(configDir, "plugins", "known_marketplaces.json")),
  );

  const plugins: PluginEntry[] = [];
  for (const [key, records] of Object.entries(asObject(installed?.plugins))) {
    const record = (Array.isArray(records) ? records : [])
      .map(asObject)
      .find((candidate) => candidate.scope === "user");
    if (!record || typeof record.installPath !== "string") continue;

    const pluginJson = await readJson(join(record.installPath, ".claude-plugin", "plugin.json"));
    const entry = await marketplaceEntry(marketplaces, key);
    const manifest = pluginJson === null || entry?.strict === false ? (entry ?? {}) : pluginJson;
    const setting = enabledPlugins[key];
    const enabled = typeof setting === "boolean" ? setting : manifest.defaultEnabled !== false;
    const namespace = typeof manifest.name === "string" ? manifest.name : pluginName(key);
    const components = await findComponents(record.installPath, namespace, manifest);
    const hooks = await countHooks(record.installPath, manifest.hooks);
    plugins.push({ key, enabled, hooks, components });
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
  const configs = await mergedConfigs(root, ".mcp.json", declared, "mcpServers");
  return configs.flatMap((servers) => Object.keys(servers));
}

async function countHooks(root: string, declared: unknown): Promise<number> {
  const configs = await mergedConfigs(root, join("hooks", "hooks.json"), declared, "hooks");
  let count = 0;
  for (const events of configs) {
    for (const groups of Object.values(events)) {
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        const hooks = asObject(group).hooks;
        if (Array.isArray(hooks)) count += hooks.length;
      }
    }
  }
  return count;
}

async function mergedConfigs(
  root: string,
  defaultFile: string,
  declared: unknown,
  wrapperKey: string,
): Promise<JsonObject[]> {
  const configs: JsonObject[] = [];
  const defaultConfig = await readJson(join(root, defaultFile));
  if (defaultConfig) configs.push(defaultConfig);
  for (const item of Array.isArray(declared) ? declared : [declared]) {
    if (typeof item === "string") {
      const fromFile = await readJson(join(root, item));
      if (fromFile) configs.push(fromFile);
    } else if (typeof item === "object" && item !== null) {
      configs.push(asObject(item));
    }
  }
  return configs.map((config) =>
    config[wrapperKey] === undefined ? config : asObject(config[wrapperKey]),
  );
}

async function marketplaceEntry(marketplaces: JsonObject, key: string): Promise<JsonObject | null> {
  const installLocation = asObject(marketplaces[marketplaceName(key)]).installLocation;
  if (typeof installLocation !== "string") return null;
  const catalog = await readJson(join(installLocation, ".claude-plugin", "marketplace.json"));
  const entries = Array.isArray(catalog?.plugins) ? catalog.plugins.map(asObject) : [];
  return entries.find((entry) => entry.name === pluginName(key)) ?? null;
}

function pluginName(key: string): string {
  const at = key.lastIndexOf("@");
  return at > 0 ? key.slice(0, at) : key;
}

function marketplaceName(key: string): string {
  const at = key.lastIndexOf("@");
  return at > 0 ? key.slice(at + 1) : "";
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
