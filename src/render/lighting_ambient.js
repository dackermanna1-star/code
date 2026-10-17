// Readability aids for the darkness (v2.2, DESIGN §13 "Do not sacrifice readability"): the scene must
// stay deep and scary, but the player has to read room shapes, doorways and landmarks.
//
//   ambientBase(level)  the lightmap ground level for a darkness 0..1 (map.dark / setAmbient): the old
//                       linear (1 - dark) · 1.75 plus a gentle lift through the interior range
//                       (≈ 0.88 – 0.97) so near-black rooms keep faint silhouettes. The lift fades out
//                       toward 0.8 (exteriors are already readable) and above 0.97, so deliberate
//                       blackouts (setAmbient(null, 0.98+)) still drop to near black.
//   CatchLayer          wall-face catch light: every south-facing vertical surface (wall faces, closed
//                       doors in wall rows, the fronts of free-standing stacks) catches a little more of
//                       the ambient than the floor, so the room's outline reads as a dim band over the
//                       dark floor while wall tops stay black. Built once per geometry change at
//                       lightmap scale; each frame its visible part is added, scaled with the ambient.
import { canvas } from './lighting_tex.js';
import { FACE } from './lighting_shadow.js';

const TILE = 16;
const LIFT = 0.08;           // max ambient lift (lightmap ground units, 1 = full white)
const CATCH_RGB = [150, 160, 190];   // cool, like the ambient tint, baked at full strength
const EXT = 13;              // matches lighting_shadow.js: a free-standing prop's lit face rises 13 px

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The interior lift for a darkness level (lightmap ground units, before the tint). */
export function ambientLift(level) {
  const L = Math.max(0, Math.min(1, level));
  return LIFT * smooth(0.8, 0.9, L) * (1 - smooth(0.968, 0.99, L));
}

/** Ground level (0..~0.4) of the lightmap for a darkness level (before the ambient tint). */
export function ambientBase(level) {
  const L = Math.max(0, Math.min(1, level));
  return (1 - L) * 1.75 + ambientLift(L);
}

/**
 * Lightmap ambient RGB (0..255) for a tint and darkness. The linear part takes the map's tint at
 * full strength (deep blue halls, the breaker's red); the lift is only softly tinted, so warm art
 * (wood floors, red seats, brick) keeps its silhouette instead of being crushed by a blue multiply.
 */
export function ambientRGB(rgb, level) {
  const L = Math.max(0, Math.min(1, level));
  const m = Math.max(1, rgb[0], rgb[1], rgb[2]);
  const lin = (1 - L) * 1.75;
  const lift = ambientLift(L);
  return rgb.map((v) => 255 * (lin * (0.42 + 0.58 * (v / m)) + lift * (0.74 + 0.26 * (v / m))));
}

export class CatchLayer {
  constructor() {
    this.layer = null;
  }

  /** Bake the faces of a map (grid = classifyCells(map), K = lightmap scale). */
  build(map, grid, K) {
    if (!map || !grid) { this.layer = null; return; }
    const mw = Math.ceil(map.w * TILE * K);
    const mh = Math.ceil(map.h * TILE * K);
    if (!this.layer || this.layer.width !== mw || this.layer.height !== mh) this.layer = canvas(mw, mh);
    const c = this.layer.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000';
    c.fillRect(0, 0, mw, mh);
    c.setTransform(K, 0, 0, K, 0, 0);
    const { w, h, cls, free } = grid;
    const [r, g, b] = CATCH_RGB;
    const col = (v) => `rgb(${Math.round(r * v)},${Math.round(g * v)},${Math.round(b * v)})`;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cls[i] !== FACE) continue;
        // A face run: dimmer at its top, catching most where it meets the floor.
        const below = y + 1 < h ? cls[i + w] : 0;
        const above = y > 0 ? cls[i - w] : 0;
        const bottom = below !== FACE;
        const top = above !== FACE;
        const v0 = top ? 0.5 : 0.75;
        const v1 = bottom ? 1 : 0.75;
        const gr = c.createLinearGradient(0, y * TILE, 0, (y + 1) * TILE);
        gr.addColorStop(0, col(v0));
        gr.addColorStop(1, col(v1));
        c.fillStyle = gr;
        c.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (free[i] && top) {
          // a free-standing stack/curtain: its art (and lit face) rises above the footprint
          const g2 = c.createLinearGradient(0, y * TILE - EXT, 0, y * TILE);
          g2.addColorStop(0, col(0.25));
          g2.addColorStop(1, col(v0));
          c.fillStyle = g2;
          c.fillRect(x * TILE, y * TILE - EXT, TILE, EXT);
        }
      }
    }
  }

  /** Add the visible part, alpha = strength (0..1), into the lightmap (composite 'lighter' set by caller). */
  draw(lc, lmx, lmy, K, strength) {
    if (!this.layer || strength <= 0.002) return;
    lc.globalAlpha = Math.min(1, strength);
    lc.drawImage(this.layer, -lmx * K, -lmy * K);
    lc.globalAlpha = 1;
  }
}
