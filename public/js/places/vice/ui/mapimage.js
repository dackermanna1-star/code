// The map of Vice City drawn once from the plan into an offscreen canvas:
// sea, land, beaches, parks, blocks and the roads by class. The minimap and
// the pause-menu map both draw from it.
//
//   const M = mapImage(plan, ground)  -> { canvas, scale (px per stud), toPx(x, z) -> [px, py] }
import { HALF } from '../world/layout.js';

let cache = null;

export const MAP_COLORS = {
  sea: '#0e2f45', seaShallow: '#16506a', land: '#2b2f3a', beach: '#7a6c52', park: '#2d4a37', block: '#363b48',
  street: '#8a92a6', ave: '#a9b1c4', blvd: '#c3cad9', hwy: '#e8d27a', drive: '#b2bacb',
};

export function mapImage(plan, ground) {
  if (cache && cache.plan === plan) return cache;
  const scale = 0.25, W = Math.round(HALF * 2 * scale);
  const c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d');
  const P = (x, z) => [(x + HALF) * scale, (z + HALF) * scale];
  // the sea and its shallows, from the height map
  const img = g.createImageData(W, W), N = ground.N, step = (HALF * 2) / W;
  const C = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const sea = C(MAP_COLORS.sea), shallow = C(MAP_COLORS.seaShallow), land = C(MAP_COLORS.land), beach = C(MAP_COLORS.beach), park = C(MAP_COLORS.park);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const x = -HALF + i * step, z = -HALF + j * step;
    const h = ground.heightAt(x, z), k = ground.kindAt(x, z);
    let col;
    if (h < -0.05) { const t = Math.min(1, -h / 14); col = [shallow[0] * (1 - t) + sea[0] * t, shallow[1] * (1 - t) + sea[1] * t, shallow[2] * (1 - t) + sea[2] * t]; }
    else if (k === 1 || k === 2) col = beach;
    else if (k === 5) col = park;
    else col = land;
    const o = (j * W + i) * 4;
    img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // blocks
  g.fillStyle = MAP_COLORS.block;
  for (const b of plan.blocks) { const [x0, z0] = P(b.x0, b.z0), [x1, z1] = P(b.x1, b.z1); g.fillRect(x0 + 0.5, z0 + 0.5, x1 - x0 - 1, z1 - z0 - 1); }
  // roads: small first, the expressway on top
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const cls of ['street', 'drive', 'ave', 'blvd', 'hwy']) {
    g.strokeStyle = MAP_COLORS[cls];
    for (const e of plan.edges) {
      if (e.cls !== cls) continue;
      g.lineWidth = Math.max(1.5, e.width * scale * (cls === 'hwy' ? 1.1 : 0.9));
      g.beginPath();
      e.pts.forEach((p, i) => { const [x, y] = P(p.x, p.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    }
  }
  cache = { plan, canvas: c, scale, size: W, toPx: P };
  return cache;
}
