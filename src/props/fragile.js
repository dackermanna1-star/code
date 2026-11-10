// Glass and ceramic props.
import * as F from '../core/fracture.js';
import { PropBuilder } from './builder.js';
import { addRevolved } from './parts.js';

/** 1. Window pane: a large sheet of annealed glass in a painted timber frame. */
export function buildWindow() {
  const b = new PropBuilder('window', 'Window Pane');
  const W = 1.25, H = 1.45, bar = 0.07, depth = 0.09, y0 = 0.06;
  const wood = 'whitewood';
  // feet so the frame stands on its own
  b.box('foot', [0.09, 0.06, 0.56], [-(W / 2 - bar / 2), 0.03, 0], wood, { grain: 2 });
  b.box('foot', [0.09, 0.06, 0.56], [W / 2 - bar / 2, 0.03, 0], wood, { grain: 2 });
  // frame
  b.box('sill', [W, bar, depth], [0, y0 + bar / 2, 0], wood, { grain: 0 });
  b.box('head', [W, bar, depth], [0, y0 + H - bar / 2, 0], wood, { grain: 0 });
  const sh = H - 2 * bar;
  b.box('stile', [bar, sh, depth], [-(W / 2 - bar / 2), y0 + H / 2, 0], wood, { grain: 1 });
  b.box('stile', [bar, sh, depth], [W / 2 - bar / 2, y0 + H / 2, 0], wood, { grain: 1 });
  // glazing beads (thin strips that visually seat the glass)
  for (const z of [-0.012, 0.012]) {
    b.box('bead', [W - 2 * bar, 0.012, 0.01], [0, y0 + bar + 0.006, z], wood, { grain: 0, bond: 0.5 });
    b.box('bead', [W - 2 * bar, 0.012, 0.01], [0, y0 + H - bar - 0.006, z], wood, { grain: 0, bond: 0.5 });
  }
  // the pane sits 10 mm into the rebate on every side
  b.box('pane', [W - 2 * bar + 0.02, sh + 0.02, 0.006], [0, y0 + H / 2, 0], 'glass', { tags: ['glass'] });
  return b.build();
}

/** 8. Ceramic vase: tall glazed floor vase made of ~100 bonded shell tiles. */
export function buildVase() {
  const b = new PropBuilder('vase', 'Ceramic Vase');
  addRevolved(b, 'wall', {
    profile: [[0, 0.084], [0.04, 0.102], [0.13, 0.14], [0.24, 0.156], [0.35, 0.132], [0.45, 0.084], [0.52, 0.058], [0.575, 0.06], [0.62, 0.08]],
    th: 0.007, baseTh: 0.01, sectors: 12, rings: 8, surf: 'ceramic_vase', rng: F.makeRng((Math.random() * 1e9) | 0), jitter: 0.34,
  });
  return b.build();
}

/** Small decorative vase (bookshelf). */
export function addSmallVase(b, name, pos, surf = 'ceramic_blue', scale = 1) {
  const k = scale;
  return addRevolved(b, name, {
    profile: [[0, 0.03 * k], [0.03 * k, 0.042 * k], [0.08 * k, 0.052 * k], [0.13 * k, 0.036 * k], [0.165 * k, 0.022 * k], [0.19 * k, 0.03 * k]],
    th: 0.004, baseTh: 0.005, sectors: 7, rings: 4, surf, pos, sub: 3, rng: F.makeRng((Math.random() * 1e9) | 0),
  });
}

/** Mug with a handle. */
export function addMug(b, name, pos, surf = 'ceramic_white', yaw = 0) {
  b.at(pos, yaw, () => {
    addRevolved(b, name, {
      profile: [[0, 0.036], [0.01, 0.04], [0.05, 0.041], [0.095, 0.042]],
      th: 0.004, baseTh: 0.005, sectors: 7, rings: 2, surf, sub: 3, rng: F.makeRng((Math.random() * 1e9) | 0), jitter: 0.2,
    });
    b.box(name + '_handle', [0.03, 0.05, 0.011], [0.054, 0.05, 0], surf, { fracturable: false, bond: 0.6 });
  });
}

/** Terracotta pot with soil and a leafy plant. */
export function addPlant(b, name, pos) {
  b.at(pos, 0, () => {
    addRevolved(b, name, {
      profile: [[0, 0.04], [0.05, 0.052], [0.1, 0.062], [0.115, 0.068]],
      th: 0.006, baseTh: 0.007, sectors: 7, rings: 2, surf: 'terracotta', sub: 3, rng: F.makeRng((Math.random() * 1e9) | 0), jitter: 0.2,
    });
    b.cyl(name + '_soil', 0.05, 0.085, [0, 0.05, 0], 'soil', { segs: 10, hull: true, fracturable: false, mass: 0.5, bond: 0.3 });
    b.cyl(name + '_stem', 0.006, 0.09, [0, 0.135, 0], 'leaf', { segs: 6, hull: true, fracturable: false, mass: 0.01 });
    b.ball(name + '_leaves', 0.06, [0, 0.215, 0], 'leaf', { mass: 0.06, segs: 9, rings: 6 });
    b.ball(name + '_leaves', 0.045, [0.04, 0.185, 0.02], 'leaf', { mass: 0.03, segs: 8, rings: 5 });
    b.ball(name + '_leaves', 0.04, [-0.035, 0.19, -0.03], 'leaf', { mass: 0.03, segs: 8, rings: 5 });
  });
}
