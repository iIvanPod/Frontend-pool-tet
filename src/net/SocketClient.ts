/**
 * STOMP-over-native-WebSocket gameplay client (PROTOCOL.md §4-§5).
 *
 * On EVERY (re)connect it re-subscribes to the room topic and re-sends the
 * `join` message so the server re-binds this WS session to the player
 * (presence + reconnection semantics).
 */

import { Client, type IMessage } from '@stomp/stompjs';
import { STOMP_RECONNECT_DELAY_MS, WS_PATH } from '../config';
import type { JoinMessage, ServerMessage, ShootMessage } from './messages';

const KNOWN_MESSAGE_TYPES: ReadonlySet<string> = new Set<ServerMessage['type']>([
  'LOBBY_STATE',
  'GAME_START',
  'SHOT_ACCEPTED',
  'SHOT_REJECTED',
  'STATE_SYNC',
  'TURN_UPDATE',
  'PLAYER_DISCONNECTED',
  'PLAYER_RECONNECTED',
  'GAME_OVER',
]);

function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && KNOWN_MESSAGE_TYPES.has(type);
}

/** Handler invoked for every valid server message received on the room topic. */
export type MessageHandler = (msg: ServerMessage) => void;

/** Handler invoked when the underlying WebSocket connects/disconnects. */
export type ConnectionHandler = (connected: boolean) => void;

/**
 * Wraps a `@stomp/stompjs` {@link Client} bound to a single room + player.
 * Construct once, register handlers, then call {@link connect}.
 */
export class SocketClient {
  private client: Client | null = null;
  private roomId = '';
  private playerId = '';
  private readonly messageHandlers: MessageHandler[] = [];
  private readonly connectionHandlers: ConnectionHandler[] = [];

  /** Registers a handler for typed server messages. */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /** Registers a handler for WS connectivity changes (own connection). */
  onConnectionChange(handler: ConnectionHandler): void {
    this.connectionHandlers.push(handler);
  }

  /**
   * Opens the STOMP connection for the given room/player. Auto-reconnects
   * forever with {@link STOMP_RECONNECT_DELAY_MS}; each successful connect
   * re-subscribes and re-joins.
   */
  connect(roomId: string, playerId: string): void {
    if (this.client !== null) {
      return;
    }
    this.roomId = roomId;
    this.playerId = playerId;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const brokerURL = `${protocol}://${window.location.host}${WS_PATH}`;

    this.client = new Client({
      brokerURL,
      reconnectDelay: STOMP_RECONNECT_DELAY_MS,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        const client = this.client;
        if (client === null) {
          return;
        }
        client.subscribe(`/topic/rooms/${this.roomId}`, (frame) => this.dispatch(frame));
        const join: JoinMessage = { playerId: this.playerId };
        client.publish({
          destination: `/app/rooms/${this.roomId}/join`,
          body: JSON.stringify(join),
        });
        this.notifyConnection(true);
      },
      onWebSocketClose: () => {
        this.notifyConnection(false);
      },
      onStompError: (frame) => {
        console.error('[SocketClient] STOMP error:', frame.headers['message'], frame.body);
      },
    });
    this.client.activate();
  }

  /** Sends the shot intent for the bound player (PROTOCOL.md §4). */
  shoot(angleRadians: number, force: number): void {
    const client = this.client;
    if (client === null || !client.connected) {
      return;
    }
    const msg: ShootMessage = { playerId: this.playerId, angleRadians, force };
    client.publish({
      destination: `/app/rooms/${this.roomId}/shoot`,
      body: JSON.stringify(msg),
    });
  }

  /** Closes the connection and stops auto-reconnecting. */
  disconnect(): void {
    const client = this.client;
    this.client = null;
    if (client !== null) {
      void client.deactivate();
    }
  }

  private dispatch(frame: IMessage): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(frame.body);
    } catch {
      console.warn('[SocketClient] Non-JSON frame ignored:', frame.body);
      return;
    }
    if (!isServerMessage(parsed)) {
      console.warn('[SocketClient] Unknown message ignored:', parsed);
      return;
    }
    for (const handler of this.messageHandlers) {
      handler(parsed);
    }
  }

  private notifyConnection(connected: boolean): void {
    for (const handler of this.connectionHandlers) {
      handler(connected);
    }
  }
}
