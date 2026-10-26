import { vi } from "vitest";

// Linux cannot set a file's birth time and macOS moves it along with mtime, so fixtures
// record the creation time they want and lstat reports it.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const { birthTimeOf } = await import("./birth-times.js");
  const lstat: typeof actual.lstat = (async (path: Parameters<typeof actual.lstat>[0], options?: object) => {
    const stats = await actual.lstat(path, options as never);
    const birthtimeMs = birthTimeOf(String(path));
    if (birthtimeMs !== undefined) {
      stats.birthtimeMs = birthtimeMs;
      stats.birthtime = new Date(birthtimeMs);
    }
    return stats;
  }) as typeof actual.lstat;
  return { ...actual, lstat, default: { ...actual, lstat } };
});
