export type PlayerStatus = 'pending' | 'approved';

export interface Player {
  connectionId: string;
  nickname: string;
  isHost: boolean;
  joinOrder: number;
  status: PlayerStatus;
  activeInRound?: boolean;
}

export type GamePhase =
  | 'LOBBY'
  | 'WORD_SETUP'
  | 'CLUE_PHASE'
  | 'CONTACT_COUNTDOWN'
  | 'BLOCKED'
  | 'MATCH_VOTE'
  | 'LETTER_REVEAL'
  | 'ROUND_COMPLETE';

export interface ActiveClue {
  id: string;
  authorId: string;
  authorNickname: string;
  text: string;
  usedWord?: string;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  hostId: string;
  clueGiverId: string;
  secretWord: string;
  revealedPrefix: string;
  activeClues?: ActiveClue[];
  contactInitiatorId?: string;
  contactPartnerId?: string;
  contactClueId?: string;
  canBlock: boolean;
  clueDeadline?: number;
  contactDeadline?: number;
  voteDeadline?: number;
  votes?: Record<string, boolean>;
  contactGuesses?: Record<string, string>;
  blockGuess?: string;
  currentRound: number;
  lastBlockWord?: string;
  lastRoundWord?: string;
  scores?: Record<string, number>;
  usedMatchWords?: string[];
}

export type ClientAction =
  | 'CREATE_ROOM'
  | 'JOIN_ROOM'
  | 'APPROVE_PLAYER'
  | 'REJECT_PLAYER'
  | 'RELAY'
  | 'REQUEST_HOST_STATE'
  | 'HOST_STATE_RESPONSE'
  | 'CAST_VOTE'
  | 'FORWARD_TO_HOST'
  | 'START_GAME'
  | 'REJOIN_ROOM'
  | 'REQUEST_GAME_STATE'
  | 'GAME_STATE_RESPONSE';

export type RelayEventType =
  | 'STATE_SYNC'
  | 'GAME_STARTED'
  | 'SECRET_WORD_SET'
  | 'CLUE_SUBMITTED'
  | 'CONTACT_INITIATED'
  | 'CONTACT_BLOCKED'
  | 'MATCH_VOTE_STARTED'
  | 'MATCH_RESULT'
  | 'LETTER_REVEALED'
  | 'ROUND_COMPLETE'
  | 'CLUE_GIVER_ROTATED';

export type ServerEvent =
  | 'ROOM_CREATED'
  | 'JOIN_PENDING'
  | 'JOIN_REJECTED'
  | 'PLAYER_APPROVED'
  | 'PLAYER_REJECTED'
  | 'HOST_CHANGED'
  | 'ERROR'
  | 'REQUEST_HOST_STATE'
  | 'HOST_STATE_RESPONSE'
  | 'RELAY'
  | 'VOTE_FORWARD'
  | 'PLAYER_ACTION'
  | 'PLAYER_LEFT'
  | 'REJOIN_OK'
  | 'PLAYER_REJOINED'
  | 'REQUEST_GAME_STATE'
  | 'GAME_STATE_RESPONSE';

export interface WsEnvelope<T = unknown> {
  action: ClientAction | ServerEvent | 'message';
  payload: T;
  roomCode?: string;
  connectionId?: string;
}

export interface RelayPayload {
  type: RelayEventType;
  state: GameState;
  meta?: Record<string, unknown>;
}

export const MAX_PLAYERS = 12;
export const MIN_PLAYERS = 3;
export const CLUE_TIMER_SECONDS = 30;
export const CONTACT_COUNTDOWN_SECONDS = 15;
export const VOTE_TIMEOUT_SECONDS = 15;
export const SECRET_WORD_MIN = 4;
export const SECRET_WORD_MAX = 12;
export const CLUE_AUTHOR_POINTS = 50;
export const CONTACT_INITIATOR_POINTS = 25;
export const BLOCK_POINTS = 15;
export const CONTACT_MATCH_POINTS = 15;

export function isValidSecretWord(word: string): boolean {
  const trimmed = word.trim();
  const length = [...trimmed].length;
  return (
    length >= SECRET_WORD_MIN &&
    length <= SECRET_WORD_MAX &&
    /^\p{L}+$/u.test(trimmed)
  );
}

export function redactStateForPlayer(state: GameState, viewerId: string): GameState {
  const clone: GameState = JSON.parse(JSON.stringify(state));
  if (viewerId !== state.clueGiverId) {
    clone.secretWord = '';
  }
  return clone;
}

export function createInitialState(players: Player[], hostId: string): GameState {
  const approved = players
    .filter((p) => p.status === 'approved')
    .sort((a, b) => a.joinOrder - b.joinOrder)
    .map((p) => ({ ...p, activeInRound: p.activeInRound !== false }));
  const scores: Record<string, number> = {};
  for (const p of approved) {
    scores[p.connectionId] = 0;
  }
  return {
    phase: 'LOBBY',
    players: approved,
    hostId,
    clueGiverId: approved[0]?.connectionId ?? hostId,
    secretWord: '',
    revealedPrefix: '',
    canBlock: true,
    currentRound: 1,
    scores,
    usedMatchWords: [],
  };
}
