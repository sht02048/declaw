import { mkdir, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ClaudeRunner, TrashMover } from "../../src/engine/index.js";

export interface FakeTrash {
  dir: string;
  moves: string[];
  move: TrashMover;
}

export function fakeTrash(dir: string, { failOn = [] as string[] } = {}): FakeTrash {
  const moves: string[] = [];
  return {
    dir,
    moves,
    move: async (path) => {
      if (failOn.includes(path)) throw new Error(`could not move ${path} to the trash`);
      moves.push(path);
      await mkdir(dir, { recursive: true });
      await rename(path, join(dir, basename(path)));
    },
  };
}

export interface FakeClaude {
  calls: string[][];
  run: ClaudeRunner;
}

export function fakeClaude(): FakeClaude {
  const calls: string[][] = [];
  return {
    calls,
    run: async (args) => {
      calls.push(args);
      return { exitCode: 0, output: "" };
    },
  };
}
