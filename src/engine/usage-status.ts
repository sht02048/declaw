import type { Unknown } from "./read-status.js";

export type UsageStatus = "unused" | "used" | "too-new" | Unknown;

interface Judgeable {
  installedAt: Date | null;
  lastUse: Date | null | Unknown;
  enabled?: boolean | Unknown;
  synced?: true;
}

export function withUsageStatus<T extends Judgeable>(
  installation: T,
  periodStart: Date | null,
): T & { usageStatus: UsageStatus; recommended: boolean } {
  const usageStatus = usageStatusOf(installation, periodStart);
  const recommended =
    (usageStatus === "unused" || installation.enabled === false) &&
    usageStatus !== "too-new" &&
    installation.synced !== true;
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

function usageStatusOf({ installedAt, lastUse }: Judgeable, periodStart: Date | null): UsageStatus {
  if (periodStart !== null && installedAt !== null && installedAt > periodStart) return "too-new";
  if (lastUse === "unknown") return "unknown";
  if (lastUse !== null) return "used";
  return periodStart === null ? "too-new" : "unused";
}
