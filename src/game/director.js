// The AI Director: pacing (intensity -> build up / sustain / fade / relax), mobs,
// wanderers, special infected, bosses and panic events (crescendos / finales).
import * as THREE from 'three';
import { DIRECTOR, DIFFICULTY, U } from './config.js';
import { Common } from './infected.js';
import { createSpecial } from './specials.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);

export class Director {
  constructor(world) {
    this.world = world;
    this.phase = 'build';
    this.phaseT = 0;
    this.phaseDur = DIRECTOR.buildUpMin;
    this.enabled = false;           // starts when survivors leave the saferoom
    this.mobTimer = 0;
    this.mobRecharge = 0;
    this.pendingSpawns = [];
    this.specialTimers = {};
    this.specialSlotsT = [];
    this.panic = null;
    this.commonLimit = 30;
    this.wandererTarget = 0;
    this.wanderT = 0;
    this.bossSlots = [];
    this.relaxFlowStart = 0;
    this.specialsAllowed = true;
    this.mobsAllowed = true;
    this.wanderersAllowed = true;
    this.tankAlive = null;
    this.music = null;
    this.stats = { mobs: 0 };
    this.variant = 'civilian';
    this.hazmatChance = 0;
  }

  init() {
    const w = this.world, nav = w.nav, lvl = w.level;
    // escape-route flow distance (from the goal backwards), used as "progress"
    this.escape = new Float32Array(nav.count);
    const goals = w.builder.markers.filter((m) => m.type === 'goal').map((m) => nav.nearest(m.pos.x, m.pos.y + 0.3, m.pos.z, 4)).filter((n) => n >= 0);
    for (const vl of (w.level.virtualLinks || [])) { const a = nav.nearest(vl.from[0], vl.from[1] + 0.3, vl.from[2], 3), b = nav.nearest(vl.to[0], vl.to[1] + 0.3, vl.to[2], 3); nav.addVirtualLink(a, b, vl.cost || 5); }
    nav.flowField(goals, this.escape, true, 100000, 3, true);
    // start flow = escape at start position
    const st = w.survivors[0].body.pos;
    const sn = nav.nearest(st.x, st.y + 0.3, st.z, 4);
    this.totalFlow = sn >= 0 && this.escape[sn] < Infinity ? this.escape[sn] : 300;
    const cfg = lvl.director || {};
    this.cfg = cfg;
    this.variant = cfg.variant || 'civilian';
    this.hazmatChance = cfg.hazmatChance || 0;
    const mi = DIRECTOR.mobInterval[w.difficulty];
    this.mobTimer = rand(mi[0], mi[1]) * (cfg.mobIntervalScale || 1);
    this.firstSpecial = rand(DIRECTOR.specialInitial[0], DIRECTOR.specialInitial[1]) * (cfg.specialDelayScale || 1);
    this.maxSpecials = cfg.maxSpecials !== undefined ? cfg.maxSpecials : (w.difficulty === 'expert' || w.difficulty === 'advanced' ? 3 : 2);
    this.specialRespawn = cfg.specialRespawn || DIRECTOR.specialRespawn;
    this.specialTypes = cfg.specials || ['boomer', 'hunter', 'smoker', 'charger', 'jockey', 'spitter'];
    this.wanderDensity = cfg.wanderDensity !== undefined ? cfg.wanderDensity : 1;
    // boss slots along flow (fractions of total route)
    for (const b of (cfg.bosses || [])) {
      if (Math.random() > (b.chance !== undefined ? b.chance : 1)) continue;
      this.bossSlots.push({ type: b.type, at: rand(b.min, b.max) * this.totalFlow, done: false });
    }
    if (cfg.startEnabled) this.start();
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.startTime = this.world.time;
    this.world.events.emit('directorStart');
  }

  // ------------------------------------------------------------ progress
  progressOf(s) {
    const n = s.navNode !== undefined ? s.navNode : this.world.nav.nearest(s.body.pos.x, s.body.pos.y, s.body.pos.z, 3);
    if (n < 0 || this.escape[n] === Infinity) return s.lastProgress || 0;
    s.lastProgress = this.totalFlow - this.escape[n];
    return s.lastProgress;
  }
  teamProgress() {
    let m = 0;
    for (const s of this.world.survivors) if (s.state !== 'dead') m = Math.max(m, this.progressOf(s));
    return m;
  }

  // ------------------------------------------------------------ intensity
  onSurvivorHurt(s, amount, info) {
    if (info.type === 'ff') return;
    s.intensity = Math.min(1, s.intensity + amount / 100 * 0.25 * 4);
  }
  onIncap(s) { s.intensity = 1; }
  onDeath(s) { s.intensity = 1; }
  onInfectedKilled(z, info) {
    for (const s of this.world.survivors) {
      if (s.state === 'dead') continue;
      const d = s.body.pos.distanceTo(z.position);
      if (d < 500 * U) s.intensity = Math.min(1, s.intensity + (d < 150 * U ? 0.05 : 0.05 * (1 - (d - 150 * U) / (350 * U))));
    }
    if (z.type !== 'common') {
      const t = z.type;
      this.specialTimers[t] = this.world.time + this.specialRespawn;
      this.specialSlotsT.push(this.world.time + this.specialRespawn * rand(0.6, 1.0));
      if (t === 'tank') { this.tankAlive = null; this.world.events.emit('tankDead', z); }
    }
  }
  maxIntensity() { let m = 0; for (const s of this.world.survivors) if (s.state !== 'dead') m = Math.max(m, s.intensity); return m; }

  // ------------------------------------------------------------ update
  update(dt) {
    const w = this.world;
    // intensity decay (paused while engaged)
    for (const s of w.survivors) {
      let engaged = false;
      for (const z of w.infected) if (z.alive && (z.state === 'chase' || z.state === 'attack' || z.pinTarget) && z.position.distanceToSquared(s.body.pos) < 19 * 19) { engaged = true; break; }
      if (!engaged) s.intensity = Math.max(0, s.intensity - dt / DIRECTOR.intensityDecayTime);
    }
    this.flushSpawns();
    if (!this.enabled) return;
    const team = this.teamProgress();
    this.updateTempo(dt, team);
    this.updateMobs(dt);
    this.updateWanderers(dt, team);
    this.updateSpecials(dt);
    this.updateBosses(team);
    this.updatePanic(dt);
    this.cullFar(dt);
  }

  updateTempo(dt, team) {
    const w = this.world;
    if (this.panic || this.lockBuild) { this.phase = 'build'; return; }
    this.phaseT += dt;
    const I = this.maxIntensity();
    switch (this.phase) {
      case 'build':
        if (this.phaseT > DIRECTOR.buildUpMin && I >= DIRECTOR.peakThreshold) { this.phase = 'sustain'; this.phaseT = 0; this.phaseDur = rand(...DIRECTOR.sustain); }
        break;
      case 'sustain':
        if (this.phaseT > this.phaseDur) { this.phase = 'fade'; this.phaseT = 0; }
        break;
      case 'fade': {
        const lull = !w.infected.some((z) => z.alive && (z.state === 'chase' || z.state === 'attack'));
        if (I < DIRECTOR.peakThreshold && lull) { this.phase = 'relax'; this.phaseT = 0; this.phaseDur = rand(...DIRECTOR.relax); this.relaxFlowStart = team; }
        break;
      }
      case 'relax':
        if (this.phaseT > this.phaseDur || team - this.relaxFlowStart > DIRECTOR.relaxFlow) { this.phase = 'build'; this.phaseT = 0; }
        break;
    }
  }

  get population() { return this.phase === 'build' || this.phase === 'sustain' ? 'full' : 'minimal'; }

  updateMobs(dt) {
    const w = this.world;
    this.mobTimer -= dt;
    this.mobRecharge = Math.min(1, this.mobRecharge + dt / 120);
    if (this.mobTimer <= 0 && this.phase === 'build' && !this.panic && this.mobsAllowed && !(this.tankAlive && !this.cfg.mobsWithTank)) {
      const mi = DIRECTOR.mobInterval[w.difficulty];
      this.mobTimer = rand(mi[0], mi[1]) * (this.cfg.mobIntervalScale || 1);
      const size = Math.round(DIRECTOR.mobSize[0] + (DIRECTOR.mobSize[1] - DIRECTOR.mobSize[0]) * this.mobRecharge);
      this.mobRecharge = 0;
      this.spawnMob(size, { reason: 'timer' });
    }
  }

  /** Spawn a mob of commons out of sight. opts: {near: Vector3, behind: bool, reason, music} */
  spawnMob(size, opts = {}) {
    const w = this.world;
    const alive = w.infected.filter((z) => z.alive && z.type === 'common').length;
    const cap = this.panic ? (this.panic.limit || 40) : this.commonLimit + 10;
    size = Math.min(size, Math.max(0, cap - alive + 10));
    if (size <= 0) return;
    const behind = opts.behind !== undefined ? opts.behind : Math.random() < DIRECTOR.mobBehindChance;
    const nodes = this.findSpawnNodes(Math.min(4, Math.ceil(size / 6)), { min: DIRECTOR.spawnMin, max: DIRECTOR.spawnMax, behind, near: opts.near, above: opts.above });
    if (!nodes.length) return;
    for (let i = 0; i < size; i++) this.pendingSpawns.push({ node: nodes[i % nodes.length], mob: true });
    this.stats.mobs++;
    if (opts.reason !== 'panic-wave' && opts.music !== false && size >= 8) w.events.emit('mob', size, opts.reason);
  }

  flushSpawns() {
    const w = this.world;
    let n = 0;
    while (this.pendingSpawns.length && n < 4) {
      const sp = this.pendingSpawns.shift();
      this.spawnCommon(sp.node, { mob: sp.mob, idle: sp.idle });
      n++;
    }
  }

  spawnCommon(node, opts = {}) {
    const w = this.world, nav = w.nav;
    const variant = Math.random() < this.hazmatChance ? 'hazmat' : this.variant;
    const z = new Common(w, { mob: opts.mob, variant, idle: opts.idle });
    // jitter within the cell
    const p = _v.set(nav.x[node] + (Math.random() - 0.5) * 0.3, nav.y[node], nav.z[node] + (Math.random() - 0.5) * 0.3);
    z.place(p, node);
    if (opts.mob) { z.target = w.pickTargetFor(z); }
    w.infected.push(z);
    return z;
  }

  /** Candidate spawn nodes: path-distance band from survivors, not visible, not in saferooms. */
  findSpawnNodes(count, o = {}) {
    const w = this.world, nav = w.nav;
    const out = [];
    const field = w.fieldAll;
    const team = this.teamProgress();
    const eyes = w.survivors.filter((s) => s.state !== 'dead').map((s) => s.eyePos(new THREE.Vector3()));
    if (!eyes.length) return out;
    const minD = o.min || DIRECTOR.spawnMin, maxD = o.max || DIRECTOR.spawnMax;
    // sample random nodes in the band (around a centre)
    const center = o.near || eyes[0];
    const tries = 260;
    const cands = [];
    for (let i = 0; i < tries && cands.length < count * 6; i++) {
      const a = Math.random() * Math.PI * 2, r = o.near ? rand(minD * 0.4, maxD * 0.7) : rand(minD, maxD);
      const n = nav.nearest(center.x + Math.cos(a) * r, center.y + rand(-4, 6) + (o.above ? 3 : 0), center.z + Math.sin(a) * r, 2);
      if (n < 0 || (nav.flags[n] & 1)) continue;
      const fd = field[n];
      if (fd === Infinity || fd < minD * 0.7 || fd > maxD * 1.3) continue;
      if (o.behind !== undefined && this.escape[n] < Infinity) {
        const prog = this.totalFlow - this.escape[n];
        if (o.behind && prog > team - 3) continue;
        if (!o.behind && prog < team + 3) continue;
      }
      // not visible to any survivor
      let visible = false;
      const head = _v2.set(nav.x[n], nav.y[n] + 1.4, nav.z[n]);
      for (const e of eyes) if (e.distanceToSquared(head) < 2500 && !w.collision.blocked(e, head, { dynamic: false })) { visible = true; break; }
      if (visible) continue;
      cands.push(n);
    }
    if (!cands.length && o.behind !== undefined) return this.findSpawnNodes(count, { ...o, behind: undefined });
    for (let i = 0; i < count && cands.length; i++) out.push(cands.splice((Math.random() * cands.length) | 0, 1)[0]);
    return out;
  }

  updateWanderers(dt, team) {
    const w = this.world;
    this.wanderT -= dt;
    if (this.wanderT > 0) return;
    this.wanderT = 1.5;
    if (!this.wanderersAllowed || this.panic) return;
    const relaxedOK = this.phase !== 'relax' || this.maxIntensity() < (w.difficulty === 'expert' ? 0.8 : w.difficulty === 'advanced' ? 0.5 : 0.3);
    if (!relaxedOK) return;
    const idle = w.infected.filter((z) => z.alive && z.type === 'common' && (z.state === 'idle' || z.state === 'wander')).length;
    const target = Math.round((this.cfg.wanderers || 14) * this.wanderDensity);
    if (idle >= target) return;
    // populate ahead, out of sight
    const nodes = this.findSpawnNodes(Math.min(3, target - idle), { min: 16, max: 42, behind: false });
    for (const n of nodes) {
      if (this.coveredAreas && this.coveredAreas.has(n)) continue;
      const k = 1 + ((Math.random() * 3) | 0);
      for (let i = 0; i < k; i++) this.pendingSpawns.push({ node: n, mob: false });
    }
  }

  updateSpecials(dt) {
    const w = this.world;
    if (!this.specialsAllowed || !this.specialTypes.length) return;
    if (w.time - this.startTime < this.firstSpecial) return;
    if (this.phase === 'relax' || this.phase === 'fade') return;
    if (this.tankAlive && !this.cfg.specialsWithTank) return;
    const alive = w.infected.filter((z) => z.alive && z.type !== 'common' && z.type !== 'tank' && z.type !== 'witch');
    if (alive.length >= this.maxSpecials) return;
    if (this.specialSlotsT.length && this.specialSlotsT[0] > w.time) return;
    if (this.specialSlotsT.length) this.specialSlotsT.shift();
    // pick a class not alive and off cooldown
    const types = this.specialTypes.filter((t) => !alive.some((z) => z.type === t) && (this.specialTimers[t] || 0) <= w.time);
    if (!types.length) return;
    const type = types[(Math.random() * types.length) | 0];
    this.spawnSpecial(type);
    this.specialSlotsT.push(w.time + rand(8, 20) * (this.cfg.specialRespawnScale || 1));
  }

  spawnSpecial(type, opts = {}) {
    const w = this.world;
    const ahead = type === 'boomer' || (type === 'charger' && Math.random() < 0.9) || Math.random() < 0.7;
    const nodes = opts.node !== undefined ? [opts.node] : this.findSpawnNodes(1, { min: type === 'tank' ? 20 : 250 * U * 1.5, max: type === 'tank' ? 40 : 30, behind: opts.behind !== undefined ? opts.behind : !ahead, above: type === 'smoker' || type === 'spitter', near: opts.near });
    if (!nodes.length) return null;
    const z = createSpecial(w, type, opts);
    const n = nodes[0];
    z.place(_v.set(w.nav.x[n], w.nav.y[n], w.nav.z[n]), n);
    w.infected.push(z);
    w.events.emit('specialSpawn', z);
    if (type === 'tank') this.tankAlive = z;
    return z;
  }

  updateBosses(team) {
    for (const b of this.bossSlots) {
      if (b.done || team < b.at) continue;
      b.done = true;
      if (b.type === 'tank') this.spawnSpecial('tank', { behind: false });
      else if (b.type === 'witch') this.spawnSpecial('witch', { behind: false, wander: this.cfg.wanderingWitch });
    }
  }

  // ------------------------------------------------------------ panic events
  /** opts: {waves (Infinity for endless), size [min,max], interval [min,max], limit, onEnd, specials: interval, behindChance, above} */
  startPanic(opts = {}) {
    this.panic = { wave: 0, waves: opts.waves !== undefined ? opts.waves : 3, size: opts.size || [20, 30], interval: opts.interval || [5, 7], t: opts.delay || 0, limit: opts.limit || 40, onEnd: opts.onEnd, specials: opts.specials || 0, specT: opts.specials || 0, behind: opts.behind, above: opts.above, initial: opts.initial || 0 };
    if (opts.initial) this.spawnMob(opts.initial, { reason: 'panic', behind: opts.behind, above: opts.above });
    this.world.events.emit('panicStart', opts);
  }
  stopPanic() {
    if (!this.panic) return;
    const p = this.panic; this.panic = null;
    if (p.onEnd) p.onEnd();
    this.world.events.emit('panicEnd');
  }
  updatePanic(dt) {
    const p = this.panic; if (!p) return;
    const w = this.world;
    p.t -= dt;
    if (p.specials) { p.specT -= dt; if (p.specT <= 0) { p.specT = p.specials; this.specialSlotsT = []; this.updateSpecials(0); } }
    if (p.t > 0) return;
    const aliveCommons = w.infected.filter((z) => z.alive && z.type === 'common').length;
    if (p.wave >= p.waves) {
      if (aliveCommons < 4) this.stopPanic();
      return;
    }
    if (aliveCommons > p.limit) { p.t = 1; return; }
    p.wave++;
    this.spawnMob(Math.round(rand(p.size[0], p.size[1])), { reason: 'panic-wave', behind: p.behind, above: p.above });
    p.t = rand(p.interval[0], p.interval[1]);
  }

  cullFar(dt) {
    const w = this.world;
    if (w.frame % 20) return;
    const eyes = w.survivors.filter((s) => s.state !== 'dead').map((s) => s.body.pos);
    for (const z of w.infected) {
      if (!z.alive || z.type === 'tank' || z.type === 'witch' || z.noCull) continue;
      let near = Infinity;
      for (const e of eyes) near = Math.min(near, e.distanceTo(z.position));
      if (near > DIRECTOR.discard) z.remove();
      else if (z.type !== 'common' && near > 50 && w.time - (z.spawnTime || 0) > 40 && !z.pinTarget) z.remove();
    }
  }
}
