import { join } from "node:path";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { cleanup, report, type CleanupOutcome, type Installation } from "../../src/engine/index.js";
import { App } from "../../src/tui/app.js";
import { fakeConfigDir, skillToolCall, userPrompt } from "../support/fake-config-dir.js";
import { fakeClaude, fakeTrash } from "../support/fake-effects.js";

const now = new Date("2026-10-26T00:00:00.000Z");
const TITLE = "declaw  Usage Stats 2026-09-28 – 2026-10-26 · 29 days";

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
  return { config, result: await report({ ...config.paths, now }) };
}

describe("TUI", () => {
  it("renders the list of Installations under the covered period", async () => {
    const { config, result } = await exampleReport();

    const { lastFrame } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);

    const frame = lastFrame()!;
    expect(frame.split("\n")[0]).toBe(TITLE);
    for (const name of ["vercel@market", "idle@market", "ux-writing", "anthropic-skills:brand-voice"]) {
      expect(frame).toContain(name);
    }
  });

  it("says which data source could not be read", async () => {
    const { config } = await exampleReport();
    await config.corruptInstallRecords();
    const result = await report({ ...config.paths, now });

    const { lastFrame } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);

    expect(lastFrame()).toMatch(/Install records: unreadable \(.+\)/);
  });

  it("selects the recommended set in one step", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, "r");

    expect(selected(lastFrame()!)).toEqual(["idle@market", "ux-writing"]);
  });

  it("toggles the Installation under the cursor", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, "r", DOWN, DOWN, " ", DOWN, " ");

    expect(selected(lastFrame()!)).toEqual(["idle@market", "vercel@market"]);
  });

  it("shows a Synced Skill but never selects it", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, DOWN, " ");

    const row = lastFrame()!.split("\n").find((line) => line.includes("anthropic-skills:brand-voice"))!;
    expect(row).toContain("synced");
    expect(row).not.toContain("◉");
    expect(selected(lastFrame()!)).toEqual([]);
  });

  it("expands a Plugin to show Uses per Component, and collapses it again", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, DOWN, DOWN, DOWN, RIGHT);

    const lines = lastFrame()!.split("\n");
    const component = (name: string) => lines.find((line) => line.includes(name))?.trim().split(/\s{2,}/);
    expect(component("vercel:deploy")).toEqual(["├─ vercel:deploy", "skill", "1", "2w ago"]);
    expect(component("vercel:logs")).toEqual(["├─ vercel:logs", "skill", "0", "never"]);
    expect(component("vercel:deployer")).toEqual(["├─ vercel:deployer", "agent", "0", "never"]);

    await press(stdin, LEFT);

    expect(lastFrame()).not.toContain("vercel:deploy");
  });
});

describe("TUI hook counts", () => {
  it("shows how many hooks each Plugin runs every session, in its row and when expanded", async () => {
    const config = await fakeConfigDir();
    const hook = { type: "command", command: "true" };
    await config.plugin("hooked@market", {
      skills: ["work"],
      hooks: { SessionStart: [{ hooks: [hook, hook] }] },
    });
    await config.plugin("quiet@market", { skills: ["nap"] });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ ...config.paths, now });
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);

    const row = (name: string) => lastFrame()!.split("\n").find((line) => line.includes(name));
    expect(row("hooked@market")).toMatch(/\s2$/);
    expect(row("quiet@market")).toMatch(/\s0$/);

    await press(stdin, RIGHT);

    expect(lastFrame()).toContain("2 hooks run every session");
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
    const result = await report({ ...config.paths, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);
    Object.defineProperty(stdout, "rows", { value: 12 });
    stdout.emit("resize");

    await press(stdin, ...Array.from({ length: 19 }, () => DOWN));

    const lines = lastFrame()!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines[0]).toBe(TITLE);
    expect(lines.find((line) => line.startsWith("›"))).toContain("skill-19");
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
    const result = await report({ ...config.paths, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);
    Object.defineProperty(stdout, "rows", { value: 12 });
    stdout.emit("resize");

    await press(stdin, ...Array.from({ length: 12 }, () => DOWN), RIGHT);
    expect(lastFrame()).toContain("big:a");
    await press(stdin, ...Array.from({ length: 6 }, () => DOWN));

    const lines = lastFrame()!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines[0]).toBe(TITLE);
    expect(lastFrame()).toContain("big:f");
  });

  it("fits a confirmation screen with long paths, one terminal row per line", async () => {
    const config = await fakeConfigDir();
    for (let index = 0; index < 6; index++) {
      const folder = `${index}`.padEnd(Math.max(1, 90 - config.home.length - 1), "x");
      await config.linkedSkill(`link-${index}`, { target: join(config.home, folder) });
    }
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ ...config.paths, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun cleanup={unexpectedCleanup} />);
    Object.defineProperty(stdout, "rows", { value: 16 });
    stdout.emit("resize");

    await press(stdin, "r", ENTER);

    for (let step = 0; step < 30; step++) {
      const lines = plain(lastFrame()!).split("\n");
      expect(lines.length).toBeLessThanOrEqual(16);
      expect(lines.every((line) => line.length <= 100)).toBe(true);
      await press(stdin, DOWN);
    }
  });

  it("scrolls up at once after the terminal grows on the confirmation screen", async () => {
    const config = await fakeConfigDir();
    for (let index = 0; index < 10; index++) await config.standaloneSkill(`skill-${index}`);
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ ...config.paths, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun cleanup={unexpectedCleanup} />);
    let rows = 16;
    Object.defineProperty(stdout, "rows", { get: () => rows });
    stdout.emit("resize");
    await press(stdin, "r", ENTER, ...Array.from({ length: 60 }, () => DOWN));
    rows = 26;
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
    const result = await report({ ...config.paths, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun cleanup={unexpectedCleanup} />);
    Object.defineProperty(stdout, "rows", { value: 16 });
    stdout.emit("resize");

    await press(stdin, "r", ENTER);
    expect(lastFrame()).not.toContain("skill-09");
    await press(stdin, ...Array.from({ length: 60 }, () => DOWN));

    const lines = lastFrame()!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(16);
    expect(lines[0]).toBe(TITLE);
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
  return { config, result: await report({ ...config.paths, now }) };
}

describe("TUI confirmation screen", () => {
  it("groups the selected Installations by planned action under a heading, then lists how to undo each", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);
    resize(stdout, { columns: 240, rows: 40 });

    await press(stdin, "r", ENTER);

    const target = join(config.home, ".agents", "skills", "find-skills");
    const lines = lastFrame()!.split("\n").map((line) => line.trim());
    const after = (heading: string) => lines[lines.indexOf(heading) + 1];
    expect(lines).toContain("Remove 3 Installations?");
    expect(after("Uninstall Plugins (1)")).toBe(
      "idle@market  Uninstall with claude plugin uninstall idle@market --scope user",
    );
    expect(after("Remove links (1)")).toBe(`find-skills  Remove the link only, keeping ${target}`);
    expect(after("Move to trash (1)")).toBe(
      `ux-writing  Move ${join(config.path, "skills", "ux-writing")} to the system trash`,
    );
    expect(lines.slice(lines.indexOf("Undo") + 1, lines.indexOf("Undo") + 4)).toEqual([
      "claude plugin install idle@market --scope user",
      `ln -s '${target}' '${join(config.path, "skills", "find-skills")}'`,
      "ux-writing: restore it from the system trash",
    ]);
    expect(lastFrame()).not.toContain("◉");
  });

  it("reviews a selection made in the same burst of keys", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, `r${ENTER}`);

    expect(lastFrame()).toContain("Remove 3 Installations?");
  });

  it("asks for a selection when reviewing with nothing selected", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun cleanup={unexpectedCleanup} />);

    await press(stdin, ENTER);

    expect(lastFrame()).toContain("Select at least one Installation to review.");
    expect(lastFrame()).toContain("idle@market");
  });

  it("goes back to the list with the selection unchanged", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={unexpectedCleanup} />);

    await press(stdin, "r", DOWN, " ", ENTER, ESCAPE);

    expect(selected(lastFrame()!)).toEqual(["idle@market", "ux-writing"]);
  });

  it("offers no way past the confirmation screen in a dry run", async () => {
    const { config, result } = await cleanupReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun cleanup={unexpectedCleanup} />);

    await press(stdin, "r", ENTER, ENTER, "y");

    expect(lastFrame()).toContain("Dry run: nothing will be changed");
    expect(lastFrame()).not.toContain("Remove 3 Installations?");
    expect(lastFrame()).toContain("ux-writing: restore it from the system trash");
    expect(lastFrame()).not.toContain("y remove");
  });
});

describe("TUI Cleanup", () => {
  it("runs the Cleanup on y and lists each Installation with its outcome", async () => {
    const { config, result } = await cleanupReport();
    const trash = fakeTrash(join(config.home, ".Trash"));
    const run = (selection: Installation[]) =>
      cleanup(selection, { configDir: config.path, trash: trash.move, runClaude: fakeClaude().run });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={run} />);
    resize(stdout, { columns: 240, rows: 40 });

    await press(stdin, "r", ENTER);
    expect(lastFrame()).toContain("y remove");
    await press(stdin, "y");
    await settle();

    const target = join(config.home, ".agents", "skills", "find-skills");
    const link = join(config.path, "skills", "find-skills");
    const folder = join(config.path, "skills", "ux-writing");
    const summary = [
      "Cleanup of 3 Installations: 3 removed, 0 failed",
      "",
      "✔ removed  idle@market",
      "✔ removed  find-skills",
      "✔ removed  ux-writing",
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
    expect(lastFrame()).toContain(summary.join("\n"));
    expect(trash.moves).toEqual([folder]);
  });

  it("marks each Installation removed or failed, with the reason for a failure", async () => {
    const { config, result } = await cleanupReport();
    const folder = join(config.path, "skills", "ux-writing");
    const trash = fakeTrash(join(config.home, ".Trash"), { failOn: [folder] });
    const run = (selection: Installation[]) =>
      cleanup(selection, { configDir: config.path, trash: trash.move, runClaude: fakeClaude().run });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun={false} cleanup={run} />);
    resize(stdout, { columns: 240, rows: 40 });

    await press(stdin, "r", ENTER, "y");
    await settle();

    const lines = lastFrame()!.split("\n");
    expect(lines).toContain("Cleanup of 3 Installations: 2 removed, 1 failed");
    expect(lines).toContain("✔ removed  find-skills");
    const failed = lines.indexOf("✖ failed   ux-writing");
    expect(lines[failed + 1]).toBe(`    could not move ${folder} to the trash`);
    expect(lastFrame()).not.toContain("Moved to the system trash");
  });
});

describe("TUI groups", () => {
  it("counts Installations per Usage Status, the recommended ones, and the selected ones", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun cleanup={unexpectedCleanup} />);

    expect(lastFrame()!.split("\n")[1]).toMatch(/^3 Unused {2}1 Used · 2 recommended\s+0 selected$/);

    await press(stdin, "r");

    expect(lastFrame()!.split("\n")[1]).toMatch(/\s2 selected$/);
  });

  it("lists Installations under a header per Usage Status that the cursor skips", async () => {
    const { config, result } = await exampleReport();
    const { lastFrame, stdin } = render(<App report={result} configDir={config.path} now={now} dryRun cleanup={unexpectedCleanup} />);
    const lines = () => lastFrame()!.split("\n");

    expect(lines().map((line) => line.trim())).toEqual(expect.arrayContaining(["Unused  3", "Used  1"]));

    await press(stdin, DOWN, DOWN, DOWN);

    const cursorLine = lines().findIndex((line) => line.startsWith("›"));
    expect(lines()[cursorLine]).toContain("vercel@market");
    expect(lines()[cursorLine - 1]!.trim()).toBe("Used  1");
  });
});

describe("TUI detail panel", () => {
  it("shows a Linked Skill's target and that a Synced Skill cannot be removed", async () => {
    const config = await fakeConfigDir();
    const target = join(config.home, ".agents", "skills", "find-skills");
    await config.linkedSkill("find-skills", { target });
    await config.syncedSkill("brand-voice");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("hello", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ ...config.paths, now });
    const { lastFrame, stdin, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun cleanup={unexpectedCleanup} />);
    resize(stdout, { columns: 200, rows: 40 });
    await settle();
    const withCursorOn = async (name: string) => {
      for (let step = 0; step < 2 && !cursorLine(lastFrame()!).includes(name); step++) await press(stdin, DOWN);
      return lastFrame()!;
    };

    const linked = await withCursorOn("find-skills");
    expect(linked).toContain(`Links to ${target}`);
    expect(linked).toContain("Unused  No Use since 2026-09-28");
    expect(linked).not.toContain("cannot be removed");

    await press(stdin, UP);
    const synced = await withCursorOn("brand-voice");
    expect(synced).toContain("Managed by claude.ai, cannot be removed");
    expect(synced).not.toContain(`Links to ${target}`);
  });
});

describe("TUI layout", () => {
  it("keeps every line on one terminal row, truncating long names with an ellipsis", async () => {
    const config = await fakeConfigDir();
    const longName = `a-skill-with-a-name-far-too-long-for-the-name-column-${"x".repeat(60)}`;
    await config.linkedSkill(longName, { target: join(config.home, "repositories", "y".repeat(120)) });
    await config.plugin("vercel@market", { skills: ["deploy"] });
    await config.syncedSkill("brand-voice");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      userPrompt("ship it", "2026-09-28T07:15:00.000Z"),
    ]);
    const result = await report({ ...config.paths, now });

    for (const columns of [100, 60]) {
      const { lastFrame, stdout } = render(<App report={result} configDir={config.path} now={now} dryRun cleanup={unexpectedCleanup} />);
      resize(stdout, { columns, rows: 40 });
      await settle();

      const lines = plain(lastFrame()!).split("\n");
      expect(lines.every((line) => line.length <= columns)).toBe(true);
      expect(lines.find((line) => line.includes("a-skill-with-a-name"))).toContain("…");
    }
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

function resize(stdout: NodeJS.EventEmitter, { columns, rows }: { columns: number; rows: number }) {
  Object.defineProperty(stdout, "columns", { value: columns, configurable: true });
  Object.defineProperty(stdout, "rows", { value: rows, configurable: true });
  stdout.emit("resize");
}

function cursorLine(frame: string): string {
  return frame.split("\n").find((line) => line.startsWith("›")) ?? "";
}

function plain(frame: string): string {
  return frame.replace(/\u001B\[[0-9;]*m/g, "");
}

function unwrapped(frame: string): string {
  return frame.replace(/\s+/g, " ");
}

function selected(frame: string): string[] {
  return frame
    .split("\n")
    .filter((line) => line.includes("◉"))
    .map((line) => line.match(/\S+@\S+|anthropic-skills:\S+|ux-writing|find-skills/)![0]);
}
