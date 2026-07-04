/**
 * Banner shown when the OTHER player disconnects (PLAYER_DISCONNECTED):
 * displays a live countdown from the server-provided timeout. The countdown
 * is cosmetic — the server enforces the real timer and will end the game
 * with GAME_OVER (ABANDONMENT) if it expires. Hidden on PLAYER_RECONNECTED.
 */

import { el } from './dom';

/** Countdown banner over the table while the opponent is disconnected. */
export class DisconnectBanner {
  private readonly root: HTMLElement;
  private readonly text: HTMLElement;
  private intervalId: number | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'disconnect-banner');
    this.root.hidden = true;
    this.text = el('span', 'disconnect-text');
    this.root.appendChild(this.text);
    parent.appendChild(this.root);
  }

  /** Shows the banner and starts a 1 Hz countdown from `timeoutSeconds`. */
  show(playerName: string, timeoutSeconds: number): void {
    this.stopTimer();
    let remaining = Math.max(0, Math.floor(timeoutSeconds));
    const render = (): void => {
      this.text.textContent =
        `${playerName} se desconectó. Si no vuelve en ${remaining} s, ganas por abandono.`;
    };
    render();
    this.root.hidden = false;
    this.intervalId = window.setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      render();
      if (remaining === 0) {
        this.stopTimer();
      }
    }, 1000);
  }

  /** Hides the banner and stops the countdown. */
  hide(): void {
    this.stopTimer();
    this.root.hidden = true;
  }

  private stopTimer(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
