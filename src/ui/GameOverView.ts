/**
 * End-of-game overlay: victory/defeat headline, the server-provided reason,
 * and a "Jugar de nuevo" button that returns to the lobby (the owner clears
 * the session and tears the connection down).
 */

import { el } from './dom';

/** Known GAME_OVER reasons mapped to Spanish; unknown reasons shown as-is. */
const REASON_LABELS: Readonly<Record<string, string>> = {
  ABANDONMENT: 'El rival abandonó la partida.',
  EIGHT_BALL_POCKETED: 'La bola 8 fue entronerada.',
  EIGHT_BALL_EARLY: 'La bola 8 se entroneró antes de tiempo.',
  EIGHT_BALL_WITH_SCRATCH: 'La bola 8 cayó junto con la blanca.',
};

/** Full-screen overlay shown on GAME_OVER. */
export class GameOverView {
  private readonly root: HTMLElement;
  private readonly headline: HTMLElement;
  private readonly reasonLine: HTMLElement;

  constructor(parent: HTMLElement, onPlayAgain: () => void) {
    this.root = el('div', 'overlay gameover');
    this.root.hidden = true;

    const card = el('div', 'card gameover-card');
    this.headline = el('h1', 'gameover-headline');
    card.appendChild(this.headline);
    this.reasonLine = el('p', 'gameover-reason');
    card.appendChild(this.reasonLine);

    const button = el('button', 'btn btn-primary', 'Jugar de nuevo');
    button.type = 'button';
    button.addEventListener('click', onPlayAgain);
    card.appendChild(button);

    this.root.appendChild(card);
    parent.appendChild(this.root);
  }

  /** Shows victory or defeat with the (translated) reason. */
  show(victory: boolean, reason: string): void {
    this.headline.textContent = victory ? '¡Victoria!' : 'Derrota';
    this.headline.classList.toggle('gameover-win', victory);
    this.headline.classList.toggle('gameover-loss', !victory);
    this.reasonLine.textContent = REASON_LABELS[reason] ?? reason;
    this.root.hidden = false;
  }

  /** Hides the overlay (returning to the lobby). */
  hide(): void {
    this.root.hidden = true;
  }
}
