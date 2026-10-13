// Zombie survival boss fights, the show around them (Milestone 3.4, owner: bosses; bosses.js
// drives it):
//  - The staged arrival (arrival / tick): a boss wave's first ARRIVE s - the ground rumbles,
//    the lights dip (the world shader's brightness, shared by every world material; the
//    player's own setting comes back after), a far roar from where it will come in (and an
//    arrow at the screen's edge), and the commons back off from the squad. Then the title card
//    (spawned): letterbox bars, its name, its line, where its weak point is.
//  - Banners: a new phase (its move's name and how to beat it), a posture break, an elite.
//  - Telegraphs on the floor (mark / markLine): a circle or a lane that fills up as the hit
//    comes (acid rain, meteors, the slam's reach, the leap's landing, the acid wave's line).
//  - The glowing weak point (a sprite on its bone while it kneels; a flicker when the posture
//    bar is nearly full), the Butcher's hook chain, the trophy's marker, the elites' name plates.
// Nothing here allocates per frame once built (the meshes and the vignette are made once).
import * as THREE from 'three';
import { worldUniforms } from '../map/meshbuilder.js';
import { fontString } from '../ui/hud/font.js';
import { BAR } from '../ui/bossbar.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const DIP = 0.58; // the lights at their lowest: x (1 - DIP)
const ROAR_MAX = 1300; // the arrival roar plays toward the boss, at most this far from you (so it carries)
const TITLE_TIME = 4.6, BANNER_TIME = 2.8, BREAK_TIME = 1.7, ARROW_TIME = 3.2;
const BANNER_RANK = { break: 3, phase: 2, elite: 1 };
const BAR_K = 0.085; // the letterbox bars: x the screen height
const MARKERS = 16;
const GOLD = [255, 214, 90], SAND = [235, 215, 180], AMBER = [255, 176, 0], WHITE = [255, 250, 235], DIM = [200, 185, 150];
// where the glow sits on the weak point's bone (bone space: x forward, z along the bone)
const WEAK_AT = { head: [2.5, 0, 4.5], chest: [4.5, 0, 4.6], spine: [6, 0, 1.6] };
const _v = new THREE.Vector3(), _s = [0, 0, 0], _p = [0, 0, 0], _h = [0, 0, 0];

export class BossStage {
  constructor(game, bosses) {
    this.game = game;
    this.bosses = bosses;
    this.A = null; // the arrival on its way { n, def, node, t0, at, rumbled, roared }
    this.dim = 0; this.dimT = 0; this.liftAt = 0; this.lightBase = null; this.lightSet = -1; // the lights' dip
    this.arrowT = -99; this.arrowAt = [0, 0, 0];
    this.title = null; // { def, n, cycle, t0 }
    this.banner = null; // { kind, label, sub, rgb, t0, dur }
    this.firstBreak = true; // (the first break of a run explains itself)
    this.markers = []; this.tether = null; this.weak = null; this.weakOn = false; // (3D, built on first use)
    this.F = { px: 0 };
    this.vig = null; this.vigRgb = null;
    game.hud?.addLayer?.((hud, s, dt) => this.drawUnder(hud, s, dt), -1.5);
    game.hud?.addLayer?.((hud, s, dt) => this.drawOver(hud, s, dt), 3.5);
  }

  get Z() { return this.game.zombies; }

  /** A new run (bosses.clear): nothing on, the lights back at once. */
  clear() {
    this.reset();
    this.title = null; this.banner = null; this.waiting = null; this.firstBreak = true;
    this.dim = 0; this.liftAt = 0;
    this.applyLight();
  }

  /** The boss is gone (despawn): the arrival and anything on the floor off; the lights come back up. */
  reset() {
    this.A = null;
    this.liftAt = 0;
    for (const m of this.markers) { m.until = -1; m.obj.visible = false; }
    if (this.tether) this.tether.visible = false;
    this.hideWeak();
  }

  // ---------------------------------------------------------------- the arrival
  /** startWave on a boss wave (bosses.arrive): the show for the secs before def comes in. */
  arrival(n, def, secs) {
    const t = this.game.time, Z = this.Z;
    const node = Z.enabled && Z.pool ? Z.pickSpawn() : null;
    this.A = { n, def, node, t0: t, at: t + secs, rumbled: false, roared: false };
  }

  /** bosses.spawn: where it roared from (if it's def coming, and nobody stands right on it), or null; the arrival is over. */
  arrivalNode(def, humans) {
    const A = this.A;
    this.A = null;
    if (!A || A.def !== def || !A.node) return null;
    for (const h of humans) if (Math.hypot(h.pm.origin[0] - A.node.x, h.pm.origin[1] - A.node.y) < 500) return null;
    return A.node;
  }

  /** It's in: the title card, the commons near the squad back off again, the lights come back after its intro. */
  spawned(b, n) {
    const g = this.game, t = g.time, B = b.boss;
    this.title = { def: B.def, n, cycle: B.cycle, t0: t };
    this.liftAt = t + 2.4; // (a cheat's boss, with no arrival: a short dip too)
    g.sound?.play('boss_title', { volume: 0.9 });
    this.backOff(t, 1.6, 900);
  }

  /** Per tick (bosses.think): the arrival's beats. */
  tick(t) {
    const A = this.A, g = this.game, Z = this.Z;
    if (!A) return;
    if (Z.state !== 'wave') { this.A = null; return; } // (the run ended, or a skip)
    if (!A.rumbled && t >= A.t0 + 0.3) {
      A.rumbled = true;
      g.sound?.play('boss_rumble', { volume: 0.9 });
      g.addShake?.(2, (A.at - t) * 0.9);
    }
    if (!A.roared && t >= A.at - 2.8) {
      A.roared = true;
      const me = g.local, L = g.camPos || (me ? me.eyePos(_h) : null);
      const p = A.node ? [A.node.x, A.node.y, A.node.z + 60] : null;
      if (p && L) {
        const dx = p[0] - L[0], dy = p[1] - L[1], dz = p[2] - L[2], d = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, ROAR_MAX / d);
        _s[0] = L[0] + dx * k; _s[1] = L[1] + dy * k; _s[2] = L[2] + dz * k;
        g.sound?.play('boss_far_roar', { pos: _s, volume: 1 });
        this.arrowAt[0] = p[0]; this.arrowAt[1] = p[1]; this.arrowAt[2] = p[2];
        this.arrowT = t;
      } else g.sound?.play('boss_far_roar', { volume: 0.8 });
      g.shakeAt?.(_s, 5, 3000);
      this.backOff(t, 2.8, 4000);
    }
  }

  /**
   * The commons back off: those within r of the squad turn and scatter away from it for about
   * secs (zstagger.js's panic run: no swing, no step at anyone). Specials hold their nerve.
   */
  backOff(t, secs, r) {
    const Z = this.Z;
    if (!Z.pool) return;
    const humans = Z.humans();
    if (!humans.length) return;
    for (const z of Z.pool) {
      if (!z.alive || z.special || z.isBoss) continue;
      const o = z.pm.origin;
      let best = null, bd = r;
      for (const h of humans) { const d = Math.hypot(h.pm.origin[0] - o[0], h.pm.origin[1] - o[1]); if (d < bd) { bd = d; best = h; } }
      if (!best) continue;
      z.panicUntil = t + secs * rnd(0.85, 1.15);
      z.panicYaw = Math.atan2(o[1] - best.pm.origin[1], o[0] - best.pm.origin[0]) * 180 / Math.PI + rnd(-25, 25);
      z.staggerKind = 'stagger';
      z.staggerUntil = z.panicUntil; z.staggerFree = z.panicUntil;
      z.windup = 0;
      z.nextAttack = Math.max(z.nextAttack || 0, z.panicUntil + 0.2);
    }
  }

  /** How far the lights are down right now (0..1) - where they're heading. */
  dimWant(t) {
    if (!this.Z.enabled || this.Z.state === 'over') return 0;
    if (this.A) return smooth((t - this.A.t0) / 2.4);
    return t < this.liftAt && this.bosses.alive() ? 1 : 0;
  }

  /** The world's brightness, dipped by this.dim (the player's setting is the base: a change to it while dipped becomes the new base). */
  applyLight() {
    const u = worldUniforms.brightness;
    if (this.dim <= 0.001) {
      if (this.lightBase != null) { if (u.value === this.lightSet) u.value = this.lightBase; this.lightBase = null; this.lightSet = -1; }
      return;
    }
    if (this.lightBase == null || u.value !== this.lightSet) this.lightBase = u.value;
    u.value = this.lightSet = this.lightBase * (1 - DIP * this.dim);
  }

  // ---------------------------------------------------------------- banners
  /**
   * Put up a banner (one at a time). kind: 'break' | 'phase' | 'elite' (that order of weight: a
   * lighter one waits for a weightier one to finish - one waits at most); hint: a small line over it.
   */
  show(kind, label, sub, rgb, dur = BANNER_TIME, hint = '') {
    const t = this.game.time, cur = this.banner;
    const busy = cur && t - cur.t0 < cur.dur && BANNER_RANK[cur.kind] > BANNER_RANK[kind];
    const B = busy ? (this.waitObj || (this.waitObj = {})) : cur === this.bannerA ? (this.bannerB || (this.bannerB = {})) : (this.bannerA || (this.bannerA = {}));
    B.kind = kind; B.label = label; B.sub = sub; B.hint = hint; B.rgb = rgb; B.t0 = t; B.dur = dur;
    if (busy) this.waiting = B; else this.banner = B;
  }

  /** bosses.phaseShift: a new phase and the move it adds ({ name, hint }). */
  phase(b, phase, move) {
    this.show('phase', move.name, move.hint, b.boss.def.color, BANNER_TIME, `PHASE ${phase + 1}`);
  }

  /** bosses.breakPosture: "POSTURE BROKEN", the glow on its weak point, a gold rim. */
  broken(b, by) {
    void by;
    const B = b.boss, k = this.Z.diff.boss.kneelK;
    const sub = this.firstBreak ? `Hit the glowing weak point - ${B.def.weakName}!` : B.def.id === 'abomination' ? 'His core is open!' : `x${k} damage while it kneels`;
    this.firstBreak = false;
    this.show('break', 'POSTURE BROKEN', sub, GOLD, BREAK_TIME);
  }

  recovered(b) { b.model?.setRim?.(GOLD, 0); }

  killed(b) {
    b.model?.setRim?.(GOLD, 0);
    this.hideWeak();
    if (this.tether) this.tether.visible = false;
    for (const m of this.markers) if (m.owner === b) { m.until = -1; m.obj.visible = false; }
    if (this.banner?.kind === 'break' || this.banner?.kind === 'phase') this.banner = null;
    this.waiting = null;
  }

  // ---------------------------------------------------------------- telegraphs on the floor
  /** A circle of radius r on the floor at pos (its floor z), filling up from t0 to until (when the hit lands). */
  mark(pos, r, t0, until, rgb) {
    const m = this.freeMarker();
    if (!m) return null;
    m.kind = 'ring'; m.t0 = t0; m.until = until; m.owner = this.bosses.boss;
    m.obj.position.set(pos[0], pos[1], pos[2] + 1.5);
    m.obj.rotation.set(0, 0, 0);
    m.ring.visible = true; m.fill.visible = true; m.lane.visible = false; m.laneFill.visible = false;
    m.ring.scale.set(r, r, 1);
    this.paint(m, rgb);
    m.obj.visible = true;
    return m;
  }

  /** A lane on the floor from o along dir (unit xy) for len, width w (the acid wave's path), filling from t0 to until. */
  markLine(o, dir, len, w, t0, until, rgb) {
    const m = this.freeMarker();
    if (!m) return null;
    m.kind = 'lane'; m.t0 = t0; m.until = until; m.len = len; m.owner = this.bosses.boss;
    m.obj.position.set(o[0], o[1], o[2] + 1.5);
    m.obj.rotation.set(0, 0, Math.atan2(dir[1], dir[0]));
    m.ring.visible = false; m.fill.visible = false; m.lane.visible = true; m.laneFill.visible = true;
    m.lane.scale.set(len, w, 1); m.lane.position.set(len / 2, 0, 0);
    m.laneFill.scale.set(0.01, w, 1);
    this.paint(m, rgb);
    m.obj.visible = true;
    return m;
  }

  paint(m, rgb) {
    for (const mat of m.mats) mat.color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
  }

  freeMarker() {
    if (typeof document === 'undefined' || !this.game.renderer?.world) return null;
    if (!this.markers.length) this.buildMarkers();
    const t = this.game.time;
    let old = null;
    for (const m of this.markers) {
      if (m.until < t - 0.2) return m;
      if (!old || m.until < old.until) old = m;
    }
    return old; // (all busy: the one landing soonest)
  }

  buildMarkers() {
    const ringG = new THREE.RingGeometry(0.93, 1, 64), discG = new THREE.CircleGeometry(1, 48), planeG = new THREE.PlaneGeometry(1, 1);
    const mk = (opacity) => new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let i = 0; i < MARKERS; i++) {
      const obj = new THREE.Group();
      const mats = [mk(0.8), mk(0.25), mk(0.16), mk(0.35)];
      const ring = new THREE.Mesh(ringG, mats[0]), fill = new THREE.Mesh(discG, mats[1]);
      const lane = new THREE.Mesh(planeG, mats[2]), laneFill = new THREE.Mesh(planeG, mats[3]);
      for (const q of [ring, fill, lane, laneFill]) { q.renderOrder = 4; q.frustumCulled = false; obj.add(q); }
      obj.visible = false;
      this.game.renderer.world.add(obj);
      this.markers.push({ obj, ring, fill, lane, laneFill, mats, kind: 'ring', t0: 0, until: -1, len: 0, owner: null });
    }
  }

  /** Per frame: the circles fill toward the moment they land and flash just before it. */
  updateMarkers(t) {
    for (const m of this.markers) {
      if (!m.obj.visible) continue;
      if (t > m.until + 0.12 || m.until < 0) { m.obj.visible = false; continue; }
      const p = Math.max(0, Math.min(1, (t - m.t0) / Math.max(0.05, m.until - m.t0)));
      const flash = p > 0.75 ? 0.5 + 0.5 * Math.sin(t * 40) : 0.5 + 0.5 * Math.sin(t * 12);
      if (m.kind === 'ring') {
        const r = m.ring.scale.x;
        m.fill.scale.set(Math.max(0.01, r * p), Math.max(0.01, r * p), 1);
        m.mats[0].opacity = 0.45 + 0.45 * flash;
        m.mats[1].opacity = 0.12 + 0.25 * p;
      } else {
        m.laneFill.scale.x = Math.max(0.01, m.len * p);
        m.laneFill.position.set(m.len * p / 2, 0, 0.2);
        m.mats[2].opacity = 0.1 + 0.12 * flash;
        m.mats[3].opacity = 0.2 + 0.2 * p;
      }
    }
  }

  // ---------------------------------------------------------------- the weak point, the hook's chain
  buildWeak() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,240,170,0.9)');
    gr.addColorStop(0.6, 'rgba(255,170,40,0.35)');
    gr.addColorStop(1, 'rgba(255,120,0,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
    s.renderOrder = 30;
    s.visible = false;
    this.weak = s;
  }

  hideWeak() {
    if (this.weak) { this.weak.visible = false; this.weak.removeFromParent(); }
    this.weakOn = false;
  }

  /** Per frame: the glow on the weak point (bright while it kneels, a flicker when the bar is nearly full) and its gold rim. */
  updateWeak(t) {
    const b = this.bosses.boss, B = b?.alive ? b.boss : null;
    const broken = !!B && t < B.brokenUntil, near = !!B && !broken && B.postureMax > 0 && B.posture / B.postureMax > 0.8;
    if (!broken && !near) { if (this.weakOn) this.hideWeak(); return; }
    if (typeof document === 'undefined' || !b.model) return;
    if (!this.weak) this.buildWeak();
    const m = b.model, bone = m.bones?.[m.rig?.b?.[B.def.weakBone]?.i];
    if (!bone) return;
    const at = WEAK_AT[B.def.weakBone] || WEAK_AT.chest;
    if (this.weak.parent !== bone) { bone.add(this.weak); this.weak.position.set(at[0], at[1], at[2]); }
    this.weakOn = true;
    this.weak.visible = true;
    const pulse = 0.5 + 0.5 * Math.sin(t * (broken ? 11 : 22));
    const sz = broken ? 13 + 4 * pulse : 8 + 2 * pulse;
    this.weak.scale.set(sz, sz, 1);
    this.weak.material.opacity = broken ? 0.75 + 0.25 * pulse : 0.2 + 0.25 * pulse;
    if (broken) m.setRim?.(GOLD, 0.45 + 0.35 * pulse);
  }

  /** Per frame: the Butcher's chain from his hand to the hook. */
  updateTether() {
    const b = this.bosses.boss, k = b?.alive ? b.boss.hook : null;
    if (!k) { if (this.tether) this.tether.visible = false; return; }
    if (typeof document === 'undefined' || !this.game.renderer?.world) return;
    if (!this.tether) {
      const grp = new THREE.Group();
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6a625a }));
      chain.frustumCulled = false;
      const hook = new THREE.Mesh(new THREE.TorusGeometry(6, 1.6, 6, 12, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0xb8b0a4 }));
      hook.frustumCulled = false;
      grp.add(chain, hook);
      grp.userData = { chain, hook };
      this.game.renderer.world.add(grp);
      this.tether = grp;
    }
    const a = this.bosses.hand(b, _p), tip = k.tip;
    const { chain, hook } = this.tether.userData;
    _v.set(tip[0] - a[0], tip[1] - a[1], tip[2] - a[2]);
    const l = _v.length();
    chain.position.set(a[0], a[1], a[2]);
    chain.quaternion.setFromUnitVectors(Z_UP, _v.normalize());
    chain.scale.set(1, 1, Math.max(0.1, l));
    hook.position.set(tip[0], tip[1], tip[2]);
    hook.quaternion.copy(chain.quaternion);
    this.tether.visible = true;
  }

  // ---------------------------------------------------------------- drawing
  fonts(hud) {
    const F = this.F;
    if (F.px === hud.fontPx) return F;
    F.px = hud.fontPx;
    F.huge = fontString(Math.round(hud.fontPx * 3.1), true);
    F.big = fontString(Math.round(hud.fontPx * 2.3), true);
    F.mid = fontString(Math.round(hud.fontPx * 1.1), true);
    F.small = fontString(Math.round(hud.fontPx * 0.95), true);
    return F;
  }

  /** Under the stock HUD (every frame): the lights, the 3D bits, the arrival's vignette and the title card's letterbox. */
  drawUnder(hud, s, dt) {
    const g = this.game, t = g.time;
    void dt;
    // the lights ease toward where the show wants them (game time: they go with the fight)
    const want = this.dimWant(t), gdt = Math.max(0, Math.min(0.1, t - this.dimT));
    this.dimT = t;
    this.dim += (want - this.dim) * Math.min(1, gdt * (want > this.dim ? 2.2 : 1.1));
    if (want === 0 && this.dim < 0.01) this.dim = 0;
    this.applyLight();
    if (!this.Z.enabled) return;
    this.updateMarkers(t);
    this.updateWeak(t);
    this.updateTether();
    if (!s.zombie) return;
    const G = hud.gUnder, W = hud.vw, Hh = hud.vh;
    // the dark closing in while it comes, tinted its colour
    const rgb = this.A?.def.color || this.bosses.boss?.boss?.def.color;
    if (this.dim > 0.02 && rgb) {
      if (!this.vig || this.vig.width !== W || this.vig.height !== Hh || this.vigRgb !== rgb) {
        const c = this.vig || (this.vig = document.createElement('canvas'));
        c.width = W; c.height = Hh; this.vigRgb = rgb;
        const x = c.getContext('2d'), r = Math.hypot(W, Hh) / 2;
        const gr = x.createRadialGradient(W / 2, Hh / 2, r * 0.3, W / 2, Hh / 2, r);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(0.55, `rgba(${rgb[0] * 0.25 | 0},${rgb[1] * 0.12 | 0},${rgb[2] * 0.1 | 0},0.35)`);
        gr.addColorStop(1, 'rgba(0,0,0,0.92)');
        x.fillStyle = gr;
        x.fillRect(0, 0, W, Hh);
      }
      G.globalAlpha = Math.min(1, this.dim) * (0.85 + 0.15 * Math.sin(t * 5));
      G.drawImage(this.vig, 0, 0);
      G.globalAlpha = 1;
    }
    // letterbox bars while the title card is up
    const T = this.title;
    if (T) {
      const a = t - T.t0;
      if (a < 0 || a > TITLE_TIME) { this.title = null; return; }
      const e = smooth(Math.min(a / 0.35, (TITLE_TIME - a) / 0.5));
      const bh = Math.round(Hh * BAR_K * e);
      G.fillStyle = 'rgba(0,0,0,0.88)';
      G.fillRect(0, 0, W, bh);
      G.fillRect(0, Hh - bh, W, bh);
    }
  }

  /** Where the title card's last line ends (px down the view), while it's up; else 0 (drophud.js keeps its toasts under it). */
  titleBottom(hud) {
    if (!this.title || this.game.time - this.title.t0 > TITLE_TIME) return 0;
    const fp = hud.fontPx; // (drawOver's steps down the card)
    return Math.round(hud.vh * 0.55) + Math.round(fp * 1.5) + Math.round(fp * 3.5) + Math.round(fp * 1.7) + Math.round(fp * 1.25) + hud.lineH;
  }

  /** Over the stock HUD: the title card, the banners, the arrival's arrow, the trophy's marker, the elites' plates. */
  drawOver(hud, s) {
    const Z = this.Z;
    if (!Z.enabled || !s.zombie) return;
    const g = this.game, t = g.time, F = this.fonts(hud), k = hud.k, W = hud.vw, Hh = hud.vh;
    // ---- the title card
    const T = this.title;
    if (T) {
      const a = t - T.t0, al = Math.max(0, Math.min(1, a / 0.3, (TITLE_TIME - a) / 0.6));
      const rgb = T.def.color;
      let y = Math.round(Hh * 0.55); // (the lower third: clear of the centre prints and the boss bar)
      hud.text(`- WAVE ${T.n}${T.cycle ? `  -  ROUND ${T.cycle + 1}` : ''} -`, W / 2, y, AMBER, { align: 'center', alpha: al, font: F.small });
      y += Math.round(hud.fontPx * 1.5);
      const rise = (1 - smooth(a / 0.4)) * 10 * k;
      const right = hud.text(T.def.name, W / 2, y + rise, rgb, { align: 'center', alpha: al, font: F.huge });
      const nameW = 2 * (right - W / 2);
      const ry = y + Math.round(hud.fontPx * 1.55), rw = Math.round(Math.min(W * 0.18, 120 * k) * smooth(a / 0.6));
      const G = hud.gTop;
      G.globalAlpha = al;
      G.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      G.fillRect(Math.round(W / 2 - nameW / 2 - 12 * k - rw), ry, rw, Math.max(1, Math.round(2 * k)));
      G.fillRect(Math.round(W / 2 + nameW / 2 + 12 * k), ry, rw, Math.max(1, Math.round(2 * k)));
      G.globalAlpha = 1;
      y += Math.round(hud.fontPx * 3.5);
      hud.text(T.def.title, W / 2, y, SAND, { align: 'center', alpha: al * smooth((a - 0.25) / 0.4), font: F.mid });
      y += Math.round(hud.fontPx * 1.7);
      const a2 = al * smooth((a - 0.7) / 0.4);
      hud.text(`Weak point: ${T.def.weakName}`, W / 2, y, GOLD, { align: 'center', alpha: a2, font: F.small });
      hud.text('Shotguns, explosives and weak-point hits break its posture', W / 2, y + Math.round(hud.fontPx * 1.25), DIM, { align: 'center', alpha: a2, font: F.small });
    }
    // ---- a banner (a phase, a posture break, an elite)
    const N = this.banner;
    if (N) {
      const a = t - N.t0;
      if (a < 0 || a > N.dur) {
        this.banner = null;
        const W2 = this.waiting;
        if (W2) { this.waiting = null; const B = N === this.bannerA ? (this.bannerB || (this.bannerB = {})) : (this.bannerA || (this.bannerA = {})); Object.assign(B, W2); B.t0 = t; this.banner = B; } // (the one that waited: now)
      }
      else {
        const al = Math.max(0, Math.min(1, a / 0.15, (N.dur - a) / 0.4));
        const top = BAR.t === hud.time ? BAR.bottom : 0; // (under the boss block)
        const y = Math.round(Math.max(Hh * 0.17, top + 8 * k)), bh = Math.round(hud.fontPx * (N.hint ? 5.6 : 4.4)), G = hud.gTop;
        G.globalAlpha = al * 0.5;
        G.fillStyle = '#000';
        G.fillRect(0, y - Math.round(bh * 0.15), W, bh);
        G.globalAlpha = 1;
        this.bannerBottom = y - Math.round(bh * 0.15) + bh; this.bannerAt = hud.time; // (drophud.js puts a power-up's banner under it)
        let ly = y;
        if (N.hint) { hud.text(N.hint, W / 2, ly, N.rgb, { align: 'center', alpha: al, font: F.small }); ly += Math.round(hud.fontPx * 1.3); }
        const shake = N.kind === 'break' && a < 0.3 ? (Math.random() - 0.5) * 6 * k : 0;
        const pop = N.kind === 'break' ? 1 : 0;
        hud.text(N.label, W / 2 + shake, ly - (1 - smooth(a / 0.25)) * 8 * k, pop && (t * 8) % 1 < 0.5 ? WHITE : N.kind === 'phase' ? WHITE : N.rgb, { align: 'center', alpha: al, font: F.big });
        hud.text(N.sub, W / 2, ly + Math.round(hud.fontPx * 2.7), N.kind === 'phase' ? SAND : N.rgb, { align: 'center', alpha: al * 0.95, font: F.mid });
      }
    }
    const me = g.local;
    if (!me || !s.alive) return;
    // ---- the arrival's arrow: where that roar came from
    const at = t - this.arrowT;
    if (at >= 0 && at < ARROW_TIME && this.A) this.edgeArrow(hud, this.arrowAt, me, Math.min(1, at / 0.2, (ARROW_TIME - at) / 0.6) * (0.7 + 0.3 * Math.sin(at * 10)), [255, 60, 40], '!!');
    // ---- the trophy: a marker over it (at the screen's edge when it's off it)
    for (const d of g.dropped) {
      if (d.kind !== 'trophy' || d.taken) continue;
      _h[0] = d.pos[0]; _h[1] = d.pos[1]; _h[2] = d.pos[2] + 34;
      const dist = Math.hypot(d.pos[0] - me.pm.origin[0], d.pos[1] - me.pm.origin[1]);
      if (this.toScreen(hud, _h, _s)) this.diamond(hud, _s[0], _s[1], 7 * k, GOLD, 0.85 + 0.15 * Math.sin(t * 6), `TROPHY  ${Math.round(dist / 40)} m`, F.small);
      else this.edgeArrow(hud, _h, me, 0.85, GOLD, 'TROPHY');
    }
    // ---- the elites' name plates
    const aim = Z.threats?.hs?.aim;
    for (const z of this.bosses.elites.list) {
      if (!z.alive || !z.eliteRow) continue;
      if (aim?.on && aim.name === z.name) continue; // (under your crosshair: zthreats.js names it there)
      const o = z.pm.origin;
      if (Math.hypot(o[0] - me.pm.origin[0], o[1] - me.pm.origin[1]) > 1800) continue;
      _h[0] = o[0]; _h[1] = o[1]; _h[2] = o[2] + (z.visualCrouch ? 26 : 46) * (z.eliteRow.scale || 1);
      if (!this.toScreen(hud, _h, _s)) continue;
      const R = z.eliteRow, w = Math.round(64 * k), bh = Math.max(2, Math.round(4 * k)), x = Math.round(_s[0] - w / 2), y = Math.round(_s[1]);
      hud.text(R.short, _s[0], y - Math.round(hud.fontPx * 1.3), R.rgb, { align: 'center', font: F.small, alpha: 0.95 });
      const G = hud.gTop;
      G.fillStyle = 'rgba(0,0,0,0.65)';
      G.fillRect(x - 1, y - 1, w + 2, bh + 2);
      G.fillStyle = `rgb(${R.rgb[0]},${R.rgb[1]},${R.rgb[2]})`;
      G.fillRect(x, y, Math.round(w * Math.max(0, z.health / z.maxHealth)), bh);
    }
  }

  /** GS point -> HUD pixels in out[0..1]; false when it's behind you or off the screen. */
  toScreen(hud, pos, out) {
    const cam = this.game.renderer?.camera;
    if (!cam) return false;
    _v.set(pos[0], pos[2], -pos[1]).project(cam);
    if (_v.z > 1 || _v.z < -1 || _v.x < -0.95 || _v.x > 0.95 || _v.y < -0.95 || _v.y > 0.95) return false;
    out[0] = (_v.x + 1) / 2 * hud.vw; out[1] = (1 - _v.y) / 2 * hud.vh;
    return true;
  }

  diamond(hud, x, y, r, rgb, alpha, label, font) {
    const G = hud.gTop;
    G.globalAlpha = alpha;
    G.beginPath();
    G.moveTo(x, y - r); G.lineTo(x + r, y); G.lineTo(x, y + r); G.lineTo(x - r, y);
    G.closePath();
    G.lineWidth = Math.max(2, r * 0.35);
    G.strokeStyle = 'rgba(0,0,0,0.8)';
    G.stroke();
    G.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    G.fill();
    G.globalAlpha = 1;
    if (label) hud.text(label, x, y + r + 3 * hud.k, rgb, { align: 'center', alpha, font });
  }

  /** An arrow at the screen's edge toward pos (by yaw; as the director's), with a label beside it. */
  edgeArrow(hud, pos, me, alpha, rgb, label) {
    const k = hud.k, W = hud.vw, Hh = hud.vh, o = me.pm.origin;
    const rel = (Math.atan2(pos[1] - o[1], pos[0] - o[0]) * 180 / Math.PI - me.pm.angles[1]) * Math.PI / 180;
    const ux = -Math.sin(rel), uy = -Math.cos(rel);
    const cx = W / 2, cy = Hh / 2, rx = cx - 30 * k, rTop = cy - Hh * 0.2, rBot = Hh - cy - 100 * k;
    const sc = Math.min(Math.abs(ux) > 1e-3 ? rx / Math.abs(ux) : 1e9, uy < 0 ? rTop / -uy : uy > 1e-3 ? rBot / uy : 1e9);
    const x = cx + ux * sc, y = cy + uy * sc, size = 13 * k, px = -uy, py = ux, G = hud.gTop;
    G.globalAlpha = alpha;
    G.beginPath();
    G.moveTo(x + ux * size, y + uy * size);
    G.lineTo(x - ux * size * 0.6 + px * size * 0.8, y - uy * size * 0.6 + py * size * 0.8);
    G.lineTo(x - ux * size * 0.25, y - uy * size * 0.25);
    G.lineTo(x - ux * size * 0.6 - px * size * 0.8, y - uy * size * 0.6 - py * size * 0.8);
    G.closePath();
    G.lineWidth = Math.max(2, size * 0.25);
    G.strokeStyle = 'rgba(0,0,0,0.75)';
    G.stroke();
    G.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    G.fill();
    G.globalAlpha = 1;
    if (label) hud.text(label, x - ux * size * 2.2, y - uy * size * 2.2 - hud.fontPx / 2, rgb, { align: 'center', alpha, font: this.F.small });
  }
}

const Z_UP = new THREE.Vector3(0, 0, 1);
