import { readFile } from "node:fs/promises";

export type ReadStatus =
  | { status: "readable" }
  | { status: "partial"; reason: string }
  | { status: "unreadable"; reason: string };

export type Unknown = "unknown";

export const readable: ReadStatus = { status: "readable" };

export function partiallyReadable(reason: string): ReadStatus {
  return { status: "partial", reason };
}

export function unreadable(reason: string): ReadStatus {
  return { status: "unreadable", reason };
}

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type JsonRead = { ok: true; value: unknown } | { ok: false; missing: boolean; status: ReadStatus };

export async function readJsonFile(path: string, label: string): Promise<JsonRead> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      ok: false,
      missing,
      status: unreadable(missing ? `${label} not found` : `${label} could not be read`),
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    // The parser's message quotes file content, and the config file holds account secrets.
    return { ok: false, missing: false, status: unreadable(`${label} is not valid JSON`) };
  }
}

export interface OptionalJsonRead {
  status: ReadStatus;
  value: JsonObject | null | undefined;
}

export async function readOptionalJsonFile(path: string, label: string): Promise<OptionalJsonRead> {
  const file = await readJsonFile(path, label);
  if (!file.ok) return file.missing ? { status: readable, value: null } : { status: file.status, value: undefined };
  if (!isJsonObject(file.value)) return { status: unreadable(`${label} is not a JSON object`), value: undefined };
  return { status: readable, value: file.value };
}
