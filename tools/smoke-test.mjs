#!/usr/bin/env node
// Headless smoke test: runs every map in the IWAD with a scripted player
// (walking, shooting, using, switching weapons) and the full effects layer,
// then checks that a save restored mid-level stays in lock-step with the
// original. The Chinatown PWAD (assets/wads/chinatown.wad, or the file named
// by CT_WAD, e.g. build/ct/test/ct-test.wad from tools/ct/test-map.mjs) is
// layered on top when present and its CHINATWN map runs too.
// Usage: [CT_WAD=file.wad] node tools/smoke-test.mjs [wad] [secondsPerMap]

import { readFileSync, existsSync } from 'node:fs';
import { Wad, WadStack, detectGameMode } from '../src/wad/wad.js';
import { Resources } from '../src/game/resources.js';
import { Game } from '../src/game/game.js';
import { DEFAULTS } from '../src/settings.js';
import { createEffects } from '../src/fx/effects.js';
import { missingActions } from '../src/game/tables.js';
import { VoxelLibrary } from '../src/vox/library.js';
import '../src/game/enemy.js';
import '../src/game/weapons.js';
import '../src/game/ct/zombies.js';

const wadPath = process.argv[2] || new URL('../assets/wads/doom1.wad', import.meta.url).pathname;
const seconds = Number(process.argv[3] || 40);
const stack = new WadStack();
const load = (file) => { const b = readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
stack.add(new Wad(load(wadPath), 'iwad'));
const ctPath = process.env.CT_WAD || new URL('../assets/wads/chinatown.wad', import.meta.url).pathname;
if (existsSync(ctPath)) stack.add(new Wad(load(ctPath), 'chinatown'));
else if (process.env.CT_WAD) throw new Error(`CT_WAD ${ctPath} not found`);
try {
  stack.add(new Wad(readFileSync(new URL('../assets/wads/doomx-extras.wad', import.meta.url)).buffer, 'extras'), { fallback: true });
} catch {
  // optional
}
const res = new Resources(stack);
res.init();
// VOX=1 also builds the 3D monster models and runs the ragdolls.
if (process.env.VOX) res.voxels = new VoxelLibrary(res);
const missing = missingActions();
if (missing.length) {
  console.error('unimplemented actions:', missing);
  process.exit(1);
}
const settings = { values: structuredClone(DEFAULTS), get(k) { return this.values[k]; } };
const gamemode = detectGameMode(stack);
const silent = { start() {}, stopOrigin() {} };

function makeGame(withFx) {
  const g = new Game({ stack, res, settings, gamemode, audio: silent });
  if (withFx) g.fxFactory = (w) => createEffects(w, { view: {} });
  return g;
}

function cmd(i) {
  return {
    forwardmove: (i % 80) < 55 ? 50 : -25,
    sidemove: (i % 130) < 25 ? 40 : 0,
    attack: (i % 24) < 10,
    use: (i % 12) === 0,
    ads: (i % 300) > 200,
    reload: (i % 170) === 0,
    jump: (i % 90) === 0,
    crouch: (i % 400) > 380,
    sprint: (i % 200) < 60,
    melee: (i % 333) === 0,
    weapon: (i % 260) === 0 ? 1 + ((i / 260) % 6 | 0) : -1,
    nextWeapon: 0,
  };
}

// What a custom map spawned (Chinatown things by kind), checked at its start.
function customSummary(g) {
  const w = g.world;
  let zombies = 0, ct = 0;
  for (const m of w.mobjs) {
    if (m.info.ct && m.info.ct.zombie) zombies++;
    if (/^MT_CT_/.test(m.info.name)) ct++;
  }
  if (g.mapName() !== g.customMap || w.mapName !== g.customMap) throw new Error(`${g.customMap}: wrong map name`);
  return `title "${g.levelTitle()}"  zombies ${zombies}  chinatown things ${ct}  sky ${g.levelSky()}  music ${g.levelMusic()}`;
}

function signature(g) {
  const w = g.world;
  let h = 0;
  for (const m of w.mobjs) h += m.x * 1.3 + m.y * 0.7 + m.z + m.health + m.state;
  for (const s of w.level.sectors) h += s.floorheight + s.ceilingheight * 2 + s.lightlevel;
  // Chinatown's objective script state (ct/chinatown.js) must match too.
  const ct = w.ct && w.ct.script ? JSON.stringify(w.ct.script.state()) : '';
  return `${g.player.mo.x.toFixed(3)},${g.player.mo.y.toFixed(3)},${g.player.health},${w.mobjs.size},${h.toFixed(3)},${w.rng.prndindex}${ct}`;
}

// Chinatown: a second lock-step run through the radio hold-out (zombie
// director waves) and the helicopter's flight, saved half way.
function scriptLockstep(episode, map) {
  const a = makeGame(false);
  a.newGame(episode, 3, map);
  if (!a.world.ct || !a.world.ct.script) return null;
  a.player.cheats |= 2;
  a.world.ct.script.goto(7);
  for (let i = 0; i < 1750; i++) { a.player.mo.angle += 0.013; a.tick(cmd(i)); }
  const data = JSON.parse(JSON.stringify(a.save('smoke')));
  const b = makeGame(false);
  b.restore(data);
  for (let i = 1750; i < 3150; i++) {
    const c = cmd(i);
    a.player.mo.angle += 0.013;
    b.player.mo.angle += 0.013;
    a.tick({ ...c });
    b.tick({ ...c });
  }
  const s = a.world.ct.script.s;
  const same = a.state !== 'level' || b.state !== 'level' || signature(a) === signature(b);
  return { same, info: `hold-out waves ${s.dir.spawned}, helicopter ${s.heli ? s.heli.phase : 'none'}` };
}

let failures = 0;
// IWAD maps, then maps played by name (CHINATWN).
const maps = [...stack.mapNames().sort(), ...stack.customMapNames()];
for (const name of maps) {
  const em = /^E(\d)M(\d)$/.exec(name);
  const mm = /^MAP(\d\d)$/.exec(name);
  const episode = em ? +em[1] : 1;
  const map = em ? +em[2] : mm ? +mm[1] : name;
  const t0 = Date.now();
  try {
    const g = makeGame(true);
    g.newGame(episode, 3, map);
    const customInfo = g.customMap ? `  ${customSummary(g)}` : '';
    const p = g.player;
    p.cheats |= 2;
    for (let i = 0; i < 9; i++) p.weaponowned[i] = true;
    p.ammo = [200, 50, 300, 50];
    p.topOffMagazines();
    const tics = seconds * 35;
    for (let i = 0; i < tics; i++) {
      if (g.state !== 'level') break;
      p.mo.angle += 0.013;
      g.tick(cmd(i));
    }
    // Save / restore determinism (without the cosmetic fx layer).
    const a = makeGame(false);
    a.newGame(episode, 3, map);
    a.player.cheats |= 2;
    for (let i = 0; i < 700; i++) { a.player.mo.angle += 0.013; a.tick(cmd(i)); }
    const data = JSON.parse(JSON.stringify(a.save('smoke')));
    const b = makeGame(false);
    b.restore(data);
    for (let i = 700; i < 1400; i++) {
      const c = cmd(i);
      a.player.mo.angle += 0.013;
      b.player.mo.angle += 0.013;
      a.tick({ ...c });
      b.tick({ ...c });
    }
    let same = a.state !== 'level' || b.state !== 'level' || signature(a) === signature(b);
    const extra = g.customMap ? scriptLockstep(episode, map) : null;
    let extraInfo = '';
    if (extra) {
      same = same && extra.same;
      extraInfo = `  objectives ${extra.same ? 'deterministic' : 'DIVERGED'} (${extra.info})`;
    }
    if (!same) failures++;
    const fx = g.world && g.world.fx;
    console.log(`${name.padEnd(6)} ok  ${String(Date.now() - t0).padStart(5)} ms  kills ${p.killcount}/${g.world ? g.world.totalkills : '?'}`
      + `  decals ${fx ? fx.decals.list.length : 0}  gibs ${fx ? fx.gibs.length : 0}${fx && fx.vox ? `  ragdolls ${fx.vox.ragdolls.size}` : ""}  save/load ${same ? 'deterministic' : 'DIVERGED'}${customInfo}${extraInfo}`);
  } catch (e) {
    failures++;
    console.log(`${name.padEnd(6)} FAILED: ${e.stack}`);
  }
}
if (failures) {
  console.error(`${failures} map(s) failed`);
  process.exit(1);
}
console.log('all maps passed');
