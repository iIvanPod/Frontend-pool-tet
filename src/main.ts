/**
 * Application entry point: builds every dependency explicitly (manual
 * constructor injection, no globals) and owns the client-side state machine.
 *
 * Authoritative-state rules (PROTOCOL.md §5, §7):
 * - `phase` and `currentPlayerId` are updated ONLY from server messages.
 * - STATE_SYNC feeds the interpolation buffer; GAME_START / TURN_UPDATE /
 *   GAME_OVER are full snapshots and reset it via `snap`.
 * - Aiming is enabled only when phase === AWAITING_SHOT and it is the local
 *   player's turn; `tryShoot` re-checks before publishing.
 */

import './style.css';
import Phaser from 'phaser';
import { AimingController } from './game/AimingController';
import { GameScene } from './game/GameScene';
import { SnapshotBuffer } from './game/SnapshotBuffer';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './game/tableLayout';
import { ApiClient, RoomFullError, RoomNotFoundError } from './net/ApiClient';
import type {
  FoulType,
  GamePhase,
  PlayerDto,
  ServerMessage,
  TurnUpdateMessage,
} from './net/messages';
import { SocketClient } from './net/SocketClient';
import { clearSession, loadSession, saveSession, type StoredSession } from './session';
import { DisconnectBanner } from './ui/DisconnectBanner';
import { el } from './ui/dom';
import { GameOverView } from './ui/GameOverView';
import { Hud } from './ui/Hud';
import { LobbyView } from './ui/LobbyView';
import { Toasts } from './ui/Toasts';

const FOUL_LABELS: Readonly<Record<Exclude<FoulType, 'NONE'>, string>> = {
  SCRATCH: 'la bola blanca fue entronerada',
  NO_CONTACT: 'la bola blanca no tocó ninguna bola',
  WRONG_BALL_FIRST: 'primer contacto con una bola incorrecta',
};

/** Everything the {@link App} needs, constructed once in {@link bootstrap}. */
interface AppDependencies {
  api: ApiClient;
  socket: SocketClient;
  buffer: SnapshotBuffer;
  aiming: AimingController;
  scene: GameScene;
  lobby: LobbyView;
  hud: Hud;
  banner: DisconnectBanner;
  gameOverView: GameOverView;
  toasts: Toasts;
  gameRoot: HTMLElement;
  phaserParent: HTMLElement;
}

/** Client-side application controller / state machine. */
class App {
  private readonly api: ApiClient;
  private readonly socket: SocketClient;
  private readonly buffer: SnapshotBuffer;
  private readonly aiming: AimingController;
  private readonly scene: GameScene;
  private readonly lobby: LobbyView;
  private readonly hud: Hud;
  private readonly banner: DisconnectBanner;
  private readonly gameOverView: GameOverView;
  private readonly toasts: Toasts;
  private readonly gameRoot: HTMLElement;
  private readonly phaserParent: HTMLElement;

  private game: Phaser.Game | null = null;
  private session: StoredSession | null = null;
  private inGameView = false;

  // Authoritative state, mirrored ONLY from server messages.
  private phase: GamePhase = 'WAITING_FOR_PLAYERS';
  private currentPlayerId: string | null = null;
  private players: PlayerDto[] = [];

  constructor(deps: AppDependencies) {
    this.api = deps.api;
    this.socket = deps.socket;
    this.buffer = deps.buffer;
    this.aiming = deps.aiming;
    this.scene = deps.scene;
    this.lobby = deps.lobby;
    this.hud = deps.hud;
    this.banner = deps.banner;
    this.gameOverView = deps.gameOverView;
    this.toasts = deps.toasts;
    this.gameRoot = deps.gameRoot;
    this.phaserParent = deps.phaserParent;

    this.socket.onMessage((msg) => this.handleServerMessage(msg));
    this.socket.onConnectionChange((connected) => this.handleConnectionChange(connected));
  }

  /** Shows the lobby, offering reconnection if a session survives in storage. */
  start(): void {
    this.lobby.showForm(loadSession());
  }

  // ----- Lobby actions ------------------------------------------------------

  async handleCreateRoom(name: string): Promise<void> {
    this.lobby.setBusy(true);
    try {
      const created = await this.api.createRoom(name);
      const session: StoredSession = {
        roomId: created.roomId,
        playerId: created.playerId,
        playerIndex: created.playerIndex,
        name,
      };
      this.lobby.showWaiting(session.roomId, 'Sala creada', 'Esperando rival...');
      this.beginSession(session);
    } catch (error) {
      this.lobby.showError(describeApiError(error, 'No se pudo crear la sala.'));
    } finally {
      this.lobby.setBusy(false);
    }
  }

  async handleJoinRoom(roomId: string, name: string): Promise<void> {
    this.lobby.setBusy(true);
    try {
      const joined = await this.api.joinRoom(roomId, name);
      const session: StoredSession = {
        roomId: joined.roomId,
        playerId: joined.playerId,
        playerIndex: joined.playerIndex,
        name,
      };
      this.lobby.showWaiting(session.roomId, 'Unido a la sala', 'Conectando a la partida...');
      this.beginSession(session);
    } catch (error) {
      this.lobby.showError(describeApiError(error, 'No se pudo unir a la sala.'));
    } finally {
      this.lobby.setBusy(false);
    }
  }

  /** Skips REST entirely: WS connect + join acts as reconnection (§6.7). */
  handleReconnect(session: StoredSession): void {
    this.lobby.showWaiting(session.roomId, 'Reconectando', 'Conectando a la sala...');
    this.beginSession(session);
  }

  /** From the game-over screen: clear everything and return to the lobby. */
  handlePlayAgain(): void {
    this.socket.disconnect();
    clearSession();
    this.session = null;
    this.phase = 'WAITING_FOR_PLAYERS';
    this.currentPlayerId = null;
    this.players = [];
    this.buffer.snap([]);
    this.aiming.setActive(false);
    this.banner.hide();
    this.gameOverView.hide();
    this.gameRoot.hidden = true;
    this.inGameView = false;
    this.lobby.showForm(null);
  }

  /**
   * Shot intent from the aiming controller. Re-validates turn + phase so a
   * `shoot` can never be published out of turn (defense in depth; the
   * controller is also disabled outside AWAITING_SHOT + own turn).
   */
  tryShoot(angleRadians: number, force: number): void {
    if (!this.isMyTurnToShoot()) {
      return;
    }
    this.socket.shoot(angleRadians, force);
  }

  // ----- Server messages ----------------------------------------------------

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'LOBBY_STATE': {
        this.players = msg.players;
        this.phase = msg.phase;
        this.updateLobbyWaitingStatus();
        this.refreshHud();
        break;
      }
      case 'GAME_START': {
        this.players = msg.players;
        this.currentPlayerId = msg.currentPlayerId;
        this.phase = 'AWAITING_SHOT';
        this.buffer.snap(msg.balls);
        this.enterGameView();
        this.refreshHud();
        break;
      }
      case 'SHOT_ACCEPTED': {
        this.phase = 'SIMULATING';
        this.refreshHud();
        break;
      }
      case 'SHOT_REJECTED': {
        if (this.session !== null && msg.playerId === this.session.playerId) {
          this.toasts.show(`Tiro rechazado: ${msg.reason}`, 'error');
        }
        break;
      }
      case 'STATE_SYNC': {
        this.buffer.push(msg.balls);
        break;
      }
      case 'TURN_UPDATE': {
        this.players = msg.players;
        this.currentPlayerId = msg.currentPlayerId;
        this.phase = msg.phase;
        this.buffer.snap(msg.balls);
        this.enterGameView();
        this.refreshHud();
        this.toastFoul(msg);
        break;
      }
      case 'PLAYER_DISCONNECTED': {
        this.phase = 'PAUSED_DISCONNECTED';
        this.players = this.players.map((p) =>
          p.playerId === msg.playerId ? { ...p, connected: false } : p,
        );
        if (this.session !== null && msg.playerId !== this.session.playerId) {
          this.banner.show(this.playerName(msg.playerId), msg.timeoutSeconds);
        }
        this.refreshHud();
        break;
      }
      case 'PLAYER_RECONNECTED': {
        this.players = this.players.map((p) =>
          p.playerId === msg.playerId ? { ...p, connected: true } : p,
        );
        this.banner.hide();
        // Phase is restored server-side; the TURN_UPDATE resync that follows
        // carries the authoritative phase, so nothing else changes here.
        this.refreshHud();
        break;
      }
      case 'GAME_OVER': {
        this.phase = 'FINISHED';
        this.currentPlayerId = null;
        this.buffer.snap(msg.balls);
        this.banner.hide();
        this.enterGameView();
        this.refreshHud();
        const victory = this.session !== null && msg.winnerPlayerId === this.session.playerId;
        this.gameOverView.show(victory, msg.reason);
        break;
      }
    }
  }

  private handleConnectionChange(connected: boolean): void {
    this.hud.setSelfConnected(connected);
    if (!this.inGameView && this.session !== null) {
      this.lobby.setWaitingStatus(
        connected ? 'Esperando rival...' : 'Conexión perdida, reintentando...',
      );
    }
  }

  // ----- Internals ----------------------------------------------------------

  private beginSession(session: StoredSession): void {
    this.session = session;
    saveSession(session);
    this.socket.connect(session.roomId, session.playerId);
  }

  private enterGameView(): void {
    if (this.inGameView) {
      return;
    }
    this.inGameView = true;
    this.lobby.hide();
    this.gameRoot.hidden = false;
    this.ensureGameBooted();
  }

  /** Boots Phaser lazily, only once a game session actually starts. */
  private ensureGameBooted(): void {
    if (this.game !== null) {
      return;
    }
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.phaserParent,
      backgroundColor: '#101418',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
      },
      scene: this.scene,
    });
  }

  private refreshHud(): void {
    if (this.session !== null) {
      this.hud.update({
        players: this.players,
        currentPlayerId: this.currentPlayerId,
        phase: this.phase,
        myPlayerId: this.session.playerId,
      });
    }
    this.aiming.setActive(this.isMyTurnToShoot());
  }

  private isMyTurnToShoot(): boolean {
    return (
      this.session !== null &&
      this.phase === 'AWAITING_SHOT' &&
      this.currentPlayerId === this.session.playerId
    );
  }

  private updateLobbyWaitingStatus(): void {
    if (this.inGameView || this.session === null) {
      return;
    }
    const rival = this.players.find((p) => p.playerId !== this.session?.playerId);
    if (rival === undefined) {
      this.lobby.setWaitingStatus('Esperando rival...');
    } else if (rival.connected) {
      this.lobby.setWaitingStatus(`Rival encontrado: ${rival.name}. Comenzando...`);
    } else {
      this.lobby.setWaitingStatus(`Esperando a que ${rival.name} se conecte...`);
    }
  }

  private toastFoul(msg: TurnUpdateMessage): void {
    if (msg.foul === 'NONE') {
      return;
    }
    const label = FOUL_LABELS[msg.foul];
    const detail = msg.description.trim();
    this.toasts.show(detail !== '' ? `Falta: ${label} — ${detail}` : `Falta: ${label}`, 'error');
  }

  private playerName(playerId: string): string {
    const player = this.players.find((p) => p.playerId === playerId);
    return player !== undefined ? player.name : 'El rival';
  }
}

/** Maps REST failures to Spanish user-facing messages. */
function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof RoomNotFoundError) {
    return 'Sala no encontrada. Revisa el ID.';
  }
  if (error instanceof RoomFullError) {
    return 'La sala ya está completa.';
  }
  if (error instanceof TypeError) {
    return 'No se pudo conectar con el servidor.';
  }
  return fallback;
}

/** Builds the DOM skeleton and wires every component together. */
function bootstrap(): void {
  const appRoot = document.getElementById('app');
  if (appRoot === null) {
    throw new Error('Missing #app root element');
  }

  // Game view container: HUD bar + Phaser canvas host + disconnect banner.
  const gameRoot = el('div', 'game-root');
  gameRoot.hidden = true;
  const phaserParent = el('div', 'phaser-parent');
  phaserParent.style.maxWidth = `${CANVAS_WIDTH}px`;
  phaserParent.style.aspectRatio = `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`;

  const api = new ApiClient();
  const socket = new SocketClient();
  const buffer = new SnapshotBuffer();
  const aiming = new AimingController((angle, force) => app.tryShoot(angle, force));
  const scene = new GameScene(buffer, aiming);

  const hud = new Hud(gameRoot);
  gameRoot.appendChild(phaserParent);
  const banner = new DisconnectBanner(gameRoot);
  appRoot.appendChild(gameRoot);

  const lobby = new LobbyView(appRoot, {
    onCreateRoom: (name) => void app.handleCreateRoom(name),
    onJoinRoom: (roomId, name) => void app.handleJoinRoom(roomId, name),
    onReconnect: (session) => app.handleReconnect(session),
  });
  const gameOverView = new GameOverView(appRoot, () => app.handlePlayAgain());
  const toasts = new Toasts(appRoot);

  const app = new App({
    api,
    socket,
    buffer,
    aiming,
    scene,
    lobby,
    hud,
    banner,
    gameOverView,
    toasts,
    gameRoot,
    phaserParent,
  });
  app.start();
}

bootstrap();
