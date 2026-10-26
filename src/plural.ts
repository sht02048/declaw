export function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

export function countOf(count: number, noun: string): string {
  return `${count} ${plural(count, noun)}`;
}
