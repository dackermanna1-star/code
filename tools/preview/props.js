// Props A preview — labelled contact sheets of every group-A type × state × facing × variant
// (+ the clean 1979 version), each composed on a mini wall/floor diorama through the real tile art
// and the engine's layer order; plus mock scenes (?g=scenes).
//   tools/preview/props.html?g=doors|class|hall|office|library|scenes   [&s=3 scale] [&dark=1]
import * as tiles from '../../src/art/tiles.js';
import * as propsMod from '../../src/art/props.js';
const { PROPS_A } = propsMod;
// lightweight facade (tiles + props only; sprites/portraits/CG are not needed here)
const art = {
  async init() { await tiles.initTiles(); await propsMod.initProps(); },
  drawTile: (ctx, key, px, py, o) => tiles.drawTile(ctx, key, px, py, o || {}),
  prop: (type, o) => propsMod.getProp(type, o || {}),
  drawPropDynamic: (ctx, type, px, py, params, t) => propsMod.drawPropDynamic(ctx, type, px, py, params || {}, t || 0),
};
import { propDef } from '../../src/data/props.js';
import { buildMap, renderScene, darkPass } from './props_map.js';
import { SCENES } from './props_scenes.js';
import { tinyText } from '../../src/art/util.js';

const q = new URLSearchParams(location.search);
const GROUP = q.get('g') || 'doors';
const S = Number(q.get('s') || 3);
const PAGE_W = Number(q.get('w') || 1880);

const GROUPS = {
  doors: ['door_class', 'door_double', 'door_metal', 'door_glass', 'door_side', 'door_front', 'gate_accordion', 'trapdoor', 'stair_spiral', 'coal_chute'],
  class: ['desk_student', 'desk_teacher', 'chair_teacher', 'tiny_chair', 'tiny_table', 'chalkboard', 'bulletin_board', 'clock_wall', 'flag_us', 'poster', 'cubbies', 'drawings_wall', 'alphabet_strip', 'bookshelf_low', 'globe', 'projector', 'trash_can', 'radiator', 'coat_hooks'],
  hall: ['locker', 'water_fountain', 'trophy_case', 'fire_extinguisher', 'exit_sign', 'bench', 'memorial_board', 'portrait_colonel', 'plaque', 'banner', 'motto_stone', 'clock_hall'],
  office: ['counter', 'office_desk', 'office_chair', 'filing_cabinet', 'mailboxes', 'cot', 'eye_chart', 'pa_console', 'master_clock', 'portrait_small', 'coat_rack', 'water_cooler', 'plant_dead', 'shelf_med'],
  library: ['bookshelf_tall', 'card_catalog', 'reading_table', 'chair_library', 'librarian_desk', 'display_case', 'lamp_banker', 'microfiche', 'book_cart', 'yearbook_pile', 'stall', 'sink', 'mirror', 'urinal', 'hand_dryer', 'shower_head'],
};
// wall / floor material per type (legend chars)
const MAT = {
  doors: ['#', ','], class: ['#', '.'], hall: ['#', ','], office: ['P', '"'], library: ['P', '='],
};
const MAT_TYPE = {
  stall: ['T', '_'], sink: ['T', '_'], mirror: ['T', '_'], urinal: ['T', '_'], hand_dryer: ['T', '_'], shower_head: ['T', '_'],
  coal_chute: ['C', ':'], door_metal: ['C', ':'], door_front: ['B', 'a'], motto_stone: ['B', 's'], portrait_colonel: ['B', ','],
  plaque: ['B', ','], memorial_board: ['B', ','], trophy_case: ['B', ','], stair_spiral: ['P', '='], trapdoor: ['P', '='],
  locker: ['#', ','], counter: ['#', '"'], pa_console: ['#', '"'], shelf_med: ['#', '_'], eye_chart: ['#', '_'], cot: ['#', '_'],
};
const DYN = {
  chalkboard: [{}, { text: 'DANIEL KOVACH — PRESENT' }, { text: 'MR. H SAYS HI' }, { text: 'I WILL NOT LEAVE I WILL NOT LEAVE I WILL NOT LEAVE' }, { text: 'DOLAN, THERESA — ABSENT\nABSENCES WILL BE MADE UP' },
    { text: 'THERESA DOLAN — PRESENT', text1979: "FOUNDER'S DAY — ASSEMBLY 1:45", clean: true }, { clean: true }],
  clock_wall: [{ time: 1.75 }, { time: 10.1 }, { time: 1.72, clean: true }],
  clock_hall: [{ time: 1.75 }, { time: 7.5 }, { time: 1.7, clean: true }],
  memorial_board: [{}, { polaroids: { danny: true, leah: 'pencil', marcus: true } }, { polaroids: { danny: 'pencil', leah: 'pencil', marcus: 'pencil' }, tessFrame: 0 },
    { polaroids: { danny: true, leah: true, marcus: true }, tessFrame: 1 }, { polaroids: { danny: true, leah: true, marcus: true }, tessFrame: 2 }, { clean: true }],
};
const LABELS = { door_class: ['Room 103', 'Room 205', ''], door_glass: ['MAIN OFFICE'], door_metal: ['B3', ''] };

function cellsFor(type) {
  const def = propDef(type), e = PROPS_A[type] || {};
  const out = [];
  if (DYN[type]) { for (const p of DYN[type]) out.push({ type, state: def.states[0], params: p, clean: !!p.clean }); return out; }
  const dirs = e.facing || [null];
  const nv = e.variants || 1;
  const labs = LABELS[type] || [''];
  for (const state of def.states) for (const dir of dirs) {
    out.push({ type, state, dir, variant: 0, label: labs[0] });
  }
  for (let v = 1; v < Math.min(nv, 6); v++) out.push({ type, state: def.states[0], dir: dirs[0], variant: v, label: labs[v % labs.length] });
  for (const state of def.states.slice(0, type.startsWith('door') || type === 'mirror' || type === 'locker' ? def.states.length : 1)) {
    out.push({ type, state, dir: dirs[0], variant: 0, clean: true, label: labs[0] });
  }
  return out;
}

function diorama(cell, group) {
  const def = propDef(cell.type);
  const [wc, fc] = MAT_TYPE[cell.type] || MAT[group];
  const isDoor = def.interact === 'door' || cell.type === 'coal_chute';
  let rows, px = 1, py;
  const W = def.w + 2;
  if (cell.type === 'door_side') {
    rows = ['#####', '#####', '#####', fc.repeat(2) + '#' + fc.repeat(2), fc.repeat(2) + 'D' + fc.repeat(2), fc.repeat(2) + '#' + fc.repeat(2), fc.repeat(5)];
    px = 2; py = 4;
  } else if (isDoor && def.h === 2) {
    const wall = (ch) => wc + ch.repeat(def.w) + wc;
    rows = [wall('D'), wall('D'), wall('D'), fc.repeat(W), fc.repeat(W)];
    py = 1;
  } else {
    const fh = def.mount === 'wall' ? 2 : def.h + 1;
    rows = [wc.repeat(W), wc.repeat(W), wc.repeat(W)];
    for (let i = 0; i < fh; i++) rows.push(fc.repeat(W));
    py = def.mount === 'wall' ? 2 : 3;
    if (def.mount === 'decal' || cell.type === 'stair_spiral' || cell.type === 'gate_accordion') py = 4, rows.push(fc.repeat(W));
    if (cell.type === 'stair_spiral') rows.push(fc.repeat(W));
  }
  const m = buildMap(`${cell.type}_${cell.state}`, rows);
  const p = { type: cell.type, x: px, y: py, state: cell.state, dir: cell.dir || 'down', variant: cell.variant | 0, clean: !!cell.clean, label: cell.label, params: cell.params || {} };
  if (cell.dir && PROPS_A[cell.type]?.facing) p.sitDir = cell.dir;
  // lamps / yearbooks sit on a table cell
  const props = [p];
  if (cell.type === 'lamp_banker' || cell.type === 'yearbook_pile') props.unshift({ type: 'reading_table', x: 0, y: py, state: 'default', clean: p.clean, variant: 0 }), p.x = 1;
  if (cell.type === 'mirror') props.push({ type: 'sink', x: px, y: 3, state: 'default', clean: p.clean });
  return renderScene(art, m, props, { clean: !!cell.clean, t: 0 });
}

function labelOf(c) {
  const bits = [c.state !== 'default' ? c.state : '', c.dir || '', c.variant ? `v${c.variant}` : '', c.clean ? '1979' : '', c.label || ''];
  if (c.params) {
    if (c.params.text) bits.push(`"${c.params.text.slice(0, 12)}…"`);
    if (c.params.time) bits.push(`t=${c.params.time}`);
    if (c.params.polaroids) bits.push('polaroids');
    if (c.params.tessFrame !== undefined) bits.push(`tess${c.params.tessFrame}`);
  }
  return bits.filter(Boolean).join(' ');
}

function sheet(group) {
  const items = [];
  for (const type of GROUPS[group]) for (const c of cellsFor(type)) {
    try { items.push({ title: type, sub: labelOf(c), img: diorama(c, group) }); } catch (e) { console.error(type, e); }
  }
  // flow layout
  const pad = 10, lab = 26;
  let x = pad, y = pad, rowH = 0;
  const pos = [];
  for (const it of items) {
    const w = it.img.width * S, h = it.img.height * S + lab;
    if (x + w > PAGE_W - pad) { x = pad; y += rowH + pad; rowH = 0; }
    pos.push([x, y]); x += w + pad; rowH = Math.max(rowH, h);
  }
  const H = y + rowH + pad;
  const c = document.createElement('canvas'); c.width = PAGE_W; c.height = H;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#07070a'; g.fillRect(0, 0, PAGE_W, H);
  items.forEach((it, i) => {
    const [px, py] = pos[i];
    g.fillStyle = '#e6d188'; g.font = '12px monospace'; g.fillText(it.title, px, py + 10);
    g.fillStyle = '#9c9897'; g.fillText(it.sub, px, py + 22);
    g.drawImage(it.img, px, py + lab, it.img.width * S, it.img.height * S);
  });
  return c;
}

async function scenes() {
  const out = [];
  let getSprite = null;
  try { getSprite = (await import('../../src/art/sprites.js')).getSprite; } catch (e) { console.warn('sprites unavailable', e); }
  const only = q.get('scene');
  for (const sc of SCENES) {
    if (only && !sc.id.includes(only)) continue;
    const m = buildMap(sc.id, sc.rows, sc.legend || {});
    const actors = getSprite ? (sc.actors || []).map((a) => { try { return a(getSprite); } catch (e) { console.warn(e); return null; } }).filter(Boolean) : [];
    const img = renderScene(art, m, sc.props, { clean: !!q.get('clean'), t: sc.t || 0, actors });
    out.push({ title: sc.name, img });
    if (q.get('dark')) out.push({ title: `${sc.name} — darkness check`, img: darkPass(img, sc.lights || []) });
  }
  const S2 = Number(q.get('s') || 2);
  const H = out.reduce((a, it) => a + it.img.height * S2 + 30, 10);
  const Wd = Math.max(...out.map((it) => it.img.width * S2)) + 20;
  const c = document.createElement('canvas'); c.width = Wd; c.height = H;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.fillStyle = '#07070a'; g.fillRect(0, 0, Wd, H);
  let y = 10;
  for (const it of out) {
    g.fillStyle = '#e6d188'; g.font = '13px monospace'; g.fillText(it.title, 10, y + 14);
    g.drawImage(it.img, 10, y + 20, it.img.width * S2, it.img.height * S2);
    y += it.img.height * S2 + 30;
  }
  return c;
}

(async () => {
  const t0 = performance.now();
  await art.init();
  const t1 = performance.now();
  const c = GROUP === 'scenes' ? await scenes() : sheet(GROUP);
  const t2 = performance.now();
  document.getElementById('root').appendChild(c);
  const info = document.createElement('div');
  info.textContent = `art.init ${Math.round(t1 - t0)} ms · sheet ${Math.round(t2 - t1)} ms`;
  document.getElementById('root').prepend(info);
  console.log(info.textContent);
  window.__ready = true;
})();
