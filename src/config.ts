/**
 * Render-side mirror of the backend physics constants (PROTOCOL.md §2).
 * Units: meters. The client NEVER simulates physics — these values exist only
 * to draw the table and convert world coordinates to pixels.
 */

export const TABLE_WIDTH = 2.24;
export const TABLE_HEIGHT = 1.12;
export const BALL_RADIUS = 0.0286;
export const POCKET_RADIUS = 0.07;

export const POCKETS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: TABLE_WIDTH / 2, y: 0 },
  { x: TABLE_WIDTH, y: 0 },
  { x: 0, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT },
  { x: TABLE_WIDTH, y: TABLE_HEIGHT },
];

/** Pixels per meter for rendering. Playfield: 1075 x 538 px. */
export const SCALE = 480;

/** How far behind server time the renderer sits while interpolating snapshots. */
export const INTERPOLATION_DELAY_MS = 120;

/** Server broadcasts STATE_SYNC at this rate while simulating. */
export const SERVER_TICK_RATE = 30;

export const API_BASE = '/api';
export const WS_PATH = '/ws';

/** Reconnect delay for the STOMP client, per PROTOCOL.md §7. */
export const STOMP_RECONNECT_DELAY_MS = 2000;

export const worldToPixels = (meters: number): number => meters * SCALE;
