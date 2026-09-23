/** Preserve phase order while replacing stale starts with the latest recorded state. */
export function latestPhases<T extends { phase: string }>(history: T[]): T[] {
  return [...new Map(history.map(entry => [entry.phase, entry])).values()];
}