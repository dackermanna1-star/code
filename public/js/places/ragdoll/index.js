// "Ragdoll Olympics": five events in an Olympic park, eight athletes, no
// dignity.
//  - The Stair Dismount down the Grand Staircase of Mount Olympus: every
//    bruise scores.
//  - The Human Cannonball: distance.
//  - The Wipeout Run: a race over the lake past sweepers, punching walls and
//    swinging hammers that knock you flat.
//  - The High Dive: flips and the entry, scored by five judges.
//  - Ragdoll Bowling: you are the ball.
// Gold, silver and bronze in each event. The champion takes the podium at the
// closing ceremony, and the next Games begin.
//
// The athletes are R6 figures. When they fly, fall or get hit they become rag
// dolls, and they get up again afterwards. See rag.js: six rigid bodies,
// limited joints, joint friction and broken bones.
// (A user-made place in the style of the ragdoll games that came after 2008;
// it uses its own GUI, lighting and effects.)
import * as THREE from 'three';
import { GROUP } from '../../engine/Part.js';
import { RagdollSystem, unpark, TORSO, HEAD } from './rag.js';
import { buildPark } from './map.js';
import { UI, RINGS } from './ui.js';
import * as A from './audio.js';
import { Effects } from './fx.js';
import { V, rnd, clamp, GRAV, updateWater, applyEnv } from './kit.js';
import { EVENTS } from './events/index.js';
import { THUMB } from './thumb.js';

export { GRAV };
const JUMP = 39, WALK = 18;
const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const E = { world: null };
export { E };

export default {
  thumbnailImage: THUMB,

  build(world) {
    world.useStaticGrid?.(24);
    E.world = world;
    E.park = buildPark(world);
    E.venues = EVENTS.map((def) => { try { return def.build(E.park.K, E) || {}; } catch (e) { console.error('venue', def.id, e); return {}; } });
    E.park.K.flush();
    E.park.crowd.build();
    return { thumbnail: { cam: [60, 80, -470], look: [0, 40, -300] } };
  },

  setup(game) {
    const world = game.world;
    Object.assign(E, {
      game, rags: new RagdollSystem(world), fx: new Effects(world), ui: new UI(game.gui.root),
      phase: 'opening', phaseT: 0, evIndex: -1, ev: null, games: 0, timeScale: 1, slowT: 0, shakeAmt: 0,
      keys: game.keys, prevKeys: new Set(), impactsThisFrame: 0, camFx: null,
    });
    game.gui.root.classList.add('ro-mode');
    // the look: soft shadows that follow the action, filmic tone
    const r = world.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    world.sun.shadow.mapSize.set(2048, 2048); world.sun.shadow.bias = -0.0018; world.sun.shadow.normalBias = 0.25;
    const sc = world.sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.far = 700; sc.updateProjectionMatrix();
    world.sun.shadow.map?.dispose(); world.sun.shadow.map = null;
    try { applyEnv(r, world.skyMesh?.material.map); } catch (e) { console.warn('env', e); }
    game.resize(window.innerWidth, window.innerHeight);
    // physics: lighter gravity than ROBLOX's (bodies hang in the air a little) and a stiffer solver for the joints
    world.physics.gravity.set(0, -GRAV, 0);
    world.physics.solver.iterations = 18;
    world.fallenPartsDestroyHeight = -200;
    game.respawnTime = 2; game.forceFieldTime = 0;
    game.setStats(['Points', 'Medals']);
    game.labelRange = 140;
    // slow motion, and the rag dolls drawn after each step
    const step = world.step.bind(world);
    world.step = (dt) => {
      if (E.slowT > 0) { E.slowT -= dt; if (E.slowT <= 0) E.timeScale = 1; }
      step(dt * E.timeScale);
      E.rags.frame(dt * E.timeScale);
      E.fx.update(dt * E.timeScale);
    };
    world.onUpdate((dt, t) => { E.park.crowd.update(dt, t); E.park.flags.update(t); updateWater(t); for (const v of E.venues) v.update?.(dt, t); });
    E.park.flameFire = E.fx.fire(E.park.flame, 1.5);
    for (const v of E.venues) for (const f of v.fires || []) E.fx.fire(f[0], f[1]);
    E.rags.water.push(...E.venues.flatMap((v) => v.water || []));
    E.fx.onBurst = (rk) => A.firework(new THREE.Vector3(rk.x, rk.y, rk.z));

    // players
    game.pickSpawn = (p) => spawnSpot(p);
    game.on('playerAdded', (p) => {
      p.oly = { points: 0, medals: 0, gold: 0 };
      if (p.isBot) p.brain = { update() {} }; // (the events drive the bots)
    });
    game.on('spawned', (p, ch) => {
      ch.walkSpeed = WALK; ch.jumpPower = JUMP;
      ch.ragdoll = false;
      if (p.isLocal) { if (E.camLocked && E.camShot) game.camera.subject = ch; else followChar(ch); }
      // someone arriving mid-event watches from the side until the next one
      if (E.phase === 'play' || E.phase === 'intro' || E.phase === 'results') p.oly.late = true;
    });
    game.on('chatted', (p, text) => { E.ui.pop(text, (p.character?.rootPosition || V()).clone().add(V(0, 4, 0)), '#fff', 15, 3); });

    // the camera: follows what matters, never through walls, and shakes
    const cam = game.camera, camUpdate = cam.update.bind(cam);
    cam.distance = 18; cam.elevation = 0.32;
    cam.update = (dt) => {
      // (a scripted shot stays put even if something else resets the camera, like the client on joining)
      if (E.camLocked && E.camShot && !cam.fixed) cam.fixed = E.camShot;
      if (E.camFx) E.camFx(dt);
      camUpdate(dt);
      const c = world.camera;
      if (!cam.fixed && !cam.firstPerson) {
        const f = cam.focus, dir = c.position.clone().sub(f), L = dir.length();
        if (L > 0.5) {
          dir.divideScalar(L);
          const hit = world.raycast(f, c.position.clone().addScaledVector(dir, 0.8), { mask: GROUP.WORLD });
          if (hit && hit.distance < L + 0.8) c.position.copy(f).addScaledVector(dir, Math.max(1.5, hit.distance - 0.8));
        }
      }
      // (a fixed shot of something lying in a corner doesn't look from inside the wall either)
      const fx = cam.fixed;
      if (fx?.avoid) {
        const f = fx.lookAt, dir = c.position.clone().sub(f), L = dir.length();
        if (L > 0.5) {
          dir.divideScalar(L);
          const hit = world.raycast(f.clone().addScaledVector(dir, 0.5), c.position.clone().addScaledVector(dir, 0.8), { mask: GROUP.WORLD });
          if (hit && hit.distance < L + 0.3) { c.position.copy(f).addScaledVector(dir, Math.max(2, hit.distance - 0.3)); c.lookAt(f); }
        }
      }
      // the shadows follow what the camera is looking at
      if (cam.fixed) cam.focus.copy(cam.fixed.lookAt);
      // never under the water (the lake, the pool)
      for (const w of E.rags.water) if (c.position.x > w.x0 && c.position.x < w.x1 && c.position.z > w.z0 && c.position.z < w.z1 && c.position.y < w.y + 1.2) { c.position.y = w.y + 1.2; c.lookAt(cam.fixed ? cam.fixed.lookAt : cam.focus); }
      if (E.shakeAmt > 0.01) { c.position.x += (Math.random() - 0.5) * E.shakeAmt; c.position.y += (Math.random() - 0.5) * E.shakeAmt; c.position.z += (Math.random() - 0.5) * E.shakeAmt; }
      E.shakeAmt = Math.max(0, E.shakeAmt - dt * 3);
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); E.showStandings = !E.showStandings; }
    });

    window.__rag = {
      E, V: THREE.Vector3,
      skip: () => { E.phaseT = 1e3; if (E.ev) E.ev.forceEnd = true; },
      go: (id) => { const i = EVENTS.findIndex((d) => d.id === id); if (i >= 0) { cleanupEvent(); E.evIndex = i - 1; nextEvent(); } return i; },
      list: () => EVENTS.map((d) => d.id),
    };
    A.crowdBed(0.25);
    A.playSong('music', 'theme', 0.3);
    opening(true);
  },

  update(game, dt) {
    if (!E.ui) return;
    E.impactsThisFrame = 0;
    // no running on the spot while held on a start line (or lying as a rag doll)
    const lc = game.localPlayer?.character;
    if (lc && (lc.frozen || lc.parked)) { lc.input.move.set(0, 0, 0); lc.input.jump = false; }
    director(dt);
    freePlay(dt);
    E.prevKeys = new Set(E.keys);
    mix(dt);
    hud(game, dt);
  },

  onExit(game, close) { A.stopAll(); close(); },
};

// --- the shared toolbox for the events ---------------------------------------------------------------------------------------------
/** Is the key held / just pressed / just released (for the local player)? */
E.held = (k) => !E.game.gui?.chatFocused && E.keys.has(k);
E.pressed = (k) => E.held(k) && !E.prevKeys.has(k);
E.released = (k) => !E.keys.has(k) && E.prevKeys.has(k);
E.athletes = () => E.game.players.filter((p) => p.character && !p.oly?.late);

/** Put a player's figure standing at feet facing yaw (getting it out of a rag doll first). frozen: no walking. */
E.stand = (p, feet, yaw = 0, frozen = true) => {
  const ch = p.character;
  if (!ch) return null;
  if (ch.rag) { ch.rag.destroy(); ch.rag = null; }
  if (ch.parked) unpark(ch, feet, yaw);
  if (ch.frozen) ch.freeze(false);
  const b = ch.body;
  b.position.set(feet.x, feet.y + 3, feet.z); b.previousPosition.copy(b.position); b.interpolatedPosition.copy(b.position);
  b.velocity.set(0, 0, 0);
  ch.facing = yaw; ch.root.position.copy(b.position); ch.root.rotation.set(0, yaw, 0);
  ch.input.move.set(0, 0, 0); ch.input.jump = false;
  ch.platformStand = false;
  ch.walkSpeed = WALK; ch.jumpPower = JUMP;
  if (frozen) ch.freeze(true);
  // (a frozen figure keeps facing where it was put, whatever keys are held)
  ch.lockFacing = frozen ? yaw : null;
  ch.pose = null;
  return ch;
};

/** Turn an athlete into a rag doll (keeping their momentum). */
E.ragdoll = (a) => {
  const ch = a.p.character;
  if (!ch) return null;
  if (ch.rag) return ch.rag;
  if (ch.frozen) ch.freeze(false);
  const rag = E.rags.fromCharacter(ch);
  a.rag = rag; rag.ath = a;
  rag.onImpact = (h) => onImpact(a, h);
  rag.onBreak = (part, h) => onBreak(a, part, h);
  rag.onSplash = (i, v, pos) => onSplash(a, i, v, pos);
  if (a.p.isLocal) followRag(rag);
  return rag;
};

/** Get an athlete back on their feet where their rag doll lies (or at a given spot). */
E.getUp = (a, at = null, yaw = null, then = null) => {
  const ch = a.p.character, rag = ch?.rag;
  if (!ch) return;
  if (!rag) { if (at) E.stand(a.p, at, yaw ?? ch.facing, false); then?.(); return; }
  const c = rag.position.clone();
  let feet = at;
  if (!feet) {
    const hit = E.world.raycast(V(c.x, c.y + 2, c.z), V(c.x, c.y - 12, c.z), { mask: GROUP.WORLD | GROUP.DYNAMIC });
    feet = hit ? hit.point.clone() : V(c.x, c.y - 1, c.z);
  }
  // face the way the torso's front was pointing
  if (yaw == null) { const f = new THREE.Vector3(0, 0, -1).applyQuaternion(rag.meshes[TORSO].quaternion); f.y = 0; yaw = f.lengthSq() > 0.01 ? Math.atan2(-f.x, -f.z) : ch.facing; }
  a.gettingUp = true;
  rag.standUp(feet, yaw, 0.45, () => {
    a.gettingUp = false;
    if (a.rag === rag) a.rag = null;
    if (ch.rag === rag) { ch.rag = null; unpark(ch, feet, yaw); }
    ch.walkSpeed = WALK; ch.jumpPower = JUMP;
    if (a.p.isLocal && !E.camLocked) followChar(ch);
    then?.();
  });
};

/** Slow the world down for a moment (the big ones). */
E.slowmo = (k = 0.35, secs = 0.6) => { E.timeScale = k; E.slowT = secs; };
E.shake = (a) => { E.shakeAmt = Math.max(E.shakeAmt, a); };

// --- cameras ------------------------------------------------------------------------------------------------------------------------------------
function followChar(ch) {
  const cam = E.game.camera;
  cam.fixed = null; E.camFx = null; E.camShot = null;
  cam.subject = ch;
  cam.distance = 18; cam.elevation = 0.32;
  cam._updateFirstPerson?.();
}
function followRag(rag, o = {}) {
  const cam = E.game.camera;
  if (E.camLocked) return;
  cam.fixed = null; E.camFx = null; E.camShot = null;
  cam.subject = rag.camSubject;
  cam.distance = o.dist ?? E.ev?.def.camDist ?? 26;
  if (o.elev != null) cam.elevation = o.elev;
  cam._updateFirstPerson?.();
}
E.followRag = followRag;
E.followChar = followChar;
/** A fixed shot (position, look-at; each a Vector3 or a function returning one). */
E.shot = (pos, look, lerp = 0, o = {}) => {
  const cam = E.game.camera;
  const s = { position: (typeof pos === 'function' ? pos() : pos).clone(), lookAt: (typeof look === 'function' ? look() : look).clone(), avoid: !!o.avoid };
  cam.fixed = s; E.camShot = s;
  E.camFx = (typeof pos === 'function' || typeof look === 'function') ? (dt) => {
    const p = typeof pos === 'function' ? pos() : pos, l = typeof look === 'function' ? look() : look;
    if (lerp) { s.position.lerp(p, Math.min(1, dt * lerp)); s.lookAt.lerp(l, Math.min(1, dt * (o.lookLerp ?? lerp * 1.5))); } else { s.position.copy(p); s.lookAt.copy(l); }
  } : null;
};
/** A flyover: [{from, to, look, look2, secs}] played in turn. */
E.flyover = (shots, then = null) => {
  let i = 0, t = 0;
  const cam = E.game.camera;
  const s = { position: new THREE.Vector3(), lookAt: new THREE.Vector3() };
  cam.fixed = s; E.camShot = s;
  E.camFx = (dt) => {
    const sh = shots[i];
    if (!sh) return;
    t += dt;
    const k = Math.min(1, t / sh.secs), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    s.position.lerpVectors(sh.from, sh.to, e);
    s.lookAt.lerpVectors(sh.look, sh.look2 || sh.look, e);
    if (k >= 1) { i++; t = 0; if (i >= shots.length) { E.camFx = null; then?.(); } }
  };
  E.camFx(0);
};

// --- what happens to bodies ------------------------------------------------------------------------------------------------------------------
const PART_W = [1, 1.6, 0.7, 0.7, 0.8, 0.8];
function onImpact(a, h) {
  const local = a.p.isLocal;
  const water = h.other?.tag === 'water';
  const soft = h.other?.tag === 'soft';
  // sound (a few per frame at most)
  if (h.v > 7 && E.impactsThisFrame < 5) { E.impactsThisFrame++; A.impact(h.v, h.point, soft); }
  if (!water && h.v > 14 && !soft) E.fx.dust(h.point, Math.min(1.3, h.v / 60), h.other?.dust || '#d8ccb0');
  if (h.v > 42) {
    E.fx.star(h.point.clone().add(h.normal.clone().multiplyScalar(0.8)), Math.min(1.5, h.v / 60));
    if (local) E.shake(Math.min(1.6, h.v / 50));
    if (h.part === HEAD && h.v > 34 && Math.random() < 0.5) A.oof(h.point);
    E.park.crowd.excite(Math.min(1, h.v / 70));
  }
  h.w = PART_W[h.part];
  if (a.free || E.phase !== 'play') return;
  try { E.ev?.def.impact?.(E, E.ev, a, h); } catch (e) { console.error(e); }
}
const BREAK_NAMES = ['RIBS', 'SKULL', 'RIGHT ARM', 'LEFT ARM', 'RIGHT LEG', 'LEFT LEG'];
function onBreak(a, part, h) {
  A.crack(h.point);
  E.fx.sparks(h.point, 10, 14, [1, 1, 0.85]);
  E.ui.pop(`CRACK! ${BREAK_NAMES[part]}`, h.point, '#ff8a7a', a.p.isLocal ? 26 : 17, 1.3);
  E.park.crowd.excite(1);
  if (Math.random() < 0.6) A.ooh(0.8);
  if (a.p.isLocal) { E.slowmo(0.3, 0.55); E.ui.flash(0.35, '#fff'); E.shake(1.5); }
  if (a.free || E.phase !== 'play') return;
  try { E.ev?.def.broke?.(E, E.ev, a, part, h); } catch (e) { console.error(e); }
}
function onSplash(a, i, v, pos) {
  if (i !== TORSO && i !== HEAD) return;
  const w = E.rags.water.find((ww) => pos.x > ww.x0 && pos.x < ww.x1 && pos.z > ww.z0 && pos.z < ww.z1);
  const k = Math.min(2, v / 35);
  if (v > 6) { E.fx.splash(new THREE.Vector3(pos.x, 0, pos.z), k, w ? w.y : pos.y); A.splash(new THREE.Vector3(pos.x, pos.y, pos.z), k); }
  if (a.free || E.phase !== 'play') return;
  try { E.ev?.def.splash?.(E, E.ev, a, i, v, pos); } catch (e) { console.error(e); }
}

// --- where people appear ---------------------------------------------------------------------------------------------------------------------------
function infieldSpot(i) { return V(-21 + (i % 8) * 6, 0.2, -6 + Math.floor(i / 8) * 6); }
const INFIELD_YAW = 0;
function spawnSpot(p) {
  const ev = E.ev;
  if (ev && (E.phase === 'intro' || E.phase === 'play' || E.phase === 'results') && ev.def.spectate) {
    const s = ev.def.spectate(E, ev, p);
    if (s) return s;
  }
  return { position: infieldSpot(E.game.players.indexOf(p)), yaw: INFIELD_YAW };
}

// --- the Games -------------------------------------------------------------------------------------------------------------------------------------------
function setPhase(ph) { E.phase = ph; E.phaseT = 0; }
const standings = () => [...E.game.players].filter((p) => p.oly).sort((a, b) => b.oly.points - a.oly.points || b.oly.gold - a.oly.gold);

function opening(first = false) {
  setPhase('opening');
  E.openLen = first ? 16 : 10;
  E.evIndex = -1; E.ev = null; E.games++;
  for (const p of E.game.players) { p.oly = { points: 0, medals: 0, gold: 0 }; p.stats.Points = 0; p.stats.Medals = 0; }
  E.game.gui.onPlayersChanged();
  // everyone onto the infield
  E.game.players.forEach((p, i) => { if (p.character) E.stand(p, infieldSpot(i), INFIELD_YAW, false); });
  E.ui.results(null); E.ui.live(null); E.ui.myScore(null); E.ui.meter(null); E.ui.hint(''); E.ui.toast('', '#000', 0.01);
  E.ui.card({ n: first ? 'WELCOME TO THE' : `GAMES ${E.games} · LET THE GAMES BEGIN`, title: 'RAGDOLL OLYMPICS', color: '#ffffff', where: 'Olympic Park · five events · eight athletes', desc: 'Every bruise scores. Every bone counts.', secs: E.openLen - 2 });
  A.playSong('music', 'theme', 0.35);
  A.cheer(1.2);
  E.park.crowd.excite(1);
  screen('RAGDOLL OLYMPICS', `GAMES ${E.games} · WELCOME!`, EVENTS.map((d, i) => [`${d.name}`, `EVENT ${i + 1}`]));
  // a lap of the stadium, then up to the flame
  E.camLocked = true;
  E.flyover([
    { from: V(-150, 40, -60), to: V(-40, 30, -105), look: V(0, 8, 0), secs: E.openLen * 0.45 },
    { from: V(-40, 30, -105), to: V(0, 62, -100), look: V(0, 8, 0), look2: E.park.flame.clone(), secs: E.openLen * 0.55 },
  ]);
  for (let i = 0; i < 6; i++) E.world.delay(1 + i * 1.3, () => E.fx.firework(V(rnd(-90, 90), 30, rnd(-60, 60)), 60));
}

function nextEvent() {
  E.evIndex++;
  if (E.evIndex >= EVENTS.length) { closing(); return; }
  const def = EVENTS[E.evIndex];
  const ev = { def, venue: E.venues[E.evIndex], ath: [], t: 0, n: E.evIndex + 1 };
  E.ev = ev;
  setPhase('intro');
  for (const p of E.game.players) if (p.oly) p.oly.late = false;
  for (const p of E.game.players) if (p.freeRag) p.freeRag = null;
  E.free = null;
  ev.ath = E.athletes().map((p, i) => ({ p, i, score: 0, done: false, launched: false, combo: 1, lastHitT: -9, bot: p.isBot ? { skill: botSkill(p) } : null }));
  try { def.enter(E, ev); } catch (e) { console.error('enter', def.id, e); }
  E.ui.results(null); E.ui.myScore(null); E.ui.meter(null); E.ui.judges(null);
  E.ui.card({ n: `EVENT ${ev.n} OF ${EVENTS.length}`, title: def.name.toUpperCase(), color: def.color, where: def.where, desc: def.desc, keys: def.keys, secs: 5.4 });
  A.playSong('music', 'theme', 0.3);
  A.whistle();
  E.park.crowd.excite(0.6);
  screen(def.name.toUpperCase(), `EVENT ${ev.n} OF ${EVENTS.length} · ${def.where.toUpperCase()}`, standings().map((p) => [p.name, `${p.oly.points} pts`]));
  E.camLocked = true;
  if (def.shots) E.flyover(def.shots(E, ev), null);
}

function startPlay() {
  const ev = E.ev;
  setPhase('play');
  E.camLocked = false;
  E.ui.card(null);
  ev.t = 0;
  try { ev.def.start(E, ev); } catch (e) { console.error('start', ev.def.id, e); }
  A.playSong('music', 'action', 0.12);
}

function endPlay() {
  const ev = E.ev, def = ev.def;
  try { def.finish?.(E, ev); } catch (e) { console.error(e); }
  setPhase('results');
  // rank: the better score first (ties: whoever stood further left)
  const val = (a) => (def.higher === false ? (a.score ?? 1e9) : -(a.score ?? 0));
  const sorted = [...ev.ath].sort((x, y) => val(x) - val(y) || x.i - y.i);
  sorted.forEach((a, k) => {
    a.rank = k + 1;
    const o = a.p.oly; if (!o) return;
    const pts = POINTS[k] ?? 0;
    o.points += pts; a.pts = pts;
    if (k < 3) { o.medals++; if (k === 0) o.gold++; }
    a.p.stats.Points = o.points; a.p.stats.Medals = o.medals;
  });
  E.game.gui.onPlayersChanged();
  E.ui.results({
    title: `${RINGS}${def.name.toUpperCase()}`, sub: `RESULTS · EVENT ${ev.n} OF ${EVENTS.length}`,
    rows: sorted.map((a) => ({ rank: a.rank, name: a.p.name, score: def.fmt(a), pts: `+${a.pts}`, me: a.p.isLocal })),
  });
  E.ui.live(null); E.ui.meter(null); E.ui.hint('');
  screen(def.name.toUpperCase(), 'RESULTS', sorted.map((a) => [a.p.name, def.fmt(a)]));
  const me = sorted.find((a) => a.p.isLocal);
  if (me) {
    if (me.rank === 1) { E.ui.toast(`🥇 GOLD! You win the ${def.name}!`, '#ffd24a', 4); A.fanfare(true); }
    else if (me.rank <= 3) { E.ui.toast(`${me.rank === 2 ? '🥈 SILVER' : '🥉 BRONZE'} in the ${def.name}!`, me.rank === 2 ? '#dfe6ee' : '#e0965a', 4); A.fanfare(false); }
  }
  A.cheer(1); A.applause(4, 1);
  E.park.crowd.excite(1);
  A.playSong('music', 'theme', 0.3);
  // confetti over the winner, and the camera on them
  const w = sorted[0];
  const wpos = () => (w.rag && w.rag.alive ? w.rag.position : w.p.character?.rootPosition || V());
  const wp = w ? wpos().clone() : null;
  ev.winner = w;
  E.camLocked = true;
  if (wp) {
    E.fx.confetti(wp.clone().add(V(0, 4, 0)), 160, 10, 26);
    E.fx.firework(wp.clone().add(V(rnd(-20, 20), 0, rnd(-20, 20))), 45);
    const rc = def.resultCam?.(E, ev, w);
    if (rc) E.shot(rc[0], rc[1], 3, { avoid: true });
    else {
      const yaw = bestYaw(wp, 22, 10);
      E.shot(() => { const p = wpos(); return V(p.x + Math.sin(yaw + E.phaseT * 0.12) * 22, p.y + 10, p.z + Math.cos(yaw + E.phaseT * 0.12) * 22); }, () => wpos().clone(), 3, { avoid: true });
    }
  }
}

/** The direction to look at something from with the clearest view (no walls or steps in the way). */
function bestYaw(p, dist, height) {
  let best = 0, bestD = -1;
  for (let i = 0; i < 12; i++) {
    const yaw = (i / 12) * Math.PI * 2;
    const to = V(p.x + Math.sin(yaw) * dist, p.y + height, p.z + Math.cos(yaw) * dist);
    const hit = E.world.raycast(p.clone().add(V(0, 1, 0)), to, { mask: GROUP.WORLD });
    const d = hit ? hit.distance : 1e3;
    if (d > bestD + 0.01) { bestD = d; best = yaw; }
  }
  return best;
}

function cleanupEvent() {
  const ev = E.ev;
  if (!ev) return;
  try { ev.def.leave?.(E, ev); } catch (e) { console.error(e); }
  E.ui.judges(null); E.ui.myScore(null); E.ui.hint('');
  E.camLocked = false;
  E.ev = null;
}

function closing() {
  cleanupEvent();
  setPhase('closing');
  const ranked = [...E.game.players].filter((p) => p.oly).sort((a, b) => b.oly.points - a.oly.points || b.oly.gold - a.oly.gold);
  // the podium for the top three, everyone else lined up in front
  const spots = E.park.podium;
  E.game.players.forEach((p, i) => { if (p.character) E.stand(p, V(-24 + (i % 8) * 6.8, 0.2, 12 + Math.floor(i / 8) * 5), 0, true); });
  ranked.slice(0, 3).forEach((p, k) => {
    if (!p.character) return;
    E.stand(p, spots[k], 0, true);
    p.character.pose = (ch, des) => { des.rs = 3.0; des.ls = k === 0 ? -3.0 : -0.25; };
  });
  E.ui.myScore(null);
  E.ui.results({
    side: true,
    title: `${RINGS}CLOSING CEREMONY`, sub: `FINAL STANDINGS · GAMES ${E.games}`,
    rows: ranked.map((p, k) => ({ rank: k + 1, name: p.name, score: `${p.oly.points} pts`, pts: `${p.oly.gold}🥇 ${p.oly.medals}🏅`, me: p.isLocal })),
  });
  const champ = ranked[0];
  screen('CHAMPION', champ ? champ.name.toUpperCase() : '', ranked.map((p) => [p.name, `${p.oly.points} pts`]));
  if (champ) E.ui.toast(`🏆 ${champ.isLocal ? 'YOU ARE' : champ.name + ' is'} the Ragdoll Olympics champion!`, '#ffd24a', 6);
  if (champ?.isLocal) A.fanfare(true);
  A.playSong('music', 'anthem', 0.42);
  A.cheer(1.3);
  E.camLocked = true;
  E.shot(V(4, 8, 8), V(0, 6, 26));
  E.world.delay(4, () => { if (E.phase === 'closing') E.shot(() => V(Math.sin(E.phaseT * 0.12) * 26, 11, 26 - Math.cos(E.phaseT * 0.12) * 26), V(0, 6, 26), 2); });
  for (let i = 0; i < 16; i++) E.world.delay(0.5 + i * 0.9, () => E.fx.firework(V(rnd(-80, 80), 35, rnd(-50, 60)), rnd(50, 80)));
  E.world.delay(1.2, () => E.fx.confettiRain(0, 30, 26, 14, 260));
}

/** The big screen over the south stand: what's on, and who's winning. */
function screen(title, sub, rows = []) {
  E.park.screen?.draw((x, w, h) => {
    const ring = [['#0081c8', -96], ['#111', 0], ['#ee334e', 96], ['#fcb131', -48], ['#00a651', 48]];
    ring.forEach(([c, dx], i) => { x.strokeStyle = c; x.lineWidth = 9; x.beginPath(); x.arc(w / 2 + dx, i < 3 ? 70 : 108, 40, 0, Math.PI * 2); x.stroke(); });
    x.fillStyle = '#ffffff'; x.textAlign = 'center';
    x.font = '900 64px Arial Black, Arial'; x.fillText(title, w / 2, 230);
    x.fillStyle = '#ffd24a'; x.font = 'bold 30px Arial'; x.fillText(sub, w / 2, 280);
    rows.slice(0, 5).forEach((r, i) => {
      const y = 340 + i * 46;
      x.fillStyle = i === 0 ? '#ffd24a' : i === 1 ? '#dfe6ee' : i === 2 ? '#e0965a' : '#c9d3e6';
      x.font = 'bold 34px Arial'; x.textAlign = 'left'; x.fillText(`${i + 1}. ${r[0]}`, 220, y);
      x.textAlign = 'right'; x.fillText(r[1], w - 220, y);
    });
    x.textAlign = 'center';
  });
}

function botSkill(p) { let h = 0; for (const c of p.name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 0.35 + ((h % 1000) / 1000) * 0.55; }

function director(dt) {
  E.phaseT += dt;
  const ev = E.ev;
  switch (E.phase) {
    case 'opening':
      if (E.phaseT > E.openLen) { E.camLocked = false; nextEvent(); }
      break;
    case 'intro':
      if (E.phaseT > 5.6) startPlay();
      break;
    case 'play': {
      ev.t += dt;
      let done = false;
      try { done = ev.def.update(E, ev, dt); } catch (e) { console.error('update', ev.def.id, e); done = true; }
      if (done || ev.forceEnd || ev.t > (ev.def.time || 60)) endPlay();
      break;
    }
    case 'results':
      if (E.phaseT > 8.5) { cleanupEvent(); nextEvent(); }
      break;
    case 'closing':
      if (E.phaseT > 21) opening(false);
      break;
  }
}

// --- R: flop over whenever you like (between the events) ------------------------------------------------------------------------------------
function freePlay(dt) {
  const lp = E.game.localPlayer, ch = lp?.character;
  const free = E.phase === 'opening' || E.phase === 'results' || E.phase === 'closing';
  if (ch) {
    const mine = E.free;
    if (free && E.pressed('r')) {
      if (!ch.parked && !ch.frozen) {
        const a = { p: lp, i: -1, free: true };
        const rag = E.ragdoll(a);
        const f = ch.lookVector;
        rag.push(f.x * 22, 14, f.z * 22, V(-f.z * 6, 0, f.x * 6));
        E.free = a;
        A.swoosh(ch.rootPosition);
      } else if (mine?.rag && !mine.gettingUp) { E.getUp(mine); E.free = null; }
    }
    if (mine?.rag && !mine.gettingUp && E.pressed(' ') && mine.rag.age > 0.6) { E.getUp(mine); E.free = null; }
  }
  if (!free) return;
  // the bots flop about too, now and then, and wander
  for (const p of E.game.players) {
    const c = p.character;
    if (!p.isBot || !c || c.frozen) continue;
    if (!c.parked && Math.random() < dt * 0.05) {
      const a = { p, i: -1, free: true };
      const rag = E.ragdoll(a); const f = c.lookVector;
      rag.push(f.x * rnd(10, 25), rnd(8, 18), f.z * rnd(10, 25), V(rnd(-5, 5), rnd(-3, 3), rnd(-5, 5)));
      p.freeRag = a;
    } else if (p.freeRag?.rag && !p.freeRag.gettingUp && p.freeRag.rag.still > 0.8) { E.getUp(p.freeRag); p.freeRag = null; }
    if (!c.parked) {
      p.wanderT = (p.wanderT || 0) - dt;
      if (p.wanderT <= 0) { p.wanderT = rnd(1.5, 4); const ang = rnd(0, Math.PI * 2), go = Math.random() < 0.6; c.input.move.set(go ? Math.sin(ang) : 0, 0, go ? Math.cos(ang) : 0); c.input.jump = Math.random() < 0.15; }
      else c.input.jump = false;
    }
  }
}

// --- sound and screen ---------------------------------------------------------------------------------------------------------------------------------
function mix(dt) {
  E.audioT = (E.audioT || 0) - dt;
  if (E.audioT <= 0) {
    E.audioT = 1.5;
    A.crowdBed(0.18 + E.park.crowd.cheer * 0.35);
    if (!A.songPlaying('music')) A.playSong('music', E.phase === 'play' ? 'action' : E.phase === 'closing' ? 'anthem' : 'theme', E.phase === 'play' ? 0.12 : 0.3);
  }
  A.crowdLevel(0.16 + E.park.crowd.cheer * 0.4);
  // the wind past a flying local athlete
  const rag = E.game.localPlayer?.character?.rag;
  const sp = rag && !rag.standing ? rag.speed() : 0;
  A.windLevel(clamp((sp - 25) / 120, 0, 0.45));
}

function hud(game, dt) {
  const ui = E.ui, ev = E.ev;
  const fmtT = (s) => `${Math.max(0, Math.ceil(s))}`;
  if (E.phase === 'opening') ui.setBar('🔥', 'Ragdoll Olympics', `Games ${E.games} · the first event begins in ${fmtT(E.openLen - E.phaseT)}s`, '#ffcf4a');
  else if (E.phase === 'closing') ui.setBar('🏆', 'Closing Ceremony', `The next Games begin in ${fmtT(21 - E.phaseT)}s`, '#ffcf4a');
  else if (ev) {
    const def = ev.def;
    const status = E.phase === 'intro' ? `Event ${ev.n} of ${EVENTS.length} · ${def.where}` : E.phase === 'results' ? `Results · next: ${EVENTS[E.evIndex + 1]?.name || 'the Closing Ceremony'}` : (ev.status || def.where);
    const timer = E.phase === 'play' && ev.timer != null ? fmtT(ev.timer) : '';
    ui.setBar(def.icon, def.name, status, def.color, timer, ev.timer != null && ev.timer < 4);
  }
  // the live leaderboard during an event
  if (E.phase === 'play' && ev) {
    const sk = (a) => (ev.def.higher === false ? (a.liveSort ?? a.score ?? 1e9) : -(a.score ?? 0));
    ui.live([...ev.ath].sort((x, y) => sk(x) - sk(y)).map((a) => ({ name: a.p.name, score: ev.def.live ? ev.def.live(a) : ev.def.fmt(a), me: a.p.isLocal, done: a.done })));
  }
  if (E.showStandings && E.phase !== 'results' && E.phase !== 'closing') {
    const ranked = [...game.players].filter((p) => p.oly).sort((a, b) => b.oly.points - a.oly.points);
    ui.results({ title: `${RINGS}STANDINGS`, sub: `GAMES ${E.games} · AFTER ${Math.max(0, E.evIndex)} EVENTS`, rows: ranked.map((p, k) => ({ rank: k + 1, name: p.name, score: `${p.oly.points} pts`, pts: `${p.oly.gold}🥇 ${p.oly.medals}🏅`, me: p.isLocal })) });
    E._showingStandings = true;
  } else if (E._showingStandings && E.phase !== 'results' && E.phase !== 'closing') { ui.results(null); E._showingStandings = false; }
  const r = game.world.renderer.domElement;
  ui.vignette(E.timeScale < 0.9);
  ui.update(dt, game.world.camera, r.clientWidth, r.clientHeight);
}

export { followChar, followRag };
