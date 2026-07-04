/**
 * Transient toast notifications (fouls, rejected shots, generic info).
 * Purely presentational; owners decide what and when to show.
 */

import { el } from './dom';

export type ToastKind = 'info' | 'error';

const DEFAULT_DURATION_MS = 4500;
const FADE_OUT_MS = 300;

/** Stacks short-lived messages in a fixed container. */
export class Toasts {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'toasts');
    parent.appendChild(this.root);
  }

  /** Shows a toast that fades out after `durationMs`. */
  show(text: string, kind: ToastKind = 'info', durationMs: number = DEFAULT_DURATION_MS): void {
    const toast = el('div', `toast toast-${kind}`, text);
    this.root.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add('toast-out');
      window.setTimeout(() => toast.remove(), FADE_OUT_MS);
    }, durationMs);
  }
}
