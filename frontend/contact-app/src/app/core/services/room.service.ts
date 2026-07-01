import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Player } from '../models/ws-types';
import { SessionService } from './session.service';
import { WebSocketService } from './websocket.service';

export interface RoomContext {
  roomCode: string;
  nickname: string;
  isHost: boolean;
  connectionId: string;
}

@Injectable({ providedIn: 'root' })
export class RoomService {
  private readonly ws = inject(WebSocketService);
  private readonly session = inject(SessionService);
  private readonly roomSubject = new BehaviorSubject<RoomContext | null>(null);
  private readonly playersSubject = new BehaviorSubject<Player[]>([]);
  private readonly pendingSubject = new BehaviorSubject<Player[]>([]);
  private readonly joinRejectedSubject = new BehaviorSubject<string | null>(null);

  readonly room$ = this.roomSubject.asObservable();
  readonly players$ = this.playersSubject.asObservable();
  readonly pending$ = this.pendingSubject.asObservable();
  readonly joinRejected$ = this.joinRejectedSubject.asObservable();

  get room(): RoomContext | null {
    return this.roomSubject.value;
  }

  get players(): Player[] {
    return this.playersSubject.value;
  }

  async createRoom(nickname: string): Promise<string> {
    await this.ws.connect();
    this.reset();
    this.ws.send('CREATE_ROOM', { nickname });
    return new Promise((resolve, reject) => {
      const sub = this.ws.onAction<{ roomCode: string; connectionId: string; isHost: boolean }>('ROOM_CREATED').subscribe({
        next: (payload) => {
          this.roomSubject.next({
            roomCode: payload.roomCode,
            nickname,
            isHost: payload.isHost,
            connectionId: payload.connectionId,
          });
          this.session.save({
            roomCode: payload.roomCode,
            nickname,
            isHost: payload.isHost,
          });
          this.playersSubject.next([
            {
              connectionId: payload.connectionId,
              nickname,
              isHost: true,
              joinOrder: 0,
              status: 'approved',
            },
          ]);
          sub.unsubscribe();
          resolve(payload.roomCode);
        },
        error: reject,
      });
      this.ws.onAction<{ message: string }>('ERROR').subscribe((err) => {
        sub.unsubscribe();
        reject(new Error(err.message));
      });
    });
  }

  async joinRoom(nickname: string, roomCode: string): Promise<void> {
    await this.ws.connect();
    this.reset();
    this.ws.send('JOIN_ROOM', { nickname, roomCode: roomCode.toUpperCase() });
    return new Promise((resolve, reject) => {
      const pendingSub = this.ws.onAction<{ roomCode: string; connectionId: string; pending?: boolean }>('JOIN_PENDING').subscribe((payload) => {
        if (!payload.pending) {
          this.roomSubject.next({
            roomCode: payload.roomCode,
            nickname,
            isHost: false,
            connectionId: payload.connectionId,
          });
          this.session.save({
            roomCode: payload.roomCode,
            nickname,
            isHost: false,
          });
          this.playersSubject.next([
            {
              connectionId: payload.connectionId,
              nickname,
              isHost: false,
              joinOrder: -1,
              status: 'pending',
            },
          ]);
          pendingSub.unsubscribe();
          resolve();
        }
      });
      this.ws.onAction<{ message: string }>('ERROR').subscribe((err) => {
        pendingSub.unsubscribe();
        reject(new Error(err.message));
      });
      this.ws.onAction<{ message: string }>('JOIN_REJECTED').subscribe((err) => {
        pendingSub.unsubscribe();
        reject(new Error(err.message));
      });
    });
  }

  async tryRestoreSession(roomCode: string): Promise<boolean> {
    const code = roomCode.toUpperCase();
    const room = this.room;
    if (room?.roomCode === code) {
      await this.ws.connect();
      return true;
    }

    const saved = this.session.load();
    if (!saved || saved.roomCode.toUpperCase() !== code) {
      return false;
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await this.rejoinRoom(saved.nickname, roomCode);
        return true;
      } catch {
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }
    return false;
  }

  async tryAutoReconnect(): Promise<string | null> {
    const saved = this.session.load();
    if (!saved?.roomCode || !saved.nickname) return null;
    const ok = await this.tryRestoreSession(saved.roomCode);
    return ok ? saved.roomCode.toUpperCase() : null;
  }

  async rejoinRoom(nickname: string, roomCode: string): Promise<void> {
    await this.ws.connect();
    const code = roomCode.toUpperCase();
    this.ws.send('REJOIN_ROOM', { nickname, roomCode: code });

    return new Promise((resolve, reject) => {
      const okSub = this.ws
        .onAction<{
          roomCode: string;
          connectionId: string;
          nickname: string;
          isHost: boolean;
          players: Player[];
        }>('REJOIN_OK')
        .subscribe((payload) => {
          if (payload.roomCode !== code) return;
          this.roomSubject.next({
            roomCode: payload.roomCode,
            nickname: payload.nickname,
            isHost: payload.isHost,
            connectionId: payload.connectionId,
          });
          this.playersSubject.next(payload.players);
          this.session.save({
            roomCode: payload.roomCode,
            nickname: payload.nickname,
            isHost: payload.isHost,
          });
          okSub.unsubscribe();
          errSub.unsubscribe();
          resolve();
        });

      const errSub = this.ws.onAction<{ message: string }>('ERROR').subscribe((err) => {
        okSub.unsubscribe();
        errSub.unsubscribe();
        reject(new Error(err.message));
      });
    });
  }

  listenForLobbyUpdates(): Observable<void> {
    return new Observable((observer) => {
      const subs = [
        this.ws.onAction<Player>('PLAYER_APPROVED').subscribe((p) => {
          this.playersSubject.next([...this.playersSubject.value.filter((x) => x.connectionId !== p.connectionId), p]);
          this.pendingSubject.next(this.pendingSubject.value.filter((x) => x.connectionId !== p.connectionId));
          observer.next();
        }),
        this.ws.onAction<{ connectionId: string; nickname: string; pending?: boolean }>('JOIN_PENDING').subscribe((p) => {
          if (p.pending) {
            const pendingPlayer: Player = {
              connectionId: p.connectionId,
              nickname: p.nickname,
              isHost: false,
              joinOrder: -1,
              status: 'pending',
            };
            this.pendingSubject.next([...this.pendingSubject.value.filter((x) => x.connectionId !== p.connectionId), pendingPlayer]);
            observer.next();
          }
        }),
        this.ws.onAction<{ connectionId: string }>('PLAYER_REJECTED').subscribe((p) => {
          this.pendingSubject.next(this.pendingSubject.value.filter((x) => x.connectionId !== p.connectionId));
          observer.next();
        }),
        this.ws.onAction<{ message: string }>('JOIN_REJECTED').subscribe((payload) => {
          this.handleJoinRejected(payload.message);
          observer.next();
        }),
        this.ws.onAction<{ connectionId: string; nickname: string }>('PLAYER_DISCONNECTED').subscribe(() => {
          observer.next();
        }),
        this.ws.onAction<{ connectionId: string; nickname: string }>('PLAYER_LEFT').subscribe((p) => {
          observer.next();
        }),
        this.ws.onAction<{ newHostId: string; newHostNickname: string }>('HOST_CHANGED').subscribe((p) => {
          const room = this.roomSubject.value;
          if (room) {
            const isNewHost = room.connectionId === p.newHostId;
            this.roomSubject.next({ ...room, isHost: isNewHost });
            this.session.save({
              roomCode: room.roomCode,
              nickname: room.nickname,
              isHost: isNewHost,
            });
            this.playersSubject.next(
              this.playersSubject.value.map((pl) => ({
                ...pl,
                isHost: pl.connectionId === p.newHostId,
              }))
            );
          }
          observer.next();
        }),
        this.ws.onAction<Player>('PLAYER_REJOINED').subscribe((p) => {
          this.playersSubject.next([
            ...this.playersSubject.value.filter((x) => x.connectionId !== p.connectionId && x.nickname !== p.nickname),
            p,
          ]);
          observer.next();
        }),
      ];
      return () => subs.forEach((s) => s.unsubscribe());
    });
  }

  approvePlayer(connectionId: string): void {
    const room = this.room;
    if (!room?.isHost) return;
    this.ws.send('APPROVE_PLAYER', { targetConnectionId: connectionId }, room.roomCode);
  }

  rejectPlayer(connectionId: string): void {
    const room = this.room;
    if (!room?.isHost) return;
    this.pendingSubject.next(this.pendingSubject.value.filter((x) => x.connectionId !== connectionId));
    this.ws.send('REJECT_PLAYER', { targetConnectionId: connectionId }, room.roomCode);
  }

  clearJoinRejected(): void {
    this.joinRejectedSubject.next(null);
  }

  isAwaitingApproval(): boolean {
    const room = this.room;
    if (!room || room.isHost) return false;
    const me = this.players.find((p) => p.connectionId === room.connectionId);
    return me?.status === 'pending';
  }

  private handleJoinRejected(message: string): void {
    this.reset();
    this.joinRejectedSubject.next(message);
  }

  getInviteUrl(roomCode: string): string {
    return `${window.location.origin}/?room=${roomCode}`;
  }

  getWhatsAppUrl(roomCode: string): string {
    const text = encodeURIComponent(`Join my Contact game! Room code: ${roomCode}\n${this.getInviteUrl(roomCode)}`);
    return `https://wa.me/?text=${text}`;
  }

  syncPlayersFromGame(players: Player[]): void {
    this.playersSubject.next(players);
  }

  reset(): void {
    this.roomSubject.next(null);
    this.playersSubject.next([]);
    this.pendingSubject.next([]);
    this.joinRejectedSubject.next(null);
    this.session.clear();
  }
}
