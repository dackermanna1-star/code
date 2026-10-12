// Save games: a generic object-graph serializer for the running level.
// Sectors, lines, sides, map objects, the player and sector thinkers are
// written as plain JSON with references encoded by index/id, then restored
// onto a freshly loaded copy of the same map.

import { Mobj, reserveMobjIds } from './mobj.js';
import { MOBJINFO } from './tables.js';
import { setThingPosition } from './maputl.js';
import { World } from './world.js';
import { loadMapData } from './mapdata.js';
import { Player } from './player.js';
import { VerticalDoor } from './specials/doors.js';
import { Plat } from './specials/plats.js';
import { FloorMove } from './specials/floors.js';
import { Ceiling } from './specials/ceilings.js';
import { FireFlicker, LightFlash, StrobeFlash, Glow } from './specials/lights.js';

export const SAVE_VERSION = 1;
const CLASSES = { VerticalDoor, Plat, FloorMove, Ceiling, FireFlicker, LightFlash, StrobeFlash, Glow };

const SECTOR_FIELDS = ['floorheight', 'ceilingheight', 'floorpic', 'ceilingpic', 'lightlevel', 'special', 'tag', 'soundtraps'];
const LINE_FIELDS = ['flags', 'special', 'tag'];
const SIDE_FIELDS = ['textureoffset', 'rowoffset', 'toptexture', 'bottomtexture', 'midtexture'];
const MOBJ_SKIP = new Set(['info', 'subsector', 'sectorLink', 'blockLink', 'validcount']);
const PLAYER_SKIP = new Set(['cmd', 'damageDirs', 'pspPrev']);

class Encoder {
  constructor(w) {
    this.w = w;
    this.thinkerIndex = new Map();
  }

  ref(v) {
    const w = this.w;
    const L = w.level;
    if (v === null || v === undefined || typeof v !== 'object') return v;
    if (v.isMobj) return v.removed ? null : { $m: v.id };
    if (v === w.player) return { $p: 1 };
    if (v === w.specials) return { $sp: 1 };
    if (v === w) return { $w: 1 };
    if (typeof v.index === 'number') {
      if (L.sectors[v.index] === v) return { $s: v.index };
      if (L.lines[v.index] === v) return { $l: v.index };
      if (L.sides[v.index] === v) return { $d: v.index };
    }
    if (this.thinkerIndex.has(v)) return { $t: this.thinkerIndex.get(v) };
    if (Array.isArray(v)) return v.map((x) => this.ref(x));
    if (v.constructor && v.constructor !== Object && !CLASSES[v.constructor.name]) return undefined;
    const out = {};
    for (const k of Object.keys(v)) {
      const val = v[k];
      if (typeof val === 'function') continue;
      out[k] = this.ref(val);
    }
    return out;
  }

  plainFields(obj, skip) {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (skip.has(k)) continue;
      const v = obj[k];
      if (typeof v === 'function') continue;
      out[k] = this.ref(v);
    }
    return out;
  }
}

// Plain numeric/boolean fields of an object (world counters, RNG seeds...).
function scalars(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  return out;
}

// Geometry rows that differ from the map as stored in the WAD, tagged with
// their index ($i). Loading starts from a fresh copy of the map, so the rest
// need not be stored; this keeps big maps' saves within localStorage quota.
function changedRows(list, pristine, fields, extra) {
  const out = [];
  list.forEach((x, i) => {
    const o = extra(x);
    for (const f of fields) if (x[f] !== pristine[i][f]) o[f] = x[f];
    if (Object.keys(o).length) { o.$i = i; out.push(o); }
  });
  return out;
}

export function saveGame(game, description = '') {
  const w = game.world;
  const p = game.player;
  if (!w || !p || game.state !== 'level') return null;
  const enc = new Encoder(w);
  // Index non-mobj thinkers first so references resolve.
  const thinkers = [];
  for (const t of w.thinkers) {
    if (t.removed || t.isMobj) continue;
    enc.thinkerIndex.set(t, thinkers.length);
    thinkers.push(t);
  }
  const L = w.level;
  const pristine = loadMapData(game.stack.mapLumps(w.mapName), game.res);
  const data = {
    version: SAVE_VERSION,
    description,
    date: Date.now(),
    gamemode: game.gamemode,
    episode: game.episode,
    map: game.map,
    mapName: game.mapName(),
    skill: game.skill,
    world: {
      leveltime: w.leveltime,
      gametic: w.gametic,
      prndindex: w.rng.prndindex,
      rndindex: w.rng.rndindex,
      aiSeed: w.aiSeed || 0,
      modSeed: w.modSeed || 0,
      totalkills: w.totalkills,
      totalitems: w.totalitems,
      totalsecret: w.totalsecret,
      brainTargets: w.brainTargets ? enc.ref(w.brainTargets) : null,
      brainTargetOn: w.brainTargetOn || 0,
      // Every other scalar field (e.g. extra RNG seeds) generically.
      scalars: scalars(w),
      rng: scalars(w.rng),
    },
    // Texture/flat numbers are WAD-specific: keep the name tables so a save
    // can be loaded with a different IWAD that has the same map.
    textureNames: game.res.textures.map((t) => t.name),
    flatNames: game.res.flats.map((f) => f.name),
    counts: { sectors: L.sectors.length, lines: L.lines.length, sides: L.sides.length },
    sectorRows: changedRows(L.sectors, pristine.sectors, SECTOR_FIELDS, (s) => {
      const o = {};
      if (s.soundtarget) o.soundtarget = enc.ref(s.soundtarget);
      if (s.specialdata) o.specialdata = enc.ref(s.specialdata);
      return o;
    }),
    lineRows: changedRows(L.lines, pristine.lines, LINE_FIELDS, (l) => (l.specialdata ? { specialdata: enc.ref(l.specialdata) } : {})),
    sideRows: changedRows(L.sides, pristine.sides, SIDE_FIELDS, () => ({})),
    mobjs: [...w.mobjs].map((mo) => enc.plainFields(mo, MOBJ_SKIP)),
    thinkerOrder: w.thinkers.filter((t) => !t.removed).map((t) => (t.isMobj ? { m: t.id } : { t: enc.thinkerIndex.get(t) })),
    thinkers: thinkers.map((t) => ({ cls: t.constructor.name, f: enc.plainFields(t, new Set(['removed'])) })),
    specials: {
      activeplats: enc.ref(w.specials.activeplats),
      activeceilings: enc.ref(w.specials.activeceilings),
      buttons: enc.ref(w.specials.buttons),
    },
    player: enc.plainFields(p, PLAYER_SKIP),
  };
  return data;
}

class Decoder {
  constructor(w, mobjsById, thinkers) {
    this.w = w;
    this.mobjs = mobjsById;
    this.thinkers = thinkers;
  }

  deref(v) {
    if (v === null || v === undefined || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => this.deref(x));
    const L = this.w.level;
    if ('$m' in v) return this.mobjs.get(v.$m) || null;
    if ('$p' in v) return this.w.player;
    if ('$sp' in v) return this.w.specials;
    if ('$w' in v) return this.w;
    if ('$s' in v) return L.sectors[v.$s];
    if ('$l' in v) return L.lines[v.$l];
    if ('$d' in v) return L.sides[v.$d];
    if ('$t' in v) return this.thinkers[v.$t];
    const out = {};
    for (const k of Object.keys(v)) out[k] = this.deref(v[k]);
    return out;
  }
}

// World fields that come from the loaded WAD rather than the game state.
const RESOURCE_SCALARS = new Set(['skyFlatIndex']);

// Maps a saved texture/flat number to this WAD's number via the saved names.
function remapper(names, current, lookup) {
  if (!Array.isArray(names) || (names.length === current.length && names.every((n, i) => current[i].name === n))) {
    return (i) => i;
  }
  return (i) => (typeof i === 'number' && typeof names[i] === 'string' ? lookup(names[i]) : i);
}

// Builds a World from save data. `game` provides the WAD stack/resources.
export function loadGame(game, data) {
  if (!data || data.version !== SAVE_VERSION) throw new Error('incompatible save');
  const lumps = game.stack.mapLumps(data.mapName);
  if (!lumps) throw new Error(`map ${data.mapName} missing`);
  // `game` is only updated once the save has been restored, so a failed load
  // leaves the running game untouched.
  const player = new Player();
  const w = new World({
    game, res: game.res, settings: game.settings.values, mapName: data.mapName, episode: data.episode, map: data.map,
    commercial: game.commercial, gamemode: game.gamemode, skill: data.skill, player, lumps, audio: game.audio,
  });
  const L = w.level;
  // Older saves hold every sector/line/side; newer ones only changed rows.
  const rows = (full, changed) => changed || full.map((o, i) => ({ ...o, $i: i }));
  const counts = data.counts || { sectors: data.sectors.length, lines: data.lines.length, sides: data.sides.length };
  if (counts.sectors !== L.sectors.length || counts.lines !== L.lines.length || counts.sides !== L.sides.length) {
    throw new Error(`save does not match ${data.mapName} in this wad`);
  }
  const sectorRows = rows(data.sectors, data.sectorRows);
  const lineRows = rows(data.lines, data.lineRows);
  const sideRows = rows(data.sides, data.sideRows);
  const ws = data.world;
  if (ws.scalars) {
    for (const [k, v] of Object.entries(ws.scalars)) {
      if (!RESOURCE_SCALARS.has(k) && (w[k] === undefined || typeof w[k] === typeof v)) w[k] = v;
    }
  }
  if (ws.rng) Object.assign(w.rng, ws.rng);
  w.leveltime = ws.leveltime;
  w.gametic = ws.gametic;
  w.rng.prndindex = ws.prndindex;
  w.rng.rndindex = ws.rndindex;
  w.aiSeed = ws.aiSeed;
  w.modSeed = ws.modSeed || 0;
  w.totalkills = ws.totalkills;
  w.totalitems = ws.totalitems;
  w.totalsecret = ws.totalsecret;
  // Saved texture/flat numbers are remapped; untouched rows already use this WAD's.
  const tex = remapper(data.textureNames, game.res.textures, (n) => game.res.textureNum(n));
  const flat = remapper(data.flatNames, game.res.flats, (n) => game.res.flatNum(n));
  const PICS = { floorpic: flat, ceilingpic: flat, toptexture: tex, bottomtexture: tex, midtexture: tex };
  const apply = (target, o, fields) => {
    for (const f of fields) if (f in o) target[f] = PICS[f] ? PICS[f](o[f]) : o[f];
  };
  for (const o of sectorRows) apply(L.sectors[o.$i], o, SECTOR_FIELDS);
  for (const s of L.sectors) {
    s.prevFloor = s.floorheight;
    s.prevCeil = s.ceilingheight;
  }
  for (const o of lineRows) apply(L.lines[o.$i], o, LINE_FIELDS);
  for (const o of sideRows) apply(L.sides[o.$i], o, SIDE_FIELDS);
  w.specials.initStatic();

  // Objects first (unresolved), then thinkers, then resolve references.
  const mobjsById = new Map();
  for (const m of data.mobjs) {
    const mo = new Mobj(m.type);
    mobjsById.set(m.id, mo);
  }
  const thinkers = data.thinkers.map((t) => Object.create((CLASSES[t.cls] || Object).prototype));
  const dec = new Decoder(w, mobjsById, thinkers);
  for (const m of data.mobjs) {
    const mo = mobjsById.get(m.id);
    const fields = dec.deref(m);
    Object.assign(mo, fields);
    mo.info = MOBJINFO[mo.type];
    mo.removed = false;
    if (!mo.ext) mo.ext = null;
    setThingPosition(w, mo);
    w.mobjs.add(mo);
  }
  // Restored objects keep their saved ids: new spawns must not reuse them.
  let maxId = 0;
  for (const id of mobjsById.keys()) if (id > maxId) maxId = id;
  reserveMobjIds(maxId);
  data.thinkers.forEach((t, i) => Object.assign(thinkers[i], dec.deref(t.f), { removed: false }));
  for (const t of thinkers) if (t instanceof FloorMove && typeof t.texture === 'number') t.texture = flat(t.texture);
  w.thinkers = data.thinkerOrder.map((o) => ('m' in o ? mobjsById.get(o.m) : thinkers[o.t])).filter(Boolean);
  for (const o of sectorRows) {
    if (o.soundtarget) L.sectors[o.$i].soundtarget = dec.deref(o.soundtarget);
    if (o.specialdata) L.sectors[o.$i].specialdata = dec.deref(o.specialdata);
  }
  for (const o of lineRows) if (o.specialdata) L.lines[o.$i].specialdata = dec.deref(o.specialdata);
  w.specials.activeplats = dec.deref(data.specials.activeplats) || [];
  w.specials.activeceilings = dec.deref(data.specials.activeceilings) || [];
  w.specials.buttons = dec.deref(data.specials.buttons) || [];
  for (const b of w.specials.buttons) if (b && typeof b.btexture === 'number') b.btexture = tex(b.btexture);
  if (ws.brainTargets) { w.brainTargets = dec.deref(ws.brainTargets); w.brainTargetOn = ws.brainTargetOn; }

  // Player
  Object.assign(player, dec.deref(data.player));
  player.cmd = new Player().cmd;
  player.damageDirs = [];
  if (player.mo) player.mo.player = player;
  player.mods.reload = player.mods.reload || null;
  game.skill = data.skill;
  game.episode = data.episode;
  game.map = data.map;
  game.player = player;
  return w;
}

// --- Persistence (localStorage slots) ----------------------------------------

const KEY = (slot) => `doom-modern-save-${slot}`;

export function writeSlot(slot, data) {
  try {
    localStorage.setItem(KEY(slot), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function readSlot(slot) {
  try {
    const raw = localStorage.getItem(KEY(slot));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function slotSummaries(count = 8) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = readSlot(i);
    out.push(d ? { description: d.description || d.mapName, mapName: d.mapName, date: d.date } : null);
  }
  return out;
}
