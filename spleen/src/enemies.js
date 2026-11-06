/* ==========================================================================
   SPLEEN: SEPSIS — enemies.js
   Pathogen construction, visuals, AI behaviours, elites, encounters and
   region mechanics. Every attack is telegraphed (wind-up, glow, or ground
   marker) so deaths are always readable.
   ========================================================================== */
"use strict";

/* ---------------- creation ---------------- */
function floorHpMult() {
  const f = SIM.floor ? SIM.floor.idx : 0, run = SIM.run;
  let m = 1 + 0.34 * f;
  if (run && run.fever >= 1) m *= 1.2;
  if (SIM.player) m *= SIM.player.st.enemyHpMult;
  return m;
}
function spawnEnemy(type, x, y, o = {}) {
  const def = ENEMIES[type];
  const e = {
    id: nextId(), type, def, x, y, vx: 0, vy: 0, kx: 0, ky: 0,
    r: (o.r || def.r), fly: !!def.fly, color: def.color, core: def.core, cost: def.cost || 1,
    state: 0, t: 0, cd: rnd(0.6, 1.6), facing: angleTo(x, y, SIM.player.x, SIM.player.y),
    spawning: o.instant ? 0 : 0.75, spawnMax: 0.75, elite: null, capsule: 0, data: {}, mass: 1,
    rate: 1, speedK: 1, dead: false, summoned: !!o.summoned, zoneSlow: 1,
  };
  let hp = (o.hp || def.hp) * floorHpMult();
  if (o.size != null) e.data.size = o.size;
  if (o.elite) {
    e.elite = o.elite; hp *= 1.7;
    if (o.elite === 'swollen') { hp *= 1.45; e.r *= 1.3; e.speedK = 0.85; e.mass = 2; }
    if (o.elite === 'frenzied') { e.speedK = 1.35; e.rate = 1.45; }
    if (o.elite === 'encapsulated') e.capsule = hp * 0.5;
  }
  e.hp = e.maxHp = hp;
  e.mass = e.mass * (e.r / 0.4);
  const vis = (ENEMY_VIS[type] || ENEMY_VIS.coccus)(e);
  e.vis = vis; e.node = vis.root;
  if (e.elite) {
    const ec = ELITES[e.elite].color;
    const ring = Gfx.part('torus', Gfx.glowMat(ec, { glow: 0.9, alpha: 0.9 }), e.node, 0, 0.05, 0, e.r * 1.25, 1, e.r * 1.25);
    vis.eliteRing = ring;
    if (vis.body) Gfx.setOutline(vis.body, true, ec, 0.035);
  }
  e.node.position.set(x, 0, -y);
  if (AI_INIT[def.ai]) AI_INIT[def.ai](e, o);
  if (ON_DEATH[type]) e.onDeath = ON_DEATH[type];
  if (e.spawning > 0) { addRing(x, y, e.r * 1.6, e.color, 0.5); burst(x, y, e.color, 8, 2, { life: 0.5, size: 0.07, up: 2 }); }
  SIM.enemies.push(e);
  return e;
}

/* ---------------- shared movement helpers ---------------- */
const P_ = () => SIM.player;
function toPlayer(e) { const P = P_(); return { a: angleTo(e.x, e.y, P.x, P.y), d: dist(e.x, e.y, P.x, P.y) }; }
function setVel(e, ang, speed) { e.vx = Math.cos(ang) * speed; e.vy = Math.sin(ang) * speed; }
/** move toward the player, using the flow field when there is no straight line */
function chase(e, speed) {
  const P = P_();
  if (e.fly || World.los(SIM.room, e.x, e.y, P.x, P.y, MASK_WALKER & ~bit(T_DOOR))) { setVel(e, angleTo(e.x, e.y, P.x, P.y), speed); return; }
  const f = World.flowDir(SIM.room, e.x, e.y);
  if (f) { e.vx = f.x * speed; e.vy = f.y * speed; } else setVel(e, angleTo(e.x, e.y, P.x, P.y), speed);
}
/** keep a preferred distance band from the player while circling */
function keepRange(e, speed, near, far, dt) {
  const tp = toPlayer(e);
  e.data.orbitDir = e.data.orbitDir || rndSign();
  let a;
  if (tp.d < near) a = tp.a + Math.PI + e.data.orbitDir * 0.5;
  else if (tp.d > far) { chase(e, speed); return; }
  else a = tp.a + e.data.orbitDir * Math.PI / 2;
  setVel(e, a, speed);
  if (Math.random() < dt * 0.25) e.data.orbitDir *= -1;
}
function canSee(e) { const P = P_(); return World.los(SIM.room, e.x, e.y, P.x, P.y); }
const beatNow = () => (SIM.beat || { beat: 0 });

/* ==========================================================================
   AI BEHAVIOURS
   ========================================================================== */
const AI_INIT = {
  splitter: (e, o) => { if (e.data.size == null) e.data.size = 2; },
  synapse: (e, o) => { e.data.partner = o.partner || null; e.data.phase = 0; e.data.pt = rnd(0.5, 1.5); },
  bouncer: (e) => { const a = rndPick([0.785, 2.356, 3.927, 5.498]) + rnd(-0.2, 0.2); e.data.dx = Math.cos(a); e.data.dy = Math.sin(a); },
  worm: (e) => { e.data.hist = []; e.data.ph = rnd(0, TAU); },
  turncoat: (e) => { e.data.dashCd = rnd(2, 3.5); },
  burrower: (e) => { e.t = rnd(2.2, 2.6); e.data.shot = false; e.data.wind = false; }, // start surfaced (shot gets its wind-up)
};

const AI = {
  chase(e, dt, k) {
    const wob = Math.sin(SIM.time * 3 + e.id) * 0.25;
    chase(e, e.def.speed * k);
    const a = Math.atan2(e.vy, e.vx) + wob * 0.4; const s = Math.hypot(e.vx, e.vy);
    e.vx = Math.cos(a) * s; e.vy = Math.sin(a) * s;
  },
  wiggle(e, dt, k) {
    chase(e, e.def.speed * k);
    const a = Math.atan2(e.vy, e.vx), w = Math.sin(SIM.time * 7 + e.id * 1.7) * 1.1;
    const s = Math.hypot(e.vx, e.vy);
    e.vx = Math.cos(a + w * 0.6) * s; e.vy = Math.sin(a + w * 0.6) * s;
  },
  charger(e, dt, k) {
    const tp = toPlayer(e);
    e.t -= dt; e.cd -= dt * e.rate;
    if (e.state === 0) {
      chase(e, e.def.speed * k);
      e.facing = Math.atan2(e.vy, e.vx);
      if (e.cd <= 0 && tp.d < 9 && canSee(e)) { e.state = 1; e.t = Math.max(0.55, 0.7 / e.rate); e.data.ang = tp.a; sfx('windup', { vol: 0.6 }); }
    } else if (e.state === 1) {
      e.vx = e.vy = 0;
      e.data.ang = lerpAngle(e.data.ang, tp.a, damp(6, dt)); e.facing = e.data.ang;
      if (!e.data.tele) e.data.tele = telegraph({ kind: 'line', x: e.x, y: e.y, ang: e.data.ang, len: 5.5 + e.r, w: e.r * 2, dur: e.t, owner: e, follow: (t) => { t.x = e.x; t.y = e.y; t.ang = e.data.ang; } });
      if (e.t <= 0) { e.state = 2; e.t = 0.9; e.data.left = 5.5; e.data.tele = null; sfx('charge', { rate: rnd(0.9, 1.1) }); }
    } else if (e.state === 2) {
      // fixed reach (matches the drawn line); speed bonuses make it faster, not longer
      const sp = Math.min(10 * k, e.data.left / Math.max(dt, 1e-4));
      setVel(e, e.data.ang, sp); e.data.left -= sp * dt;
      if (Math.random() < 0.6) burst(e.x, e.y, e.color, 1, 1, { life: 0.3, size: 0.08 });
      if (e.data.left <= 1e-3 || e.t <= 0 || e.data.bonk) { e.state = 3; e.t = 0.6; e.data.bonk = false; }
    } else {
      e.vx = e.vy = 0;
      if (e.t <= 0) { e.state = 0; e.cd = rnd(1.8, 2.6); }
    }
  },
  turret(e, dt, k) {
    keepRange(e, e.def.speed * k, 4, 7.5, dt);
    e.cd -= dt * e.rate;
    if (e.state === 0 && e.cd <= 0 && canSee(e)) { e.state = 1; e.t = 0.55; sfx('windup', { vol: 0.35, rate: 1.4 }); }
    if (e.state === 1) {
      e.t -= dt; e.vx *= 0.3; e.vy *= 0.3;
      if (e.t <= 0) {
        const f = SIM.floor.idx, n = f >= 3 ? 3 : f >= 1 ? 2 : 1;
        const a = toPlayer(e).a;
        for (let i = 0; i < n; i++) spawnEShot(e.x, e.y, a, 5.2, { delay: i * 0.14, style: 'orange' });
        sfx('enemy_shoot'); e.state = 0; e.cd = rnd(2.0, 2.6);
      }
    }
  },
  cluster(e, dt, k) { AI.chase(e, dt, k); },
  virion(e, dt, k) {
    keepRange(e, e.def.speed * k, 3.5, 6.5, dt);
    const B = beatNow();
    const onBeats = SIM.floor.region.mechanic === 'beat';
    if (onBeats) {
      const bi = Math.floor(B.beat);
      if (e.data.lastBeat === undefined) e.data.lastBeat = bi;          // first active frame: just sync, never fire
      else if (bi !== e.data.lastBeat) {
        e.data.lastBeat = bi;
        if ((bi + e.id) % 2 === 0) {
          if (e.data.preBeat === bi - 1) {                               // only fire right after a visible pre-tell beat
            e.data.pulse = 1;
            if (canSee(e)) { enemyFan(e.x, e.y, toPlayer(e).a, 3, 0.5, 4.6, { style: 'pink' }); sfx('enemy_shoot', { vol: 0.6 }); }
          }
        } else { e.data.pre = 1; e.data.preBeat = bi; }
      }
    } else {
      e.cd -= dt * e.rate;
      if (e.cd <= 0.5 * e.rate && !e.data.pre) e.data.pre = 1;
      if (e.cd <= 0) { e.cd = rnd(1.6, 2.1); e.data.pulse = 1; e.data.pre = 0; if (canSee(e)) { enemyFan(e.x, e.y, toPlayer(e).a, 3, 0.5, 4.6, { style: 'pink' }); sfx('enemy_shoot', { vol: 0.6 }); } }
    }
    e.data.pulse = Math.max(0, (e.data.pulse || 0) - dt * 3);
    e.data.pre = Math.max(0, (e.data.pre || 0) - dt * 1.5);
  },
  bouncer(e, dt, k) {
    const sp = e.def.speed * k;
    e.vx = e.data.dx * sp; e.vy = e.data.dy * sp;
    const room = SIM.room, nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
    if (World.blockedAt(room, nx + Math.sign(e.vx) * e.r, e.y, MASK_WALKER)) { e.data.dx = -e.data.dx; sfx('hit_armor', { vol: 0.15, rate: 0.7 }); }
    if (World.blockedAt(room, e.x, ny + Math.sign(e.vy) * e.r, MASK_WALKER)) { e.data.dy = -e.data.dy; sfx('hit_armor', { vol: 0.15, rate: 0.7 }); }
    e.facing += dt * 6;
  },
  spawner(e, dt, k) {
    e.anchored = true; e.vx = e.vy = 0;
    const onBeats = SIM.floor.region.mechanic === 'beat';
    let fire = false;
    if (onBeats) { const bi = Math.floor(beatNow().beat); if (bi !== e.data.lb) { e.data.lb = bi; if (bi % 4 === (e.id % 4)) fire = true; else if (bi % 4 === (e.id + 3) % 4) e.data.pre = 1; } }
    else { e.cd -= dt * e.rate; if (e.cd <= 0.5 * e.rate) e.data.pre = 1; if (e.cd <= 0) { e.cd = 3.2; fire = true; } }
    e.data.swell = Math.max(0, (e.data.swell || 0) - dt * 2);
    if (fire) {
      e.data.pre = 0;
      const mine = SIM.enemies.filter(o => !o.dead && o.data.parent === e.id).length;
      e.data.swell = 1;
      if (mine < 3) {
        const a = rnd(0, TAU);
        const c = spawnEnemy('replicant', e.x + Math.cos(a) * 0.9, e.y + Math.sin(a) * 0.9, { summoned: true });
        c.data.parent = e.id; c.spawning = 0.35; sfx('split', { vol: 0.6 });
      } else { enemyRing(e.x, e.y, 6, 3, { style: 'violet' }); sfx('enemy_shoot', { vol: 0.5 }); }
    }
  },
  puffer(e, dt, k) {
    if (e.state === 0) {
      chase(e, e.def.speed * k);
      e.cd -= dt * e.rate;
      if (e.cd <= 0 && toPlayer(e).d < 7) { e.state = 1; e.t = 0.75; telegraph({ kind: 'disc', x: e.x, y: e.y, r: 1.6, dur: 0.75, warm: true, owner: e, follow: (t) => { t.x = e.x; t.y = e.y; } }); }
    } else {
      e.vx *= 0.9; e.vy *= 0.9; e.t -= dt;
      e.data.swell = 1 - e.t / 0.75;
      if (e.t <= 0) {
        e.state = 0; e.cd = rnd(3.2, 4); e.data.swell = 0;
        spawnZone(e.x, e.y, 1.6, 3, 'spore');
        enemyRing(e.x, e.y, 5, 2.4, { style: 'spore', accel: -0.4, life: 3.5 });
        sfx('spore');
      }
    }
  },
  rooter(e, dt, k) {
    e.anchored = true; e.vx = e.vy = 0;
    e.cd -= dt * e.rate;
    if (e.cd <= 0 && canSee(e)) {
      e.cd = rnd(3.0, 3.6);
      const a = toPlayer(e).a, len = 9;
      telegraph({ kind: 'line', x: e.x, y: e.y, ang: a, len, w: 0.75, dur: 0.85, owner: e, then: () => {
        const L = World.rayLen(SIM.room, e.x, e.y, a, len, MASK_WALKER & ~bit(T_HOLE) & ~bit(T_DOOR));
        spawnBeam(e.x, e.y, a, L, 0.75, 0.35, { owner: e, hex: '#d8c8ff' });
        for (let d = 0.6; d < L; d += 0.55) burst(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, '#d8c8ff', 2, 1.2, { life: 0.4, size: 0.08, up: 5 });
        sfx('emerge', { vol: 0.6, rate: 1.3 }); Gfx.addShake(0.12);
      } });
      sfx('windup', { vol: 0.4, rate: 0.8 });
    }
    e.facing = toPlayer(e).a;
  },
  shielded(e, dt, k) {
    e.shieldArc = 0.95;
    chase(e, e.def.speed * k);
    const tp = toPlayer(e);
    e.facing = e.facing + clamp(angDiff(e.facing, tp.a), -1.7 * dt, 1.7 * dt);
    e.cd -= dt * e.rate;
    if (e.data.brace > 0) { // braced wind-up before the fan (readable tell)
      e.data.brace -= dt; e.vx *= 0.4; e.vy *= 0.4;
      if (e.data.brace <= 0) { e.cd = rnd(3, 3.8); enemyFan(e.x, e.y, e.facing, 3, 0.45, 4.2, { style: 'orange' }); sfx('enemy_shoot', { vol: 0.5 }); }
    } else if (e.cd <= 0 && Math.abs(angDiff(e.facing, tp.a)) < 0.35 && canSee(e)) {
      e.data.brace = 0.5; sfx('windup', { vol: 0.35, rate: 1.2 });
    }
  },
  splitter(e, dt, k) {
    const s = e.data.size;
    const sp = e.def.speed * ([2.1, 1.45, 1][s] ?? 1); // size 2 (whole) = data speed; fragments are faster
    chase(e, sp * k);
  },
  burrower(e, dt, k) {
    e.t -= dt;
    if (e.state === 0) { // surfaced
      chase(e, e.def.speed * k);
      if (!e.data.shot && e.t < 1.8 && !e.data.wind) { e.data.wind = true; sfx('windup', { vol: 0.35, rate: 1.5 }); }
      if (!e.data.shot && e.t < 1.2) { e.data.shot = true; e.data.wind = false; if (canSee(e)) { spawnEShot(e.x, e.y, toPlayer(e).a, 4.6, { style: 'orange' }); sfx('enemy_shoot', { vol: 0.5 }); } }
      if (e.t <= 0) { e.state = 1; e.t = 0.4; e.data.wind = false; sfx('burrow', { vol: 0.7 }); }
    } else if (e.state === 1) { // digging
      e.vx = e.vy = 0;
      if (e.t <= 0) { e.state = 2; e.t = 1.7; e.burrowed = true; e.untargetable = true; e.harmless = true; }
    } else if (e.state === 2) { // underground
      chase(e, 3.2 * k);
      if (Math.random() < dt * 14) burst(e.x, e.y, '#8a5a2a', 1, 1.2, { life: 0.5, size: 0.08, up: 2 });
      if (e.t <= 0 || toPlayer(e).d < 1.2) {
        e.state = 3; e.t = 0.55; e.vx = e.vy = 0;
        telegraph({ kind: 'disc', x: e.x, y: e.y, r: 1.2, dur: 0.55, warm: true, owner: e, persist: true });
      }
    } else if (e.state === 3) { // about to emerge
      e.vx = e.vy = 0;
      if (e.t <= 0) {
        e.state = 0; e.t = 2.4; e.data.shot = false; e.data.wind = false; e.burrowed = false; e.untargetable = false; e.harmless = false;
        enemyRing(e.x, e.y, 8, 3.8, { style: 'orange' });
        sfx('emerge'); burst(e.x, e.y, '#8a5a2a', 14, 4, { life: 0.5, size: 0.1, up: 4 });
        Gfx.splat(SIM.room, e.x, e.y, 0.6, '#5a3a1a', 0.4);
      }
    }
  },
  lobber(e, dt, k) {
    keepRange(e, e.def.speed * k, 4, 7, dt);
    e.cd -= dt * e.rate;
    if (e.cd <= 0) {
      e.cd = rnd(2.6, 3.2);
      const P = P_();
      const tx = clamp(P.x + P.vx * 0.6, 1.5, SIM.room.W - 1.5), ty = clamp(P.y + P.vy * 0.6, 1.5, SIM.room.H - 1.5);
      spawnLob(e.x, e.y, tx, ty, 1.0, { hex: '#d6ff3a', r: 1.1, onLand: (x, y) => {
        spawnZone(x, y, 1.1, 3.5, 'acid');
        enemyRing(x, y, 4, 2.6, { style: 'acid', life: 0.8 });
        sfx('acid'); Gfx.splat(SIM.room, x, y, 1, '#a0c020', 0.35);
      } });
      sfx('enemy_shoot_big', { vol: 0.6 });
    }
  },
  worm(e, dt, k) {
    const P = P_();
    chase(e, e.def.speed * k);
    const a = Math.atan2(e.vy, e.vx) + Math.sin(SIM.time * 4 + e.data.ph) * 0.7, s = Math.hypot(e.vx, e.vy);
    e.vx = Math.cos(a) * s; e.vy = Math.sin(a) * s; e.facing = a;
  },
  dasher(e, dt, k) {
    e.t -= dt;
    const P = P_();
    if (e.state === 0) { // drift / rest
      keepRange(e, 1.2 * k, 3, 6, dt);
      if (e.t <= 0) { e.state = 1; e.data.n = 3; e.t = 0; }
    } else if (e.state === 1) { // aim
      if (!e.data.tele) {
        e.data.ang = toPlayer(e).a; e.t = 0.55; // fixed real-time tell (rate only shortens the rest)
        e.data.tele = telegraph({ kind: 'line', x: e.x, y: e.y, ang: e.data.ang, len: 6.5, w: 0.6, dur: e.t, owner: e, follow: (t) => { t.x = e.x; t.y = e.y; } });
        sfx('windup', { vol: 0.35, rate: 1.6 });
      }
      e.vx = e.vy = 0;
      if (e.t <= 0) { e.state = 2; e.t = 0.42; e.data.tele = null; sfx('lightning', { vol: 0.35, rate: 1.5 }); }
    } else if (e.state === 2) { // zap
      setVel(e, e.data.ang, 15);
      burst(e.x, e.y, '#fff27a', 1, 0.6, { life: 0.25, size: 0.07, grav: 0 });
      if (e.t <= 0 || e.data.bonk) {
        e.data.bonk = false; e.data.n--;
        if (e.data.n > 0) { e.state = 1; } else { e.state = 0; e.t = 1.5 / e.rate; }
      }
    }
  },
  blinker(e, dt, k) {
    e.t -= dt; e.vx = e.vy = 0;
    if (e.state === 0) {
      if (e.t <= 0) {
        const P = P_();
        const spots = World.spawnSpots(SIM.room, P.x, P.y, 3.8, true).filter(s => dist(s[0], s[1], P.x, P.y) < 7.5);
        const s = spots.length ? rndPick(spots) : [e.x, e.y];
        e.data.dest = s; e.state = 1; e.t = 0.55;
        telegraph({ kind: 'disc', x: s[0], y: s[1], r: 0.8, dur: 0.55, warm: true, owner: e });
      }
    } else if (e.state === 1) {
      e.data.fade = 1 - e.t / 0.55;
      if (e.t <= 0) {
        burst(e.x, e.y, '#7cf7ff', 10, 3, { life: 0.35, size: 0.06 });
        e.x = e.data.dest[0]; e.y = e.data.dest[1];
        burst(e.x, e.y, '#7cf7ff', 10, 3, { life: 0.35, size: 0.06 });
        sfx('teleport'); e.state = 2; e.t = 0.38; e.data.fade = 0;
      }
    } else if (e.state === 2) {
      if (e.t <= 0) {
        const f = SIM.floor.idx;
        enemyRing(e.x, e.y, 10, 3.6, { style: 'volt' });
        if (f >= 5) enemyRing(e.x, e.y, 10, 3.0, { style: 'volt', delay: 0.3, a0: rnd(0, TAU) });
        sfx('enemy_shoot', { rate: 1.3, vol: 0.6 });
        e.state = 0; e.t = rnd(2.4, 3.2) / e.rate;
      }
    }
  },
  synapse(e, dt, k) {
    const P = P_();
    const partner = e.data.partner && !e.data.partner.dead ? e.data.partner : null;
    // drift in slow circles
    e.data.ph = (e.data.ph || rnd(0, TAU)) + dt * 0.5;
    setVel(e, e.data.ph + (e.data.side || 0), e.def.speed * k);
    if (partner) {
      if (!e.data.leader) return; // leader runs the shared beam
      e.data.pt -= dt * e.rate;
      if (e.data.phase === 0 && e.data.pt <= 0) { e.data.phase = 1; e.data.pt = 0.85; sfx('beam_charge', { vol: 0.4 }); }
      if (e.data.phase === 1) {
        if (!e.data.tele) e.data.tele = telegraph({ kind: 'line', x: e.x, y: e.y, ang: 0, len: 1, w: 0.5, dur: 0.85, owner: e, follow: (t) => { if (!partner || partner.dead) { t.t = 99; return; } t.x = e.x; t.y = e.y; t.ang = angleTo(e.x, e.y, partner.x, partner.y); t.len = dist(e.x, e.y, partner.x, partner.y); } });
        if (e.data.pt <= 0) {
          e.data.tele = null; e.data.phase = 2; e.data.pt = 2.2;
          sfx('lightning', { vol: 0.6 });
          spawnBeam(e.x, e.y, 0, 1, 0.45, 2.2, { owner: e, hex: '#9ab8ff', follow: (b) => { if (!partner || partner.dead) { b.t = 99; return; } b.x = e.x; b.y = e.y; b.ang = angleTo(e.x, e.y, partner.x, partner.y); b.len = dist(e.x, e.y, partner.x, partner.y); } });
        }
      }
      if (e.data.phase === 2 && e.data.pt <= 0) { e.data.phase = 0; e.data.pt = rnd(1.4, 2.0); }
    } else {
      if (!e.data.lone) { e.data.lone = true; e.cd = Math.max(e.cd, 1.0); }
      e.cd -= dt * e.rate;
      if (e.cd <= 0.5 * e.rate && !e.data.wind) { e.data.wind = true; sfx('windup', { vol: 0.3, rate: 1.6 }); }
      if (e.cd <= 0) { e.cd = 1.8; e.data.wind = false; spawnEShot(e.x, e.y, toPlayer(e).a, 5, { style: 'volt' }); sfx('enemy_shoot', { vol: 0.4 }); }
    }
  },
  mortar(e, dt, k) {
    chase(e, e.def.speed * k);
    e.cd -= dt * e.rate;
    if (e.cd <= 0.5 * e.rate && !e.data.wind) { e.data.wind = true; sfx('windup', { vol: 0.4, rate: 0.7 }); }
    if (e.cd <= 0 && canSee(e)) {
      e.cd = rnd(3.0, 3.6); e.data.wind = false;
      spawnEShot(e.x, e.y, toPlayer(e).a, 2.6, { r: 0.34, style: 'violet', life: 1.1, onExpire: (s) => { enemyRing(s.x, s.y, 6, 3.8, { style: 'violet' }); sfx('enemy_shoot', { vol: 0.4, rate: 1.2 }); } });
      sfx('enemy_shoot_big');
    }
  },
  bloater(e, dt, k) { chase(e, e.def.speed * k); e.data.swell = 0.5 + Math.sin(SIM.time * 5 + e.id) * 0.5; },
  turncoat(e, dt, k) {
    const tp = toPlayer(e);
    e.facing = tp.a;
    e.cd -= dt * e.rate;
    if (e.data.windT > 0) {                 // committed wind-up: fixed 0.55s, not scaled by rate
      e.data.windT -= dt;
      e.vx *= 0.3; e.vy *= 0.3;             // plants while aiming (readable)
      e.data.wind = 1 - Math.max(0, e.data.windT) / 0.55;
      if (e.data.windT <= 0) {
        e.data.wind = 0; e.data.tele = null; e.cd = rnd(1.9, 2.4);
        if (canSee(e)) {
          const a = e.data.aim;
          for (let i = 0; i < 3; i++) spawnEShot(e.x, e.y, a + rnd(-0.05, 0.05), 6.5, { delay: i * 0.11, style: 'pink', streak: true, r: 0.14 });
          sfx('shoot_neutrophil', { rate: 0.75, vol: 0.6 });
        }
      }
      return;
    }
    keepRange(e, e.def.speed * k, 4, 6.5, dt);
    e.data.dashCd -= dt;
    if (e.data.dashT > 0) { e.data.dashT -= dt; setVel(e, e.data.dashA, 11); return; }
    if (e.data.dashCd <= 0) { e.data.dashCd = rnd(2.6, 3.6); e.data.dashT = 0.2; e.data.dashA = tp.a + rndSign() * Math.PI / 2; sfx('dash', { vol: 0.4, rate: 1.2 }); return; }
    if (e.cd <= 0 && canSee(e)) {
      e.data.windT = 0.55; e.data.aim = tp.a;
      e.data.tele = telegraph({ kind: 'line', x: e.x, y: e.y, ang: tp.a, len: 6, w: 0.3, dur: 0.55, owner: e,
        follow: (t) => { e.data.aim = lerpAngle(e.data.aim, toPlayer(e).a, 0.08); t.x = e.x; t.y = e.y; t.ang = e.data.aim; } });
      sfx('windup', { vol: 0.35, rate: 1.5 });
    }
  },
};
AI.replicant = AI.chase;
function lerpAngle(a, b, t) { return a + angDiff(a, b) * t; }

/* death behaviours */
const ON_DEATH = {
  staph: (e) => { for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + rnd(-0.3, 0.3); const c = spawnEnemy('coccus', e.x + Math.cos(a) * 0.5, e.y + Math.sin(a) * 0.5, { hp: 5, instant: true }); c.kx = Math.cos(a) * 5; c.ky = Math.sin(a) * 5; c.spawning = 0.25; } sfx('split'); },
  amoeba: (e) => {
    const s = e.data.size; if (s <= 0) return;
    for (let i = 0; i < 2; i++) {
      const a = rnd(0, TAU), ns = s - 1;
      const c = spawnEnemy('amoeba', e.x + Math.cos(a) * 0.3, e.y + Math.sin(a) * 0.3, { hp: [6, 13][ns], r: [0.33, 0.5][ns], size: ns, instant: true, elite: null });
      c.cost = ns === 1 ? 1 : 0.5; // split pieces drop less; whole tree ~2.3x a cost-3 kill
      c.kx = Math.cos(a) * 6; c.ky = Math.sin(a) * 6; c.spawning = 0.2;
    }
    sfx('split');
  },
  moldpuff: (e) => { spawnZone(e.x, e.y, 1.3, 2.2, 'spore'); sfx('spore', { vol: 0.6 }); },
  rotcarrier: (e) => {
    const x = e.x, y = e.y;
    telegraph({ kind: 'disc', x, y, r: 1.7, dur: 0.45, warm: true, then: () => {
      enemyRing(x, y, 10, 4, { style: 'acid' }); spawnZone(x, y, 1.5, 3, 'rot');
      sfx('explosion', { vol: 0.6 }); burst(x, y, '#a8ff5a', 20, 5, { life: 0.5 });
    } });
  },
};

/* ==========================================================================
   VISUALS — each returns {root, body, anim(e,t,dt)}
   ========================================================================== */
function V(e) { const root = Gfx.node('en_' + e.type); const body = Gfx.node('enb'); body.parent = root; return { root, b: body }; }
const ENEMY_VIS = {
  coccus(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('sphere', Gfx.cellMat(e.color, { rim: 1.4, core: 0.3, glow: 0.3 }), b, 0, r, 0, r);
    const c = Gfx.part('sphere', Gfx.cellMat(e.core, { rim: 1.1, core: 0.5, glow: 0.2 }), b, r * 0.25, r * 1.25, 0, r * 0.38);
    return { root, body: m, anim(e, t) { const w = Math.sin(t * 6 + e.id) * 0.06; m.scaling.set(r * (1 + w), r * (1 - w), r * (1 + w)); } };
  },
  replicant(e) { return ENEMY_VIS.coccus(e); },
  spirochete(e) {
    const { root, b } = V(e), r = e.r;
    const mat = Gfx.cellMat(e.color, { rim: 1.5, core: 0.35, glow: 0.35 });
    const segs = [];
    for (let i = 0; i < 7; i++) segs.push(Gfx.part('sphereLo', mat, b, (3 - i) * r * 0.42, r, 0, r * (i === 0 ? 0.55 : 0.42 - i * 0.02)));
    return { root, body: segs[0], anim(e, t) { if (e.vx || e.vy) b.rotation.y = Math.atan2(e.vy, e.vx); segs.forEach((s, i) => { s.position.z = Math.sin(t * 12 - i * 0.9) * r * 0.45; }); } };
  },
  bacillus(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('capsule', Gfx.cellMat(e.color, { rim: 1.4, core: 0.3, glow: 0.3 }), b, 0, r, 0, r * 1.25, r * 1.6, r * 1.6);
    const core = Gfx.part('capsule', Gfx.cellMat(e.core, { rim: 1, core: 0.5, glow: 0.2 }), b, 0, r * 1.1, 0, r * 0.7, r * 0.7, r * 0.7);
    const fl = Gfx.glowMat(e.color, { glow: 0.4, k: 0.7 });
    const tails = [0, 1, 2].map(i => Gfx.part('sphereLo', fl, b, -r * 1.9 - i * 0.12, r, 0, 0.05));
    return { root, body: m, anim(e, t) {
      b.rotation.y = e.facing;
      const shake = e.state === 1 ? Math.sin(t * 70) * 0.05 : 0;
      b.position.z = shake;
      tails.forEach((s, i) => { s.position.z = Math.sin(t * 14 - i) * 0.1; });
    } };
  },
  seeder(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('sphere', Gfx.cellMat(e.color, { rim: 1.4, core: 0.3, glow: 0.25 }), b, 0, r * 0.75, 0, r, r * 0.75, r);
    const noz = Gfx.cellMat(e.core, { rim: 1.5, core: 0.6, glow: 0.4 });
    const ns = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const n = Gfx.part('cone', noz, b, Math.cos(a) * r * 0.6, r * 1.2, Math.sin(a) * r * 0.6, r * 0.18, r * 0.3, r * 0.18); n.rotation.z = Math.cos(a) * 0.5; n.rotation.x = -Math.sin(a) * 0.5; ns.push(n); }
    const glowCore = Gfx.part('sphereLo', Gfx.glowMat('#ffd06a', { glow: 0.9 }), b, 0, r * 1.25, 0, r * 0.22);
    return { root, body: m, anim(e, t) { const w = e.state === 1 ? 1 + Math.sin(t * 40) * 0.12 : 1 + Math.sin(t * 3) * 0.04; m.scaling.set(r * w, r * 0.75 / w, r * w); glowCore.scaling.setAll(r * (e.state === 1 ? 0.4 : 0.2)); } };
  },
  staph(e) {
    const { root, b } = V(e), r = e.r;
    const mat = Gfx.cellMat(e.color, { rim: 1.4, core: 0.3, glow: 0.25 });
    const ps = [];
    const pts = [[0, 0.55, 0], [0.42, 0.5, 0.2], [-0.4, 0.5, 0.25], [0.1, 0.5, -0.45], [-0.3, 0.9, -0.15], [0.3, 0.92, 0.0], [0.0, 0.95, 0.35]];
    for (const p of pts) ps.push(Gfx.part('sphere', mat, b, p[0] * r, p[1] * r * 1.1, p[2] * r, r * 0.42));
    return { root, body: ps[0], anim(e, t) { ps.forEach((p, i) => { const w = 1 + Math.sin(t * 5 + i * 1.3) * 0.07; p.scaling.setAll(r * 0.42 * w); }); b.rotation.y += 0.01; } };
  },
  virion(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('icoFlat', Gfx.cellMat(e.color, { rim: 1.6, core: 0.4, glow: 0.45 }), b, 0, 0.9, 0, r * 0.75);
    const sp = Gfx.cellMat('#ffd0f0', { rim: 1.4, core: 0.6, glow: 0.4 });
    const spikes = [];
    for (let i = 0; i < 10; i++) {
      const th = Math.acos(1 - 2 * (i + 0.5) / 10), ph = i * 2.4;
      const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph);
      const s = Gfx.part('sphereLo', sp, b, dx * r * 1.05, 0.9 + dy * r * 1.05, dz * r * 1.05, r * 0.16);
      spikes.push(s);
    }
    return { root, body: m, anim(e, t) {
      b.rotation.y += 0.02; b.rotation.x = Math.sin(t) * 0.2;
      const p = 1 + (e.data.pulse || 0) * 0.35 + (e.data.pre || 0) * Math.sin(t * 50) * 0.08;
      b.scaling.setAll(p); b.position.y = Math.sin(t * 2 + e.id) * 0.1;
    } };
  },
  sickle(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('torusThick', Gfx.cellMat(e.color, { rim: 1.4, core: 0.3, glow: 0.3 }), b, 0, r * 0.5, 0, r * 0.95, r * 1.4, r * 0.6);
    const c = Gfx.part('sphere', Gfx.cellMat(e.core, { rim: 1, core: 0.4, glow: 0.2 }), b, 0, r * 0.45, 0, r * 0.5, r * 0.25, r * 0.3);
    return { root, body: m, anim(e, t) { b.rotation.y = e.facing; } };
  },
  lysogen(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('sphere', Gfx.cellMat(e.color, { rim: 1.5, core: 0.25, glow: 0.3, alpha: 0.55 }), b, 0, r, 0, r);
    const inner = Gfx.cellMat('#ff5ad1', { rim: 1.4, core: 0.5, glow: 0.45 });
    const vs = [];
    for (let i = 0; i < 6; i++) vs.push(Gfx.part('icoFlat', inner, b, rnd(-0.5, 0.5) * r, r + rnd(-0.4, 0.4) * r, rnd(-0.5, 0.5) * r, r * 0.17));
    return { root, body: m, anim(e, t) { const s = r * (1 + (e.data.swell || 0) * 0.25 + Math.sin(t * 2.5) * 0.04 + (e.data.pre || 0) * (0.15 + Math.sin(t * 40) * 0.05)); m.scaling.setAll(s); vs.forEach((v, i) => { v.rotation.y += 0.03; v.position.y = r + Math.sin(t * 2 + i) * 0.12 * r; }); } };
  },
  moldpuff(e) {
    const { root, b } = V(e), r = e.r;
    const mat = Gfx.cellMat(e.color, { rim: 1.3, core: 0.3, glow: 0.3, alpha: 0.85 });
    const ps = [Gfx.part('sphere', mat, b, 0, 0.9, 0, r), Gfx.part('sphere', mat, b, r * 0.6, 0.75, r * 0.3, r * 0.6), Gfx.part('sphere', mat, b, -r * 0.5, 0.8, -r * 0.4, r * 0.65)];
    const dots = Gfx.glowMat('#3aaa7a', { glow: 0.5 });
    for (let i = 0; i < 6; i++) Gfx.part('sphereLo', dots, b, rnd(-0.6, 0.6) * r, 0.9 + rnd(-0.3, 0.6) * r, rnd(-0.6, 0.6) * r, 0.05);
    return { root, body: ps[0], anim(e, t) { const s = 1 + (e.data.swell || 0) * 0.45 + Math.sin(t * 2 + e.id) * 0.05; b.scaling.setAll(s); b.position.y = Math.sin(t * 1.5 + e.id) * 0.1; } };
  },
  hypha(e) {
    const { root, b } = V(e), r = e.r;
    const mat = Gfx.cellMat(e.color, { rim: 1.4, core: 0.3, glow: 0.3 });
    const m = Gfx.part('sphere', mat, b, 0, r * 0.6, 0, r, r * 0.6, r);
    const br = [];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU, c = Gfx.part('cyl', mat, b, Math.cos(a) * r * 0.5, r * 1.1, Math.sin(a) * r * 0.5, 0.05, r * 0.6, 0.05);
      c.rotation.z = Math.cos(a) * 0.6; c.rotation.x = -Math.sin(a) * 0.6; br.push(c);
      Gfx.part('sphereLo', Gfx.glowMat('#f0e8ff', { glow: 0.6 }), b, Math.cos(a) * r * 1.0, r * 1.6, Math.sin(a) * r * 1.0, 0.07);
    }
    return { root, body: m, anim(e, t) { b.rotation.y = Math.sin(t * 0.7 + e.id) * 0.3; } };
  },
  waxback(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('capsule', Gfx.cellMat(e.color, { rim: 1.2, core: 0.25, glow: 0.2 }), b, -r * 0.1, r * 0.8, 0, r * 0.9, r * 1.4, r * 1.6);
    const sh = Gfx.cellMat('#fff6c8', { rim: 2.0, core: 0.5, glow: 0.5, dark: 0.9 });
    const shield = Gfx.part('torusThick', sh, b, r * 0.55, r * 0.8, 0, r * 1.05, r * 1.3, r * 1.05);
    shield.rotation.z = Math.PI / 2;
    // only front half visible: squash so it reads as a shell
    shield.scaling.set(r * 0.5, r * 1.2, r * 1.05);
    return { root, body: m, anim(e, t) {
      b.rotation.y = e.facing;
      const br = e.data.brace > 0;
      b.position.z = br ? Math.sin(t * 60) * 0.05 : 0;
      shield.scaling.set(r * 0.5 * (br ? 1.25 : 1), r * 1.2, r * 1.05);
    } };
  },
  amoeba(e) {
    const { root, b } = V(e), r = e.r;
    const mat = Gfx.cellMat(e.color, { rim: 1.5, core: 0.3, glow: 0.3, alpha: 0.75 });
    const main = Gfx.part('sphere', mat, b, 0, r * 0.7, 0, r, r * 0.7, r);
    const pods = [];
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; pods.push(Gfx.part('sphere', mat, b, Math.cos(a) * r * 0.6, r * 0.5, Math.sin(a) * r * 0.6, r * 0.45)); }
    Gfx.part('sphere', Gfx.cellMat(e.core, { rim: 1.2, core: 0.6, glow: 0.3 }), b, 0, r * 0.75, 0, r * 0.32);
    return { root, body: main, anim(e, t) { pods.forEach((p, i) => { const a = i / 4 * TAU + t * 0.6, d = r * (0.55 + Math.sin(t * 3 + i * 2) * 0.2); p.position.set(Math.cos(a) * d, r * 0.5, Math.sin(a) * d); }); } };
  },
  fluke(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('sphere', Gfx.cellMat(e.color, { rim: 1.3, core: 0.3, glow: 0.25 }), b, 0, r * 0.45, 0, r * 1.4, r * 0.4, r * 0.85);
    const s = Gfx.part('torus', Gfx.cellMat('#ff6a3a', { rim: 1.5, core: 0.5, glow: 0.4 }), b, r * 0.8, r * 0.7, 0, r * 0.25, r * 0.3, r * 0.25);
    return { root, body: m, anim(e, t) {
      b.rotation.y = Math.atan2(e.vy, e.vx) || b.rotation.y;
      const under = e.state === 2 ? 1 : e.state === 1 ? 1 - e.t / 0.4 : e.state === 3 ? 1 : 0;
      b.position.y = -under * r * 1.5; b.setEnabled(under < 0.98);
      const w = e.data.wind ? 1 + Math.sin(t * 40) * 0.12 : 1; // shot wind-up wobble
      m.scaling.set(r * 1.4 * (1 + Math.sin(t * 8) * 0.08) * w, r * 0.4, r * 0.85 * w);
      b.position.z = e.data.wind ? Math.sin(t * 60) * 0.05 : 0;
    } };
  },
  bilespitter(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('sphere', Gfx.cellMat(e.color, { rim: 1.4, core: 0.3, glow: 0.3 }), b, 0, r * 0.8, 0, r, r * 0.85, r);
    const sp = Gfx.part('cyl', Gfx.cellMat(e.core, { rim: 1.4, core: 0.5, glow: 0.3 }), b, 0, r * 1.6, 0, r * 0.3, r * 0.4, r * 0.3);
    return { root, body: m, anim(e, t) { const w = e.cd < 0.4 ? 1 + Math.sin(t * 40) * 0.1 : 1; m.scaling.set(r * w, r * 0.85 / w, r * w); } };
  },
  wormling(e) {
    const { root, b } = V(e), r = e.r;
    const mat = Gfx.cellMat(e.color, { rim: 1.3, core: 0.3, glow: 0.25 });
    const head = Gfx.part('sphere', mat, b, 0, r, 0, r);
    Gfx.part('torus', Gfx.cellMat('#ff6a3a', { rim: 1.5, core: 0.5, glow: 0.4 }), b, r * 0.7, r, 0, r * 0.25, r * 0.4, r * 0.25).rotation.z = Math.PI / 2;
    const segs = [];
    for (let i = 0; i < 4; i++) { const s = Gfx.part('sphere', mat, null, 0, r * 0.9, 0, r * (0.85 - i * 0.12)); s.parent = root.parent || null; segs.push(s); }
    return { root, body: head, segs, anim(e, t) {
      b.rotation.y = e.facing;
      // sample by distance moved (not per call) so body length is frame-rate / hitstop independent
      const h = e.data.hist, STEP = r * 0.25;
      if (!h.length || dist(e.x, e.y, h[0][0], h[0][1]) >= STEP) { h.unshift([e.x, e.y]); if (h.length > 20) h.pop(); }
      segs.forEach((s, i) => { const p = h[Math.min(h.length - 1, (i + 1) * 4)]; s.position.set(p[0], r * 0.85, -p[1]); s.setEnabled(!e.dead); });
    }, dispose() { segs.forEach(s => s.dispose()); } };
  },
  spark(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('octa', Gfx.glowMat(e.color, { glow: 1.0, k: 1.1 }), b, 0, 0.8, 0, r * 0.9);
    const orb = [];
    for (let i = 0; i < 3; i++) orb.push(Gfx.part('sphereLo', Gfx.glowMat('#ffffff', { glow: 0.8 }), b, 0, 0.8, 0, 0.05));
    return { root, body: m, anim(e, t) { m.rotation.y += 0.15; orb.forEach((o, i) => { const a = t * 9 + i * 2.1; o.position.set(Math.cos(a) * r * 1.3, 0.8 + Math.sin(a * 1.3) * 0.15, Math.sin(a) * r * 1.3); }); } };
  },
  prion(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('dodeca', Gfx.cellMat(e.color, { rim: 1.8, core: 0.5, glow: 0.5 }), b, 0, 0.9, 0, r * 0.8);
    const ring = Gfx.part('torus', Gfx.glowMat('#c0fbff', { glow: 0.7 }), b, 0, 0.9, 0, r * 1.3, r * 1.3, r * 1.3);
    return { root, body: m, anim(e, t) { m.rotation.y += 0.04; m.rotation.x += 0.025; ring.rotation.x = t * 2; ring.rotation.z = t * 1.3; const f = 1 - (e.data.fade || 0) * 0.9; b.scaling.setAll(Math.max(0.05, f)); } };
  },
  synapse(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('sphere', Gfx.cellMat(e.color, { rim: 1.6, core: 0.4, glow: 0.45 }), b, 0, 0.9, 0, r * 0.8);
    const dm = Gfx.glowMat('#cfe0ff', { glow: 0.5 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const c = Gfx.part('cyl', dm, b, Math.cos(a) * r * 0.9, 0.9, Math.sin(a) * r * 0.9, 0.03, r * 0.4, 0.03); c.rotation.z = Math.PI / 2; c.rotation.y = -a; }
    return { root, body: m, anim(e, t) { b.rotation.y += 0.01; b.position.y = Math.sin(t * 2 + e.id) * 0.08; const w = e.data.wind ? 1 + Math.sin(t * 50) * 0.12 : 1; m.scaling.setAll(r * 0.8 * w); } };
  },
  plaque(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('icoFlat', Gfx.cellMat(e.color, { rim: 1.2, core: 0.25, glow: 0.2, dark: 0.6 }), b, 0, r * 0.85, 0, r, r * 0.85, r);
    for (let i = 0; i < 5; i++) Gfx.part('icoFlat', Gfx.cellMat('#a080d8', { rim: 1.2, core: 0.3, glow: 0.15 }), b, rnd(-0.6, 0.6) * r, r * rnd(0.6, 1.3), rnd(-0.6, 0.6) * r, r * rnd(0.25, 0.4));
    return { root, body: m, anim(e, t) { const w = e.data.wind ? 1 + Math.sin(t * 30) * 0.08 : 1; b.scaling.set(w, 1 / w, w); } };
  },
  rotcarrier(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('sphere', Gfx.cellMat(e.color, { rim: 1.3, core: 0.3, glow: 0.3, dark: 0.45 }), b, 0, r, 0, r);
    const pm = Gfx.cellMat('#ffd03a', { rim: 1.5, core: 0.6, glow: 0.5 });
    const pus = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, y = rnd(0.6, 1.5); pus.push(Gfx.part('sphereLo', pm, b, Math.cos(a) * r * 0.85, r * y, Math.sin(a) * r * 0.85, r * 0.2)); }
    return { root, body: m, anim(e, t) { const s = r * (1 + (e.data.swell || 0) * 0.1); m.scaling.setAll(s); } };
  },
  turncoat(e) {
    const { root, b } = V(e), r = e.r;
    const m = Gfx.part('sphere', Gfx.cellMat(e.color, { rim: 1.6, core: 0.3, glow: 0.4, alpha: 0.65 }), b, 0, r, 0, r);
    const n = Gfx.cellMat('#2a0a20', { rim: 1.4, core: 0.6, glow: 0.2 });
    Gfx.part('sphere', n, b, -0.05, r, 0.08, r * 0.3); Gfx.part('sphere', n, b, 0.07, r, -0.08, r * 0.28);
    const pod = Gfx.part('sphere', Gfx.cellMat(e.color, { rim: 1.6, core: 0.3, glow: 0.4, alpha: 0.65 }), b, r * 0.7, r * 0.9, 0, r * 0.42);
    return { root, body: m, anim(e, t) { b.rotation.y = e.facing; const w = e.data.wind || 0; pod.position.x = r * (0.7 + w * 0.45); pod.scaling.setAll(r * 0.42 * (1 + w * 0.6)); } };
  },
};

/* ==========================================================================
   UPDATE
   ========================================================================== */
function updateEnemies(dt) {
  const room = SIM.room, P = SIM.player;
  for (let i = SIM.enemies.length - 1; i >= 0; i--) {
    const e = SIM.enemies[i];
    if (e.dead) { disposeEnemy(e); SIM.enemies.splice(i, 1); continue; }
    if (e.spawning > 0) { e.spawning -= dt; animateEnemy(e, dt); continue; }
    updateStatus(e, dt);
    if (e.dead) continue;
    let k = e.speedK * (P ? P.st.enemySpeedMult : 1) * (e.slowT > 0 ? e.slowK : 1) * e.zoneSlow;
    e.zoneSlow = 1;
    if (e.stunT > 0) {
      e.vx *= 0.8; e.vy *= 0.8;
      // AI timers are frozen while stunned, so freeze its own telegraphs too (updateTeles runs after us and adds dt back)
      for (const t of SIM.teles) if (t.owner === e) t.t = Math.max(0, t.t - dt);
    }
    else if (e.isBoss) e.update(e, dt, k);
    else (AI[e.def.ai] || AI.chase)(e, dt, k);
    e.data.bonk = false; // set below by collision; read by the AI on the next step
    // integrate (knockback capped + sub-stepped so it can't tunnel through walls)
    const kk = damp(7, dt);
    if (!e.isBoss) { const km = Math.hypot(e.kx, e.ky); if (km > 16) { e.kx *= 16 / km; e.ky *= 16 / km; } }
    // soft bodies: non-boss walkers squeeze through 1-tile gaps (visual/shot radius stays e.r)
    const cr = (e.fly || e.isBoss) ? e.r * 0.9 : Math.min(e.r * 0.9, 0.44);
    const mvx = (e.vx + e.kx) * dt, mvy = (e.vy + e.ky) * dt;
    const ns = e.noCollide ? 1 : Math.min(12, Math.ceil(Math.hypot(mvx, mvy) / 0.2) || 1);
    for (let s = 0; s < ns; s++) {
      e.x += mvx / ns; e.y += mvy / ns;
      if (!e.noCollide && World.collideCircle(room, e, cr, e.fly ? MASK_FLYER : MASK_WALKER)) e.data.bonk = true;
    }
    e.kx = lerp(e.kx, 0, kk); e.ky = lerp(e.ky, 0, kk);
    // separation (skipped while pressed against a tile so two walkers can't deadlock in a gap)
    if (!e.isBoss && !e.burrowed && !e.data.bonk) {
      for (const o of SIM.enemies) {
        if (o === e || o.dead || o.burrowed || o.isBoss || o.fly !== e.fly) continue;
        const dx = e.x - o.x, dy = e.y - o.y, rr = (e.r + o.r) * 0.85, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d) * 0.5; e.x += dx / d * push; e.y += dy / d * push; }
      }
    }
    // hard safety net: a non-boss can never leave the room interior (border tiles are always solid)
    if (!e.isBoss) { e.x = clamp(e.x, 1 + cr, room.W - 1 - cr); e.y = clamp(e.y, 1 + cr, room.H - 1 - cr); }
    animateEnemy(e, dt);
  }
}
function animateEnemy(e, dt) {
  const n = e.node; if (!n) return;
  n.position.set(e.x, 0, -e.y);
  if (e.spawning > 0) {
    const k = 1 - e.spawning / e.spawnMax;
    n.scaling.setAll(Math.max(0.01, easeOutBack(clamp(k, 0, 1))));
    n.position.y = -(1 - k) * e.r;
  } else if (n.scaling.x !== 1 && !e.isBoss) n.scaling.setAll(1);
  if (e.vis.anim) e.vis.anim(e, SIM.time, dt);
  // hit flash / status tint
  const want = e.hurtT > 0 ? 'hit' : e.markT > 0 ? 'mark' : e.stunT > 0 ? 'stun' : null;
  if (want !== e._ov) {
    e._ov = want;
    if (want === 'hit') Gfx.setOverlay(e.vis.b || n, true, '#ffffff', 0.85);
    else if (want === 'mark') Gfx.setOverlay(e.vis.b || n, true, '#9dff7a', 0.35);
    else if (want === 'stun') Gfx.setOverlay(e.vis.b || n, true, '#ffe066', 0.35);
    else Gfx.setOverlay(e.vis.b || n, false);
  }
  if (e.vis.eliteRing) e.vis.eliteRing.rotation.y += dt * 2;
}
function disposeEnemy(e) {
  if (e.vis && e.vis.dispose) e.vis.dispose();
  if (e.node) { e.node.dispose(); e.node = null; }
}
function clearEnemies() { for (const e of SIM.enemies) disposeEnemy(e); SIM.enemies.length = 0; }

/* ==========================================================================
   ENCOUNTERS
   ========================================================================== */
function rollElite(f, forced) {
  const run = SIM.run;
  let p = f < 1 ? 0 : 0.06 + 0.025 * f;
  if (run && run.fever >= 3) p *= 2;
  if (SIM.floor && SIM.floor.region.mechanic === 'necrosis') p += 0.08;
  if (!forced && Math.random() > p) return null;
  return rndPick(Object.keys(ELITES));
}
/** Build the list of spawns for a room (called on first entry). */
function planEncounter(room, floorIdx, rng) {
  const region = REGIONS[floorIdx];
  const sizeK = room.boss ? 1 : [1, 1.75, 2.7][room.cw * room.ch - 1] || 2.7;
  let budget = (5 + 2.3 * floorIdx) * sizeK * rng.range(0.88, 1.15);
  if (floorIdx === 0 && room.distFromStart <= 1) budget *= 0.7;
  if (room.type === 'elite') budget *= 0.75;
  const pool = region.pool;
  const out = [];
  const counts = {};
  let guard = 0;
  while (budget > 0.9 && guard++ < 60) {
    const opts = pool.filter(([t]) => ENEMIES[t].cost <= budget + 0.01 && (counts[t] || 0) < (ENEMIES[t].cost >= 3 ? 2 : 4) * Math.ceil(sizeK));
    if (!opts.length) break;
    const [t] = rng.weighted(opts, (o) => o[1]);
    counts[t] = (counts[t] || 0) + 1;
    budget -= ENEMIES[t].cost;
    out.push({ type: t });
  }
  if (room.type === 'elite') {
    const big = pool.filter(([t]) => ENEMIES[t].cost >= 2);
    const t = rng.weighted(big, (o) => o[1])[0];
    out.unshift({ type: t, elite: rng.pick(Object.keys(ELITES)), forced: true });
  }
  // waves
  const waves = (floorIdx >= 1 && out.length >= 5 && rng.chance(0.32)) ? 2 : 1;
  const plan = [[], []];
  out.forEach((s, i) => plan[waves === 2 && i >= Math.ceil(out.length * 0.55) ? 1 : 0].push(s));
  return waves === 2 ? plan : [plan[0]];
}
function spawnWave(wave, entryX, entryY) {
  const room = SIM.room, f = SIM.floor.idx;
  for (const s of wave) {
    const def = ENEMIES[s.type];
    const spots = World.spawnSpots(room, entryX, entryY, 5.2, def.fly);
    let p = spots.length ? rndPick(spots) : [room.W / 2, room.H / 2];
    // keep them from stacking on each other
    for (let k = 0; k < 6; k++) { if (SIM.enemies.every(o => dist2(o.x, o.y, p[0], p[1]) > 1.2)) break; p = rndPick(spots) || p; }
    const elite = s.elite || rollElite(f);
    if (s.type === 'synapse') {
      const a = spawnEnemy('synapse', p[0], p[1], { elite });
      const spots2 = spots.filter(q => dist(q[0], q[1], p[0], p[1]) > 3 && dist(q[0], q[1], p[0], p[1]) < 7);
      const q = spots2.length ? rndPick(spots2) : [p[0] + 3, p[1]];
      const b = spawnEnemy('synapse', q[0], q[1], {});
      a.data.partner = b; b.data.partner = a; a.data.leader = true; a.data.side = 0; b.data.side = Math.PI;
    } else if (s.type === 'amoeba') spawnEnemy('amoeba', p[0], p[1], { elite, size: 2 });
    else spawnEnemy(s.type, p[0], p[1], { elite });
  }
  sfx('spawn');
}

/* ==========================================================================
   REGION MECHANICS
   ========================================================================== */
function setupRoomMechanic(room, floor, rng) {
  const mech = floor.region.mechanic;
  room.mech = null; room.force = null;
  if (room.type !== 'normal' && room.type !== 'elite') return;
  if (mech === 'current' && rng.chance(0.4) && !(room.distFromStart <= 1)) {
    const d = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    room.mech = { kind: 'current', dx: d[0], dy: d[1], str: rng.range(1.1, 1.5) };
  } else if (mech === 'breath' && rng.chance(0.5)) {
    const horiz = rng.chance(0.5);
    room.mech = { kind: 'breath', dx: horiz ? 1 : 0, dy: horiz ? 0 : 1, str: 1.3, period: 8 };
  } else if (mech === 'synapse' && rng.chance(0.35)) {
    room.mech = { kind: 'storm', t: 3 };
  }
}
let _lastBreathSign = 0;
function updateRoomMechanic(dt) {
  const room = SIM.room, m = room.mech;
  const region = SIM.floor.region;
  // heart: floor pulse on every beat
  if (region.mechanic === 'beat') {
    const b = SIM.beat.beat, ph = b - Math.floor(b);
    room.pulse = Math.max(0, 1 - ph * 3.5);
    if (Math.floor(b) !== SIM._lastBeatFx) { SIM._lastBeatFx = Math.floor(b); Gfx.punch(0.25); }
  } else room.pulse = 0;
  if (!m) { room.force = null; return; }
  const active = !room.cleared;
  if (m.kind === 'current') {
    room.force = active ? { x: m.dx * m.str, y: m.dy * m.str } : { x: m.dx * m.str * 0.4, y: m.dy * m.str * 0.4 };
    if (Math.random() < dt * 30) {
      const P = SIM.player;
      const x = rnd(1, room.W - 1), y = rnd(1, room.H - 1);
      SIM.particles.push({ x, y, h: rnd(0.1, 0.9), vx: m.dx * rnd(3, 6), vy: m.dy * rnd(3, 6), vh: 0, life: rnd(0.6, 1.2), t: 0, size: rnd(0.04, 0.08), hex: '#ff8a9a', grav: 0, drag: 0 });
    }
  } else if (m.kind === 'breath') {
    const s = Math.sin(SIM.roomTime * TAU / m.period);
    const sign = Math.sign(s);
    if (sign !== _lastBreathSign && Math.abs(s) > 0.05) { _lastBreathSign = sign; sfx(sign > 0 ? 'breath_in' : 'breath_out', { vol: 0.6 }); }
    room.force = { x: m.dx * m.str * s, y: m.dy * m.str * s };
    if (Math.random() < dt * 22 * Math.abs(s)) {
      const x = rnd(1, room.W - 1), y = rnd(1, room.H - 1);
      SIM.particles.push({ x, y, h: rnd(0.2, 1.2), vx: m.dx * s * rnd(3, 5), vy: m.dy * s * rnd(3, 5), vh: 0, life: rnd(0.6, 1.1), t: 0, size: rnd(0.03, 0.06), hex: '#d8e4ff', grav: 0, drag: 0 });
    }
  } else if (m.kind === 'storm' && active && SIM.combatAllowed) {
    m.t -= dt;
    if (m.t <= 0) {
      m.t = rnd(3.5, 5);
      const P = SIM.player;
      for (let i = 0; i < 3; i++) {
        const x = clamp(P.x + rnd(-3.5, 3.5), 1.5, room.W - 1.5), y = clamp(P.y + rnd(-3, 3), 1.5, room.H - 1.5);
        telegraph({ kind: 'disc', x, y, r: 1.1, dur: 0.95 + i * 0.15, then: () => {
          burst(x, y, '#fff27a', 12, 5, { life: 0.3, size: 0.07, up: 6 }); addRing(x, y, 1.1, '#fff27a', 0.25);
          sfx('lightning', { vol: 0.5 });
          const P2 = SIM.player; if (P2 && dist2(P2.x, P2.y, x, y) < (1.1 + P2.hitR) ** 2) hurtPlayer(1, { kind: 'lightning' });
        } });
      }
    }
  }
}
