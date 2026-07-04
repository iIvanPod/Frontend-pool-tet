/**
 * Render-side table layout derived from the contract constants in
 * `config.ts` (PROTOCOL.md §2). World units are meters with the origin at
 * the top-left of the playfield and y growing downward; the screen adds a
 * rail margin around the playfield.
 */

import { BALL_RADIUS, POCKET_RADIUS, TABLE_HEIGHT, TABLE_WIDTH, worldToPixels } from '../config';

/** Wooden rail thickness around the playfield, in pixels. */
export const RAIL_PX = 44;

/** Playfield size in pixels. */
export const PLAYFIELD_WIDTH_PX = worldToPixels(TABLE_WIDTH);
export const PLAYFIELD_HEIGHT_PX = worldToPixels(TABLE_HEIGHT);

/** Full canvas size (playfield + rails). */
export const CANVAS_WIDTH = Math.round(PLAYFIELD_WIDTH_PX + RAIL_PX * 2);
export const CANVAS_HEIGHT = Math.round(PLAYFIELD_HEIGHT_PX + RAIL_PX * 2);

export const BALL_RADIUS_PX = worldToPixels(BALL_RADIUS);
export const POCKET_RADIUS_PX = worldToPixels(POCKET_RADIUS);

/** Cue-ball start / scratch respot (PROTOCOL.md §2), world meters. */
export const HEAD_SPOT = { x: TABLE_WIDTH / 4, y: TABLE_HEIGHT / 2 } as const;

/** Rack apex spot (PROTOCOL.md §2), world meters. */
export const FOOT_SPOT = { x: (TABLE_WIDTH * 3) / 4, y: TABLE_HEIGHT / 2 } as const;

/** Converts a world x coordinate (meters) to canvas pixels. */
export const toScreenX = (meters: number): number => RAIL_PX + worldToPixels(meters);

/** Converts a world y coordinate (meters) to canvas pixels. */
export const toScreenY = (meters: number): number => RAIL_PX + worldToPixels(meters);
