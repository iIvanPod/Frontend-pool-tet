/**
 * Aim + power input (PROTOCOL.md §7). Only active while the local player is
 * allowed to shoot (phase AWAITING_SHOT and it is their turn); the owner
 * (`main.ts`) toggles {@link setActive} from server messages only. When
 * inactive, no pointer input is processed and nothing can be sent.
 */

import Phaser from 'phaser';
import { CANVAS_HEIGHT, RAIL_PX } from './tableLayout';

/** Pixel drag distance that maps to maximum force. */
const FORCE_FULL_DRAG_PX = 300;
const FORCE_MIN = 0.05;
const FORCE_MAX = 1;

/** Called with the validated shot intent when the player releases the drag. */
export type ShootCallback = (angleRadians: number, force: number) => void;

/** Supplies the cue ball's current canvas position (null if not renderable). */
export type CueBallLocator = () => { x: number; y: number } | null;

/**
 * Pointer-driven aiming: the aim line always points from the cue ball toward
 * the pointer; force grows with drag distance from the pointer-down position.
 * Releasing the pointer fires the shoot callback exactly once.
 */
export class AimingController {
  private readonly onShoot: ShootCallback;
  private gfx: Phaser.GameObjects.Graphics | null = null;
  private locateCueBall: CueBallLocator = () => null;
  private active = false;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;

  constructor(onShoot: ShootCallback) {
    this.onShoot = onShoot;
  }

  /**
   * Binds the controller to a scene. Called once by the scene's `create()`.
   */
  attach(scene: Phaser.Scene, locateCueBall: CueBallLocator): void {
    this.locateCueBall = locateCueBall;
    this.gfx = scene.add.graphics();
    this.gfx.setDepth(10);

    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer);
    });
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerMove(pointer);
    });
    scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerUp(pointer);
    });
    scene.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {
      this.handlePointerUp(pointer);
    });
  }

  /**
   * Enables/disables input. Disabling cancels any in-progress drag so a shot
   * can never be emitted out of turn or in the wrong phase.
   */
  setActive(active: boolean): void {
    if (this.active === active) {
      return;
    }
    this.active = active;
    if (!active) {
      this.dragging = false;
      this.clearGraphics();
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.active || this.locateCueBall() === null) {
      return;
    }
    this.dragging = true;
    this.dragStartX = pointer.x;
    this.dragStartY = pointer.y;
    this.redraw(pointer);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.active || !this.dragging) {
      return;
    }
    this.redraw(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    this.clearGraphics();
    if (!this.active) {
      return;
    }
    const shot = this.computeShot(pointer);
    if (shot !== null) {
      this.onShoot(shot.angleRadians, shot.force);
    }
  }

  private computeShot(
    pointer: Phaser.Input.Pointer,
  ): { angleRadians: number; force: number } | null {
    const cue = this.locateCueBall();
    if (cue === null) {
      return null;
    }
    const dx = pointer.x - cue.x;
    const dy = pointer.y - cue.y;
    if (dx === 0 && dy === 0) {
      return null;
    }
    // Uniform pixel scale ⇒ the pixel-space angle equals the world angle.
    const angleRadians = Math.atan2(dy, dx);
    const dragDistancePx = Math.hypot(
      pointer.x - this.dragStartX,
      pointer.y - this.dragStartY,
    );
    const force = Math.min(FORCE_MAX, Math.max(FORCE_MIN, dragDistancePx / FORCE_FULL_DRAG_PX));
    return { angleRadians, force };
  }

  private redraw(pointer: Phaser.Input.Pointer): void {
    const gfx = this.gfx;
    if (gfx === null) {
      return;
    }
    gfx.clear();
    const shot = this.computeShot(pointer);
    const cue = this.locateCueBall();
    if (shot === null || cue === null) {
      return;
    }

    // Aim line from the cue ball toward the pointer, extended a bit.
    const length = Math.max(Math.hypot(pointer.x - cue.x, pointer.y - cue.y), 40) + 60;
    const endX = cue.x + Math.cos(shot.angleRadians) * length;
    const endY = cue.y + Math.sin(shot.angleRadians) * length;
    gfx.lineStyle(2, 0xffffff, 0.85);
    gfx.beginPath();
    gfx.moveTo(cue.x, cue.y);
    gfx.lineTo(endX, endY);
    gfx.strokePath();
    gfx.lineStyle(1, 0xffffff, 0.6);
    gfx.strokeCircle(cue.x, cue.y, 18);

    this.drawPowerGauge(gfx, shot.force);
  }

  private drawPowerGauge(gfx: Phaser.GameObjects.Graphics, force: number): void {
    const width = 220;
    const height = 16;
    const x = RAIL_PX;
    const y = CANVAS_HEIGHT - height - 12;
    gfx.fillStyle(0x000000, 0.55);
    gfx.fillRoundedRect(x - 3, y - 3, width + 6, height + 6, 5);
    const color = force < 0.4 ? 0x51cf66 : force < 0.75 ? 0xfcc419 : 0xfa5252;
    gfx.fillStyle(color, 0.95);
    gfx.fillRoundedRect(x, y, Math.max(6, width * force), height, 4);
    gfx.lineStyle(1, 0xffffff, 0.7);
    gfx.strokeRoundedRect(x - 3, y - 3, width + 6, height + 6, 5);
  }

  private clearGraphics(): void {
    if (this.gfx !== null) {
      this.gfx.clear();
    }
  }
}
