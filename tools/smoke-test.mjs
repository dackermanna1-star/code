#!/usr/bin/env node
// Headless smoke test: runs every map in the IWAD with a scripted player
// (walking, shooting, using, switching weapons) and the full effects layer,
// then checks that a save restored mid-level stays in lock-step with the
// original. Usage: node tools/smoke-test.mjs [wad] [secondsPerMap]

import { readFileSync } from 'node:fs';
import { Wad, WadStack, detectGameMode } from '../src/wad/wad.js';
import { Resources } from '../src/game/resources.js';
import { Game } from '../src/game/game.js';
import { DEFAULTS } from '../src/settings.js';
import { createEffects } from '../src/fx/effects.js';
import { missingActions } from '../src/game/tables.js';
import { VoxelLibrary } from '../src/vox/library.js';
import '../src/game/enemy.js';
import '../src/game/weapons.js';

const wadPath = process.argv[2] || new URL('../assets/wads/doom1.wad', import.meta.url).pathname;
const seconds = Number(process.argv[3] || 40);
const stack = new WadStack();
stack.add(new Wad(readFileSync(wadPath).buffer, 'iwad'));
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

function signature(g) {
  const w = g.world;
  let h = 0;
  for (const m of w.mobjs) h += m.x * 1.3 + m.y * 0.7 + m.z + m.health + m.state;
  for (const s of w.level.sectors) h += s.floorheight + s.ceilingheight * 2 + s.lightlevel;
  return `${g.player.mo.x.toFixed(3)},${g.player.mo.y.toFixed(3)},${g.player.health},${w.mobjs.size},${h.toFixed(3)},${w.rng.prndindex}`;
}

let failures = 0;
const maps = stack.mapNames().sort();
for (const name of maps) {
  const em = /^E(\d)M(\d)$/.exec(name);
  const mm = /^MAP(\d\d)$/.exec(name);
  const episode = em ? +em[1] : 1;
  const map = em ? +em[2] : +mm[1];
  const t0 = Date.now();
  try {
    const g = makeGame(true);
    g.newGame(episode, 3, map);
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
    const same = a.state !== 'level' || b.state !== 'level' || signature(a) === signature(b);
    if (!same) failures++;
    const fx = g.world && g.world.fx;
    console.log(`${name.padEnd(6)} ok  ${String(Date.now() - t0).padStart(5)} ms  kills ${p.killcount}/${g.world ? g.world.totalkills : '?'}`
      + `  decals ${fx ? fx.decals.list.length : 0}  gibs ${fx ? fx.gibs.length : 0}${fx && fx.vox ? `  ragdolls ${fx.vox.ragdolls.size}` : ""}  save/load ${same ? 'deterministic' : 'DIVERGED'}`);
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
