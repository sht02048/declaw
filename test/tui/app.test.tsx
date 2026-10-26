import { join } from "node:path";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { cleanup, report, type CleanupOutcome, type Installation } from "../../src/engine/index.js";
import { App } from "../../src/tui/app.js";
import { fakeConfigDir, skillToolCall, userPrompt } from "../support/fake-config-dir.js";
import { fakeClaude, fakeTrash } from "../support/fake-effects.js";

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

    const { lastFrame } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);

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

    const { lastFrame } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);

    expect(lastFrame()).toMatch(/Install records: unreadable \(.+\)/);
  });

  it("selects the recommended set in one step", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, "r");

    expect(selected(lastFrame()!)).toEqual(["idle@market", "ux-writing"]);
  });

  it("toggles the Installation under the cursor", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, "r", DOWN, DOWN, " ", DOWN, " ");

    expect(selected(lastFrame()!)).toEqual(["idle@market", "vercel@market"]);
  });

  it("shows a Synced Skill but never selects it", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, DOWN, " ");

    const row = lastFrame()!.split("\n").find((line) => line.includes("anthropic-skills:brand-voice"))!;
    expect(row).toContain("managed by claude.ai");
    expect(row).not.toContain("[x]");
    expect(selected(lastFrame()!)).toEqual([]);
  });

  it("expands a Plugin to show Uses per Component, and collapses it again", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);

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
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);
    Object.defineProperty(stdout, "rows", { value: 12 });
    stdout.emit("resize");

    await press(stdin, ...Array.from({ length: 19 }, () => DOWN));

    const lines = lastFrame()!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines[0]).toBe("Usage Stats from 2026-09-28 to 2026-10-26");
    expect(lines.find((line) => line.startsWith(">"))).toContain("skill-19");
    expect(lastFrame()).not.toContain("skill-00");
  });

  it("reaches every Component of a Plugin expanded at the bottom of a long list", async () => {
    const config = await fakeConfigDir();
    for (let index = 0; index < 12; index++) await config.standaloneSkill(`skill-${index}`);
    const components = ["a", "b", "c", "d", "e", "f"];
    await config.plugin("big@market", { skills: components });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
      skillToolCall("big:a", "2026-10-09T10:30:00.000Z"),
    ]);
    const result = await report({ configDir: config.path, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);
    Object.defineProperty(stdout, "rows", { value: 12 });
    stdout.emit("resize");

    await press(stdin, ...Array.from({ length: 12 }, () => DOWN), RIGHT);
    expect(lastFrame()).toContain("big:a");
    await press(stdin, ...Array.from({ length: 6 }, () => DOWN));

    const lines = lastFrame()!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines[0]).toBe("Usage Stats from 2026-09-28 to 2026-10-26");
    expect(lastFrame()).toContain("big:f");
  });

  it("fits a confirmation screen whose long paths wrap at word boundaries", async () => {
    const config = await fakeConfigDir();
    for (let index = 0; index < 6; index++) {
      const folder = `${index}`.padEnd(Math.max(1, 90 - config.home.length - 1), "x");
      await config.linkedSkill(`link-${index}`, { target: join(config.home, folder) });
    }
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ configDir: config.path, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} dryRun cleanup={unexpectedCleanup} />);
    Object.defineProperty(stdout, "rows", { value: 16 });
    stdout.emit("resize");

    await press(stdin, "r", ENTER);

    for (let step = 0; step < 30; step++) {
      expect(lastFrame()!.split("\n").length).toBeLessThanOrEqual(16);
      await press(stdin, DOWN);
    }
  });

  it("scrolls up at once after the terminal grows on the confirmation screen", async () => {
    const config = await fakeConfigDir();
    for (let index = 0; index < 10; index++) await config.standaloneSkill(`skill-${index}`);
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ configDir: config.path, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} dryRun cleanup={unexpectedCleanup} />);
    let rows = 16;
    Object.defineProperty(stdout, "rows", { get: () => rows });
    stdout.emit("resize");
    await press(stdin, "r", ENTER, ...Array.from({ length: 60 }, () => DOWN));
    rows = 30;
    stdout.emit("resize");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const beforeUp = lastFrame();

    await press(stdin, UP);

    expect(lastFrame()).not.toBe(beforeUp);
  });

  it("scrolls a long confirmation screen under the covered period", async () => {
    const config = await fakeConfigDir();
    const names = Array.from({ length: 10 }, (_, index) => `skill-${String(index).padStart(2, "0")}`);
    for (const name of names) await config.standaloneSkill(name);
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ configDir: config.path, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} dryRun cleanup={unexpectedCleanup} />);
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
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, "r", ENTER);

    const target = join(config.home, ".agents", "skills", "find-skills");
    const frame = unwrapped(lastFrame()!);
    expect(frame).toContain(
      "idle@market Uninstall with claude plugin uninstall idle@market --scope user " +
        "Undo: claude plugin install idle@market --scope user",
    );
    expect(frame).toContain(
      `find-skills Remove the link only, keeping ${target} ` +
        `Undo: ln -s '${target}' '${join(config.path, "skills", "find-skills")}'`,
    );
    expect(frame).toContain(
      `ux-writing Move ${join(config.path, "skills", "ux-writing")} to the system trash ` +
        "Undo: restore it from the system trash",
    );
    expect(frame).not.toContain("[x]");
  });

  it("reviews a selection made in the same burst of keys", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, `r${ENTER}`);

    expect(lastFrame()).toContain("Review the Cleanup of 3 Installations");
  });

  it("asks for a selection when reviewing with nothing selected", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun cleanup={unexpectedCleanup} />);

    await press(stdin, ENTER);

    expect(lastFrame()).toContain("Select at least one Installation to review.");
    expect(lastFrame()).toContain("idle@market");
  });

  it("goes back to the list with the selection unchanged", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, "r", DOWN, " ", ENTER, ESCAPE);

    expect(selected(lastFrame()!)).toEqual(["idle@market", "ux-writing"]);
  });

  it("offers no way past the confirmation screen in a dry run", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun cleanup={unexpectedCleanup} />);

    await press(stdin, "r", ENTER, ENTER, "y");

    expect(lastFrame()).toContain("Dry run: nothing will be changed");
    expect(lastFrame()).toContain("Undo: restore it from the system trash");
    expect(lastFrame()).not.toContain("y run the Cleanup");
  });
});

describe("TUI Cleanup", () => {
  it("runs the Cleanup on y and lists each Installation with its outcome", async () => {
    const { config, result } = await cleanupReport();
    const trash = fakeTrash(join(config.home, ".Trash"));
    const run = (selection: Installation[]) =>
      cleanup(selection, { configDir: config.path, trash: trash.move, runClaude: fakeClaude().run });
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} dryRun={false} cleanup={run} />);

    await press(stdin, "r", ENTER);
    expect(lastFrame()).toContain("y run the Cleanup");
    await press(stdin, "y");
    await settle();

    const target = join(config.home, ".agents", "skills", "find-skills");
    const link = join(config.path, "skills", "find-skills");
    const folder = join(config.path, "skills", "ux-writing");
    const summary = [
      "Cleanup of 3 Installations: 3 removed, 0 failed",
      "",
      "removed  idle@market",
      "removed  find-skills",
      "removed  ux-writing",
      "",
      "To reinstall a removed Plugin:",
      "  claude plugin install idle@market --scope user",
      "",
      "To restore a removed Linked Skill:",
      `  ln -s '${target}' '${link}'`,
      "",
      "Moved to the system trash, where they can be restored:",
      `  ${folder}`,
    ];
    expect(unwrapped(lastFrame()!)).toContain(unwrapped(summary.join("\n")));
    expect(trash.moves).toEqual([folder]);
  });
});

const unexpectedCleanup = async (): Promise<CleanupOutcome[]> => {
  throw new Error("cleanup must not run");
};

async function settle() {
  for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 10));
}

const ENTER = "\r";
const ESCAPE = "\u001B";
const UP = "\u001B[A";
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
