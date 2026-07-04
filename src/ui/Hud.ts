/**
 * In-game HUD: both player names (with connection dots and group tags),
 * whose turn it is (highlighted when it is the local player's turn), and a
 * small indicator for the local WebSocket connection state.
 *
 * Purely presentational: phase / turn / players come exclusively from server
 * messages via `main.ts`.
 */

import type { BallGroup, GamePhase, PlayerDto } from '../net/messages';
import { el } from './dom';

/** Everything the HUD needs to render one frame of game status. */
export interface HudState {
  players: PlayerDto[];
  currentPlayerId: string | null;
  phase: GamePhase;
  myPlayerId: string;
}

/** Spanish label for a ball group. */
export function groupLabel(group: BallGroup | null): string {
  if (group === 'SOLIDS') {
    return 'SÓLIDAS';
  }
  if (group === 'STRIPES') {
    return 'RAYADAS';
  }
  return '';
}

/** Top bar over the table with player plates and a central turn message. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly plates: HTMLElement;
  private readonly turnText: HTMLElement;
  private readonly connectionDot: HTMLElement;
  private readonly connectionText: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');

    this.plates = el('div', 'hud-plates');
    this.root.appendChild(this.plates);

    const center = el('div', 'hud-center');
    this.turnText = el('div', 'hud-turn');
    center.appendChild(this.turnText);
    const connection = el('div', 'hud-connection');
    this.connectionDot = el('span', 'conn-dot conn-ok');
    this.connectionText = el('span', 'conn-text', 'Conectado');
    connection.append(this.connectionDot, this.connectionText);
    center.appendChild(connection);
    this.root.appendChild(center);

    parent.appendChild(this.root);
  }

  /** Re-renders the plates and turn message from authoritative state. */
  update(state: HudState): void {
    this.renderPlates(state);
    this.turnText.textContent = this.turnMessage(state);
    const myTurn = state.phase === 'AWAITING_SHOT' && state.currentPlayerId === state.myPlayerId;
    this.turnText.classList.toggle('hud-turn-mine', myTurn);
  }

  /** Reflects the LOCAL client's WebSocket connectivity. */
  setSelfConnected(connected: boolean): void {
    this.connectionDot.className = connected ? 'conn-dot conn-ok' : 'conn-dot conn-bad';
    this.connectionText.textContent = connected ? 'Conectado' : 'Reconectando...';
  }

  private renderPlates(state: HudState): void {
    this.plates.replaceChildren();
    const ordered = [...state.players].sort((a, b) => a.index - b.index);
    for (const player of ordered) {
      const isMe = player.playerId === state.myPlayerId;
      const isTurn = player.playerId === state.currentPlayerId;
      const plate = el('div', 'plate');
      if (isTurn) {
        plate.classList.add('plate-turn');
      }
      if (isMe) {
        plate.classList.add('plate-me');
      }

      const nameRow = el('div', 'plate-name-row');
      nameRow.appendChild(
        el('span', player.connected ? 'conn-dot conn-ok' : 'conn-dot conn-bad'),
      );
      nameRow.appendChild(el('span', 'plate-name', player.name));
      if (isMe) {
        nameRow.appendChild(el('span', 'plate-you', '(tú)'));
      }
      plate.appendChild(nameRow);

      const group = groupLabel(player.group);
      plate.appendChild(
        el('div', group !== '' ? 'plate-group' : 'plate-group plate-group-empty',
          group !== '' ? group : 'sin grupo'),
      );

      this.plates.appendChild(plate);
    }
  }

  private turnMessage(state: HudState): string {
    switch (state.phase) {
      case 'WAITING_FOR_PLAYERS':
        return 'Esperando jugadores...';
      case 'SIMULATING':
        return 'Bolas en movimiento...';
      case 'PAUSED_DISCONNECTED':
        return 'Partida en pausa';
      case 'FINISHED':
        return 'Partida terminada';
      case 'AWAITING_SHOT': {
        if (state.currentPlayerId === state.myPlayerId) {
          return '¡Tu turno! Arrastra desde la bola blanca para tirar.';
        }
        const current = state.players.find((p) => p.playerId === state.currentPlayerId);
        return current !== undefined ? `Turno de ${current.name}` : 'Turno del rival';
      }
    }
  }
}
