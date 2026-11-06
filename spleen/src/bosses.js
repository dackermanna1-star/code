/* ==========================================================================
   SPLEEN: SEPSIS — bosses.js
   Six multi-phase bosses. Shared framework (phases, attack runner, beat
   clock) + per-boss visuals, attacks and update loops.
   Readability rules: every attack has a >=0.5s tell (windup glow/shake,
   ground telegraph and/or sound); bullets stay at 2.5–5 tiles/s; patterns
   always leave a gap.
   ========================================================================== */
"use strict";

/* ==========================================================================
   SHARED FRAMEWORK
   ========================================================================== */
const BOSS_FEV = () => (SIM.run && SIM.run.fever >= 5 ? 1.2 : 1);

function bossBase(id, x, y, o = {}) {
  const def = BOSSES[id];
  const hp = def.hp * floorHpMult() * (SIM.run && SIM.run.fever >= 5 ? 1.25 : 1);
  return {
    id: nextId(), type: 'boss_' + id, def: { ai: 'boss', speed: 0, name: def.name },
    x, y, vx: 0, vy: 0, kx: 0, ky: 0, r: o.r || def.r, fly: !!o.fly, color: def.color, core: def.core, cost: 0,
    state: 0, t: 0, cd: 1.3, facing: Math.PI / 2, spawning: 2.2, spawnMax: 2.2, elite: null, capsule: 0,
    data: {}, mass: 20, rate: 1, speedK: 1, dead: false, summoned: false, zoneSlow: 1,
    isBoss: true, bossId: id, stunImmune: true, anchored: true, hp, maxHp: hp, phase: 1,
    phaseMarks: o.marks || [], atk: null, lastAtk: null, pause: 0, noCollide: !!o.noCollide,
  };
}
function bossFinish(e, vis) {
  e.vis = vis; e.node = vis.root;
  e.node.position.set(e.x, 0, -e.y);
  SIM.enemies.push(e);
  return e;
}
/** run fn later in sim time, but only if the boss is still alive */
function later(e, sec, fn) { after(sec, () => { if (!e.dead) fn(); }); }
/** true exactly once when attack time passes `time` */
function at(A, time) {
  if (!A.f) A.f = {};
  if (A.t >= time && !A.f[time]) { A.f[time] = true; return true; }
  return false;
}
/** distance from (x,y) along angle a to the arena's inner wall (capped at max) */
function arenaLen(x, y, a, max) {
  const room = SIM.room, c = Math.cos(a), s = Math.sin(a);
  let t = max;
  if (c > 1e-6) t = Math.min(t, (room.W - 1 - x) / c); else if (c < -1e-6) t = Math.min(t, (1 - x) / c);
  if (s > 1e-6) t = Math.min(t, (room.H - 1 - y) / s); else if (s < -1e-6) t = Math.min(t, (1 - y) / s);
  return Math.max(0.5, t);
}
function clampArena(x, y, m = 1.6) {
  const room = SIM.room;
  return { x: clamp(x, m, room.W - m), y: clamp(y, m, room.H - m) };
}
function aliveBy(e, tag) { let n = 0; for (const o of SIM.enemies) if (!o.dead && o.summoner === e.id && (!tag || o.type === tag)) n++; return n; }
function summon(e, type, x, y, o = {}) {
  const p = clampArena(x, y, 1.8);
  const m = spawnEnemy(type, p.x, p.y, Object.assign({ summoned: true }, o));
  m.summoner = e.id; m.spawning = o.spawn != null ? o.spawn : 0.45; m.spawnMax = m.spawning;
  return m;
}
/** phase check: marks = HP fractions where phases begin */
function bossPhaseCheck(e, onPhase) {
  const marks = e.phaseMarks;
  if (e.phase - 1 >= marks.length) return false;
  if (e.hp / e.maxHp > marks[e.phase - 1]) return false;
  e.phase++;
  e.atk = null; e.cd = 0.6; e.pause = 1.2;
  // reset visual tells that only the interrupted attack would have decayed
  const Dd = e.data; Dd.inhale = 0; Dd.sink = 0; Dd.rolling = false; Dd.wind = 0; Dd.swell = 0; Dd.spasm = 0; Dd.rear = 0;
  sfx('boss_phase'); Gfx.addShake(0.7); Gfx.caPulse = 0.9;
  addRing(e.x, e.y, e.r * 3.2, e.color, 0.6);
  burst(e.x, e.y, e.color, 30, 6, { life: 0.7, size: 0.12, up: 4 });
  e.data.phaseFlash = 1;
  if (onPhase) onPhase(e, e.phase);
  return true;
}
/** attack runner: pools[phase-1] lists attack names; ATK[name](e,A,dt) returns true when done */
function runAttacks(e, dt, pools, cds, ATK) {
  if (e.pause > 0) { e.pause -= dt; return; }
  if (e.atk) {
    const A = e.atk; A.t += dt;
    if (ATK[A.name](e, A, dt)) { e.atk = null; e.cd = cds[Math.min(cds.length - 1, e.phase - 1)] / BOSS_FEV() * rnd(0.85, 1.15); }
    return;
  }
  e.cd -= dt;
  if (e.cd > 0) return;
  const pool = pools[Math.min(pools.length - 1, e.phase - 1)];
  let opts = pool.filter(n => n !== e.lastAtk && (!ATK[n + '_ok'] || ATK[n + '_ok'](e)));
  if (!opts.length) opts = pool;
  const name = rndPick(opts);
  e.lastAtk = name; e.atk = { name, t: 0, f: {}, d: {} };
}
/** remove this boss's live beams / telegraphs (phase transitions) */
function clearBossHazards(e) {
  for (let i = SIM.beams.length - 1; i >= 0; i--) if (SIM.beams[i].owner === e) SIM.beams.splice(i, 1);
  for (let i = SIM.teles.length - 1; i >= 0; i--) if (SIM.teles[i].owner === e) SIM.teles.splice(i, 1);
}
/**
 * Beat clock: follows the music clock when it advances at a plausible rate,
 * otherwise runs an internal sim-time clock (muted audio, headless, tab hiccups).
 */
function bossBeat(e, dt, bpmFallback) {
  const D = e.data;
  const ext = SIM.beat && isFinite(SIM.beat.beat) ? SIM.beat.beat : 0;
  const bpm = (SIM.beat && SIM.beat.bpm > 30 && SIM.beat.bpm < 300) ? SIM.beat.bpm : bpmFallback;
  const bps = bpm / 60;
  // gap in calls (game pause; music clock kept running): skip the missed beats and the rate window
  if (D.lastExt != null && (ext - D.lastExt > 1.5 || ext < D.lastExt)) {
    D.extStart = ext; D.bw = 0;
    if (D.useExt) { D.lastB = Math.floor(ext); D.lastHB = Math.floor(ext * 2); }
  }
  D.lastExt = ext;
  D.ib = (D.ib || 0) + dt * bps;
  if (D.extStart == null) { D.extStart = ext; D.bw = 0; D.extRate = 0; }
  D.bw += dt;
  if (D.bw >= 0.5) { D.extRate = (ext - D.extStart) / D.bw; D.extStart = ext; D.bw = 0; }
  const useExt = D.extRate > bps * 0.6 && D.extRate < bps * 1.6;
  if (useExt !== D.useExt) { D.useExt = useExt; D.lastB = null; D.lastHB = null; }
  const bf = useExt ? ext : D.ib;
  const bi = Math.floor(bf), hi = Math.floor(bf * 2);
  let beat = false, half = false;
  if (D.lastB == null) D.lastB = bi; else if (bi !== D.lastB) { D.lastB = bi; beat = true; }
  if (D.lastHB == null) D.lastHB = hi; else if (hi !== D.lastHB) { D.lastHB = hi; half = !beat; }
  D.beatPhase = bf - bi;
  return { beat, half, bps };
}
/** ground spike burst used by root eruptions */
function spikeAt(x, y, r, hex) {
  burst(x, y, hex, 10, 4, { life: 0.45, size: 0.09, up: 7 });
  burst(x, y, '#ffffff', 4, 2, { life: 0.25, size: 0.06, up: 5 });
  addRing(x, y, r, hex, 0.3);
  sfx('emerge', { vol: 0.45, rate: rnd(1.2, 1.5) });
  Gfx.addShake(0.08);
  const P = SIM.player;
  if (P && !P.dead && dist2(P.x, P.y, x, y) < (r * 0.9 + P.hitR) ** 2) hurtPlayer(1, { kind: 'root', x, y });
}
function rootEruption(e, n, hex, delay0 = 0.95) {
  const P = SIM.player;
  const spots = [clampArena(P.x + P.vx * 0.25, P.y + P.vy * 0.25)];
  for (let i = 1; i < n; i++) {
    const a = rnd(0, TAU), d = rnd(1.8, 4.2);
    spots.push(clampArena(P.x + Math.cos(a) * d, P.y + Math.sin(a) * d));
  }
  spots.forEach((s, i) => telegraph({ kind: 'disc', x: s.x, y: s.y, r: 1.05, dur: delay0 + i * 0.09, owner: e, then: () => spikeAt(s.x, s.y, 1.05, hex) }));
  sfx('windup', { rate: 0.6, vol: 0.6 });
  return delay0 + n * 0.09;
}
/** tentacle chain: nodes rotated around local Y for sway; local +X points outward */
function tentacle(parent, ang, x0, segs, step, r0, r1, mat, tipMat) {
  const root = Gfx.node('tent'); root.parent = parent; root.rotation.y = ang;
  const nodes = []; let prev = root;
  for (let i = 0; i < segs; i++) {
    const n = Gfx.node('tseg'); n.parent = prev; n.position.x = i === 0 ? x0 : step;
    const rr = lerp(r0, r1, segs > 1 ? i / (segs - 1) : 0);
    Gfx.part('sphere', (i === segs - 1 && tipMat) ? tipMat : mat, n, 0, rr * 0.85, 0, rr * 1.35, rr, rr);
    nodes.push(n); prev = n;
  }
  return { root, nodes, ph: rnd(0, TAU) };
}
function swayTentacle(T, t, amp, speed) { T.nodes.forEach((n, i) => { n.rotation.y = Math.sin(t * speed + i * 0.7 + T.ph) * amp; }); }

/* --------------------------------------------------------------------------
   Damage forwarding (worm segments -> head) and illusions (decoys pop).
   Wraps the global dealDamage so every damage source is covered.
   -------------------------------------------------------------------------- */
(function hookBossDamage() {
  const base = dealDamage;
  dealDamage = function (e, amount, o = {}) {
    if (e && e.illusion) { if (!e.dead && !(e.spawning > 0)) popIllusion(e); return 0; }
    if (e && e.forward) {
      const head = e.forward;
      if (e.dead || head.dead || e.burrowed || e.spawning > 0 || head.invuln) return 0;
      e.hurtT = 0.09;
      let amt = amount * enemyDamageMult(e) * 0.5;
      // execute bonus checks the head's HP (segments sit at hp = maxHp = 1e9)
      const P = SIM.player;
      if (P && P.st && P.st.execute && head.hp < head.maxHp * P.st.execute) amt *= 1.15;
      const d = base(head, amt, Object.assign({}, o, { pure: true, silent: true, x: o.x != null ? o.x : e.x, y: o.y != null ? o.y : e.y }));
      if (d > 0 && SIM.opts.dmgNumbers && !o.silent) {
        Gfx.floatText(e.x + rnd(-0.2, 0.2), e.y, Math.max(1, Math.round(d)).toString(), o.crit ? '#ffe066' : o.dot ? (o.dotHex || '#ffa060') : '#ffffff', o.crit ? 19 : 13, { crit: o.crit, h: 1.0 + e.r });
      }
      return d;
    }
    if (e && e.headMult) amount *= e.headMult;
    return base(e, amount, o);
  };
})();
function popIllusion(e) {
  e.dead = true;
  burst(e.x, e.y, '#7cf7ff', 18, 4, { life: 0.4, size: 0.08, h: 1.2 });
  addRing(e.x, e.y, 1.4, '#7cf7ff', 0.3);
  enemyRing(e.x, e.y, 4, 3.6, { style: 'volt', a0: rnd(0, TAU) });
  sfx('teleport', { rate: 1.4, vol: 0.7 });
}

/* ==========================================================================
   1. THE COLONY — a bacterial city that sheds itself as it dies
   ========================================================================== */
function visColony(e) {
  const root = Gfx.node('boss_colony'), b = Gfx.node('bcol'); b.parent = root;
  const R = BOSSES.colony.r;
  const mA = Gfx.cellMat(e.color, { rim: 1.45, core: 0.3, glow: 0.3 });
  const mB = Gfx.cellMat('#9ad83a', { rim: 1.4, core: 0.3, glow: 0.25 });
  const mC = Gfx.cellMat('#f0ff8a', { rim: 1.5, core: 0.35, glow: 0.35 });
  const coreMat = Gfx.cellMat(e.core, { rim: 1.2, core: 0.55, glow: 0.35 });
  const core = Gfx.part('sphere', coreMat, b, 0, R, 0, R * 0.6);
  const glowCore = Gfx.part('sphere', Gfx.glowMat('#fff6a0', { glow: 0.9 }), b, 0, R, 0, R * 0.25);
  const cocci = [];
  const N = 30;
  for (let i = 0; i < N; i++) {
    const yv = 1 - 2 * (i + 0.5) / N, rad = Math.sqrt(1 - yv * yv), th = i * 2.399963;
    const dx = Math.cos(th) * rad, dz = Math.sin(th) * rad;
    const s = R * rnd(0.28, 0.38);
    const m = Gfx.part('sphere', i % 4 === 0 ? mB : i % 7 === 0 ? mC : mA, b, dx * R * 0.82, R + yv * R * 0.8, dz * R * 0.82, s);
    cocci.push({ m, s, dx, dy: yv, dz, ph: rnd(0, TAU) });
  }
  // shed order: random
  const order = cocci.map((c, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
  let rollX = 0, rollZ = 0;
  return {
    root, b, body: core, cocci, order,
    anim(e, t, dt) {
      const D = e.data, sc = D.sc || 1;
      const wind = D.wind || 0, sw = D.swell || 0;
      const hit = e.hurtT > 0 ? 1.035 : 1;
      b.scaling.setAll(sc * hit * (1 + sw * 0.08 + Math.sin(t * 2.2) * 0.015));
      b.position.x = wind ? Math.sin(t * 61) * 0.09 * wind : 0;
      b.position.z = wind ? Math.cos(t * 53) * 0.07 * wind : 0;
      if (D.rolling) { rollZ -= e.vx * dt / Math.max(0.5, e.r); rollX -= e.vy * dt / Math.max(0.5, e.r); b.rotation.z = rollZ; b.rotation.x = rollX; }
      else { b.rotation.z *= 0.92; b.rotation.x *= 0.92; rollX = b.rotation.x; rollZ = b.rotation.z; b.rotation.y += dt * 0.25; }
      const shown = D.shown != null ? D.shown : N;
      for (let k = 0; k < N; k++) {
        const c = cocci[order[k]];
        const vis = k < shown;
        if (c.m.isEnabled() !== vis) c.m.setEnabled(vis);
        if (vis) c.m.scaling.setAll(c.s * (1 + Math.sin(t * 5 + c.ph) * 0.07 + sw * 0.12));
      }
      glowCore.scaling.setAll(R * (0.22 + wind * 0.15 + sw * 0.12 + (D.phaseFlash || 0) * 0.2));
    },
  };
}
const COLONY_ATK = {
  roll(e, A, dt) {
    const D = e.data, room = SIM.room;
    if (A.step == null) {
      A.step = 0; A.ang = toPlayer(e).a; sfx('windup', { rate: 0.7 });
      telegraph({ kind: 'line', x: e.x, y: e.y, ang: A.ang, len: 9, w: e.r * 1.8, dur: 0.75, owner: e, follow: (t) => { t.x = e.x; t.y = e.y; t.ang = A.ang; t.w = e.r * 1.8; } });
    }
    if (A.step === 0) {
      A.ang = lerpAngle(A.ang, toPlayer(e).a, damp(3.5, dt));
      D.wind = Math.min(1, A.t / 0.75);
      if (A.t >= 0.75) { A.step = 1; A.t0 = A.t; D.wind = 0; A.dx = Math.cos(A.ang); A.dy = Math.sin(A.ang); A.bounces = 0; D.rolling = true; sfx('charge', { rate: 0.6 }); }
      return false;
    }
    if (A.step === 1) {
      const sp = (e.phase >= 2 ? 7.4 : 6.6) * D.spd * (e._k || 1);
      let bounced = false;
      const m = e.r + 0.15;
      if (e.x - e.r < 1.1 && A.dx < 0) { A.dx = -A.dx; bounced = true; }
      if (e.x + e.r > room.W - 1.1 && A.dx > 0) { A.dx = -A.dx; bounced = true; }
      if (e.y - e.r < 1.1 && A.dy < 0) { A.dy = -A.dy; bounced = true; }
      if (e.y + e.r > room.H - 1.1 && A.dy > 0) { A.dy = -A.dy; bounced = true; }
      if (!bounced) {
        const bx = World.blockedAt(room, e.x + A.dx * m, e.y, MASK_WALKER), by = World.blockedAt(room, e.x, e.y + A.dy * m, MASK_WALKER);
        if (bx) { A.dx = -A.dx; bounced = true; }
        if (by) { A.dy = -A.dy; bounced = true; }
      }
      if (bounced) {
        A.bounces++;
        Gfx.addShake(0.35); sfx('hit_armor', { rate: 0.45, vol: 0.9 });
        burst(e.x + A.dx * -e.r, e.y + A.dy * -e.r, e.color, 12, 4, { life: 0.4, size: 0.1 });
        if (e.phase >= 2) { enemyRing(e.x, e.y, 10, 3.8, { style: 'pink', a0: rnd(0, TAU) }); sfx('enemy_shoot_big', { vol: 0.6 }); }
        // nudge toward the player so rolls keep pressure but stay readable
        const a = Math.atan2(A.dy, A.dx), na = a + clamp(angDiff(a, toPlayer(e).a), -0.3, 0.3);
        A.dx = Math.cos(na); A.dy = Math.sin(na);
      }
      setVel(e, Math.atan2(A.dy, A.dx), sp);
      if (Math.random() < 0.5) burst(e.x, e.y, e.color, 1, 1.5, { life: 0.35, size: 0.09, h: 0.2 });
      if (A.t - A.t0 >= 2.1 || A.bounces >= 4) { A.step = 2; A.t1 = A.t; D.rolling = false; }
      return false;
    }
    e.vx = e.vy = 0;
    return A.t - A.t1 >= 0.6;
  },
  spew(e, A) {
    const D = e.data;
    if (at(A, 0)) { sfx('windup', { vol: 0.55, rate: 1.2 }); }
    D.swell = A.t < 0.55 ? A.t / 0.55 : Math.max(0, (D.swell || 0) - 0.05);
    const n = e.phase >= 2 ? 7 : 5, spread = e.phase >= 2 ? 1.15 : 0.9;
    for (let i = 0; i < 3; i++) {
      if (at(A, 0.55 + i * 0.42)) {
        const a = toPlayer(e).a + (i === 1 ? spread / (n - 1) / 2 : 0);
        enemyFan(e.x + Math.cos(a) * e.r * 0.7, e.y + Math.sin(a) * e.r * 0.7, a, n, spread, e.phase >= 2 ? 4.4 : 4.0, { style: 'pink' });
        sfx('enemy_shoot_big', { vol: 0.8 }); D.swell = 0.7;
      }
    }
    return A.t >= 1.75;
  },
  bud(e, A) {
    const D = e.data;
    if (at(A, 0)) sfx('windup', { rate: 0.9, vol: 0.5 });
    D.swell = Math.min(1, A.t / 0.6);
    if (at(A, 0.6)) {
      const alive = aliveBy(e);
      const n = Math.min(6 - alive, e.phase >= 2 ? 3 : 2);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, TAU);
        const c = summon(e, 'coccus', e.x + Math.cos(a) * (e.r + 0.5), e.y + Math.sin(a) * (e.r + 0.5));
        c.kx = Math.cos(a) * 4; c.ky = Math.sin(a) * 4;
      }
      if (n > 0) sfx('split'); else { enemyRing(e.x, e.y, 12, 3.4, { style: 'pink' }); sfx('enemy_shoot_big'); }
      D.swell = 0;
    }
    return A.t >= 1.05;
  },
  burst(e, A) {
    const D = e.data;
    if (at(A, 0)) { sfx('windup', { rate: 0.8, vol: 0.7 }); telegraph({ kind: 'disc', x: e.x, y: e.y, r: e.r + 1.4, dur: 0.6, warm: true, owner: e }); }
    D.swell = A.t < 0.6 ? A.t / 0.6 : 0;
    if (at(A, 0.6)) { const g = toPlayer(e).a + rnd(-0.8, 0.8); enemyRing(e.x, e.y, 18, 3.5, { style: 'pink', gap: { a: g, w: 0.42 }, a0: rnd(0, TAU) }); sfx('enemy_shoot_big'); A.g = g; }
    if (at(A, 1.05)) { enemyRing(e.x, e.y, 18, 3.5, { style: 'pink', gap: { a: A.g + 0.6, w: 0.42 }, a0: rnd(0, TAU) }); sfx('enemy_shoot_big'); }
    return A.t >= 1.4;
  },
};
COLONY_ATK.bud_ok = (e) => aliveBy(e) < 5;
function updColony(e, dt, k) {
  const D = e.data, room = SIM.room;
  e._k = k;
  const frac = clamp(e.hp / e.maxHp, 0, 1);
  D.sc = 0.6 + 0.4 * frac;
  e.r = BOSSES.colony.r * D.sc;
  D.spd = 1 + (1 - frac) * 0.45;
  D.phaseFlash = Math.max(0, (D.phaseFlash || 0) - dt);
  // shedding: cocci break off as HP drops
  const N = e.vis.cocci.length;
  const want = Math.ceil(N * (0.25 + 0.75 * frac));
  if (D.shown == null) D.shown = N;
  while (D.shown > want) {
    D.shown--;
    const c = e.vis.cocci[e.vis.order[D.shown]];
    const wx = e.x + c.dx * e.r * 0.85, wy = e.y - c.dz * e.r * 0.85;
    burst(wx, wy, e.color, 8, 3.5, { life: 0.45, size: 0.09, up: 3, h: e.r });
    Gfx.splat(room, wx, wy, 0.35, e.color, 0.4);
    if (Math.random() < 0.3) sfx('split', { vol: 0.4, rate: rnd(1.1, 1.4) });
  }
  bossPhaseCheck(e, (e) => {
    enemyRing(e.x, e.y, 16, 3.2, { style: 'pink', a0: rnd(0, TAU) });
    sfx('roar', { rate: 1.25, vol: 0.7 });
  });
  e.vx = e.vy = 0;
  if (!e.atk && e.pause <= 0) {
    // idle: lumber toward the player
    chase(e, 0.85 * D.spd * k);
  }
  D.wind = e.atk && e.atk.name === 'roll' ? D.wind : 0;
  if (!e.atk) D.swell = Math.max(0, (D.swell || 0) - dt * 2);
  runAttacks(e, dt, [['roll', 'spew', 'bud', 'spew', 'roll'], ['roll', 'spew', 'bud', 'burst', 'roll', 'burst']], [1.45, 1.0], COLONY_ATK);
}
function spawnColony(x, y) {
  const e = bossBase('colony', x, y, { marks: [0.5] });
  e.update = updColony;
  e.anchored = true;
  return bossFinish(e, visColony(e));
}

/* ==========================================================================
   2. ENDOCARDIA — the valve parasite that keeps time
   ========================================================================== */
function visEndocardia(e) {
  const root = Gfx.node('boss_endo'), b = Gfx.node('bendo'); b.parent = root;
  const R = e.r;
  const flesh = Gfx.cellMat(e.color, { rim: 1.45, core: 0.3, glow: 0.3, dark: 0.55 });
  const dark = Gfx.cellMat('#8a1a3a', { rim: 1.3, core: 0.3, glow: 0.15, dark: 0.6 });
  const tip = Gfx.cellMat('#ffb0d0', { rim: 1.6, core: 0.5, glow: 0.5 });
  const body = Gfx.part('sphere', flesh, b, 0, R * 0.8, 0, R, R * 0.8, R);
  const coreM = Gfx.part('sphere', Gfx.glowMat('#ffd0e8', { glow: 1.0 }), b, 0, R * 1.35, 0, R * 0.32);
  const leaflets = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU + 0.3;
    const n = Gfx.node('leaf'); n.parent = b; n.rotation.y = a;
    const m = Gfx.part('sphere', dark, n, R * 0.45, R * 1.25, 0, R * 0.55, R * 0.18, R * 0.38);
    m.rotation.z = 0.5;
    leaflets.push({ n, m });
  }
  // ring of ventricle bumps
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; Gfx.part('sphereLo', dark, b, Math.cos(a) * R * 0.9, R * 0.35, Math.sin(a) * R * 0.9, R * 0.3); }
  const tents = [];
  for (let i = 0; i < 4; i++) tents.push(tentacle(b, Math.PI / 4 + i * Math.PI / 2, R * 0.85, 6, 0.5, 0.34, 0.16, flesh, tip));
  return {
    root, b, body,
    anim(e, t, dt) {
      const D = e.data;
      D.pulse = Math.max(0, (D.pulse || 0) - dt * 3.2);
      D.pre = Math.max(0, (D.pre || 0) - dt * 2);
      const s = 1 + D.pulse * 0.13 + (e.hurtT > 0 ? 0.03 : 0) + Math.sin(t * 1.8) * 0.01;
      body.scaling.set(R * s, R * 0.8 * (1 + D.pulse * 0.2), R * s);
      coreM.scaling.setAll(R * (0.3 + D.pulse * 0.12 + D.pre * 0.1 + (D.phaseFlash || 0) * 0.2));
      leaflets.forEach((L, i) => { L.n.rotation.y = i / 3 * TAU + 0.3 + Math.sin(t * 1.3 + i) * 0.1; L.m.rotation.z = 0.5 + D.pulse * 0.5; });
      tents.forEach((T, i) => swayTentacle(T, t, 0.16 + D.pulse * 0.12 + (D.sweep ? 0.1 : 0), 2.2 + (e.phase || 1) * 0.5));
    },
  };
}
const ENDO_ATK = {}; // endocardia runs on the beat; see updEndocardia
function endoRing(e) {
  const D = e.data;
  D.ringN = (D.ringN || 0) + 1;
  const n = e.phase >= 3 ? 20 : e.phase >= 2 ? 16 : 18;
  const gapA = toPlayer(e).a + Math.sin(D.ringN * 0.7) * 1.1;
  enemyRing(e.x, e.y, n, e.phase >= 2 ? 3.3 : 3.6, { style: 'pink', gap: { a: gapA, w: 0.46 }, a0: rnd(0, TAU) });
  sfx('enemy_shoot_big', { vol: 0.7 });
}
function endoSpecial(e, kind, bps) {
  const D = e.data;
  const beatSec = Math.max(0.55, 1 / bps);
  if (kind === 'sweep') {
    const n = e.phase >= 2 ? 3 : 2, a0 = toPlayer(e).a + Math.PI / n, dir = (D.sweepDir = -(D.sweepDir || 1));
    sfx('beam_charge', { vol: 0.8 });
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU;
      telegraph({ kind: 'line', x: e.x, y: e.y, ang: a, len: 17, w: 0.85, dur: beatSec * 1.4, owner: e, follow: (t) => { t.x = e.x; t.y = e.y; t.len = arenaLen(t.x, t.y, t.ang, 17); } });
      later(e, beatSec * 1.4, () => {
        spawnBeam(e.x, e.y, a, 17, 0.85, beatSec * 4.2, { owner: e, spin: dir * (e.phase >= 3 ? 0.5 : 0.42), hex: '#ff6aa8', follow: (b) => { b.x = e.x; b.y = e.y; b.len = arenaLen(b.x, b.y, b.ang, 17); } });
        if (i === 0) { sfx('beam_fire'); D.sweep = true; later(e, beatSec * 4.2, () => { D.sweep = false; }); }
      });
    }
    D.quietUntil = SIM.time + beatSec * (e.phase >= 2 ? 1.4 : 5.6);
  } else if (kind === 'virions') {
    const alive = aliveBy(e);
    const n = Math.min(2, 4 - alive);
    for (let i = 0; i < n; i++) { const a = toPlayer(e).a + (i ? 1 : -1) * 1.2; summon(e, 'virion', e.x + Math.cos(a) * 2.6, e.y + Math.sin(a) * 2.6); }
    if (n > 0) sfx('split'); else endoRing(e);
  } else if (kind === 'volley') {
    D.volley = 3;
    D.pre = 1; // core flare
    sfx('windup', { rate: 1.2, vol: 0.6 });
    telegraph({ kind: 'line', x: e.x, y: e.y, ang: toPlayer(e).a, len: 8, w: 0.5, dur: Math.min(0.7, beatSec * 0.9), owner: e, follow: (t) => { t.x = e.x; t.y = e.y; t.ang = toPlayer(e).a; } });
  }
}
function updEndocardia(e, dt, k) {
  const D = e.data;
  D.phaseFlash = Math.max(0, (D.phaseFlash || 0) - dt);
  bossPhaseCheck(e, (e, ph) => {
    clearEShots(true);
    D.special = 2;
    if (ph === 3) { e.anchored = false; sfx('roar', { rate: 0.9, vol: 0.8 }); }
  });
  e.vx = e.vy = 0;
  const B = bossBeat(e, dt, 76);
  if (e.pause > 0) { e.pause -= dt; return; }
  if (e.phase >= 3) {
    // drifts toward the player, never too close to the walls
    const tp = toPlayer(e);
    if (tp.d > 3.2) setVel(e, tp.a, 0.85 * k);
    const c = clampArena(e.x, e.y, 3); e.x = c.x; e.y = c.y;
  }
  if (B.beat) {
    D.pulse = 1; D.beatCount = (D.beatCount || 0) + 1;
    const bc = D.beatCount;
    if (D.special == null) D.special = 6;
    D.special--;
    const every = e.phase >= 2 ? 1 : 2;
    if (D.volley > 0) {
      D.volley--;
      if (D.volley > 0) D.pre = 1; // flare before each remaining fan
      enemyFan(e.x, e.y, toPlayer(e).a, 5, 0.75, 4.6, { style: 'red' });
      sfx('enemy_shoot', { vol: 0.8 });
    } else if (D.special <= 0) {
      const pool = e.phase >= 2 ? ['sweep', 'virions', 'volley', 'sweep'] : ['sweep', 'virions', 'volley'];
      let opts = pool.filter(p => p !== D.lastSpecial); const kind = rndPick(opts);
      D.lastSpecial = kind;
      endoSpecial(e, kind, B.bps);
      D.special = Math.max(3, Math.round((e.phase >= 3 ? 5 : e.phase >= 2 ? 6 : 7) / BOSS_FEV()));
    } else if (bc % every === 0 && !(D.quietUntil && SIM.time < D.quietUntil)) {
      endoRing(e);
    } else if (every === 2) {
      D.pre = 1; // off-beat tell: the core flares before the next ring
    }
  } else if (B.half && e.phase >= 3) {
    // half-beat accents in the last phase
    const a = toPlayer(e).a;
    for (let i = -1; i <= 1; i++) spawnEShot(e.x, e.y, a + i * 0.22, 4.4, { style: 'red', r: 0.15 });
    sfx('enemy_shoot', { vol: 0.45, rate: 1.3 });
  }
}
function spawnEndocardia(x, y) {
  const e = bossBase('endocardia', x, Math.min(y, 5.5), { marks: [0.6, 0.25], fly: true });
  e.update = updEndocardia;
  return bossFinish(e, visEndocardia(e));
}

/* ==========================================================================
   3. ASPERGILL — the bloom that breathes for you
   ========================================================================== */
function visAspergill(e) {
  const root = Gfx.node('boss_asp'), b = Gfx.node('basp'); b.parent = root;
  const R = e.r;
  const mint = Gfx.cellMat(e.color, { rim: 1.4, core: 0.3, glow: 0.28, dark: 0.55 });
  const deep = Gfx.cellMat('#3a9a7a', { rim: 1.3, core: 0.35, glow: 0.2, dark: 0.6 });
  const sporeM = Gfx.cellMat('#e8fff4', { rim: 1.7, core: 0.6, glow: 0.6 });
  const mound = Gfx.part('sphere', mint, b, 0, R * 0.35, 0, R, R * 0.45, R);
  const cap = Gfx.part('sphere', deep, b, 0, R * 0.9, 0, R * 0.55, R * 0.42, R * 0.55);
  const eye = Gfx.part('sphere', Gfx.glowMat('#c8ffe8', { glow: 1.0 }), b, 0, R * 1.15, 0, R * 0.22);
  const stalks = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU + 0.2, n = Gfx.node('stalk'); n.parent = b; n.rotation.y = a; n.position.y = R * 0.5;
    const tilt = Gfx.node('tilt'); tilt.parent = n; tilt.position.x = R * 0.55;
    const len = R * rnd(0.7, 1.0);
    const st = Gfx.part('cyl', mint, tilt, 0, len * 0.5, 0, 0.07, len * 0.5, 0.07);
    const head = Gfx.part('sphere', sporeM, tilt, 0, len, 0, 0.17);
    stalks.push({ n, tilt, head, base: 0.45 + rnd(-0.1, 0.1), ph: rnd(0, TAU) });
  }
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.6; const r2 = Gfx.part('capsule', deep, b, Math.cos(a) * R * 1.1, 0.12, Math.sin(a) * R * 1.1, R * 0.5, 0.18, 0.18); r2.rotation.y = -a; }
  return {
    root, b, body: mound,
    anim(e, t, dt) {
      const D = e.data;
      const sink = D.sink || 0;
      b.position.y = -sink * R * 1.6;
      b.scaling.setAll(Math.max(0.05, 1 - sink * 0.6) * (1 + (e.hurtT > 0 ? 0.03 : 0) + Math.sin(t * 1.6) * 0.02));
      const inh = D.inhale || 0, gl = D.glow || 0;
      stalks.forEach((s, i) => { s.tilt.rotation.z = -(s.base - inh * 0.35 + Math.sin(t * 1.4 + s.ph) * 0.08); s.head.scaling.setAll(0.17 * (1 + gl * 0.4 + Math.sin(t * 3 + s.ph) * 0.08)); });
      cap.rotation.y += dt * (0.3 + inh * 3);
      eye.scaling.setAll(R * (0.2 + gl * 0.1 + inh * 0.12 + (D.phaseFlash || 0) * 0.2));
    },
  };
}
const ASP_ATK = {
  roots(e, A) {
    if (at(A, 0)) { e.data.glow = 1; A.dur = rootEruption(e, e.phase >= 2 ? 8 : 6, '#c8ffe8'); }
    return A.t >= (A.dur || 1) + 0.35;
  },
  spores(e, A) {
    const D = e.data;
    if (at(A, 0)) { D.glow = 1; sfx('spore', { rate: 0.7 }); sfx('windup', { rate: 1.1, vol: 0.45 }); }
    const vol = e.phase >= 2 ? 2 : 1;
    for (let v = 0; v < vol; v++) {
      if (at(A, 0.6 + v * 0.75)) {
        const a = toPlayer(e).a + (v ? 0.16 : 0);
        for (let i = 0; i < 5; i++) {
          const ang = a + (i - 2) * 0.34;
          spawnEShot(e.x + Math.cos(ang) * e.r, e.y + Math.sin(ang) * e.r, ang, 2.4, { r: 0.34, style: 'spore', life: rnd(1.1, 1.45), onExpire: (s) => { enemyRing(s.x, s.y, 6, 3.3, { style: 'spore', a0: rnd(0, TAU) }); } });
        }
        sfx('enemy_shoot_big');
      }
    }
    return A.t >= 0.6 + vol * 0.75 + 0.4;
  },
  inhale(e, A, dt) {
    const D = e.data, wind = 0.8, dur = e.phase >= 2 ? 2.6 : 2.2;
    if (at(A, 0)) {
      sfx('breath_in', { vol: 0.9 }); sfx('beam_charge', { rate: 0.6, vol: 0.6 });
      spawnZone(e.x, e.y, 6.5, wind + dur, 'pull', { owner: 'fx' });
      telegraph({ kind: 'disc', x: e.x, y: e.y, r: e.r + 1.3, dur: wind, warm: true, owner: e });
    }
    if (A.t >= wind && A.t < wind + dur) {
      D.inhale = Math.min(1, (D.inhale || 0) + dt * 4);
      const P = SIM.player;
      if (P && !P.dead && P.dashT <= 0) {
        const a = angleTo(P.x, P.y, e.x, e.y), d = dist(P.x, P.y, e.x, e.y);
        const str = (e.phase >= 2 ? 2.4 : 1.75) * clamp(1.25 - d / 14, 0.35, 1);
        if (d > e.r + P.hitR + 0.2) { P.x += Math.cos(a) * str * dt; P.y += Math.sin(a) * str * dt; }
      }
      A.sp = (A.sp || 0) - dt;
      if (A.sp <= 0) {
        A.sp = e.phase >= 2 ? 0.11 : 0.16;
        A.ang = (A.ang == null ? rnd(0, TAU) : A.ang) + 0.41;
        const arms = e.phase >= 2 ? 3 : 2;
        for (let k = 0; k < arms; k++) { const a = A.ang + k / arms * TAU; spawnEShot(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, a, 3.0, { style: 'spore', r: 0.15 }); }
      }
      if (Math.random() < 0.8) { const a = rnd(0, TAU), d = rnd(3, 6.5); SIM.particles.push({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, h: rnd(0.2, 1.2), vx: -Math.cos(a) * 6, vy: -Math.sin(a) * 6, vh: 0, life: 0.7, t: 0, size: rnd(0.03, 0.06), hex: '#d8fff0', grav: 0, drag: 0 }); }
    } else D.inhale = Math.max(0, (D.inhale || 0) - dt * 3);
    if (at(A, wind + dur)) sfx('breath_out', { vol: 0.8 });
    return A.t >= wind + dur + 0.35;
  },
  puffs(e, A) {
    const D = e.data;
    if (at(A, 0)) { D.glow = 1; sfx('windup', { rate: 0.8, vol: 0.5 }); }
    if (at(A, 0.6)) {
      const n = Math.min(2, 3 - aliveBy(e));
      for (let i = 0; i < n; i++) { const a = rnd(0, TAU); summon(e, 'moldpuff', e.x + Math.cos(a) * 2.4, e.y + Math.sin(a) * 2.4); }
      if (n > 0) sfx('spore'); else enemyRing(e.x, e.y, 12, 3.2, { style: 'spore' });
    }
    return A.t >= 1.0;
  },
  relocate(e, A, dt) {
    const D = e.data;
    if (at(A, 0)) { sfx('burrow'); spawnZone(e.x, e.y, 2.3, 2.6, 'spore'); burst(e.x, e.y, '#9affc8', 20, 4, { life: 0.6, size: 0.12, up: 3 }); D.sinceMove = 0; }
    if (A.t < 0.5) D.sink = A.t / 0.5;
    if (at(A, 0.5)) {
      e.invuln = true; e.untargetable = true; e.harmless = true; e.burrowed = true;
      const P = SIM.player, room = SIM.room;
      let spots = World.spawnSpots(room, P.x, P.y, 5.5, false).filter(s => s[0] > 4 && s[0] < room.W - 4 && s[1] > 3.5 && s[1] < room.H - 3.5 && dist(s[0], s[1], e.x, e.y) > 3);
      const s = spots.length ? rndPick(spots) : [room.W / 2, room.H / 2];
      A.dest = { x: s[0], y: s[1] };
      telegraph({ kind: 'disc', x: A.dest.x, y: A.dest.y, r: e.r + 0.4, dur: 1.0, warm: true, owner: e, persist: true });
    }
    if (A.t >= 0.5 && A.t < 1.5) D.sink = 1;
    if (at(A, 1.5)) {
      e.x = A.dest.x; e.y = A.dest.y;
      e.invuln = false; e.untargetable = false; e.harmless = false; e.burrowed = false;
      enemyRing(e.x, e.y, e.phase >= 2 ? 14 : 12, 3.4, { style: 'spore', a0: rnd(0, TAU) });
      sfx('emerge'); Gfx.addShake(0.4); burst(e.x, e.y, '#9affc8', 24, 5, { life: 0.6, size: 0.12, up: 4 });
      Gfx.splat(SIM.room, e.x, e.y, 1.3, '#2a6a5a', 0.4);
    }
    if (A.t > 1.5) D.sink = Math.max(0, 1 - (A.t - 1.5) / 0.4);
    return A.t >= 2.0;
  },
};
ASP_ATK.puffs_ok = (e) => aliveBy(e) < 3;
function updAspergill(e, dt, k) {
  const D = e.data;
  D.phaseFlash = Math.max(0, (D.phaseFlash || 0) - dt);
  D.glow = Math.max(0, (D.glow || 0) - dt * 1.2);
  bossPhaseCheck(e, () => { enemyRing(e.x, e.y, 18, 3, { style: 'spore', a0: rnd(0, TAU) }); sfx('roar', { rate: 1.1, vol: 0.7 }); });
  e.vx = e.vy = 0;
  // force a move after a few attacks so it never camps
  if (!e.atk && (D.sinceMove || 0) >= 3 && e.pause <= 0 && e.cd <= dt) { e.atk = { name: 'relocate', t: 0, f: {}, d: {} }; e.lastAtk = 'relocate'; }
  const before = e.atk;
  runAttacks(e, dt, [['roots', 'spores', 'inhale', 'roots', 'spores'], ['roots', 'spores', 'inhale', 'puffs', 'spores', 'roots']], [1.3, 0.95], ASP_ATK);
  if (!before && e.atk && e.atk.name !== 'relocate') D.sinceMove = (D.sinceMove || 0) + 1;
}
function spawnAspergill(x, y) {
  const e = bossBase('aspergill', x, y, { marks: [0.5] });
  e.update = updAspergill;
  return bossFinish(e, visAspergill(e));
}

/* ==========================================================================
   4. THE LONG HUNGER — a giant tapeworm; segments forward damage to the head
   ========================================================================== */
const HUNGER_SEGS = 12;
function visHungerHead(e) {
  const root = Gfx.node('boss_hunger'), b = Gfx.node('bhun'); b.parent = root;
  const R = e.r;
  const flesh = Gfx.cellMat(e.color, { rim: 1.35, core: 0.3, glow: 0.25, dark: 0.55 });
  const lip = Gfx.cellMat('#ff6a3a', { rim: 1.6, core: 0.5, glow: 0.45 });
  const tooth = Gfx.cellMat('#fff4e0', { rim: 1.2, core: 0.5, glow: 0.2, dark: 0.9 });
  const head = Gfx.part('sphere', flesh, b, 0, R * 0.85, 0, R * 1.3, R * 0.85, R);
  const mouth = Gfx.part('torusThick', lip, b, R * 1.05, R * 0.85, 0, R * 0.55, R * 0.55, R * 0.55);
  mouth.rotation.z = Math.PI / 2;
  const maw = Gfx.part('sphere', Gfx.glowMat('#ff8a3a', { glow: 1.0 }), b, R * 0.95, R * 0.85, 0, R * 0.32);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU, m = Gfx.part('cone', tooth, b, R * 1.15, R * 0.85 + Math.sin(a) * R * 0.42, Math.cos(a) * R * 0.42, 0.06, 0.12, 0.06);
    m.rotation.z = -Math.PI / 2;
  }
  // hooks crown
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; Gfx.part('sphereLo', lip, b, R * 0.3, R * 0.85 + Math.sin(a) * R * 0.75, Math.cos(a) * R * 0.75, 0.09); }
  return {
    root, b, body: head,
    anim(e, t, dt) {
      const D = e.data;
      b.rotation.y = D.heading != null ? D.heading : 0;
      const rear = D.rear || 0;
      b.position.y = rear * 0.5 - (D.sinkHead || 0) * R * 2;
      b.rotation.z = rear * 0.35;
      maw.scaling.setAll(R * (0.3 + Math.sin(t * 9) * 0.04 + rear * 0.15));
      head.scaling.set(R * 1.3 * (1 + Math.sin(t * 6) * 0.03), R * 0.85, R * (1 + (e.hurtT > 0 ? 0.05 : 0)));
      b.setEnabled((D.sinkHead || 0) < 0.98);
    },
  };
}
function visHungerSeg(s, i) {
  const root = Gfx.node('hseg'), b = Gfx.node('hsegb'); b.parent = root;
  const r = s.r;
  const flesh = Gfx.cellMat(i % 2 ? '#f0c898' : s.color, { rim: 1.35, core: 0.3, glow: 0.22, dark: 0.55 });
  const band = Gfx.cellMat('#c87a4a', { rim: 1.4, core: 0.4, glow: 0.25 });
  const m = Gfx.part('sphere', flesh, b, 0, r * 0.8, 0, r * 1.1, r * 0.8, r);
  const ring = Gfx.part('torus', band, b, 0, r * 0.8, 0, r * 0.9, r * 0.9, r * 0.9);
  ring.rotation.z = Math.PI / 2;
  return {
    root, b, body: m,
    anim(s, t, dt) {
      const H = s.forward, D = H.data;
      b.rotation.y = s.data.ang || 0;
      const g = D.spasm || 0;
      const k = 1 + Math.sin(t * 8 - i * 0.6) * 0.05 + g * Math.abs(Math.sin(t * 30 + i)) * 0.12;
      b.scaling.set(k, k, k);
      root.setEnabled(!s.burrowed || (s.spawning > 0));
    },
  };
}
function makeHungerSeg(head, i) {
  const r = lerp(0.76, 0.42, i / (HUNGER_SEGS - 1));
  const s = {
    id: nextId(), type: 'boss_hunger_seg', def: { ai: 'boss', speed: 0 }, x: head.x, y: head.y, vx: 0, vy: 0, kx: 0, ky: 0,
    r, fly: false, color: head.color, core: head.core, cost: 0, state: 0, t: 0, cd: 0, facing: 0,
    spawning: 2.2, spawnMax: 2.2, elite: null, capsule: 0, data: { ang: 0 }, mass: 50, rate: 1, speedK: 1, dead: false,
    summoned: true, zoneSlow: 1, isBoss: true, isMainBoss: false, forward: head, noDeathFx: true, noCollide: true,
    stunImmune: true, anchored: true, hp: 1e9, maxHp: 1e9, idx: i, update: () => { },
  };
  const vis = visHungerSeg(s, i);
  s.vis = vis; s.node = vis.root;
  SIM.enemies.push(s);
  return s;
}
/** place segments along the head's path history */
function layoutHunger(e) {
  const D = e.data, path = D.path;
  let acc = 0, pi = 0;
  const offs = D.sinkOff || 0;
  let target = 0;
  const segs = D.segs;
  // cumulative path length table (from head backwards)
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.dead) continue;
    target = (i + 1) * 0.86 * (0.75 + 0.25 * (s.r / 0.76)) + i * 0.0 - offs;
    if (target <= 0.05) { // swallowed into the dive hole
      s.burrowed = true; s.untargetable = true; s.harmless = true;
      s.x = D.holeX; s.y = D.holeY; continue;
    }
    while (pi < path.length - 1) {
      const seg = dist(path[pi].x, path[pi].y, path[pi + 1].x, path[pi + 1].y);
      if (acc + seg >= target) break;
      acc += seg; pi++;
    }
    if (pi >= path.length - 1) { // path too short: tail still inside the emerge hole
      const p = path[path.length - 1];
      s.x = p.x; s.y = p.y; s.burrowed = true; s.untargetable = true; s.harmless = true;
      continue;
    }
    const a = path[pi], b = path[pi + 1], segL = dist(a.x, a.y, b.x, b.y) || 1e-6, k = (target - acc) / segL;
    s.x = lerp(a.x, b.x, k); s.y = lerp(a.y, b.y, k);
    s.data.ang = Math.atan2(a.y - b.y, a.x - b.x);
    s.burrowed = false; s.untargetable = false; s.harmless = false;
  }
}
const HUNGER_ATK = {
  lunge(e, A, dt) {
    const D = e.data;
    if (at(A, 0)) {
      A.ang = toPlayer(e).a; sfx('windup', { rate: 0.75 });
      const L = (D.speedBase || 3.4) * (e.phase >= 2 ? 2.9 : 2.6) * 0.75 + e.r * 0.85; // real dash reach
      telegraph({ kind: 'line', x: e.x, y: e.y, ang: A.ang, len: arenaLen(e.x, e.y, A.ang, L), w: e.r * 2, dur: 0.6, owner: e,
        follow: (t) => { t.x = e.x; t.y = e.y; t.ang = A.ang; t.len = arenaLen(t.x, t.y, t.ang, L); } });
    }
    if (A.t < 0.6) { D.rear = Math.min(1, A.t / 0.4); D.steer = false; D.speedMul = 0.25; A.ang = lerpAngle(A.ang, toPlayer(e).a, damp(3, dt)); D.heading = lerpAngle(D.heading, A.ang, damp(8, dt)); return false; }
    if (at(A, 0.6)) { sfx('charge', { rate: 0.7 }); D.heading = A.ang; D.rear = 0; }
    if (A.t < 1.35) { D.steer = false; D.speedMul = e.phase >= 2 ? 2.9 : 2.6; return false; }
    D.steer = true; D.speedMul = 0.6;
    return A.t >= 1.75;
  },
  spasm(e, A) {
    const D = e.data;
    if (at(A, 0)) { sfx('windup', { rate: 0.55, vol: 0.8 }); }
    D.spasm = A.t < 0.65 ? A.t / 0.65 : Math.max(0, 1 - (A.t - 0.65));
    D.speedMul = 0.45;
    if (at(A, 0.65)) {
      sfx('enemy_shoot_big', { vol: 0.7 });
      const segs = D.segs.filter(s => !s.dead);
      segs.forEach((s, i) => later(e, i * 0.07, () => {
        if (s.dead || s.burrowed) return;
        const base = s.data.ang;
        const offs = e.phase >= 2 ? [-0.28, 0.28] : [0];
        for (const side of [Math.PI / 2, -Math.PI / 2]) for (const o of offs) spawnEShot(s.x, s.y, base + side + o, 3.5, { style: 'orange', r: 0.16 });
        if (i % 3 === 0) sfx('enemy_shoot', { vol: 0.35, rate: 1.2 });
      }));
    }
    if (A.t > 0.65 + 0.07 * HUNGER_SEGS + 0.3) { D.spasm = 0; D.speedMul = 1; return true; }
    return false;
  },
  dive(e, A, dt) {
    const D = e.data, P = SIM.player;
    if (at(A, 0)) { sfx('windup', { rate: 0.6, vol: 0.7 }); }
    if (A.t < 0.5) { D.rear = A.t / 0.5; D.speedMul = 0.3; return false; }
    if (at(A, 0.5)) {
      sfx('burrow'); Gfx.addShake(0.35);
      D.holeX = e.x; D.holeY = e.y; D.diving = true; D.rear = 0;
      e.invuln = true; e.untargetable = true; e.harmless = true; e.burrowed = true;
      burst(e.x, e.y, '#8a5a2a', 20, 4, { life: 0.6, size: 0.12, up: 4 });
      Gfx.splat(SIM.room, e.x, e.y, 1.1, '#5a3a1a', 0.45);
    }
    if (D.diving) {
      D.sinkHead = Math.min(1, (D.sinkHead || 0) + dt * 5);
      D.sinkOff = (D.sinkOff || 0) + dt * 9;
      D.speedMul = 0; e.x = D.holeX; e.y = D.holeY;
      if (Math.random() < 0.4) burst(D.holeX, D.holeY, '#8a5a2a', 1, 2, { life: 0.4, size: 0.08, up: 3 });
      if (!A.tele && D.sinkOff > 12) {
        const lead = clampArena(P.x + P.vx * 0.45, P.y + P.vy * 0.45, 2.2);
        A.dest = lead;
        A.tele = telegraph({ kind: 'disc', x: lead.x, y: lead.y, r: 1.7, dur: 1.0, warm: true, owner: e, persist: true });
        A.tEmerge = A.t + 1.0;
        sfx('windup', { rate: 0.5, vol: 0.5 });
      }
      if (A.tele && A.t >= A.tEmerge) {
        D.diving = false; D.sinkHead = 0; D.sinkOff = 0;
        e.x = A.dest.x; e.y = A.dest.y;
        e.invuln = false; e.untargetable = false; e.harmless = false; e.burrowed = false;
        D.path = [{ x: e.x, y: e.y }];
        D.heading = toPlayer(e).a + Math.PI + rnd(-0.6, 0.6);
        enemyRing(e.x, e.y, e.phase >= 2 ? 12 : 10, 3.7, { style: 'acid', a0: rnd(0, TAU) });
        spawnZone(e.x, e.y, 1.3, 3, 'acid');
        sfx('emerge'); sfx('acid', { vol: 0.6 }); Gfx.addShake(0.5);
        burst(e.x, e.y, '#d6ff3a', 18, 5, { life: 0.5, size: 0.1, up: 5 });
        A.done = A.t;
      }
      return false;
    }
    D.speedMul = 0.8;
    return A.done != null && A.t >= A.done + 0.4;
  },
};
function updHunger(e, dt, k) {
  const D = e.data, room = SIM.room;
  D.phaseFlash = Math.max(0, (D.phaseFlash || 0) - dt);
  if (D.heading == null) D.heading = Math.PI / 2;
  bossPhaseCheck(e, () => {
    // shed the tail as wormlings
    const alive = D.segs.filter(s => !s.dead);
    const shed = alive.slice(-4);
    for (const s of shed) {
      s.dead = true;
      burst(s.x, s.y, e.color, 14, 4, { life: 0.5, size: 0.1 });
      Gfx.splat(room, s.x, s.y, 0.6, e.color, 0.45);
      if (!s.burrowed) summon(e, 'wormling', s.x, s.y, { spawn: 0.3 });
    }
    D.segs = D.segs.filter(s => !s.dead);
    sfx('split'); sfx('roar', { rate: 1.3, vol: 0.7 });
    D.speedBase = 4.3;
  });
  if (D.speedMul == null) D.speedMul = 1;
  if (!e.atk) { D.speedMul = lerp(D.speedMul, 1, damp(3, dt)); D.steer = true; D.spasm = Math.max(0, (D.spasm || 0) - dt * 2); D.rear = Math.max(0, (D.rear || 0) - dt * 3); }
  // steering: sinuous chase, wall avoidance
  const P = SIM.player;
  if (D.steer !== false && !D.diving) {
    let want = angleTo(e.x, e.y, P.x, P.y) + Math.sin(SIM.time * 1.7) * 0.75;
    const m = 2.6;
    let ax = 0, ay = 0;
    if (e.x < m) ax += 1; if (e.x > room.W - m) ax -= 1; if (e.y < m) ay += 1; if (e.y > room.H - m) ay -= 1;
    if (ax || ay) want = lerpAngle(want, Math.atan2(ay, ax), 0.8);
    const tr = (e.phase >= 2 ? 2.9 : 2.3) * dt;
    D.heading += clamp(angDiff(D.heading, want), -tr, tr);
  }
  const sp = (D.speedBase || 3.4) * D.speedMul * k;
  if (!D.diving) setVel(e, D.heading, sp); else { e.vx = e.vy = 0; }
  // hard clamp to arena
  const c = clampArena(e.x, e.y, 1 + e.r * 0.8);
  if (c.x !== e.x || c.y !== e.y) { e.x = c.x; e.y = c.y; D.heading = lerpAngle(D.heading, angleTo(e.x, e.y, room.W / 2, room.H / 2), 0.5); }
  // path history
  const last = D.path[0];
  if (!D.diving && (!last || dist(last.x, last.y, e.x, e.y) > 0.12)) { D.path.unshift({ x: e.x, y: e.y }); if (D.path.length > 360) D.path.pop(); }
  layoutHunger(e);
  runAttacks(e, dt, [['lunge', 'spasm', 'dive', 'spasm', 'lunge'], ['dive', 'spasm', 'lunge', 'dive', 'spasm']], [1.6, 1.15], HUNGER_ATK);
}
function spawnHunger(x, y) {
  const e = bossBase('hunger', x, y, { marks: [0.5], noCollide: true });
  e.update = updHunger;
  e.headMult = 1.25;   // the head is the weak point
  e.anchored = true;
  const D = e.data;
  D.heading = Math.PI / 2; D.speedBase = 3.4;
  // initial curled path behind the head
  D.path = [];
  for (let i = 0; i <= 160; i++) { const a = -Math.PI / 2 - i * 0.045, rr = 3 + i * 0.004; D.path.push({ x: x + Math.cos(a) * rr * 0.9 + 0, y: y + 3 + Math.sin(a) * rr }); }
  D.path[0] = { x, y };
  bossFinish(e, visHungerHead(e));
  D.segs = [];
  for (let i = 0; i < HUNGER_SEGS; i++) D.segs.push(makeHungerSeg(e, i));
  layoutHunger(e);
  e.onDeath = (e) => {
    for (const s of D.segs) {
      if (s.dead) continue;
      s.dead = true;
      if (!s.burrowed) { burst(s.x, s.y, e.color, 16, 5, { life: 0.6, size: 0.11, up: 3 }); Gfx.splat(SIM.room, s.x, s.y, s.r * 1.4, e.color, 0.5); }
    }
  };
  return e;
}

/* ==========================================================================
   5. MISFOLD — a crystal thought that teleports and lies about where it is
   ========================================================================== */
function visMisfold(e, real) {
  const root = Gfx.node('boss_misfold'), b = Gfx.node('bmis'); b.parent = root;
  const R = BOSSES.misfold.r, H = 1.5;
  const crys = Gfx.cellMat(e.color, { rim: 1.9, core: 0.45, glow: 0.5, dark: 0.5 });
  const dk = Gfx.cellMat('#3a5ad8', { rim: 1.7, core: 0.45, glow: 0.4 });
  const core = Gfx.part('dodeca', crys, b, 0, H, 0, R * 0.78);
  const inner = Gfx.part('octa', Gfx.glowMat('#e8ffff', { glow: 1.0 }), b, 0, H, 0, R * 0.35);
  const halo = Gfx.part('torus', Gfx.glowMat('#a8f8ff', { glow: 0.35, k: 0.75 }), b, 0, H, 0, R * 1.15);
  const shards = [];
  for (let i = 0; i < 4; i++) shards.push(Gfx.part('tetra', dk, b, 0, H, 0, R * 0.22));
  let tell = null;
  if (real) tell = Gfx.part('torus', Gfx.glowMat('#ffffff', { glow: 0.6, alpha: 0.55 }), b, 0, 0.12, 0, R * 1.05, 0.6, R * 1.05);
  return {
    root, b, body: core,
    anim(e, t, dt) {
      const D = e.data;
      const fade = D.fade || 0, wind = D.wind || 0;
      b.scaling.setAll(Math.max(0.03, (1 - fade) * (1 + (e.hurtT > 0 ? 0.04 : 0) + wind * 0.08)));
      b.position.y = Math.sin(t * 1.7 + e.id) * 0.15;
      core.rotation.y += dt * (0.6 + wind * 3); core.rotation.x += dt * 0.35;
      inner.rotation.y -= dt * 2; inner.scaling.setAll(R * (0.33 + wind * 0.12 + Math.sin(t * 5) * 0.03 + (D.phaseFlash || 0) * 0.2));
      halo.rotation.x = t * 0.8; halo.rotation.z = t * 0.55;
      shards.forEach((s, i) => { const a = t * 1.6 + i / 4 * TAU; s.position.set(Math.cos(a) * R * 1.5, H + Math.sin(a * 2) * 0.3, Math.sin(a) * R * 1.5); s.rotation.y += dt * 3; });
      if (tell) { tell.rotation.y += dt; tell.scaling.set(R * (1.05 + Math.sin(t * 3) * 0.05), 0.6, R * (1.05 + Math.sin(t * 3) * 0.05)); }
      if (e.illusion && Math.random() < 0.01) b.position.x = rnd(-0.15, 0.15); else b.position.x = 0;
    },
  };
}
function makeIllusion(real, x, y) {
  const s = {
    id: nextId(), type: 'boss_misfold_ill', def: { ai: 'boss', speed: 0 }, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    r: real.r, fly: true, color: real.color, core: real.core, cost: 0, state: 0, t: 0, cd: 0, facing: 0,
    spawning: 0.4, spawnMax: 0.4, elite: null, capsule: 0, data: {}, mass: 50, rate: 1, speedK: 1, dead: false,
    summoned: true, zoneSlow: 1, isBoss: true, isMainBoss: false, illusion: true, harmless: true, noDeathFx: true, noCollide: true,
    stunImmune: true, anchored: true, hp: 1e9, maxHp: 1e9, summoner: real.id,
    update(s, dt) { s.data.fade = Math.max(0, (s.data.fade || 0) - dt * 3); s.data.wind = real.data.wind || 0; },
  };
  const vis = visMisfold(s, false);
  s.vis = vis; s.node = vis.root; s.node.position.set(x, 0, -y);
  SIM.enemies.push(s);
  return s;
}
function misfoldIllusions(e) { return SIM.enemies.filter(o => !o.dead && o.illusion && o.summoner === e.id); }
/** telegraphed teleport of the real boss + its illusions */
function misfoldBlink(e) {
  const P = SIM.player, room = SIM.room;
  let spots = World.spawnSpots(room, P.x, P.y, 4.5, true).filter(s => dist(s[0], s[1], P.x, P.y) < 9.5 && s[0] > 2.5 && s[0] < room.W - 2.5 && s[1] > 2.5 && s[1] < room.H - 2.5);
  if (spots.length < 4) spots = World.spawnSpots(room, P.x, P.y, 3.5, true);
  spots = rndShuffle(spots);
  const pick = [];
  for (const s of spots) { if (pick.every(p => dist(p[0], p[1], s[0], s[1]) > 3.2)) pick.push(s); if (pick.length >= 4) break; }
  while (pick.length < 4) pick.push([rnd(4, room.W - 4), rnd(4, room.H - 4)]);
  const want = e.phase >= 2 ? 3 : 2;
  let ills = misfoldIllusions(e);
  sfx('teleport', { vol: 0.8 });
  const all = [e, ...ills];
  for (let i = ills.length; i < want; i++) all.push(null); // new illusions appear at their spot
  all.forEach((who, i) => {
    const s = pick[i % pick.length];
    telegraph({ kind: 'disc', x: s[0], y: s[1], r: 1.2, dur: 0.6, warm: true, owner: e });
    if (who) who.data.fade = 0;
  });
  e.data.blinking = true;
  later(e, 0.6, () => {
    all.forEach((who, i) => {
      const s = pick[i % pick.length];
      if (who && !who.dead) {
        burst(who.x, who.y, '#7cf7ff', 12, 3, { life: 0.35, size: 0.07, h: 1.4 });
        who.x = s[0]; who.y = s[1]; who.data.fade = 1;
        burst(who.x, who.y, '#7cf7ff', 12, 3, { life: 0.35, size: 0.07, h: 1.4 });
      } else if (!who) makeIllusion(e, s[0], s[1]);
    });
    sfx('teleport', { rate: 0.8 });
    e.data.blinking = false;
  });
}
const MIS_ATK = {
  lattice(e, A) {
    const D = e.data, room = SIM.room;
    const fire = (off, dur) => {
      const xs = [], ys = [];
      for (let x = 1.5 + off; x < room.W - 1; x += 5) xs.push(x);
      for (let y = 1.5 + off * 0.6 + 1.2; y < room.H - 1; y += 5) ys.push(y);
      for (const x of xs) telegraph({ kind: 'line', x, y: 1, ang: Math.PI / 2, len: room.H - 2, w: 0.75, dur, owner: e, then: () => spawnBeam(x, 1, Math.PI / 2, room.H - 2, 0.75, 0.45, { owner: e, hex: '#7cf7ff' }) });
      for (const y of ys) telegraph({ kind: 'line', x: 1, y, ang: 0, len: room.W - 2, w: 0.75, dur, owner: e, then: () => spawnBeam(1, y, 0, room.W - 2, 0.75, 0.45, { owner: e, hex: '#7cf7ff' }) });
      sfx('beam_charge', { vol: 0.7 });
      later(e, dur, () => { sfx('lightning'); sfx('beam_fire', { vol: 0.7 }); Gfx.addShake(0.25); });
    };
    if (at(A, 0)) { D.wind = 1; A.off = rnd(0.5, 4.5); fire(A.off, 1.15); }
    if (e.phase >= 2 && at(A, 1.15)) fire((A.off + 2.5) % 5, 1.0);
    if (A.t > 0.5) D.wind = 0;
    return A.t >= (e.phase >= 2 ? 2.7 : 1.9);
  },
  arms(e, A) {
    const D = e.data;
    if (at(A, 0)) {
      D.wind = 1; A.a0 = toPlayer(e).a + Math.PI / 2; A.dir = rndSign();
      const n = e.phase >= 2 ? 3 : 2;
      A.n = n;
      for (let i = 0; i < n; i++) { const a = A.a0 + i / n * TAU; telegraph({ kind: 'line', x: e.x, y: e.y, ang: a, len: arenaLen(e.x, e.y, a, 13), w: 0.7, dur: 0.95, owner: e }); }
      sfx('beam_charge');
    }
    if (at(A, 0.95)) {
      for (let i = 0; i < A.n; i++) spawnBeam(e.x, e.y, A.a0 + i / A.n * TAU, 13, 0.7, 3.2, { owner: e, spin: A.dir * (e.phase >= 2 ? 0.62 : 0.55), hex: '#7cf7ff', follow: (b) => { b.x = e.x; b.y = e.y; b.len = arenaLen(b.x, b.y, b.ang, 13); } });
      sfx('beam_fire'); D.wind = 0.4;
    }
    if (A.t > 3.6) D.wind = 0;
    return A.t >= 4.3;
  },
  fold(e, A) {
    const D = e.data;
    if (at(A, 0)) { D.wind = 1; sfx('windup', { rate: 1.3, vol: 0.6 }); }
    const n = e.phase >= 2 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      if (at(A, 0.55 + i * 0.55)) {
        const curve = (i % 2 ? 1 : -1) * 0.55;
        enemyRing(e.x, e.y, 14, 3.2, { style: 'volt', curve, a0: rnd(0, TAU) });
        sfx('enemy_shoot', { rate: 1.2, vol: 0.7 });
        if (i === 0) for (const il of misfoldIllusions(e)) enemyRing(il.x, il.y, 6, 3.0, { style: 'volt', a0: rnd(0, TAU) });
      }
    }
    if (A.t > 0.55) D.wind = 0;
    return A.t >= 0.55 + n * 0.55 + 0.3;
  },
  shards(e, A) {
    const D = e.data;
    if (at(A, 0)) { D.wind = 1; sfx('windup', { rate: 1.6, vol: 0.5 }); }
    for (let i = 0; i < 3; i++) if (at(A, 0.5 + i * 0.4)) { enemyFan(e.x, e.y, toPlayer(e).a, 3, 0.36, 5.0, { style: 'volt' }); sfx('enemy_shoot', { rate: 1.4, vol: 0.6 }); }
    if (A.t > 0.5) D.wind = 0;
    return A.t >= 1.7;
  },
};
function updMisfold(e, dt, k) {
  const D = e.data;
  D.phaseFlash = Math.max(0, (D.phaseFlash || 0) - dt);
  D.fade = Math.max(0, (D.fade || 0) - dt * 3);
  bossPhaseCheck(e, () => { clearBossHazards(e); enemyRing(e.x, e.y, 20, 3.0, { style: 'volt', curve: 0.4 }); sfx('roar', { rate: 1.4, vol: 0.6 }); D.sinceBlink = 99; });
  e.vx = e.vy = 0;
  if (e.pause > 0) { e.pause -= dt; return; }
  // blink before attacks (every other attack in phase 1, every attack in phase 2)
  if (!e.atk && !D.blinking && e.cd <= 0.65 && !D.blinkedForThis) {
    D.sinceBlink = (D.sinceBlink || 0) + 1;
    if (D.sinceBlink >= (e.phase >= 2 ? 1 : 2) || misfoldIllusions(e).length === 0) { D.sinceBlink = 0; misfoldBlink(e); }
    D.blinkedForThis = true;
  }
  if (D.blinking) return;
  const had = e.atk;
  runAttacks(e, dt, [['fold', 'lattice', 'arms', 'fold'], ['fold', 'lattice', 'arms', 'shards', 'lattice']], [1.5, 1.1], MIS_ATK);
  if (!had && e.atk) D.blinkedForThis = false;
}
function spawnMisfold(x, y) {
  const e = bossBase('misfold', x, y, { marks: [0.5], fly: true, noCollide: true });
  e.update = updMisfold;
  e.data.sinceBlink = 1;
  bossFinish(e, visMisfold(e, true));
  e.onDeath = (e) => { for (const il of misfoldIllusions(e)) popIllusionQuiet(il); };
  return e;
}
function popIllusionQuiet(il) { il.dead = true; burst(il.x, il.y, '#7cf7ff', 14, 3, { life: 0.4, size: 0.07, h: 1.2 }); }

/* ==========================================================================
   6. SEPSIS — Patient Zero. Three phases.
   ========================================================================== */
function visSepsis(e) {
  const root = Gfx.node('boss_sepsis'), b = Gfx.node('bsep'); b.parent = root;
  const R = e.r;
  const mass = Gfx.cellMat('#8a3a12', { rim: 1.6, core: 0.25, glow: 0.25, dark: 0.5 });
  const rot = Gfx.cellMat('#3a2a10', { rim: 1.3, core: 0.3, glow: 0.12, dark: 0.6 });
  const pusM = Gfx.cellMat('#ffb03a', { rim: 1.7, core: 0.6, glow: 0.55 });
  const flesh = Gfx.cellMat('#c85a1a', { rim: 1.5, core: 0.3, glow: 0.3 });
  const tipM = Gfx.cellMat('#ffd08a', { rim: 1.7, core: 0.5, glow: 0.5 });
  const shell = Gfx.node('shell'); shell.parent = b;
  const body = Gfx.part('sphere', mass, shell, 0, R * 0.85, 0, R, R * 0.85, R);
  const plates = [];
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; plates.push(Gfx.part('sphere', rot, shell, Math.cos(a) * R * 0.75, R * 0.75, Math.sin(a) * R * 0.75, R * 0.42, R * 0.32, R * 0.42)); }
  const pustules = [];
  for (let i = 0; i < 10; i++) {
    const yv = 0.15 + (i % 3) * 0.25, a = i * 2.4, rad = Math.sqrt(1 - yv * yv);
    pustules.push({ m: Gfx.part('sphereLo', pusM, shell, Math.cos(a) * rad * R * 0.98, R * 0.85 + yv * R * 0.8, Math.sin(a) * rad * R * 0.98, R * 0.13), ph: rnd(0, TAU) });
  }
  const coreM = Gfx.part('sphere', Gfx.glowMat('#ff5a1a', { glow: 1.1 }), b, 0, R * 0.95, 0, R * 0.55);
  // the eye sits on top and looks at the player; iris tilted toward the camera so it reads from above
  const eyeN = Gfx.node('eye'); eyeN.parent = b; eyeN.position.y = R * 1.3;
  const rE = R * 0.46, tilt = 0.8, ex = R * 0.28;
  const eyeBall = Gfx.part('sphere', Gfx.cellMat('#fff0d8', { rim: 1.2, core: 0.75, glow: 0.3, dark: 0.95 }), eyeN, ex, 0, 0, rE);
  const iris = Gfx.part('torusThick', Gfx.glowMat('#ff7a1a', { glow: 1.0 }), eyeN, ex + Math.sin(tilt) * rE * 0.9, Math.cos(tilt) * rE * 0.9, 0, R * 0.2, R * 0.2, R * 0.2);
  iris.rotation.z = -tilt;
  const pupil = Gfx.part('sphere', Gfx.plainMat('#0a0200'), eyeN, ex + Math.sin(tilt) * rE * 0.97, Math.cos(tilt) * rE * 0.97, 0, R * 0.13, R * 0.05, R * 0.13);
  pupil.rotation.z = -tilt;
  const tents = [];
  for (let i = 0; i < 6; i++) tents.push(tentacle(b, i / 6 * TAU + 0.26, R * 0.85, 5, 0.6, 0.4, 0.18, flesh, tipM));
  return {
    root, b, body,
    anim(e, t, dt) {
      const D = e.data, ph = e.phase || 1;
      const beat = D.pulse || 0; D.pulse = Math.max(0, beat - dt * 3);
      const breathe = 1 + Math.sin(t * 1.3) * 0.025 + beat * 0.08 + (e.hurtT > 0 ? 0.025 : 0);
      const open = ph >= 3 ? Math.min(1, (D.open || 0) + dt * 0.8) : 0; D.open = open;
      shell.scaling.set(breathe * (1 - open * 0.35), breathe * (1 - open * 0.55), breathe * (1 - open * 0.35));
      plates.forEach((p, i) => p.setEnabled(i >= open * 7));
      pustules.forEach((p) => p.m.scaling.setAll(R * 0.13 * (1 + Math.sin(t * 4 + p.ph) * 0.2 + beat * 0.3)));
      coreM.scaling.setAll(R * (0.55 + open * 0.35 + Math.sin(t * 6) * 0.03 * (1 + open * 2) + (D.wind || 0) * 0.1 + (D.phaseFlash || 0) * 0.25));
      const tp = SIM.player ? angleTo(e.x, e.y, SIM.player.x, SIM.player.y) : 0;
      eyeN.rotation.y = lerpAngle(eyeN.rotation.y, tp, damp(4, dt));
      eyeN.position.y = R * (1.3 - open * 0.3);
      const blink = (Math.sin(t * 0.7) > 0.985) ? 0.2 : 1;
      eyeBall.scaling.set(rE, rE * blink, rE);
      iris.setEnabled(blink > 0.5); pupil.setEnabled(blink > 0.5);
      const dil = 1 + (D.wind || 0) * 0.5 + open * 0.3;
      pupil.scaling.set(R * 0.13 * dil, R * 0.05, R * 0.13 * dil);
      tents.forEach((T) => swayTentacle(T, t, 0.18 + ph * 0.05 + (D.wind || 0) * 0.15, 1.8 + ph * 0.4));
    },
  };
}
const SEP_ATK = {
  /* phase 1: remix of the regions it has corrupted */
  spew(e, A) {
    const D = e.data;
    if (at(A, 0)) { D.wind = 1; sfx('windup', { rate: 0.9, vol: 0.6 }); }
    const n = e.phase >= 2 ? 9 : 7;
    for (let i = 0; i < 3; i++) if (at(A, 0.6 + i * 0.45)) {
      const a = toPlayer(e).a + (i === 1 ? 0.08 : 0);
      enemyFan(e.x + Math.cos(a) * e.r * 0.8, e.y + Math.sin(a) * e.r * 0.8, a, n, 1.15, 4.0, { style: 'orange' });
      sfx('enemy_shoot_big'); D.pulse = 0.8;
    }
    if (A.t > 0.6) D.wind = 0;
    return A.t >= 2.0;
  },
  beatRings(e, A, dt) {
    const D = e.data;
    const B = D.B || {};
    if (at(A, 0)) { A.beats = 0; sfx('heartbeat', { vol: 0.8 }); }
    if (B.beat) {
      A.beats++; D.pulse = 1;
      if (A.beats % 2 === 0) {
        const gapA = toPlayer(e).a + Math.sin(A.beats * 0.9) * 1.0;
        enemyRing(e.x, e.y, 20, 3.4, { style: 'red', gap: { a: gapA, w: 0.46 }, a0: rnd(0, TAU) });
        sfx('enemy_shoot_big', { vol: 0.7 });
      } else { sfx('heartbeat', { vol: 0.6 }); D.wind = 1; later(e, 0.25, () => { D.wind = 0; }); }
    }
    return A.beats >= Math.round(7 / BOSS_FEV());
  },
  roots(e, A) {
    if (at(A, 0)) { e.data.wind = 1; A.dur = rootEruption(e, e.phase >= 3 ? 9 : 7, '#ff8a2a', 0.9); }
    if (A.t > 0.5) e.data.wind = 0;
    return A.t >= (A.dur || 1) + 0.4;
  },
  /* phase 2 */
  tentacles(e, A) {
    const D = e.data;
    if (at(A, 0)) {
      D.wind = 1; A.a0 = toPlayer(e).a + Math.PI / 3; A.dir = (D.tdir = -(D.tdir || 1));
      for (let i = 0; i < 3; i++) telegraph({ kind: 'line', x: e.x, y: e.y, ang: A.a0 + i / 3 * TAU, len: 15, w: 0.85, dur: 0.95, owner: e, follow: (t) => { t.x = e.x; t.y = e.y; t.len = arenaLen(t.x, t.y, t.ang, 15); } });
      sfx('beam_charge');
    }
    if (at(A, 0.95)) {
      for (let i = 0; i < 3; i++) spawnBeam(e.x, e.y, A.a0 + i / 3 * TAU, 15, 0.85, 3.4, { owner: e, spin: A.dir * (e.phase >= 3 ? 0.46 : 0.4), hex: '#ff8a2a', follow: (b) => { b.x = e.x; b.y = e.y; b.len = arenaLen(b.x, b.y, b.ang, 15); } });
      sfx('beam_fire'); D.wind = 0.5;
    }
    if (A.t > 4.0) D.wind = 0;
    return A.t >= 4.5;
  },
  spiral(e, A, dt) {
    const D = e.data;
    if (at(A, 0)) { D.wind = 1; sfx('windup', { rate: 0.7, vol: 0.7 }); A.ang = rnd(0, TAU); }
    if (A.t >= 0.65 && A.t < 3.65) {
      D.wind = 0;
      A.sp = (A.sp || 0) - dt;
      if (A.sp <= 0) {
        A.sp = 0.1; A.ang += 0.27;
        for (let k = 0; k < 2; k++) { const a = A.ang + k * Math.PI; spawnEShot(e.x + Math.cos(a) * e.r * 0.8, e.y + Math.sin(a) * e.r * 0.8, a, 3.3, { style: 'orange', r: 0.16 }); }
        if (Math.random() < 0.3) sfx('enemy_shoot', { vol: 0.35 });
      }
    }
    return A.t >= 4.0;
  },
  summon(e, A) {
    const D = e.data;
    if (at(A, 0)) { D.wind = 1; sfx('windup', { rate: 0.6, vol: 0.6 }); }
    if (at(A, 0.65)) {
      D.wind = 0;
      const n = Math.min(2, 3 - aliveBy(e));
      for (let i = 0; i < n; i++) { const a = toPlayer(e).a + (i ? 1.3 : -1.3); summon(e, rndPick(['rotcarrier', 'turncoat']), e.x + Math.cos(a) * 3.2, e.y + Math.sin(a) * 3.2); }
      if (n > 0) sfx('split'); else enemyRing(e.x, e.y, 16, 3.2, { style: 'orange', a0: rnd(0, TAU) });
    }
    return A.t >= 1.1;
  },
  /* phase 3: core exposed — denser, slower */
  bloom(e, A) {
    const D = e.data;
    if (at(A, 0)) { D.wind = 1; sfx('windup', { rate: 0.5, vol: 0.8 }); telegraph({ kind: 'disc', x: e.x, y: e.y, r: e.r + 1.6, dur: 0.6, warm: true, owner: e }); }
    for (let i = 0; i < 4; i++) if (at(A, 0.6 + i * 0.6)) {
      const gapA = toPlayer(e).a + (i % 2 ? 0.55 : -0.55);
      enemyRing(e.x, e.y, 26, 2.5, { style: 'red', gap: { a: gapA, w: 0.44 }, a0: rnd(0, TAU) });
      sfx('enemy_shoot_big', { vol: 0.75 }); D.pulse = 1;
    }
    if (A.t > 0.6) D.wind = 0;
    return A.t >= 3.2;
  },
  coreSpiral(e, A, dt) {
    const D = e.data;
    if (at(A, 0)) { D.wind = 1; sfx('beam_charge', { rate: 0.8 }); A.ang = rnd(0, TAU); A.dir = rndSign(); }
    if (A.t >= 0.7 && A.t < 4.2) {
      D.wind = 0;
      if (at(A, 2.45)) A.dir = -A.dir;
      A.sp = (A.sp || 0) - dt;
      if (A.sp <= 0) {
        A.sp = 0.12; A.ang += 0.23 * A.dir;
        for (let k = 0; k < 4; k++) { const a = A.ang + k * Math.PI / 2; spawnEShot(e.x + Math.cos(a) * e.r * 0.6, e.y + Math.sin(a) * e.r * 0.6, a, 2.8, { style: 'orange', r: 0.17 }); }
      }
    }
    return A.t >= 4.6;
  },
  walls(e, A) {
    const D = e.data;
    if (at(A, 0)) { D.wind = 1; sfx('windup', { rate: 0.8, vol: 0.6 }); }
    for (let i = 0; i < 3; i++) if (at(A, 0.55 + i * 0.55)) {
      const a = toPlayer(e).a + (i === 1 ? 0.1 : 0);
      enemyFan(e.x, e.y, a, 9, 1.7, 3.0, { style: 'red' });
      sfx('enemy_shoot_big', { vol: 0.7 });
    }
    if (A.t > 0.55) D.wind = 0;
    return A.t >= 2.2;
  },
};
SEP_ATK.summon_ok = (e) => aliveBy(e) < 3;
function updSepsis(e, dt, k) {
  const D = e.data;
  D.phaseFlash = Math.max(0, (D.phaseFlash || 0) - dt);
  if (D.invulT > 0) { D.invulT -= dt; if (D.invulT <= 0) e.invuln = false; }
  bossPhaseCheck(e, (e, ph) => {
    clearEShots(true); clearBossHazards(e);
    e.invuln = true; D.invulT = 1.4; e.pause = 1.7;
    sfx('roar', { rate: ph === 3 ? 0.8 : 0.95 }); Gfx.addShake(1); Gfx.caPulse = 1;
    for (let i = 0; i < 3; i++) later(e, 0.2 + i * 0.25, () => addRing(e.x, e.y, 3 + i * 2.5, '#ff8a2a', 0.5));
    if (ph === 3) { e.headMult = 1.15; e.anchored = true; e.fly = true; }
  });
  e.vx = e.vy = 0;
  D.B = bossBeat(e, dt, 90); // tick every frame so the clock stays locked between beatRings
  if (e.phase >= 3 && e.pause <= 0) {
    const tp = toPlayer(e);
    if (tp.d > e.r + 2.2) setVel(e, tp.a, 1.05 * k);
    const c = clampArena(e.x, e.y, e.r + 1.2); e.x = c.x; e.y = c.y;
  }
  runAttacks(e, dt, [
    ['spew', 'beatRings', 'roots', 'spew', 'roots'],
    ['tentacles', 'spiral', 'summon', 'spew', 'tentacles', 'spiral'],
    ['bloom', 'coreSpiral', 'roots', 'walls', 'bloom'],
  ], [1.35, 1.05, 0.85], SEP_ATK);
}
function spawnSepsis(x, y) {
  const e = bossBase('sepsis', x, y, { marks: [0.65, 0.3], fly: true });
  e.update = updSepsis;
  return bossFinish(e, visSepsis(e));
}

/* ==========================================================================
   ENTRY POINT
   ========================================================================== */
const BOSS_SPAWNERS = {
  colony: spawnColony, endocardia: spawnEndocardia, aspergill: spawnAspergill,
  hunger: spawnHunger, misfold: spawnMisfold, sepsis: spawnSepsis,
};
function spawnBoss(id, x, y) {
  const fn = BOSS_SPAWNERS[id] || spawnColony;
  const e = fn(x, y);
  addRing(e.x, e.y, e.r * 2, e.color, 0.8);
  burst(e.x, e.y, e.color, 24, 4, { life: 0.8, size: 0.12, up: 4 });
  return e;
}
