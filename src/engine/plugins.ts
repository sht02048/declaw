import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { plural } from "../plural.js";
import { exists, isSkillFolder, listDir } from "./fs.js";
import {
  isJsonObject,
  partiallyReadable,
  readable,
  readJsonFile,
  readOptionalJsonFile,
  unreadable,
  type JsonObject,
  type ReadStatus,
  type Unknown,
} from "./read-status.js";

export type ComponentKind = "skill" | "command" | "agent" | "mcp-server";

export interface ComponentRecord {
  kind: ComponentKind;
  name: string;
}

export interface PluginRecord {
  key: string;
  namespace: string;
  installedAt: Date | null;
  enabled: boolean | Unknown;
  hooks: number | Unknown;
  components: ComponentRecord[] | Unknown;
}

export interface PluginInventory {
  installRecords: ReadStatus;
  settings: ReadStatus;
  pluginFiles: ReadStatus;
  plugins: PluginRecord[];
}

export async function findPlugins(configDir: string): Promise<PluginInventory> {
  const settingsFile = await readOptionalJsonFile(join(configDir, "settings.json"), "settings");
  const enabledPlugins = settingsFile.value === undefined ? null : asObject(settingsFile.value?.enabledPlugins);
  const settings = settingsFile.status;

  const installed = await readJsonFile(join(configDir, "plugins", "installed_plugins.json"), "install records");
  if (!installed.ok) return { installRecords: installed.status, settings, pluginFiles: readable, plugins: [] };
  const records = (installed.value as JsonObject | null)?.plugins;
  if (typeof records !== "object" || records === null || Array.isArray(records)) {
    return {
      installRecords: unreadable("plugins in install records is not an object"),
      settings,
      pluginFiles: readable,
      plugins: [],
    };
  }

  const knownMarketplaces = await readOptionalJsonFile(
    join(configDir, "plugins", "known_marketplaces.json"),
    "known marketplaces",
  );
  const marketplaces = knownMarketplaces.value === undefined ? null : (knownMarketplaces.value ?? {});

  const plugins: PluginRecord[] = [];
  for (const [key, scopes] of Object.entries(records)) {
    const record = (Array.isArray(scopes) ? scopes : [])
      .map(asObject)
      .find((candidate) => candidate.scope === "user");
    if (!record || typeof record.installPath !== "string") continue;
    const root = record.installPath;

    const read = await attempt(() => manifestOf(root, key, marketplaces));
    const manifest = read === "unknown" ? read : read.manifest;
    const setting = enabledPlugins?.[key];
    const enabled =
      typeof setting === "boolean"
        ? setting
        : enabledPlugins === null || manifest === "unknown"
          ? "unknown"
          : manifest.defaultEnabled !== false;
    const namespace = manifest !== "unknown" && typeof manifest.name === "string" ? manifest.name : pluginName(key);
    const components =
      manifest === "unknown" ? manifest : await attempt(() => findComponents(root, namespace, manifest));
    const hooks =
      read === "unknown" ? read : await attempt(() => countHooks(root, read.manifest.hooks, read.entryHooks));
    const installedAt = dateIn(record.installedAt);
    plugins.push({ key, namespace, installedAt, enabled, hooks, components });
  }

  const unreadablePlugins = plugins.filter(
    (plugin) => plugin.components === "unknown" || plugin.hooks === "unknown",
  ).length;
  const problems = [
    knownMarketplaces.status.status !== "readable" && knownMarketplaces.status.reason,
    unreadablePlugins > 0 && `files of ${unreadablePlugins} ${plural(unreadablePlugins, "Plugin")} could not be read`,
  ].filter((problem) => problem !== false);
  return {
    installRecords: readable,
    settings,
    pluginFiles: problems.length === 0 ? readable : partiallyReadable(problems.join("; ")),
    plugins: plugins.sort((a, b) => a.key.localeCompare(b.key)),
  };
}

interface ManifestRead {
  manifest: JsonObject;
  entryHooks?: unknown;
}

const APPENDED_FROM_ENTRY = ["skills", "commands", "agents"] as const;

async function manifestOf(root: string, key: string, marketplaces: JsonObject | null): Promise<ManifestRead> {
  if (marketplaces === null) throw new Error("known marketplaces could not be read");
  const pluginJson = await readJson(join(root, ".claude-plugin", "plugin.json"));
  const entry = await marketplaceEntry(marketplaces, key);
  if (pluginJson === null || entry?.strict === false) return { manifest: entry ?? {} };
  if (entry === null) return { manifest: pluginJson };
  const manifest = { ...pluginJson };
  for (const field of APPENDED_FROM_ENTRY) {
    if (entry[field] !== undefined) manifest[field] = [...listOf(pluginJson[field]), ...listOf(entry[field])];
  }
  return { manifest, entryHooks: entry.hooks };
}

function listOf(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

async function attempt<T>(read: () => Promise<T>): Promise<T | Unknown> {
  try {
    return await read();
  } catch {
    return "unknown";
  }
}

async function findComponents(
  root: string,
  namespace: string,
  manifest: JsonObject,
): Promise<ComponentRecord[]> {
  const named = (kind: ComponentKind, names: string[]): ComponentRecord[] =>
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
  if (await isSkillFolder(dir)) return [basename(dir)];
  const names: string[] = [];
  for (const dirent of await listDir(dir)) {
    if (await isSkillFolder(join(dir, dirent.name))) names.push(dirent.name);
  }
  return names;
}

async function markdownNamesIn(path: string): Promise<string[]> {
  if (path.endsWith(".md")) return (await exists(path)) ? [basename(path, ".md")] : [];
  return (await listDir(path))
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".md"))
    .map((dirent) => basename(dirent.name, ".md"));
}

async function mcpServerKeys(root: string, declared: unknown): Promise<string[]> {
  const configs = await mergedConfigs(root, ".mcp.json", declared, "mcpServers");
  return configs.flatMap((servers) => Object.keys(servers));
}

async function countHooks(root: string, declared: unknown, entryHooks: unknown): Promise<number> {
  const groupsByEvent = hookGroupsByEvent(await mergedConfigs(root, join("hooks", "hooks.json"), declared, "hooks"));
  if (entryHooks !== undefined) {
    for (const [event, groups] of hookGroupsByEvent(await mergedConfigs(root, null, entryHooks, "hooks"))) {
      groupsByEvent.set(event, groups);
    }
  }
  let count = 0;
  for (const groups of groupsByEvent.values()) {
    for (const group of groups) {
      const hooks = asObject(group).hooks;
      if (Array.isArray(hooks)) count += hooks.length;
    }
  }
  return count;
}

function hookGroupsByEvent(configs: JsonObject[]): Map<string, unknown[]> {
  const groupsByEvent = new Map<string, unknown[]>();
  for (const events of configs) {
    for (const [event, groups] of Object.entries(events)) {
      if (Array.isArray(groups)) groupsByEvent.set(event, [...(groupsByEvent.get(event) ?? []), ...groups]);
    }
  }
  return groupsByEvent;
}

async function mergedConfigs(
  root: string,
  defaultFile: string | null,
  declared: unknown,
  wrapperKey: string,
): Promise<JsonObject[]> {
  const configs: JsonObject[] = [];
  const defaultConfig = defaultFile === null ? null : await readJson(join(root, defaultFile));
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

function dateIn(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pluginName(key: string): string {
  const at = key.lastIndexOf("@");
  return at > 0 ? key.slice(0, at) : key;
}

function marketplaceName(key: string): string {
  const at = key.lastIndexOf("@");
  return at > 0 ? key.slice(at + 1) : "";
}

async function readJson(file: string): Promise<JsonObject | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
  const value: unknown = JSON.parse(text);
  if (!isJsonObject(value)) throw new Error(`${file} is not a JSON object`);
  return value;
}

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
