export type Status = "unused" | "used" | "too-new";

interface Judgeable {
  installedAt: Date | null;
  lastUse: Date | null;
  enabled?: boolean;
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

function oldestFirst(a: Date | null, b: Date | null): number {
  return (a?.getTime() ?? -Infinity) - (b?.getTime() ?? -Infinity) || 0;
}

function statusOf(installation: Judgeable, periodStart: Date | null): Status {
  if (periodStart === null) return "too-new";
  const { installedAt } = installation;
  if (installedAt !== null && installedAt > periodStart) return "too-new";
  return installation.lastUse === null ? "unused" : "used";
}
