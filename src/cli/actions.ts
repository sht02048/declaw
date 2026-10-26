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
  }
}
