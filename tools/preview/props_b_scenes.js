// Props B mock scenes: small tile maps (real tiles.js art, engine-like autotiling) dressed with
// props B in render order (floor → decals → wall faces → wall props → y-sorted props + actors →
// wall tops → over props), plus an optional mock darkness pass (dithered light pools multiplied
// over the frame, like the game's lighting) to check value structure under the dark.
import { TILES, LEGEND } from '../../src/data/tiles.js';
import { PROPS, propDef } from '../../src/data/props.js';
import { renderPropB } from '../../src/art/props_b.js';
import { drawTile } from '../../src/art/tiles.js';
import { BAYER4 } from '../../src/art/util.js';
import { hexToRgb } from '../../src/art/palette.js';

let spriteMod = null;
async function tessFrame(dir = 'down', id = 'tess') {
  try {
    spriteMod = spriteMod || await import('../../src/art/sprites.js');
    const s = spriteMod.getSprite(id);
    const a = s.anims[`idle_${dir}`] || s.anims.idle_down;
    return { img: a.frames[0], ax: s.ax, ay: s.ay };
  } catch { return null; }
}

function buildMap(rows, legend = {}) {
  const L = { ...LEGEND, ...legend };
  const h = rows.length, w = rows[0].length;
  rows.forEach((r, y) => { if (r.length !== w) throw new Error(`row ${y} length ${r.length} != ${w}`); });
  const keys = rows.map((r) => [...r].map((ch) => { const k = L[ch]; if (!k) throw new Error(`char '${ch}'`); return k; }));
  const inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const tileAt = (x, y) => (inB(x, y) ? keys[y][x] : 'void');
  const kind = (x, y) => TILES[tileAt(x, y)].kind;
  const isWall = (x, y) => inB(x, y) && (kind(x, y) === 'wall' || kind(x, y) === 'window');
  const isOpen = (x, y) => inB(x, y) && !isWall(x, y) && tileAt(x, y) !== 'void';
  const wallKind = (x, y) => (!isWall(x, y) ? null : isOpen(x, y + 1) ? 'face_low' : isWall(x, y + 1) && isOpen(x, y + 2) ? 'face_high' : 'top');
  const wallMask = (x, y) => (isWall(x, y - 1) ? 1 : 0) | (isWall(x + 1, y) ? 2 : 0) | (isWall(x, y + 1) ? 4 : 0) | (isWall(x - 1, y) ? 8 : 0);
  const sameMask = (x, y) => { const k = tileAt(x, y); return (tileAt(x, y - 1) === k ? 1 : 0) | (tileAt(x + 1, y) === k ? 2 : 0) | (tileAt(x, y + 1) === k ? 4 : 0) | (tileAt(x - 1, y) === k ? 8 : 0); };
  const variantAt = (x, y) => { let hh = Math.imul(x + 7, 374761393) ^ Math.imul(y + 13, 668265263); hh = Math.imul(hh ^ (hh >>> 13), 1274126177); return ((hh ^ (hh >>> 16)) >>> 0) & 0xffff; };
  return { w, h, tileAt, wallKind, wallMask, sameMask, variantAt };
}

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }

export async function renderScene(id, { clean = false, dark = false, t = 0 } = {}) {
  const S = SCENES[id];
  const m = buildMap(S.rows, S.legend);
  const W = m.w * 16, H = m.h * 16;
  const [floor, f] = cv(W, H), [faces, a] = cv(W, H), [tops, tp] = cv(W, H);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const key = m.tileAt(x, y), def = TILES[key];
    const o = { kind: undefined, mask: 0, variant: m.variantAt(x, y), clean, t: 0 };
    let c = f;
    if (def.kind === 'wall' || def.kind === 'window') { o.kind = m.wallKind(x, y); o.mask = m.wallMask(x, y); c = o.kind === 'top' ? tp : a; }
    else if (key === 'railing' || key === 'stage_front') { o.mask = m.sameMask(x, y); c = a; }
    else if (key === 'pit') o.mask = m.sameMask(x, y);
    try { drawTile(c, key, x * 16, y * 16, o); } catch { c.fillStyle = '#222'; c.fillRect(x * 16, y * 16, 16, 16); }
  }
  const [out, x] = cv(W, H);
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  x.drawImage(floor, 0, 0);
  // props → buckets
  const objs = S.objects.map((o, i) => {
    const def = propDef(o.type);
    const r = renderPropB(o.type, { ...o, clean, frame: o.frame ?? 0, params: o.params || {} });
    return { ...o, def, r, i, sort: (o.y + def.h) * 16 + (o.sortBias || 0) + (def.solid ? 0 : 0.5) };
  });
  const put = (o) => { if (o.r && o.r.canvas) x.drawImage(o.r.canvas, o.x * 16 + o.r.ox, o.y * 16 + o.r.oy); };
  objs.filter((o) => o.def.mount === 'decal').forEach(put);
  x.drawImage(faces, 0, 0);
  objs.filter((o) => o.def.mount === 'wall').forEach(put);
  const ys = objs.filter((o) => o.def.mount === 'floor').map((o) => ({ sort: o.sort, draw: () => put(o) }));
  for (const [ax, ay, dir, sid] of S.actors || []) {
    const fr = await tessFrame(dir, sid);
    const fx = ax * 16 + 8, fy = ay * 16 + 12;
    ys.push({ sort: fy, draw: () => {
      x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(fx - 5, fy - 1, 10, 2);
      if (fr) x.drawImage(fr.img, fx - fr.ax, fy - fr.ay);
      else { x.fillStyle = '#b2441b'; x.fillRect(fx - 4, fy - 28, 8, 8); x.fillStyle = '#56769e'; x.fillRect(fx - 6, fy - 20, 12, 12); x.fillStyle = '#111'; x.fillRect(fx - 5, fy - 8, 10, 8); }
    } });
  }
  ys.sort((p, q) => p.sort - q.sort).forEach((e) => e.draw());
  x.drawImage(tops, 0, 0);
  objs.filter((o) => o.def.mount === 'over').forEach(put);
  if (dark) darkness(x, W, H, S.dark || { ambient: [0.16, 0.17, 0.24], lights: [] });
  return out;
}

/** Mock darkness: ambient + dithered radial pools (4 crisp steps), multiplied over the frame. */
function darkness(x, W, H, { ambient, lights }) {
  const img = x.getImageData(0, 0, W, H), d = img.data;
  const L = lights.map((l) => ({ ...l, rgb: hexToRgb(l.color || '#fff1d6').map((v) => v / 255) }));
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    let r = ambient[0], g = ambient[1], b = ambient[2];
    for (const l of L) {
      const dx = px - l.x, dy = (py - l.y) * (l.sy || 1), dd = Math.sqrt(dx * dx + dy * dy);
      if (dd >= l.r) continue;
      let k = Math.pow(1 - dd / l.r, 1.4) * (l.i || 1);
      const q = Math.floor(k * 5), fr = k * 5 - q; k = (q + (BAYER4[py & 3][px & 3] / 16 < fr ? 1 : 0)) / 5;
      r += k * l.rgb[0]; g += k * l.rgb[1]; b += k * l.rgb[2];
    }
    const i = (py * W + px) * 4;
    d[i] = Math.min(255, d[i] * Math.min(1.2, r)); d[i + 1] = Math.min(255, d[i + 1] * Math.min(1.2, g)); d[i + 2] = Math.min(255, d[i + 2] * Math.min(1.2, b));
  }
  x.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------------------------------ scenes
const seats = (rows, x0, x1, occ) => {
  const out = [];
  for (const y of rows) for (let x = x0; x <= x1; x++) {
    const h = ((x * 7 + y * 13) % 10);
    const o = occ && h < 7 ? ['husk_a', 'husk_b', 'husk_c', 'husk_d', 'husk_e', 'husk_f', 'husk_c:turned'][(x * 3 + y * 5) % 7] : null;
    out.push({ type: 'aud_seat', x, y, state: o ? 'occupied' : 'empty', occupant: o || undefined, variant: (x * 5 + y) % 4 });
  }
  return out;
};
const line = (type, xs, y, extra = {}) => xs.map((x) => ({ type, x, y, ...extra }));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const SCENES = {
  kitchen: {
    title: 'Cafeteria + kitchen (vending, serving line, trays, milk; stove, sink, pantry, mixer, walk-in, dumbwaiter)',
    rows: [
      '##############################',
      '##############################',
      '##############################',
      '#.................#__________#',
      '#.................#__________#',
      '#.................#__________#',
      '#.................#__________#',
      '#.................#__________#',
      '#............................#',
      '#............................#',
      '#.................#__________#',
      '#.................#__________#',
      '#.................#__________#',
      '#.................#__________#',
      '#.................#__________#',
      '#.................#__________#',
      '##############################',
    ],
    objects: [
      { type: 'vending_machine', x: 1, y: 3 },
      { type: 'tray_rack', x: 10, y: 3 },
      ...range(11, 14).slice(0, 1).map((x) => ({ type: 'serving_line', x, y: 3 })),
      { type: 'milk_cooler', x: 15, y: 3 },
      { type: 'caf_table', x: 2, y: 6, variant: 0 }, { type: 'caf_table', x: 8, y: 6, variant: 1 }, { type: 'caf_table', x: 13, y: 6, variant: 2 },
      { type: 'caf_table', x: 2, y: 11, variant: 2 }, { type: 'caf_table', x: 8, y: 11, variant: 0 }, { type: 'caf_table', x: 13, y: 12, variant: 1 },
      { type: 'decal_tiles', x: 6, y: 9 }, { type: 'decal_papers', x: 11, y: 10, variant: 1 }, { type: 'decal_stain', x: 3, y: 9 }, { type: 'decal_glass', x: 16, y: 10 },
      { type: 'graffiti', x: 3, y: 2, state: 'names' },
      { type: 'stove', x: 19, y: 3 }, { type: 'sink_big', x: 21, y: 3 }, { type: 'freezer_door', x: 24, y: 1, state: 'open' },
      { type: 'shelf_pantry', x: 25, y: 3, variant: 1 }, { type: 'mixer', x: 27, y: 3 }, { type: 'dumbwaiter', x: 28, y: 2, state: 'open' },
      { type: 'cicada_shells', x: 24, y: 3, variant: 3 }, { type: 'cicada_shells', x: 23, y: 4, variant: 1 },
      { type: 'shelf_pantry', x: 19, y: 13, variant: 2 }, { type: 'decal_leaves', x: 22, y: 12, variant: 2 },
      { type: 'pickup', x: 26, y: 10, variant: 0, item: 'battery', frame: 1 }, { type: 'cobweb', x: 28, y: 3, dir: 'right' },
    ],
    actors: [[10, 9, 'down']],
    dark: { ambient: [0.2, 0.21, 0.28], lights: [{ x: 168, y: 150, r: 130, color: '#fff1d6', i: 1.2 }, { x: 392, y: 60, r: 70, color: '#7f9cc4', i: 0.5 }] },
  },
  gym: {
    title: 'Gym (bleachers out / folded / fallen, scoreboard ON, hoop stands W/E, court, mats, ball cart)',
    rows: [
      'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
      'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
      'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
      ...Array.from({ length: 13 }, () => 'G============================G'),
      'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
    ],
    objects: [
      { type: 'bleachers', x: 2, y: 3, state: 'out' }, { type: 'bleachers', x: 9, y: 3, state: 'folded' }, { type: 'bleachers', x: 21, y: 3, state: 'fallen' },
      { type: 'scoreboard', x: 15, y: 2, state: 'on' },
      { type: 'hoop', x: 27, y: 2 },
      ...line('court_line_h', range(1, 28), 7), ...line('court_line_h', range(1, 28), 15, { variant: 2 }),
      ...line('court_line_v', range(8, 14).concat([15]), 15).slice(0, 0),
      ...line('court_line_v', [8, 9, 10, 15, 16], 15, {}).slice(0, 0),
      ...[8, 9, 10, 11, 12, 13, 14].map((y) => ({ type: 'court_line_v', x: 15, y, variant: y })),
      { type: 'court_circle', x: 13, y: 9 },
      { type: 'hoop_stand', x: 1, y: 10, dir: 'right' }, { type: 'hoop_stand', x: 27, y: 10, dir: 'left' },
      { type: 'mat_stack', x: 24, y: 12 }, { type: 'mat_stack', x: 24, y: 13, variant: 1 }, { type: 'ball_cart', x: 4, y: 13 },
      { type: 'pickup', x: 17, y: 12, item: 'denise_photo', frame: 1 },
    ],
    actors: [[11, 12, 'right'], [5, 4, 'down', 'denise']],
    dark: { ambient: [0.16, 0.17, 0.24], lights: [{ x: 190, y: 200, r: 130, color: '#fff1d6', i: 1.1 }, { x: 264, y: 40, r: 40, color: '#ffb04a', i: 0.6 }] },
  },
  basement: {
    title: 'Basement: lit boiler, pipes, water heater, panel, coal bin (OCCUPIED, breathing), desk pile, janitor office',
    rows: [
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      'C::::::::::::::::::C:::::::::C',
      'C::::::::::::::::::C:::::::::C',
      'C::::::::::::::::::C:::::::::C',
      'C::::::::::::::::::::::::::::C',
      'C::::::::::::::::::C:::::::::C',
      'CCCCCCCCC::::::::::CCCCCCCCCCC',
      'CCCCCCCCC::::::::::::::::::::C',
      'CCCCCCCCC::::::::::::::::::::C',
      'C%%%%%%%%::::::::::::::::::::C',
      'C%%%%%%%%:::::::~~~::::::::::C',
      'C%%%%%%%%::::::~~~~~:::::::::C',
      'C%%%%%%%%::::::::::::::::::::C',
      'C%%%%%%%%::::::::::::::::::::C',
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    ],
    objects: [
      { type: 'boiler', x: 2, y: 3, frame: 1 },
      { type: 'water_heater', x: 8, y: 3 }, { type: 'breaker_panel', x: 11, y: 2 }, { type: 'cage_bulb', x: 14, y: 2, state: 'on' },
      { type: 'valve_wheel', x: 16, y: 2 }, { type: 'shelf_metal', x: 17, y: 3 },
      ...line('pipe_h', range(6, 18), 3, { variant: 0 }).map((o, i) => ({ ...o, variant: [0, 0, 1, 0, 0, 3, 3, 3, 0, 2, 0, 1, 0][i] })),
      ...line('pipe_v', [], 0),
      ...range(4, 12).map((y, i) => ({ type: 'pipe_v', x: 12, y, variant: i === 4 ? 1 : 0 })),
      { type: 'coal_heap', x: 2, y: 11, state: 'occupied', frame: 4 },
      { type: 'desk_pile', x: 13, y: 9 }, { type: 'mop_bucket', x: 10, y: 9 },
      { type: 'janitor_desk', x: 21, y: 4 }, { type: 'pegboard', x: 24, y: 2, state: 'keys' }, { type: 'calendar', x: 27, y: 2 },
      { type: 'cage_bulb', x: 20, y: 2, state: 'off' }, { type: 'note_paper', x: 22, y: 4, variant: 2 },
      { type: 'cobweb', x: 1, y: 3, dir: 'left' }, { type: 'cobweb', x: 18, y: 3, dir: 'right' }, { type: 'cobweb', x: 28, y: 9, dir: 'right' },
      { type: 'decal_stain', x: 22, y: 12 }, { type: 'decal_papers', x: 25, y: 13 },
    ],
    actors: [[11, 14, 'left']],
    dark: { ambient: [0.13, 0.13, 0.19], lights: [{ x: 64, y: 100, r: 120, color: '#ff7a2a', i: 1.2 }, { x: 232, y: 48, r: 50, color: '#ffd59a', i: 0.8 }, { x: 160, y: 215, r: 110, color: '#fff1d6', i: 1.0, sy: 1.0 }] },
  },
  basement_hollow: null,
  aud: {
    title: 'Auditorium: curtains (legs closed, centre raised), lectern, stage flat, rows of seats with husks (one turned, one crumbled)',
    rows: [
      'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
      'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
      'P============================P',
      'P============================P',
      'P============================P',
      'PFFFFFFFFFFFFFFFFFFFFFFFFFFFFP',
      'P============================P',
      ...Array.from({ length: 8 }, () => 'P============================P'),
      'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
    ],
    objects: [
      ...range(1, 6).map((x) => ({ type: 'curtain', x, y: 3, state: 'closed', variant: x })),
      ...range(7, 22).map((x) => ({ type: 'curtain', x, y: 3, state: 'open', variant: x })),
      ...range(23, 28).map((x) => ({ type: 'curtain', x, y: 3, state: 'closed', variant: x })),
      { type: 'lectern', x: 14, y: 4 }, { type: 'stage_flat', x: 20, y: 4, variant: 1 }, { type: 'music_stand', x: 9, y: 4 },
      { type: 'piano', x: 3, y: 4 },
      ...seats([8, 9, 10, 11, 12, 13, 14], 2, 12, true), ...seats([8, 9, 10, 11, 12, 13, 14], 16, 27, true),
      { type: 'aud_seat', x: 6, y: 13, state: 'occupied', occupant: 'husk_b:crumbled' },
    ],
    actors: [[14, 13, 'up']],
    dark: { ambient: [0.14, 0.13, 0.17], lights: [{ x: 232, y: 64, r: 70, color: '#fff4e0', i: 1.3, sy: 1.2 }, { x: 232, y: 216, r: 90, color: '#fff1d6', i: 0.9 }] },
  },
  vault: {
    title: "Founder's Vault: burst sarcophagus, wreaths, candles, regimental colour, name walls, Adair's husk at her desk",
    rows: [
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      ...Array.from({ length: 13 }, () => 'M' + 'm'.repeat(28) + 'M'),
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
    ],
    objects: [
      { type: 'name_wall', x: 2, y: 2, variant: 0 }, { type: 'name_wall', x: 6, y: 2, variant: 1 }, { type: 'flag_regimental', x: 14, y: 2 },
      { type: 'name_wall', x: 21, y: 2, variant: 2 }, { type: 'name_wall', x: 25, y: 2, variant: 0, label: '1894' },
      { type: 'sarcophagus', x: 13, y: 6, state: 'burst' },
      { type: 'wreath', x: 11, y: 5 }, { type: 'wreath', x: 18, y: 5, variant: 1 }, { type: 'wreath', x: 11, y: 9 },
      { type: 'candle', x: 10, y: 4, state: 'out' }, { type: 'candle', x: 19, y: 4, state: 'out' }, { type: 'candle', x: 10, y: 10, state: 'lit', frame: 1 }, { type: 'candle', x: 19, y: 10, state: 'out' },
      { type: 'husk_kneeling', x: 25, y: 9, dir: 'down' }, { type: 'writing_desk', x: 24, y: 10 },
      { type: 'husk_kneeling', x: 4, y: 10, dir: 'right' },
      { type: 'cobweb', x: 1, y: 3, dir: 'left' }, { type: 'decal_stain', x: 6, y: 13 }, { type: 'decal_leaves', x: 16, y: 13, variant: 4 },
    ],
    actors: [[20, 13, 'up']],
    dark: { ambient: [0.12, 0.1, 0.12], lights: [{ x: 168, y: 160, r: 60, color: '#ffb860', i: 1.1 }, { x: 330, y: 200, r: 110, color: '#fff1d6', i: 1.0 }, { x: 240, y: 260, r: 160, color: '#d03a12', i: 0.35 }] },
  },
  breaker: {
    title: "The Breaker: chutes and picking benches with breaker-boy husks and lamps, beams, sheave wheel, weigh-master's desk + the Register",
    rows: [
      'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
      'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
      'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
      'K' + 'p'.repeat(19) + 'K' + 'p'.repeat(8) + 'K',
      'K' + 'p'.repeat(28) + 'K',
      'K' + 'p'.repeat(19) + 'K' + 'p'.repeat(8) + 'K',
      'K' + 'p'.repeat(19) + 'K'.repeat(10),
      'KppppppppppppppppppppppppppppK',
      'KppppppppppppppppppppppppppppK',
      'KppppppppppppppppppppppppppppK',
      'K||||||||||||ppp|||||||||||||K',
      'KZZZZZZZZZZZ|ppp|ZZZZZZZZZZZZK',
      'KZZZZZZZZZZZ|ppp|ZZZZZZZZZZZZK',
      'KZZZZZZZZZZZ|ppp|ZZZZZZZZZZZZK',
      'K;;;;;;;;;;;;ppp;;;;%%;;;;;;;K',
      'K;;;;%%%;;;;;;;;;;;;;;;;;;;;;K',
      'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    ],
    objects: [
      // chutes running east–west, picking benches below them with the boys facing the coal
      ...range(1, 11).map((x) => ({ type: 'chute', x, y: 3, dir: 'left', variant: x % 3 })),
      { type: 'picking_bench', x: 1, y: 4 }, { type: 'picking_bench', x: 5, y: 4 }, { type: 'picking_bench', x: 9, y: 4 },
      ...[1, 2, 3, 5, 6, 7, 9, 10, 11].map((x, i) => ({ type: 'husk_seated', x, y: 4, dir: 'up', variant: 'boy', state: i === 4 ? 'turned' : i === 7 ? 'crumbled' : 'intact', sortBias: 1 })),
      ...[2, 6, 10].map((x) => ({ type: 'lamp_miner', x, y: 4, frame: x % 3, sortBias: 2 })),
      ...range(1, 11).map((x) => ({ type: 'chute', x, y: 7, dir: 'right', variant: (x + 1) % 3 })),
      { type: 'picking_bench', x: 1, y: 8 }, { type: 'picking_bench', x: 5, y: 8 },
      ...[1, 2, 3, 5, 6, 7].map((x, i) => ({ type: 'husk_seated', x, y: 8, dir: 'up', variant: 'boy', state: i === 1 ? 'turned' : 'intact', sortBias: 1 })),
      ...[3, 7].map((x) => ({ type: 'lamp_miner', x, y: 8, frame: x % 3, sortBias: 2 })),
      ...range(13, 15).map((y) => ({ type: 'chute', x: 18, y: y - 9, variant: y % 3 })),
      { type: 'beam', x: 12, y: 5 }, { type: 'beam', x: 16, y: 8, variant: 1 }, { type: 'beam', x: 12, y: 9 }, { type: 'beam', x: 27, y: 9, variant: 1 },
      { type: 'pulley_wheel', x: 13, y: 2 },
      { type: 'shelf_ledgers', x: 21, y: 3 }, { type: 'weigh_desk', x: 25, y: 4 }, { type: 'register_book', x: 25, y: 4, sortBias: 1 },
      { type: 'note_paper', x: 23, y: 5, variant: 1 }, { type: 'lamp_miner', x: 27, y: 5, frame: 0 },
    ],
    actors: [[14, 12, 'up']],
    dark: { ambient: [0.2, 0.08, 0.06], lights: [{ x: 240, y: 290, r: 260, color: '#d03a12', i: 1.2, sy: 0.8 }, { x: 40, y: 64, r: 26, color: '#ffc070', i: 0.8 }, { x: 104, y: 64, r: 26, color: '#ffc070', i: 0.8 }, { x: 168, y: 64, r: 26, color: '#ffc070', i: 0.8 }, { x: 56, y: 128, r: 26, color: '#ffc070', i: 0.8 }, { x: 120, y: 128, r: 26, color: '#ffc070', i: 0.8 }, { x: 440, y: 80, r: 50, color: '#ffc070', i: 0.9 }] },
  },
  exterior: {
    title: "Exterior lot: Leah's wagon (lights on), dead oak + canopy with shells, signs, steam vents, lamp posts, flagpole, fence, dumpster",
    rows: [
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      'BUBBUBBUBBUBBBBBBBBUBBUBBUBBUB',
      'BUBBUBBUBBUBBBBBBBBUBBUBBUBBUB',
      'gggggggggggs^^^^sggggggggggggg',
      'gggggggggggsssssssgggggggggggg',
      'gggggggggggsssssssgggggggggggg',
      'gggg;;gggggsssssssggggggggg;gg',
      ';;;;;;;;;;;sssssss;;;;;;;;;;;;',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'gggggggggggggggggggggggggggggg',
    ],
    objects: [
      { type: 'graffiti', x: 21, y: 2, state: 'hollowhell' }, { type: 'graffiti', x: 6, y: 2, state: 'kr91' },
      { type: 'oak_dead', x: 25, y: 5 }, { type: 'oak_canopy', x: 23, y: 2 }, { type: 'cicada_shells', x: 24, y: 6, variant: 2 }, { type: 'decal_leaves', x: 26, y: 6 }, { type: 'decal_leaves', x: 23, y: 5, variant: 3 },
      { type: 'flagpole', x: 9, y: 5 }, { type: 'bush_dead', x: 2, y: 4 }, { type: 'bush_dead', x: 5, y: 4, variant: 1 }, { type: 'bush_dead', x: 19, y: 4, variant: 2 },
      { type: 'sign_danger', x: 1, y: 9 }, { type: 'sign_school', x: 18, y: 14 },
      { type: 'car_wagon', x: 5, y: 11, dir: 'left', state: 'on' },
      { type: 'steam_vent', x: 13, y: 12 }, { type: 'steam_vent', x: 21, y: 10, variant: 1 }, { type: 'steam_vent', x: 3, y: 15 },
      { type: 'lamp_post', x: 14, y: 9, state: 'flicker' }, { type: 'lamp_post', x: 28, y: 12, state: 'dead' },
      { type: 'dumpster', x: 26, y: 8 },
      ...range(0, 13).map((x) => ({ type: 'fence', x, y: 15, state: x % 6 === 0 ? 'post' : 'h', variant: x })),
      { type: 'decal_papers', x: 11, y: 14 },
    ],
    actors: [[11, 11, 'up']],
    dark: { ambient: [0.17, 0.2, 0.3], lights: [{ x: 232, y: 70, r: 100, color: '#ffcf8a', i: 0.9 }, { x: 40, y: 200, r: 110, color: '#fff6dc', i: 1.0 }, { x: 184, y: 160, r: 110, color: '#fff1d6', i: 0.9 }] },
  },
};
SCENES.basement_hollow = { ...SCENES.basement, title: 'Basement after he got up: the coal heap HOLLOW', objects: SCENES.basement.objects.map((o) => (o.type === 'coal_heap' ? { ...o, state: 'hollow' } : o)) };
// sanity: catalog types exist
for (const s of Object.values(SCENES)) for (const o of s.objects) if (!PROPS[o.type]) console.error('scene type?', o.type);
