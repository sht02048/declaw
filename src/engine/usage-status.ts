import type { Unknown } from "./read-status.js";

export type UsageStatus = "unused" | "used" | Unknown;

interface Judgeable {
  installedAt: Date | null;
  lastUse: Date | null | Unknown;
  enabled?: boolean | Unknown;
  synced?: true;
}

export function withUsageStatus<T extends Judgeable>(
  installation: T,
): T & { usageStatus: UsageStatus; recommended: boolean } {
  const usageStatus = usageStatusOf(installation);
  const recommended =
    (usageStatus === "unused" || installation.enabled === false) && installation.synced !== true;
  return { ...installation, usageStatus, recommended };
}

export function sortForCleanup<T extends Judgeable & { usageStatus: UsageStatus }>(installations: T[]): T[] {
  return installations.toSorted((a, b) => {
    const unusedFirst = Number(b.usageStatus === "unused") - Number(a.usageStatus === "unused");
    if (unusedFirst !== 0) return unusedFirst;
    return a.usageStatus === "unused"
      ? oldestFirst(a.installedAt, b.installedAt)
      : oldestFirst(a.lastUse, b.lastUse);
  });
}

function oldestFirst(a: Date | null | Unknown, b: Date | null | Unknown): number {
  return timeOf(a) - timeOf(b) || 0;
}

function timeOf(date: Date | null | Unknown): number {
  return date instanceof Date ? date.getTime() : -Infinity;
}

function usageStatusOf({ lastUse }: Judgeable): UsageStatus {
  if (lastUse === "unknown") return "unknown";
  return lastUse === null ? "unused" : "used";
}
