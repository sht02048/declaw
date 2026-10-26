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

function statusOf(installation: Judgeable, periodStart: Date | null): Status {
  if (periodStart === null) return "too-new";
  const { installedAt } = installation;
  if (installedAt !== null && installedAt > periodStart) return "too-new";
  return installation.lastUse === null ? "unused" : "used";
}
