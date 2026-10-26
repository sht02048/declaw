import { spawn } from "node:child_process";
import type { ClaudeRun, ClaudeRunner } from "./engine/index.js";

export interface ClaudeCliOptions {
  command?: string;
}

export function claudeCliRunner({ command = "claude" }: ClaudeCliOptions = {}): ClaudeRunner {
  return (args) =>
    new Promise<ClaudeRun>((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => (output += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (output += chunk));
      child.on("error", reject);
      child.on("close", (code) => resolve({ exitCode: code ?? 1, output }));
    });
}
