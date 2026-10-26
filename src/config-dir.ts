import { join } from "node:path";

export function resolveConfigDir(env: Record<string, string | undefined>, homeDir: string): string {
  const fromEnv = env.CLAUDE_CONFIG_DIR;
  return fromEnv ? fromEnv : join(homeDir, ".claude");
}

export function resolveConfigFile(env: Record<string, string | undefined>, homeDir: string): string {
  return join(env.CLAUDE_CONFIG_DIR || homeDir, ".claude.json");
}
