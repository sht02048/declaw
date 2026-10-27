import { plural } from "../plural.js";
import { isJsonObject, partiallyReadable, readable, readJsonFile, unreadable, type ReadStatus } from "./read-status.js";

export type McpTransport = "stdio" | "http" | "sse" | "ws";

export interface McpServerRecord {
  name: string;
  transport: McpTransport;
}

export interface McpServersRead {
  status: ReadStatus;
  servers: McpServerRecord[];
}

const TRANSPORTS = new Set<unknown>(["stdio", "http", "sse", "ws"]);

export async function readMcpServers(configFile: string): Promise<McpServersRead> {
  const registrations = await readRegistrations(configFile);
  if (!registrations.ok) return { status: registrations.status, servers: [] };

  const servers: McpServerRecord[] = [];
  let skipped = 0;
  for (const [name, registration] of Object.entries(registrations.value)) {
    if (isJsonObject(registration) && (registration.type === undefined || TRANSPORTS.has(registration.type))) {
      servers.push({ name, transport: (registration.type as McpTransport | undefined) ?? "stdio" });
    } else {
      skipped += 1;
    }
  }
  const status =
    skipped === 0
      ? readable
      : partiallyReadable(`${skipped} malformed MCP server ${plural(skipped, "registration")} skipped`);
  return { status, servers: servers.sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function readMcpServerRegistration(configFile: string, name: string): Promise<unknown> {
  const registrations = await readRegistrations(configFile);
  if (!registrations.ok) throw new Error("MCP server registrations in the config file could not be read");
  return Object.hasOwn(registrations.value, name) ? registrations.value[name] : undefined;
}

type RegistrationsRead = { ok: true; value: Record<string, unknown> } | { ok: false; status: ReadStatus };

async function readRegistrations(configFile: string): Promise<RegistrationsRead> {
  const file = await readJsonFile(configFile, "config file");
  if (!file.ok) return { ok: false, status: file.status };
  if (!isJsonObject(file.value)) return { ok: false, status: unreadable("config file is not a JSON object") };
  const registrations = file.value.mcpServers;
  if (registrations === undefined) return { ok: true, value: {} };
  if (!isJsonObject(registrations)) {
    return { ok: false, status: unreadable("mcpServers in config file is not an object") };
  }
  return { ok: true, value: registrations };
}
