import { readFile } from "node:fs/promises";
import { join } from "node:path";

type JsonObject = Record<string, unknown>;

export interface PluginEntry {
  key: string;
}

export async function findPlugins(configDir: string): Promise<PluginEntry[]> {
  const installed = await readJson(join(configDir, "plugins", "installed_plugins.json"));
  const records = asObject(installed?.plugins);
  const plugins: PluginEntry[] = [];
  for (const [key, scopes] of Object.entries(records)) {
    if (!Array.isArray(scopes)) continue;
    if (!scopes.some((record) => asObject(record).scope === "user")) continue;
    plugins.push({ key });
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
