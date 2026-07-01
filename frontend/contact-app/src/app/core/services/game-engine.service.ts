import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription, interval } from 'rxjs';
import {
  ActiveClue,
  CLUE_TIMER_SECONDS,
  CONTACT_COUNTDOWN_SECONDS,
  createInitialState,
  GameState,
  isValidSecretWord,
  MIN_PLAYERS,
  RelayPayload,
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
    if (!room || players.length < MIN_PLAYERS) return;

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
      state.activeClues = [];
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
      const clue: ActiveClue = {
        id: crypto.randomUUID(),
        authorId: room.connectionId,
        authorNickname: room.nickname,
        text: trimmed,
      };
      state.activeClues = [...(state.activeClues ?? []), clue];
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

  initiateContact(clueId: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (state?.phase !== 'CLUE_PHASE') return;
    const clue = state.activeClues?.find((c) => c.id === clueId);
    if (!clue) return;
    if (this.myId === state.clueGiverId) return;
    if (this.myId === clue.authorId) return;

    if (this.isHost) {
      state.phase = 'CONTACT_COUNTDOWN';
      state.contactInitiatorId = room!.connectionId;
      state.contactPartnerId = clue.authorId;
      state.contactClueId = clue.id;
      state.contactDeadline = Date.now() + CONTACT_COUNTDOWN_SECONDS * 1000;
      state.contactGuesses = {};
      state.blockGuess = undefined;
      this.startContactCountdown();
      this.setStateAndRelay('CONTACT_INITIATED', state);
    } else {
      this.ws.send('FORWARD_TO_HOST', {
        actionType: 'CONTACT_INITIATED',
        initiatorId: room!.connectionId,
        clueId,
      }, room!.roomCode);
    }
  }

  submitContactGuess(word: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || state.phase !== 'CONTACT_COUNTDOWN') return;
    if (this.myId !== state.contactInitiatorId && this.myId !== state.contactPartnerId) return;
    const normalized = word.trim().toUpperCase();
    if (!normalized) return;

    if (this.isHost) {
      state.contactGuesses = { ...(state.contactGuesses ?? {}), [this.myId!]: normalized };
      this.stateSubject.next(state);
    } else {
      this.ws.send('FORWARD_TO_HOST', { actionType: 'CONTACT_GUESS', word: normalized }, room.roomCode);
    }
  }

  submitBlockGuess(word: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || state.phase !== 'CONTACT_COUNTDOWN') return;
    if (this.myId !== state.clueGiverId) return;
    const normalized = word.trim().toUpperCase();
    if (!normalized) return;

    if (this.isHost) {
      state.blockGuess = normalized;
      this.stateSubject.next(state);
    } else {
      this.ws.send('FORWARD_TO_HOST', { actionType: 'BLOCK_GUESS', word: normalized }, room.roomCode);
    }
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
    this.messageSub?.unsubscribe();
    if (this.hostRecoveryTimer) clearTimeout(this.hostRecoveryTimer);
  }

  private handleMessage(action: string, payload: unknown): void {
    switch (action) {
      case 'RELAY':
        this.applyRelay(payload as RelayPayload);
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
      this.applyOverlayFromRelay(relay);
    }
  }

  private applyOverlayFromRelay(relay: RelayPayload): void {
    if (relay.type === 'CONTACT_BLOCKED') {
      this.overlaySubject.next('BLOCKED');
    } else if (relay.type === 'MATCH_RESULT' && relay.meta?.['matched']) {
      this.overlaySubject.next('SUCCESS');
    } else if (relay.state.phase === 'CLUE_PHASE' || relay.state.phase === 'WORD_SETUP') {
      this.overlaySubject.next(null);
    }
  }

  private applyHostMetaAction(relay: RelayPayload): void {
    const state = this.state ?? relay.state;
    const meta = relay.meta ?? {};

    switch (relay.type) {
      case 'CLUE_SUBMITTED': {
        const clue: ActiveClue = {
          id: crypto.randomUUID(),
          authorId: meta['authorId'] as string,
          authorNickname: meta['authorNickname'] as string,
          text: meta['clueText'] as string,
        };
        state.activeClues = [...(state.activeClues ?? []), clue];
        state.phase = 'CLUE_PHASE';
        break;
      }
      case 'CONTACT_INITIATED': {
        const clueId = meta['clueId'] as string;
        const clue = state.activeClues?.find((c) => c.id === clueId);
        if (!clue) return;
        state.phase = 'CONTACT_COUNTDOWN';
        state.contactInitiatorId = meta['initiatorId'] as string;
        state.contactPartnerId = clue.authorId;
        state.contactClueId = clue.id;
        state.contactDeadline = Date.now() + CONTACT_COUNTDOWN_SECONDS * 1000;
        state.contactGuesses = {};
        state.blockGuess = undefined;
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
        state.activeClues = [];
        this.setStateAndRelay('SECRET_WORD_SET', state);
        break;
      }
      case 'CLUE_SUBMITTED': {
        const clue: ActiveClue = {
          id: crypto.randomUUID(),
          authorId: action['authorId'] as string,
          authorNickname: action['authorNickname'] as string,
          text: action['clueText'] as string,
        };
        state.activeClues = [...(state.activeClues ?? []), clue];
        state.phase = 'CLUE_PHASE';
        this.setStateAndRelay('CLUE_SUBMITTED', state);
        break;
      }
      case 'CONTACT_INITIATED': {
        const clueId = action['clueId'] as string;
        const clue = state.activeClues?.find((c) => c.id === clueId);
        if (state.phase !== 'CLUE_PHASE' || !clue) return;
        state.phase = 'CONTACT_COUNTDOWN';
        state.contactInitiatorId = action['initiatorId'] as string;
        state.contactPartnerId = clue.authorId;
        state.contactClueId = clue.id;
        state.contactDeadline = Date.now() + CONTACT_COUNTDOWN_SECONDS * 1000;
        state.contactGuesses = {};
        state.blockGuess = undefined;
        this.startContactCountdown();
        this.setStateAndRelay('CONTACT_INITIATED', state);
        break;
      }
      case 'CONTACT_GUESS': {
        if (state.phase !== 'CONTACT_COUNTDOWN') return;
        const senderId = action['senderId'] as string;
        if (senderId !== state.contactInitiatorId && senderId !== state.contactPartnerId) return;
        const word = String(action['word'] ?? '').toUpperCase();
        if (!word) return;
        state.contactGuesses = { ...(state.contactGuesses ?? {}), [action['senderId'] as string]: word };
        this.stateSubject.next(state);
        break;
      }
      case 'BLOCK_GUESS': {
        if (state.phase !== 'CONTACT_COUNTDOWN') return;
        if (action['senderId'] !== state.clueGiverId) return;
        const word = String(action['word'] ?? '').toUpperCase();
        if (!word) return;
        state.blockGuess = word;
        this.stateSubject.next(state);
        break;
      }
    }
  }

  private resolveContact(): void {
    const state = this.state;
    if (!state || !this.isHost || state.phase !== 'CONTACT_COUNTDOWN') return;

    const guesses = state.contactGuesses ?? {};
    const initWord = (guesses[state.contactInitiatorId ?? ''] ?? '').trim().toUpperCase();
    const partWord = (guesses[state.contactPartnerId ?? ''] ?? '').trim().toUpperCase();
    const block = (state.blockGuess ?? '').trim().toUpperCase();

    const matched = !!initWord && !!partWord && initWord === partWord;
    const blocked = !!block && (block === initWord || block === partWord);

    state.contactDeadline = undefined;
    this.contactCountSubject.next(null);

    if (blocked) {
      state.phase = 'BLOCKED';
      state.lastBlockWord = block;
      state.contactGuesses = {};
      state.blockGuess = undefined;
      state.contactClueId = undefined;
      state.contactInitiatorId = undefined;
      state.contactPartnerId = undefined;
      this.overlaySubject.next('BLOCKED');
      this.setStateAndRelay('CONTACT_BLOCKED', state);

      setTimeout(() => {
        this.overlaySubject.next(null);
        const s = this.state;
        if (!s) return;
        s.phase = 'CLUE_PHASE';
        this.setStateAndRelay('STATE_SYNC', s);
      }, 2500);
      return;
    }

    if (matched) {
      const nextLen = Math.min(state.revealedPrefix.length + 1, state.secretWord.length);
      state.revealedPrefix = state.secretWord.slice(0, nextLen);
      state.phase = 'LETTER_REVEAL';
      state.activeClues = [];
      state.contactGuesses = {};
      state.blockGuess = undefined;
      state.contactClueId = undefined;
      state.contactInitiatorId = undefined;
      state.contactPartnerId = undefined;
      this.overlaySubject.next('SUCCESS');
      this.setStateAndRelay('MATCH_RESULT', state, { matched: true });

      setTimeout(() => {
        this.overlaySubject.next(null);
        const s = this.state;
        if (!s) return;
        if (s.revealedPrefix.length >= s.secretWord.length) {
          this.completeRound(s);
        } else {
          s.phase = 'CLUE_PHASE';
          this.setStateAndRelay('LETTER_REVEALED', s);
        }
      }, 2000);
      return;
    }

    state.phase = 'CLUE_PHASE';
    state.contactGuesses = {};
    state.blockGuess = undefined;
    state.contactClueId = undefined;
    state.contactInitiatorId = undefined;
    state.contactPartnerId = undefined;
    this.setStateAndRelay('MATCH_RESULT', state, { matched: false });
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
      state.activeClues = [];
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
    delete clone.contactGuesses;
    delete clone.blockGuess;
    return clone;
  }

  private startContactCountdown(): void {
    this.tickSub?.unsubscribe();
    this.contactCountSubject.next(CONTACT_COUNTDOWN_SECONDS);
    this.tickSub = interval(1000).subscribe(() => {
      const current = this.contactCountSubject.value;
      if (current === null || this.state?.phase !== 'CONTACT_COUNTDOWN') {
        this.tickSub?.unsubscribe();
        this.tickSub = null;
        return;
      }
      if (current <= 1) {
        this.contactCountSubject.next(0);
        this.tickSub?.unsubscribe();
        this.tickSub = null;
        if (this.isHost) this.resolveContact();
      } else {
        this.contactCountSubject.next(current - 1);
      }
    });
  }

  private syncTimersFromState(state: GameState): void {
    if (state.phase === 'CONTACT_COUNTDOWN') {
      if (this.contactCountSubject.value === null) {
        this.startContactCountdown();
      }
    } else {
      this.tickSub?.unsubscribe();
      this.tickSub = null;
      this.contactCountSubject.next(null);
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

  isContactParticipant(): boolean {
    const state = this.state;
    const myId = this.myId;
    if (!state || !myId) return false;
    return myId === state.contactInitiatorId || myId === state.contactPartnerId;
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
