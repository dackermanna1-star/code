// Waves, difficulty, spawning, rewards and the descent through Backrooms levels.

const WAVE_MODS = {
  blackout: { name: 'BLACKOUT', sub: 'The power is failing. Use the muzzle flashes.' },
  ambush: { name: 'AMBUSH', sub: 'They are already close.' },
  armored: { name: 'HEAVY ARMOR', sub: 'Plates and helmets. Aim for the gaps.' },
  snipers: { name: 'OVERWATCH', sub: 'Long lanes are not safe.' },
  fog: { name: 'THICK AIR', sub: 'Visibility is dropping.' },
  hunters: { name: 'HUNTERS', sub: 'Elite operators are tracking you.' },
};
const WAVES_PER_LEVEL = 3;

class Director {
  constructor(game, enemies) {
    this.game = game;
    this.enemies = enemies;
    this.state = 'idle';
    this.wave = 0;
    this.depth = 1;
    this.stateT = 0;
    this.queue = [];
    this.spawnT = 0;
    this.events = [];
    this.streak = { n: 0, t: -9 };
    this.cash = 0;
    this.score = 0;
    this.best = +(safeStorage('backrooms-best') || 0);
    this.stats = this.freshStats();
    game.stats = this.stats;
    game.hooks.push(this);
  }

  freshStats() {
    return { kills: 0, headshots: 0, shots: 0, hits: 0, damageTaken: 0, cashEarned: 0, longest: 0, waveDamage: 0, startT: performance.now() };
  }

  newRun() {
    const g = this.game;
    // spawns still in flight from the previous run settle against their own run (see spawnSome)
    this.runId = (this.runId || 0) + 1;
    this.pending = 0;
    this.reserved = [];
    this.queue = [];
    this.spec = null;
    this.wave = 0;
    // ?level=2 starts a run deeper down (1 lobby, 2 warehouse, 3 pipes, 4 office)
    const start = typeof location !== "undefined" ? +new URLSearchParams(location.search).get("level") : 0;
    this.depth = start >= 1 && start <= 40 ? Math.floor(start) : 1;
    this.cash = 400;
    this.score = 0;
    this.stats = this.freshStats();
    g.stats = this.stats;
    this.streak = { n: 0, t: -9 };
    this.mod = null;
    g.player.maxHealth = 100;
    g.player.health = 100;
    g.player.alive = true;
    g.armor = 0;
    g.maxArmor = 100;
    g.arsenal = new Arsenal();
    g.perks = { damage: 1, reload: 1, speed: 1, ammoFind: 1, regen: 0, waves: {} };
    g.buildLevel(this.depth, (Math.random() * 1e9) | 0);
    this.enemies.wave = 1;
    this.setState('intro');
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
    this.events.push({ type: 'state', state: s });
  }

  // ---- wave construction -------------------------------------------------------------------------
  waveSpec(n) {
    const boss = n % 5 === 0;
    const swarm = !boss && n >= 4 && n % 5 === 4;
    let count = Math.round(5 + n * 2.1 + Math.max(0, n - 8) * 1.1);
    const maxAlive = Math.min(9, 4 + Math.floor(n / 2.5));
    const kinds = [];
    if (swarm) {
      // a hollow wave is hollows and nothing else
      for (let k = 0; k < count + 6 + Math.ceil(n / 3); k++) kinds.push('hollow');
    } else {
      const roster = waveRoster(n);
      if (this.mod === 'snipers') roster.sniper = (roster.sniper || 0.4) * 4 + 1;
      if (this.mod === 'hunters') roster.elite = (roster.elite || 0) + 1.5 + n * 0.05;
      const total = Object.values(roster).reduce((a, b) => a + b, 0);
      for (let k = 0; k < count; k++) {
        let r = Math.random() * total;
        for (const [t, w] of Object.entries(roster)) { r -= w; if (r <= 0) { kinds.push(t); break; } }
      }
      if (boss) {
        kinds.length = Math.max(4, Math.round(count * 0.6));
        kinds.splice(Math.min(3, kinds.length), 0, 'juggernaut');
        if (n >= 15) kinds.splice(kinds.length - 2, 0, 'juggernaut');
      }
    }
    return { n, boss, swarm, kinds, maxAlive: swarm ? maxAlive + 3 : maxAlive };
  }

  difficulty(n) {
    // toughness and aim tighten gradually; damage barely moves so the game stays fair
    return {
      tough: 1 + Math.min(0.9, (n - 1) * 0.045) + (this.mod === 'armored' ? 0.35 : 0),
      speed: 1 + Math.min(0.25, (n - 1) * 0.015),
      spread: Math.max(0.62, 1.15 - (n - 1) * 0.03),
      react: Math.max(0.65, 1.15 - (n - 1) * 0.025),
      dmg: 1 + Math.min(0.35, (n - 1) * 0.02),
    };
  }

  startWave() {
    const g = this.game;
    this.wave++;
    this.mod = null;
    if (this.wave >= 3 && this.wave % 5 !== 0 && Math.random() < 0.55) this.mod = randPick(Object.keys(WAVE_MODS));
    const spec = (this.spec = this.waveSpec(this.wave));
    Object.assign(this.enemies.scale, this.difficulty(this.wave));
    this.enemies.wave = this.wave;
    this.queue = spec.kinds.slice();
    for (let i = this.queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]]; }
    // the boss comes in the middle of its wave
    const jug = this.queue.indexOf('juggernaut');
    if (jug >= 0) { this.queue.splice(jug, 1); this.queue.splice(Math.min(3, this.queue.length), 0, 'juggernaut'); }
    this.spawnT = 1.5;
    this.stats.waveDamage = 0;
    this.applyMod(true);
    this.setState('wave');
    this.events.push({ type: 'waveStart', wave: this.wave, spec, mod: this.mod });
    // preload character models for this wave
    for (const k of new Set(spec.kinds)) for (const look of ENEMY_TYPES[k].looks) Assets.gltf('characters/' + look);
    g.perks.waves = {};
  }

  applyMod(on) {
    const v = this.game.view;
    if (!v) return;
    v.blackout = false;
    v.dim = 1;
    v.scene.fog.density = v.level.theme.fogDensity + v.level.loop * 0.006;
    if (!on) return;
    if (this.mod === 'blackout') v.dim = 0.08;
    if (this.mod === 'fog') v.scene.fog.density *= 2.2;
  }

  remaining() {
    return this.queue.length + this.enemies.alive.length;
  }

  // ---- spawning ----------------------------------------------------------------------------------
  pickSpawn(squad) {
    const g = this.game, L = g.level, P = g.player;
    const dist = L.cellDistances(P.pos.x, P.pos.z);
    const ambush = this.mod === 'ambush';
    const minC = ambush ? 3 : 5, maxC = ambush ? 5 : 9;
    const eye = { x: P.pos.x, y: P.pos.y + 1.6, z: P.pos.z };
    // out of sight, not on top of anyone alive or about to arrive
    const hidden = (c) => {
      const ctr = L.cellCenter(c);
      if (L.visible(eye, { x: ctr.x, y: 1.4, z: ctr.z })) return false;
      if (this.enemies.alive.some((a) => Math.hypot(a.pos.x - ctr.x, a.pos.z - ctr.z) < 1.5)) return false;
      return !(this.reserved || []).some((r) => Math.hypot(r.x - ctr.x, r.z - ctr.z) < 2);
    };
    let lo = minC, hi = maxC;
    const cands = [];
    for (let c = 0; c < dist.length; c++) if (dist[c] >= lo && dist[c] <= hi && hidden(c)) cands.push(c);
    if (!cands.length) {
      lo = 3; hi = Infinity;
      for (let c = 0; c < dist.length; c++) if (dist[c] >= lo && dist[c] < Infinity) cands.push(c);
    }
    if (!cands.length) return [];
    const c0 = randPick(cands);
    const out = [];
    const n = L.n, i0 = c0 % n, j0 = (c0 / n) | 0;
    // the squad fills the chosen cell and open neighbours (never across a wall or the map edge)
    for (const [di, dj, dir] of [[0, 0, -1], [1, 0, 0], [-1, 0, 1], [0, 1, 2], [0, -1, 3]]) {
      if (out.length >= squad) break;
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      if (dir >= 0 && !L.wallOpen(i0, j0, dir)) continue;
      const c = j * n + i;
      if (c !== c0 && (dist[c] < Math.max(2, lo - 1) || dist[c] > hi + 1 || !hidden(c))) continue;
      const pt = L.pointInCell(c, 0.4);
      if (pt && out.every((q) => Math.hypot(q.x - pt.x, q.z - pt.z) > 1.1)) out.push(pt);
    }
    return out;
  }

  spawnSome() {
    const g = this.game, P = g.player;
    const spec = this.spec;
    const alive = this.enemies.alive.length + (this.pending || 0);
    const room = spec.maxAlive - alive;
    if (room <= 0 || !this.queue.length) return;
    const squad = Math.min(room, this.queue.length, this.queue[0] === 'juggernaut' ? 1 : 1 + Math.floor(Math.random() * 3));
    const spots = this.pickSpawn(squad);
    for (const pt of spots) {
      const type = this.queue.shift();
      if (!type) break;
      const yaw = Math.atan2(P.pos.x - pt.x, P.pos.z - pt.z);
      this.pending = (this.pending || 0) + 1;
      (this.reserved ||= []).push(pt);
      const run = this.runId;
      const settle = () => {
        if (run !== this.runId) return; // a newer run already reset the counters
        this.pending--;
        this.reserved = this.reserved.filter((r) => r !== pt);
      };
      this.enemies.spawn(type, pt, yaw).then((ai) => {
        settle();
        if (ai && ai.def.boss && run === this.runId) this.events.push({ type: 'boss', ai });
      }).catch(settle);
    }
  }

  // ---- scoring -----------------------------------------------------------------------------------
  onKill(e) {
    if (this.state === 'over') return; // the score was final at the moment of death
    const g = this.game, ai = e.ai, def = ai.def;
    if (!e.byPlayer) { this.events.push({ type: 'kill', name: def.name, byPlayer: false }); return; }
    const now = g.time;
    this.streak.n = now - this.streak.t < 4.5 ? this.streak.n + 1 : 1;
    this.streak.t = now;
    let mult = 1;
    const tags = [];
    if (e.head) { mult += 0.5; tags.push('HEADSHOT'); }
    if (e.dist > 20) { mult += 0.25; tags.push('LONG SHOT'); }
    if (e.grenade) { mult += 0.25; tags.push('FRAG'); }
    if (this.streak.n >= 2) { mult += Math.min(0.6, (this.streak.n - 1) * 0.12); tags.push(this.streak.n >= 5 ? 'RAMPAGE ×' + this.streak.n : 'STREAK ×' + this.streak.n); }
    if (g.player.health < 25) { mult += 0.2; tags.push('CLOSE CALL'); }
    const cash = Math.round(def.cash * mult * (1 + 0.04 * (this.wave - 1)) / 5) * 5;
    const pts = Math.round(def.score * mult * (1 + 0.1 * (this.wave - 1)));
    this.cash += cash;
    this.score += pts;
    const st = this.stats;
    st.kills++;
    if (e.head) st.headshots++;
    st.cashEarned += cash;
    st.longest = Math.max(st.longest, e.dist);
    this.events.push({ type: 'kill', name: def.name, byPlayer: true, cash, pts, tags, head: e.head, boss: def.boss });
  }

  earn(amount, why) {
    if (this.state === 'over') return;
    this.cash += amount;
    this.stats.cashEarned += amount;
    this.events.push({ type: 'cash', amount, why });
  }

  // ---- hooks ---------------------------------------------------------------------------------------
  onShot(paths, gun, hit) {
    this.stats.shots++;
    if (hit) this.stats.hits++;
  }
  onPlayerDamaged(dmg) { this.stats.waveDamage += dmg; }

  onPickup(d) {
    const g = this.game;
    // a dropped gun is stripped for ammunition
    let given = 0;
    for (const w of g.arsenal.slots) {
      if (!w) continue;
      const add = Math.round(w.magSize * (w === g.arsenal.gun ? 1 : 0.5) * g.perks.ammoFind);
      const before = w.reserve;
      w.reserve = Math.min(w.maxReserve, w.reserve + add);
      given += w.reserve - before;
    }
    if (Math.random() < 0.12 * g.perks.ammoFind && g.arsenal.grenades < g.arsenal.maxGrenades) { g.arsenal.grenades++; this.events.push({ type: 'toast', text: '+1 FRAG' }); }
    if (Math.random() < 0.07 * g.perks.ammoFind && g.arsenal.medkits < g.arsenal.maxMedkits) { g.arsenal.medkits++; this.events.push({ type: 'toast', text: '+1 MEDKIT' }); }
    this.earn(d.value, 'SCAVENGED');
    this.events.push({ type: 'pickup', ammo: given });
    g.audio.gunHandling('magIn', 'rifle');
  }

  step(dt) {
    const g = this.game;
    this.stateT += dt;
    for (const e of this.enemies.events) if (e.type === 'kill') this.onKill(e);
    this.enemies.events.length = 0;
    // regeneration after a few quiet seconds (slow, capped at 60% between waves)
    const P = g.player;
    if (P.alive && P.time - P.lastHurt > 6 && P.health < P.maxHealth * 0.6) P.heal((3 + g.perks.regen) * dt);
    switch (this.state) {
      case 'intro':
        if (this.stateT > 5) this.startWave();
        break;
      case 'wave':
        this.spawnT -= dt;
        if (this.spawnT <= 0) { this.spawnSome(); this.spawnT = this.mod === 'ambush' ? 1.2 : 2.2 + Math.random() * 1.5; }
        if (this.remaining() === 0 && !this.pending && this.stateT > 3) this.waveCleared();
        break;
      case 'cleared':
        if (this.stateT > 3.2) this.openIntermission();
        break;
      case 'intermission':
        if (this.stateT > this.intermissionTime) this.closeIntermission();
        break;
    }
    if (this.state !== 'over' && !P.alive) this.gameOver();
  }

  waveCleared() {
    const g = this.game;
    this.applyMod(false);
    const base = 150 + 60 * this.wave + (this.spec.boss ? 600 : 0);
    const clean = this.stats.waveDamage < 1 ? 250 : this.stats.waveDamage < 25 ? 100 : 0;
    this.earn(base, 'WAVE ' + this.wave + ' CLEARED');
    if (clean) this.earn(clean, clean > 200 ? 'UNTOUCHED' : 'CLEAN');
    this.score += 300 * this.wave;
    g.player.heal(20);
    this.setState('cleared');
    this.events.push({ type: 'waveCleared', wave: this.wave, bonus: base + clean, descend: this.wave % WAVES_PER_LEVEL === 0 });
  }

  openIntermission() {
    const g = this.game;
    // tidy the battlefield: corpses go, the level resets its lights
    if (this.wave % WAVES_PER_LEVEL === 0) {
      this.depth++;
      this.enemies.clear();
      g.buildLevel(this.depth, (Math.random() * 1e9) | 0);
      this.events.push({ type: 'descend', depth: this.depth, theme: g.level.theme });
    }
    this.intermissionTime = 60;
    this.setState('intermission');
  }

  closeIntermission() {
    if (this.state !== 'intermission') return;
    this.events.push({ type: 'intermissionEnd' });
    this.setState('countdown');
    setTimeout(() => { if (this.state === 'countdown') this.startWave(); }, 3000);
  }

  gameOver() {
    const g = this.game;
    this.setState('over');
    this.newBest = this.score > this.best && this.score > 0;
    if (this.newBest) { this.best = this.score; safeStorage('backrooms-best', String(this.best)); }
    this.events.push({ type: 'gameOver' });
    g.state = 'dead';
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
}

function safeStorage(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {}
  return null;
}
