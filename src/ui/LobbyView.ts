/**
 * Lobby overlay (PROTOCOL.md §7): create a room, join by id, or reconnect to
 * a session persisted in sessionStorage. After creating, the roomId is shown
 * prominently with a copy button and an "esperando rival..." state.
 *
 * Pure DOM component: all matchmaking decisions live in the callbacks
 * injected by `main.ts`.
 */

import type { StoredSession } from '../session';
import { el } from './dom';

/** Actions the lobby can request from the application. */
export interface LobbyCallbacks {
  onCreateRoom: (name: string) => void;
  onJoinRoom: (roomId: string, name: string) => void;
  onReconnect: (session: StoredSession) => void;
}

const COPY_FEEDBACK_MS = 1500;

/** Lobby screen with "form" and "waiting for rival" states. */
export class LobbyView {
  private readonly root: HTMLElement;
  private readonly callbacks: LobbyCallbacks;

  private readonly formSection: HTMLElement;
  private readonly waitingSection: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly roomIdInput: HTMLInputElement;
  private readonly createButton: HTMLButtonElement;
  private readonly joinButton: HTMLButtonElement;
  private readonly reconnectCard: HTMLElement;
  private readonly reconnectInfo: HTMLElement;
  private readonly reconnectButton: HTMLButtonElement;
  private readonly errorLine: HTMLElement;

  private readonly waitingTitle: HTMLElement;
  private readonly roomIdValue: HTMLInputElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly waitingStatus: HTMLElement;

  private savedSession: StoredSession | null = null;

  constructor(parent: HTMLElement, callbacks: LobbyCallbacks) {
    this.callbacks = callbacks;

    this.root = el('div', 'overlay lobby');
    const card = el('div', 'card lobby-card');
    card.appendChild(el('h1', 'lobby-title', 'Billar 8'));
    card.appendChild(el('p', 'lobby-subtitle', 'Multijugador en línea — 1 vs 1'));

    // ----- Form state -------------------------------------------------------
    this.formSection = el('div', 'lobby-form');

    const nameLabel = el('label', 'field-label', 'Tu nombre');
    this.nameInput = el('input', 'text-input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 24;
    this.nameInput.placeholder = 'Escribe tu nombre';
    nameLabel.appendChild(this.nameInput);
    this.formSection.appendChild(nameLabel);

    this.createButton = el('button', 'btn btn-primary', 'Crear sala');
    this.createButton.type = 'button';
    this.createButton.addEventListener('click', () => this.submitCreate());
    this.formSection.appendChild(this.createButton);

    this.formSection.appendChild(el('div', 'divider', 'o únete a una sala'));

    const joinRow = el('div', 'join-row');
    this.roomIdInput = el('input', 'text-input');
    this.roomIdInput.type = 'text';
    this.roomIdInput.placeholder = 'ID de la sala';
    this.roomIdInput.spellcheck = false;
    joinRow.appendChild(this.roomIdInput);
    this.joinButton = el('button', 'btn btn-secondary', 'Unirse');
    this.joinButton.type = 'button';
    this.joinButton.addEventListener('click', () => this.submitJoin());
    joinRow.appendChild(this.joinButton);
    this.formSection.appendChild(joinRow);

    this.reconnectCard = el('div', 'reconnect-card');
    this.reconnectCard.hidden = true;
    this.reconnectInfo = el('p', 'reconnect-info');
    this.reconnectCard.appendChild(this.reconnectInfo);
    this.reconnectButton = el('button', 'btn btn-accent', 'Reconectar');
    this.reconnectButton.type = 'button';
    this.reconnectButton.addEventListener('click', () => {
      if (this.savedSession !== null) {
        this.callbacks.onReconnect(this.savedSession);
      }
    });
    this.reconnectCard.appendChild(this.reconnectButton);
    this.formSection.appendChild(this.reconnectCard);

    card.appendChild(this.formSection);

    // ----- Waiting state ----------------------------------------------------
    this.waitingSection = el('div', 'lobby-waiting');
    this.waitingSection.hidden = true;

    this.waitingTitle = el('h2', 'waiting-title', 'Sala creada');
    this.waitingSection.appendChild(this.waitingTitle);

    this.waitingSection.appendChild(el('p', 'field-label', 'Comparte este ID con tu rival:'));
    const copyRow = el('div', 'copy-row');
    this.roomIdValue = el('input', 'text-input room-id-value');
    this.roomIdValue.type = 'text';
    this.roomIdValue.readOnly = true;
    copyRow.appendChild(this.roomIdValue);
    this.copyButton = el('button', 'btn btn-secondary', 'Copiar');
    this.copyButton.type = 'button';
    this.copyButton.addEventListener('click', () => {
      void this.copyRoomId();
    });
    copyRow.appendChild(this.copyButton);
    this.waitingSection.appendChild(copyRow);

    const spinnerRow = el('div', 'waiting-spinner-row');
    spinnerRow.appendChild(el('span', 'spinner'));
    this.waitingStatus = el('span', 'waiting-status', 'Esperando rival...');
    spinnerRow.appendChild(this.waitingStatus);
    this.waitingSection.appendChild(spinnerRow);

    card.appendChild(this.waitingSection);

    this.errorLine = el('p', 'error-line');
    this.errorLine.hidden = true;
    card.appendChild(this.errorLine);

    this.root.appendChild(card);
    parent.appendChild(this.root);

    this.nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.submitCreate();
      }
    });
    this.roomIdInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.submitJoin();
      }
    });
  }

  /** Shows the create/join form, offering reconnection if a session exists. */
  showForm(saved: StoredSession | null): void {
    this.savedSession = saved;
    this.root.hidden = false;
    this.formSection.hidden = false;
    this.waitingSection.hidden = true;
    this.clearError();
    this.setBusy(false);
    if (saved !== null) {
      if (this.nameInput.value.trim() === '') {
        this.nameInput.value = saved.name;
      }
      this.reconnectInfo.textContent =
        `Partida en curso como "${saved.name}" (sala ${shortId(saved.roomId)}).`;
      this.reconnectCard.hidden = false;
    } else {
      this.reconnectCard.hidden = true;
    }
  }

  /**
   * Switches to the waiting state, showing the roomId prominently with a
   * copy button. `title` distinguishes create / join / reconnect flows.
   */
  showWaiting(roomId: string, title: string, status: string): void {
    this.root.hidden = false;
    this.formSection.hidden = true;
    this.waitingSection.hidden = false;
    this.clearError();
    this.waitingTitle.textContent = title;
    this.roomIdValue.value = roomId;
    this.setWaitingStatus(status);
  }

  /** Updates the live status line under the spinner in the waiting state. */
  setWaitingStatus(status: string): void {
    this.waitingStatus.textContent = status;
  }

  /** Shows an inline error message. */
  showError(message: string): void {
    this.errorLine.textContent = message;
    this.errorLine.hidden = false;
  }

  /** Disables/enables the action buttons while a REST call is in flight. */
  setBusy(busy: boolean): void {
    this.createButton.disabled = busy;
    this.joinButton.disabled = busy;
    this.reconnectButton.disabled = busy;
  }

  /** Hides the whole lobby overlay (game view takes over). */
  hide(): void {
    this.root.hidden = true;
  }

  private submitCreate(): void {
    const name = this.nameInput.value.trim();
    if (name === '') {
      this.showError('Escribe tu nombre para crear una sala.');
      this.nameInput.focus();
      return;
    }
    this.clearError();
    this.callbacks.onCreateRoom(name);
  }

  private submitJoin(): void {
    const name = this.nameInput.value.trim();
    if (name === '') {
      this.showError('Escribe tu nombre para unirte.');
      this.nameInput.focus();
      return;
    }
    const roomId = this.roomIdInput.value.trim();
    if (roomId === '') {
      this.showError('Escribe el ID de la sala.');
      this.roomIdInput.focus();
      return;
    }
    this.clearError();
    this.callbacks.onJoinRoom(roomId, name);
  }

  private async copyRoomId(): Promise<void> {
    const value = this.roomIdValue.value;
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      // Clipboard API unavailable (permissions/insecure context): fall back
      // to selecting the text so the user can copy manually.
      this.roomIdValue.focus();
      this.roomIdValue.select();
    }
    if (copied) {
      const original = 'Copiar';
      this.copyButton.textContent = '¡Copiado!';
      window.setTimeout(() => {
        this.copyButton.textContent = original;
      }, COPY_FEEDBACK_MS);
    }
  }

  private clearError(): void {
    this.errorLine.hidden = true;
    this.errorLine.textContent = '';
  }
}

/** First block of a UUID, enough to recognize the room at a glance. */
function shortId(roomId: string): string {
  const dash = roomId.indexOf('-');
  return dash > 0 ? roomId.slice(0, dash) : roomId;
}
