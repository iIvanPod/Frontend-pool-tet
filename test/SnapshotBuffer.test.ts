import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SnapshotBuffer } from '../src/game/SnapshotBuffer';
import { INTERPOLATION_DELAY_MS } from '../src/config';
import type { BallDto } from '../src/net/messages';

/**
 * QA matrix §2 — "Test de Interpolación (Client-Side)".
 *
 * The renderer sits {@link INTERPOLATION_DELAY_MS} behind server time and lerps
 * between buffered STATE_SYNC snapshots. These tests drive a deterministic clock
 * (stubbing `performance.now`, which the buffer stamps snapshots with) and assert
 * the interpolation is correct at the boundaries and — under simulated network
 * jitter — smooth: strictly forward, no frozen frames, no abrupt jumps, and
 * measurably smoother than naively rendering the latest snapshot (rubberbanding).
 */

let clock = 0;

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ball(id: number, x: number, y: number, pocketed = false): BallDto {
  return { id, x, y, vx: 0, vy: 0, pocketed };
}

/** Pushes a snapshot as if it arrived at local time `arrivalMs`. */
function pushAt(buffer: SnapshotBuffer, arrivalMs: number, balls: BallDto[]): void {
  clock = arrivalMs;
  buffer.push(balls);
}

describe('SnapshotBuffer basic sampling', () => {
  it('returns nothing while empty', () => {
    expect(new SnapshotBuffer().sample(1000)).toEqual([]);
  });

  it('renders a single authoritative snapshot exactly (snap)', () => {
    const buffer = new SnapshotBuffer();
    buffer.snap([ball(0, 0.56, 0.56), ball(8, 1.68, 0.56)]);
    const out = buffer.sample(clock + 999);
    expect(out).toEqual([
      { id: 0, x: 0.56, y: 0.56, pocketed: false },
      { id: 8, x: 1.68, y: 0.56, pocketed: false },
    ]);
  });

  it('snap() discards the interpolation history and pins the exact state', () => {
    const buffer = new SnapshotBuffer();
    pushAt(buffer, 0, [ball(0, 0, 0.5)]);
    pushAt(buffer, 100, [ball(0, 1, 0.5)]); // clock is now 100
    buffer.snap([ball(0, 2.0, 0.5)]); // authoritative TURN_UPDATE, stamped at 100

    // Sample at a render time (50) that falls INSIDE the old snapshot range. Only a
    // true history-discard returns the pinned 2.0 here; a snap() that merely appended
    // would leave the old [0,100] snapshots and interpolate to ~0.5 instead.
    const out = buffer.sample(50 + INTERPOLATION_DELAY_MS);
    expect(out).toHaveLength(1);
    expect(out[0].x).toBeCloseTo(2.0, 12);
  });
});

describe('SnapshotBuffer interpolation', () => {
  it('lerps linearly between the two bracketing snapshots', () => {
    const buffer = new SnapshotBuffer();
    pushAt(buffer, 0, [ball(0, 0, 0.5)]);
    pushAt(buffer, 100, [ball(0, 1.0, 0.5)]);

    // renderTime = now - INTERPOLATION_DELAY_MS; aim renderTime at 25/50/75.
    for (const [renderTime, expected] of [
      [25, 0.25],
      [50, 0.5],
      [75, 0.75],
    ] as const) {
      const out = buffer.sample(renderTime + INTERPOLATION_DELAY_MS);
      expect(out[0].x).toBeCloseTo(expected, 9);
    }
  });

  it('clamps to the oldest snapshot before the buffered range', () => {
    const buffer = new SnapshotBuffer();
    pushAt(buffer, 0, [ball(0, 0, 0.5)]);
    pushAt(buffer, 100, [ball(0, 1.0, 0.5)]);
    // renderTime <= 0 -> oldest
    const out = buffer.sample(INTERPOLATION_DELAY_MS - 30);
    expect(out[0].x).toBeCloseTo(0, 12);
  });

  it('clamps to the newest snapshot past the buffered range', () => {
    const buffer = new SnapshotBuffer();
    pushAt(buffer, 0, [ball(0, 0, 0.5)]);
    pushAt(buffer, 100, [ball(0, 1.0, 0.5)]);
    // renderTime >= 100 -> newest
    const out = buffer.sample(100 + INTERPOLATION_DELAY_MS + 50);
    expect(out[0].x).toBeCloseTo(1.0, 12);
  });

  it('does not interpolate a ball that is being pocketed', () => {
    const buffer = new SnapshotBuffer();
    pushAt(buffer, 0, [ball(0, 0.5, 0.5, false)]);
    pushAt(buffer, 100, [ball(0, 0.0, 0.0, true)]); // captured
    const out = buffer.sample(50 + INTERPOLATION_DELAY_MS);
    expect(out[0].pocketed).toBe(true);
    expect(out[0].x).toBeCloseTo(0.0, 12);
    expect(out[0].y).toBeCloseTo(0.0, 12);
  });
});

describe('SnapshotBuffer smooths network jitter (no rubberbanding)', () => {
  it('produces strictly forward, jump-free motion and beats naive rendering', () => {
    const buffer = new SnapshotBuffer();

    // A ball moving at constant per-tick displacement, as a fixed-timestep server
    // emits it, but arriving over a jittery link: nominal 30 Hz (33.3 ms) cadence
    // perturbed by up to ~±12 ms. Deterministic jitter -> reproducible test.
    const TICK_MS = 1000 / 30;
    const STEP_M = 0.033; // metres advanced per server tick
    const jitter = [0, 9, -7, 12, -11, 6, -4, 10, -8, 5, -2, 8, -6, 11, -9, 4, 0, 7];
    const arrival: number[] = [];
    for (let k = 0; k < jitter.length; k += 1) {
      const t = k * TICK_MS + jitter[k];
      arrival.push(t);
      pushAt(buffer, t, [ball(0, k * STEP_M, 0.5)]);
    }

    // Render at a steady 60 fps across a window that stays inside the buffered
    // range (so we test interpolation, not edge clamping / extrapolation).
    const FRAME_MS = 1000 / 60;
    const first = arrival[1] + INTERPOLATION_DELAY_MS + 1;
    const last = arrival[arrival.length - 2] + INTERPOLATION_DELAY_MS - 1;

    const interp: number[] = [];
    const naive: number[] = [];
    for (let now = first; now <= last; now += FRAME_MS) {
      interp.push(buffer.sample(now)[0].x);

      // Naive baseline: show the newest snapshot whose arrival <= renderTime,
      // i.e. no interpolation — the source of visible stutter under jitter.
      const renderTime = now - INTERPOLATION_DELAY_MS;
      let idx = 0;
      while (idx + 1 < arrival.length && arrival[idx + 1] <= renderTime) idx += 1;
      naive.push(idx * STEP_M);
    }

    expect(interp.length).toBeGreaterThan(10);

    const deltas = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]);
    const interpDeltas = deltas(interp);
    const naiveDeltas = deltas(naive);

    // 1. Strictly forward — never rewinds (no backward rubberband).
    for (const d of interpDeltas) {
      expect(d).toBeGreaterThan(0);
    }

    // 2. No frozen frames — every frame advances. The naive baseline, by contrast,
    //    stalls between arrivals (some zero deltas).
    expect(Math.min(...interpDeltas)).toBeGreaterThan(0);
    expect(Math.min(...naiveDeltas)).toBe(0);

    // 3. No teleport — the naive renderer double-jumps a full ~2 ticks in a single
    //    frame under compressed jitter; the interpolated step stays strictly smaller
    //    and within ~1.3 ticks (observed peak ≈ 1.12·STEP_M). Asserting the naive
    //    baseline really does double-jump keeps the maxInterp<maxNaive comparison a
    //    meaningful discriminator rather than a coincidence of the jitter array.
    const maxInterp = Math.max(...interpDeltas);
    const maxNaive = Math.max(...naiveDeltas);
    expect(maxNaive).toBeGreaterThan(1.5 * STEP_M);
    expect(maxInterp).toBeLessThan(maxNaive);
    expect(maxInterp).toBeLessThan(1.3 * STEP_M);

    // 4. Smoother than naive — max/mean step ratio (peak-to-average roughness) is
    //    strictly lower than the naive renderer's, i.e. jitter is absorbed rather
    //    than passed straight through as visible stutter.
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const interpRoughness = maxInterp / mean(interpDeltas);
    const naiveRoughness = maxNaive / mean(naiveDeltas);
    expect(interpRoughness).toBeLessThan(naiveRoughness);
    expect(interpRoughness).toBeLessThan(3.0);
  });
});
