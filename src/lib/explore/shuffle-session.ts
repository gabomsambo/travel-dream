export type ShuffleVerdict = 'dream' | 'next';

export interface ShuffleHistoryEntry {
  id: string;
  verdict: ShuffleVerdict;
}

export interface ShuffleSession {
  index: number;
  history: ShuffleHistoryEntry[];
  finishedEarly: boolean;
}

export function dreamsFromHistory(history: ShuffleHistoryEntry[]): string[] {
  return history.filter((h) => h.verdict === 'dream').map((h) => h.id);
}

export function isDeckComplete(session: ShuffleSession, deckLength: number): boolean {
  return session.finishedEarly || session.index >= deckLength;
}

export function applyVerdict(session: ShuffleSession, id: string, verdict: ShuffleVerdict): ShuffleSession {
  return {
    ...session,
    index: session.index + 1,
    history: [...session.history, { id, verdict }],
  };
}

export function finishEarly(session: ShuffleSession): ShuffleSession {
  return { ...session, finishedEarly: true };
}

export function undoVerdict(session: ShuffleSession): ShuffleSession | null {
  if (session.history.length === 0) return null;
  return {
    ...session,
    finishedEarly: false,
    index: Math.max(0, session.index - 1),
    history: session.history.slice(0, -1),
  };
}

/** Skips ids already in the target collection so a retry cannot duplicate rows. */
export function dreamIdsToAdd(dreamIds: string[], existingPlaceIds: string[]): string[] {
  const existing = new Set(existingPlaceIds);
  return dreamIds.filter((id) => !existing.has(id));
}
