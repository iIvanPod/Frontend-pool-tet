/**
 * Generates offscreen-canvas textures for the 16 balls: solid colors for
 * 1-7, white-with-color-band for 9-15, black 8, plain white cue. Numbers
 * are drawn in a small white disc, billiard-style.
 */

/** Standard-ish pool palette indexed by ball id (stripes reuse 1-7 colors). */
const BALL_COLORS: Readonly<Record<number, string>> = {
  0: '#f6f1e4',
  1: '#f2b705',
  2: '#1663c7',
  3: '#e03131',
  4: '#7048a8',
  5: '#f76707',
  6: '#2f9e44',
  7: '#a4262c',
  8: '#191919',
  9: '#f2b705',
  10: '#1663c7',
  11: '#e03131',
  12: '#7048a8',
  13: '#f76707',
  14: '#2f9e44',
  15: '#a4262c',
};

/** Texture pixel radius; balls are downscaled at display time for crispness. */
export const BALL_TEXTURE_RADIUS = 32;

/** Phaser texture key for a ball id. */
export const ballTextureKey = (id: number): string => `ball-${id}`;

/**
 * Draws ball `id` (0-15) onto a fresh canvas of size
 * `2 * BALL_TEXTURE_RADIUS` and returns it.
 */
export function createBallCanvas(id: number): HTMLCanvasElement {
  const r = BALL_TEXTURE_RADIUS;
  const size = r * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('2D canvas context unavailable');
  }

  const color = BALL_COLORS[id] ?? '#cccccc';
  const isStripe = id >= 9;
  const isCue = id === 0;

  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 0.5, 0, Math.PI * 2);
  ctx.clip();

  // Base coat.
  ctx.fillStyle = isStripe ? '#f6f1e4' : color;
  ctx.fillRect(0, 0, size, size);

  // Stripe band across the middle.
  if (isStripe) {
    ctx.fillStyle = color;
    ctx.fillRect(0, r * 0.42, size, r * 1.16);
  }

  // Number disc + digits (not on the cue ball).
  if (!isCue) {
    ctx.beginPath();
    ctx.arc(r, r, r * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = '#f8f5ec';
    ctx.fill();
    ctx.fillStyle = '#1c1c1c';
    ctx.font = `bold ${Math.round(r * 0.52)}px "Arial", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(id), r, r + r * 0.02);
  }

  // Glossy highlight + edge shading.
  const gloss = ctx.createRadialGradient(r * 0.68, r * 0.6, r * 0.05, r, r, r);
  gloss.addColorStop(0, 'rgba(255,255,255,0.55)');
  gloss.addColorStop(0.25, 'rgba(255,255,255,0.12)');
  gloss.addColorStop(0.75, 'rgba(0,0,0,0.05)');
  gloss.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, size, size);

  ctx.restore();

  // Subtle outline so light balls read against the cloth.
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  return canvas;
}
