export function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
