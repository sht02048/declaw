const birthTimes = new Map<string, number>();

export function setBirthTime(path: string, at: Date | null): void {
  birthTimes.set(path, at === null ? 0 : at.getTime());
}

export function birthTimeOf(path: string): number | undefined {
  return birthTimes.get(path);
}
