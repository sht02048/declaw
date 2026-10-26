import { readFile } from "node:fs/promises";
import { join } from "node:path";

type JsonObject = Record<string, unknown>;

export interface PluginEntry {
  key: string;
  enabled: boolean;
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
    plugins.push({ key, enabled });
  }
  return plugins.sort((a, b) => a.key.localeCompare(b.key));
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
