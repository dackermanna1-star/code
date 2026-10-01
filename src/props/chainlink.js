// Chain-link mesh texture for alpha-tested panels (a voxel diamond lattice would cost >100k
// triangles per fence). makeChainLinkTexture() returns an RGBA canvas tile: woven diamond
// wires (alpha = wire coverage) with galvanized shading; meters per tile in .metersPerTile.
// Usage (world side): THREE.CanvasTexture(canvas), wrapS/T = Repeat, repeat = (panelW, panelH) /
// metersPerTile, material alphaTest ~0.5, side DoubleSide.

export function makeChainLinkTexture({ px = 256, diamond = 0.05, wire = 0.0042, color = [150, 154, 152], rustAmt = 0.2, seed = 1 } = {}) {
  // one tile = 4 x 4 diamonds
  const tileM = diamond * 4;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px });
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(px, px);
  const d = img.data;
  const ppm = px / tileM;
  const hw = (wire * ppm) / 2;
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const rustCells = new Set();
  for (let i = 0; i < 16; i++) if (rnd() < rustAmt) rustCells.add(i);
  const period = diamond * ppm; // pixels per diamond along x and y
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      // two families of zig-zag wires at +-45 deg (diamond lattice), slightly wavy (woven)
      const u = (x + y) / period, v = (x - y) / period;
      const du = Math.abs(u - Math.round(u)) * period / Math.SQRT2;
      const dv = Math.abs(v - Math.round(v)) * period / Math.SQRT2;
      const dist = Math.min(du, dv);
      const a = Math.max(0, Math.min(1, hw + 0.6 - dist));
      const i = (x + y * px) * 4;
      if (a <= 0) {
        d[i + 3] = 0;
        continue;
      }
      // shading across the wire (round profile) + over/under weave darkening near crossings
      const t = dist / Math.max(0.5, hw);
      const shade = 0.75 + 0.35 * (1 - t * t);
      const cross = Math.min(du, dv) < hw * 1.2 && Math.max(du, dv) < hw * 2.5 ? 0.8 : 1;
      const cell = (Math.floor(x / (px / 4)) + 4 * Math.floor(y / (px / 4))) % 16;
      const rc = rustCells.has(cell) && rnd() < 0.6 ? [110, 66, 40] : color;
      d[i] = Math.min(255, rc[0] * shade * cross);
      d[i + 1] = Math.min(255, rc[1] * shade * cross);
      d[i + 2] = Math.min(255, rc[2] * shade * cross);
      d[i + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  c.metersPerTile = tileM;
  return c;
}
