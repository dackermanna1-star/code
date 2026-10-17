// Props B contact sheets, animation strips, mock scenes and timing.
//   ?part=sheet&group=lab|kitchen|gym|basement|aud|vault|breaker|ext|misc|all &scale=3 &types=a,b
//   ?part=anim&scale=4                       — every animated type, all frames side by side
//   ?part=scene&scene=kitchen|gym|basement|aud|vault|breaker|exterior &scale=2 &dark=1 &clean=1
//   ?part=bench                              — build every combination, report ms
import { PROP_B_TYPES, PROPS_B, renderPropB, initPropsB, PROP_B_FRAMES, propsBStats } from '../../src/art/props_b.js';
import { PROPS } from '../../src/data/props.js';
import { PAL, mix } from '../../src/art/palette.js';
import { BAYER4 } from '../../src/art/util.js';
import { renderScene, SCENES } from './props_b_scenes.js';

const q = new URLSearchParams(location.search);
const part = q.get('part') || 'sheet';
const S = Number(q.get('scale') || 3);
const root = document.getElementById('root');

export const GROUPS = {
  lab: ['computer_desk', 'printer', 'lab_bench', 'lab_stool', 'fume_hood', 'eyewash', 'specimen_shelf', 'chem_cabinet', 'skeleton'],
  kitchen: ['caf_table', 'serving_line', 'tray_rack', 'stove', 'mixer', 'freezer_door', 'dumbwaiter', 'sink_big', 'shelf_pantry', 'vending_machine', 'milk_cooler'],
  gym: ['bleachers', 'hoop', 'hoop_stand', 'scoreboard', 'mat_stack', 'ball_cart', 'locker_bench', 'court_circle', 'court_line_h', 'court_line_v'],
  basement: ['boiler', 'pipe_h', 'pipe_v', 'breaker_panel', 'coal_heap', 'janitor_desk', 'pegboard', 'mop_bucket', 'shelf_metal', 'desk_pile', 'water_heater', 'valve_wheel', 'calendar', 'cage_bulb', 'cobweb'],
  aud: ['aud_seat', 'curtain', 'lectern', 'piano', 'music_stand', 'phonograph', 'instrument_case', 'stage_flat', 'lever', 'rope_rail'],
  vault: ['sarcophagus', 'wreath', 'flag_regimental', 'name_wall', 'writing_desk', 'candle', 'husk_seated', 'husk_kneeling'],
  breaker: ['chute', 'picking_bench', 'beam', 'lamp_miner', 'weigh_desk', 'register_book', 'shelf_ledgers', 'pulley_wheel'],
  ext: ['car_wagon', 'oak_dead', 'oak_canopy', 'sign_school', 'sign_danger', 'steam_vent', 'flagpole', 'fence', 'lamp_post', 'dumpster', 'bush_dead'],
  misc: ['pickup', 'note_paper', 'backpack', 'decal_leaves', 'decal_papers', 'decal_glass', 'decal_stain', 'decal_tiles', 'graffiti', 'cicada_shells'],
};

const h2 = (t) => { const d = document.createElement('h2'); d.textContent = t; root.appendChild(d); };
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
function show(c, s = S) { const [o, x] = canvas(c.width * s, c.height * s); x.drawImage(c, 0, 0, o.width, o.height); root.appendChild(o); return o; }

/** Background swatch per mount: floor checker, or a wall face (cream over green) above a floor. */
function swatch(x, mount, X0, Y0, w, h, fy) {
  const fl = (px, py) => (((px >> 3) + (py >> 3)) & 1 ? '#34333a' : '#2c2b31');
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    const wy = y - fy; // footprint y
    let c;
    if (mount === 'wall' && wy < 16) c = wy < -2 ? (wy < -14 ? '#56523f' : '#6b6650') : (wy < 0 ? '#2e3a31' : '#34443a');
    else c = fl(xx, y);
    x.fillStyle = c; x.fillRect(X0 + xx, Y0 + y, 1, 1);
  }
}

function cell(type, opts) {
  const r = renderPropB(type, opts);
  const def = PROPS[type];
  const fw = def.w * 16 || 16, fh = (def.h || 1) * 16;
  const pad = 4;
  const minX = Math.min(0, r.ox) - pad, minY = Math.min(def.mount === 'wall' ? -16 : 0, r.oy) - pad;
  const maxX = Math.max(fw, r.ox + r.canvas.width) + pad, maxY = Math.max(fh + (def.mount === 'wall' ? 16 : 0), r.oy + r.canvas.height) + pad;
  const W = maxX - minX, H = maxY - minY;
  const [c, x] = canvas(W, H);
  swatch(x, def.mount, 0, 0, W, H, -minY);
  // footprint marks (corners)
  x.fillStyle = 'rgba(230,209,136,0.5)';
  const fx = -minX, fyy = -minY;
  for (const [a, b] of [[fx, fyy], [fx + fw - 1, fyy], [fx, fyy + fh - 1], [fx + fw - 1, fyy + fh - 1]]) x.fillRect(a, b, 1, 1);
  x.drawImage(r.canvas, r.ox - minX, r.oy - minY);
  return c;
}

function combos(type) {
  const e = PROPS_B[type] || {};
  const def = PROPS[type];
  const states = e.states || def.states || ['default'];
  const dirs = e.facing ? (e.showFacing || e.facing) : [undefined];
  const cleans = e.noClean ? [false] : [false, true];
  const vars = e.showVariants || [0];
  const occ = e.showOccupants || [null];
  const out = [];
  for (const clean of cleans) for (const state of (clean && e.cleanStates ? e.cleanStates : states)) for (const dir of dirs) for (const variant of vars) for (const occupant of (state === 'occupied' ? occ : [null])) {
    out.push({ state, dir, sitDir: e.defaultDir ? dir : undefined, variant, clean, occupant });
  }
  return out;
}

function sheet(types) {
  const MAXW = Number(q.get('w') || 1880);
  for (const type of types) {
    const list = combos(type);
    const cells = list.map((o) => ({ o, c: cell(type, o) }));
    const lh = 12;
    // flow
    let x = 0, y = 0, rowH = 0; const pos = [];
    for (const { c } of cells) {
      const w = c.width * S, h = c.height * S + lh;
      if (x + w > MAXW && x > 0) { x = 0; y += rowH + 6; rowH = 0; }
      pos.push([x, y]); x += w + 6; rowH = Math.max(rowH, h);
    }
    const [out, ctx] = canvas(MAXW, y + rowH + 4);
    ctx.fillStyle = '#0b0b10'; ctx.fillRect(0, 0, out.width, out.height);
    cells.forEach(({ o, c }, i) => {
      const [px, py] = pos[i];
      ctx.drawImage(c, px, py, c.width * S, c.height * S);
      ctx.fillStyle = o.clean ? '#93ab8e' : '#9c9897'; ctx.font = '10px monospace';
      const lbl = [o.state, o.dir, o.variant ? `v${o.variant}` : '', o.occupant || '', o.clean ? '1979' : ''].filter(Boolean).join(' ');
      ctx.fillText(lbl, px, py + c.height * S + 10);
    });
    const def = PROPS[type];
    h2(`${type}  ${def.w || 1}×${def.h || 1} ${def.mount || 'floor'}${PROPS_B[type]?.frames ? `  frames ${PROPS_B[type].frames}` : ''}`);
    root.appendChild(out);
  }
}

function anim() {
  const s = Number(q.get('scale') || 4);
  for (const [type, f] of Object.entries(PROP_B_FRAMES)) {
    const e = PROPS_B[type];
    const states = e.animStates || (e.states || PROPS[type].states || ['default']);
    for (const state of states) {
      const cs = [];
      for (let i = 0; i < f.frames; i++) cs.push(cell(type, { state, frame: i, variant: e.showVariants?.[0] || 0, dir: e.showFacing?.[0] }));
      const W = cs.reduce((a, c) => a + c.width + 4, 0), H = cs[0].height;
      const [out, x] = canvas(W * s, H * s);
      let px = 0;
      for (const c of cs) { x.drawImage(c, px * s, 0, c.width * s, c.height * s); px += c.width + 4; }
      h2(`${type} ${state} — ${f.frames} frames @ ${f.fps} fps`);
      root.appendChild(out);
    }
  }
}

async function bench() {
  const t0 = performance.now();
  await initPropsB();
  const tInit = performance.now() - t0;
  const per = [];
  for (const type of PROP_B_TYPES) {
    const a = performance.now();
    let n = 0;
    for (const o of combos(type)) { renderPropB(type, o); n++; }
    const e = PROPS_B[type];
    if (e?.frames > 1) for (let i = 1; i < e.frames; i++) { renderPropB(type, { state: (e.animStates || [undefined])[0], frame: i }); n++; }
    per.push([type, n, performance.now() - a]);
  }
  per.sort((a, b) => b[2] - a[2]);
  const total = per.reduce((s, p) => s + p[2], 0);
  const pre = document.createElement('pre');
  pre.textContent = `initPropsB ${tInit.toFixed(1)} ms\nall combos ${total.toFixed(0)} ms, ${propsBStats().cached} canvases\nmissing: ${PROP_B_TYPES.filter((t) => !PROPS_B[t]).join(' ') || 'none'}\n\n` +
    per.map(([t, n, ms]) => `${t.padEnd(18)} ${String(n).padStart(3)}  ${ms.toFixed(1).padStart(7)} ms`).join('\n');
  root.appendChild(pre);
  console.log(pre.textContent.split('\n').slice(0, 14).join(' | '));
}

async function main() {
  await initPropsB();
  if (part === 'sheet') {
    const g = q.get('group') || 'all';
    const types = q.get('types') ? q.get('types').split(',') : g === 'all' ? PROP_B_TYPES : GROUPS[g];
    sheet(types);
  } else if (part === 'anim') anim();
  else if (part === 'scene') {
    const ids = (q.get('scene') || Object.keys(SCENES).join(',')).split(',');
    for (const id of ids) {
      const c = await renderScene(id, { clean: q.get('clean') === '1', dark: q.get('dark') === '1', t: Number(q.get('t') || 0) });
      h2(`${id} — ${SCENES[id].title}${q.get('clean') === '1' ? ' (1979)' : ''}${q.get('dark') === '1' ? ' (mock darkness)' : ''}`);
      show(c, Number(q.get('scale') || 2));
    }
  } else if (part === 'bench') await bench();
  window.__ready = true;
}
main().catch((e) => { console.error(e); window.__ready = true; });
