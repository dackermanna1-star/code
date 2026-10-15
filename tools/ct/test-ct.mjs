#!/usr/bin/env node
// Chinatown gameplay checks: the custom specials (portal 900, ladder 902,
// breakable 903, objective use/hold 904, trigger 905, fall 906, sector
// water 64/65 and extraction 66), the zombie director, the helicopter and
// the whole objective chain of tools/ct/SPEC.md section 9 up to the finale,
// plus the mission-failed restart, the level-start rolls, looping sounds
// across saves and the ending, and savegame lock-step mid hold-out.
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
import { PW, ONFLOORZ } from '../../src/game/defs.js';
import { ML } from '../../src/game/mapdata.js';
import { radiusAttack, mapState } from '../../src/game/map.js';
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
  return (audio = silent) => new Game({ stack, res, settings, gamemode, audio });
}

// Keeps track of looping sounds the way AudioSystem does (one sound per
// origin and channel; a new world silences the old world's sounds), wired
// to the game like app.js does it on level start.
function loopAudio() {
  const a = {
    voices: [], world: null,
    start(origin, name, opts = {}) {
      if (!name) return;
      const channel = opts.channel || 'default';
      a.voices = a.voices.filter((v) => !(origin && v.origin === origin && v.channel === channel));
      if (opts.loop) a.voices.push({ origin, name, channel });
    },
    stop(origin, channel) { a.voices = a.voices.filter((v) => !(v.origin === origin && (!channel || v.channel === channel))); },
    stopOrigin() {},
    setWorld(w) {
      if (!w) a.voices = [];
      else if (w !== a.world) a.voices = a.voices.filter((v) => !v.origin);
      a.world = w;
    },
    loops() { return a.voices.map((v) => v.name).sort().join(','); },
  };
  return a;
}
const SEED = 1; // the chain's level-start rolls (any seed plays through)

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
function clearZombies(g, x, y, r = Infinity) {
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
    const held = w.ct.s.holdLine >= 0 ? w.level.lines[w.ct.s.holdLine] : null;
    if (i === 1 && (!held || held.tag !== line.tag)) viaHook = true;
    if (viaHook) script(g).hold(line, g.player, i);
  }
  run(g, 2);
  return viaHook ? 'hook' : 'press';
}

// The longest passable line of a trigger tag (a real map splits them).
function trigger(g, tag) {
  const list = lines(g, 905, tag).filter((l) => !(l.flags & ML.BLOCKING));
  return list.sort((a, b) => b.length - a.length)[0] || lines(g, 905, tag)[0];
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
  const t130 = trigger(g, 130);
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
  const t131 = trigger(g, 131);
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
  const t132 = trigger(g, 132);
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
  const kept = script(g).hud().progress;
  check(kept && kept.idle && Math.abs(kept.frac - half / (12 * T)) < 1e-9, `${label}: kept weld progress shown (dimmed) at the padlock`);
  teleport(g, p.mo.x - 300 * Math.cos(p.mo.angle), p.mo.y - 300 * Math.sin(p.mo.angle), p.mo.angle);
  run(g, 1);
  check(script(g).hud().progress === null, `${label}: no bar away from the padlock`);
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
    const t133 = trigger(g, 133);
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
  // No wave zombie pops up in plain view.
  const seen = new Set(s().dir.alive);
  let inView = 0;
  run(g, 61 * T, () => {
    for (const m of s().dir.alive) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (w.checkSight(g.player.mo, m)) inView++;
    }
    return idle();
  }, () => s().stage === STAGE.EXTRACT);
  check(inView === 0, `${label}: wave zombies spawned out of sight (${inView} of ${seen.size} in view)`);
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
  const zoneFloor = Math.max(...script(g).zoneSectors().map((x) => x.floorheight));
  check(heli.z - zoneFloor > 100, `${label}: hovering well above the zone's floor (${(heli.z - zoneFloor).toFixed(0)})`);
  if (board) {
    teleport(g, zone.x, zone.y);
    run(g, 1);
    check(g.state === 'finale' && s().result === 1, `${label}: aboard on reaching the zone, straight to the finale text (${g.state})`);
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
  g.newGame(1, 2, CT_MAP, SEED);
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
  const pathed = z.ext && z.ext.pathTic !== undefined;
  check(pathed, 'zombie used the portal-aware path search');

  section('portal 900 turned a quarter');
  const Q = lines(g, 900, 102);
  check(Q.length === 2 && ct.portals.get(Q[0]) === Q[1], 'portal pair 102');
  teleport(g, 3232, 120, Math.PI / 2);
  run(g, 30, () => ({ ...idle(), forwardmove: 25 }), () => p.mo.x > 3336);
  check(p.mo.x > 3400 && Math.abs(p.mo.y - 96) < 1, `out heading east at the same fraction (${p.mo.x.toFixed(1)},${p.mo.y.toFixed(1)})`);
  check(Math.abs(Math.sin(p.mo.angle)) < 1e-9 && Math.cos(p.mo.angle) > 0, `turned with the seam (angle ${p.mo.angle.toFixed(3)})`);
  check(p.mo.momx > 0 && Math.abs(p.mo.momy) < 1e-6, `momentum turned east (${p.mo.momx.toFixed(2)},${p.mo.momy.toFixed(2)})`);
  // Sprints grazing a corridor wall at the seam: the move is split, its
  // first half slides through, and the second half must turn too. Drifting
  // right (east wall) comes out drifting south of where it crossed, drifting
  // left (west wall) north of it, never the other way.
  const grazeBad = [];
  for (const [x0, y0, dx, dy, ok] of [
    [3305, 150, 6, 24, (m) => m.y < 128 - (3305 - 3200) + 1],
    [3308, 150, 3, 24, (m) => m.y < 128 - (3308 - 3200) + 1],
    [3217, 180, -14, 28, (m) => m.y > 114],
    [3217, 176, -14, 24, (m) => m.y > 114],
  ]) {
    teleport(g, x0, y0, Math.PI / 2);
    p.mo.momx = dx; p.mo.momy = dy;
    for (let i = 0; i < 6 && p.mo.x < 3336; i++) run(g, 1);
    run(g, 1);
    if (!(p.mo.x > 3400 && ok(p.mo) && mapState.portal === null)) grazeBad.push(`${x0},${y0} ${dx},${dy}: ${p.mo.x.toFixed(1)},${p.mo.y.toFixed(1)}`);
  }
  check(!grazeBad.length, `sprints grazing the seam's walls turn all the way through ${grazeBad.join('; ')}`);

  section('no clawing through intact breakables');
  {
    // Only the subway's zombies (behind the gate) stay.
    for (const m of [...w.mobjs]) if (m.info.ct && m.info.ct.zombie && !(m.y < 384 && m.x > 0 && m.x < 512)) w.removeMobj(m);
    const zb = [...w.mobjs].find((m) => m.type === MT.CT_ZCV2 && m.health > 0);
    teleport(g, 256, 404, 3 * Math.PI / 2);
    place(zb, 256, 352);
    zb.target = p.mo;
    w.setMobjState(zb, zb.info.seestate);
    p.cheats &= ~2;
    const h = p.health;
    run(g, 4 * T);
    check(p.health === h, `a zombie at the chained gate can't reach through it (health ${h} -> ${p.health})`);
    p.cheats |= 2;
    // Out of the way of the shots at the gate.
    for (const m of [...w.mobjs]) if (m.info.ct && m.info.ct.zombie) w.removeMobj(m);
  }

  section('breakable 903');
  const gate = lines(g, 903, 50);
  const br = ct.breakables;
  check(gate.length === 3 && gate.every((l) => br.head(l) === br.head(gate[0])), 'the three gate segments are one breakable');
  ct.damageLine(gate[2], 20, p.mo);
  check(gate.every((l) => br.hp(l) === 30), 'a hit on one segment wears down the whole gate');
  const chainLine = gate[1];
  teleport(g, 256, 250, Math.PI / 2);
  p.pitch = Math.atan((40 - p.shootZ()) / 134);
  let shots = 0;
  for (let i = 0; i < 400 && (chainLine.flags & ML.BLOCKING); i++) { g.tick({ ...idle(), attack: (i % 6) < 3 }); shots++; }
  p.pitch = 0;
  check(!(chainLine.flags & ML.BLOCKING), `pistol shots broke the chain (${shots} tics)`);
  check(gate.every((l) => !(l.flags & ML.BLOCKING) && w.res.textures[l.front.midtexture].name === 'CTGATE2'), 'the whole gate broke (CTGATE2 on every segment)');
  const board = lines(g, 903, 51)[0];
  const bm = mid(board);
  teleport(g, bm.x - 30, bm.y, 0);
  for (let i = 0; i < 6 && (board.flags & ML.BLOCKING); i++) { run(g, 1, { ...idle(), melee: true }); run(g, 20); }
  check(!(board.flags & ML.BLOCKING) && w.res.textures[board.front.midtexture].name === 'CTBORD3', 'board 51 punched through (CTBORD3)');
  const glass = lines(g, 903, 56)[0];
  const gm = mid(glass);
  radiusAttack(w, { x: gm.x - 40, y: gm.y, z: 32, height: 0, subsector: w.pointInSubsector(gm.x - 40, gm.y) }, p.mo, 128);
  check(!(glass.flags & ML.BLOCKING) && w.res.textures[glass.front.midtexture].name === 'CTGLAS2', 'blast broke the window (CTGLAS2)');
  const pane2 = lines(g, 903, 56).find((l) => l !== glass);
  check(pane2 && br.intact(pane2) && (pane2.flags & ML.BLOCKING), 'a window apart from it, with the same tag, stays whole');
  const plank = lines(g, 903, 54)[0];
  ct.damageLine(plank, 299, p.mo);
  check(ct.breakables.intact(plank) && ct.breakables.hp(plank) === 1, 'plank 54 at 1 of 300 HP');

  section('ladder landing taken');
  {
    const l81 = lines(g, 902, 81)[0];
    const top = ct.ladderTop(81);
    const zl = w.spawnMobj(top.x, top.y, ONFLOORZ, MT.CT_ZCV1);
    zl.tics = -1; // stands there
    faceLine(g, l81);
    run(g, 1, { ...idle(), use: true });
    const climbing = !!p.climb;
    run(g, 15 * T, idle, () => !p.climb);
    check(climbing && !p.climb && zl.health > 0, `a zombie on the landing isn't telefragged (health ${zl.health})`);
    check(Math.hypot(p.mo.x - zl.x, p.mo.y - zl.y) >= p.mo.radius + zl.radius - 0.01 && p.mo.subsector.sector.tag === 81
      && Math.abs(p.mo.z - top.subsector.sector.floorheight) < 1, 'came off the ladder beside it, on the landing');
    w.removeMobj(zl);
  }

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

// --- Level-start rolls ----------------------------------------------------------------

function rolls(makeGame) {
  section('level-start rolls');
  const spots = (g, type) => g.world.level.mapthings.filter((t) => t.type === type);
  const seen = { gas: new Set(), torch: new Set(), sealed: new Set() };
  let probe = null, bad = [];
  for (let seed = 0; seed < 24; seed++) {
    const g = makeGame();
    g.newGame(1, 2, CT_MAP, seed);
    const sc = script(g);
    probe = probe || g;
    const gas = things(g, MT.CT_IGAS), torch = things(g, MT.CT_ITOR);
    if (gas.length > 1 || torch.length > 1) bad.push(`seed ${seed}: ${gas.length} gas cans, ${torch.length} blowtorches`);
    if (gas[0]) seen.gas.add(`${gas[0].x},${gas[0].y}`);
    if (torch[0]) seen.torch.add(`${torch[0].x},${torch[0].y}`);
    seen.sealed.add(sc.s.garageSealed);
    const garage = sc.sectors(8);
    if (sc.s.garageSealed && torch[0]) {
      const c = sc.centre(garage);
      const near = spots(g, 9042).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      if (near && near.x === torch[0].x && near.y === torch[0].y) bad.push(`seed ${seed}: garage shut on the blowtorch`);
    }
  }
  check(!bad.length, `one of each item kept, the garage never shut on the blowtorch ${bad.join('; ')}`);
  const n = (type) => spots(probe, type).length;
  check(n(9040) < 2 || seen.gas.size >= 2, `the gas can turns up in different spots (${seen.gas.size} of ${n(9040)})`);
  check(n(9042) < 2 || seen.torch.size >= 2, `so does the blowtorch (${seen.torch.size} of ${n(9042)})`);
  check(!script(probe).sectors(8).length || seen.sealed.size === 2, 'the welder garage is sometimes shut, sometimes open');
  // The same seed rolls the same; a restart rolls afresh; a save keeps it.
  const pick = (g) => `${things(g, MT.CT_IGAS).map((m) => `${m.x},${m.y}`)} ${things(g, MT.CT_ITOR).map((m) => `${m.x},${m.y}`)} ${script(g).s.garageSealed}`;
  const a = makeGame(), b = makeGame();
  a.newGame(1, 2, CT_MAP, 77);
  b.newGame(1, 2, CT_MAP, 77);
  check(pick(a) === pick(b) && a.world.rollSeed === 77, 'the same seed, the same rolls');
  const data = JSON.parse(JSON.stringify(a.save('rolls')));
  const c = makeGame();
  c.restore(data);
  check(c.rollSeed === a.rollSeed && c.world.rollSeed === a.world.rollSeed, 'a save keeps the seed');
  const seeds = new Set([a.rollSeed]);
  for (let k = 0; k < 3; k++) {
    a.world.damageMobj(a.player.mo, null, null, 10000);
    run(a, 40);
    run(a, 1, { ...idle(), use: true });
    run(a, 1);
    seeds.add(a.rollSeed);
  }
  check(seeds.size === 4 && a.world.rollSeed === a.rollSeed, 'every restart after death rolls with a new seed');
  c.world.damageMobj(c.player.mo, null, null, 10000);
  run(c, 40);
  run(c, 1, { ...idle(), use: true });
  run(c, 1);
  b.world.damageMobj(b.player.mo, null, null, 10000);
  run(b, 40);
  run(b, 1, { ...idle(), use: true });
  run(b, 1);
  check(c.rollSeed === b.rollSeed && pick(c) === pick(b), 'and a loaded game restarts with the same rolls as the original');
}

// --- Looping sounds: after a load, and silent once rescued ---------------------------

function loops(makeGame) {
  section('looping sounds');
  const audioA = loopAudio();
  const a = makeGame(audioA);
  a.on('levelStart', (w) => audioA.setWorld(w));
  a.newGame(1, 2, CT_MAP, SEED);
  a.player.cheats |= 2;
  script(a).goto(3);
  run(a, 5);
  check(audioA.loops() === 'genrun', `generator running (${audioA.loops()})`);
  const audioB = loopAudio();
  const b = makeGame(audioB);
  b.on('levelStart', (w) => audioB.setWorld(w));
  b.restore(JSON.parse(JSON.stringify(a.save('loops'))));
  run(b, 5);
  check(audioB.loops() === 'genrun', `a loaded game hums again (${audioB.loops()})`);
  script(a).goto(8);
  run(a, 60 * T, idle, () => st(a).extract > 0);
  check(audioA.loops() === 'genrun,heli', `generator and rotor (${audioA.loops()})`);
  const audioC = loopAudio();
  const c = makeGame(audioC);
  c.on('levelStart', (w) => audioC.setWorld(w));
  c.restore(JSON.parse(JSON.stringify(a.save('loops'))));
  run(c, 2);
  check(audioC.loops() === 'genrun,heli', `the helicopter is heard after a load (${audioC.loops()})`);
  const zone = script(a).zoneCentre();
  teleport(a, zone.x, zone.y);
  run(a, 2);
  check(a.state === 'finale' && audioA.loops() === '', `rescued: the loops stop for the finale (${audioA.loops() || 'none'})`);
}

// --- The helicopter on maps missing parts ------------------------------------------------

function extractionFallbacks(makeGame) {
  section('extraction fallbacks');
  const fresh = () => {
    const g = makeGame();
    g.newGame(1, 2, CT_MAP, SEED);
    g.player.cheats |= 2;
    return g;
  };
  const unzone = (g) => {
    for (const sec of g.world.level.sectors) if (sec.tag === 160 || sec.special === 66) { sec.tag = 0; sec.special = 0; }
    script(g).cache.clear();
  };
  // Neither path nodes nor a zone: nothing to wait for.
  const a = fresh();
  for (const m of things(a, MT.CT_HELINODE)) a.world.removeMobj(m);
  unzone(a);
  script(a).goto(8);
  run(a, 5);
  check(a.state === 'finale' && st(a).result === 1, `no helicopter path or zone: rescued when the hold-out ends (${a.state})`);
  // Path nodes but no zone: under the hovering helicopter will do.
  const b = fresh();
  unzone(b);
  script(b).goto(8);
  run(b, 60 * T, idle, () => st(b).extract > 0);
  const last = st(b).heli && st(b).heli.path.at(-1);
  check(last && st(b).extract > 0, 'no zone: the extraction window still opens');
  if (last) {
    teleport(b, last.x, last.y);
    run(b, 2);
    check(b.state === 'finale' && st(b).result === 1, 'and standing under the helicopter gets the player aboard');
  }
  // A roof too low over the last node for the hover height: it still
  // arrives (pressed under the roof) and the window opens.
  const c = fresh();
  const lastNode = things(c, MT.CT_HELINODE).sort((x, y) => x.spawnpoint.angle - y.spawnpoint.angle).at(-1);
  if (lastNode) {
    const sec = lastNode.subsector.sector;
    sec.ceilingheight = sec.floorheight + 150;
    script(c).goto(8);
    run(c, 60 * T, idle, () => st(c).extract > 0);
    check(st(c).extract > 0 && st(c).heli.phase === 'hover', `a low roof over the last node: hovering under it all the same (${st(c).heli && st(c).heli.phase})`);
  }
}

// --- Save / load lock-step in the hold-out -------------------------------------------

function lockstep(makeGame, label) {
  const a = makeGame();
  a.newGame(1, 3, CT_MAP, SEED);
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
  g.newGame(1, 2, CT_MAP, SEED);
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
  f.newGame(1, 2, CT_MAP, SEED);
  f.player.cheats |= 2;
  f.world.ct.script.goto(7);
  extraction(f, 'missed', false);

  section('debug goto');
  for (let k = 1; k <= 8; k++) {
    const d = makeGame();
    d.newGame(1, 2, CT_MAP, SEED);
    const state = d.world.ct.script.goto(k);
    const want = k <= 6 ? k : STAGE.HOLDOUT;
    check(state.stage === want && state.done.slice(0, Math.min(k, 7) - 1).every(Boolean), `goto(${k}): stage ${state.stage}`);
    run(d, 2);
    if (k === 8) {
      run(d, 2);
      check(d.world.ct.script.s.stage === STAGE.EXTRACT, 'goto(8): helicopter on its way');
    }
  }

  rolls(makeGame);
  loops(makeGame);
  if (isTest) extractionFallbacks(makeGame);

  section('save/load lock-step');
  lockstep(makeGame, 'hold-out');
}

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
