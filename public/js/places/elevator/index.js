// "The Elevator": everyone gets in at the lobby, the doors close, and the
// elevator goes up - stopping at ten random floors out of thirty, each one
// a little world of its own: a beach, a room where the floor is lava, a
// disco, a haunted hallway, a giant kitchen, the moon, a gas leak, a field
// of cows (and a UFO), a waiting room where nothing happens, the void...
// Step out and look around - but get back in before the doors close. Make
// it to the penthouse to finish the ride. Other passengers get on and off.
// (A user-made place in the style of the elevator games that came after
// 2008; it uses its own GUI and modern effects.)
import * as THREE from 'three';
import { GROUP } from '../../engine/Part.js';
import { pick as pickLine } from '../../engine/Bots.js';
import { Effects } from '../warzone/fx.js';
import { Flames, Weather } from '../disasters/effects.js';
import { Car } from './car.js';
import { UI } from './ui.js';
import { Env, FloorKit, V, rnd, pick } from './kit.js';
import { Rider, deathLine } from './bots.js';
import { Passenger, PASSENGERS } from './npc.js';
import * as A from './audio.js';
import { FLOORS, LOBBY, PENTHOUSE } from './floors/index.js';

const RIDE = 10, CLOSE_WARN = 5;
let E = null;

export default {
  build(world, ctx = {}) {
    world.useStaticGrid?.(24);
    E = { world, thumb: !!ctx.thumbnail };
    E.env = new Env(world);
    E.car = new Car(world);
    E.fx = new Effects(world);
    E.flames = new Flames(world);
    world.onUpdate((dt) => E.flames.update(dt));
    E.kill = () => {}; E.hurt = () => {}; E.say = () => {}; E.bonus = () => {}; E.shake = () => {};
    if (ctx.thumbnail) {
      // the place's picture: the lobby, the doors open
      const F = new FloorKit(E, LOBBY); F.def = LOBBY;
      LOBBY.build(F); F.flush(); E.env.apply(LOBBY.look);
      E.car.k = E.car.target = 1; E.car.update(0);
      E.car.setDisplay('G', null);
    }
    return { thumbnail: { cam: [14, 9, -46], look: [0, 6, -6] } };
  },

  setup(game) {
    const world = game.world;
    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    game.resize(window.innerWidth, window.innerHeight);
    if (world.shadows) { const c = world.sun.shadow.camera; c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.far = 500; c.updateProjectionMatrix(); }
    game.respawnTime = 4;
    game.forceFieldTime = 2;
    game.setStats(['Floors', 'Rides', 'Wipeouts']);
    Object.assign(E, {
      game, ui: new UI(game.gui.root), weather: new Weather(world),
      phase: 'open', cur: null, queue: [], label: 'G', num: 0, arrow: null, rides: 0, recent: [], log: [],
      passengers: [], shakeAmt: 0, bounces: 0, holds: 0, rideStart: 0,
    });
    world.onUpdate((dt) => E.weather.update(dt));
    E.kill = (ch, msg, pos) => { if (!ch?.alive || ch.forceField) return; ch.lastCause = msg; ch.breakJoints(null, pos || null); };
    E.hurt = (ch, dmg, msg) => { if (!ch?.alive || ch.forceField || dmg <= 0) return; ch.lastCause = msg; ch.takeDamage(dmg); if (ch.player?.isLocal && dmg > 2) E.hurtT = world.time; };
    E.say = (name, text, obj) => {
      game.gui.addChat({ name }, text);
      const get = typeof obj === 'function' ? obj : obj?.head ? () => (obj.alive === false ? null : obj.head) : obj?.isVector3 ? () => obj : null;
      if (get) E.ui.bubble('npc:' + name, text, get, { npc: true, name });
    };
    E.bonus = (ch, label, pts = 1) => {
      const p = ch?.player; if (!p) return;
      p.stats.Floors = (p.stats.Floors || 0) + pts; game.gui.onPlayersChanged();
      game.systemChat(`${p.name} got a bonus: ${label}! (+${pts})`);
      if (p.isLocal) { E.ui.toast(`★ ${label} <small>+${pts} floors</small>`, '#ffd84a', 'rgba(70,52,10,.9)'); A.bonus(); }
    };
    E.shake = (a) => { E.shakeAmt = Math.max(E.shakeAmt, a); };
    // where people appear: in the lobby while it's boarding, otherwise in the elevator
    let si = 0;
    game.pickSpawn = () => {
      if (E.cur?.def.lobby && E.phase === 'open') { const s = pick(LOBBY.spawns); return { position: V(s[0] + rnd(-2, 2), 0.1, s[1] + rnd(-2, 2)), yaw: Math.PI }; }
      return { position: E.car.spot(si++ % 12), yaw: 0 };
    };
    game.on('playerAdded', (p) => { if (p.isBot) p.brain = new Rider(game, p, E); });
    game.on('spawned', (p, ch) => {
      ch.ragdoll = false;
      if (p.isLocal) E.ui.setDead(null);
      if (p.brain) { if (E.cur?.def.lobby && E.phase === 'open') { p.brain.mode = 'lobby'; p.brain.boardAt = rnd(4, 14); } else p.brain.goHome(); }
    });
    game.on('died', (p) => {
      const msg = p.character?.lastCause || 'died';
      p.diedOn = E.cur?.F || null; // (no credit for the floor that got you)
      game.systemChat(`${p.name} ${msg}.`);
      if (p.isLocal) { E.ui.setDead(`You ${youMsg(msg)}.`, 'Respawning in the elevator...'); const f = E.log[E.log.length - 1]; if (f) f.died = true; }
      if (p.brain && Math.random() < 0.55) world.delay(rnd(1, 3), () => p.brain.say(deathLine()));
    });
    game.on('chatted', (p, text) => { E.ui.bubble('p' + p.id, text, () => (p.character?.alive ? p.character.headPosition : null)); });
    // the buttons by the doors
    game.on('mouseDown', (hit) => {
      if (hit?.part !== E.car.panel) return;
      const ch = game.localPlayer?.character;
      if (!ch?.alive || ch.rootPosition.distanceTo(E.car.panel.position) > 16) return;
      pressButton(E.car.buttonAt(hit.point));
    });
    // the camera doesn't go through walls (or you'd never see inside the elevator)
    const cam = game.camera, camUpdate = cam.update.bind(cam);
    cam.distance = 14;
    cam.update = (dt) => {
      camUpdate(dt);
      if (cam.fixed || cam.firstPerson) return;
      const c = world.camera, f = cam.focus, dir = c.position.clone().sub(f), L = dir.length();
      if (L < 0.5) return;
      dir.divideScalar(L);
      const hit = world.raycast(f, c.position.clone().addScaledVector(dir, 0.6), { mask: GROUP.WORLD });
      if (hit && hit.distance < L + 0.6) c.position.copy(f).addScaledVector(dir, Math.max(0.6, hit.distance - 0.6));
      if (E.shakeAmt > 0.01) { c.position.x += (Math.random() - 0.5) * E.shakeAmt * 0.6; c.position.y += (Math.random() - 0.5) * E.shakeAmt * 0.6; c.position.z += (Math.random() - 0.5) * E.shakeAmt * 0.3; }
    };
    window.__elev = { E, V: THREE.Vector3, debug: {
      next: (id) => { E.force = id; }, skip: () => { if (E.cur) E.cur.time = Math.min(E.cur.time, E.cur.F.t + 0.1); },
      floor: (id) => { E.force = id; if (E.cur) E.cur.time = E.cur.F.t + 0.05; },
      tp: (x, y, z) => { const ch = game.localPlayer?.character; if (ch) { ch.body.position.set(x, y + 3, z); ch.body.velocity.set(0, 0, 0); } },
      list: () => FLOORS.map((f) => f.id),
    } };
    E.travel = A.travel();
    A.playSong('car', 'muzak', 0.3);
    // start in the lobby with the doors open
    enterFloor(LOBBY, 'G');
    E.car.k = E.car.target = 1;
    openNow();
  },

  update(game, dt) {
    if (!E?.ui) return;
    const world = game.world;
    E.car.update(dt);
    director(dt);
    for (const ps of E.passengers) ps.update(dt);
    // people knocked flat get back up
    for (const ch of world.characters) if (ch.alive && ch.platformStand && ch.flungUntil && world.time > ch.flungUntil) { ch.platformStand = false; ch.flungUntil = null; }
    E.shakeAmt = Math.max(0, E.shakeAmt - dt * 2.2);
    mix(dt);
    hud(game, dt);
  },

  onExit(game, close) { A.stopAll(); close(); },
};

function youMsg(m) { return m.replace(/^was /, 'were ').replace(/^is /, 'are ').replace(/^has /, 'have ').replace(/\bhis\b|\btheir\b/g, 'your'); }

// --- the ride -------------------------------------------------------------------------------------------------------------------------------------
function newRide() {
  const pool = FLOORS.filter((f) => !E.recent.includes(f.id));
  const list = [];
  while (list.length < RIDE && pool.length) list.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  E.recent = list.map((f) => f.id);
  E.queue = [...list, PENTHOUSE, LOBBY];
  E.num = 0; E.log = []; E.rideStart = E.world.time; E.rides++;
}
function nextDef() {
  if (E.force) { const f = FLOORS.find((x) => x.id === E.force) || [LOBBY, PENTHOUSE].find((x) => x.id === E.force); E.force = null; if (f) { if (E.queue[0] && !E.queue[0].lobby && E.queue[0] !== PENTHOUSE) E.queue.shift(); return f; } }
  if (!E.queue.length) newRide();
  return E.queue.shift();
}
function labelFor(def) {
  if (def.lobby) return 'G';
  if (def === PENTHOUSE) return 'PH';
  E.num += 1 + Math.floor(Math.random() * 6);
  return String(E.num);
}
/** Put a floor up (the doors are shut). */
function enterFloor(def, label) {
  const F = new FloorKit(E, def); F.def = def;
  E.cur = { def, F, label, time: def.time ?? 30, warned: false };
  try { def.build(F); } catch (e) { console.error('floor build failed', def.id, e); }
  F.flush();
  E.bounces = 0; E.holds = 0;
}
function leaveFloor() {
  const c = E.cur; if (!c) return;
  try { c.def.end?.(c.F); } catch (e) { console.error(e); }
  c.F.clear();
  A.stopSong('floor');
  E.weather.set(null);
  E.ui.tint('transparent', 0);
  E.cur = null;
}
function openNow() {
  const c = E.cur, def = c.def;
  E.env.apply(def.look || {});
  E.phase = 'open'; c.F.t = 0;
  if (def.music) A.playSong('floor', def.music, 0.4);
  try { def.start?.(c.F); } catch (e) { console.error(e); }
  E.ui.showBanner(def.lobby ? 'LOBBY' : def === PENTHOUSE ? 'PENTHOUSE' : `FLOOR ${c.label}`, def.name, def.hint, def.color);
  if (!def.lobby && def !== PENTHOUSE) E.log.push({ label: c.label, name: def.name, died: false });
  for (const p of E.game.players) if (p.brain instanceof Rider && p.character?.alive) p.brain.floorOpened(def, c.F);
  passengersAt(c);
}

function director(dt) {
  const c = E.cur, car = E.car;
  if (E.phase === 'open') {
    const F = c.F;
    F.update(dt);
    try { c.def.update?.(F, dt, F.t); } catch (e) { console.error(e); }
    const left = c.time - F.t;
    if (left <= CLOSE_WARN && !c.warned) {
      c.warned = true;
      try { c.def.closing?.(F); } catch (e) { console.error(e); }
      for (const p of E.game.players) if (p.brain instanceof Rider) p.brain.floorClosing();
      if (c.def.lobby && Math.random() < 0.7) { const b = E.game.players.find((p) => p.brain && p.character?.alive); if (b) b.brain.say(pickLine(['get in!!', 'its leaving', 'come on', 'hurry up'])); }
    }
    if (left <= CLOSE_WARN && Math.ceil(left) !== c.beep) { c.beep = Math.ceil(left); if (c.beep > 0) A.warnBeep(c.beep === 1); }
    if (left <= 0) { E.phase = 'closing'; car.close(); }
  } else if (E.phase === 'closing') {
    c.F.update(dt);
    try { c.def.update?.(c.F, dt, c.F.t); } catch (e) { console.error(e); }
    // someone in the way: the doors bounce back (twice), then close anyway
    if (car.k > 0.15 && car.k < 0.75 && E.bounces < 2 && [...E.world.characters].some((ch) => ch.alive && car.inDoorway(ch.rootPosition))) {
      E.bounces++; car.open(true); E.phase = 'open'; c.time = c.F.t + 2.2; c.warned = true; A.buttonBeep();
      return;
    }
    if (car.closed) doorsShut();
  } else if (E.phase === 'travel') {
    E.travelT -= dt;
    const T = E.travelTotal, k = 1 - Math.max(0, E.travelT) / T;
    // the indicator counts through the floors on the way
    if (E.next) {
      const a = E.fromNum, b = E.toNum;
      if (b != null && a != null) { const n = Math.round(a + (b - a) * Math.min(1, k * 1.15)); car.setDisplay(n <= 0 ? 'G' : String(n), E.arrow); }
      if (k > 0.85) car.setDisplay(E.next.label, E.arrow);
    }
    E.travelLevel = Math.min(1, Math.min(k * 5, (1 - k) * 4));
    if (E.travelT <= 0) arrive();
  } else if (E.phase === 'opening') {
    if (car.k > 0.2 && !E.cur.started) { E.cur.started = true; openNow(); E.phase = 'opening'; }
    if (car.opened) E.phase = 'open';
  }
}

function doorsShut() {
  const c = E.cur, world = E.world;
  // everybody still out there is pulled back in (the floor is about to go)
  for (const ch of [...world.characters]) {
    if (!ch.alive || E.car.inside(ch.rootPosition)) continue;
    if (ch.npc) { ch.npc.destroy(); continue; }
    const s = E.car.spot(); E.pulled = (E.pulled || 0) + 1;
    ch.platformStand = false; ch.body.position.set(s.x, 3.1, s.z); ch.body.velocity.set(0, 0, 0);
    if (ch.player?.isLocal) E.ui.toast('Phew! You squeezed back in just in time.', '#ffb04a', 'rgba(80,40,10,.9)');
    if (ch.player?.brain) ch.player.brain.goHome();
  }
  // everyone who's still alive made it through this floor
  if (!c.def.lobby) for (const p of E.game.players) if (p.character?.alive && p.diedOn !== c.F) p.stats.Floors = (p.stats.Floors || 0) + 1;
  E.game.gui.onPlayersChanged();
  E.passengers = E.passengers.filter((ps) => !ps.gone);
  // up (or down) to the next one
  const fromNum = c.def.lobby ? 0 : c.def === PENTHOUSE ? E.num + 3 : Number(c.label);
  leaveFloor();
  const def = nextDef();
  const label = labelFor(def);
  E.arrow = def.lobby ? 'down' : 'up';
  const toNum = def.lobby ? 0 : def === PENTHOUSE ? E.num + 3 : Number(label);
  E.fromNum = fromNum; E.toNum = toNum;
  E.next = { def, label };
  E.env.apply({ skyColor: 0x000000, amb: [0xfff2e0, 0x6a5a4a, 0.9], sun: [0xffffff, 0.2], fog: [0x000000, 2000, 4000] });
  E.phase = 'travel';
  E.travelTotal = E.travelT = def.lobby ? 5.5 : Math.min(6, 2.6 + Math.abs(toNum - fromNum) * 0.35);
  E.game.world.delay(0.15, () => enterFloor(def, label)); // (built while the doors are shut)
  A.playSong('car', 'muzak', 0.3);
}
function arrive() {
  E.car.setDisplay(E.next.label, null);
  A.ding(E.arrow === 'down');
  E.phase = 'opening';
  E.car.open();
  E.next = null;
  if (E.cur) E.cur.started = false;
}

function pressButton(b) {
  if (!b) return;
  A.buttonBeep();
  E.car.light(b, true, b === 'open' || b === 'close' ? 0.8 : 2.5);
  const c = E.cur;
  if (b === 'open') {
    if ((E.phase === 'open' || E.phase === 'closing') && c && E.holds < 3) {
      E.holds++; if (E.phase === 'closing') { E.car.open(true); E.phase = 'open'; }
      c.time = Math.max(c.time, c.F.t + CLOSE_WARN + 2); c.warned = false; c.beep = null;
      E.ui.toast('◀▶ Holding the doors...', '#7cf07c');
    } else E.ui.toast('The doors are already doing their best.', '#cccccc', 'rgba(40,40,40,.85)');
  } else if (b === 'close') {
    if (E.phase === 'open' && c && c.time - c.F.t > CLOSE_WARN + 1) { c.time = c.F.t + CLOSE_WARN + 0.5; E.ui.toast('▶◀ Impatient, are we?', '#7cf07c'); }
  } else if (b === 'alarm') {
    A.alarmButton();
    if (!E.alarmT || E.world.time - E.alarmT > 6) {
      E.alarmT = E.world.time;
      const p = pick(E.game.players.filter((q) => q.brain && q.character?.alive) || []);
      if (p) E.world.delay(1, () => p.brain.say(pickLine(['who pressed the alarm', 'STOP', 'lol', 'dont press that', 'ow my ears'])));
      const ps = E.passengers.find((q) => q.alive);
      if (ps && Math.random() < 0.6) E.world.delay(2, () => ps.say(pickLine(['Please don\'t do that.', 'Really?', '...', 'Was that necessary?'])));
    }
  } else {
    E.ui.toast(`Floor ${b}? The elevator ignores you. It has its own plans.`, '#cccccc', 'rgba(40,40,40,.85)');
  }
}

// --- the other passengers ---------------------------------------------------------------------------------------------------------------------------
function passengersAt(c) {
  if (c.def.lobby || c.def === PENTHOUSE || c.def.noPassengers) {
    // everyone gets off at the top
    if (c.def === PENTHOUSE) for (const ps of E.passengers) if (ps.alive) ps.leave(c.F);
    return;
  }
  // some get off...
  for (const ps of E.passengers) if (ps.alive && ps.mode === 'ride' && --ps.ridesLeft <= 0) ps.leave(c.F);
  // ...and someone may get on
  const riding = E.passengers.filter((p) => p.alive && p.mode !== 'leave');
  if (riding.length < 3 && Math.random() < 0.38) {
    const used = new Set(E.passengers.filter((p) => p.alive).map((p) => p.def.id));
    const def = pick(PASSENGERS.filter((d) => !used.has(d.id)));
    if (!def) return;
    const at = V(rnd(-3, 3), 0.2, -14);
    const g = c.F.groundAt(at.x, at.z, 8);
    if (g == null || g < -2 || g > 3) return;
    at.y = g + 0.1;
    const ps = new Passenger(E, def, at);
    E.passengers.push(ps);
    E.world.delay(rnd(2.5, 5), () => { if (ps.alive && E.car.inside(ps.ch.rootPosition)) ps.say(pickLine(def.lines)); });
  }
}

// --- sound and the screen ---------------------------------------------------------------------------------------------------------------------------------
function mix(dt) {
  const cam = E.world.camera.position;
  const inside = E.car.inside(cam);
  const open = E.car.k;
  const travel = E.phase === 'travel' ? (E.travelLevel || 0) : 0;
  E.travel?.setVolume(travel * 0.5);
  A.songVolume('car', inside ? 0.18 + (1 - open) * 0.14 : 0.04 * (1 - open) + 0.02);
  A.songVolume('floor', E.cur ? (inside ? 0.12 + open * 0.2 : 0.42) * (E.phase === 'travel' ? 0 : 1) : 0);
  if (travel > 0.1) E.shakeAmt = Math.max(E.shakeAmt, 0.08 * travel);
  void dt;
}
const fmt = (s) => `${Math.max(0, Math.ceil(s))}`;
function hud(game, dt) {
  const ui = E.ui, c = E.cur;
  const name = E.phase === 'travel' ? (E.arrow === 'down' ? 'Going down...' : 'Going up...') : c ? c.def.name : '';
  ui.setFloor(E.phase === 'travel' ? E.car._disp.split('|')[0] : c?.label || 'G', E.phase === 'travel' ? E.arrow : null, name);
  if (E.phase === 'open' && c) {
    const left = c.time - c.F.t;
    if (c.def.lobby) ui.setStatus(`The elevator leaves in ${fmt(left)}`, left <= CLOSE_WARN);
    else ui.setStatus(left <= CLOSE_WARN ? `Doors closing in ${fmt(left)}! Get in!` : `Doors close in ${fmt(left)}s`, left <= CLOSE_WARN);
  } else if (E.phase === 'closing') ui.setStatus('Doors closing...', true);
  else if (E.phase === 'travel') ui.setStatus(E.next?.def === PENTHOUSE ? 'Nearly at the top...' : E.next?.def.lobby ? 'Back down to the lobby' : `Next stop: floor ${E.next?.label ?? '?'}`);
  else ui.setStatus('');
  // tints
  const ch = game.localPlayer?.character, t = E.world.time;
  if (c?.def.tint && E.phase !== 'travel') { const tt = c.def.tint(c.F, ch); if (tt) ui.tint(tt[0], tt[1]); else ui.tint('transparent', 0); }
  else if (E.hurtT && t - E.hurtT < 0.25) ui.tint('radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(200,0,0,0.55))', 1);
  else ui.tint('transparent', 0);
  const r = game.world.renderer.domElement;
  ui.update(dt, E.world.camera, r.clientWidth, r.clientHeight);
}

export { E };
