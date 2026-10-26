import type { TranscriptEntry } from "./transcripts.js";

export type UseKind = "invoke" | "agent" | "mcp";

export interface Use {
  kind: UseKind;
  name: string;
  at: Date;
}

const AGENT_TOOLS = new Set(["Agent", "Task"]);

export function entryTimestamp(entry: TranscriptEntry): Date | null {
  if (typeof entry.timestamp !== "string") return null;
  const at = new Date(entry.timestamp);
  return Number.isNaN(at.getTime()) ? null : at;
}

export function usesIn(entry: TranscriptEntry): Use[] {
  const at = entryTimestamp(entry);
  if (at === null) return [];
  const content = (entry.message as { content?: unknown } | undefined)?.content;
  if (entry.type === "user") return slashCommandsIn(content, at);
  if (entry.type !== "assistant" || !Array.isArray(content)) return [];
  const uses: Use[] = [];
  for (const block of content) {
    if (block?.type !== "tool_use") continue;
    if (block.name === "Skill" && typeof block.input?.skill === "string") {
      uses.push({ kind: "invoke", name: block.input.skill, at });
    } else if (AGENT_TOOLS.has(block.name) && typeof block.input?.subagent_type === "string") {
      uses.push({ kind: "agent", name: block.input.subagent_type, at });
    } else if (typeof block.name === "string" && block.name.startsWith("mcp__")) {
      uses.push({ kind: "mcp", name: block.name, at });
    }
  }
  return uses;
}

const COMMAND_NAME = /<command-name>\/([^<\s]+)<\/command-name>/g;

function slashCommandsIn(content: unknown, at: Date): Use[] {
  const texts =
    typeof content === "string"
      ? [content]
      : Array.isArray(content)
        ? content.filter((block) => block?.type === "text").map((block) => String(block.text))
        : [];
  return texts.flatMap((text) =>
    [...text.matchAll(COMMAND_NAME)].map((match): Use => ({ kind: "invoke", name: match[1]!, at })),
  );
}
