import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { claudeCliRunner } from "../src/claude-cli.js";

async function fakeClaudeExecutable(script: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "declaw-claude-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "claude");
  await writeFile(path, `#!/bin/sh\n${script}\n`);
  await chmod(path, 0o755);
  return path;
}

describe("claudeCliRunner", () => {
  it("passes the arguments and returns the exit code with the output as-is", async () => {
    const command = await fakeClaudeExecutable(
      'echo "args: $*"\necho "✘ Failed to uninstall plugin \\"$3\\"" >&2\nexit 1',
    );

    const run = await claudeCliRunner({ command })(["plugin", "uninstall", "x@market", "--scope", "user"]);

    expect(run.exitCode).toBe(1);
    expect(run.output).toContain("args: plugin uninstall x@market --scope user\n");
    expect(run.output).toContain('✘ Failed to uninstall plugin "x@market"\n');
  });

  it("never waits on input from the terminal", async () => {
    const command = await fakeClaudeExecutable('read -r answer\necho "answer: [$answer]"');

    const run = await claudeCliRunner({ command })([]);

    expect(run).toEqual({ exitCode: 0, output: "answer: []\n" });
  });

  it("rejects when claude cannot be started", async () => {
    const run = claudeCliRunner({ command: join(tmpdir(), "declaw-no-such-claude") })([]);

    await expect(run).rejects.toThrow(/ENOENT/);
  });
});
