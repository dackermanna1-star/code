// Minimal stand-in textures used only if the procedural texture library is unavailable.

const COLORS = {
  wall_stone: [200, 180, 140], wall_stone_big: [195, 175, 135], wall_tunnel: [170, 155, 125],
  trim_band: [210, 190, 150], trim_cap: [205, 185, 145], ground_sand: [196, 160, 104],
  ground_stone: [190, 160, 115], ground_dirt: [160, 130, 90], rock: [150, 110, 80],
  crate: [156, 122, 72], crate_b: [140, 115, 80], crate_green: [110, 130, 100], door: [120, 105, 90],
  shutter: [90, 70, 50], wood_beam: [100, 80, 60], wood_planks: [130, 105, 75], metal: [110, 115, 110],
  wall_plaster: [200, 180, 150],
};

export function devTexture(name) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const col = COLORS[name] || [180, 0, 180];
  const img = g.createImageData(64, 64);
  let seed = 0;
  for (const ch of name) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  for (let i = 0; i < 64 * 64; i++) {
    seed = (seed * 1103515245 + 12345) | 0;
    const n = ((seed >>> 16) & 255) / 255 - 0.5;
    const x = i % 64, y = (i / 64) | 0;
    const grid = (x % 32 === 0 || y % 16 === 0) ? -30 : 0;
    img.data[i * 4] = col[0] + n * 30 + grid;
    img.data[i * 4 + 1] = col[1] + n * 30 + grid;
    img.data[i * 4 + 2] = col[2] + n * 30 + grid;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function devAverage(name) {
  const c = COLORS[name] || [150, 130, 100];
  return c;
}
