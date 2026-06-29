import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription, interval } from 'rxjs';
import {
  CLUE_TIMER_SECONDS,
  CONTACT_COUNTDOWN_SECONDS,
  createInitialState,
  GamePhase,
  GameState,
  isValidSecretWord,
  Player,
  RelayPayload,
  VOTE_TIMEOUT_SECONDS,
} from '../models/ws-types';
import { RoomService } from './room.service';
import { WebSocketService } from './websocket.service';

@Injectable({ providedIn: 'root' })
export class GameEngineService implements OnDestroy {
  private readonly ws = inject(WebSocketService);
  private readonly roomService = inject(RoomService);

  private readonly stateSubject = new BehaviorSubject<GameState | null>(null);
  private readonly overlaySubject = new BehaviorSubject<string | null>(null);
  private readonly clueInputOpenSubject = new BehaviorSubject<boolean>(false);
  private readonly contactCountSubject = new BehaviorSubject<number | null>(null);
  private readonly clueSecondsSubject = new BehaviorSubject<number | null>(null);

  private tickSub: Subscription | null = null;
  private voteSub: Subscription | null = null;
  private hostRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private messageSub: Subscription | null = null;

  readonly state$ = this.stateSubject.asObservable();
  readonly overlay$ = this.overlaySubject.asObservable();
  readonly clueInputOpen$ = this.clueInputOpenSubject.asObservable();
  readonly contactCount$ = this.contactCountSubject.asObservable();
  readonly clueSeconds$ = this.clueSecondsSubject.asObservable();

  get state(): GameState | null {
    return this.stateSubject.value;
  }

  get isHost(): boolean {
    return this.roomService.room?.isHost ?? false;
  }

  get myId(): string | null {
    return this.roomService.room?.connectionId ?? this.ws.connectionId;
  }

  init(): void {
    if (this.messageSub) return;
    this.messageSub = this.ws.messages$.subscribe((msg) => this.handleMessage(msg.action, msg.payload));
  }

  startGame(): void {
    if (!this.isHost) return;
    const room = this.roomService.room;
    const players = this.roomService.players;
    if (!room || players.length < 2) return;

    const state = createInitialState(players, room.connectionId);
    state.phase = 'WORD_SETUP';
    this.setStateAndRelay('GAME_STARTED', state);
  }

  setSecretWord(word: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || state.phase !== 'WORD_SETUP') return;
    if (this.myId !== state.clueGiverId) return;
    const normalized = word.trim().toUpperCase();
    if (!isValidSecretWord(normalized)) return;

    if (this.isHost) {
      state.secretWord = normalized;
      state.revealedPrefix = normalized[0];
      state.phase = 'CLUE_PHASE';
      state.activeClue = undefined;
      this.setStateAndRelay('SECRET_WORD_SET', state);
    } else {
      this.ws.send('FORWARD_TO_HOST', {
        actionType: 'SECRET_WORD_SET',
        secretWord: normalized,
      }, room.roomCode);
    }
  }

  openClueInput(): void {
    const state = this.state;
    if (!state || state.phase !== 'CLUE_PHASE') return;
    if (this.myId === state.clueGiverId) return;
    this.clueInputOpenSubject.next(true);
    this.clueSecondsSubject.next(CLUE_TIMER_SECONDS);
    this.tickSub?.unsubscribe();
    this.tickSub = interval(1000).subscribe(() => {
      const current = this.clueSecondsSubject.value;
      if (current === null) return;
      if (current <= 1) {
        this.clueSecondsSubject.next(0);
        this.clueInputOpenSubject.next(false);
        this.tickSub?.unsubscribe();
      } else {
        this.clueSecondsSubject.next(current - 1);
      }
    });
  }

  submitClue(text: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || state.phase !== 'CLUE_PHASE') return;
    if (this.myId === state.clueGiverId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (this.isHost) {
      state.activeClue = {
        authorId: room.connectionId,
        authorNickname: room.nickname,
        text: trimmed,
      };
      state.clueDeadline = undefined;
      this.clueInputOpenSubject.next(false);
      this.clueSecondsSubject.next(null);
      this.setStateAndRelay('CLUE_SUBMITTED', state);
    } else {
      this.ws.send('FORWARD_TO_HOST', {
        actionType: 'CLUE_SUBMITTED',
        clueText: trimmed,
        authorId: room.connectionId,
        authorNickname: room.nickname,
      }, room.roomCode);
      this.clueInputOpenSubject.next(false);
    }
  }

  initiateContact(): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state?.activeClue || state.phase !== 'CLUE_PHASE') return;
    if (this.myId === state.clueGiverId) return;

    if (this.isHost) {
      state.phase = 'CONTACT_COUNTDOWN';
      state.contactInitiatorId = room!.connectionId;
      state.contactPartnerId = state.activeClue.authorId;
      state.contactDeadline = Date.now() + CONTACT_COUNTDOWN_SECONDS * 1000;
      this.startContactCountdown();
      this.setStateAndRelay('CONTACT_INITIATED', state);
    } else {
      this.ws.send('FORWARD_TO_HOST', {
        actionType: 'CONTACT_INITIATED',
        initiatorId: room!.connectionId,
      }, room!.roomCode);
    }
  }

  blockContact(blockWord: string): void {
    if (!this.isHost) return;
    const state = this.state;
    if (!state || state.phase !== 'CONTACT_COUNTDOWN' || !state.canBlock) return;
    if (this.myId !== state.clueGiverId) return;

    state.phase = 'BLOCKED';
    state.lastBlockWord = blockWord.trim();
    state.canBlock = false;
    state.contactDeadline = undefined;
    this.contactCountSubject.next(null);
    this.overlaySubject.next('BLOCKED');
    this.setStateAndRelay('CONTACT_BLOCKED', state);

    setTimeout(() => {
      this.overlaySubject.next(null);
      if (this.state) {
        this.state.phase = 'CLUE_PHASE';
        this.state.activeClue = undefined;
        this.setStateAndRelay('STATE_SYNC', this.state);
      }
    }, 2000);
  }

  castVote(matched: boolean): void {
    const room = this.roomService.room;
    if (!room) return;
    this.ws.send('CAST_VOTE', { matched }, room.roomCode);
  }

  requestHostStateRecovery(): void {
    const room = this.roomService.room;
    if (!room?.isHost) return;
    this.ws.send('REQUEST_HOST_STATE', {}, room.roomCode);
    this.hostRecoveryTimer = setTimeout(() => this.fallbackRecovery(), 5000);
  }

  respondToHostStateRequest(requesterId: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || room.isHost) return;
    if (state.phase === 'LOBBY') return;

    this.ws.send('HOST_STATE_RESPONSE', { targetHostId: requesterId, state }, room.roomCode);
  }

  ngOnDestroy(): void {
    this.tickSub?.unsubscribe();
    this.voteSub?.unsubscribe();
    this.messageSub?.unsubscribe();
    if (this.hostRecoveryTimer) clearTimeout(this.hostRecoveryTimer);
  }

  private handleMessage(action: string, payload: unknown): void {
    switch (action) {
      case 'RELAY':
        this.applyRelay(payload as RelayPayload);
        break;
      case 'VOTE_FORWARD':
        if (this.isHost) this.handleVoteForward(payload as { voterId: string; matched: boolean });
        break;
      case 'PLAYER_ACTION':
        if (this.isHost) this.handlePlayerAction(payload as Record<string, unknown>);
        break;
      case 'REQUEST_HOST_STATE':
        this.respondToHostStateRequest((payload as { requesterId: string }).requesterId);
        break;
      case 'HOST_STATE_RESPONSE':
        if (this.isHost) this.applyHostSnapshot((payload as { state: GameState }).state);
        break;
      case 'HOST_CHANGED':
        if (this.roomService.room?.isHost) {
          this.requestHostStateRecovery();
        }
        break;
    }
  }

  private applyRelay(relay: RelayPayload): void {
    if (this.isHost && relay.meta) {
      this.applyHostMetaAction(relay);
      return;
    }

    const incoming = relay.state;
    if (this.isHost) {
      this.stateSubject.next(incoming);
    } else {
      this.stateSubject.next(incoming);
      this.syncTimersFromState(incoming);
    }
  }

  private applyHostMetaAction(relay: RelayPayload): void {
    const state = this.state ?? relay.state;
    const meta = relay.meta ?? {};

    switch (relay.type) {
      case 'CLUE_SUBMITTED': {
        state.activeClue = {
          authorId: meta['authorId'] as string,
          authorNickname: meta['authorNickname'] as string,
          text: meta['clueText'] as string,
        };
        state.phase = 'CLUE_PHASE';
        break;
      }
      case 'CONTACT_INITIATED': {
        state.phase = 'CONTACT_COUNTDOWN';
        state.contactInitiatorId = meta['initiatorId'] as string;
        state.contactPartnerId = state.activeClue?.authorId;
        state.contactDeadline = Date.now() + CONTACT_COUNTDOWN_SECONDS * 1000;
        this.startContactCountdown();
        break;
      }
    }
    this.setStateAndRelay(relay.type, state);
  }

  private handlePlayerAction(action: Record<string, unknown>): void {
    const state = this.state;
    if (!state) return;

    switch (action['actionType']) {
      case 'SECRET_WORD_SET': {
        if (state.phase !== 'WORD_SETUP') return;
        if (action['senderId'] !== state.clueGiverId) return;
        const normalized = String(action['secretWord'] ?? '').toUpperCase();
        if (!isValidSecretWord(normalized)) return;
        state.secretWord = normalized;
        state.revealedPrefix = normalized[0];
        state.phase = 'CLUE_PHASE';
        state.activeClue = undefined;
        this.setStateAndRelay('SECRET_WORD_SET', state);
        break;
      }
      case 'CLUE_SUBMITTED':
        state.activeClue = {
          authorId: action['authorId'] as string,
          authorNickname: action['authorNickname'] as string,
          text: action['clueText'] as string,
        };
        state.phase = 'CLUE_PHASE';
        this.setStateAndRelay('CLUE_SUBMITTED', state);
        break;
      case 'CONTACT_INITIATED':
        state.phase = 'CONTACT_COUNTDOWN';
        state.contactInitiatorId = action['initiatorId'] as string;
        state.contactPartnerId = state.activeClue?.authorId;
        state.contactDeadline = Date.now() + CONTACT_COUNTDOWN_SECONDS * 1000;
        this.startContactCountdown();
        this.setStateAndRelay('CONTACT_INITIATED', state);
        break;
    }
  }

  private handleVoteForward(vote: { voterId: string; matched: boolean }): void {
    const state = this.state;
    if (!state || state.phase !== 'MATCH_VOTE') return;

    state.votes = state.votes ?? {};
    state.votes[vote.voterId] = vote.matched;

    const approved = state.players.filter((p) => p.status === 'approved');
    if (Object.keys(state.votes).length < approved.length) {
      this.stateSubject.next({ ...state });
      return;
    }

    this.finalizeVote(state);
  }

  private finalizeVote(state: GameState): void {
    const votes = Object.values(state.votes ?? {});
    const yes = votes.filter(Boolean).length;
    const no = votes.length - yes;
    const matched = yes > no;

    if (matched) {
      const nextLen = Math.min(state.revealedPrefix.length + 1, state.secretWord.length);
      state.revealedPrefix = state.secretWord.slice(0, nextLen);
      state.phase = 'LETTER_REVEAL';
      this.overlaySubject.next('SUCCESS');
      this.setStateAndRelay('MATCH_RESULT', state, { matched: true });

      setTimeout(() => {
        this.overlaySubject.next(null);
        if (state.revealedPrefix.length >= state.secretWord.length) {
          this.completeRound(state);
        } else {
          state.phase = 'CLUE_PHASE';
          state.activeClue = undefined;
          state.canBlock = true;
          this.setStateAndRelay('LETTER_REVEALED', state);
        }
      }, 2000);
    } else {
      state.phase = 'CLUE_PHASE';
      state.activeClue = undefined;
      state.canBlock = true;
      this.setStateAndRelay('MATCH_RESULT', state, { matched: false });
    }

    state.votes = {};
    state.voteDeadline = undefined;
    this.voteSub?.unsubscribe();
  }

  private completeRound(state: GameState): void {
    state.phase = 'ROUND_COMPLETE';
    this.setStateAndRelay('ROUND_COMPLETE', state);

    setTimeout(() => {
      const approved = [...state.players].sort((a, b) => a.joinOrder - b.joinOrder);
      const idx = approved.findIndex((p) => p.connectionId === state.clueGiverId);
      const next = approved[(idx + 1) % approved.length];
      state.clueGiverId = next.connectionId;
      state.secretWord = '';
      state.revealedPrefix = '';
      state.activeClue = undefined;
      state.canBlock = true;
      state.currentRound += 1;
      state.phase = 'WORD_SETUP';
      this.setStateAndRelay('CLUE_GIVER_ROTATED', state);
    }, 3000);
  }

  private setStateAndRelay(type: RelayPayload['type'], state: GameState, meta?: Record<string, unknown>): void {
    this.stateSubject.next(state);
    const room = this.roomService.room;
    if (!room?.isHost) return;

    const redacted = this.redactForBroadcast(state);
    this.ws.send('RELAY', { type, state: redacted, meta }, room.roomCode);
  }

  private redactForBroadcast(state: GameState): GameState {
    const clone: GameState = JSON.parse(JSON.stringify(state));
    return clone;
  }

  private startContactCountdown(): void {
    this.contactCountSubject.next(CONTACT_COUNTDOWN_SECONDS);
    this.tickSub?.unsubscribe();
    this.tickSub = interval(1000).subscribe(() => {
      const state = this.state;
      if (!state?.contactDeadline) return;
      const remaining = Math.ceil((state.contactDeadline - Date.now()) / 1000);
      if (remaining > 0) {
        this.contactCountSubject.next(remaining);
      } else {
        this.contactCountSubject.next(0);
        this.tickSub?.unsubscribe();
        if (this.isHost) this.startMatchVote();
      }
    });
  }

  private startMatchVote(): void {
    const state = this.state;
    if (!state) return;
    state.phase = 'MATCH_VOTE';
    state.contactDeadline = undefined;
    state.votes = {};
    state.voteDeadline = Date.now() + VOTE_TIMEOUT_SECONDS * 1000;
    this.contactCountSubject.next(null);
    this.setStateAndRelay('MATCH_VOTE_STARTED', state);

    this.voteSub?.unsubscribe();
    this.voteSub = interval(1000).subscribe(() => {
      const s = this.state;
      if (!s?.voteDeadline) return;
      if (Date.now() >= s.voteDeadline) {
        this.voteSub?.unsubscribe();
        if (this.isHost) this.finalizeVote(s);
      }
    });
  }

  private syncTimersFromState(state: GameState): void {
    if (state.phase === 'CONTACT_COUNTDOWN' && state.contactDeadline) {
      const remaining = Math.ceil((state.contactDeadline - Date.now()) / 1000);
      this.contactCountSubject.next(Math.max(remaining, 0));
    }
  }

  private applyHostSnapshot(state: GameState): void {
    if (this.hostRecoveryTimer) {
      clearTimeout(this.hostRecoveryTimer);
      this.hostRecoveryTimer = null;
    }
    this.stateSubject.next(state);
    this.setStateAndRelay('STATE_SYNC', state);
  }

  private fallbackRecovery(): void {
    const room = this.roomService.room;
    const players = this.roomService.players;
    if (!room || !this.isHost) return;
    const state = createInitialState(players, room.connectionId);
    state.phase = 'WORD_SETUP';
    this.setStateAndRelay('STATE_SYNC', state);
  }

  isClueGiver(): boolean {
    return this.myId === this.state?.clueGiverId;
  }

  isGuesser(): boolean {
    return !!this.state && this.myId !== this.state.clueGiverId;
  }

  getDisplayPrefix(): string {
    const state = this.state;
    if (!state) return '';
    if (this.isClueGiver()) return state.secretWord || state.revealedPrefix;
    return state.revealedPrefix || (state.secretWord ? state.secretWord[0] : '?');
  }
}
