/**
 * Entity-interpolation snapshot buffer (PROTOCOL.md §7).
 *
 * STATE_SYNC snapshots are buffered with their local arrival time; the
 * renderer samples the world at `now - INTERPOLATION_DELAY_MS`, lerping
 * between the two bracketing snapshots. Authoritative full snapshots
 * (GAME_START / TURN_UPDATE / GAME_OVER) reset the buffer via {@link snap}.
 */

import { INTERPOLATION_DELAY_MS } from '../config';
import type { BallDto } from '../net/messages';

/** Interpolated per-ball render state (world meters). */
export interface RenderBall {
  id: number;
  x: number;
  y: number;
  pocketed: boolean;
}

interface Snapshot {
  receivedAt: number;
  balls: BallDto[];
}

/** History to retain behind the newest snapshot, in ms. */
const HISTORY_MS = Math.max(1000, INTERPOLATION_DELAY_MS * 4);

function toRenderBalls(balls: BallDto[]): RenderBall[] {
  return balls.map((b) => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed }));
}

/** Buffers server snapshots and produces time-delayed interpolated states. */
export class SnapshotBuffer {
  private snapshots: Snapshot[] = [];

  /** Appends a STATE_SYNC snapshot stamped with `performance.now()`. */
  push(balls: BallDto[]): void {
    const receivedAt = performance.now();
    this.snapshots.push({ receivedAt, balls });
    // Trim history that can no longer be bracketed by the render time.
    const cutoff = receivedAt - HISTORY_MS;
    while (this.snapshots.length > 2 && this.snapshots[1].receivedAt < cutoff) {
      this.snapshots.shift();
    }
  }

  /**
   * Clears the buffer and pins a single authoritative snapshot. Used on
   * GAME_START / TURN_UPDATE / GAME_OVER so the next frames render the
   * settled state exactly.
   */
  snap(balls: BallDto[]): void {
    this.snapshots = [{ receivedAt: performance.now(), balls }];
  }

  /**
   * Samples the interpolated ball states at `nowMs - INTERPOLATION_DELAY_MS`.
   * Clamps to the oldest/newest snapshot outside the buffered range; returns
   * the single snapshot as-is when only one is buffered, and an empty array
   * when the buffer is empty.
   */
  sample(nowMs: number): RenderBall[] {
    const count = this.snapshots.length;
    if (count === 0) {
      return [];
    }
    if (count === 1) {
      return toRenderBalls(this.snapshots[0].balls);
    }

    const renderTime = nowMs - INTERPOLATION_DELAY_MS;
    const oldest = this.snapshots[0];
    const newest = this.snapshots[count - 1];
    if (renderTime <= oldest.receivedAt) {
      return toRenderBalls(oldest.balls);
    }
    if (renderTime >= newest.receivedAt) {
      return toRenderBalls(newest.balls);
    }

    // Find the bracketing pair: from.receivedAt <= renderTime <= to.receivedAt.
    let index = 0;
    while (index < count - 2 && this.snapshots[index + 1].receivedAt < renderTime) {
      index += 1;
    }
    const from = this.snapshots[index];
    const to = this.snapshots[index + 1];
    const span = to.receivedAt - from.receivedAt;
    const t = span > 0 ? (renderTime - from.receivedAt) / span : 1;
    return this.lerp(from.balls, to.balls, t);
  }

  private lerp(fromBalls: BallDto[], toBalls: BallDto[], t: number): RenderBall[] {
    const fromById = new Map<number, BallDto>();
    for (const ball of fromBalls) {
      fromById.set(ball.id, ball);
    }
    return toBalls.map((to) => {
      const from = fromById.get(to.id);
      if (from === undefined || from.pocketed || to.pocketed) {
        // No older sample, or the ball is (about to be) captured: no lerp.
        return { id: to.id, x: to.x, y: to.y, pocketed: to.pocketed };
      }
      return {
        id: to.id,
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        pocketed: to.pocketed,
      };
    });
  }
}
