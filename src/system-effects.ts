import trash from "trash";
import type { TrashMover } from "./engine/index.js";

// Globbing is off so a skill name with glob characters can never match another path.
export const systemTrash: TrashMover = (path) => trash(path, { glob: false });
