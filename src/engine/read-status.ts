import { readFile } from "node:fs/promises";

export type ReadStatus =
  | { status: "readable" }
  | { status: "partial"; reason: string }
  | { status: "unreadable"; reason: string };

export const readable: ReadStatus = { status: "readable" };

export function partiallyReadable(reason: string): ReadStatus {
  return { status: "partial", reason };
}

export function unreadable(reason: string): ReadStatus {
  return { status: "unreadable", reason };
}

export type JsonRead = { ok: true; value: unknown } | { ok: false; status: ReadStatus };

export async function readJsonFile(path: string, label: string): Promise<JsonRead> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return { ok: false, status: unreadable(missing ? `${label} not found` : `${label} could not be read`) };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    // The parser's message quotes file content, and the config file holds account secrets.
    return { ok: false, status: unreadable(`${label} is not valid JSON`) };
  }
}
