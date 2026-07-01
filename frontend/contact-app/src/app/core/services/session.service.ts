import { Injectable } from '@angular/core';

export interface StoredSession {
  roomCode: string;
  nickname: string;
  isHost: boolean;
}

const SESSION_KEY = 'contact-game-session';

@Injectable({ providedIn: 'root' })
export class SessionService {
  save(session: StoredSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  load(): StoredSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredSession;
      if (!parsed.roomCode || !parsed.nickname) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  clear(): void {
    localStorage.removeItem(SESSION_KEY);
  }
}
