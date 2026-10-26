import type { TranscriptEntry } from "./transcripts.js";

export interface Use {
  kind: "skill";
  name: string;
  at: Date;
}

export function entryTimestamp(entry: TranscriptEntry): Date | null {
  if (typeof entry.timestamp !== "string") return null;
  const at = new Date(entry.timestamp);
  return Number.isNaN(at.getTime()) ? null : at;
}

export function usesIn(entry: TranscriptEntry): Use[] {
  const at = entryTimestamp(entry);
  if (entry.type !== "assistant" || at === null) return [];
  const content = (entry.message as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return [];
  const uses: Use[] = [];
  for (const block of content) {
    if (block?.type !== "tool_use" || block.name !== "Skill") continue;
    const skill = block.input?.skill;
    if (typeof skill === "string") uses.push({ kind: "skill", name: skill, at });
  }
  return uses;
}
