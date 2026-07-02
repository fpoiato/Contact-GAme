import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription, firstValueFrom, interval, of, timeout, catchError } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import {
  ActiveClue,
  BLOCK_POINTS,
  CLUE_AUTHOR_POINTS,
  CLUE_LIFETIME_SECONDS,
  CLUE_TIMER_SECONDS,
  CONTACT_COUNTDOWN_SECONDS,
  CONTACT_INITIATOR_POINTS,
  CONTACT_MATCH_POINTS,
  createInitialState,
  GameState,
  isValidSecretWord,
  MIN_PLAYERS,
  Player,
  RECONNECT_GRACE_SECONDS,
  redactStateForPlayer,
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
  private readonly reconnectGraceSubject = new BehaviorSubject<number | null>(null);

  private tickSub: Subscription | null = null;
  private clueExpiryTickSub: Subscription | null = null;
  private reconnectGraceTickSub: Subscription | null = null;
  private hostRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private gameStateRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private messageSub: Subscription | null = null;
  private readonly stateRecoveryFailedSubject = new BehaviorSubject<boolean>(false);

  readonly stateRecoveryFailed$ = this.stateRecoveryFailedSubject.asObservable();

  readonly state$ = this.stateSubject.asObservable();
  readonly overlay$ = this.overlaySubject.asObservable();
  readonly clueInputOpen$ = this.clueInputOpenSubject.asObservable();
  readonly contactCount$ = this.contactCountSubject.asObservable();
  readonly clueSeconds$ = this.clueSecondsSubject.asObservable();
  readonly reconnectGrace$ = this.reconnectGraceSubject.asObservable();

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

  async resolveRouteAfterReconnect(timeoutMs = 8000): Promise<'lobby' | 'game'> {
    const room = this.roomService.room;
    if (!room) return 'lobby';
    if (room.isHost) {
      this.requestHostStateRecovery();
    } else {
      this.requestGameState();
    }
    return firstValueFrom(
      this.state$.pipe(
        filter((s) => !!s),
        take(1),
        map((s) => (s!.phase !== 'LOBBY' ? 'game' : 'lobby')),
        timeout(timeoutMs),
        catchError(() => of('lobby' as const)),
      ),
    );
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
      state.expiredClues = [];
      state.usedMatchWords = [];
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
        this.closeClueInput();
      } else {
        this.clueSecondsSubject.next(current - 1);
      }
    });
  }

  closeClueInput(): void {
    this.clueInputOpenSubject.next(false);
    this.clueSecondsSubject.next(null);
    this.tickSub?.unsubscribe();
    this.tickSub = null;
  }

  submitClue(text: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || state.phase !== 'CLUE_PHASE') return;
    if (this.myId === state.clueGiverId) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (this.isHost) {
      const clue = this.buildClue(room.connectionId, room.nickname, trimmed);
      state.activeClues = [...(state.activeClues ?? []), clue];
      state.clueDeadline = undefined;
      this.closeClueInput();
      this.setStateAndRelay('CLUE_SUBMITTED', state);
    } else {
      this.ws.send('FORWARD_TO_HOST', {
        actionType: 'CLUE_SUBMITTED',
        clueText: trimmed,
        authorId: room.connectionId,
        authorNickname: room.nickname,
      }, room.roomCode);
      this.closeClueInput();
    }
  }

  initiateContact(clueId: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (state?.phase !== 'CLUE_PHASE') return;
    const clue = this.findContactableClue(state, clueId);
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

  abandonContact(): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || state.phase !== 'CONTACT_COUNTDOWN') return;
    if (this.myId !== state.contactInitiatorId) return;

    if (this.isHost) {
      this.cancelContact(state);
      this.setStateAndRelay('CONTACT_ABANDONED', state);
    } else {
      this.ws.send('FORWARD_TO_HOST', { actionType: 'CONTACT_ABANDONED' }, room.roomCode);
    }
  }

  submitContactGuess(word: string): boolean {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || state.phase !== 'CONTACT_COUNTDOWN') return false;
    if (this.myId !== state.contactInitiatorId && this.myId !== state.contactPartnerId) return false;
    const normalized = word.trim().toUpperCase();
    if (!normalized) return false;
    if (this.isUsedMatchWord(normalized)) return false;

    if (this.isHost) {
      state.contactGuesses = { ...(state.contactGuesses ?? {}), [this.myId!]: normalized };
      this.stateSubject.next(state);
      this.maybeResolveContactEarly();
    } else {
      this.ws.send('FORWARD_TO_HOST', { actionType: 'CONTACT_GUESS', word: normalized }, room.roomCode);
    }
    return true;
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
    this.stateRecoveryFailedSubject.next(false);
    this.ws.send('REQUEST_HOST_STATE', {}, room.roomCode);
    this.hostRecoveryTimer = setTimeout(() => this.fallbackRecovery(), 5000);
  }

  requestGameState(): void {
    const room = this.roomService.room;
    if (!room || this.state) return;
    this.stateRecoveryFailedSubject.next(false);
    this.ws.send('REQUEST_GAME_STATE', {}, room.roomCode);
    this.gameStateRecoveryTimer = setTimeout(() => {
      this.stateRecoveryFailedSubject.next(true);
    }, 8000);
  }

  respondToHostStateRequest(requesterId: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || room.isHost) return;
    if (state.phase === 'LOBBY') return;

    this.ws.send('HOST_STATE_RESPONSE', { targetHostId: requesterId, state }, room.roomCode);
  }

  respondToGameStateRequest(requesterId: string): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || !room.isHost) return;
    if (state.phase === 'LOBBY') return;

    this.ws.send('GAME_STATE_RESPONSE', { targetId: requesterId, state }, room.roomCode);
  }

  ngOnDestroy(): void {
    this.tickSub?.unsubscribe();
    this.clueExpiryTickSub?.unsubscribe();
    this.reconnectGraceTickSub?.unsubscribe();
    this.messageSub?.unsubscribe();
    if (this.hostRecoveryTimer) clearTimeout(this.hostRecoveryTimer);
    if (this.gameStateRecoveryTimer) clearTimeout(this.gameStateRecoveryTimer);
    this.clearReconnectGraceTimer();
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
      case 'REQUEST_GAME_STATE':
        if (this.isHost) {
          this.respondToGameStateRequest((payload as { requesterId: string }).requesterId);
        }
        break;
      case 'HOST_STATE_RESPONSE':
        if (this.isHost) this.applyHostSnapshot((payload as { state: GameState }).state);
        break;
      case 'GAME_STATE_RESPONSE':
        this.applyRejoinedState((payload as { state: GameState }).state);
        break;
      case 'PLAYER_APPROVED':
        if (this.isHost) {
          this.handlePlayerApproved(payload as Player);
        }
        break;
      case 'PLAYER_REJOINED':
        if (this.isHost) this.handlePlayerRejoined(payload as Record<string, unknown>);
        break;
      case 'PLAYER_DISCONNECTED':
        this.handlePlayerDisconnected(payload as { connectionId: string; nickname: string });
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
    this.syncReconnectGrace(this.state);
    if (relay.type === 'RETURN_TO_LOBBY') {
      this.overlaySubject.next(null);
      this.clueInputOpenSubject.next(false);
      this.roomService.syncPlayersFromGame(incoming.players);
    }
  }

  private applyOverlayFromRelay(relay: RelayPayload): void {
    if (relay.type === 'CONTACT_BLOCKED') {
      this.overlaySubject.next('BLOCKED');
    } else if (relay.type === 'MATCH_RESULT' && relay.meta?.['wordGuessed']) {
      this.overlaySubject.next('WORD_GUESSED');
    } else if (relay.type === 'MATCH_RESULT' && relay.meta?.['matched']) {
      this.overlaySubject.next('SUCCESS');
    } else if (relay.type === 'CONTACT_ABANDONED' || relay.type === 'CLUE_EXPIRED') {
      if (relay.state.phase === 'CLUE_PHASE') {
        this.overlaySubject.next(null);
        this.stopContactCountdown();
        this.contactCountSubject.next(null);
      }
    } else if (relay.state.phase === 'CLUE_PHASE' || relay.state.phase === 'WORD_SETUP') {
      this.overlaySubject.next(null);
    }
  }

  private applyHostMetaAction(relay: RelayPayload): void {
    const state = this.state ?? relay.state;
    const meta = relay.meta ?? {};

    switch (relay.type) {
      case 'CLUE_SUBMITTED': {
        const clue = this.buildClue(
          meta['authorId'] as string,
          meta['authorNickname'] as string,
          meta['clueText'] as string,
        );
        state.activeClues = [...(state.activeClues ?? []), clue];
        state.phase = 'CLUE_PHASE';
        break;
      }
      case 'CONTACT_INITIATED': {
        const clueId = meta['clueId'] as string;
        const clue = this.findContactableClue(state, clueId);
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
        state.expiredClues = [];
        state.usedMatchWords = [];
        this.setStateAndRelay('SECRET_WORD_SET', state);
        break;
      }
      case 'CLUE_SUBMITTED': {
        const clue = this.buildClue(
          action['authorId'] as string,
          action['authorNickname'] as string,
          action['clueText'] as string,
        );
        state.activeClues = [...(state.activeClues ?? []), clue];
        state.phase = 'CLUE_PHASE';
        this.setStateAndRelay('CLUE_SUBMITTED', state);
        break;
      }
      case 'CONTACT_INITIATED': {
        const clueId = action['clueId'] as string;
        const clue = this.findContactableClue(state, clueId);
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
        if (this.isUsedMatchWord(word, state)) return;
        state.contactGuesses = { ...(state.contactGuesses ?? {}), [action['senderId'] as string]: word };
        this.stateSubject.next(state);
        this.maybeResolveContactEarly();
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
      case 'CONTACT_ABANDONED': {
        if (state.phase !== 'CONTACT_COUNTDOWN') return;
        if (action['senderId'] !== state.contactInitiatorId) return;
        this.cancelContact(state);
        this.setStateAndRelay('CONTACT_ABANDONED', state);
        break;
      }
    }
  }

  private resolveContact(): void {
    const state = this.state;
    if (!state || !this.isHost || state.phase !== 'CONTACT_COUNTDOWN') return;
    if (state.awaitingRejoin) return;

    this.stopContactCountdown();

    const guesses = state.contactGuesses ?? {};
    const initWord = (guesses[state.contactInitiatorId ?? ''] ?? '').trim().toUpperCase();
    const partWord = (guesses[state.contactPartnerId ?? ''] ?? '').trim().toUpperCase();
    const block = (state.blockGuess ?? '').trim().toUpperCase();

    const matched =
      !!initWord && !!partWord && initWord === partWord && !this.isUsedMatchWord(initWord, state);
    const blocked = !!block && (block === initWord || block === partWord);

    state.contactDeadline = undefined;
    this.contactCountSubject.next(null);

    if (blocked) {
      this.addPoints(state, state.clueGiverId, BLOCK_POINTS);
      this.recordUsedMatchWord(state, block);
      const blockedClueId = state.contactClueId;
      if (blockedClueId && state.activeClues) {
        state.activeClues = state.activeClues.map((clue) =>
          clue.id === blockedClueId ? { ...clue, usedWord: block } : clue,
        );
      }
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
      const secretWord = state.secretWord.toUpperCase();
      const wordGuessed = initWord === secretWord;
      const partnerId = state.contactPartnerId;
      const initiatorId = state.contactInitiatorId;

      state.revealedPrefix = wordGuessed
        ? secretWord
        : state.secretWord.slice(0, Math.min(state.revealedPrefix.length + 1, state.secretWord.length));
      state.phase = 'LETTER_REVEAL';
      state.activeClues = [];
      state.contactGuesses = {};
      state.blockGuess = undefined;
      state.contactClueId = undefined;
      state.contactInitiatorId = undefined;
      state.contactPartnerId = undefined;

      if (wordGuessed) {
        this.awardRoundScores(state, partnerId, initiatorId);
        this.overlaySubject.next('WORD_GUESSED');
        this.setStateAndRelay('MATCH_RESULT', state, { matched: true, wordGuessed: true });

        setTimeout(() => {
          this.overlaySubject.next(null);
          const s = this.state;
          if (!s) return;
          this.completeRound(s);
        }, 2000);
        return;
      }

      if (partnerId) {
        this.addPoints(state, partnerId, CONTACT_MATCH_POINTS);
      }
      if (initiatorId) {
        this.addPoints(state, initiatorId, CONTACT_MATCH_POINTS);
      }
      this.recordUsedMatchWord(state, initWord);

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

  private awardRoundScores(
    state: GameState,
    partnerId: string | undefined,
    initiatorId: string | undefined,
  ): void {
    if (partnerId) {
      this.addPoints(state, partnerId, CLUE_AUTHOR_POINTS);
    }
    if (initiatorId) {
      this.addPoints(state, initiatorId, CONTACT_INITIATOR_POINTS);
    }
  }

  private addPoints(state: GameState, playerId: string, points: number): void {
    if (!state.scores) {
      state.scores = {};
      for (const p of state.players) {
        state.scores[p.connectionId] = 0;
      }
    }
    state.scores[playerId] = (state.scores[playerId] ?? 0) + points;
  }

  private completeRound(state: GameState): void {
    state.lastRoundWord = state.secretWord;
    state.phase = 'ROUND_COMPLETE';
    this.setStateAndRelay('ROUND_COMPLETE', state);
  }

  continueToNextRound(): void {
    if (!this.isHost) return;
    const state = this.state;
    if (!state || state.phase !== 'ROUND_COMPLETE') return;

    const approved = state.players
      .filter((p) => p.activeInRound !== false)
      .sort((a, b) => a.joinOrder - b.joinOrder);
    const idx = approved.findIndex((p) => p.connectionId === state.clueGiverId);
    const next = approved[(idx + 1) % approved.length];
    state.clueGiverId = next.connectionId;
    state.secretWord = '';
    state.revealedPrefix = '';
    state.activeClues = [];
    state.expiredClues = [];
    state.canBlock = true;
    state.currentRound += 1;
    state.lastRoundWord = undefined;
    state.usedMatchWords = [];
    state.players = state.players.map((p) => ({ ...p, activeInRound: true }));
    state.phase = 'WORD_SETUP';
    this.setStateAndRelay('CLUE_GIVER_ROTATED', state);
  }

  private recordUsedMatchWord(state: GameState, word: string): void {
    const normalized = word.trim().toUpperCase();
    if (!normalized) return;
    if (!state.usedMatchWords) {
      state.usedMatchWords = [];
    }
    if (!state.usedMatchWords.includes(normalized)) {
      state.usedMatchWords.push(normalized);
    }
  }

  private setStateAndRelay(type: RelayPayload['type'], state: GameState, meta?: Record<string, unknown>): void {
    this.stateSubject.next(state);
    const room = this.roomService.room;
    if (!room?.isHost) return;

    const redacted = this.redactForBroadcast(state);
    this.ws.send('RELAY', { type, state: redacted, meta }, room.roomCode);
    this.ensureClueExpiryRunning();
    this.ensureContactCountdownRunning();
  }

  private redactForBroadcast(state: GameState): GameState {
    const clone: GameState = JSON.parse(JSON.stringify(state));
    delete clone.contactGuesses;
    delete clone.blockGuess;
    return clone;
  }

  private startContactCountdown(): void {
    this.stopContactCountdown();
    this.contactCountSubject.next(CONTACT_COUNTDOWN_SECONDS);
    this.tickSub = interval(1000).subscribe(() => {
      const current = this.contactCountSubject.value;
      if (current === null || this.state?.phase !== 'CONTACT_COUNTDOWN') {
        this.stopContactCountdown();
        return;
      }
      if (current <= 1) {
        this.contactCountSubject.next(0);
        this.stopContactCountdown();
        if (this.isHost) this.resolveContact();
      } else {
        this.contactCountSubject.next(current - 1);
      }
    });
  }

  private stopContactCountdown(): void {
    this.tickSub?.unsubscribe();
    this.tickSub = null;
  }

  private contactParticipantsReady(state: GameState): boolean {
    const guesses = state.contactGuesses ?? {};
    const initiatorId = state.contactInitiatorId;
    const partnerId = state.contactPartnerId;
    if (!initiatorId || !partnerId) return false;
    return !!guesses[initiatorId]?.trim() && !!guesses[partnerId]?.trim();
  }

  private maybeResolveContactEarly(): void {
    const state = this.state;
    if (!state || !this.isHost || state.phase !== 'CONTACT_COUNTDOWN') return;
    if (state.awaitingRejoin) return;
    if (!this.contactParticipantsReady(state)) return;
    this.resolveContact();
  }

  private ensureContactCountdownRunning(): void {
    if (!this.isHost) return;
    const state = this.state;
    if (!state || state.phase !== 'CONTACT_COUNTDOWN' || state.awaitingRejoin) return;
    if (this.tickSub) return;

    const deadline = state.contactDeadline;
    if (deadline && deadline > Date.now()) {
      const remaining = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
      this.contactCountSubject.next(remaining);
      this.tickSub = interval(1000).subscribe(() => {
        const current = this.contactCountSubject.value;
        if (current === null || this.state?.phase !== 'CONTACT_COUNTDOWN') {
          this.stopContactCountdown();
          return;
        }
        if (current <= 1) {
          this.contactCountSubject.next(0);
          this.stopContactCountdown();
          if (this.isHost) this.resolveContact();
        } else {
          this.contactCountSubject.next(current - 1);
        }
      });
    } else {
      this.startContactCountdown();
    }
  }

  private syncTimersFromState(state: GameState): void {
    if (state.phase === 'CONTACT_COUNTDOWN') {
      if (this.contactCountSubject.value === null) {
        this.startContactCountdown();
      }
    } else {
      this.stopContactCountdown();
      this.contactCountSubject.next(null);
    }
  }

  private applyRejoinedState(state: GameState): void {
    if (this.gameStateRecoveryTimer) {
      clearTimeout(this.gameStateRecoveryTimer);
      this.gameStateRecoveryTimer = null;
    }
    this.stateRecoveryFailedSubject.next(false);
    this.stateSubject.next(state);
    this.syncTimersFromState(state);
    this.syncReconnectGrace(state);
    if (this.isHost && state.awaitingRejoin) {
      this.scheduleReconnectGraceExpiry(state.awaitingRejoin.deadlineAt);
    }
    this.ensureContactCountdownRunning();
    this.ensureClueExpiryRunning();
  }

  private handlePlayerApproved(player: Player): void {
    const state = this.state;
    const room = this.roomService.room;
    if (!state || !room || !this.isHost) return;
    if (state.players.some((p) => p.connectionId === player.connectionId)) return;

    const gameInProgress = state.phase !== 'LOBBY';
    const newPlayer: Player = {
      ...player,
      status: 'approved',
      activeInRound: !gameInProgress,
    };

    state.players = [...state.players, newPlayer].sort((a, b) => a.joinOrder - b.joinOrder);
    this.addPoints(state, player.connectionId, 0);
    this.setStateAndRelay('STATE_SYNC', state);

    if (gameInProgress) {
      this.ws.send(
        'GAME_STATE_RESPONSE',
        { targetId: player.connectionId, state: redactStateForPlayer(state, player.connectionId) },
        room.roomCode,
      );
    }
  }

  private handlePlayerRejoined(payload: Record<string, unknown>): void {
    const state = this.state;
    if (!state || !this.isHost) return;

    const previousConnectionId = payload['previousConnectionId'] as string | undefined;
    const connectionId = payload['connectionId'] as string;
    const nickname = payload['nickname'] as string;
    if (!connectionId || !nickname) return;

    if (previousConnectionId) {
      this.remapConnectionId(state, previousConnectionId, connectionId);
    }

    state.players = state.players.map((player) =>
      player.nickname.toLowerCase() === nickname.toLowerCase()
        ? {
            ...player,
            connectionId,
            isHost: (payload['isHost'] as boolean) ?? player.isHost,
            joinOrder: (payload['joinOrder'] as number) ?? player.joinOrder,
          }
        : player
    );

    if (
      state.awaitingRejoin &&
      (state.awaitingRejoin.connectionId === previousConnectionId ||
        state.awaitingRejoin.nickname.toLowerCase() === nickname.toLowerCase())
    ) {
      state.awaitingRejoin = undefined;
      this.clearReconnectGraceTimer();
      this.syncReconnectGrace(state);
    }

    if (state.phase === 'CONTACT_COUNTDOWN') {
      this.ensureContactCountdownRunning();
      this.maybeResolveContactEarly();
    }

    this.setStateAndRelay('STATE_SYNC', state);
  }

  private remapConnectionId(state: GameState, oldId: string, newId: string): void {
    if (state.clueGiverId === oldId) state.clueGiverId = newId;
    if (state.hostId === oldId) state.hostId = newId;
    if (state.contactInitiatorId === oldId) state.contactInitiatorId = newId;
    if (state.contactPartnerId === oldId) state.contactPartnerId = newId;
    if (state.contactGuesses?.[oldId]) {
      state.contactGuesses = {
        ...state.contactGuesses,
        [newId]: state.contactGuesses[oldId],
      };
      delete state.contactGuesses[oldId];
    }
    state.activeClues = state.activeClues?.map((clue) =>
      clue.authorId === oldId ? { ...clue, authorId: newId } : clue
    );
    state.expiredClues = state.expiredClues?.map((clue) =>
      clue.authorId === oldId ? { ...clue, authorId: newId } : clue
    );
  }

  private applyHostSnapshot(state: GameState): void {
    if (this.hostRecoveryTimer) {
      clearTimeout(this.hostRecoveryTimer);
      this.hostRecoveryTimer = null;
    }
    this.stateSubject.next(state);
    this.setStateAndRelay('STATE_SYNC', state);
    this.syncReconnectGrace(state);
    if (this.isHost && state.awaitingRejoin) {
      this.scheduleReconnectGraceExpiry(state.awaitingRejoin.deadlineAt);
    }
    this.ensureContactCountdownRunning();
  }

  private handlePlayerDisconnected(payload: { connectionId: string; nickname: string }): void {
    if (!this.isHost) return;
    const state = this.state;
    if (!state || state.phase === 'LOBBY') return;

    const player = state.players.find((p) => p.connectionId === payload.connectionId);
    if (!player || player.activeInRound === false) return;

    this.applyDisconnectGrace(payload);
  }

  private applyDisconnectGrace(payload: { connectionId: string; nickname: string }): void {
    const state = this.state;
    if (!state || state.phase === 'LOBBY') return;

    const affectsContact =
      state.phase === 'CONTACT_COUNTDOWN' &&
      (payload.connectionId === state.contactInitiatorId ||
        payload.connectionId === state.contactPartnerId ||
        payload.connectionId === state.clueGiverId);

    if (state.phase === 'CONTACT_COUNTDOWN' && !affectsContact) {
      return;
    }

    if (affectsContact) {
      this.stopContactCountdown();
    }

    this.clueInputOpenSubject.next(false);
    this.clueSecondsSubject.next(null);

    state.awaitingRejoin = {
      nickname: payload.nickname,
      connectionId: payload.connectionId,
      deadlineAt: Date.now() + RECONNECT_GRACE_SECONDS * 1000,
    };

    this.syncReconnectGrace(state);
    this.scheduleReconnectGraceExpiry(state.awaitingRejoin.deadlineAt);
    this.setStateAndRelay('STATE_SYNC', state);
  }

  private scheduleReconnectGraceExpiry(deadlineAt: number): void {
    this.clearReconnectGraceTimer();
    const delay = deadlineAt - Date.now();
    if (delay <= 0) {
      this.returnToLobby();
      return;
    }
    this.reconnectGraceTimer = setTimeout(() => this.returnToLobby(), delay);
  }

  private clearReconnectGraceTimer(): void {
    if (this.reconnectGraceTimer) {
      clearTimeout(this.reconnectGraceTimer);
      this.reconnectGraceTimer = null;
    }
  }

  private syncReconnectGrace(state: GameState | null): void {
    this.reconnectGraceTickSub?.unsubscribe();
    this.reconnectGraceTickSub = null;
    if (!state?.awaitingRejoin) {
      this.reconnectGraceSubject.next(null);
      return;
    }

    const tick = () => {
      const deadline = this.state?.awaitingRejoin?.deadlineAt;
      if (!deadline) {
        this.reconnectGraceSubject.next(null);
        return;
      }
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      this.reconnectGraceSubject.next(remaining);
    };

    tick();
    this.reconnectGraceTickSub = interval(1000).subscribe(tick);
  }

  private returnToLobby(): void {
    const state = this.state;
    if (!state || !this.isHost || state.phase === 'LOBBY') return;

    const disconnectedId = state.awaitingRejoin?.connectionId;
    this.clearReconnectGraceTimer();
    this.stopContactCountdown();
    this.stopClueExpiryTimer();
    this.overlaySubject.next(null);
    this.clueInputOpenSubject.next(false);
    this.clueSecondsSubject.next(null);

    if (disconnectedId) {
      state.players = state.players.filter((p) => p.connectionId !== disconnectedId);
    }

    this.roomService.syncPlayersFromGame(state.players);

    state.awaitingRejoin = undefined;
    state.phase = 'LOBBY';
    state.secretWord = '';
    state.revealedPrefix = '';
    state.activeClues = [];
    state.expiredClues = [];
    state.usedMatchWords = [];
    state.contactInitiatorId = undefined;
    state.contactPartnerId = undefined;
    state.contactClueId = undefined;
    state.contactGuesses = undefined;
    state.blockGuess = undefined;
    state.contactDeadline = undefined;
    state.lastBlockWord = undefined;

    this.syncReconnectGrace(state);
    this.setStateAndRelay('RETURN_TO_LOBBY', state);
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
    if (!state || !myId || !this.isActiveInRound()) return false;
    return myId === state.contactInitiatorId || myId === state.contactPartnerId;
  }

  isContactInitiator(): boolean {
    const state = this.state;
    const myId = this.myId;
    if (!state || !myId || !this.isActiveInRound()) return false;
    return myId === state.contactInitiatorId;
  }

  getClueSecondsRemaining(clue: ActiveClue): number {
    return Math.max(0, Math.ceil((clue.expiresAt - Date.now()) / 1000));
  }

  isClueGiver(): boolean {
    return this.isActiveInRound() && this.myId === this.state?.clueGiverId;
  }

  isGuesser(): boolean {
    return !!this.state && this.isActiveInRound() && this.myId !== this.state.clueGiverId;
  }

  isActiveInRound(): boolean {
    const state = this.state;
    const myId = this.myId;
    if (!state || !myId) return false;
    const me = state.players.find((p) => p.connectionId === myId);
    return me?.activeInRound !== false;
  }

  isSpectating(): boolean {
    const state = this.state;
    const myId = this.myId;
    if (!state || !myId || state.phase === 'LOBBY') return false;
    return !this.isActiveInRound();
  }

  getUsedMatchWords(): string[] {
    return this.state?.usedMatchWords ?? [];
  }

  isUsedMatchWord(word: string, state: GameState | null = this.state): boolean {
    if (!state) return false;
    const normalized = word.trim().toUpperCase();
    return (state.usedMatchWords ?? []).includes(normalized);
  }

  getDisplayPrefix(): string {
    const state = this.state;
    if (!state) return '';
    return state.revealedPrefix || (state.secretWord ? state.secretWord[0] : '?');
  }

  getClueGiverSecretWord(): string {
    const state = this.state;
    if (!state || !this.isClueGiver()) return '';
    return state.secretWord;
  }

  private buildClue(authorId: string, authorNickname: string, text: string): ActiveClue {
    return {
      id: crypto.randomUUID(),
      authorId,
      authorNickname,
      text,
      expiresAt: Date.now() + CLUE_LIFETIME_SECONDS * 1000,
    };
  }

  private findContactableClue(state: GameState, clueId: string): ActiveClue | undefined {
    return state.activeClues?.find(
      (c) => c.id === clueId && !c.usedWord && c.expiresAt > Date.now(),
    );
  }

  private cancelContact(state: GameState): void {
    this.stopContactCountdown();
    state.phase = 'CLUE_PHASE';
    state.contactGuesses = {};
    state.blockGuess = undefined;
    state.contactClueId = undefined;
    state.contactInitiatorId = undefined;
    state.contactPartnerId = undefined;
    state.contactDeadline = undefined;
    this.contactCountSubject.next(null);
  }

  private expireClues(state: GameState): boolean {
    const now = Date.now();
    const active = state.activeClues ?? [];
    const stillActive: ActiveClue[] = [];
    const newlyExpired: ActiveClue[] = [];

    for (const clue of active) {
      if (clue.expiresAt <= now) {
        newlyExpired.push(clue);
      } else {
        stillActive.push(clue);
      }
    }

    if (newlyExpired.length === 0) return false;

    state.activeClues = stillActive;
    state.expiredClues = [...(state.expiredClues ?? []), ...newlyExpired];

    if (
      state.phase === 'CONTACT_COUNTDOWN' &&
      state.contactClueId &&
      newlyExpired.some((c) => c.id === state.contactClueId)
    ) {
      this.cancelContact(state);
    }

    return true;
  }

  private ensureClueExpiryRunning(): void {
    if (!this.isHost) return;
    const state = this.state;
    if (!state) return;

    const shouldRun = state.phase === 'CLUE_PHASE' || state.phase === 'CONTACT_COUNTDOWN' || state.phase === 'BLOCKED';
    if (!shouldRun) {
      this.stopClueExpiryTimer();
      return;
    }

    if (this.clueExpiryTickSub) return;

    this.clueExpiryTickSub = interval(1000).subscribe(() => {
      const current = this.state;
      if (
        !current ||
        (current.phase !== 'CLUE_PHASE' &&
          current.phase !== 'CONTACT_COUNTDOWN' &&
          current.phase !== 'BLOCKED')
      ) {
        this.stopClueExpiryTimer();
        return;
      }

      if (this.expireClues(current)) {
        this.setStateAndRelay('CLUE_EXPIRED', current);
      }
    });
  }

  private stopClueExpiryTimer(): void {
    this.clueExpiryTickSub?.unsubscribe();
    this.clueExpiryTickSub = null;
  }
}
