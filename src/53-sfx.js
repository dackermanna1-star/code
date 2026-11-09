// Atmosphere and extra sounds on top of the engine's procedural audio: fluorescent hum, room tone,
// distant activity, a dynamic combat score, supersonic cracks, explosions and radio chatter.
class Sfx {
  constructor(game) {
    this.game = game;
    this.au = game.audio;
    this.ready = false;
    this.intensity = 0;
    this.musicLevel = 0;
    this.distantT = 8;
    this.beat = 0;
    this.ringT = 0;
    game.hooks.push(this);
  }

  init() {
    const au = this.au;
    if (this.ready || !au.ctx || !au.bus) return;
    const ctx = (this.ctx = au.ctx);
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(au.bus);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(au.bus);
    // a long noise buffer reused by everything
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = this.brown.getChannelData(0);
    for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = b * 3.5; }
    this.buildHum();
    this.buildRoom();
    this.buildWater();
    this.buildMusic();
    this.ready = true;
  }

  // still water lapping at tile (levels whose theme has `water`): a slow wash of band-passed
  // noise, its level wandering; drips are scheduled in frame()
  buildWater() {
    const ctx = this.ctx;
    this.lap = ctx.createGain();
    this.lap.gain.value = 0;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
    this.loopSrc(this.brown, 1.6).connect(bp);
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.17; lg.gain.value = 0.35;
    lfo.connect(lg); lg.connect(am.gain); lfo.start();
    bp.connect(am); am.connect(this.lap); this.lap.connect(this.out);
    if (this.au.verbIn) { const s = ctx.createGain(); s.gain.value = 0.6; this.lap.connect(s); s.connect(this.au.verbIn); }
    this.dripT = 2;
  }

  // a drop falling into a pool somewhere in the room, or a footstep / round in the water
  drip(pos, a = 1) {
    const ctx = this.ctx, t = ctx.currentTime, dst = pos ? this.spatial(pos) : this.out;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = 900 + Math.random() * 900;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.4, t + 0.05);
    o.connect(g); g.connect(dst);
    if (this.au.verbIn) { const s = ctx.createGain(); s.gain.value = 0.8; g.connect(s); s.connect(this.au.verbIn); }
    this.env(g, t, 0.002, 0.05 * a, 0.06);
    o.start(t); o.stop(t + 0.1);
  }

  splash(pos, a = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, dst = pos ? this.spatial(pos) : this.out;
    const s = ctx.createBufferSource(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
    s.buffer = this.noise; bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(2600, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    s.connect(bp); bp.connect(g); g.connect(dst);
    this.env(g, t, 0.004, 0.22 * clamp(a, 0.1, 1), 0.16);
    s.start(t, Math.random() * 2); s.stop(t + 0.25);
    if (Math.random() < 0.6) this.drip(pos, 0.6 * a);
  }

  loopSrc(buf, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.start();
    return s;
  }

  buildHum() {
    const ctx = this.ctx;
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    this.hum.connect(this.out);
    // mains hum: 120 Hz with odd harmonics, through a resonant band like a ballast
    for (const [f, a] of [[120, 0.5], [240, 0.22], [360, 0.12], [600, 0.05]]) {
      const o = ctx.createOscillator();
      o.type = f === 120 ? 'sawtooth' : 'sine';
      o.frequency.value = f + (Math.random() - 0.5) * 0.4;
      const g = ctx.createGain();
      g.gain.value = a * 0.12;
      o.connect(g); g.connect(this.hum);
      o.start();
    }
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.value = 0.012;
    this.loopSrc(this.noise).connect(bp);
    bp.connect(ng); ng.connect(this.hum);
    // crackle for failing tubes
    this.crackle = ctx.createGain();
    this.crackle.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2000;
    this.loopSrc(this.noise, 0.7).connect(hp);
    hp.connect(this.crackle);
    this.crackle.connect(this.out);
  }

  buildRoom() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260;
    this.room = ctx.createGain();
    this.room.gain.value = 0.05;
    this.loopSrc(this.brown).connect(lp);
    lp.connect(this.room); this.room.connect(this.out);
  }

  // ---- music: drone + pulse + percussion, layered by combat intensity ----------------------------
  buildMusic() {
    const ctx = this.ctx;
    this.drone = ctx.createGain(); this.drone.gain.value = 0.0; this.drone.connect(this.music);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 2;
    lp.connect(this.drone);
    this.droneLP = lp;
    for (const f of [41.2, 41.5, 61.7, 82.4, 82.9]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.05;
      o.connect(g); g.connect(lp); o.start();
    }
    this.pulse = ctx.createGain(); this.pulse.gain.value = 0; this.pulse.connect(this.music);
    this.perc = ctx.createGain(); this.perc.gain.value = 0; this.perc.connect(this.music);
    this.next = ctx.currentTime + 0.1;
    this.step16 = 0;
    this.scheduler = setInterval(() => this.schedule(), 30);
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const bpm = 96 + 34 * this.musicLevel;
    const s16 = 60 / bpm / 4;
    while (this.next < ctx.currentTime + 0.12) {
      const st = this.step16 % 16, t = this.next;
      const lvl = this.musicLevel;
      if (lvl > 0.25) {
        // bass pulse on eighths, minor figure
        if (st % 2 === 0) this.bass(t, [41.2, 41.2, 49, 41.2, 55, 41.2, 49, 36.7][(this.step16 >> 1) % 8], s16 * 1.6);
      }
      if (lvl > 0.5) {
        if (st === 0 || st === 8 || (st === 10 && lvl > 0.75)) this.kick(t);
        if (st % 4 === 2) this.hat(t, 0.5);
        if (lvl > 0.75 && st % 2 === 1) this.hat(t, 0.25);
        if (st === 4 || st === 12) this.snare(t);
      }
      this.next += s16;
      this.step16++;
    }
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  bass(t, f, dur) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.pulse);
    this.env(g, t, 0.005, 0.32, dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(g); g.connect(this.perc);
    this.env(g, t, 0.002, 0.9, 0.22);
    o.start(t); o.stop(t + 0.3);
  }
  hat(t, a) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    s.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 7000;
    s.connect(hp); hp.connect(g); g.connect(this.perc);
    this.env(g, t, 0.001, 0.12 * a, 0.04);
    s.start(t, Math.random() * 2); s.stop(t + 0.06);
  }
  snare(t) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
    s.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    s.connect(bp); bp.connect(g); g.connect(this.perc);
    this.env(g, t, 0.001, 0.35, 0.14);
    s.start(t, Math.random() * 2); s.stop(t + 0.2);
  }

  // ---- one-shots -----------------------------------------------------------------------------------
  spatial(pos) {
    const sp = this.au._spatial(pos);
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = sp.gain;
    let node = g;
    if (sp.lowpass) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = sp.lowpass; g.connect(lp); node = lp; }
    if (this.au._hasPan) { const p = ctx.createStereoPanner(); p.pan.value = sp.pan; node.connect(p); node = p; }
    node.connect(this.out);
    if (this.au.verbIn) { const s = ctx.createGain(); s.gain.value = 0.25 * sp.verb; g.connect(s); s.connect(this.au.verbIn); }
    return g;
  }

  crack(pos, amount = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dst = this.spatial(pos);
    const s = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    s.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 2400;
    s.connect(hp); hp.connect(g); g.connect(dst);
    this.env(g, t, 0.0008, 0.5 * clamp(amount, 0.2, 1), 0.05);
    s.start(t, Math.random() * 2); s.stop(t + 0.08);
    // the whizz that follows
    const w = ctx.createBufferSource(), wg = ctx.createGain(), bp = ctx.createBiquadFilter();
    w.buffer = this.noise; bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(5200, t); bp.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
    w.connect(bp); bp.connect(wg); wg.connect(dst);
    this.env(wg, t + 0.01, 0.02, 0.18 * amount, 0.16);
    w.start(t, Math.random() * 2); w.stop(t + 0.25);
  }

  explosion(pos, dist = 10) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dst = this.spatial(pos);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    o.connect(og); og.connect(dst);
    this.env(og, t, 0.004, 1.4, 1.1);
    o.start(t); o.stop(t + 1.3);
    const s = ctx.createBufferSource(), sg = ctx.createGain(), lp = ctx.createBiquadFilter();
    s.buffer = this.noise; lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    s.connect(lp); lp.connect(sg); sg.connect(dst);
    this.env(sg, t, 0.002, 1.6, 1.4);
    s.start(t); s.stop(t + 1.6);
    // debris rattle
    for (let k = 0; k < 6; k++) setTimeout(() => this.au.impact(Math.random() < 0.5 ? 'metal' : 'wood', 0.3 + Math.random() * 0.3, pos), 150 + Math.random() * 900);
    if (dist < 7) this.ring(clamp(1 - dist / 7, 0.2, 1));
  }

  ring(a) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 3600 + Math.random() * 400;
    o.connect(g); g.connect(this.au.master || this.out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * a, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5 + 2 * a);
    o.start(t); o.stop(t + 5);
    this.ringT = 2.5 * a;
  }

  radio(pos) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dst = this.spatial(pos);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.6;
    const g = ctx.createGain();
    bp.connect(g); g.connect(dst);
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    s.connect(bp);
    // squelch, a garbled burst of "speech", squelch
    const dur = 0.5 + Math.random() * 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.06);
    for (let k = 0.08; k < dur; k += 0.06 + Math.random() * 0.05) g.gain.setValueAtTime(0.04 + Math.random() * 0.09, t + k);
    g.gain.setValueAtTime(0.22, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    const am = ctx.createOscillator(), amg = ctx.createGain();
    am.frequency.value = 6 + Math.random() * 5; amg.gain.value = 600;
    am.connect(amg); amg.connect(bp.frequency); am.start(t); am.stop(t + dur + 0.1);
    s.start(t, Math.random() * 2); s.stop(t + dur + 0.1);
  }

  distant() {
    // something happens somewhere else in the Backrooms
    const g = this.game, P = g.player.pos;
    const a = Math.random() * TAU, d = 30 + Math.random() * 30;
    const pos = new I(P.x + Math.cos(a) * d, 1.4, P.z + Math.sin(a) * d);
    const r = Math.random();
    if (r < 0.45) {
      const n = 1 + Math.floor(Math.random() * 5), type = randPick(['pistol', 'rifle', 'smg', 'shotgun']);
      for (let k = 0; k < n; k++) setTimeout(() => this.au.gunshot(type, pos), k * (type === 'smg' ? 90 : 160 + Math.random() * 300));
    } else if (r < 0.7) this.au.impact('metal', 0.5, pos);
    else if (r < 0.85) for (let k = 0; k < 4; k++) setTimeout(() => this.au.footstep(0.7, pos), k * 380);
    else this.au.bodyFall(0.8, pos);
  }

  // ---- per frame -------------------------------------------------------------------------------
  frame(dt) {
    if (!this.ready) { if (this.au.ctx && this.au.ready) this.init(); return; }
    const g = this.game, t = this.ctx.currentTime, P = g.player;
    const view = g.view;
    // hum follows the light around the player, crackles near failing tubes
    let flick = 0;
    if (view) {
      const L = view.level, n = L.n;
      const c = L.cellOf(P.pos.x, P.pos.z);
      if (c >= 0) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = (c % n) + di, j = ((c / n) | 0) + dj;
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const f = L.fixtures[j * n + i];
        if (f.state === 'flicker' || f.state === 'dying') flick = Math.max(flick, f.level < 0.5 ? 1 : 0.2);
      }
      const light = view.lightAt(P.pos.x, 2, P.pos.z);
      this.hum.gain.setTargetAtTime(0.18 * clamp(light, 0, 1.2) * (L.theme.hum ?? 1), t, 0.15);
      this.crackle.gain.setTargetAtTime(flick * 0.05 * Math.random(), t, 0.01);
      // water lapping and dripping somewhere near (themes with water)
      const wa = L.theme.water || 0;
      this.lap.gain.setTargetAtTime(0.06 * wa, t, 0.5);
      if (wa && (this.dripT -= dt) <= 0) {
        this.dripT = 0.4 + Math.random() * 2.6;
        const a = Math.random() * TAU, r = 3 + Math.random() * 12;
        this.drip(new I(P.pos.x + Math.cos(a) * r, 0.1, P.pos.z + Math.sin(a) * r), 0.5 + Math.random() * 0.5);
      }
    }
    // music intensity from the fight
    const enemies = g.enemies ? g.enemies.alive : [];
    const engaged = enemies.filter((a) => a.visible).length;
    const recentFire = g.time - (g.lastShotT || -9) < 3 || (g.suppression || 0) > 0.1;
    const d = g.director;
    let target = 0.12;
    if (d && d.state === 'wave') target = clamp(0.3 + engaged * 0.15 + (recentFire ? 0.25 : 0) + (d.spec && d.spec.boss ? 0.2 : 0), 0, 1);
    if (d && (d.state === 'intermission' || d.state === 'cleared')) target = 0.05;
    if (!P.alive) target = 0;
    this.musicLevel = damp(this.musicLevel, target, target > this.musicLevel ? 1.5 : 0.4, dt);
    const m = g.settings.music;
    this.music.gain.setTargetAtTime(m * 0.55, t, 0.3);
    this.drone.gain.setTargetAtTime(0.35 + 0.4 * this.musicLevel, t, 0.5);
    this.droneLP.frequency.setTargetAtTime(240 + 900 * this.musicLevel, t, 0.5);
    this.pulse.gain.setTargetAtTime(this.musicLevel > 0.25 ? 0.7 : 0, t, 0.6);
    this.perc.gain.setTargetAtTime(this.musicLevel > 0.5 ? 0.6 : 0, t, 0.6);
    // heartbeat when badly hurt
    const hb = P.alive && P.health < 35 ? 70 + (35 - P.health) * 2 : 0;
    // the beat quickens as health keeps falling
    if ((hb > 0) !== (this.hb > 0) || Math.abs(hb - (this.hbSet || 0)) > 4) { this.au.heartbeat(hb); this.hbSet = hb; }
    this.hb = hb;
    // distant events between fights and during them
    this.distantT -= dt;
    if (this.distantT <= 0) { this.distantT = 14 + Math.random() * 26; if (P.alive && g.state === 'play') this.distant(); }
  }

  // enemy footsteps (positional). Hook steps run before the sandbox step, so each step sees the
  // previous step's controller events exactly once (none replay while paused).
  step() {
    const g = this.game, P = g.player;
    if (g.sb) for (const p of g.sb.people) for (const e of p.ctl.events) if (e.type === 'land') {
      const h = p.rd.pelvis.pos;
      if (Math.hypot(h.x - P.pos.x, h.z - P.pos.z) < 16) {
        this.au.footstep(p.enemy && p.enemy.def && p.enemy.def.boss ? 0.95 : 0.5, h);
        if (g.level && g.level.wetAt(h.x, h.z)) this.splash(h, 0.6); // wading (Level 37)
      }
    }
  }
}
