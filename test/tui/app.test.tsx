import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { report } from "../../src/engine/index.js";
import { App } from "../../src/tui/app.js";
import { fakeConfigDir, skillToolCall, userPrompt } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

async function exampleReport() {
  const config = await fakeConfigDir();
  await config.plugin("vercel@market", { skills: ["deploy", "logs"], agents: ["deployer"] });
  await config.plugin("idle@market", { skills: ["nap"] });
  await config.standaloneSkill("ux-writing");
  await config.syncedSkill("brand-voice");
  await config.transcript({ project: "/work/app", session: "s1" }, [
    userPrompt("ship it", "2026-09-28T07:15:00.000Z"),
    skillToolCall("vercel:deploy", "2026-10-09T10:30:00.000Z"),
  ]);
  return { config, result: await report({ configDir: config.path, now }) };
}

describe("TUI", () => {
  it("renders the list of Installations under the covered period", async () => {
    const { config, result } = await exampleReport();

    const { lastFrame } = render(<App report={result} configDir={config.path} dryRun={false} />);

    const frame = lastFrame()!;
    expect(frame.split("\n")[0]).toBe("Usage Stats from 2026-09-28 to 2026-10-26");
    for (const name of ["vercel@market", "idle@market", "ux-writing", "anthropic-skills:brand-voice"]) {
      expect(frame).toContain(name);
    }
  });

  it("selects the recommended set in one step", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} />);

    await press(stdin, "r");

    expect(selected(lastFrame()!)).toEqual(["idle@market", "ux-writing"]);
  });

  it("toggles the Installation under the cursor", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} />);

    await press(stdin, "r", DOWN, DOWN, " ", DOWN, " ");

    expect(selected(lastFrame()!)).toEqual(["idle@market", "vercel@market"]);
  });

  it("shows a Synced Skill but never selects it", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} />);

    await press(stdin, DOWN, " ");

    const row = lastFrame()!.split("\n").find((line) => line.includes("anthropic-skills:brand-voice"))!;
    expect(row).toContain("managed by claude.ai");
    expect(row).not.toContain("[x]");
    expect(selected(lastFrame()!)).toEqual([]);
  });

  it("expands a Plugin to show Uses per Component, and collapses it again", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} />);

    await press(stdin, DOWN, DOWN, DOWN, RIGHT);

    const lines = lastFrame()!.split("\n");
    const component = (name: string) => lines.find((line) => line.includes(name))?.split(/\s+/).filter(Boolean);
    expect(component("vercel:deploy")).toEqual(["skill", "vercel:deploy", "1", "2026-10-09"]);
    expect(component("vercel:logs")).toEqual(["skill", "vercel:logs", "0", "never"]);
    expect(component("vercel:deployer")).toEqual(["agent", "vercel:deployer", "0", "never"]);

    await press(stdin, LEFT);

    expect(lastFrame()).not.toContain("vercel:deploy");
  });
});

const DOWN = "\u001B[B";
const RIGHT = "\u001B[C";
const LEFT = "\u001B[D";

async function press(stdin: { write: (data: string) => void }, ...keys: string[]) {
  for (const key of keys) {
    stdin.write(key);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function selected(frame: string): string[] {
  return frame
    .split("\n")
    .filter((line) => line.includes("[x]"))
    .map((line) => line.match(/\S+@\S+|anthropic-skills:\S+|ux-writing/)![0]);
}
