import { describe, expect, it } from "vitest";
import { formatCleanupSummary } from "../../src/cli/summary.js";
import { cleanup, report, type ClaudeRunner } from "../../src/engine/index.js";
import { fakeConfigDir } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

describe("Cleanup summary", () => {
  it("lists each outcome, shows a failure's output as-is, and prints how to reinstall each removed Plugin", async () => {
    const config = await fakeConfigDir();
    await config.plugin("vercel@claude-plugins-official", { skills: ["deploy"] });
    await config.plugin("broken@market", { skills: ["oops"] });
    await config.plugin("idle@market", { skills: ["nap"] });
    const result = await report({ configDir: config.path, now });
    const claude: ClaudeRunner = async ([, , id]) =>
      id === "broken@market"
        ? { exitCode: 1, output: '✘ Failed to uninstall plugin "broken@market": settings_still_on\n' }
        : { exitCode: 0, output: "" };
    const selection = ["vercel@claude-plugins-official", "broken@market", "idle@market"].map(
      (name) => result.installations.find((installation) => installation.name === name)!,
    );

    const outcomes = await cleanup(selection, { configDir: config.path, claude });

    expect(formatCleanupSummary(outcomes)).toBe(
      [
        "Cleanup of 3 Installations: 2 removed, 1 failed",
        "",
        "removed  vercel@claude-plugins-official",
        "failed   broken@market",
        '✘ Failed to uninstall plugin "broken@market": settings_still_on',
        "removed  idle@market",
        "",
        "To reinstall a removed Plugin:",
        "  claude plugin install vercel@claude-plugins-official --scope user",
        "  claude plugin install idle@market --scope user",
        "",
      ].join("\n"),
    );
  });

  it("prints no reinstall commands when no Plugin was removed", async () => {
    const config = await fakeConfigDir();
    await config.plugin("broken@market", { skills: ["oops"] });
    const result = await report({ configDir: config.path, now });
    const claude: ClaudeRunner = async () => ({ exitCode: 1, output: "✘ nope" });

    const outcomes = await cleanup(result.installations, { configDir: config.path, claude });

    expect(formatCleanupSummary(outcomes)).toBe(
      ["Cleanup of 1 Installation: 0 removed, 1 failed", "", "failed   broken@market", "✘ nope", ""].join(
        "\n",
      ),
    );
  });
});
