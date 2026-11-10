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
    this.loadBank();
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

  // a round glancing off a hard surface: a sharp tick, then the whine of the tumbling bullet
  // falling in pitch as it leaves
  ricochet(pos, amount = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dst = this.spatial(pos);
    const s = ctx.createBufferSource(), sg = ctx.createGain(), hp = ctx.createBiquadFilter();
    s.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 3000;
    s.connect(hp); hp.connect(sg); sg.connect(dst);
    this.env(sg, t, 0.0005, 0.35 * amount, 0.03);
    s.start(t, Math.random() * 2); s.stop(t + 0.06);
    const dur = 0.35 + Math.random() * 0.4, f0 = 2600 + Math.random() * 1600, f1 = f0 * (0.38 + Math.random() * 0.2);
    const o = ctx.createOscillator(), og = ctx.createGain(), bp = ctx.createBiquadFilter();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t + 0.01);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    // the tumble warbles the pitch
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 18 + Math.random() * 25; lg.gain.value = f0 * 0.025;
    lfo.connect(lg); lg.connect(o.frequency);
    bp.type = 'bandpass'; bp.frequency.value = f0 * 0.8; bp.Q.value = 0.7;
    o.connect(bp); bp.connect(og); og.connect(dst);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.13 * clamp(amount, 0.3, 1), t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
  }

  // what trickles down after a hit: gypsum and grit pattering, wood splinters ticking
  debris(pos, kind, amount = 1) {
    if (!this.ready || Math.random() > 0.75) return;
    // one trickle at a time is enough under automatic fire, and nothing from far away
    const ctx = this.ctx, t0 = ctx.currentTime + 0.03;
    if (t0 < (this.debrisT || 0)) return;
    const L = this.game.camera.position;
    if (Math.abs(pos.x - L.x) + Math.abs(pos.z - L.z) > 18) return;
    this.debrisT = t0 + 0.09;
    const dst = this.spatial(pos);
    const n = 3 + Math.round(Math.random() * 4 * amount);
    const f = kind === 'wood' ? 2400 : kind === 'concrete' ? 3600 : 3000;
    for (let k = 0; k < n; k++) {
      const t = t0 + Math.random() * 0.28 * (1 + amount * 0.5);
      const s = ctx.createBufferSource(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
      s.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = f * (0.7 + Math.random() * 0.7); bp.Q.value = 2.5;
      s.connect(bp); bp.connect(g); g.connect(dst);
      this.env(g, t, 0.0008, (0.05 + Math.random() * 0.07) * clamp(amount, 0.3, 1.2), 0.012 + Math.random() * 0.02);
      s.start(t, Math.random() * 2); s.stop(t + 0.06);
    }
    // a soft hiss of powder for drywall and concrete
    if (kind !== 'wood') {
      const s = ctx.createBufferSource(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      s.buffer = this.brown; lp.type = 'lowpass'; lp.frequency.value = 2200;
      s.connect(lp); lp.connect(g); g.connect(dst);
      this.env(g, t0, 0.02, 0.05 * clamp(amount, 0.3, 1), 0.25);
      s.start(t0, Math.random() * 2); s.stop(t0 + 0.5);
    }
  }

  // a grenade: a bright supersonic crack, a chest-hitting punch that drops in pitch, a torn,
  // driven mid body, a long rumbling room tail and debris pattering down. Close by it saturates
  // (a soft clipper on its own bus), far away the room swallows the top end
  explosion(pos, dist = 10) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const near = clamp(1 - dist / 30, 0, 1);
    const dst = this.spatial(pos);
    // its own driven bus: louder and punchier without pushing the master into hard clipping
    const bus = ctx.createGain(), drive = ctx.createWaveShaper(), post = ctx.createGain();
    if (!this._clip) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 2.6) / Math.tanh(2.6); } this._clip = c; }
    drive.curve = this._clip; drive.oversample = '2x';
    bus.gain.value = 1.5; post.gain.value = 2.0;
    bus.connect(drive); drive.connect(post); post.connect(dst);
    // up close it is too loud for the mic: past the limiter straight into the final clipper
    if (near > 0.45 && this.au.master) { const raw = ctx.createGain(); raw.gain.value = 1.4 * (near - 0.45) / 0.55; post.connect(raw); raw.connect(this.au.master); }
    // the room slaps it back: two early reflections off the walls
    for (const [dl, gv] of [[0.045 + Math.random() * 0.03, 0.55], [0.11 + Math.random() * 0.05, 0.35]]) {
      const de = ctx.createDelay(0.3), hp = ctx.createBiquadFilter(), eg = ctx.createGain();
      de.delayTime.value = dl; hp.type = 'highpass'; hp.frequency.value = 400; eg.gain.value = gv;
      post.connect(de); de.connect(hp); hp.connect(eg); eg.connect(dst);
    }
    const noise = (buf, at, dur) => { const n = ctx.createBufferSource(); n.buffer = buf; n.start(t + at, Math.random() * 2); n.stop(t + at + dur); return n; };
    // 1. the crack: a few milliseconds of broadband pressure, the brightest thing in the game
    { const n = noise(this.noise, 0, 0.12), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = 900;
      n.connect(hp); hp.connect(g); g.connect(bus);
      this.env(g, t, 0.0008, 3.0, 0.11); }
    // 2. the punch: a sine kick from 170 Hz to 32 Hz
    { const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.32);
      o.connect(g); g.connect(bus);
      this.env(g, t, 0.003, 3.2, 0.7);
      o.start(t); o.stop(t + 0.9); }
    // 3. the body: torn noise, low-passed from bright to dull over a second
    { const n = noise(this.noise, 0, 1.6), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.Q.value = 0.9;
      lp.frequency.setValueAtTime(9000, t); lp.frequency.exponentialRampToValueAtTime(1800, t + 0.15); lp.frequency.exponentialRampToValueAtTime(180, t + 1.3);
      n.connect(lp); lp.connect(g); g.connect(bus);
      this.env(g, t, 0.002, 2.6, 1.6); }
    // 4. the rumble: brown noise rolling round the rooms
    { const n = noise(this.brown, 0.02, 4.6), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 280;
      n.connect(lp); lp.connect(g); g.connect(dst);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.8, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5); }
    // a big send into the room
    if (this.au.verbIn) { const v = ctx.createGain(); v.gain.value = 0.9; post.connect(v); v.connect(this.au.verbIn); }
    // 5. debris: grit and chips pattering down, and a few heavier pieces
    for (let k = 0; k < 14; k++) {
      const at = 0.12 + Math.random() * 1.4;
      const n = noise(this.noise, at, 0.05), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 4000; bp.Q.value = 2.5;
      n.connect(bp); bp.connect(g); g.connect(dst);
      this.env(g, t + at, 0.001, 0.06 + 0.12 * Math.random(), 0.035);
    }
    for (let k = 0; k < 5; k++) setTimeout(() => this.au.impact(Math.random() < 0.5 ? 'metal' : 'wood', 0.3 + Math.random() * 0.35, pos), 180 + Math.random() * 900);
    if (dist < 10) { this.ring(clamp(1 - dist / 10, 0.25, 1)); this.deafen(clamp(1 - dist / 10, 0.2, 1)); }
  }

  // ---- recorded foley (Kenney "Impact Sounds", CC0): footsteps by surface, body impacts --------
  loadBank() {
    if (this.bankLoading || !this.ready) return;
    this.bankLoading = true;
    const groups = { carpet: 'footstep_carpet', concrete: 'footstep_concrete', wood: 'footstep_wood', punch: 'impactPunch_heavy', soft: 'impactSoft_heavy' };
    this.bank = {};
    const jobs = [];
    for (const [g, base] of Object.entries(groups)) {
      this.bank[g] = [];
      for (let i = 0; i < 5; i++) {
        const key = `sfx/${base}_${String(i).padStart(3, '0')}`;
        jobs.push(Assets.bytes(key).then((buf) => this.ctx.decodeAudioData(buf)).then((b) => { this.bank[g].push(b); }).catch(() => {}));
      }
    }
    Promise.all(jobs).then(() => { this.bankReady = Object.values(this.bank).every((l) => l.length); });
  }

  sample(group, out, { rate = 1, gain = 1, at = 0 } = {}) {
    const list = this.bank && this.bank[group];
    if (!list || !list.length) return null;
    let k = Math.floor(Math.random() * list.length);
    if (list.length > 1 && k === this['_last_' + group]) k = (k + 1) % list.length; // no repeats
    this['_last_' + group] = k;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = list[k]; s.playbackRate.value = rate;
    g.gain.value = gain;
    s.connect(g); g.connect(out);
    s.start(this.ctx.currentTime + at);
    return g;
  }

  // the floor a level is built from, for footsteps
  surface() {
    const th = this.game.level && this.game.level.theme;
    const id = th && th.id;
    return id === 'warehouse' || id === 'pipes' ? 'concrete' : id === 'poolrooms' ? 'tile' : 'carpet';
  }

  // a footstep: the surface's recording, pitched and weighted by who is walking and how fast, with
  // kit and cloth on top when running. pos null = the player (dry, close); else spatial
  footstep({ pos = null, speed = 3, crouch = 0, weight = 1, land = 0 } = {}) {
    if (!this.ready || !this.bankReady) return false;
    const ctx = this.ctx, surf = this.surface();
    const out = pos ? this.spatial(pos) : this.out;
    // surface colour: carpet is dull, tile bright and hard
    const eq = ctx.createBiquadFilter();
    if (surf === 'carpet') { eq.type = 'lowpass'; eq.frequency.value = 2600; }
    else if (surf === 'tile') { eq.type = 'highshelf'; eq.frequency.value = 2500; eq.gain.value = 5; }
    else { eq.type = 'peaking'; eq.frequency.value = 180; eq.gain.value = 2; eq.Q.value = 1; }
    eq.connect(out);
    const run = clamp((speed - 3.4) / 2.2, 0, 1);
    const level = (0.22 + 0.32 * clamp(speed / 5.6, 0, 1) + 0.5 * land) * (1 - 0.6 * crouch) * weight * (pos ? 1.25 : 1);
    const rate = (0.94 + Math.random() * 0.12) / Math.sqrt(weight) * (surf === 'tile' ? 1.06 : 1);
    this.sample(surf === 'carpet' ? 'carpet' : 'concrete', eq, { rate, gain: level });
    if (land > 0) this.sample('soft', eq, { rate: 0.8, gain: 0.5 * land });
    // running: the rattle of kit and the swish of clothes
    if (run > 0.05 && Math.random() < 0.8) {
      const t = ctx.currentTime;
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 600; bp.Q.value = 0.8;
      n.connect(bp); bp.connect(g); g.connect(out);
      this.env(g, t, 0.01, 0.05 * run * weight, 0.08);
      n.start(t, Math.random() * 2); n.stop(t + 0.12);
      if (Math.random() < 0.5) {
        const r = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), rg = ctx.createGain();
        r.buffer = this.noise; hp.type = 'bandpass'; hp.frequency.value = 5200; hp.Q.value = 3;
        r.connect(hp); hp.connect(rg); rg.connect(out);
        this.env(rg, t + 0.015, 0.001, 0.025 * run, 0.03);
        r.start(t + 0.015, Math.random() * 2); r.stop(t + 0.07);
      }
    }
    return true;
  }

  // a voice in pain, through the engine's glottal waveform and vowel formants. kind: 'grunt' (a
  // short hit), 'cry' (a bad one), 'scream' (a limb gone, burning). pos null = the player's own
  pain(pos, kind = 'grunt', pitch = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = pos ? this.spatial(pos) : this.out;
    const spec = {
      grunt: { dur: 0.14 + Math.random() * 0.12, f0: 118, lift: 1.3, vowel: [640, 1190, 2390], peak: 0.5, breath: 0.35, rough: 0.15 },
      cry: { dur: 0.38 + Math.random() * 0.35, f0: 175, lift: 1.25, vowel: [760, 1250, 2650], peak: 0.55, breath: 0.4, rough: 0.35 },
      scream: { dur: 0.8 + Math.random() * 0.5, f0: 300, lift: 1.12, vowel: [820, 1350, 2900], peak: 0.62, breath: 0.45, rough: 0.55 },
    }[kind] || null;
    if (!spec) return;
    const f0 = spec.f0 * pitch * (0.9 + Math.random() * 0.2), d = spec.dur;
    const o = ctx.createOscillator();
    if (this.au._glottalWave) { try { o.setPeriodicWave(this.au._glottalWave()); } catch (e) { o.type = 'sawtooth'; } } else o.type = 'sawtooth';
    // the pitch jumps up with the shock and sags as the breath runs out
    o.frequency.setValueAtTime(f0 * spec.lift, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + Math.min(0.09, d * 0.3));
    o.frequency.exponentialRampToValueAtTime(f0 * (kind === 'scream' ? 0.85 : 0.72), t + d);
    // a strained voice: jitter, and roughness from a fast tremor
    const jit = ctx.createOscillator(), jg = ctx.createGain();
    jit.type = 'triangle'; jit.frequency.value = 6 + Math.random() * 5; jg.gain.value = f0 * 0.03;
    jit.connect(jg); jg.connect(o.frequency);
    const vox = ctx.createGain(), rough = ctx.createOscillator(), rg = ctx.createGain();
    rough.frequency.value = 28 + Math.random() * 30; rg.gain.value = spec.rough * 0.5;
    vox.gain.value = 1 - spec.rough * 0.25;
    rough.connect(rg); rg.connect(vox.gain);
    for (const [k, f] of spec.vowel.entries()) {
      const bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = f * (0.94 + Math.random() * 0.12) * (pitch > 1.1 ? 1.08 : 1); bp.Q.value = [5, 8, 10][k];
      g.gain.value = [1, 0.6, kind === 'scream' ? 0.5 : 0.22][k];
      o.connect(bp); bp.connect(g); g.connect(vox);
    }
    // breath through the voice
    const n = ctx.createBufferSource(), nb = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = this.noise; nb.type = 'bandpass'; nb.frequency.value = 1500; nb.Q.value = 0.7; ng.gain.value = spec.breath;
    n.connect(nb); nb.connect(ng); ng.connect(vox);
    const env = ctx.createGain();
    vox.connect(env); env.connect(out);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(spec.peak, t + (kind === 'grunt' ? 0.012 : 0.03));
    env.gain.linearRampToValueAtTime(spec.peak * 0.75, t + d * 0.65);
    env.gain.linearRampToValueAtTime(0.0001, t + d);
    for (const x of [o, jit, rough]) { x.start(t); x.stop(t + d + 0.05); }
    n.start(t, Math.random() * 2); n.stop(t + d + 0.05);
    if (this.au.verbIn && pos) { const v = ctx.createGain(); v.gain.value = 0.22; env.connect(v); v.connect(this.au.verbIn); }
    // a sharp breath in afterwards
    if (kind !== 'grunt' && Math.random() < 0.6) {
      const b = ctx.createBufferSource(), bh = ctx.createBiquadFilter(), bg = ctx.createGain();
      b.buffer = this.noise; bh.type = 'bandpass'; bh.frequency.value = 2400; bh.Q.value = 1.2;
      b.connect(bh); bh.connect(bg); bg.connect(out);
      bg.gain.setValueAtTime(0.0001, t + d + 0.05); bg.gain.linearRampToValueAtTime(0.08, t + d + 0.15); bg.gain.linearRampToValueAtTime(0.0001, t + d + 0.32);
      b.start(t + d + 0.05, Math.random() * 2); b.stop(t + d + 0.35);
    }
  }

  // shell-shocked hearing: the whole mix muffles (a low-pass in front of the engine's master chain)
  // and opens up again over a few seconds; the tinnitus ring rides on top, unmuffled
  deafen(a) {
    const au = this.au, ctx = this.ctx;
    if (!this.deaf) {
      if (!au.bus || !au.hp) return;
      this.deaf = ctx.createBiquadFilter();
      this.deaf.type = 'lowpass'; this.deaf.frequency.value = 20000; this.deaf.Q.value = 0.5;
      au.bus.disconnect();
      au.bus.connect(this.deaf); this.deaf.connect(au.hp);
    }
    const t = ctx.currentTime, f = this.deaf.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.min(f.value, 20000), t);
    f.exponentialRampToValueAtTime(Math.max(260, 1800 - 1500 * a), t + 0.03);
    f.setValueAtTime(Math.max(260, 1800 - 1500 * a), t + 0.6 + 1.4 * a);
    f.exponentialRampToValueAtTime(20000, t + 3 + 4 * a);
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

  // a suppressed shot: no blast, a dull gas "thup" out of the can, the action cycling (slide or bolt
  // clacking back and slamming home) and, for supersonic rounds, the bullet's own crack, which no
  // suppressor removes. pos null = the player's own weapon
  suppressedShot(kind = 'pistol', pos = null) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dst = pos ? this.spatial(pos) : this.out;
    const rifle = /rifle|marksman|sniper|lmg|whisper/.test(kind), heavy = rifle || /shotgun|revolver/.test(kind);
    const subsonic = kind === 'whisper' || !rifle; // heavy subsonic .338 and handgun rounds: no crack
    const v = 0.9 + Math.random() * 0.2;
    // the gas: a short breathy burst, low-passed hard
    const s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; s.playbackRate.value = 0.75 + Math.random() * 0.3;
    lp.type = 'lowpass'; lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(heavy ? 2300 : 2900, t); lp.frequency.exponentialRampToValueAtTime(320, t + 0.1);
    s.connect(lp); lp.connect(g); g.connect(dst);
    this.env(g, t, 0.0015, (heavy ? 0.85 : 0.6) * v, heavy ? 0.15 : 0.1);
    s.start(t, Math.random() * 2); s.stop(t + 0.2);
    // the thump in the chest
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(heavy ? 120 : 160, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.07);
    o.connect(og); og.connect(dst);
    this.env(og, t, 0.002, (heavy ? 0.7 : 0.45) * v, 0.08);
    o.start(t); o.stop(t + 0.12);
    // the action: back (sharp) then home (heavier)
    const clack = (at, f, q, peak, d) => {
      const c = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), cg = ctx.createGain();
      c.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      c.connect(bp); bp.connect(cg); cg.connect(dst);
      this.env(cg, t + at, 0.0007, peak, d);
      c.start(t + at, Math.random() * 2); c.stop(t + at + d + 0.03);
    };
    if (kind === 'revolver') clack(0.012, 2400, 3, 0.16, 0.03); // the cylinder turns, nothing cycles
    else if (rifle) { clack(0.006, 3600, 4, 0.22, 0.02); clack(0.06 + Math.random() * 0.01, 2100, 5, 0.26, 0.035); }
    else { clack(0.004, 3100, 4, 0.26, 0.018); clack(0.045 + Math.random() * 0.01, 1900, 5, 0.3, 0.03); }
    // a supersonic round still cracks
    if (!subsonic) {
      const c = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), cg = ctx.createGain();
      c.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 2600;
      c.connect(hp); hp.connect(cg); cg.connect(dst);
      this.env(cg, t + 0.001, 0.0006, 0.42 * v, 0.03);
      c.start(t, Math.random() * 2); c.stop(t + 0.06);
    }
    // the room answers, faintly
    if (this.au.verbIn) { const r = ctx.createGain(); r.gain.value = heavy ? 0.3 : 0.2; g.connect(r); r.connect(this.au.verbIn); }
  }

  // a dying man's voice: a weak, breathy moan that sags in pitch, sometimes cut short by a gasp
  moan(pos, strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dst = this.spatial(pos);
    const dur = 0.6 + Math.random() * 1.1, f0 = 92 + Math.random() * 45;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.18, t);
    o.frequency.linearRampToValueAtTime(f0, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + dur);
    // a shaky voice
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 4 + Math.random() * 4; lg.gain.value = f0 * 0.035;
    lfo.connect(lg); lg.connect(o.frequency);
    // an "uh" / "oh" through three formants, plus breath
    const vox = ctx.createGain(), env = ctx.createGain();
    vox.gain.value = 1;
    for (const [f, q, a] of [[480 + Math.random() * 120, 6, 1], [850 + Math.random() * 150, 8, 0.55], [2400, 10, 0.12]]) {
      const bp = ctx.createBiquadFilter(), bg = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; bg.gain.value = a;
      o.connect(bp); bp.connect(bg); bg.connect(vox);
    }
    const n = ctx.createBufferSource(), nbp = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = this.noise; nbp.type = 'bandpass'; nbp.frequency.value = 1300; nbp.Q.value = 0.8; ng.gain.value = 0.35;
    n.connect(nbp); nbp.connect(ng); ng.connect(vox);
    vox.connect(env); env.connect(dst);
    const peak = 0.5 * clamp(strength, 0.15, 1);
    const cut = Math.random() < 0.3 ? dur * (0.45 + Math.random() * 0.2) : dur; // breaks off
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.14);
    env.gain.linearRampToValueAtTime(peak * 0.7, t + cut * 0.7);
    env.gain.linearRampToValueAtTime(0.0001, t + cut);
    o.start(t); lfo.start(t); n.start(t, Math.random() * 2);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
    if (this.au.verbIn) { const r = ctx.createGain(); r.gain.value = 0.25; env.connect(r); r.connect(this.au.verbIn); }
  }

  // medkit foley, all on the player: 'open' a velcro pouch, 'cap' the safety cap clicked off,
  // 'inject' the spring jab with a hiss and a grunt, 'relief' a long breath out once it has worked
  medkit(stage) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this.out;
    const burst = (at, dur, type, f, q, peak, rate = 1) => {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = this.noise; s.playbackRate.value = rate;
      fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      s.connect(fl); fl.connect(g); g.connect(out);
      this.env(g, t + at, Math.min(0.004, dur * 0.2), peak, dur);
      s.start(t + at, Math.random() * 2); s.stop(t + at + dur + 0.05);
      return g;
    };
    if (stage === 'open') {
      // velcro: a fast train of crackles under a tearing band. The square wave chops the noise
      // (0..1) in a stage of its own ahead of the envelope, so the envelope still shapes the tear
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), chop = ctx.createGain(), g = ctx.createGain();
      s.buffer = this.noise; fl.type = 'bandpass'; fl.frequency.value = 2600; fl.Q.value = 0.7;
      chop.gain.value = 0.5;
      s.connect(fl); fl.connect(chop); chop.connect(g); g.connect(out);
      this.env(g, t, 0.004, 0.3, 0.28);
      s.start(t, Math.random() * 2); s.stop(t + 0.33);
      const am = ctx.createOscillator(), amg = ctx.createGain();
      am.type = 'square'; am.frequency.value = 55 + Math.random() * 25; amg.gain.value = 0.5;
      am.connect(amg); amg.connect(chop.gain); am.start(t); am.stop(t + 0.33);
      burst(0.3, 0.06, 'bandpass', 1400, 1.2, 0.12); // the pouch flap
    } else if (stage === 'cap') {
      burst(0, 0.018, 'bandpass', 3800, 3, 0.3);
      burst(0.012, 0.03, 'bandpass', 2200, 4, 0.18);
    } else if (stage === 'inject') {
      burst(0, 0.02, 'bandpass', 3000, 2.5, 0.45);       // the spring fires
      burst(0.015, 0.05, 'lowpass', 900, 0.8, 0.5);      // into the thigh
      burst(0.03, 0.35, 'highpass', 5200, 0.6, 0.06);    // the hiss
      // a clenched grunt: a short voiced tone through a vowel formant
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), og = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t + 0.04); o.frequency.exponentialRampToValueAtTime(105, t + 0.3);
      bp.type = 'bandpass'; bp.frequency.value = 560; bp.Q.value = 4;
      o.connect(bp); bp.connect(og); og.connect(out);
      this.env(og, t + 0.04, 0.03, 0.16, 0.24);
      o.start(t + 0.04); o.stop(t + 0.35);
    } else if (stage === 'relief') {
      // a long breath out
      const s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = this.noise; lp.type = 'bandpass'; lp.frequency.setValueAtTime(1300, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.9); lp.Q.value = 0.8;
      s.connect(lp); lp.connect(g); g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.15);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.95);
      s.start(t, Math.random() * 2); s.stop(t + 1.0);
    }
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
        if (g.level && g.level.wetAt(h.x, h.z)) this.splash(h, 0.6); // wading (Level 2)
      }
    }
  }

  // a limb or head torn off: a meaty thump, a wet squelch sweeping down and the crackle of tissue
  // tearing, then a patter of what landed
  gore(pos, strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, s = clamp(strength, 0.3, 1.6);
    const dst = this.spatial(pos);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(95 + Math.random() * 20, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    o.connect(og); og.connect(dst);
    this.env(og, t, 0.003, 0.55 * s, 0.16);
    o.start(t); o.stop(t + 0.22);
    const w = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), wg = ctx.createGain();
    w.buffer = this.brown; w.playbackRate.value = 1.6 + Math.random() * 0.5;
    bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(1100 + Math.random() * 300, t); bp.frequency.exponentialRampToValueAtTime(260, t + 0.22);
    w.connect(bp); bp.connect(wg); wg.connect(dst);
    this.env(wg, t + 0.004, 0.006, 0.9 * s, 0.24);
    w.start(t, Math.random() * 2); w.stop(t + 0.32);
    // tearing: a burst of tiny clicks
    for (let k = 0; k < 7; k++) {
      const at = t + 0.004 + k * (0.008 + Math.random() * 0.012);
      const c = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), cg = ctx.createGain();
      c.buffer = this.noise; hp.type = 'bandpass'; hp.frequency.value = 1800 + Math.random() * 1800; hp.Q.value = 1.5;
      c.connect(hp); hp.connect(cg); cg.connect(dst);
      this.env(cg, at, 0.0008, (0.25 + Math.random() * 0.2) * s * (1 - k / 9), 0.012 + Math.random() * 0.015);
      c.start(at, Math.random() * 2); c.stop(at + 0.05);
    }
    for (let k = 0; k < 3; k++) setTimeout(() => this.au.splat(0.25 + Math.random() * 0.25, pos), 280 + Math.random() * 600);
  }
}
