// Save games: a generic object-graph serializer for the running level.
// Sectors, lines, sides, map objects, the player and sector thinkers are
// written as plain JSON with references encoded by index/id, then restored
// onto a freshly loaded copy of the same map.

import { Mobj } from './mobj.js';
import { MOBJINFO } from './tables.js';
import { setThingPosition } from './maputl.js';
import { World } from './world.js';
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
      totalkills: w.totalkills,
      totalitems: w.totalitems,
      totalsecret: w.totalsecret,
      brainTargets: w.brainTargets ? enc.ref(w.brainTargets) : null,
      brainTargetOn: w.brainTargetOn || 0,
    },
    sectors: w.level.sectors.map((s) => {
      const o = {};
      for (const f of SECTOR_FIELDS) o[f] = s[f];
      o.soundtarget = enc.ref(s.soundtarget);
      o.specialdata = enc.ref(s.specialdata);
      return o;
    }),
    lines: w.level.lines.map((l) => {
      const o = {};
      for (const f of LINE_FIELDS) o[f] = l[f];
      o.specialdata = enc.ref(l.specialdata);
      return o;
    }),
    sides: w.level.sides.map((s) => {
      const o = {};
      for (const f of SIDE_FIELDS) o[f] = s[f];
      return o;
    }),
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

// Builds a World from save data. `game` provides the WAD stack/resources.
export function loadGame(game, data) {
  if (!data || data.version !== SAVE_VERSION) throw new Error('incompatible save');
  const lumps = game.stack.mapLumps(data.mapName);
  if (!lumps) throw new Error(`map ${data.mapName} missing`);
  game.skill = data.skill;
  game.episode = data.episode;
  game.map = data.map;
  const player = new Player();
  game.player = player;
  const w = new World({
    game, res: game.res, settings: game.settings.values, mapName: data.mapName, episode: data.episode, map: data.map,
    commercial: game.commercial, gamemode: game.gamemode, skill: data.skill, player, lumps, audio: game.audio,
  });
  const ws = data.world;
  w.leveltime = ws.leveltime;
  w.gametic = ws.gametic;
  w.rng.prndindex = ws.prndindex;
  w.rng.rndindex = ws.rndindex;
  w.aiSeed = ws.aiSeed;
  w.totalkills = ws.totalkills;
  w.totalitems = ws.totalitems;
  w.totalsecret = ws.totalsecret;
  w.specials.initStatic();
  const L = w.level;
  data.sectors.forEach((o, i) => {
    const s = L.sectors[i];
    for (const f of SECTOR_FIELDS) s[f] = o[f];
    s.prevFloor = s.floorheight;
    s.prevCeil = s.ceilingheight;
  });
  data.lines.forEach((o, i) => { for (const f of LINE_FIELDS) L.lines[i][f] = o[f]; });
  data.sides.forEach((o, i) => { for (const f of SIDE_FIELDS) L.sides[i][f] = o[f]; });

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
  data.thinkers.forEach((t, i) => Object.assign(thinkers[i], dec.deref(t.f), { removed: false }));
  w.thinkers = data.thinkerOrder.map((o) => ('m' in o ? mobjsById.get(o.m) : thinkers[o.t])).filter(Boolean);
  data.sectors.forEach((o, i) => {
    L.sectors[i].soundtarget = dec.deref(o.soundtarget);
    L.sectors[i].specialdata = dec.deref(o.specialdata);
  });
  data.lines.forEach((o, i) => { L.lines[i].specialdata = dec.deref(o.specialdata); });
  w.specials.activeplats = dec.deref(data.specials.activeplats) || [];
  w.specials.activeceilings = dec.deref(data.specials.activeceilings) || [];
  w.specials.buttons = dec.deref(data.specials.buttons) || [];
  if (ws.brainTargets) { w.brainTargets = dec.deref(ws.brainTargets); w.brainTargetOn = ws.brainTargetOn; }

  // Player
  Object.assign(player, dec.deref(data.player));
  player.cmd = new Player().cmd;
  player.damageDirs = [];
  if (player.mo) player.mo.player = player;
  player.mods.reload = player.mods.reload || null;
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
