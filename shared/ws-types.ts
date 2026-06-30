export type PlayerStatus = 'pending' | 'approved';

export interface Player {
  connectionId: string;
  nickname: string;
  isHost: boolean;
  joinOrder: number;
  status: PlayerStatus;
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
  authorId: string;
  authorNickname: string;
  text: string;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  hostId: string;
  clueGiverId: string;
  secretWord: string;
  revealedPrefix: string;
  activeClue?: ActiveClue;
  contactInitiatorId?: string;
  contactPartnerId?: string;
  canBlock: boolean;
  clueDeadline?: number;
  contactDeadline?: number;
  voteDeadline?: number;
  votes?: Record<string, boolean>;
  contactGuesses?: Record<string, string>;
  blockGuess?: string;
  currentRound: number;
  lastBlockWord?: string;
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
  | 'START_GAME';

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
  | 'VOTE_FORWARD';

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

export interface CreateRoomPayload {
  nickname: string;
}

export interface JoinRoomPayload {
  nickname: string;
  roomCode: string;
}

export interface ApproveRejectPayload {
  targetConnectionId: string;
}

export interface CastVotePayload {
  matched: boolean;
}

export interface HostStateResponsePayload {
  targetHostId: string;
  state: GameState;
}

export const MAX_PLAYERS = 12;
export const MIN_PLAYERS = 2;
export const CLUE_TIMER_SECONDS = 30;
export const CONTACT_COUNTDOWN_SECONDS = 5;
export const VOTE_TIMEOUT_SECONDS = 15;
export const ROOM_CODE_LENGTH = 5;
export const SECRET_WORD_MIN = 4;
export const SECRET_WORD_MAX = 12;

export function generateRoomCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

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
