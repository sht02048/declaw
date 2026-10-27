import type { PlannedAction } from "../engine/index.js";

export interface ActionText {
  describe: string;
  undo: string;
  undoInSummary: string;
}

export const UNDO_HEADINGS: Record<PlannedAction["kind"], string> = {
  "uninstall-plugin": "To reinstall a removed Plugin:",
  "remove-link": "To restore a removed Linked Skill:",
  "move-to-trash": "Moved to the system trash, where they can be restored:",
  "remove-mcp-server": "To add back a removed Standalone MCP Server from its backup:",
};

export const UNDO_NOTES: Partial<Record<PlannedAction["kind"], string>> = {
  "remove-mcp-server": "A server that signs in with OAuth needs a new login in /mcp after it is added back.",
};

export function actionText(action: PlannedAction): ActionText {
  switch (action.kind) {
    case "uninstall-plugin":
      return {
        describe: `Uninstall with claude plugin uninstall ${action.name} --scope ${action.scope}`,
        undo: action.reinstallCommand,
        undoInSummary: action.reinstallCommand,
      };
    case "remove-link":
      return {
        describe: `Remove the link only, keeping ${action.target}`,
        undo: action.relinkCommand,
        undoInSummary: action.relinkCommand,
      };
    case "move-to-trash":
      return {
        describe: `Move ${action.path} to the system trash`,
        undo: "restore it from the system trash",
        undoInSummary: action.path,
      };
    case "remove-mcp-server":
      return {
        describe: `Back up to ${action.backupPath}, then remove with claude mcp remove ${action.name} --scope ${action.scope}`,
        undo: action.addBackCommand,
        undoInSummary: action.addBackCommand,
      };
  }
}
