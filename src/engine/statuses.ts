export type Status = "unused" | "used" | "too-new";

interface Judged {
  installedAt: Date | null;
  lastUse: Date | null;
}

export function statusOf(installation: Judged, periodStart: Date | null): Status {
  if (periodStart === null) return "too-new";
  const { installedAt } = installation;
  if (installedAt !== null && installedAt > periodStart) return "too-new";
  return installation.lastUse === null ? "unused" : "used";
}
