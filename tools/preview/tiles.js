// Tiles contact sheets & mock scenes.
//   ?part=floors|walls|specials|scenes|scene   (default: floors)
//   &scene=<id>  (part=scene)   &clean=0|1|both   &scale=2   &light=1 (mock darkness + flashlight)
//   &t=<sec> (water frame time)   &watermask=1 (preview the proposed engine mask for water/stairs)
//   ?part=bench → timing: every key × kind × mask × dirty/clean, and 600 frames of animated water
import { initTiles, drawTile, tileStats } from '../../src/art/tiles.js';
import { TILES } from '../../src/data/tiles.js';
import { PAL } from '../../src/art/palette.js';
import { buildMap, renderMap, SCENES } from './tiles_map.js';

const q = new URLSearchParams(location.search);
const part = q.get('part') || 'floors';
const S = Number(q.get('scale') || 2);
const light = q.get('light') === '1';
const cleanMode = q.get('clean') || 'both';
const T = Number(q.get('t') || 0);
const waterMask = q.get('watermask') === '1';
const root = document.getElementById('root');
const art = { drawTile };

const label = (text, parent = root) => { const d = document.createElement('div'); d.className = 'lbl'; d.textContent = text; parent.appendChild(d); return d; };
const row = () => { const d = document.createElement('div'); d.className = 'row'; root.appendChild(d); return d; };
function show(c, parent = root, scale = S) {
  const out = document.createElement('canvas');
  out.width = c.width * scale; out.height = c.height * scale;
  const x = out.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, out.width, out.height);
  parent.appendChild(out);
  return out;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
const cleans = cleanMode === 'both' ? [false, true] : [cleanMode === '1'];

// a 24×32 stand-in for Tess (copper hair, denim jacket, black jeans, white soles) for readability
function actor(ctx, tx, ty, alt = false) {
  const fx = tx * 16 + 8, fy = ty * 16 + 12;
  const x = fx - 12, y = fy - 31;
  const R = (a, b, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x + a, y + b, w, h); };
  // contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(fx - 6, fy - 1, 12, 3); ctx.fillRect(fx - 4, fy + 2, 8, 1);
  const hair = alt ? PAL.hair_k : PAL.hair_r, jacket = alt ? PAL.green_d : PAL.denim;
  R(7, 3, 10, 11, PAL.ink); R(8, 4, 8, 9, hair); R(9, 7, 6, 6, PAL.skin); R(9, 6, 6, 1, hair);
  R(6, 13, 12, 10, PAL.ink); R(7, 14, 10, 8, jacket); R(10, 14, 4, 4, PAL.ink); R(7, 14, 1, 8, alt ? PAL.green : PAL.denim_l);
  R(7, 22, 10, 8, PAL.ink); R(8, 22, 3, 7, PAL.g1); R(13, 22, 3, 7, PAL.g1);
  R(7, 29, 4, 2, PAL.white); R(13, 29, 4, 2, PAL.white);
}

/** Mock lighting: multiply darkness with a flashlight pool and a moonlit window patch. */
function darken(ctx, w, h, spots) {
  const [L, l] = canvas(w, h);
  l.fillStyle = '#16192a'; l.fillRect(0, 0, w, h);
  l.globalCompositeOperation = 'lighter';
  for (const [x, y, r, col] of spots) {
    const g = l.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(0.55, col.replace('1)', '0.55)')); g.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = g; l.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(L, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------------------------------------
function floorsSheet() {
  const keys = Object.keys(TILES).filter((k) => TILES[k].kind === 'floor' || k.startsWith('floor_stairs'));
  const W = 7, H = 4;
  for (const clean of cleans) {
    label(`FLOORS — ${clean ? 'CLEAN (1979)' : 'DECAYED (1996)'} — each patch ${W}×${H} tiles in world space`);
    const r = row();
    for (const k of keys) {
      const box = document.createElement('div'); r.appendChild(box);
      label(k, box);
      const [c, x] = canvas(W * 16, H * 16);
      for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
        x.save(); x.translate(-(tx + 20) * 16 + tx * 16, -(ty + 13) * 16 + ty * 16);
        drawTile(x, k, (tx + 20) * 16, (ty + 13) * 16, { variant: (tx * 7 + ty * 13) * 977, clean, t: T });
        x.restore();
      }
      show(c, box);
    }
  }
}

const WALL_MATS = { wall_plaster: ['#', '.', 'W'], wall_brick: ['B', 'a', 'U'], wall_tile: ['T', '_'], wall_panel: ['P', '"'], wall_concrete: ['C', ':'],
  wall_rock: ['R', ';'], wall_marble: ['M', 'm'], wall_timber: ['K', 'p'], wall_gym: ['G', '='], wall_rubble: ['X', 'd'] };
const WALL_DEMO = [
  '          ',
  ' #####D## ',
  ' ##ww#D## ',
  ' ##ww#D## ',
  ' #......# ',
  ' #......D ',
  ' #......# ',
  ' ######## ',
  '          ',
];
function wallsSheet() {
  for (const clean of cleans) {
    label(`WALLS — ${clean ? 'CLEAN (1979)' : 'DECAYED (1996)'} — top (lips per mask) / face_high / face_low / door gaps / window cells`);
    const r = row();
    for (const [mat, [ch, fl, win]] of Object.entries(WALL_MATS)) {
      const rows = WALL_DEMO.map((s) => s.replace(/#/g, ch).replace(/\./g, fl).replace(/w/g, win || ch));
      const m = buildMap('demo_' + mat, rows);
      const box = document.createElement('div'); r.appendChild(box);
      label(mat + (win ? ` + ${win === 'W' ? 'window_plaster' : 'window_brick'}` : ''), box);
      const ox = 10, oy = 11;
      const out = renderMap(null, art, m, { clean, ox, oy });
      const [c, x] = canvas(m.w * 16, m.h * 16);
      x.translate(-ox * 16, -oy * 16);
      out.compose(x, [(cx) => actor(cx, ox + 4, oy + 5)]);
      show(c, box);
    }
  }
}

function specialsSheet() {
  for (const clean of cleans) {
    label(`SPECIALS — ${clean ? 'CLEAN' : 'DECAYED'} — pit (masks) · railing (masks) · stage front · stairs · door threshold · void · water frames`);
    const r = row();
    const demos = {
      'pit + railings': ['           ', ' sssssssss ', ' s|||||||s ', ' s|ZZZZZ|s ', ' s|ZZZZZ|s ', ' sZZZZZZ|s ', ' sZZZZsss  ', ' sssssss   ', '           '],
      'railing joins': ['         ', ' ||| | | ', ' | | | | ', ' ||| |   ', '      |  ', ' |  |||  ', '    |    ', '         '],
      'stage + stairs': ['          ', ' ======== ', ' ======== ', ' ^^FFFF^^ ', ' """""""" ', ' """""""" ', '          '],
      'stairs up / down': ['         ', ' ^^^ vvv ', ' ^^^ vvv ', ' ^^^ vvv ', ' ,,, ,,, ', '         '],
      'water': ['        ', ' :::::: ', ' :~~~~: ', ' ~~~~~: ', ' :~~~:: ', ' :::::: ', '        '],
      'void / door': ['        ', ' ###### ', ' ##D### ', ' ##D### ', ' ##D### ', ' ,,,,,, ', '        '],
    };
    for (const [name, rows] of Object.entries(demos)) {
      const m = buildMap('sp_' + name, rows);
      const box = document.createElement('div'); r.appendChild(box);
      label(name, box);
      const ox = 6, oy = 9;
      const out = renderMap(null, art, m, { clean, ox, oy, t: T, waterMask });
      const [c, x] = canvas(m.w * 16, m.h * 16);
      x.translate(-ox * 16, -oy * 16);
      out.compose(x);
      show(c, box);
    }
    // water frames
    const box = document.createElement('div'); r.appendChild(box);
    label('water frames (v0..7 × f0..3)', box);
    const [c, x] = canvas(8 * 18, 4 * 18);
    for (let v = 0; v < 8; v++) for (let f = 0; f < 4; f++) drawTile(x, 'floor_water', v * 18, f * 18, { variant: v, clean, t: f / 2.2 + 0.001 });
    show(c, box);
  }
}

function scene(id, clean) {
  const sc = SCENES[id];
  const m = buildMap(id, sc.rows);
  const ox = sc.ox || 0, oy = sc.oy ?? 0;
  const out = renderMap(null, art, m, { clean, ox, oy, t: T || 1.3, waterMask });
  const [c, x] = canvas(480, 270);
  x.fillStyle = '#000'; x.fillRect(0, 0, 480, 270);
  x.save(); x.translate(-ox * 16, -oy * 16);
  out.compose(x, (sc.actors || []).map(([ax, ay], i) => (cx) => actor(cx, ax + ox, ay + oy, i > 0)));
  x.restore();
  if (light) {
    const [ax, ay] = sc.actors[0];
    darken(x, 480, 270, [[ax * 16 + 8 + 50, ay * 16 - 4, 120, 'rgba(255,241,214,1)'], [ax * 16 + 8, ay * 16, 40, 'rgba(255,241,214,1)'], [120, 70, 70, 'rgba(127,156,196,1)']]);
  }
  return c;
}
function scenesSheet() {
  const ids = q.get('scene') ? q.get('scene').split(',') : Object.keys(SCENES);
  for (const id of ids) {
    label(`${id} — ${SCENES[id].title}`);
    const r = row();
    for (const clean of cleans) show(scene(id, clean), r);
  }
}

function bench() {
  const [c, x] = canvas(64, 64);
  const out = {};
  let t0 = performance.now();
  for (const clean of [false, true]) for (const k of Object.keys(TILES)) {
    const kd = TILES[k].kind;
    const kinds = kd === 'wall' || kd === 'window' ? ['top', 'face_high', 'face_low'] : kd === 'door' ? [undefined, 'top'] : [undefined];
    for (const kind of kinds) for (let m = 0; m < 16; m++) drawTile(x, k, m * 48, 13 * 16, { kind, mask: m, variant: m * 977, clean, t: 0.5 });
  }
  out.everythingMs = Math.round(performance.now() - t0);
  t0 = performance.now();
  for (let f = 0; f < 600; f++) for (let i = 0; i < 60; i++) drawTile(x, 'floor_water', (i & 3) * 16, 0, { variant: i * 31, t: f / 60 });
  out.water600x60Ms = Math.round(performance.now() - t0);
  label('BENCH ' + JSON.stringify(out));
  console.log('[bench]', JSON.stringify(out));
  void c;
}

(async () => {
  const t0 = performance.now();
  await initTiles();
  const tInit = performance.now() - t0;
  const t1 = performance.now();
  if (part === 'floors') floorsSheet();
  else if (part === 'walls') wallsSheet();
  else if (part === 'specials') specialsSheet();
  else if (part === 'scenes' || part === 'scene') scenesSheet();
  else if (part === 'bench') bench();
  const tDraw = performance.now() - t1;
  const st = tileStats();
  label(`init ${tInit.toFixed(0)} ms · build+draw ${tDraw.toFixed(0)} ms · textures ${st.textures} · cells ${st.cells}`);
  console.log(`[tiles] init ${tInit.toFixed(0)}ms draw ${tDraw.toFixed(0)}ms tex ${st.textures} cells ${st.cells}`);
  window.__ready = true;
})();
