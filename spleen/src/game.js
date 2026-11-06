/* ==========================================================================
   SPLEEN: SEPSIS — game.js
   State machine, run lifecycle, rooms & doors, rewards, meta progression,
   render sync, main loop, debug/autopilot hooks.
   ========================================================================== */
"use strict";

/* ---------------- meta save ---------------- */
const META_KEY = 'spleen_sepsis_v1';
function defaultMeta() {
  return {
    v: 1, memory: 0, totalMemory: 0, perks: {}, unlocks: {}, codex: {}, seenMut: {},
    stats: { runs: 0, wins: 0, kills: 0, bestFloor: 0, deaths: 0, bestTime: null, playTime: 0 },
    feverMax: 0, lastStrain: 'neutrophil', lastFever: 0, tutorialSeen: false,
    opts: { master: 0.8, music: 0.65, sfx: 0.85, shake: 1, dmgNumbers: true, quality: 'auto', flashes: true, touch: 'auto' },
  };
}
let META = (function () {
  const m = Store.get(META_KEY, null);
  const d = defaultMeta();
  if (!m || m.v !== 1) return d;
  // merge new keys
  for (const k in d) if (m[k] === undefined) m[k] = d[k];
  for (const k in d.opts) if (m.opts[k] === undefined) m.opts[k] = d.opts[k];
  for (const k in d.stats) if (m.stats[k] === undefined) m.stats[k] = d.stats[k];
  return m;
})();
window.META = META;
function saveMeta() { Store.set(META_KEY, META); }
function isUnlocked(key) { return !key || !!META.unlocks[key] || (window.__SPLEEN && __SPLEEN.unlockAll); }

/* ---------------- game state ---------------- */
const Game = {
  state: 'boot',     // boot | title | play | over
  sub: 'room',       // room | transition | modal | intro | dying | descend
  paused: false,
  fade: 0, fadeTarget: 0, fadeCb: null,
  introT: 0,
  autopilot: false,
};

/* ==========================================================================
   RUN LIFECYCLE
   ========================================================================== */
function startRun(strainId, fever, seed) {
  clearTitleScene();
  clearWorld(true);
  const run = {
    strain: strainId, fever: fever || 0, seed: seed != null ? seed : (Math.random() * 1e9) >>> 0,
    floorIdx: 0, startTime: performance.now(), time: 0, won: false, newUnlocks: [],
    stats: { kills: 0, shots: 0, dashes: 0, abilities: 0, hitsTaken: 0, roomsCleared: 0, ironGained: 0, bossesKilled: 0, mutations: 0 },
    killsByType: {}, rerollsUsed: 0,
  };
  SIM.run = run;
  META.lastStrain = strainId; META.lastFever = run.fever; META.stats.runs++; saveMeta();
  const P = makePlayer(strainId, run);
  SIM.player = P;
  P.vis = buildPlayerVis(P.strain);
  P.iron = 10 * (META.perks.iron || 0);
  if (META.perks.primed) {
    const commons = MUTATIONS.filter(m => m.rarity === 'common');
    P.addMutation(rndPick(commons).id, true);
  }
  // debug: preset mutations
  if (window.__SPLEEN && __SPLEEN.presetMuts) for (const id of __SPLEEN.presetMuts) if (MUT[id]) P.addMutation(id, true);
  P.hp = P.st.maxHp;
  Game.state = 'play'; Game.paused = false;
  UI.showScreen(null); UI.showHUD(true);
  enterFloor(window.__SPLEEN && __SPLEEN.startFloor ? __SPLEEN.startFloor : 0, true);
}

function enterFloor(idx, first) {
  const run = SIM.run, P = SIM.player;
  run.floorIdx = idx;
  const floor = World.genFloor(idx, (run.seed + idx * 104729) >>> 0);
  SIM.floor = floor;
  // distances from start (for gentle first rooms)
  const q = [floor.rooms[0]]; floor.rooms[0].distFromStart = 0;
  const seen = new Set([0]);
  while (q.length) { const r = q.shift(); for (const d of r.doors) if (!seen.has(d.to)) { seen.add(d.to); const o = floor.rooms[d.to]; o.distFromStart = r.distFromStart + 1; q.push(o); } }
  const rng = makeRng(floor.seed ^ 0xbeef);
  for (const r of floor.rooms) setupRoomMechanic(r, floor, rng);
  Gfx.setRegion(floor.region);
  // region entry effects
  if (!first) {
    if (P.st.shieldPerFloor) P.addShield(P.st.shieldPerFloor);
    if (META.perks.platelet) P.heal(1);
    if (P.st.warburg && P.hp > 1) { P.hp -= 1; Gfx.floatText(P.x, P.y, 'WARBURG -1', '#c06bff', 14, { h: 1.8 }); }
  } else if (P.st.shieldPerFloor) P.addShield(P.st.shieldPerFloor);
  META.stats.bestFloor = Math.max(META.stats.bestFloor, idx + 1);
  if (idx >= 3) unlock('bcell');
  saveMeta();
  try { AUDIO.music.play(floor.region.music); } catch (e) { }
  enterRoom(floor.startId, null);
  UI.floorBanner(floor.region, idx);
  sfx('floor_enter');
  Bus.emit('floor', floor);
}

function clearWorld(full) {
  SIM.pshots.length = 0; SIM.eshots.length = 0; SIM.zones.length = 0; SIM.teles.length = 0; SIM.beams.length = 0;
  SIM.lobs.length = 0; SIM.particles.length = 0; SIM.rings.length = 0; SIM.arcs.length = 0;
  clearEnemies(); clearPickups();
  for (const it of SIM.interact) if (it.node) it.node.dispose();
  SIM.interact.length = 0;
  SIM.boss = null; SIM.timers.length = 0;
  Gfx.clearFloaters && Gfx.clearFloaters();
  if (full) {
    for (const c of SIM.companions) c.node.dispose();
    SIM.companions.length = 0;
    if (SIM.player && SIM.player.vis) SIM.player.vis.root.dispose();
    SIM.player = null;
    Gfx.clearRoom();
  }
}

/* ==========================================================================
   ROOMS
   ========================================================================== */
function enterRoom(roomId, viaDoor) {
  const floor = SIM.floor, room = floor.rooms[roomId], P = SIM.player;
  // stash pickups left behind in the previous room
  if (SIM.room && SIM.room !== room) SIM.room.leftover = SIM.pickups.map(p => ({ kind: p.kind, x: p.x, y: p.y, value: p.value }));
  clearWorld(false);
  SIM.room = room; SIM.roomTime = 0;
  room.region = floor.region;
  if (!room.floorCanvas) {
    room.floorCanvas = Gfx.paintFloor(room, floor.region, room.seed);
    if (room.type === 'start' && floor.idx === 0) {
      const dev = Input.touchEnabled ? 'touch' : Input.device === 'pad' ? 'pad' : 'kbm';
      Gfx.paintText(room, TUTORIAL[dev], room.W / 2, room.H / 2 - 1.1, floor.region.pal.speck);
    }
    if (room.type === 'start' && floor.idx > 0) Gfx.paintText(room, [floor.region.name, floor.region.sub.toUpperCase()], room.W / 2, room.H / 2 - 0.4, floor.region.pal.speck);
  }
  Gfx.buildRoom(room, floor.region);
  Gfx.setCameraBounds(room.W, room.H, room.boss);
  room.visited = true; room.seen = true;
  for (const d of room.doors) floor.rooms[d.to].seen = true;
  // place player
  if (viaDoor) { const p = World.entryPoint(room, viaDoor); P.x = p.x; P.y = p.y; }
  else { P.x = room.W / 2; P.y = room.H / 2 + (room.boss ? 4 : 1.5); }
  P.vx = P.vy = 0; P.cytokineStacks = 0;
  P.respawnCompanions();
  Gfx.updateCamera(P.x, P.y, 0, true);
  // leftover pickups
  if (room.leftover) { for (const l of room.leftover) { const p = spawnPickup(l.kind, l.x, l.y, l.value); p.vx = p.vy = 0; p.vh = 0; p.t = 1; } room.leftover = null; }
  // content
  SIM.roomLocked = false; SIM.pendingWaves = null;
  if (!room.cleared) {
    if (room.type === 'normal' || room.type === 'elite') {
      if (!room.plan) room.plan = planEncounter(room, floor.idx, makeRng(room.seed ^ 0x1234));
      lockRoom(true);
      SIM.pendingWaves = room.plan.slice();
      SIM.waveDelay = 0.45;
      SIM.entryX = P.x; SIM.entryY = P.y;
    } else if (room.type === 'boss') {
      lockRoom(true);
      startBossIntro(room);
    }
  }
  setupInteractables(room);
  Gfx.setDoorsOpen(!SIM.roomLocked);
  if (room.type === 'shop') { try { AUDIO.music.play('shop'); } catch (e) { } }
  else if (room.type !== 'boss' || room.cleared) { try { if (AUDIO.music.current !== floor.region.music) AUDIO.music.play(floor.region.music); } catch (e) { } }
  World.updateFlow(room, P.x, P.y);
  UI.roomChanged();
  Bus.emit('room', room);
}

function lockRoom(on) {
  SIM.roomLocked = on;
  SIM.combatAllowed = true;
  Gfx.setDoorsOpen(!on);
  if (on) sfx('door_close');
}

function updateRoomFlow(dt) {
  const room = SIM.room, P = SIM.player;
  // waves
  if (SIM.pendingWaves && SIM.pendingWaves.length) {
    const alive = SIM.enemies.some(e => !e.dead);
    if (!alive) {
      SIM.waveDelay -= dt;
      if (SIM.waveDelay <= 0) {
        const w = SIM.pendingWaves.shift();
        spawnWave(w, SIM.entryX != null ? P.x : P.x, P.y);
        SIM.waveDelay = 0.6;
      }
    }
    return;
  }
  if (SIM.roomLocked && room.type !== 'boss' && !SIM.enemies.some(e => !e.dead)) roomCleared();
}

function roomCleared() {
  const room = SIM.room, P = SIM.player, run = SIM.run, f = SIM.floor.idx;
  room.cleared = true;
  lockRoom(false);
  sfx('room_clear'); sfx('door_open');
  run.stats.roomsCleared++;
  for (const h of P.hooks.onRoomClear) h();
  if (P.st.healOnClear && Math.random() < P.st.healOnClear && P.hp < P.st.maxHp) { P.heal(1); Gfx.floatText(P.x, P.y, 'INTERFERON +1', '#ffc0d0', 13, { h: 1.8 }); }
  P.abilityT = Math.max(0, P.abilityT - 1.5);
  // rewards
  const cx = room.W / 2, cy = room.H / 2;
  const spot = World.nearestOpen(room, cx, cy);
  if (room.type === 'elite') {
    spawnCyst(spot.x, spot.y, 'elite');
  } else {
    const r = Math.random();
    if (r < 0.38) { const n = rndi(2, 3) + Math.floor(f / 2); for (let i = 0; i < n; i++) spawnPickup('iron', spot.x, spot.y, 1); }
    else if (r < 0.48 && !P.st.noHeal) spawnPickup('platelet', spot.x, spot.y);
    else if (r < 0.54) spawnPickup('mucus', spot.x, spot.y);
  }
  UI.toast('CLEARED', null, 'clear');
  UI.roomChanged();
}

/* ---------------- doors ---------------- */
function checkDoors() {
  if (SIM.roomLocked) return;
  const room = SIM.room, P = SIM.player;
  for (const d of room.doors) {
    let through = false;
    if (d.dir === 'N') through = P.y < 0.7 && Math.abs(P.x - d.x) < 1.6;
    else if (d.dir === 'S') through = P.y > room.H - 0.7 && Math.abs(P.x - d.x) < 1.6;
    else if (d.dir === 'W') through = P.x < 0.7 && Math.abs(P.y - d.y) < 1.6;
    else through = P.x > room.W - 0.7 && Math.abs(P.y - d.y) < 1.6;
    if (through) {
      const target = SIM.floor.rooms[d.to];
      const td = target.doors.find(t => t.to === room.id && t.ncell[0] === d.cell[0] && t.ncell[1] === d.cell[1]) || target.doors.find(t => t.to === room.id);
      Game.sub = 'transition';
      fadeTo(1, 0.14, () => { enterRoom(target.id, td); if (Game.sub === 'transition') Game.sub = 'room'; fadeTo(0, 0.18); });
      return;
    }
  }
}
function fadeTo(v, dur, cb) { Game.fadeTarget = v; Game.fadeSpeed = 1 / Math.max(0.01, dur); Game.fadeCb = cb; }

/* ==========================================================================
   INTERACTABLES (reward cysts, shop, tumor, portal)
   ========================================================================== */
function addInteract(o) { SIM.interact.push(o); return o; }
function setupInteractables(room) {
  const cx = room.W / 2, cy = room.H / 2;
  if (room.type === 'mutation' && !room.taken) spawnCyst(cx, cy - 0.5, 'mutation');
  if (room.type === 'shop') spawnShopkeeper(cx, cy - 1.2);
  if (room.type === 'tumor' && !room.taken) spawnTumor(cx, cy - 0.5);
  if (room.type === 'elite' && room.cleared && !room.taken) spawnCyst(cx, cy, 'elite');
  if (room.type === 'boss' && room.cleared) {
    if (!room.taken) spawnCyst(cx, cy + 1.6, 'boss');
    spawnPortal(cx, cy - 2.2);
  }
}
function spawnCyst(x, y, source) {
  const root = Gfx.node('cyst');
  const gold = source === 'boss' ? '#ffd36b' : source === 'elite' ? '#ff9a3a' : '#9fe8c8';
  Gfx.part('cyl', Gfx.cellMat('#2a1a24', { rim: 1.2, core: 0.2, glow: 0, dark: 0.8 }), root, 0, 0.18, 0, 0.55, 0.18, 0.55);
  const orb = Gfx.part('capsule', Gfx.cellMat(gold, { rim: 1.8, core: 0.6, glow: 0.8, dark: 0.7, alpha: 0.85 }), root, 0, 1.0, 0, 0.32, 0.5, 0.5);
  const inner = Gfx.part('sphere', Gfx.glowMat('#ffffff', { glow: 0.7 }), root, 0, 1.0, 0, 0.12);
  const ring = Gfx.part('torus', Gfx.glowMat(gold, { glow: 0.9 }), root, 0, 0.4, 0, 0.75);
  root.position.set(x, 0, -y);
  return addInteract({
    kind: 'cyst', x, y, r: 0.7, node: root, label: 'MUTATION CYST', sub: source === 'boss' ? 'choose a rare adaptation' : 'choose 1 of ' + choiceCount(),
    hex: gold, solid: true,
    anim(t) { orb.position.y = 1.0 + Math.sin(t * 2) * 0.12; orb.rotation.y = t * 0.8; orb.rotation.z = Math.sin(t) * 0.3; ring.rotation.y = t; ring.scaling.setAll(0.75 + Math.sin(t * 3) * 0.05); inner.position.y = orb.position.y; },
    use(it) {
      const opts = rollMutations(choiceCount(), { minRarity: source === 'boss' ? 'uncommon' : null, rareBoost: source === 'boss' ? 2 : source === 'elite' ? 1.4 : 1 });
      openMutationChoice(opts, source, () => { SIM.room.taken = true; removeInteract(it); burst(x, y, gold, 30, 5, { life: 0.6, up: 4 }); });
    },
  });
}
function choiceCount() { return META.perks.library ? 4 : 3; }
function spawnShopkeeper(x, y) {
  const root = Gfx.node('shop');
  const mat = Gfx.cellMat('#7dffb0', { rim: 1.6, core: 0.35, glow: 0.45, dark: 0.55, alpha: 0.8 });
  const body = Gfx.part('sphere', mat, root, 0, 0.7, 0, 0.55);
  Gfx.part('sphere', Gfx.cellMat('#1a6a4a', { rim: 1.2, core: 0.6, glow: 0.3 }), root, 0, 0.75, 0, 0.25);
  const arms = [];
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU, arm = Gfx.part('cyl', mat, root, Math.cos(a) * 0.7, 0.55, Math.sin(a) * 0.7, 0.07, 0.5, 0.07);
    arm.rotation.z = Math.cos(a) * 1.2; arm.rotation.x = -Math.sin(a) * 1.2; arms.push(arm);
    Gfx.part('sphereLo', Gfx.glowMat('#c8ffe0', { glow: 0.7 }), root, Math.cos(a) * 1.15, 0.3, Math.sin(a) * 1.15, 0.08);
  }
  // display counter
  Gfx.part('cyl', Gfx.cellMat('#1a2a22', { rim: 1.2, core: 0.2, glow: 0, dark: 0.8 }), root, 0, 0.12, 1.2, 1.6, 0.12, 0.45);
  root.position.set(x, 0, -y);
  const room = SIM.room;
  if (!room.stock) room.stock = makeShopStock();
  return addInteract({
    kind: 'shop', x, y, r: 1.1, node: root, label: 'LYMPH NODE', sub: 'trade iron for supplies', hex: '#7dffb0', solid: true,
    anim(t) { body.scaling.setAll(0.55 + Math.sin(t * 2) * 0.03); root.rotation.y = Math.sin(t * 0.5) * 0.2; },
    use() { openShop(room.stock); },
  });
}
function spawnTumor(x, y) {
  const root = Gfx.node('tumor');
  const mat = Gfx.cellMat('#7a2aa8', { rim: 1.7, core: 0.3, glow: 0.5, dark: 0.5 });
  const lumps = [];
  for (let i = 0; i < 9; i++) lumps.push(Gfx.part('sphere', mat, root, rnd(-0.5, 0.5), rnd(0.3, 1.1), rnd(-0.5, 0.5), rnd(0.3, 0.5)));
  const eye = Gfx.part('sphere', Gfx.glowMat('#ff4adf', { glow: 1 }), root, 0, 0.8, -0.4, 0.15);
  root.position.set(x, 0, -y);
  const room = SIM.room;
  if (!room.offers) room.offers = rollMalignant(2);
  return addInteract({
    kind: 'tumor', x, y, r: 1.0, node: root, label: 'TUMOR', sub: 'power, for a piece of you', hex: '#c06bff', solid: true,
    anim(t) { lumps.forEach((l, i) => { const s = 0.4 + Math.sin(t * 2.5 + i * 1.3) * 0.06; l.scaling.setAll(s); }); },
    use(it) { openTumor(room.offers, () => { room.taken = true; removeInteract(it); }); },
  });
}
function spawnPortal(x, y) {
  const root = Gfx.node('portal');
  const ring = Gfx.part('torusThick', Gfx.cellMat('#ffffff', { rim: 2, core: 0.6, glow: 0.8, dark: 0.6 }), root, 0, 0.08, 0, 1.1, 0.3, 1.1);
  const disc = Gfx.part('disc', Gfx.glowMat(SIM.floor.region.pal.accent, { glow: 0.6, alpha: 0.85 }), root, 0, 0.05, 0, 1.05);
  const core = Gfx.part('disc', Gfx.glowMat('#000000', { glow: 0, alpha: 0.9 }), root, 0, 0.07, 0, 0.7);
  root.position.set(x, 0, -y);
  const last = SIM.floor.idx >= REGIONS.length - 1;
  return addInteract({
    kind: 'portal', x, y, r: 1.0, node: root, label: last ? 'THE SOURCE IS CLEAN' : 'DESCEND', sub: last ? '' : 'into ' + REGIONS[SIM.floor.idx + 1].name.toLowerCase(), hex: '#ffffff',
    anim(t) { disc.rotation.y = t * 2; ring.rotation.y = -t; core.scaling.setAll(0.7 + Math.sin(t * 3) * 0.06); if (Math.random() < 0.3) SIM.particles.push({ x: x + rnd(-0.9, 0.9), y: y + rnd(-0.9, 0.9), h: 0.1, vx: 0, vy: 0, vh: rnd(1.5, 3), life: 0.8, t: 0, size: 0.05, hex: SIM.floor.region.pal.accent, grav: -1, drag: 0 }); },
    use() { descend(); },
  });
}
function removeInteract(it) { const i = SIM.interact.indexOf(it); if (i >= 0) SIM.interact.splice(i, 1); if (it.node) it.node.dispose(); }
function nearInteract() {
  const P = SIM.player; let best = null, bd = 1e9;
  for (const it of SIM.interact) { const d = dist(P.x, P.y, it.x, it.y) - it.r; if (d < 0.9 && d < bd) { bd = d; best = it; } }
  return best;
}
function updateInteract(dt) {
  const P = SIM.player;
  for (const it of SIM.interact) {
    it.anim && it.anim(SIM.time);
    if (it.solid) { // push player out
      const d = dist(P.x, P.y, it.x, it.y), rr = it.r * 0.75 + P.hitR;
      if (d < rr && d > 1e-4) { P.x = it.x + (P.x - it.x) / d * rr; P.y = it.y + (P.y - it.y) / d * rr; }
    }
  }
  const near = nearInteract();
  SIM.nearInteract = near;
  if (near) {
    Gfx.labels.push({ x: near.x, y: near.y, h: 2.2, text: near.label, hex: near.hex, sub: near.sub });
    if (Input.interact || (Game.autopilot && Math.random() < 0.05)) near.use(near);
  }
}
function descend() {
  const run = SIM.run;
  if (run.floorIdx >= REGIONS.length - 1) { victory(); return; }
  Game.sub = 'transition'; sfx('portal');
  fadeTo(1, 0.6, () => { Game.sub = 'room'; enterFloor(run.floorIdx + 1, false); fadeTo(0, 0.6); });
}

/* ==========================================================================
   MUTATION ROLLS, CHOICE, SHOP, TUMOR
   ========================================================================== */
const RARITY_ORDER = ['common', 'uncommon', 'rare'];
function rollMutations(n, o = {}) {
  const P = SIM.player, f = SIM.floor ? SIM.floor.idx : 0;
  const min = o.minRarity ? RARITY_ORDER.indexOf(o.minRarity) : 0;
  const pool = MUTATIONS.filter(m => m.rarity !== 'malignant' && RARITY_ORDER.indexOf(m.rarity) >= min && P.canTake(m.id) && !(o.exclude && o.exclude.includes(m.id)));
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const m = (function () {
      const w = (mm) => RARITY[mm.rarity].weight[f] * (mm.rarity === 'rare' ? (o.rareBoost || 1) : 1) / Math.max(1, MUTATIONS.filter(x => x.rarity === mm.rarity).length);
      let tot = 0; for (const mm of pool) tot += w(mm);
      let r = Math.random() * tot;
      for (const mm of pool) { r -= w(mm); if (r <= 0) return mm; }
      return pool[pool.length - 1];
    })();
    out.push(m.id); pool.splice(pool.indexOf(m), 1);
  }
  return out;
}
function rollMalignant(n) {
  const P = SIM.player;
  const pool = MUTATIONS.filter(m => m.rarity === 'malignant' && P.canTake(m.id));
  return rndShuffle(pool).slice(0, n).map(m => m.id);
}
function rndShuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

function openMutationChoice(ids, source, onDone) {
  Game.sub = 'modal';
  const free = META.perks.reroll ? 1 : 0;
  let rerolls = free;
  const show = (opts) => UI.choice({
    title: source === 'boss' ? 'ADAPT' : 'MUTATE', sub: 'Choose one. The others dissolve.', options: opts.map(id => MUT[id]), rerolls,
    skipIron: 8 + SIM.floor.idx * 2,
    onPick(id) { SIM.player.addMutation(id); SIM.run.stats.mutations++; META.seenMut[id] = true; saveMeta(); sfx('pickup_mutation'); closeModal(); onDone && onDone(); },
    onSkip() { SIM.player.addIron(8 + SIM.floor.idx * 2, true); sfx('pickup_iron'); closeModal(); onDone && onDone(); },
    onReroll() { if (rerolls <= 0) return; rerolls--; sfx('reroll'); show(rollMutations(ids.length, { exclude: opts, minRarity: source === 'boss' ? 'uncommon' : null })); },
  });
  show(ids);
}
function closeModal() { Game.sub = 'room'; UI.closeModal(); }

function shopPrice(m) { const f = SIM.floor.idx; return Math.round(({ common: 20, uncommon: 30, rare: 44 }[m.rarity]) * (1 + 0.08 * f)); }
function makeShopStock() {
  const ids = rollMutations(3, {});
  const f = SIM.floor.idx;
  return [
    ...ids.map(id => ({ kind: 'mutation', id, price: shopPrice(MUT[id]), sold: false })),
    { kind: 'heal', price: Math.round(12 * (1 + 0.08 * f)), sold: false, repeat: true },
    { kind: 'mucus', price: Math.round(15 * (1 + 0.08 * f)), sold: false, repeat: true },
  ];
}
function openShop(stock) {
  Game.sub = 'modal';
  const P = SIM.player;
  const show = () => UI.shop({
    stock, iron: P.iron, hp: P.hp, maxHp: P.st.maxHp, noHeal: P.st.noHeal,
    onBuy(item) {
      if (item.sold || P.iron < item.price) { sfx('ui_error'); return; }
      if (item.kind === 'heal' && (P.hp >= P.st.maxHp || P.st.noHeal)) { sfx('ui_error'); return; }
      P.iron -= item.price; sfx('buy');
      if (item.kind === 'mutation') { P.addMutation(item.id); SIM.run.stats.mutations++; item.sold = true; META.seenMut[item.id] = true; saveMeta(); }
      else if (item.kind === 'heal') { P.heal(1); item.price = Math.round(item.price * 1.25); }
      else if (item.kind === 'mucus') { P.addShield(1); item.price = Math.round(item.price * 1.3); }
      Bus.emit('iron'); show();
    },
    onClose() { closeModal(); },
  });
  show();
}
function openTumor(offers, onDone) {
  Game.sub = 'modal';
  const P = SIM.player;
  UI.tumor({
    options: offers.map(id => MUT[id]), maxHp: P.st.maxHp,
    onPick(id) {
      const m = MUT[id];
      if (P.st.maxHp - m.cost < 1) { sfx('ui_error'); return; }
      P.addMutation(id); SIM.run.stats.mutations++; META.seenMut[id] = true; saveMeta();
      sfx('pickup_malignant'); Gfx.caPulse = 1; closeModal(); onDone && onDone();
    },
    onClose() { closeModal(); },
  });
}

/* ==========================================================================
   BOSS FLOW
   ========================================================================== */
function startBossIntro(room) {
  const floor = SIM.floor, id = floor.region.boss, def = BOSSES[id];
  Game.sub = 'intro'; Game.introT = 2.4;
  SIM.combatAllowed = false;
  try { AUDIO.music.play(id === 'sepsis' ? 'final' : 'boss', { region: floor.region.id }); } catch (e) { }
  const boss = spawnBoss(id, room.W / 2, room.H / 2 - 2.5);
  boss.spawning = 2.2; boss.spawnMax = 2.2;
  SIM.boss = boss;
  sfx('roar'); Gfx.addShake(0.6);
  UI.bossIntro(def);
}
function onBossKilled(e) {
  const run = SIM.run, room = SIM.room, P = SIM.player;
  run.stats.bossesKilled++;
  clearEShots(true); SIM.beams.length = 0; SIM.teles.length = 0; SIM.zones = SIM.zones.filter(z => z.owner === 'player');
  for (const o of SIM.enemies) if (!o.dead && o !== e) killEnemy(o, { src: 'boss' });
  SIM.slowmo = 1.4;
  sfx('boss_death'); Gfx.addShake(1); Gfx.caPulse = 1; Input.rumble(1, 600);
  for (let i = 0; i < 6; i++) after(i * 0.16 * 0.3, () => explode(e.x + rnd(-1.5, 1.5), e.y + rnd(-1.5, 1.5), 1.6, 0, { hex: e.color, fxOnly: true }));
  Gfx.splat(room, e.x, e.y, e.r * 2.4, e.color, 0.7);
  UI.hideBoss();
  const bossId = e.bossId;
  if (bossId === 'colony') unlock('macrophage');
  if (bossId === 'endocardia') unlock('tcell');
  after(1.6 * 0.3 + 0.4, () => {
    if (SIM.room !== room || !SIM.player) return;
    room.cleared = true; lockRoom(false); SIM.boss = null;
    P.heal(2);
    sfx('door_open');
    setupInteractables(room);
    try { AUDIO.music.play(SIM.floor.region.music); } catch (err) { }
    UI.toast(BOSSES[bossId].name + ' DESTROYED', 'The tissue settles. For now.', 'boss');
    run.stats.roomsCleared++;
  });
}

/* ==========================================================================
   UNLOCKS, END OF RUN
   ========================================================================== */
function unlock(key) {
  if (META.unlocks[key]) return;
  META.unlocks[key] = true; saveMeta();
  if (SIM.run) SIM.run.newUnlocks.push(key);
  UI.toast('UNLOCKED: ' + UNLOCKS[key].name, UNLOCKS[key].how, 'unlock');
  sfx('unlock');
}
function memoryEarned(run, won) {
  const base = Math.floor(run.stats.kills / 5) + run.floorIdx * 6 + run.stats.bossesKilled * 12 + (won ? 40 : 0);
  return Math.round(base * (1 + 0.25 * run.fever));
}
function endRun(won) {
  const run = SIM.run; if (!run || run.ended) return;
  run.ended = true; run.won = won;
  run.time = (performance.now() - run.startTime) / 1000 - (run.pausedTime || 0);
  const mem = memoryEarned(run, won);
  run.memory = mem;
  META.memory += mem; META.totalMemory += mem;
  META.stats.kills += run.stats.kills; META.stats.playTime += run.time;
  for (const t in run.killsByType) META.codex[t] = (META.codex[t] || 0) + run.killsByType[t];
  if (won) {
    META.stats.wins++;
    if (META.stats.bestTime == null || run.time < META.stats.bestTime) META.stats.bestTime = run.time;
    if (!META.unlocks.fever) unlock('fever');
    if (run.fever >= META.feverMax && META.feverMax < 5) META.feverMax = run.fever + 1;
  } else META.stats.deaths++;
  saveMeta();
}
function victory() {
  endRun(true);
  Game.state = 'over'; Game.sub = 'room';
  try { AUDIO.music.play('victory'); } catch (e) { }
  fadeTo(1, 1.0, () => { UI.showHUD(false); UI.summary(SIM.run, true); fadeTo(0, 0.6); });
}
Bus.on('playerDied', () => {
  Game.sub = 'dying'; Game.dyingT = 2.0; SIM.slowmo = 2.0;
  try { AUDIO.music.play('death'); } catch (e) { }
  endRun(false);
});
Bus.on('enemyKilled', (e) => { if (e.isBoss && e.isMainBoss !== false) onBossKilled(e); });

/* ==========================================================================
   MAIN LOOP
   ========================================================================== */
let lastT = performance.now();
function frame() {
  const now = performance.now();
  let rdt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (window.__SPLEEN && __SPLEEN.fixedDt) rdt = __SPLEEN.fixedDt;
  Input.update(rdt);
  if (Input.mute) { try { AUDIO.setMuted(!AUDIO.muted); UI.toast(AUDIO.muted ? 'MUTED' : 'SOUND ON', null, 'small'); } catch (e) { } }
  // fade
  if (Game.fade !== Game.fadeTarget) {
    Game.fade = approach(Game.fade, Game.fadeTarget, rdt * (Game.fadeSpeed || 4));
    if (Game.fade === Game.fadeTarget && Game.fadeCb) { const cb = Game.fadeCb; Game.fadeCb = null; cb(); }
  }
  UI.setFade(Game.fade);
  if (Game.state === 'play') playFrame(rdt);
  else {
    UI.menuFrame(rdt);
    if (Game.state === 'title') renderTitle(rdt);
    else if (Game.state === 'over' && SIM.room && SIM.player) { updateParticles(rdt * 0.3); renderFrame(rdt * 0.3, true); }
  }
  Input.endFrame();
}

function playFrame(rdt) {
  const P = SIM.player;
  // pause
  if (Input.pause && !P.dead && (Game.paused || Game.sub === 'room' || Game.sub === 'intro')) { togglePause(); renderFrame(0); return; }
  if (Game.paused) { UI.menuFrame(rdt); renderFrame(0); return; }
  if (Game.sub === 'modal') { UI.menuFrame(rdt); renderFrame(rdt * 0.2, true); return; }
  // mouse world pos
  Input.mouseWorld = Gfx.screenToWorld(Input.mouse.x, Input.mouse.y, 0.6);
  Input.playerPos = P;
  if (Game.autopilot) autopilot(rdt);
  // time scale
  let dt = rdt;
  if (SIM.slowmo > 0) { SIM.slowmo -= rdt; dt *= 0.3; }
  if (SIM.hitstop > 0) { SIM.hitstop -= rdt; dt *= 0.05; }
  // beat clock
  try { SIM.beat = AUDIO.music.clock(); } catch (e) { SIM.beat = { beat: SIM.time * SIM.floor.region.bpm / 60, bpm: SIM.floor.region.bpm }; }
  if (!SIM.beat || !isFinite(SIM.beat.beat)) SIM.beat = { beat: SIM.time * SIM.floor.region.bpm / 60, bpm: SIM.floor.region.bpm };
  // simulate (substep large frames)
  const steps = dt > 1 / 50 ? 2 : 1;
  for (let i = 0; i < steps; i++) simStep(dt / steps);
  // intro countdown
  if (Game.sub === 'intro') { Game.introT -= rdt; if (Game.introT <= 0) { Game.sub = 'room'; SIM.combatAllowed = true; } }
  if (Game.sub === 'dying') { Game.dyingT -= rdt; if (Game.dyingT <= 0) { Game.state = 'over'; Game.sub = 'room'; fadeTo(1, 0.6, () => { UI.showHUD(false); UI.summary(SIM.run, false); fadeTo(0, 0.4); }); } }
  // music intensity
  try { AUDIO.music.setIntensity(SIM.roomLocked && SIM.enemies.length ? 1 : (SIM.boss ? 1 : 0.15)); AUDIO.setLowpass(P.hp <= 1 && !P.dead && P.st.maxHp > 1); } catch (e) { }
  // low hp heartbeat
  if (P.hp === 1 && !P.dead && Game.sub === 'room') { SIM.lowHpT = (SIM.lowHpT || 0) - rdt; if (SIM.lowHpT <= 0) { SIM.lowHpT = 1.1; sfx('low_hp', { vol: 0.6 }); } }
  renderFrame(rdt);
  UI.hudFrame(rdt);
}

function simStep(dt) {
  const P = SIM.player;
  SIM.time += dt; SIM.roomTime += dt;
  if (Game.sub === 'room' || Game.sub === 'intro' || Game.sub === 'dying') {
    if (!P.dead) {
      if (Game.sub === 'intro') { SIM.combatAllowed = false; }
      P.update(dt);
    }
    World.updateFlow(SIM.room, P.x, P.y);
    updateRoomMechanic(dt);
    if (Game.sub !== 'intro' || true) updateEnemies(dt);
    updatePShots(dt); updateEShots(dt);
    updateZones(dt); updateTeles(dt); updateBeams(dt); updateLobs(dt);
    updatePickups(dt);
    if (Game.sub === 'room' && !P.dead) { updateRoomFlow(dt); updateInteract(dt); checkDoors(); }
  }
  updateTimers(dt);
  updateParticles(dt);
  Gfx.updateRoom(dt);
}

function togglePause() {
  Game.paused = !Game.paused;
  if (Game.paused) { Game.pauseStart = performance.now(); UI.pause(true); try { AUDIO.setLowpass(true); } catch (e) { } sfx('ui_open'); }
  else { SIM.run.pausedTime = (SIM.run.pausedTime || 0) + (performance.now() - Game.pauseStart) / 1000; UI.pause(false); try { AUDIO.setLowpass(false); } catch (e) { } }
}
function abandonRun() {
  if (Game.paused) togglePause();
  endRun(false);
  Game.state = 'over';
  UI.showHUD(false); UI.summary(SIM.run, false, true);
}
function toTitle() {
  clearWorld(true); SIM.run = null; SIM.floor = null; SIM.room = null;
  Game.state = 'title'; Game.sub = 'room'; Game.paused = false;
  UI.showHUD(false); UI.title();
  try { AUDIO.music.play('title'); } catch (e) { }
}

/* ==========================================================================
   RENDER SYNC
   ========================================================================== */
const _styleCache = {};
function renderFrame(dt, frozen) {
  const P = SIM.player, room = SIM.room;
  if (!room) { Gfx.render(dt); return; }
  Gfx.updateCamera(P.x, P.y, dt, false);
  Gfx.setPlayerLight(P.x, P.y, P.color, P.dead ? 0 : 1);
  animatePlayerVis(P, dt);
  if (frozen) { for (const e of SIM.enemies) animateEnemy(e, 0); }
  const pools = Gfx.pools;
  Gfx.beginPools();
  // shadows
  const sh = pools.shadow;
  if (!P.dead) sh.push(P.x, 0.01, -P.y, P.hitR * 1.6, 1, P.hitR * 1.6);
  for (const e of SIM.enemies) if (!e.burrowed && !e.dead) { const s = e.r * (e.fly ? 1.0 : 1.35) * (e.spawning > 0 ? 1 - e.spawning / e.spawnMax : 1); sh.push(e.x, 0.01, -e.y, s, 1, s); }
  for (const p of SIM.pickups) sh.push(p.x, 0.01, -p.y, 0.22, 1, 0.22);
  for (const c of SIM.companions) sh.push(c.x, 0.01, -c.y, 0.25, 1, 0.25);
  // player shots
  for (const s of SIM.pshots) {
    const st = SHOT_STYLES[s.style] || SHOT_STYLES.neut;
    const pool = Gfx.bulletPool('ps_' + s.style, 'sphereLo', st.hex, { glow: 1.0, k: 1.15 });
    const a = Math.atan2(s.vy, s.vx), fade = s.t > s.life - 0.08 ? (s.life - s.t) / 0.08 : 1;
    pool.push(s.x, s.h, -s.y, s.r * st.sx * fade, s.r * st.sy, s.r * st.sy * fade, a);
  }
  // enemy shots: glowing halo + white core (streaks for 'streak')
  for (const s of SIM.eshots) {
    if (s.delay > 0) continue;
    const hex = ESHOT_STYLES[s.style] || '#ff3d7f';
    const halo = Gfx.bulletPool('es_' + s.style, 'sphereLo', hex, { glow: 1.2, k: 1.0 });
    const core = Gfx.bulletPool('es_core', 'sphereLo', '#fff4f8', { glow: 0.5, k: 1.2 });
    const pop = s.t < 0.08 ? 0.5 + s.t / 0.16 : 1;
    if (s.streak) { const a = Math.atan2(s.vy, s.vx); halo.push(s.x, s.h, -s.y, s.r * 2.2, s.r, s.r, a); core.push(s.x, s.h + 0.02, -s.y, s.r * 1.3, s.r * 0.5, s.r * 0.5, a); }
    else { halo.push(s.x, s.h, -s.y, s.r * pop, s.r * pop, s.r * pop); core.push(s.x, s.h + 0.03, -s.y, s.r * 0.55, s.r * 0.55, s.r * 0.55); }
  }
  // particles
  for (const p of SIM.particles) {
    const k = 1 - p.t / p.life;
    Gfx.particlePool(p.hex).push(p.x, p.h, -p.y, p.size * k, p.size * k, p.size * k);
  }
  // telegraphs
  for (const t of SIM.teles) {
    const k = clamp(t.t / t.dur, 0, 1);
    if (t.kind === 'disc') {
      const pool = t.warm ? pools.teleWarm : pools.teleDisc;
      pool.push(t.x, 0.035, -t.y, t.r, 1, t.r);
      pool.push(t.x, 0.04, -t.y, t.r * k, 1, t.r * k);
    } else {
      const cx = t.x + Math.cos(t.ang) * t.len / 2, cy = t.y + Math.sin(t.ang) * t.len / 2;
      pools.teleLine.push(cx, 0.035, -cy, t.len / 2, 1, t.w / 2 * (0.4 + 0.6 * k), t.ang);
    }
  }
  // beams
  for (const b of SIM.beams) {
    const cx = b.x + Math.cos(b.ang) * b.len / 2, cy = b.y + Math.sin(b.ang) * b.len / 2;
    const flick = 0.85 + Math.sin(SIM.time * 60) * 0.15, k = b.t < 0.06 ? b.t / 0.06 : b.t > b.dur - 0.1 ? (b.dur - b.t) / 0.1 : 1;
    pools.beam.push(cx, 0.5, -cy, b.len / 2, 1, b.w / 2 * flick * k, b.ang);
    pools.beamCore.push(cx, 0.52, -cy, b.len / 2, 1, b.w / 5 * k, b.ang);
  }
  // zones
  for (const z of SIM.zones) {
    if (z.delay > 0) continue;
    const k = z.t < 0.2 ? z.t / 0.2 : z.t > z.life - 0.4 ? Math.max(0, (z.life - z.t) / 0.4) : 1;
    const pool = { spore: pools.zSpore, acid: pools.zAcid, net: pools.zNet, bio: pools.zBio, rot: pools.zRot, pull: pools.zPull }[z.kind] || pools.zSpore;
    const wob = 1 + Math.sin(SIM.time * 4 + z.x) * 0.04;
    pool.push(z.x, 0.025, -z.y, z.r * k * wob, 1, z.r * k * wob);
    if (z.kind === 'net') {
      pools.netRing.push(z.x, 0.06, -z.y, z.r * k, 0.12, z.r * k);
      const sp = Gfx.bulletPool('netStrand', 'plane', '#bff8ff', { glow: 0.1, alpha: 0.35, k: 0.7, max: 120 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI + z.x; sp.push(z.x, 0.05, -z.y, z.r * k, 1, 0.025, a); }
    }
  }
  // lobs
  for (const l of SIM.lobs) {
    const k = l.t / l.dur, x = lerp(l.x0, l.x1, k), y = lerp(l.y0, l.y1, k), h = 0.5 + l.peak * 4 * k * (1 - k);
    Gfx.bulletPool('lob_' + l.hex, 'sphere', l.hex, { glow: 0.9 }).push(x, h, -y, l.size, l.size, l.size);
    pools.shadow.push(x, 0.01, -y, l.size * 1.3, 1, l.size * 1.3);
  }
  // rings
  for (const r of SIM.rings) {
    const k = r.t / r.life, rr = r.r * (0.25 + 0.75 * easeOut(k));
    Gfx.bulletPool('ring_' + r.hex, 'torus', r.hex, { glow: 1.0, additive: true, max: 60 }).push(r.x, 0.15, -r.y, rr, 1 - k, rr);
  }
  // chain arcs
  for (const a of SIM.arcs) {
    const pool = Gfx.bulletPool('arc', 'plane', '#cfeaff', { glow: 1.2, max: 120 });
    let px = a.x0, py = a.y0;
    for (let i = 1; i <= 4; i++) {
      const k = i / 4, jx = i < 4 ? rnd(-0.3, 0.3) : 0, jy = i < 4 ? rnd(-0.3, 0.3) : 0;
      const nx = lerp(a.x0, a.x1, k) + jx, ny = lerp(a.y0, a.y1, k) + jy;
      const L = dist(px, py, nx, ny), ang = angleTo(px, py, nx, ny);
      pool.push((px + nx) / 2, 0.7, -(py + ny) / 2, L / 2, 1, 0.04, ang);
      px = nx; py = ny;
    }
  }
  // enemy latched antibodies (b-cell) drawn as little dots orbiting
  for (const e of SIM.enemies) {
    if (e.latches && e.latches.length && !e.dead) {
      const pool = Gfx.bulletPool('latch', 'sphereLo', '#c9bcff', { glow: 0.8, max: 200 });
      e.latches.forEach((L) => { const a = L.a + SIM.time * 2; pool.push(e.x + Math.cos(a) * e.r * 0.95, 0.6 + Math.sin(a * 2) * 0.1, -(e.y + Math.sin(a) * e.r * 0.95), 0.07, 0.07, 0.07); });
    }
  }
  Gfx.endPools();
  Gfx.render(dt);
  Gfx.drawOverlay(dt);
}

/* ==========================================================================
   AUTOPILOT (automated playtesting) + DEBUG
   ========================================================================== */
function bfsFrom(room, tx, ty) {
  const W = room.W, H = room.H, d = new Float32Array(W * H).fill(1e9);
  const q = [ty * W + tx]; d[ty * W + tx] = 0;
  const mask = MASK_PLAYER_OPEN;
  while (q.length) {
    const i = q.shift(), x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (World.blocked(room, nx, ny, mask)) continue;
      const ni = ny * W + nx; if (d[ni] <= d[i] + 1) continue; d[ni] = d[i] + 1; q.push(ni);
    }
  }
  return d;
}
function autopilot(dt) {
  const P = SIM.player, room = SIM.room;
  if (!P || P.dead) return;
  const A = Game.ap || (Game.ap = { goal: null, bfs: null, bfsKey: '', stuck: 0, lastX: 0, lastY: 0 });
  let mx = 0, my = 0, fire = false, dash = false;
  const tgt = nearestEnemy(P.x, P.y, 99);
  if (tgt) {
    const a = angleTo(P.x, P.y, tgt.x, tgt.y), d = dist(P.x, P.y, tgt.x, tgt.y);
    Input.aim.x = Math.cos(a); Input.aim.y = Math.sin(a); fire = true;
    const want = P.strain.weapon === 'spray' ? 2.6 : 4.5;
    const dir = d > want + 1 ? 1 : d < want - 0.5 ? -1 : 0;
    mx = Math.cos(a) * dir + Math.cos(a + Math.PI / 2) * 0.6; my = Math.sin(a) * dir + Math.sin(a + Math.PI / 2) * 0.6;
    if (dir > 0 && !World.los(room, P.x, P.y, tgt.x, tgt.y)) {
      const tx = Math.floor(tgt.x), ty = Math.floor(tgt.y), key = room.id + 'e' + tx + ',' + ty;
      if (A.bfsKey !== key) { A.bfs = bfsFrom(room, clamp(tx, 0, room.W - 1), clamp(ty, 0, room.H - 1)); A.bfsKey = key; }
      const s = stepDown(room, A.bfs, P); if (s) { mx = s.x; my = s.y; }
    }
  } else {
    // pickups / interactables / next room
    const it = SIM.interact.find(i => i.kind !== 'portal' || SIM.room.type === 'boss');
    const pk = SIM.pickups.find(p => p.kind === 'iron' || p.kind === 'mucus' || (p.kind === 'platelet' && P.hp < P.st.maxHp && !P.st.noHeal));
    let goal = null;
    if (pk) goal = { x: pk.x, y: pk.y };
    else if (it && (it.kind !== 'shop' || !A.shopped) && (it.kind !== 'tumor')) goal = { x: it.x, y: it.y, interact: true };
    else {
      // choose door toward nearest unvisited room (BFS over room graph)
      const fl = SIM.floor; const prev = new Map(); const q = [room.id]; prev.set(room.id, null);
      let found = null;
      while (q.length) { const id = q.shift(); const r = fl.rooms[id]; if (id !== room.id && (!r.visited || (!r.cleared && r.type !== 'shop'))) { found = id; break; } for (const d of r.doors) if (!prev.has(d.to)) { prev.set(d.to, id); q.push(d.to); } }
      if (found == null) found = fl.bossId;
      let step = found; while (prev.get(step) !== room.id && prev.get(step) != null) step = prev.get(step);
      const door = room.doors.find(d => d.to === step);
      if (door) { const ox = door.dir === 'W' ? -1 : door.dir === 'E' ? 1 : 0, oy = door.dir === 'N' ? -1 : door.dir === 'S' ? 1 : 0; goal = { x: door.x + ox, y: door.y + oy, door }; }
    }
    if (goal) {
      const tx = clamp(Math.floor(goal.x), 0, room.W - 1), ty = clamp(Math.floor(goal.y), 0, room.H - 1), key = room.id + 'g' + tx + ',' + ty;
      if (A.bfsKey !== key) { const g2 = room.grid[ty * room.W + tx]; A.bfs = bfsFrom(room, tx, ty); A.bfsKey = key; }
      const s = stepDown(room, A.bfs, P);
      if (s) { mx = s.x; my = s.y; } else { const a = angleTo(P.x, P.y, goal.x, goal.y); mx = Math.cos(a); my = Math.sin(a); }
      if (goal.interact && dist(P.x, P.y, goal.x, goal.y) < 1.6) { Input.interact = true; if (it.kind === 'shop') A.shopped = room.id; }
    }
  }
  // dodge: nearest threatening bullet
  let threat = null, td = 2.2;
  for (const s of SIM.eshots) { const d = dist(s.x, s.y, P.x, P.y); if (d < td && (s.vx * (P.x - s.x) + s.vy * (P.y - s.y)) > 0) { td = d; threat = s; } }
  if (threat) { const a = Math.atan2(threat.vy, threat.vx) + Math.PI / 2 * (((threat.id & 1) * 2) - 1); mx = mx * 0.3 + Math.cos(a); my = my * 0.3 + Math.sin(a); if (td < 0.9) dash = true; }
  for (const t of SIM.teles) if (t.kind === 'disc' && dist(t.x, t.y, P.x, P.y) < t.r + 0.4) { const a = angleTo(t.x, t.y, P.x, P.y); mx += Math.cos(a) * 1.5; my += Math.sin(a) * 1.5; }
  // stuck detection
  A.stuck = dist(P.x, P.y, A.lastX, A.lastY) < 0.02 ? A.stuck + dt : 0; A.lastX = P.x; A.lastY = P.y;
  if (A.stuck > 1.2) { mx = rnd(-1, 1); my = rnd(-1, 1); A.stuck = 0; }
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  Input.move.x = mx; Input.move.y = my; Input.firing = fire; Input.aimActive = fire; Input.dash = dash || (Input.dash && false);
  if (tgt && P.abilityT <= 0 && Math.random() < 0.02) Input.ability = true;
  Input.device = 'pad';
}
function stepDown(room, d, P) {
  if (!d) return null;
  const tx = Math.floor(P.x), ty = Math.floor(P.y), here = d[ty * room.W + tx];
  let best = here, bx = 0, by = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= room.W || ny >= room.H) continue;
    if (dx && dy && (World.blocked(room, tx + dx, ty, MASK_PLAYER_OPEN) || World.blocked(room, tx, ty + dy, MASK_PLAYER_OPEN))) continue;
    const v = d[ny * room.W + nx]; if (v < best) { best = v; bx = nx + 0.5 - P.x; by = ny + 0.5 - P.y; }
  }
  if (best >= here) return null;
  const l = Math.hypot(bx, by); return l > 0 ? { x: bx / l, y: by / l } : null;
}

/* ==========================================================================
   BOOT
   ========================================================================== */
function boot() {
  const params = new URLSearchParams(location.search);
  window.__SPLEEN = window.__SPLEEN || {};
  const D = window.__SPLEEN;
  D.Game = Game; D.SIM = SIM; D.META = META;
  if (params.get('debug')) { D.debug = true; }
  if (params.get('god')) SIM.godMode = true;
  if (params.get('floor')) D.startFloor = clamp(parseInt(params.get('floor')) - 1, 0, 5);
  if (params.get('mut')) D.presetMuts = params.get('mut').split(',');
  if (params.get('unlock')) D.unlockAll = true;
  D.startRun = startRun; D.enterFloor = enterFloor; D.toTitle = toTitle;
  D.killAll = () => { for (const e of SIM.enemies) if (!e.isBoss || true) dealDamage(e, 1e6, { pure: true, silent: true }); };
  D.render = (n = 1) => { for (let i = 0; i < n; i++) { renderFrame(1 / 60); UI.hudFrame(1 / 60); } };
  D.give = (id) => SIM.player && SIM.player.addMutation(id);
  D.gotoBoss = () => { const f = SIM.floor; for (const r of f.rooms) { if (r.type !== 'boss') { r.cleared = true; r.visited = true; } } enterRoom(f.bossId, null); };
  D.step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) { Input.update(dt); if (Game.state === 'play' && !Game.paused && Game.sub !== 'modal') { Input.mouseWorld = null; if (Game.autopilot) autopilot(dt); try { SIM.beat = AUDIO.music.clock(); } catch (e) { SIM.beat = { beat: SIM.time * 1.5 }; } let d = dt; if (SIM.slowmo > 0) { SIM.slowmo -= dt; d *= 0.3; } if (SIM.hitstop > 0) { SIM.hitstop -= dt; d *= 0.05; } simStep(d); if (Game.sub === 'intro') { Game.introT -= dt; if (Game.introT <= 0) { Game.sub = 'room'; SIM.combatAllowed = true; } } if (Game.sub === 'dying') { Game.dyingT -= dt; if (Game.dyingT <= 0) { Game.state = 'over'; } } if (Game.fadeCb) { const cb = Game.fadeCb; Game.fadeCb = null; Game.fade = Game.fadeTarget; cb(); } } else if (Game.sub === 'modal' && Game.autopilot) UI.autoPick && UI.autoPick(); Input.endFrame(); } };

  const canvas = document.getElementById('game'), overlay = document.getElementById('overlay');
  let q = META.opts.quality;
  if (q === 'auto') q = (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4) ? 'medium' : 'high';
  if (params.get('q')) q = params.get('q');
  try { Gfx.init(canvas, overlay, q); }
  catch (err) { UI.fatal('Your browser could not start WebGL. Try another browser or enable hardware acceleration.<br><small>' + err.message + '</small>'); return; }
  SIM.opts.dmgNumbers = META.opts.dmgNumbers; Gfx.shakeScale = META.opts.shake; Gfx.reduceFlash = !META.opts.flashes;
  const touchy = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  Input.touchEnabled = META.opts.touch === 'on' || (META.opts.touch === 'auto' && touchy && matchMedia('(pointer: coarse)').matches);
  document.body.classList.toggle('touch', Input.touchEnabled);
  try { if (window.AUDIO) { AUDIO.setVolume('master', META.opts.master); AUDIO.setVolume('music', META.opts.music); AUDIO.setVolume('sfx', META.opts.sfx); } } catch (e) { }
  UI.init();
  Gfx.engine().runRenderLoop(frame);
  Game.state = 'title';
  UI.title();
  try { AUDIO.music.play('title'); } catch (e) { }
  // quick-start for tests / debugging
  if (params.get('start')) { startRun(params.get('strain') || 'neutrophil', parseInt(params.get('fever') || '0'), params.get('seed') ? parseInt(params.get('seed')) : undefined); if (params.get('boss')) D.gotoBoss(); }
  if (params.get('auto')) Game.autopilot = true;
  document.getElementById('loading').classList.add('gone');
}
window.addEventListener('load', boot);
