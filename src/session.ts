/**
 * Session persistence (PROTOCOL.md §3, §7): after create/join we store the
 * room credentials in sessionStorage so a page reload can reconnect over
 * WebSocket without going through REST again.
 */

/** Credentials + identity persisted across page reloads within the tab. */
export interface StoredSession {
  roomId: string;
  playerId: string;
  playerIndex: number;
  name: string;
}

const STORAGE_KEY = 'billiards.session';

/** Persists the session; failures (e.g. storage disabled) are non-fatal. */
export function saveSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable: reconnection after reload simply won't be offered.
  }
}

/** Loads and validates the stored session, or returns null. */
export function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.roomId === 'string' &&
      typeof candidate.playerId === 'string' &&
      typeof candidate.playerIndex === 'number' &&
      typeof candidate.name === 'string'
    ) {
      return {
        roomId: candidate.roomId,
        playerId: candidate.playerId,
        playerIndex: candidate.playerIndex,
        name: candidate.name,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Removes any stored session (used when a game finishes). */
export function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
