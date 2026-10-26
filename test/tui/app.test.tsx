import { join } from "node:path";
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

  it("says which data source could not be read", async () => {
    const { config } = await exampleReport();
    await config.corruptInstallRecords();
    const result = await report({ configDir: config.path, now });

    const { lastFrame } = render(<App report={result} configDir={config.path} dryRun={false} />);

    expect(lastFrame()).toMatch(/Install records: unreadable \(.+\)/);
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

describe("TUI in a short terminal", () => {
  it("keeps the covered period at the top while scrolling through a long list", async () => {
    const config = await fakeConfigDir();
    const names = Array.from({ length: 20 }, (_, index) => `skill-${String(index).padStart(2, "0")}`);
    for (const name of names) await config.standaloneSkill(name);
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ configDir: config.path, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} dryRun={false} />);
    Object.defineProperty(stdout, "rows", { value: 12 });
    stdout.emit("resize");

    await press(stdin, ...Array.from({ length: 19 }, () => DOWN));

    const lines = lastFrame()!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines[0]).toBe("Usage Stats from 2026-09-28 to 2026-10-26");
    expect(lines.find((line) => line.startsWith(">"))).toContain("skill-19");
    expect(lastFrame()).not.toContain("skill-00");
  });

  it("scrolls a long confirmation screen under the covered period", async () => {
    const config = await fakeConfigDir();
    const names = Array.from({ length: 10 }, (_, index) => `skill-${String(index).padStart(2, "0")}`);
    for (const name of names) await config.standaloneSkill(name);
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ configDir: config.path, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} dryRun />);
    Object.defineProperty(stdout, "rows", { value: 16 });
    stdout.emit("resize");

    await press(stdin, "r", ENTER);
    expect(lastFrame()).not.toContain("skill-09");
    await press(stdin, ...Array.from({ length: 60 }, () => DOWN));

    const lines = lastFrame()!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(16);
    expect(lines[0]).toBe("Usage Stats from 2026-09-28 to 2026-10-26");
    expect(lastFrame()).toContain("skill-09");
  });
});

async function cleanupReport() {
  const config = await fakeConfigDir();
  await config.plugin("idle@market", { skills: ["nap"] });
  await config.linkedSkill("find-skills", { target: join(config.home, ".agents", "skills", "find-skills") });
  await config.standaloneSkill("ux-writing");
  await config.transcript({ project: "/work/app", session: "s1" }, [
    userPrompt("hello", "2026-09-28T07:15:00.000Z"),
  ]);
  return { config, result: await report({ configDir: config.path, now }) };
}

describe("TUI confirmation screen", () => {
  it("lists each selected Installation with its planned action and how to undo it", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} />);

    await press(stdin, "r", ENTER);

    const target = join(config.home, ".agents", "skills", "find-skills");
    const frame = unwrapped(lastFrame()!);
    expect(frame).toContain(
      "idle@market Uninstall with claude plugin uninstall idle@market --scope user " +
        "Undo: claude plugin install idle@market --scope user",
    );
    expect(frame).toContain(
      `find-skills Remove the link only, keeping ${target} ` +
        `Undo: ln -s ${target} ${join(config.path, "skills", "find-skills")}`,
    );
    expect(frame).toContain(
      `ux-writing Move ${join(config.path, "skills", "ux-writing")} to the system trash ` +
        "Undo: restore it from the system trash",
    );
    expect(frame).not.toContain("[x]");
  });

  it("reviews a selection made in the same burst of keys", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} />);

    await press(stdin, `r${ENTER}`);

    expect(lastFrame()).toContain("Review the Cleanup of 3 Installations");
  });

  it("goes back to the list with the selection unchanged", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} />);

    await press(stdin, "r", DOWN, " ", ENTER, ESCAPE);

    expect(selected(lastFrame()!)).toEqual(["idle@market", "ux-writing"]);
  });

  it("offers no way past the confirmation screen in a dry run", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun />);

    await press(stdin, "r", ENTER, ENTER, "y");

    expect(lastFrame()).toContain("Dry run: nothing will be changed");
    expect(lastFrame()).toContain("Undo: restore it from the system trash");
  });
});

const ENTER = "\r";
const ESCAPE = "\u001B";
const DOWN = "\u001B[B";
const RIGHT = "\u001B[C";
const LEFT = "\u001B[D";

async function press(stdin: { write: (data: string) => void }, ...keys: string[]) {
  for (const key of keys) {
    stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, key === ESCAPE ? 50 : 0));
  }
}

function unwrapped(frame: string): string {
  return frame.replace(/\s+/g, " ");
}

function selected(frame: string): string[] {
  return frame
    .split("\n")
    .filter((line) => line.includes("[x]"))
    .map((line) => line.match(/\S+@\S+|anthropic-skills:\S+|ux-writing|find-skills/)![0]);
}
