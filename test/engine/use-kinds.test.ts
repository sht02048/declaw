import { describe, expect, it } from "vitest";
import { report, type Plugin, type Report } from "../../src/engine/index.js";
import { agentToolCall, fakeConfigDir } from "../support/fake-config-dir.js";

const now = new Date("2026-10-26T00:00:00.000Z");

function plugins(result: Report): Plugin[] {
  return result.installations.filter((installation) => installation.kind === "plugin");
}

describe("report: agent Uses", () => {
  it("counts Agent and Task tool calls for a plugin's subagent type as Uses of that agent", async () => {
    const config = await fakeConfigDir();
    await config.plugin("omc-tools@omc", {
      manifest: { name: "oh-my-claudecode" },
      agents: ["verifier"],
    });
    await config.transcript({ project: "/work/app", session: "s1" }, [
      agentToolCall("oh-my-claudecode:verifier", "2026-10-05T09:00:00.000Z"),
      agentToolCall("oh-my-claudecode:verifier", "2026-10-09T09:00:00.000Z", { tool: "Task" }),
    ]);

    const result = await report({ configDir: config.path, now });

    expect(plugins(result)[0]).toMatchObject({
      name: "omc-tools@omc",
      uses: 2,
      lastUse: new Date("2026-10-09T09:00:00.000Z"),
      components: [
        {
          kind: "agent",
          name: "oh-my-claudecode:verifier",
          uses: 2,
          lastUse: new Date("2026-10-09T09:00:00.000Z"),
        },
      ],
    });
  });
});
