#!/usr/bin/env node
// Chinatown gameplay checks: the custom specials (portal 900, ladder 902,
// breakable 903, objective use/hold 904, trigger 905, fall 906, sector
// water 64/65 and extraction 66), the zombie director, the helicopter and
// the whole objective chain of tools/ct/SPEC.md section 9 up to the finale,
// plus the mission-failed restart and savegame lock-step mid hold-out.
//
// The chain runs on the test PWAD (tools/ct/test-map.mjs, built if
// missing) and, when it exists, on the real assets/wads/chinatown.wad (or
// the files given). It plays each stage by teleporting the player to the
// objective lines (found by special and tag) and pressing / holding use or
// walking over triggers; where a real map's geometry gets in the way it
// falls back to firing the same hooks directly. The detailed special checks
// need the test map's known layout and run on it only.
// Usage: node tools/ct/test-ct.mjs [pwad ...]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Wad, WadStack, detectGameMode } from '../../src/wad/wad.js';
import { Resources } from '../../src/game/resources.js';
import { Game } from '../../src/game/game.js';
import { DEFAULTS } from '../../src/settings.js';
import { MT, missingActions } from '../../src/game/tables.js';
import { PW } from '../../src/game/defs.js';
import { ML } from '../../src/game/mapdata.js';
import { radiusAttack } from '../../src/game/map.js';
import { pointOnLineSide } from '../../src/game/maputl.js';
import { CT_MAP } from '../../src/game/ct/info.js';
import { KEY_ITEM } from '../../src/game/ct/items.js';
import { OBJECTIVES, STAGE } from '../../src/game/ct/chinatown.js';
import '../../src/game/enemy.js';
import '../../src/game/weapons.js';
import '../../src/game/ct/zombies.js';

const root = new URL('../..', import.meta.url).pathname;
const testWad = path.join(root, 'build/ct/test/ct-test.wad');
const realWad = path.join(root, 'assets/wads/chinatown.wad');
if (!fs.existsSync(testWad)) execFileSync(process.execPath, [path.join(root, 'tools/ct/test-map.mjs'), testWad], { stdio: 'inherit' });
const wads = process.argv.slice(2).length ? process.argv.slice(2) : [testWad, ...(fs.existsSync(realWad) ? [realWad] : [])];

let failures = 0, checks = 0;
function check(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error(`  FAIL: ${msg}`); }
  return !!cond;
}
const section = (name) => console.log(`- ${name}`);
const T = 35;

const load = (file) => { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const settings = { values: structuredClone(DEFAULTS), get(k) { return this.values[k]; } };
const silent = { start() {}, stopOrigin() {}, stop() {} };
const idle = () => ({ forwardmove: 0, sidemove: 0, attack: false, use: false, weapon: -1, nextWeapon: 0 });

function setup(pwad) {
  const stack = new WadStack();
  stack.add(new Wad(load(path.join(root, 'assets/wads/doom1.wad')), 'doom1'));
  stack.add(new Wad(load(pwad), path.basename(pwad)));
  stack.add(new Wad(load(path.join(root, 'assets/wads/doomx-extras.wad')), 'extras'), { fallback: true });
  const res = new Resources(stack);
  res.init();
  const gamemode = detectGameMode(stack);
  return () => new Game({ stack, res, settings, gamemode, audio: silent });
}

// --- Driving the player ---------------------------------------------------------

function run(g, n, cmd = idle, until = null) {
  for (let i = 0; i < n; i++) {
    if (g.state !== 'level') return i;
    g.tick(typeof cmd === 'function' ? cmd(i) : { ...cmd });
    if (until && until()) return i + 1;
  }
  return n;
}

const script = (g) => g.world.ct.script;
const st = (g) => script(g).s;
const lines = (g, special, tag) => g.world.level.lines.filter((l) => l.special === special && l.tag === tag);
const things = (g, type) => [...g.world.mobjs].filter((m) => m.type === type);
const mid = (l) => ({ x: (l.v1.x + l.v2.x) / 2, y: (l.v1.y + l.v2.y) / 2 });

function teleport(g, x, y, angle) {
  script(g).teleport(g.player, x, y, angle);
}

// Stand `d` units in front of a line, facing it.
function faceLine(g, line, d = 36) {
  const m = mid(line);
  const len = line.length || 1;
  const nx = line.dy / len, ny = -line.dx / len;
  teleport(g, m.x + nx * d, m.y + ny * d, Math.atan2(-ny, -nx));
}

// Press use on a line; if the press didn't reach it (a real map's
// geometry), use it through the hook.
function useLine(g, line, changed) {
  faceLine(g, line);
  run(g, 1, { ...idle(), use: true });
  run(g, 1);
  if (changed && !changed()) {
    g.world.ct.useLine(g.player.mo, line, 0);
    run(g, 1);
    return 'hook';
  }
  return 'press';
}

// Zombies within r of (x, y) gone (they shove the player off a hold).
function clearZombies(g, x, y, r = 768) {
  for (const m of [...g.world.mobjs]) {
    if (m.info.ct && m.info.ct.zombie && Math.hypot(m.x - x, m.y - y) < r) g.world.removeMobj(m);
  }
}

// Hold use on a line for n tics (the hook every tic if facing fails).
function holdLine(g, line, n) {
  faceLine(g, line);
  const w = g.world;
  const m = mid(line);
  clearZombies(g, m.x, m.y);
  let viaHook = false;
  for (let i = 0; i < n && g.state === 'level'; i++) {
    g.tick({ ...idle(), use: true });
    if (i === 1 && w.ct.s.holdLine !== line.index) viaHook = true;
    if (viaHook) script(g).hold(line, g.player, i);
  }
  run(g, 2);
  return viaHook ? 'hook' : 'press';
}

// Walk over a trigger line from its front side; fire the hook if blocked.
function crossLine(g, line, done) {
  faceLine(g, line, 24);
  const p = g.player;
  const before = pointOnLineSide(p.mo.x, p.mo.y, line);
  run(g, 24, () => ({ ...idle(), forwardmove: 25 }), () => pointOnLineSide(p.mo.x, p.mo.y, line) !== before);
  run(g, 1);
  if (done && !done()) {
    g.world.ct.crossLine(line, 0, p.mo);
    run(g, 1);
    return 'hook';
  }
  return 'walk';
}

// Pick up a key item by standing on it.
function pickUp(g, type, index) {
  const it = things(g, type)[0];
  if (!check(it, `key item ${index} on the map`)) return false;
  teleport(g, it.x, it.y);
  g.world.tryMove(g.player.mo, g.player.mo.x, g.player.mo.y); // touch it
  run(g, 3);
  return check(g.player.keyItems[index], `key item ${index} picked up`);
}

function stageIs(g, k, what) {
  return check(st(g).stage === k, `${what}: stage ${st(g).stage}, wanted ${k}`);
}

// --- The objective chain (any map with the SPEC tags) ---------------------------------

function chain(g, label) {
  const w = g.world;
  const ct = w.ct;
  const s = () => st(g);
  const p = g.player;
  p.cheats |= 2; // god mode: the director's waves are real
  const how = [];
  check(ct && ct.script, `${label}: map script attached`);
  check(script(g).hud().objective === OBJECTIVES[1], `${label}: first objective "${OBJECTIVES[1]}"`);
  check(ct.s.ladderOff.includes(80), `${label}: roadblock ladder starts disabled`);
  check(things(g, MT.CT_IGAS).length <= 1 && things(g, MT.CT_ITOR).length <= 1, `${label}: one gas can and one blowtorch kept`);

  // 1. Escape the subway.
  for (const l of lines(g, 903, 50)) ct.damageLine(l, 1000, p.mo);
  check(lines(g, 903, 50).every((l) => !(l.flags & ML.BLOCKING)), `${label}: chain broken`);
  const b1 = lines(g, 904, 1)[0];
  if (b1) how.push(`904/1 ${useLine(g, b1, () => s().door1)}`);
  check(s().door1 && w.level.sectors.filter((x) => x.tag === 1).every((x) => x.specialdata || x.ceilingheight > x.floorheight), `${label}: elevator door opening`);
  const t130 = lines(g, 905, 130)[0];
  if (check(t130, `${label}: trigger 905/130`)) how.push(`905/130 ${crossLine(g, t130, () => s().stage >= 2)}`);
  stageIs(g, 2, `${label} after the subway`);
  check(script(g).hud().objective === OBJECTIVES[2], `${label}: objective 2 text`);

  // 2. Fuel for the generator.
  const gen = lines(g, 904, 2)[0], btn = lines(g, 904, 3)[0];
  useLine(g, btn, () => true);
  check(!s().gate, `${label}: gate button dead without power`);
  useLine(g, gen, () => true);
  check(!s().generator, `${label}: generator needs fuel`);
  pickUp(g, MT.CT_IGAS, KEY_ITEM.GAS);
  how.push(`904/2 ${useLine(g, gen, () => s().generator)}`);
  check(s().generator && !p.keyItems[KEY_ITEM.GAS], `${label}: generator running, gas can used`);
  how.push(`904/3 ${useLine(g, btn, () => s().gate)}`);
  check(s().gate === 1, `${label}: arch gate rolling up`);
  const gateSec = w.level.sectors.find((x) => x.tag === 2);
  const t0 = w.leveltime;
  run(g, 25 * T, idle, () => s().stage >= 3);
  const secs = (w.leveltime - t0) / T;
  stageIs(g, 3, `${label} after the gate`);
  if (gateSec) check(secs > 15 && secs < 22, `${label}: gate took ${secs.toFixed(1)} s (about 20)`);
  check(s().dir.spawned > 0 || !things(g, MT.CT_ZSPAWN).length, `${label}: gate wave spawned (${s().dir.spawned})`);

  // 3. Release the ladder.
  const ladder = lines(g, 902, 80)[0];
  if (ladder) {
    faceLine(g, ladder);
    run(g, 1, { ...idle(), use: true });
    run(g, 1);
    check(!p.climb, `${label}: ladder out of reach before the switch`);
  }
  const spawnedBefore = s().dir.spawned;
  how.push(`904/4 ${useLine(g, lines(g, 904, 4)[0], () => s().ladder)}`);
  check(s().ladder && !ct.s.ladderOff.includes(80), `${label}: ladder released`);
  const door4 = w.level.sectors.find((x) => x.tag === 4);
  useLine(g, lines(g, 904, 5)[0], () => !door4 || !!door4.specialdata);
  if (door4) check(door4.specialdata || door4.ceilingheight > door4.floorheight, `${label}: shortcut door 4 opening`);
  if (ladder) {
    const top = ct.ladderTop(80);
    faceLine(g, ladder);
    run(g, 1, { ...idle(), use: true });
    const climbing = !!p.climb;
    run(g, 12 * T, idle, () => !p.climb);
    if (check(climbing && top, `${label}: climbing ladder 80`)) {
      check(Math.hypot(p.mo.x - top.x, p.mo.y - top.y) < 1 && p.mo.subsector.sector.tag === 80, `${label}: on the roadblock deck`);
    }
  }
  run(g, 2 * T);
  check(s().dir.spawned > spawnedBefore || !things(g, MT.CT_ZSPAWN).length, `${label}: ladder wave spawned`);
  const t131 = lines(g, 905, 131)[0];
  if (check(t131, `${label}: trigger 905/131`)) how.push(`905/131 ${crossLine(g, t131, () => s().stage >= 4)}`);
  stageIs(g, 4, `${label} on the deck`);

  // 4. Through the sewers.
  const l81 = lines(g, 902, 81)[0];
  if (check(l81, `${label}: ladder 902/81`)) {
    faceLine(g, l81);
    run(g, 1, { ...idle(), use: true });
    run(g, 15 * T, idle, () => !p.climb);
    const top = ct.ladderTop(81);
    check(top && Math.hypot(p.mo.x - top.x, p.mo.y - top.y) < 1, `${label}: up the sewer exit ladder`);
  }
  const t132 = lines(g, 905, 132)[0];
  if (check(t132, `${label}: trigger 905/132`)) how.push(`905/132 ${crossLine(g, t132, () => s().stage >= 5)}`);
  stageIs(g, 5, `${label} out of the sewers`);
  const door5 = w.level.sectors.find((x) => x.tag === 5);
  useLine(g, lines(g, 904, 6)[0], () => !door5 || !!door5.specialdata);
  if (door5) check(door5.specialdata || door5.ceilingheight > door5.floorheight, `${label}: shortcut door 5 opening`);

  // 5. Weld and crank.
  const lock = lines(g, 904, 7)[0], crank = lines(g, 904, 8)[0];
  holdLine(g, lock, T);
  check(s().weld === 0, `${label}: no welding without a blowtorch`);
  pickUp(g, MT.CT_ITOR, KEY_ITEM.TORCH);
  how.push(`904/7 ${holdLine(g, lock, 5 * T)}`);
  const half = s().weld;
  check(half >= 5 * T - 2 && half <= 5 * T && !s().welded, `${label}: weld progress ${half} after 5 s`);
  check(script(g).hud().progress === null, `${label}: no bar once use is let go`);
  run(g, T);
  check(s().weld === half, `${label}: weld progress kept`);
  holdLine(g, lock, 8 * T);
  check(s().welded && !p.keyItems[KEY_ITEM.TORCH], `${label}: lock cut after 12 s in all`);
  const gate6 = w.level.sectors.filter((x) => x.tag === 6);
  how.push(`904/8 ${holdLine(g, crank, 4 * T)}`);
  const open4 = s().gateOpen;
  check(open4 > 0.4 && open4 < 0.6, `${label}: crank half way after 4 s (${open4.toFixed(2)})`);
  run(g, 2 * T);
  check(s().gateOpen < open4, `${label}: gate sinks when the crank is let go`);
  holdLine(g, crank, 9 * T);
  check(s().gateOpen > 0.99, `${label}: gate fully open after about 8 s of cranking`);
  if (gate6.length) {
    const c = script(g).centre(gate6);
    teleport(g, c.x, c.miny - 40, Math.PI / 2);
    run(g, 2 * T, () => ({ ...idle(), forwardmove: 25 }), () => s().stage >= 6);
  }
  if (s().stage < 6) {
    const t133 = lines(g, 905, 133)[0];
    if (t133) crossLine(g, t133, () => s().stage >= 6);
  }
  stageIs(g, 6, `${label} through the weld gate`);

  // 6. Power the radio and call.
  const door7 = w.level.sectors.find((x) => x.tag === 7);
  for (const l of lines(g, 903, 55)) ct.damageLine(l, 1000, p.mo);
  if (door7) check(door7.specialdata || door7.ceilingheight > door7.floorheight, `${label}: boards 55 broken, door 7 opening`);
  const socket = lines(g, 904, 9)[0], radio = lines(g, 904, 10)[0];
  useLine(g, radio, () => true);
  check(s().stage === 6, `${label}: radio dead before the socket`);
  pickUp(g, MT.CT_IPLG, KEY_ITEM.PLUG);
  how.push(`904/9 ${useLine(g, socket, () => s().socket)}`);
  check(s().socket && !p.keyItems[KEY_ITEM.PLUG], `${label}: socket powered`);
  how.push(`904/10 ${useLine(g, radio, () => s().stage === STAGE.HOLDOUT)}`);
  check(s().stage === STAGE.HOLDOUT && s().done.slice(1).every(Boolean), `${label}: radio called, all six objectives done`);
  check(/60 seconds/.test(script(g).hud().center.text), `${label}: "${script(g).hud().center.text}"`);
  return how;
}

// The hold-out, the helicopter and getting aboard (or not).
function extraction(g, label, board) {
  const s = () => st(g);
  const w = g.world;
  const hud0 = script(g).hud();
  check(hud0.countdown && hud0.countdown.label === 'RESCUE IN', `${label}: rescue countdown shown`);
  const spawned0 = s().dir.spawned;
  run(g, 61 * T, idle, () => s().stage === STAGE.EXTRACT);
  check(s().stage === STAGE.EXTRACT && s().heli && s().heli.mo, `${label}: helicopter after 60 s`);
  check(s().dir.spawned > spawned0, `${label}: hold-out waves (${s().dir.spawned - spawned0} zombies)`);
  check(script(g).director.aliveCount() <= 40, `${label}: wave zombies capped`);
  const heli = s().heli.mo;
  let maxStep = 0, px = heli.x, py = heli.y;
  run(g, 60 * T, () => {
    maxStep = Math.max(maxStep, Math.hypot(heli.x - px, heli.y - py));
    px = heli.x; py = heli.y;
    return idle();
  }, () => s().extract > 0);
  check(s().heli.phase === 'hover' && s().extract > 0, `${label}: helicopter hovering, extraction window open`);
  check(maxStep <= 13, `${label}: smooth flight (largest step ${maxStep.toFixed(1)})`);
  const zone = script(g).zoneCentre();
  check(zone && Math.hypot(heli.x - s().heli.path.at(-1).x, heli.y - s().heli.path.at(-1).y) < 16, `${label}: hovering over the last path node`);
  check(script(g).hud().countdown.label === 'EXTRACTION', `${label}: extraction countdown shown`);
  if (board) {
    teleport(g, zone.x, zone.y);
    run(g, 3 * T);
    check(g.state === 'finale' && s().result === 1, `${label}: aboard, straight to the finale text (${g.state})`);
    return;
  }
  run(g, 31 * T);
  check(s().result === -1 && script(g).hud().failed, `${label}: rescue missed`);
  check(w.ct.hud().objective === 'Rescue is gone.', `${label}: failure objective text`);
  run(g, 9 * T);
  check(!s().heli || s().heli.phase === 'gone', `${label}: helicopter gone`);
  run(g, 1, { ...idle(), use: true });
  run(g, 1);
  check(g.world !== w && g.world.ct.script.s.stage === 1, `${label}: use restarts the level`);
}

// --- Specials on the test map's known layout --------------------------------------

function specials(makeGame) {
  const g = makeGame();
  g.newGame(1, 2, CT_MAP);
  const w = g.world;
  const ct = w.ct;
  const p = g.player;
  p.cheats |= 2;

  section('portal 900');
  const A = lines(g, 900, 100).find((l) => l.v1.x < 1000);
  const B = ct.portals.get(A);
  check(A && B, 'portal pair 100');
  teleport(g, 256, 410, Math.PI / 2);
  run(g, 20, () => ({ ...idle(), forwardmove: 25 }), () => p.mo.x > 1000);
  check(p.mo.x > 2040 && p.mo.y > 128 && p.mo.y < 256, `walked through to the annex (${p.mo.x.toFixed(0)},${p.mo.y.toFixed(0)})`);
  check(Math.abs(p.mo.x - 2176) < 2, `same fraction along the partner (x ${p.mo.x.toFixed(1)})`);
  check(Math.abs(p.mo.angle - Math.PI / 2) < 1e-9, 'facing kept (parallel lines)');
  check(Math.hypot(p.mo.x - p.mo.px, p.mo.y - p.mo.py) < 20, 'interpolation continues in the new frame');
  p.mo.angle = 3 * Math.PI / 2;
  run(g, 30, () => ({ ...idle(), forwardmove: 25 }), () => p.mo.x < 1000);
  check(p.mo.x < 400 && p.mo.y < 448, `and back into the subway corridor (${p.mo.x.toFixed(0)},${p.mo.y.toFixed(0)})`);
  // A zombie follows the player through.
  const z = [...w.mobjs].find((m) => m.type === MT.CT_ZCV1);
  teleport(g, 2176, 200, 0);
  const place = (mo, x, y) => { w.unsetThingPosition(mo); mo.x = x; mo.y = y; w.setThingPosition(mo); mo.z = mo.floorz; mo.saveInterp(); };
  place(z, 256, 400);
  z.target = p.mo;
  w.setMobjState(z, z.info.seestate);
  run(g, 20 * T, idle, () => z.x > 1000);
  check(z.x > 2000, `zombie followed through the portal (${z.x.toFixed(0)},${z.y.toFixed(0)})`);
  const pathed = z.ext && z.ext.path !== undefined;
  check(pathed, 'zombie used the portal-aware path search');

  section('breakable 903');
  const chainLine = lines(g, 903, 50)[0];
  teleport(g, 256, 250, Math.PI / 2);
  p.pitch = Math.atan((40 - p.shootZ()) / 134);
  let shots = 0;
  for (let i = 0; i < 400 && (chainLine.flags & ML.BLOCKING); i++) { g.tick({ ...idle(), attack: (i % 6) < 3 }); shots++; }
  p.pitch = 0;
  check(!(chainLine.flags & ML.BLOCKING), `pistol shots broke the chain (${shots} tics)`);
  check(w.res.textures[chainLine.front.midtexture].name === 'CTGATE2', 'gate texture now CTGATE2');
  const board = lines(g, 903, 51)[0];
  const bm = mid(board);
  teleport(g, bm.x - 30, bm.y, 0);
  for (let i = 0; i < 6 && (board.flags & ML.BLOCKING); i++) { run(g, 1, { ...idle(), melee: true }); run(g, 20); }
  check(!(board.flags & ML.BLOCKING) && w.res.textures[board.front.midtexture].name === 'CTBORD3', 'board 51 punched through (CTBORD3)');
  const glass = lines(g, 903, 56)[0];
  const gm = mid(glass);
  radiusAttack(w, { x: gm.x - 40, y: gm.y, z: 32, height: 0, subsector: w.pointInSubsector(gm.x - 40, gm.y) }, p.mo, 128);
  check(!(glass.flags & ML.BLOCKING) && w.res.textures[glass.front.midtexture].name === 'CTGLAS2', 'blast broke the window (CTGLAS2)');
  const plank = lines(g, 903, 54)[0];
  ct.damageLine(plank, 299, p.mo);
  check(ct.breakables.intact(plank) && ct.breakables.hp(plank) === 1, 'plank 54 at 1 of 300 HP');

  section('water 64, deep water 65, fall 906, extraction 66');
  for (const m of [...w.mobjs]) if (m.info.ct && m.info.ct.zombie) w.removeMobj(m);
  p.cheats &= ~2;
  teleport(g, 1150, 900);
  const h0 = p.health;
  run(g, 70);
  check(h0 - p.health >= 8 && h0 - p.health <= 12, `sewer water hurts 4 every 32 tics (${h0 - p.health} in 70)`);
  check(ct.s.waterMessage && p.message === 'THE WATER BURNS YOUR SKIN', 'water message');
  p.powers[PW.IRONFEET] = 200;
  const h1 = p.health;
  run(g, 70);
  check(p.health === h1, 'rad suit protects from the water');
  p.powers[PW.IRONFEET] = 0;
  teleport(g, -384, 1500, Math.PI / 2);
  run(g, 30, () => ({ ...idle(), forwardmove: 25 }), () => p.playerstate !== 'live');
  check(p.playerstate === 'dead', 'walking into the bay over 906 kills');
  run(g, 30);
  run(g, 1, { ...idle(), use: true });
  run(g, 1);
  const w2 = g.world;
  check(w2 !== w && w2.ct.script.s.stage === 1, 'restart after drowning');
  teleport(g, -384, 1660);
  run(g, 5);
  check(g.player.playerstate === 'dead', 'deep water (65) kills');
  check(w2.ct.inExtractionZone({ subsector: w2.pointInSubsector(600, 1660) }), 'sector 66/tag 160 is the extraction zone');
}

// --- Save / load lock-step in the hold-out -------------------------------------------

function lockstep(makeGame, label) {
  const a = makeGame();
  a.newGame(1, 3, CT_MAP);
  a.player.cheats |= 2;
  a.world.ct.script.goto(7);
  run(a, 50 * T);
  const data = JSON.parse(JSON.stringify(a.save('ct')));
  const b = makeGame();
  b.restore(data);
  check(JSON.stringify(b.world.ct.script.state()) === JSON.stringify(a.world.ct.script.state()), `${label}: script state restored`);
  const sig = (g) => {
    const w = g.world;
    let h = 0;
    for (const m of w.mobjs) h += m.x * 1.3 + m.y * 0.7 + m.z + m.health + m.state;
    for (const s of w.level.sectors) h += s.floorheight + s.ceilingheight * 2 + s.lightlevel;
    return `${h.toFixed(4)} ${w.mobjs.size} ${w.rng.prndindex} ${JSON.stringify(w.ct.script.state())}`;
  };
  let same = true;
  for (let i = 0; i < 50 * T; i++) {
    const c = { ...idle(), forwardmove: i % 70 < 40 ? 25 : -25, attack: i % 30 < 5 };
    a.player.mo.angle += 0.01;
    b.player.mo.angle += 0.01;
    a.tick({ ...c });
    b.tick({ ...c });
    if (i % 35 === 0 && sig(a) !== sig(b)) { same = false; break; }
  }
  check(same && sig(a) === sig(b), `${label}: loaded game in lock-step through hold-out and helicopter`);
  check(b.world.ct.script.s.heli, `${label}: helicopter flying in both`);
}

// --- Main ---------------------------------------------------------------------------------

check(missingActions().length === 0, `unimplemented actions ${missingActions()}`);
for (const file of wads) {
  console.log(`== ${path.relative(root, file)}`);
  const makeGame = setup(file);
  const isTest = path.resolve(file) === path.resolve(testWad);
  if (isTest) specials(makeGame);

  section('objective chain');
  const g = makeGame();
  g.newGame(1, 2, CT_MAP);
  const how = chain(g, 'chain');
  console.log(`  played via: ${how.join(', ')}`);
  section('hold-out and extraction');
  const events = [];
  g.on('finale', (fin) => events.push(fin));
  extraction(g, 'rescue', true);
  check(events.length === 1 && events[0].custom && /helicopter/.test(events[0].text), 'the Chinatown finale text');
  if (g.state === 'finale') {
    g.finaleDone();
    check(g.state === 'title', 'then the title');
  }

  section('rescue missed');
  const f = makeGame();
  f.newGame(1, 2, CT_MAP);
  f.player.cheats |= 2;
  f.world.ct.script.goto(7);
  extraction(f, 'missed', false);

  section('debug goto');
  for (let k = 1; k <= 8; k++) {
    const d = makeGame();
    d.newGame(1, 2, CT_MAP);
    const state = d.world.ct.script.goto(k);
    const want = k <= 6 ? k : STAGE.HOLDOUT;
    check(state.stage === want && state.done.slice(0, Math.min(k, 7) - 1).every(Boolean), `goto(${k}): stage ${state.stage}`);
    run(d, 2);
    if (k === 8) {
      run(d, 2);
      check(d.world.ct.script.s.stage === STAGE.EXTRACT, 'goto(8): helicopter on its way');
    }
  }

  section('save/load lock-step');
  lockstep(makeGame, 'hold-out');
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
