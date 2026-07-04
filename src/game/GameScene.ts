/**
 * Dumb-renderer Phaser scene: draws the table from the contract constants
 * and renders the 16 balls at the interpolated positions produced by
 * {@link SnapshotBuffer}. No physics runs on the client.
 */

import Phaser from 'phaser';
import { POCKETS } from '../config';
import type { AimingController } from './AimingController';
import { ballTextureKey, createBallCanvas } from './ballTextures';
import type { RenderBall, SnapshotBuffer } from './SnapshotBuffer';
import {
  BALL_RADIUS_PX,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FOOT_SPOT,
  HEAD_SPOT,
  PLAYFIELD_HEIGHT_PX,
  PLAYFIELD_WIDTH_PX,
  POCKET_RADIUS_PX,
  RAIL_PX,
  toScreenX,
  toScreenY,
} from './tableLayout';

const BALL_COUNT = 16;
const CUE_BALL_ID = 0;

/** Pixel position of a ball center on the canvas. */
export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Renders table + balls. Dependencies are injected via the constructor and
 * the scene instance is handed to the Phaser game config by `main.ts`.
 */
export class GameScene extends Phaser.Scene {
  private readonly buffer: SnapshotBuffer;
  private readonly aiming: AimingController;
  private readonly ballImages = new Map<number, Phaser.GameObjects.Image>();
  private cuePixelPos: PixelPoint | null = null;

  constructor(buffer: SnapshotBuffer, aiming: AimingController) {
    super({ key: 'game' });
    this.buffer = buffer;
    this.aiming = aiming;
  }

  /** Phaser lifecycle: builds the static table and the ball sprites. */
  create(): void {
    this.drawTable();
    this.createBalls();
    this.aiming.attach(this, () => this.getCueBallPixelPos());
  }

  /** Phaser lifecycle: samples the interpolation buffer every frame. */
  update(): void {
    const balls = this.buffer.sample(performance.now());
    if (balls.length === 0) {
      return;
    }
    this.cuePixelPos = null;
    for (const ball of balls) {
      this.applyBallState(ball);
    }
  }

  /**
   * Current on-canvas position of the cue ball, or null if unknown or
   * pocketed. Used by the aiming controller.
   */
  getCueBallPixelPos(): PixelPoint | null {
    return this.cuePixelPos;
  }

  private applyBallState(ball: RenderBall): void {
    const image = this.ballImages.get(ball.id);
    if (image === undefined) {
      return;
    }
    if (ball.pocketed) {
      image.setVisible(false);
      return;
    }
    const x = toScreenX(ball.x);
    const y = toScreenY(ball.y);
    image.setVisible(true);
    image.setPosition(x, y);
    if (ball.id === CUE_BALL_ID) {
      this.cuePixelPos = { x, y };
    }
  }

  private createBalls(): void {
    for (let id = 0; id < BALL_COUNT; id += 1) {
      const key = ballTextureKey(id);
      if (!this.textures.exists(key)) {
        this.textures.addCanvas(key, createBallCanvas(id));
      }
      const image = this.add.image(-100, -100, key);
      image.setDisplaySize(BALL_RADIUS_PX * 2, BALL_RADIUS_PX * 2);
      image.setDepth(5);
      image.setVisible(false);
      this.ballImages.set(id, image);
    }
  }

  private drawTable(): void {
    const g = this.add.graphics();
    g.setDepth(0);

    // Wooden outer frame.
    g.fillStyle(0x5c3a21, 1);
    g.fillRoundedRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 22);
    g.fillStyle(0x4a2e19, 1);
    g.fillRoundedRect(6, 6, CANVAS_WIDTH - 12, CANVAS_HEIGHT - 12, 18);

    // Cushion band (slightly darker cloth) then playfield cloth.
    const cushion = 10;
    g.fillStyle(0x0a5c30, 1);
    g.fillRect(
      RAIL_PX - cushion,
      RAIL_PX - cushion,
      PLAYFIELD_WIDTH_PX + cushion * 2,
      PLAYFIELD_HEIGHT_PX + cushion * 2,
    );
    g.fillStyle(0x0e7a3f, 1);
    g.fillRect(RAIL_PX, RAIL_PX, PLAYFIELD_WIDTH_PX, PLAYFIELD_HEIGHT_PX);

    // Head string (vertical line through the head spot).
    g.lineStyle(2, 0x0a5c30, 0.9);
    g.beginPath();
    g.moveTo(toScreenX(HEAD_SPOT.x), toScreenY(0));
    g.lineTo(toScreenX(HEAD_SPOT.x), toScreenY(0) + PLAYFIELD_HEIGHT_PX);
    g.strokePath();

    // Pockets (from the contract POCKETS list).
    for (const pocket of POCKETS) {
      const px = toScreenX(pocket.x);
      const py = toScreenY(pocket.y);
      g.fillStyle(0x241505, 1);
      g.fillCircle(px, py, POCKET_RADIUS_PX + 5);
      g.fillStyle(0x050505, 1);
      g.fillCircle(px, py, POCKET_RADIUS_PX);
    }

    // Head & foot spots.
    for (const spot of [HEAD_SPOT, FOOT_SPOT]) {
      g.fillStyle(0xd8d2c0, 0.9);
      g.fillCircle(toScreenX(spot.x), toScreenY(spot.y), 4);
    }
  }
}
