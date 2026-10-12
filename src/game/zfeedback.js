// Zombie survival hit confirmation and combat readability (Milestone 1.5): hit markers and
// hit sounds (from the 'hit' / 'kill' events), a quieter kill feed with streaks, short
// hit-stops on big moments, a low-HP vignette and heartbeat, pain direction toward fire and
// acid, optional damage numbers (cl_damagenumbers). The centre-message queue lives in hud.js
// (centerPrint channels) and the smooth camera shake in camshake.js.
// Scaffold: ZombieMode builds it and calls tick(t) first thing every tick; buildHudState
// calls hud(s) every frame. Run resets: the 'run' event. Drawing: hud.js draws s.hits,
// s.streak and s.killTally; the vignette and damage numbers are layers of this module.
import { Vector3 } from 'three';

// hit markers: how long each kind stays up (s of game time)
const KIND_BODY = 0, KIND_HEAD = 1, KIND_KILL = 2;
const MARK_LIFE = [0.22, 0.3, 0.5];
const MERGE = 0.03; // hits this close together (pellets, a penetrating shot) are one marker
const TICK_GAP = 0.05; // at most one body / head tick sound this often (miniguns)
// streaks: kills this close together chain; callouts at 3, 4, 5 and every 5th after that
const CHAIN = 1.1;
const STREAK_LIFE = 1.4;
const CHAIN_LABELS = ['', '', 'DOUBLE', 'TRIPLE', 'QUAD', 'PENTA'];
const chainLabel = (n) => CHAIN_LABELS[n] || `RAMPAGE x${n}`;
const callout = (n) => n >= 3 && (n <= 5 || n % 5 === 0);
// the quiet counter for common kills: a burst ends this long after its last kill
const TALLY_HOLD = 4;
// hit-stop (s of real time the world holds): special kills, boss moments, big multi-kills
const STOP_SPECIAL = 0.055, STOP_BOSS = 0.07, STOP_POSTURE = 0.05, STOP_MULTI = 0.045;
const STOP_GAP = 0.3; // (never back to back)
// low health: the red closes in under this, and the heart starts pounding under BEAT_HP
const LOW_HP = 40, BEAT_HP = 30;
// damage numbers (optional): how long one floats, how many can be up
const NUM_LIFE = 0.75, NUM_MAX = 24;
const GOLD = [255, 200, 40], WHITE = [255, 255, 255], RED = [255, 60, 40];

const _v = new Vector3();

export class ZFeedback {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    // hit markers: the latest hit (white / gold) and the latest kill (red X), drawn by hud.js
    this.mark = { t: -9, kind: KIND_BODY, heavy: 0 };
    this.killMark = { t: -9, kind: KIND_KILL, heavy: 0 };
    this.hitsOut = [{ age: 0, life: 1, kind: 0, heavy: 0 }, { age: 0, life: 1, kind: 2, heavy: 0 }];
    this.hitsList = [];
    this.streakOut = { label: '', age: 0, life: STREAK_LIFE, n: 0 };
    this.tallyOut = { n: 0, mine: 0, age: 0, hold: TALLY_HOLD };
    this.nums = [];
    for (let i = 0; i < NUM_MAX; i++) this.nums.push({ t: -9, victim: null, dmg: 0, kind: 0, x: 0, y: 0, z: 0, dx: 0 });
    this.hz = [0, 0, 0];
    this.vig = null; // cached red vignette
    this.reset();
    // (built inside ZombieMode's constructor, before game.zombies is set: subscribe right after)
    Promise.resolve().then(() => this.subscribe());
    game.hud?.addLayer?.((hud, s) => this.drawVignette(hud, s), -1);
    game.hud?.addLayer?.((hud, s) => this.drawNumbers(hud, s), 1);
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('hit', (e) => this.onHit(e));
    ev.on('kill', (e) => this.onKill(e));
    ev.on('boss', (e) => { if (e.phase === 'death') this.stop(STOP_BOSS, true); });
    ev.on('down', (e) => this.onDown(e));
  }

  reset() {
    this.mark.t = this.killMark.t = -9;
    this.tickAt = -9; this.tickKind = KIND_BODY; this.killSnd = -9;
    this.lethal = null; this.lethalShot = 0; // (the lethal hit just before a kill: its shot id)
    this.chain = 0; this.chainT = -9; this.chainStopped = false;
    this.pending = 0; // your kills since the last tick (for the streak check)
    this.shots = [0, 0, 0, 0]; this.shotN = [0, 0, 0, 0]; // this tick's kills per shot id (collaterals)
    this.streak = { label: '', t: -9, n: 0 };
    this.tally = { n: 0, mine: 0, t: -9 };
    this.hurt = 0; this.hurtT = 0;
    this.beatT = -9; this.nextBeat = 0;
    this.stopAt = -9;
    this.boss = { who: null, enraged: false, stun: 0, exposed: 0 };
    for (const n of this.nums) { n.t = -9; n.victim = null; }
    if (this.game.hitStop) this.game.hitStop = 0;
  }

  // ---------------------------------------------------------------- events
  onHit(e) {
    const g = this.game, me = g.local;
    if (!me) return;
    const t = g.time;
    if (e.victim === me) {
      // your own blood: the edges flash red for a moment (more for a bigger hit)
      if (e.damage > 0) { this.hurt = Math.min(1, this.hurtNow(t) + 0.25 + e.damage / 40); this.hurtT = t; }
      return;
    }
    if (e.attacker !== me || !e.victim.isZombie) return;
    const v = e.victim;
    const heavy = v.isBoss ? 2 : v.special ? 1 : 0;
    if (e.lethal) { this.lethal = v; this.lethalShot = e.shot; }
    // fire / acid still burning on them: no marker or tick each time it bites, only the kill
    const dot = (e.fire || e.acid) && !e.explode;
    if (e.lethal) {
      const k = this.killMark;
      k.heavy = t - k.t < MERGE ? Math.max(k.heavy, heavy) : heavy;
      k.t = t;
    } else if (!dot) {
      const m = this.mark, kind = e.head ? KIND_HEAD : KIND_BODY;
      if (t - m.t < MERGE) { m.kind = Math.max(m.kind, kind); m.heavy = Math.max(m.heavy, heavy); } else { m.kind = kind; m.heavy = heavy; }
      m.t = t;
    }
    this.sound(e.lethal ? KIND_KILL : dot ? -1 : e.head ? KIND_HEAD : KIND_BODY, heavy, t);
    if (this.game.settings?.get?.('cl_damagenumbers') && e.damage > 0) this.number(e, t);
  }

  /** Non-positional hit sounds: a tick, a brighter tink for the head, a heavy clack for a kill (one a tick). */
  sound(kind, heavy, t) {
    const S = this.game.sound;
    if (!S || kind < 0) return;
    if (kind === KIND_KILL) {
      if (this.killSnd === t) return;
      this.killSnd = t;
      S.play('hit_kill', { volume: heavy ? 1 : 0.75, pitch: heavy === 2 ? 0.8 : heavy ? 0.9 : 1, attenuation: 'none' });
      return;
    }
    if (t - this.tickAt < TICK_GAP && !(kind === KIND_HEAD && this.tickKind !== KIND_HEAD)) return;
    this.tickAt = t; this.tickKind = kind;
    S.play(kind === KIND_HEAD ? 'hit_head' : 'hit_tick', { volume: kind === KIND_HEAD ? 0.6 : 0.45, pitch: heavy ? 0.9 : 1, attenuation: 'none' });
  }

  onKill(e) {
    const g = this.game, t = g.time;
    if (!e.local || !e.zombie) return;
    // streaks: chained kills, and kills off one trigger pull (collaterals), checked once a tick
    this.chain = t - this.chainT <= CHAIN ? this.chain + 1 : 1;
    if (this.chain === 1) this.chainStopped = false;
    this.chainT = t;
    this.pending++;
    const shot = e.victim === this.lethal ? this.lethalShot : 0;
    this.lethal = null;
    if (shot) {
      const S = this.shots, N = this.shotN;
      let i = S.indexOf(shot);
      if (i < 0) { i = N.indexOf(0); if (i >= 0) S[i] = shot; }
      if (i >= 0) N[i]++;
    }
    if (e.special) this.stop(STOP_SPECIAL);
  }

  /** A teammate (or you) went down: it goes in the feed. */
  onDown(e) {
    const p = e.player, a = e.attacker;
    if (!p) return;
    this.game.hud?.addKill?.({ attacker: a && a !== p ? a.name : '', attackerTeam: a?.team, victim: p.name, victimTeam: p.team, weapon: a?.isZombie ? 'zombie' : 'world', suffix: 'DOWN' });
  }

  /**
   * game.killPlayer's kill feed line (zombie survival): true for a common zombie's death, which
   * goes to the quiet counter instead of the feed. Specials, bosses and the squad's own stay.
   */
  quietKill(victim, attacker) {
    if (!victim.isZombie || victim.special || victim.isBoss) return false;
    const T = this.tally, t = this.game.time;
    if (t - T.t > TALLY_HOLD) { T.n = 0; T.mine = 0; }
    T.n++;
    if (attacker && attacker === this.game.local) T.mine++;
    T.t = t;
    return true;
  }

  /** Hold the world still for a moment (real time; game.frame scales its dt). */
  stop(sec, always = false) {
    const g = this.game, t = g.time;
    if (!always && t - this.stopAt < STOP_GAP) return;
    this.stopAt = t;
    g.hitStop = Math.max(g.hitStop || 0, sec);
  }

  /**
   * Pain direction for fire and acid (game.damagePlayer): where the hazard is - the patch or
   * splash it came from, a blast's centre - and null when there's no telling (you're burning).
   */
  hazard(victim, dir, opts) {
    const o = victim.pm.origin, h = this.hz;
    if (opts.from) {
      const f = opts.from;
      if (Math.hypot(f[0] - o[0], f[1] - o[1]) < 30) return null; // (right underfoot: no direction)
      return f;
    }
    if (!dir || Math.hypot(dir[0], dir[1]) < 0.2) return null;
    h[0] = o[0] - dir[0] * 64; h[1] = o[1] - dir[1] * 64; h[2] = o[2];
    return h;
  }

  // ---------------------------------------------------------------- per tick
  /** Every tick while the mode runs (ZombieMode.tick, before the break / wave logic). */
  tick(t) {
    if (!this.subscribed) this.subscribe();
    if (this.pending) this.checkStreak(t);
    this.heartbeat(t);
    this.bossMoments(t);
  }

  /** The kills you made since the last tick: a collateral (one pull, 2+ dead) or a chain callout. */
  checkStreak(t) {
    let coll = 0;
    const N = this.shotN;
    for (let i = 0; i < N.length; i++) { if (N[i] > coll) coll = N[i]; N[i] = 0; this.shots[i] = 0; }
    const n0 = this.chain - this.pending, n = this.chain;
    this.pending = 0;
    let label = '', count = n;
    if (coll >= 2) { label = `COLLATERAL x${coll}`; count = coll; }
    else for (let c = n; c > n0; c--) if (callout(c)) { label = chainLabel(c); break; }
    if (!label) return;
    const S = this.streak;
    S.label = label; S.t = t; S.n = count;
    const me = this.game.local;
    this.game.hud?.addKill?.({ attacker: me?.name || '', attackerTeam: me?.team, label });
    this.Z.events.mode('streak', { player: me, n: count, label });
    if (coll >= 3 || (n >= 3 && !this.chainStopped)) { this.chainStopped = true; this.stop(STOP_MULTI); }
  }

  /** Low on health: the heart pounds, faster the closer you are to dying (not while down). */
  heartbeat(t) {
    const me = this.game.local;
    if (!me || !me.alive || me.downed || me.health > BEAT_HP || this.Z.state === 'over') { this.nextBeat = 0; return; }
    if (t < this.nextBeat) return;
    const k = 1 - Math.max(0, me.health) / BEAT_HP; // 0 at BEAT_HP .. 1 at death's door
    this.game.sound?.play('heartbeat', { volume: 0.5 + 0.4 * k, attenuation: 'none' });
    this.beatT = t;
    this.nextBeat = t + 1.1 - 0.5 * k;
  }

  /** A boss breaking (enraged, stunned, core exposed): the world holds for a beat. */
  bossMoments(t) {
    const b = this.game.bosses?.boss, B = b?.boss, M = this.boss;
    if (!B || !b.alive) { M.who = null; return; }
    if (M.who !== b) { M.who = b; M.enraged = B.enraged; M.stun = B.stunUntil; M.exposed = B.exposedUntil; return; }
    let hit = false;
    if (B.enraged && !M.enraged) hit = true;
    if (B.stunUntil > t && B.stunUntil !== M.stun) hit = true;
    if (B.exposedUntil > t && B.exposedUntil !== M.exposed && t >= M.exposed) hit = true;
    M.enraged = B.enraged; M.stun = B.stunUntil; M.exposed = B.exposedUntil;
    if (hit) { this.stop(STOP_POSTURE, true); this.game.shakeAt?.(b.pm.origin, 5, 1600); }
  }

  hurtNow(t) { return Math.max(0, this.hurt - (t - this.hurtT) * 2.2); }

  // ---------------------------------------------------------------- HUD
  /** HUD state (buildHudState, zombie survival only): hit markers, the streak popup, the quiet counter. */
  hud(s) {
    if (!this.subscribed) this.subscribe();
    const t = this.game.time, H = this.hitsList, O = this.hitsOut;
    H.length = 0;
    const m = this.mark, km = this.killMark;
    if (t - m.t < MARK_LIFE[m.kind]) { const o = O[0]; o.age = t - m.t; o.life = MARK_LIFE[m.kind]; o.kind = m.kind; o.heavy = m.heavy; H.push(o); }
    if (t - km.t < MARK_LIFE[KIND_KILL] * (1 + 0.25 * km.heavy)) { const o = O[1]; o.age = t - km.t; o.life = MARK_LIFE[KIND_KILL] * (1 + 0.25 * km.heavy); o.kind = KIND_KILL; o.heavy = km.heavy; H.push(o); }
    s.hits = H;
    const S = this.streak, so = this.streakOut;
    if (t - S.t < STREAK_LIFE && S.label) { so.label = S.label; so.age = t - S.t; so.n = S.n; s.streak = so; } else s.streak = null;
    const T = this.tally, to = this.tallyOut;
    if (T.n > 0 && t - T.t < TALLY_HOLD) { to.n = T.n; to.mine = T.mine; to.age = t - T.t; s.killTally = to; } else s.killTally = null;
  }

  /** Under the stock HUD: red closing in at low health, pulsing with the heartbeat; a red flash when hit. */
  drawVignette(hud, s) {
    const g = this.game, me = g.local;
    if (!s.zombie || !s.alive || !me || !me.alive || me.downed || s.downed) return;
    const t = g.time;
    const hp = s.health ?? 100;
    const low = hp < LOW_HP ? (LOW_HP - hp) / LOW_HP : 0;
    const hurt = this.hurtNow(t);
    if (low <= 0 && hurt <= 0.01) return;
    // two thumps a beat (heartbeat.wav's lub-dub at 0 and 0.24 s)
    const b = t - this.beatT;
    const pulse = b < 0 ? 0 : Math.exp(-b / 0.1) + (b > 0.24 ? 0.7 * Math.exp(-(b - 0.24) / 0.1) : 0);
    const a = Math.min(1, Math.max(low * (0.6 + 0.35 * Math.min(1, pulse)), hurt * 0.65));
    const W = hud.vw, Hh = hud.vh;
    if (!this.vig || this.vig.width !== W || this.vig.height !== Hh) {
      const c = this.vig || (this.vig = document.createElement('canvas'));
      c.width = W; c.height = Hh;
      const x = c.getContext('2d');
      const r = Math.hypot(W, Hh) / 2;
      const gr = x.createRadialGradient(W / 2, Hh / 2, r * 0.35, W / 2, Hh / 2, r);
      gr.addColorStop(0, 'rgba(120,0,0,0)');
      gr.addColorStop(0.5, 'rgba(140,0,0,0.35)');
      gr.addColorStop(1, 'rgba(70,0,0,0.9)');
      x.fillStyle = gr;
      x.fillRect(0, 0, W, Hh);
    }
    const G = hud.gUnder;
    G.globalAlpha = a;
    G.drawImage(this.vig, 0, 0);
    G.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- damage numbers (cl_damagenumbers)
  number(e, t) {
    const v = e.victim, N = this.nums;
    let n = null, old = N[0];
    for (let i = 0; i < N.length; i++) {
      const q = N[i];
      if (q.victim === v && t - q.t < 0.12) { n = q; break; } // (pellets / a burst on the same one add up)
      if (q.t < old.t) old = q;
    }
    const kind = e.lethal ? KIND_KILL : e.head ? KIND_HEAD : KIND_BODY;
    if (n) { n.dmg += e.damage; n.kind = Math.max(n.kind, kind); n.t = t; return; }
    n = old;
    const p = e.point, o = v.pm.origin;
    n.victim = v; n.dmg = e.damage; n.kind = kind; n.t = t;
    n.x = p ? p[0] : o[0]; n.y = p ? p[1] : o[1]; n.z = p ? p[2] : o[2] + 20;
    n.dx = (Math.random() - 0.5) * 24;
  }

  /** Over the stock HUD: the damage numbers, floating up from where the hits landed. */
  drawNumbers(hud, s) {
    const g = this.game;
    if (!s.zombie || !g.settings?.get?.('cl_damagenumbers')) return;
    const cam = g.renderer?.camera, t = g.time;
    if (!cam) return;
    for (const n of this.nums) {
      const age = t - n.t;
      if (age < 0 || age >= NUM_LIFE || !n.victim) continue;
      _v.set(n.x, n.z + 10 + age * 40, -n.y).project(cam);
      if (_v.z > 1 || _v.z < -1) continue;
      const x = (_v.x + 1) / 2 * hud.vw + n.dx * hud.k, y = (1 - _v.y) / 2 * hud.vh;
      const col = n.kind === KIND_KILL ? RED : n.kind === KIND_HEAD ? GOLD : WHITE;
      hud.text(String(Math.max(1, Math.round(n.dmg))), x, y, col, { align: 'center', alpha: age < 0.5 ? 1 : 1 - (age - 0.5) / (NUM_LIFE - 0.5) });
    }
  }

  /** A key / console command nothing else took (ZombieMode.command): true if it was yours. */
  command() { return false; }
}

