#!/usr/bin/env node
// Engine checks for Chinatown on the test PWAD (tools/ct/test-map.mjs, built
// here if missing) layered over the shareware IWAD: texture/flat/sprite
// merging, fullbright and animated surfaces, the new thing types, zombie
// melee, head shots and infighting, key items, and the custom map flow
// (title, sky, music, saves, exit -> stats -> finale -> title).
// Usage: node tools/ct/test-engine.mjs [pwad]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Wad, WadStack } from '../../src/wad/wad.js';
import { Resources } from '../../src/game/resources.js';
import { Game } from '../../src/game/game.js';
import { DEFAULTS } from '../../src/settings.js';
import { MT, SPR, MOBJINFO, DOOMEDNUM, missingActions } from '../../src/game/tables.js';
import { SPRNAMES } from '../../src/game/info.js';
import { HIT_ZONES } from '../../src/game/weaponcfg.js';
import { VOX_TYPES } from '../../src/vox/voxelize.js';
import { CT_MAP, CT_ZOMBIES, CT_DECORATIONS, CT_KEY_ITEMS, CT_MARKERS, CT_SPRNAMES } from '../../src/game/ct/info.js';
import { KEY_ITEM } from '../../src/game/ct/items.js';
import { setThingPosition, unsetThingPosition } from '../../src/game/maputl.js';
import '../../src/game/enemy.js';
import '../../src/game/weapons.js';
import '../../src/game/ct/zombies.js';

const root = new URL('../..', import.meta.url).pathname;
const pwad = process.argv[2] || path.join(root, 'build/ct/test/ct-test.wad');
if (!fs.existsSync(pwad)) execFileSync(process.execPath, [path.join(root, 'tools/ct/test-map.mjs'), pwad], { stdio: 'inherit' });

let failures = 0, checks = 0;
function check(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error(`  FAIL: ${msg}`); }
}
const section = (name) => console.log(`- ${name}`);

const load = (file) => { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const iwadOnly = new WadStack();
iwadOnly.add(new Wad(load(path.join(root, 'assets/wads/doom1.wad')), 'doom1'));
const stack = new WadStack();
stack.add(new Wad(load(path.join(root, 'assets/wads/doom1.wad')), 'doom1'));
stack.add(new Wad(load(pwad), 'ct'));
stack.add(new Wad(load(path.join(root, 'assets/wads/doomx-extras.wad')), 'extras'), { fallback: true });
const base = new Resources(iwadOnly);
base.init();
const res = new Resources(stack);
res.init();
const settings = { values: structuredClone(DEFAULTS), get(k) { return this.values[k]; } };
const silent = { start() {}, stopOrigin() {} };
const makeGame = () => new Game({ stack, res, settings, gamemode: 'shareware', audio: silent });
const idle = () => ({ forwardmove: 0, sidemove: 0, attack: false, use: false, weapon: -1, nextWeapon: 0 });

section('tables');
check(missingActions().length === 0, `unimplemented actions ${missingActions()}`);
for (const n of CT_SPRNAMES) check(SPR[n] >= 138, `sprite ${n} appended after DOOM's`);
for (const z of CT_ZOMBIES) {
  const t = DOOMEDNUM.get(z.doomednum);
  check(t !== undefined && MOBJINFO[t].spawnhealth === z.health, `zombie ${z.doomednum}`);
  check(MOBJINFO[t].speed === z.speed * z.tics, `${z.spr} speed`);
  check(HIT_ZONES[z.spr] && HIT_ZONES[z.spr].headMult === 3, `${z.spr} head shots x3`);
  check(VOX_TYPES[z.spr] && VOX_TYPES[z.spr].kind === 'humanoid', `${z.spr} humanoid model`);
}
for (const d of [...CT_DECORATIONS, ...CT_KEY_ITEMS, ...CT_MARKERS]) check(DOOMEDNUM.has(d.doomednum), `doomednum ${d.doomednum}`);
for (const d of CT_DECORATIONS) {
  const info = MOBJINFO[DOOMEDNUM.get(d.doomednum)];
  check(!!(info.flags & 2) === d.solid && info.radius === d.radius, `${d.spr} solidity/radius`);
  if (d.rot) check(VOX_TYPES[d.spr] && VOX_TYPES[d.spr].ragdoll === false, `${d.spr} rigid model`);
}
check((MOBJINFO[MT.CT_PLNT].flags & 0x100) !== 0, 'lantern hangs from the ceiling');

section('textures, flats, sprites');
// The IWAD's textures keep their numbers and pixels; Chinatown's follow.
check(base.textures.every((t, i) => res.textures[i].name === t.name && res.textures[i].width === t.width), 'IWAD texture numbers unchanged');
let same = true;
for (const t of base.textures) {
  const a = base.images[t.id].img, b = res.images[res.textures[t.index].id].img;
  if (a.pixels.some((v, i) => v !== b.pixels[i] || a.mask[i] !== b.mask[i])) same = false;
}
check(same, 'IWAD texture pixels unchanged (PWAD PNAMES did not remap them)');
check(res.textures.length > base.textures.length && res.textureNum('CTBRK1') >= base.textures.length, 'CT textures appended');
check(res.textureByName.get('CTNSG1').fullbright && !res.textureByName.get('CTBRK1').fullbright, 'CTN textures fullbright');
check(res.flatByName.get('CFNLIT1').fullbright && !res.flatByName.get('CFASPH1').fullbright, 'CFN flats fullbright');
check(base.flats.every((f, i) => res.flats[i].name === f.name), 'IWAD flat numbers unchanged');
check(res.textureByName.get('CTGATE1').masked, 'fence texture masked');
for (const n of CT_SPRNAMES) check(res.sprites[SPR[n]] && res.sprites[SPR[n]].length > 0, `sprite ${n} installed`);
const zf = res.sprites[SPR.ZCV1];
check(zf.length === 12 && zf[0].rotate && zf[6].rotate && !zf[7].rotate && !zf[11].rotate, 'ZCV1 frames A-G rotated, H-L single');

section('level start');
const g = makeGame();
g.newGame(1, 2, CT_MAP);
let w = g.world;
check(g.customMap === CT_MAP && g.mapName() === CT_MAP && w.mapName === CT_MAP, 'custom map name');
check(g.mapName(1, 3) === 'E1M3', 'mapName(e, m) still gives ExMy');
check(g.levelTitle() === 'CHINATOWN' && g.levelSky() === 'CTSKY1' && g.levelMusic() === 'D_E1M5', 'title, sky, music fallback');
check(g.player.weaponowned[0] && g.player.weaponowned[1] && !g.player.weaponowned[2] && g.player.totalAmmo(0) === 50, 'pistol start: fists, pistol, 50 bullets');
const anims = w.specials.anims.filter((a) => !a.istexture && res.flats[a.basepic].name.startsWith('CF'));
check(anims.length === 2 && anims.every((a) => a.numpics === 3 && a.speed === 8), 'CFSEW/CFBAY animate every 8 tics');
const byType = (t) => [...w.mobjs].filter((m) => m.type === t);
for (const z of CT_ZOMBIES) check(byType(DOOMEDNUM.get(z.doomednum)).length > 0, `zombie ${z.spr} spawned`);
const nodes = byType(MT.CT_HELINODE).map((m) => m.spawnpoint.angle).sort();
check(nodes.join() === '0,1,2', 'heli nodes keep their order in spawnpoint.angle');
check(byType(MT.CT_ZSPAWN).length >= 3 && byType(MT.CT_LADDERTOP).length === 2, 'markers spawned');
check(byType(MT.CT_PLNT).every((m) => m.z === m.ceilingz - m.height), 'lanterns hang');
check(w.level.sectors.some((s) => s.special === 64) && w.level.lines.some((l) => l.special === 900), 'custom specials loaded untouched');

section('zombie melee');
const p = g.player;
const zomb = byType(MT.CT_ZCV1)[0];
const place = (mo, x, y) => { unsetThingPosition(w, mo); mo.x = x; mo.y = y; setThingPosition(w, mo); mo.z = mo.floorz; mo.saveInterp(); };
place(zomb, p.mo.x + 48, p.mo.y);
zomb.target = p.mo;
w.setMobjState(zomb, zomb.info.seestate);
let hurt = 0;
const health0 = p.health;
for (let i = 0; i < 140 && !hurt; i++) { g.tick(idle()); hurt = health0 - p.health; }
check(hurt >= 4 && hurt <= 12, `shambler claw damage ${hurt} in 4-12`);
// No infighting: hurt by another zombie, a zombie keeps its target.
const other = byType(MT.CT_ZCV2)[0];
zomb.threshold = 0;
w.damageMobj(zomb, other, other, 1);
check(zomb.target === p.mo, 'zombie ignores damage from other monsters');

section('head shot');
const z2 = byType(MT.CT_ZCV3)[0];
// A clear lane: other zombies step aside.
for (const m of w.mobjs) if (m.info.ct && m.info.ct.zombie && m !== z2 && Math.abs(m.x - 256) < 48 && m.y < 400) place(m, m.x < 256 ? 120 : 420, m.y);
place(p.mo, 256, 200);
p.mo.angle = Math.PI / 2;
place(z2, 256, 328);
w.setMobjState(z2, z2.info.spawnstate);
z2.flags |= 0x20; // ambush: keeps still until it sees the shot
p.pitch = Math.atan((z2.z + 50 - p.shootZ()) / 128);
let shot = null;
const realDamage = w.damageMobj.bind(w);
w.damageMobj = (target, inflictor, source, damage, hit) => {
  if (target === z2 && !shot) shot = { damage, hit, before: target.health };
  realDamage(target, inflictor, source, damage, hit);
  if (target === z2 && shot && shot.after === undefined) shot.after = target.health;
};
for (let i = 0; i < 12 && !shot; i++) g.tick({ ...idle(), attack: true });
w.damageMobj = realDamage;
check(shot && shot.hit && shot.hit.zone === 'head', `pistol shot hits the head (${shot && shot.hit && shot.hit.zone})`);
if (shot) check(shot.before - shot.after === Math.min(shot.before, Math.round(shot.damage * 3)), 'head shot does x3');

section('key items and saves');
const gas = byType(MT.CT_IGAS)[0];
place(p.mo, gas.x, gas.y - 40);
p.mo.angle = Math.PI / 2;
for (let i = 0; i < 20 && w.mobjs.has(gas); i++) g.tick({ ...idle(), forwardmove: 25 });
check(p.keyItems[KEY_ITEM.GAS] && !w.mobjs.has(gas) && /gas can/i.test(p.message || ''), 'gas can picked up');
const saved = JSON.parse(JSON.stringify(g.save('ct test')));
check(saved.customMap === CT_MAP && saved.mapName === CT_MAP, 'save records the custom map');
const g2 = makeGame();
g2.restore(saved);
check(g2.customMap === CT_MAP && g2.mapName() === CT_MAP && g2.player.keyItems[KEY_ITEM.GAS], 'load restores map and key items');
for (let i = 0; i < 200; i++) { g.tick(idle()); g2.tick(idle()); }
const sig = (gg) => [...gg.world.mobjs].map((m) => `${m.type}:${m.x.toFixed(3)},${m.y.toFixed(3)},${m.health}`).join(';') + gg.world.rng.prndindex;
check(sig(g) === sig(g2), 'restored game stays in lock-step');

section('exit, stats, finale, title');
const events = [];
g2.on('intermission', (s) => events.push(['intermission', s]));
g2.on('finale', (f) => events.push(['finale', f]));
g2.on('title', () => events.push(['title']));
g2.world.exitLevel(false);
g2.tick(idle());
const stats = events[0] && events[0][1];
check(g2.state === 'intermission' && stats && stats.custom && stats.next === null && stats.title === 'CHINATOWN', 'exit shows the stats, no next map');
g2.advance();
const fin = events.find((e) => e[0] === 'finale');
check(g2.state === 'finale' && fin && fin[1].custom && fin[1].text.length > 50, 'then the finale text');
g2.finaleDone();
check(g2.state === 'title', 'then the title');

section('death restart and vanilla maps');
const g3 = makeGame();
g3.newGame(1, 2, CT_MAP);
g3.player.keyItems[KEY_ITEM.PLUG] = true;
g3.player.playerstate = 'reborn';
g3.tick(idle());
check(g3.mapName() === CT_MAP && g3.world.mapName === CT_MAP && !g3.player.keyItems[KEY_ITEM.PLUG], 'restart after death replays the custom map, items lost');
g3.newGame(1, 2, 1);
check(g3.customMap === null && g3.mapName() === 'E1M1' && g3.levelTitle() === 'E1M1: Hangar' && g3.levelSky() === 'SKY1', 'a DOOM map after it is plain E1M1');
check(stack.customMapNames().join() === CT_MAP && !stack.mapNames().includes(CT_MAP), 'map lists');

console.log(`${checks - failures}/${checks} checks passed (${SPRNAMES.length} sprites, ${res.textures.length} textures, ${res.flats.length} flats)`);
if (failures) process.exit(1);
