import { describe, expect, it } from "vitest";
import { report } from "../../src/engine/index.js";
import { fakeConfigDir, skillToolCall } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

describe("report: Standalone Skill Usage Stats", () => {
  it("counts Skill tool calls as Uses of a Standalone Skill", async () => {
    const config = await fakeConfigDir();
    await config.standaloneSkill("linear-ticket");
    await config.transcript({ project: "/work/app", session: "s1" }, [
      skillToolCall("linear-ticket", "2026-10-08T09:00:00.000Z"),
      skillToolCall("linear-ticket", "2026-10-09T10:30:00.000Z"),
    ]);

    const result = await report({ configDir: config.path, now });

    expect(result.installations).toEqual([
      {
        kind: "standalone-skill",
        name: "linear-ticket",
        uses: 2,
        lastUse: new Date("2026-10-09T10:30:00.000Z"),
      },
    ]);
  });
});
