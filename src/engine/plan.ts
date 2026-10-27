import { join } from "node:path";
import type { Installation } from "./index.js";

export interface UninstallPlugin {
  kind: "uninstall-plugin";
  name: string;
  scope: "user";
  reinstallCommand: string;
}

export interface RemoveLink {
  kind: "remove-link";
  name: string;
  path: string;
  target: string;
  relinkCommand: string;
}

export interface MoveToTrash {
  kind: "move-to-trash";
  name: string;
  path: string;
}

export interface RemoveMcpServer {
  kind: "remove-mcp-server";
  name: string;
  scope: "user";
  backupPath: string;
  addBackCommand: string;
}

export type PlannedAction = UninstallPlugin | RemoveLink | MoveToTrash | RemoveMcpServer;

export interface PlanOptions {
  configDir: string;
  backupDir: string;
}

export function isRemovable(installation: Installation): boolean {
  return installation.kind !== "standalone-skill" || installation.synced !== true;
}

export function planCleanup(selection: Installation[], { configDir, backupDir }: PlanOptions): PlannedAction[] {
  return selection.filter(isRemovable).map((installation): PlannedAction => {
    if (installation.kind === "plugin") {
      return {
        kind: "uninstall-plugin",
        name: installation.name,
        scope: "user",
        reinstallCommand: `claude plugin install ${installation.name} --scope user`,
      };
    }
    if (installation.kind === "standalone-mcp-server") {
      const backupPath = join(backupDir, `${installation.name.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
      const name = /^[A-Za-z0-9._-]+$/.test(installation.name) ? installation.name : shellQuote(installation.name);
      return {
        kind: "remove-mcp-server",
        name: installation.name,
        scope: "user",
        backupPath,
        addBackCommand: `claude mcp add-json ${name} "$(cat ${shellQuote(backupPath)})" --scope user`,
      };
    }
    const path = join(configDir, "skills", installation.name);
    if (installation.linked) {
      const { target } = installation.linked;
      return {
        kind: "remove-link",
        name: installation.name,
        path,
        target,
        relinkCommand: `ln -s ${shellQuote(target)} ${shellQuote(path)}`,
      };
    }
    return { kind: "move-to-trash", name: installation.name, path };
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
