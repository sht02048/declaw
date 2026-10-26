import { execFile } from "node:child_process";
import trash from "trash";
import type { ClaudeRunner, TrashMover } from "./engine/index.js";

// Globbing is off so a skill name with glob characters can never match another path.
export const systemTrash: TrashMover = (path) => trash(path, { glob: false });

export const runClaude: ClaudeRunner = (args) =>
  new Promise((resolve) => {
    execFile("claude", args, (error, stdout, stderr) => {
      const exitCode = error === null ? 0 : typeof error.code === "number" ? error.code : 1;
      const output = `${stdout}${stderr}` || (error?.message ?? "");
      resolve({ exitCode, output });
    });
  });
