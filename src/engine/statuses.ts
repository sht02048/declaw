export type Status = "unused" | "used" | "too-new" | "unknown";

interface Judgeable {
  installedAt: Date | null;
  lastUse: Date | null | "unknown";
  enabled?: boolean | "unknown";
  synced?: true;
}

export function judge<T extends Judgeable>(
  installation: T,
  periodStart: Date | null,
): T & { status: Status; recommended: boolean } {
  const status = statusOf(installation, periodStart);
  const recommended =
    (status === "unused" || installation.enabled === false) &&
    status !== "too-new" &&
    installation.synced !== true;
  return { ...installation, status, recommended };
}

export function sortForCleanup<T extends Judgeable & { status: Status }>(installations: T[]): T[] {
  return installations.toSorted((a, b) => {
    const unusedFirst = Number(b.status === "unused") - Number(a.status === "unused");
    if (unusedFirst !== 0) return unusedFirst;
    return a.status === "unused"
      ? oldestFirst(a.installedAt, b.installedAt)
      : oldestFirst(a.lastUse, b.lastUse);
  });
}

function oldestFirst(a: Date | null | "unknown", b: Date | null | "unknown"): number {
  return timeOf(a) - timeOf(b) || 0;
}

function timeOf(date: Date | null | "unknown"): number {
  return date instanceof Date ? date.getTime() : -Infinity;
}

function statusOf({ installedAt, lastUse }: Judgeable, periodStart: Date | null): Status {
  if (periodStart !== null && installedAt !== null && installedAt > periodStart) return "too-new";
  if (lastUse === "unknown") return "unknown";
  if (lastUse !== null) return "used";
  return periodStart === null ? "too-new" : "unused";
}
