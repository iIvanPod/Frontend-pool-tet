/**
 * Typed fetch wrappers for the matchmaking REST API (PROTOCOL.md §3).
 */

import { API_BASE } from '../config';
import type {
  CreateRoomRequest,
  JoinRoomRequest,
  JoinRoomResponse,
  RoomStatus,
} from './messages';

/** Base class for REST failures; carries the HTTP status code. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** 404: the room id does not exist. */
export class RoomNotFoundError extends ApiError {
  constructor(roomId: string) {
    super(404, `Room not found: ${roomId}`);
    this.name = 'RoomNotFoundError';
  }
}

/** 409: the room already has two players. */
export class RoomFullError extends ApiError {
  constructor(roomId: string) {
    super(409, `Room is full: ${roomId}`);
    this.name = 'RoomFullError';
  }
}

/**
 * Thin client over the `/api` matchmaking endpoints. All methods throw
 * {@link ApiError} subclasses on non-2xx responses.
 */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  /** POST /api/rooms — creates a room; caller becomes player index 0. */
  async createRoom(name: string): Promise<JoinRoomResponse> {
    const body: CreateRoomRequest = { name };
    const response = await fetch(`${this.baseUrl}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to create room (HTTP ${response.status})`);
    }
    return (await response.json()) as JoinRoomResponse;
  }

  /** POST /api/rooms/{roomId}/join — joins as player index 1. */
  async joinRoom(roomId: string, name: string): Promise<JoinRoomResponse> {
    const body: JoinRoomRequest = { name };
    const response = await fetch(`${this.baseUrl}/rooms/${encodeURIComponent(roomId)}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 404) {
      throw new RoomNotFoundError(roomId);
    }
    if (response.status === 409) {
      throw new RoomFullError(roomId);
    }
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to join room (HTTP ${response.status})`);
    }
    return (await response.json()) as JoinRoomResponse;
  }

  /** GET /api/rooms/{roomId} — current room status. */
  async getRoom(roomId: string): Promise<RoomStatus> {
    const response = await fetch(`${this.baseUrl}/rooms/${encodeURIComponent(roomId)}`);
    if (response.status === 404) {
      throw new RoomNotFoundError(roomId);
    }
    if (!response.ok) {
      throw new ApiError(response.status, `Failed to fetch room (HTTP ${response.status})`);
    }
    return (await response.json()) as RoomStatus;
  }
}
