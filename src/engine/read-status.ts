export type ReadStatus =
  | { status: "readable" }
  | { status: "partial"; reason: string }
  | { status: "unreadable"; reason: string };

export const readable: ReadStatus = { status: "readable" };

export function partiallyReadable(reason: string): ReadStatus {
  return { status: "partial", reason };
}

export function unreadable(reason: string): ReadStatus {
  return { status: "unreadable", reason };
}
