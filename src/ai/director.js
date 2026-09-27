// AI Director: monitors survivor stress (damage, incaps, pins, nearby kills,
// health, ammo, time since last encounter, progress) and drives pacing through
// BUILD_UP -> SUSTAIN_PEAK -> PEAK_FADE -> RELAX. It populates wandering
// infected ahead of the team out of sight, times mobs (hordes) from multiple
// directions, spawns special infected as ambushes, places Witches and a Tank
// along the chapter's flow, runs scripted panic (crescendo / finale) waves and
// feeds the dynamic music system.
import * as THREE from 'three';
import { SPECIAL_CLASSES } from '../entities/specials.js';
import { clamp, randRange, pick, shuffle } from '../core/math.js';

const BUILD = 'build', SUSTAIN = 'sustain', FADE = 'fade', RELAX = 'relax';
const _v = new THREE.Vector3();

export class Director {
  constructor(game) {
    this.game = game;
    this.enabled = true;
    this.reset(null);
  }
  reset(level) {
    this.level = level;
    const d = (level && level.def.director) || {};
    this.cfg = Object.assign({
      wanderers: 22, // target idle population near the survivors
      mobInterval: [70, 120],
      mobSize: [14, 24],
      specials: ['hunter', 'smoker', 'boomer'],
      maxSpecials: 3,
      specialInterval: [22, 38],
      tank: 0.6, // chance of a Tank this chapter
      witches: 1,
      relax: [25, 45],
      outfit: 'civilian',
      noSpawnBoxes: [],
    }, d);
    this.state = RELAX;
    this.stateT = 0;
    this.relaxDur = 15;
    this.intensity = 0;
    this.survInt = new Map();
    this.calmT = 0;
    this.mobT = randRange(this.cfg.mobInterval[0], this.cfg.mobInterval[1]) * 0.6;
    this.specialT = randRange(15, 25);
    this.spawnQueue = []; // pending commons to spawn {node, opts}
    this.cand = [];
    this.candT = 0;
    this.wanderT = 0;
    this.panicState = null;
    this.leftSafe = false;
    this.tankProgress = null;
    this.tankSpawned = false;
    this.witchPlan = [];
    this.lastEncounter = 0;
    this.maxProgress = 0;
    this.lastProgress = 0;
    this.progressAtRelax = 0;
    this.finaleMode = false;
    this.blockMobs = false;
    this.blockSpecials = false;
    this.blockWanderers = false;
    this.nearStingT = 0;
    this.stats = { mobs: 0, specials: 0, tanks: 0 };
    if (!level) return;
    this.game.infected.outfit = this.cfg.outfit;
    if (Math.random() < this.cfg.tank && !d.noTank) this.tankProgress = d.tankAt ?? randRange(0.35, 0.8);
    // witches
    const nW = typeof this.cfg.witches === 'number' ? (Math.random() < this.cfg.witches % 1 ? Math.ceil(this.cfg.witches) : Math.floor(this.cfg.witches)) : 0;
    const spots = shuffle(level.witchSpots.slice());
    for (let i = 0; i < nW; i++) {
      if (spots[i]) this.witchPlan.push({ x: spots[i].x, y: spots[i].y, z: spots[i].z, spawned: false });
    }
  }

  // ---------------------------------------------------------- queries --
  teamHurt() {
    const S = this.game.survivors.filter((s) => !s.dead);
    if (!S.length) return 1;
    let h = 0;
    for (const s of S) h += 1 - Math.min(100, s.totalHealth + (s.inv.medkit ? 40 : 0)) / 100;
    return clamp(h / S.length, 0, 1);
  }
  teamProgress() {
    const g = this.game;
    let best = 0;
    for (const s of g.survivors) {
      if (s.dead) continue;
      const p = g.level.progressAt(s.pos.x, s.pos.y, s.pos.z);
      if (p > best) best = p;
    }
    return best;
  }
  addIntensity(s, v) {
    const cur = this.survInt.get(s) || 0;
    this.survInt.set(s, clamp(cur + v, 0, 100));
    this.lastEncounter = this.game.time;
  }

  // ---------------------------------------------------------- events --
  onSurvivorDamaged(s, amt, type) { this.addIntensity(s, amt * (type === 'claw' ? 1.2 : 2)); }
  onIncap(s) { this.addIntensity(s, 45); }
  onPinned(s) { this.addIntensity(s, 30); }
  onKill(c) {
    for (const s of this.game.survivors) if (!s.dead && s.pos.distanceTo(c.pos) < 5) this.addIntensity(s, 2.5);
  }
  onSpecialKilled(sp) {
    if (sp.kind === 'tank') { this.tankAlive = false; this.game.onTankKilled?.(sp); }
  }

  // ------------------------------------------------------- spawn points --
  refreshCandidates() {
    const g = this.game;
    const nav = g.level.nav;
    const f = nav.flow.cur;
    const out = this.cand;
    out.length = 0;
    const N = nav.N;
    // stride sampling keeps this cheap on big maps
    const stride = Math.max(1, Math.floor(N / 30000));
    const off = Math.floor(Math.random() * stride);
    for (let i = off; i < N; i += stride) {
      const d = f[i];
      if (d < 14 || d > 85) continue;
      if (this.inNoSpawn(nav.nodeX(i), nav.nodeY[i], nav.nodeZ(i))) continue;
      out.push(i);
    }
  }
  inNoSpawn(x, y, z) {
    const L = this.game.level;
    const test = (b) => b && x >= b[0] - 2 && x <= b[3] + 2 && z >= b[2] - 2 && z <= b[5] + 2 && y >= b[1] - 2 && y <= b[4] + 2;
    if (test(L.startSafe) || test(L.endSafe)) return true;
    for (const b of this.cfg.noSpawnBoxes) if (test(b)) return true;
    return false;
  }
  visibleToSurvivors(x, y, z) {
    const g = this.game;
    for (const s of g.survivors) {
      if (s.dead) continue;
      const dx = x - s.pos.x, dz = z - s.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 100) return true; // too close counts as visible
      if (d2 > 90 * 90) continue;
      if (g.level.col.lineOfSight(s.pos.x, s.pos.y + 1.6, s.pos.z, x, y + 1.4, z) || g.level.col.lineOfSight(s.pos.x, s.pos.y + 1.6, s.pos.z, x, y + 0.3, z)) return true;
    }
    return false;
  }
  // where: 'ahead' | 'behind' | 'any' ; returns node or -1
  findSpawnNode(minD, maxD, where = 'any', opts = {}) {
    const g = this.game;
    const nav = g.level.nav;
    const f = nav.flow.cur;
    const toExit = nav.fields.toExit;
    const teamExit = this.teamToExit();
    const list = this.cand;
    if (!list.length) return -1;
    for (let tries = 0; tries < 60; tries++) {
      const n = list[Math.floor(Math.random() * list.length)];
      const d = f[n];
      if (d < minD || d > maxD) continue;
      if (toExit && teamExit < 1e8 && where !== 'any') {
        const ahead = toExit[n] < teamExit - 5;
        if (where === 'ahead' && !ahead) continue;
        if (where === 'behind' && ahead) continue;
      }
      const x = nav.nodeX(n), y = nav.nodeY[n], z = nav.nodeZ(n);
      if (opts.high && y < this.teamY() + 1.5 && Math.random() < 0.7) continue;
      if (this.visibleToSurvivors(x, y, z)) continue;
      return n;
    }
    return -1;
  }
  teamToExit() {
    const g = this.game;
    const nav = g.level.nav;
    const f = nav.fields.toExit;
    if (!f) return 1e9;
    let best = 1e9;
    for (const s of g.survivors) {
      if (s.dead) continue;
      const n = nav.nearestNode(s.pos.x, s.pos.y, s.pos.z, 2);
      if (n >= 0 && f[n] < best) best = f[n];
    }
    return best;
  }
  teamY() {
    let y = 0, n = 0;
    for (const s of this.game.survivors) if (!s.dead) { y += s.pos.y; n++; }
    return n ? y / n : 0;
  }

  // ---------------------------------------------------------- spawners --
  queueCommons(node, count, opts = {}) {
    const nav = this.game.level.nav;
    for (let i = 0; i < count; i++) this.spawnQueue.push({ node, opts, jitter: i });
  }
  processQueue(dt) {
    const g = this.game;
    const nav = g.level.nav;
    let budget = Math.ceil(dt * 40); // commons per second spawn rate
    while (budget-- > 0 && this.spawnQueue.length) {
      const q = this.spawnQueue.shift();
      // jitter around node using neighbours
      let n = q.node;
      for (let k = 0; k < (q.jitter % 5); k++) {
        const d = Math.floor(Math.random() * 8);
        const v = nav.links[n * 8 + d];
        if (v >= 0 && nav.ltype[n * 8 + d] === 0) n = v;
      }
      const c = g.infected.spawnCommon(nav.nodeX(n) + (Math.random() - 0.5) * 0.3, nav.nodeY[n], nav.nodeZ(n) + (Math.random() - 0.5) * 0.3, q.opts);
      if (c && q.opts.target) { c.target = q.opts.target; }
    }
  }
  spawnMob(size, opts = {}) {
    const g = this.game;
    if (!this.cand.length) this.refreshCandidates();
    size = Math.round(size * g.difficulty.hordeMul);
    // split into 1-3 groups from different directions
    const groups = size > 16 ? (Math.random() < 0.5 ? 2 : 3) : Math.random() < 0.4 ? 2 : 1;
    let spawned = 0;
    const dirs = ['behind', 'ahead', 'any'];
    for (let gi = 0; gi < groups; gi++) {
      const n = opts.nodes ? pick(opts.nodes) : this.findSpawnNode(opts.minD ?? 22, opts.maxD ?? 55, opts.where ?? dirs[gi % 3]);
      if (n < 0) continue;
      const cnt = gi === groups - 1 ? size - spawned : Math.round(size / groups);
      this.queueCommons(n, cnt, { chase: true, horde: true, target: opts.target });
      spawned += cnt;
      if (gi === 0) {
        const nav = g.level.nav;
        g.audio.play('hordeScream', { pos: _v.set(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n)), vol: 1.2 });
      }
    }
    if (spawned > 0) {
      this.stats.mobs++;
      if (!opts.silent) g.audio.music.stinger('hordeIncoming');
      g.onMob?.(opts);
      this.mobActiveT = 25;
    }
    return spawned;
  }
  spawnSpecial(kind, opts = {}) {
    const g = this.game;
    if (!this.cand.length) this.refreshCandidates();
    const nav = g.level.nav;
    const n = opts.node ?? this.findSpawnNode(kind === 'tank' ? 25 : 18, kind === 'smoker' ? 50 : 45, opts.where ?? (Math.random() < 0.65 ? 'ahead' : 'any'), { high: kind === 'smoker' });
    if (n < 0) return null;
    const C = SPECIAL_CLASSES[kind];
    const sp = new C(g.infected);
    sp.spawnAt(nav.nodeX(n), nav.nodeY[n], nav.nodeZ(n));
    g.infected.specials.push(sp);
    this.stats.specials++;
    if (kind === 'tank') { this.tankAlive = true; this.stats.tanks++; g.audio.music.stinger('tank'); g.onTankSpawn?.(sp); }
    g.onSpecialSpawn?.(sp);
    return sp;
  }
  spawnWitchAt(x, y, z) {
    const g = this.game;
    const sp = new SPECIAL_CLASSES.witch(g.infected);
    sp.spawnAt(x, y, z);
    sp.yaw = Math.random() * 6.28;
    g.infected.specials.push(sp);
    return sp;
  }
  specialCount(excludeTankWitch = true) {
    let n = 0;
    for (const s of this.game.infected.specials) if (!s.dead && !s.removed && (!excludeTankWitch || (s.kind !== 'tank' && s.kind !== 'witch'))) n++;
    return n;
  }
  bileMob(s) {
    this.spawnMob(randRange(14, 22), { target: s, where: 'any', minD: 15, maxD: 45 });
    // existing commons nearby go for the biled survivor
    for (const c of this.game.infected.commons) if (c.pos.distanceTo(s.pos) < 40) { c.target = s; if (c.state === 0) c.alert(0.2, s); }
  }

  // ------------------------------------------------------ panic events --
  // opts: {waves, size:[a,b], interval, endless, nodes:[], onEnd, tanks:[waveIdx], where}
  panic(name, opts = {}) {
    if (this.panicState && !opts.force) {
      if (name === 'carAlarm') this.spawnMob(randRange(18, 26), { where: 'any' });
      return;
    }
    this.panicState = Object.assign({ name, wave: 0, waves: 3, size: [20, 28], interval: 18, t: 2, endless: false }, opts);
    this.game.audio.music.stinger('hordeIncoming');
    this.game.onPanicStart?.(name);
  }
  stopPanic() {
    const p = this.panicState;
    this.panicState = null;
    if (p && p.onEnd) p.onEnd();
  }
  updatePanic(dt) {
    const p = this.panicState;
    if (!p) return;
    p.t -= dt;
    if (p.t <= 0) {
      const waveDone = p.waves && p.wave >= p.waves && !p.endless;
      if (waveDone) {
        // wait until most infected are dead then end
        if (this.game.infected.commons.filter((c) => c.horde).length < 6) this.stopPanic();
        else p.t = 2;
        return;
      }
      const size = randRange(p.size[0], p.size[1]);
      this.spawnMob(size, { nodes: p.nodes, where: p.where ?? 'any', minD: p.minD ?? 18, maxD: p.maxD ?? 50, silent: p.wave > 0 && !p.stingEvery });
      if (p.tanks && p.tanks.includes(p.wave)) this.spawnSpecial('tank', { where: 'any' });
      p.wave++;
      p.t = p.interval * randRange(0.85, 1.15);
      p.onWave?.(p.wave);
    }
  }

  // ------------------------------------------------------------ update --
  update(dt) {
    const g = this.game;
    if (!this.enabled || !g.level || !g.level.nav) return;
    // intensity decay
    let I = 0;
    const calm = g.time - this.lastEncounter > 5;
    for (const s of g.survivors) {
      let v = this.survInt.get(s) || 0;
      if (s.pinned) v = Math.min(100, v + dt * 10);
      if (calm) v = Math.max(0, v - dt * 6);
      this.survInt.set(s, v);
      if (!s.dead) I = Math.max(I, v);
    }
    this.intensity = I;
    this.mobActiveT = Math.max(0, (this.mobActiveT || 0) - dt);
    // candidates
    this.candT -= dt;
    if (this.candT <= 0) { this.candT = 1.5; this.refreshCandidates(); }
    this.processQueue(dt);
    this.updatePanic(dt);
    // left the start safe room?
    if (!this.leftSafe) {
      const L = g.level;
      const inSafe = L.startSafe && g.survivors.some((s) => !s.dead && L.inBox(L.startSafe, s.pos, 0.2));
      const allOut = !L.startSafe || g.survivors.every((s) => s.dead || !L.inBox(L.startSafe, s.pos, 0.3));
      if (allOut || (!inSafe) || g.time > 180) { this.leftSafe = true; this.stateT = 0; g.onLeftSafeRoom?.(); }
    }
    const progress = this.teamProgress();
    this.maxProgress = Math.max(this.maxProgress, progress);

    // tempo
    this.stateT += dt;
    switch (this.state) {
      case BUILD: if (I >= 72) { this.state = SUSTAIN; this.stateT = 0; } break;
      case SUSTAIN: if (this.stateT > 4) { this.state = FADE; this.stateT = 0; } break;
      case FADE: if (I < 22 && g.infected.commons.filter((c) => c.state >= 2).length < 4) { this.state = RELAX; this.stateT = 0; this.relaxDur = randRange(this.cfg.relax[0], this.cfg.relax[1]) * (1 + this.teamHurt() * 0.6); this.progressAtRelax = progress; } break;
      case RELAX: if (this.stateT > this.relaxDur || progress - this.progressAtRelax > 0.22) { this.state = BUILD; this.stateT = 0; } break;
    }
    if (!this.leftSafe && !this.finaleMode) { this.updateMusic(dt); return; }

    // wanderers (populate ahead, out of sight)
    this.wanderT -= dt;
    if (this.wanderT <= 0 && !this.blockWanderers) {
      this.wanderT = 0.6;
      const target = Math.round(this.cfg.wanderers * (this.state === RELAX ? 0.7 : 1) * (1 - this.teamHurt() * 0.3));
      const idle = g.infected.commons.filter((c) => c.state === 0).length;
      if (idle < target && g.infected.commons.length < g.quality.maxCommons - 20) {
        const n = this.findSpawnNode(20, 70, Math.random() < 0.75 ? 'ahead' : 'any');
        if (n >= 0) {
          const k = Math.random() < 0.3 ? 3 : Math.random() < 0.5 ? 2 : 1;
          this.queueCommons(n, k, {});
        }
      }
      // recycle stragglers far away
      if (g.infected.commons.length > g.quality.maxCommons * 0.7) g.infected.cullFar(75);
    }

    // mobs
    if (!this.blockMobs && !this.panicState && !this.tankAlive) {
      if (this.state === BUILD || this.state === SUSTAIN) this.mobT -= dt;
      else this.mobT -= dt * 0.25;
      if (this.mobT <= 0) {
        this.mobT = randRange(this.cfg.mobInterval[0], this.cfg.mobInterval[1]) * (1 + this.teamHurt() * 0.5);
        if (this.state !== RELAX && this.state !== FADE) this.spawnMob(randRange(this.cfg.mobSize[0], this.cfg.mobSize[1]));
      }
    }
    // specials
    if (!this.blockSpecials && (this.state === BUILD || this.state === SUSTAIN || this.panicState || this.finaleMode)) {
      this.specialT -= dt * g.difficulty.specialMul;
      const maxS = this.finaleMode ? this.cfg.maxSpecials + 1 : this.cfg.maxSpecials;
      if (this.specialT <= 0 && this.specialCount() < maxS && !this.tankAlive) {
        this.specialT = randRange(this.cfg.specialInterval[0], this.cfg.specialInterval[1]) * (1 + this.teamHurt() * 0.4);
        const alive = new Set(g.infected.specials.filter((s) => !s.dead).map((s) => s.kind));
        const opts = this.cfg.specials.filter((k) => !alive.has(k));
        if (opts.length) this.spawnSpecial(pick(opts));
      }
    }
    // tank along the flow
    if (this.tankProgress != null && !this.tankSpawned && progress >= this.tankProgress && !this.panicState) {
      if (this.spawnSpecial('tank', { where: Math.random() < 0.5 ? 'ahead' : 'any' })) this.tankSpawned = true;
    }
    // witches: spawn lazily when survivors get within 80m
    for (const w of this.witchPlan) {
      if (w.spawned) continue;
      for (const s of g.survivors) {
        if (!s.dead && Math.hypot(s.pos.x - w.x, s.pos.z - w.z) < 80) { w.spawned = true; this.spawnWitchAt(w.x, w.y, w.z); break; }
      }
    }
    this.updateMusic(dt);
  }

  updateMusic(dt) {
    const g = this.game;
    const m = g.audio.music;
    const sp = g.infected.specials;
    const tank = sp.find((s) => s.kind === 'tank' && !s.dead);
    const witch = sp.find((s) => s.kind === 'witch' && !s.dead && !s.removed && g.player && s.pos.distanceTo(g.player.pos) < 28);
    const chasing = g.infected.commons.filter((c) => c.state >= 2).length;
    let st;
    if (this.finaleMode && !tank) st = 'finale';
    else if (tank) st = 'tank';
    else if (this.panicState || this.mobActiveT > 0) st = 'horde';
    else if (witch) st = 'witch';
    else if (chasing > 6 || this.intensity > 50) st = 'combat';
    else if (this.state === BUILD) st = 'tension';
    else st = 'calm';
    if (st !== this.musicState) { this.musicState = st; m.setState(st); }
    m.setIntensity(this.intensity / 100);
    // special proximity stingers
    this.nearStingT -= dt;
    if (this.nearStingT <= 0 && g.player) {
      for (const s of sp) {
        if (s.dead || s.stung || s.kind === 'tank' || s.kind === 'witch') continue;
        if (s.pos.distanceTo(g.player.pos) < 30) {
          s.stung = true;
          m.stinger(s.kind + 'Near');
          this.nearStingT = 6;
          g.onSpecialNear?.(s);
          break;
        }
      }
    }
  }
}
