/**
 * TypeScript mirror of the wire protocol (PROTOCOL.md §3-§5).
 * Backend sources of truth: com.billiards.server.ws.dto.* and api.dto.RoomApiDtos.
 * Do not modify without updating the backend counterparts.
 */

export type GamePhase =
  | 'WAITING_FOR_PLAYERS'
  | 'AWAITING_SHOT'
  | 'SIMULATING'
  | 'PAUSED_DISCONNECTED'
  | 'FINISHED';

export type FoulType = 'NONE' | 'SCRATCH' | 'NO_CONTACT' | 'WRONG_BALL_FIRST';

export type BallGroup = 'SOLIDS' | 'STRIPES';

export interface BallDto {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

export interface PlayerDto {
  playerId: string;
  name: string;
  index: number;
  connected: boolean;
  group: BallGroup | null;
}

// ---------------------------------------------------------------------------
// REST (matchmaking)
// ---------------------------------------------------------------------------

export interface CreateRoomRequest {
  name: string;
}

export interface JoinRoomRequest {
  name: string;
}

export interface JoinRoomResponse {
  roomId: string;
  playerId: string;
  playerIndex: number;
}

export interface RoomStatus {
  roomId: string;
  phase: GamePhase;
  players: PlayerDto[];
}

// ---------------------------------------------------------------------------
// STOMP client -> server
// ---------------------------------------------------------------------------

export interface JoinMessage {
  playerId: string;
}

export interface ShootMessage {
  playerId: string;
  angleRadians: number;
  force: number;
}

// ---------------------------------------------------------------------------
// STOMP server -> client (broadcast on /topic/rooms/{roomId})
// ---------------------------------------------------------------------------

export interface LobbyStateMessage {
  type: 'LOBBY_STATE';
  players: PlayerDto[];
  phase: GamePhase;
}

export interface GameStartMessage {
  type: 'GAME_START';
  players: PlayerDto[];
  balls: BallDto[];
  currentPlayerIndex: number;
  currentPlayerId: string;
}

export interface ShotAcceptedMessage {
  type: 'SHOT_ACCEPTED';
  playerId: string;
  angleRadians: number;
  force: number;
}

export interface ShotRejectedMessage {
  type: 'SHOT_REJECTED';
  playerId: string;
  reason: string;
}

export interface StateSyncMessage {
  type: 'STATE_SYNC';
  tick: number;
  balls: BallDto[];
}

export interface TurnUpdateMessage {
  type: 'TURN_UPDATE';
  balls: BallDto[];
  players: PlayerDto[];
  currentPlayerIndex: number;
  currentPlayerId: string;
  phase: GamePhase;
  foul: FoulType;
  description: string;
}

export interface PlayerDisconnectedMessage {
  type: 'PLAYER_DISCONNECTED';
  playerId: string;
  timeoutSeconds: number;
}

export interface PlayerReconnectedMessage {
  type: 'PLAYER_RECONNECTED';
  playerId: string;
}

export interface GameOverMessage {
  type: 'GAME_OVER';
  winnerPlayerId: string;
  winnerIndex: number;
  reason: string;
  balls: BallDto[];
}

export type ServerMessage =
  | LobbyStateMessage
  | GameStartMessage
  | ShotAcceptedMessage
  | ShotRejectedMessage
  | StateSyncMessage
  | TurnUpdateMessage
  | PlayerDisconnectedMessage
  | PlayerReconnectedMessage
  | GameOverMessage;
