// Zombie survival readable specials and the combo director (Milestone 2.6, owner: specialsux).
// Telegraphs show as coloured arcs on a ring around the crosshair (a hunter winding up on your
// right, a smoker's tongue line; at most 3, merged by direction), specials get a faint rim
// glow (pulsing on a telegraph; the eye glow maps of the ones that have them pulse too) and
// aiming at one shows its name; a pinned ally gets a HELP marker, and freeing him a "SAVED
// Bravo". From diff.combo.from, planned pairs come from one front a few seconds apart (smoker
// + hunter, a boomer then a sprinter pack): Specials.pick turns a pick into the first of a pair
// and Specials.spawn queues the second with g.zombies.director.queue(kind, { front, at }).
// Bots call specials out on the radio (spotted, from Bot.acquire; grabbed, from tick).
//
// Contract (m2-contracts):
//   g.zombies.specials.threats()   every special telegraphing or mid-trick right now, as reused
//                                  records { z, kind, phase: 'windup' | 'attack' | 'hold',
//                                  target (who it's after / holding), left (s until it lands;
//                                  0 once it has), pos ([x,y,z] its eyes), total (the whole
//                                  windup, s), prog (0..1: the windup, the tongue's flight) } -
//                                  read them this frame, don't keep them.
//   g.zombies.specials.letGo(z)    a hunter / smoker lets go of whoever it holds (shove, saves)
// Events: 'save' { player, by, kind } (Specials.saved), 'combo' { kinds, front } (runstats.js).
// Difficulty: g.zombies.diff.combo { from, chance, gap, arcs, cost } (zdiff.js).
// HUD: hud(s) fills s.threats (reused; the layer below draws it): arcs, help, aim, callouts.
import { TEAM_CT } from './player.js';
import { zoneOf } from './bots.js';
import { fontString } from '../ui/hud/font.js';

const DEG = 180 / Math.PI;
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;
const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pick = (l) => l[Math.floor(Math.random() * l.length)];

/** Each special's colour: its telegraph arc, its rim glow, its name tag. */
export const THREAT_RGB = {
  hunter: [255, 205, 60], charger: [255, 105, 40], smoker: [190, 135, 255], boomer: [150, 235, 70],
  sprinter: [255, 70, 60], screamer: [255, 235, 190],
};
const WHITE = [255, 255, 255];
/** Rim glow strength: always (faint), telegraphing (the peak of the pulse), holding somebody, a Twin Elite at rest (director.js). */
const RIM = { base: 0.14, warn: 0.85, hold: 0.35, elite: 0.42 };
/**
 * "Lining up": a faint arc this long (s, x diff.combo.arcs) before a special in range that can
 * see you may start its trick: [its cooldown, min range, max range] (specials.js).
 */
const PRE = 0.6;
const TRICK = { hunter: ['pounce', 140, 560], charger: ['charge', 200, 900], smoker: ['tongue', 180, 850], boomer: ['vomit', 0, 260] };
const MAX_ARCS = 3, MERGE = 32, HALF = 24; // arcs; degrees apart that merge; an arc's half width (deg)
const URGE = { hold: 3, attack: 2, windup: 1, pre: 0 };
const SEEN_STEP = 0.1; // s between line-of-sight checks (you -> each special)
const SAVE_TIME = 2.2;

// bot radio lines: spotted (the kind's name and where, or a line), grabbed (the victim)
const SPOT = {
  hunter: ['Hunter! Watch for the pounce!', 'Hunter spotted!'],
  smoker: ['Smoker! Stay out of its reach!', 'Smoker spotted!'],
  boomer: ["Boomer! Don't pop it up close!", 'Boomer! Shoot it from range!'],
  charger: ['Charger! Get out of its way!', 'Charger incoming!'],
  sprinter: ['Sprinters! Fast ones coming!', 'Sprinters!'],
  screamer: ['Screamer! Drop it before it calls them!'],
};
const GRAB = {
  hunter: ["Hunter's got me! Get it off!", 'Hunter on me! Help!'],
  smoker: ["Smoker's got me! Shoot the tongue!", "I'm caught! Smoker!"],
};

export class ZThreats {
  constructor(game) {
    this.game = game;
    this.subscribed = false;
    // HUD state, reused frame to frame (hud(s) -> s.threats)
    const arc = () => ({ kind: null, phase: null, bearing: 0, lo: 0, hi: 0, left: 0, prog: 0, n: 0, rgb: WHITE });
    this.hs = { arcs: [], arcPool: [arc(), arc(), arc()], help: [], helpPool: [], aim: { on: false, name: '', hp: 0, rgb: WHITE }, saves: [] };
    this.cands = []; this.candPool = [];
    this.fonts = { px: 0, small: '', big: '' };
    this.scr = [0, 0, 0]; this.eye = [0, 0, 0]; this.zeye = [0, 0, 0];
    this.reset();
    Promise.resolve().then(() => this.subscribe()); // (built before game.zombies is set)
    game.hud?.addLayer?.((hud, s) => this.draw(hud, s), 3);
  }

  get Z() { return this.game.zombies; }

  subscribe() {
    const ev = this.game.zombies?.events;
    if (this.subscribed || !ev) return;
    this.subscribed = true;
    ev.on('run', (e) => { if (e.phase === 'start') this.reset(); });
    ev.on('save', (e) => this.onSave(e));
  }

  reset() {
    this.seenT = 0;
    this.callT = Object.create(null); // kind -> no callout for it before
    this.anyCallT = 0;
    this.hs.saves.length = 0;
    this.stats = { saves: 0, combos: 0, callouts: 0, grabs: 0 };
  }

  // ---------------------------------------------------------------- tick
  /** Every tick (ZombieMode.tick): what you can see of the specials, the bots' cries for help. */
  tick(t) {
    const g = this.game, Z = this.Z;
    if (!Z.enabled) return;
    // line of sight from you to each special (the name tag, the "lining up" arcs)
    if (t >= this.seenT) {
      this.seenT = t + SEEN_STEP;
      const me = g.local, eye = me?.alive ? me.eyePos(this.eye) : null;
      for (const z of Z.pool) {
        if (!z.special) continue;
        z.thSeen = !!(eye && z.alive && flat(eye, z.pm.origin) < 3000 && g.visible(eye, z.eyePos(this.zeye)));
      }
    }
    // someone in the squad just got grabbed: a bot cries out (or calls it for the human)
    for (const p of g.players) {
      const h = p.alive && p.team === TEAM_CT && !p.isZombie ? p.pinnedBy || p.tonguedBy : null;
      if (h && p.thHeld !== h) this.grabbed(p, h);
      p.thHeld = h || null;
    }
  }

  /** p was just pinned / tongued by special h: he (a bot) or the nearest bot (a human) radios it. */
  grabbed(p, h) {
    const B = this.game.bots;
    if (!B?.bots) return;
    this.stats.grabs++;
    let bot = p.isBot ? B.bots.find((b) => b.p === p) : null, text = null;
    if (bot) text = pick(GRAB[h.special] || GRAB.hunter);
    else {
      let bd = 1500;
      for (const b of B.bots) {
        const q = b.p;
        if (!q.alive || q.downed || q.team !== p.team || q.pinnedBy || q.tonguedBy) continue;
        const d = flat(q.pm.origin, p.pm.origin);
        if (d < bd) { bd = d; bot = b; }
      }
      if (bot) text = `${h.name || 'Special'} on ${p.name}!`;
    }
    if (bot && text) { B.radio(bot, text, { force: true, gap: 1 }); this.stats.callouts++; }
  }

  /**
   * Bot.acquire (bots.js): a bot just set its sights on special z - the first one to see it
   * calls it out (once per special or pack; a kind at most every 6 s, any every 2.5 s).
   */
  spotted(bot, z) {
    const S = z.sp, t = this.game.time;
    if (!this.Z.enabled || !S || S.called || !z.alive || !bot?.p?.alive) return false;
    for (const q of this.Z.pool) if (q.sp && (q === z || (q.alive && q.sp.pack === S.pack))) q.sp.called = true;
    if (t < (this.callT[z.special] || 0) || t < this.anyCallT) return false;
    this.callT[z.special] = t + 6; this.anyCallT = t + 2.5;
    const zone = zoneOf(z.pm.origin)?.[0];
    const text = zone && Math.random() < 0.6 ? `${z.name}${z.special === 'sprinter' ? 's' : ''} at ${zone}!` : pick(SPOT[z.special] || SPOT.hunter);
    this.stats.callouts++;
    return bot.mgr.radio(bot, text, { force: true, gap: 1.5 });
  }

  /** 'save' event: SAVED Bravo (you freed him), SAVED BY Alpha (he freed you), or a quiet line. */
  onSave(e) {
    const me = this.game.local, L = this.hs.saves;
    this.stats.saves++;
    if (!e.by && e.player !== me) return;
    let text, big = false, rgb = [120, 240, 140];
    if (e.by === me) { text = `SAVED ${e.player.name}`; big = true; }
    else if (e.player === me) { if (!e.by) return; text = `SAVED BY ${e.by.name}`; big = true; rgb = [150, 210, 255]; }
    else text = `${e.by.name} saved ${e.player.name}`;
    if (L.length >= 3) L.shift();
    L.push({ text, big, rgb, t0: this.game.time });
    if (e.by === me) this.game.sound?.play('save_sting', { volume: 0.8 });
  }

  // ---------------------------------------------------------------- HUD state
  /** HUD state (buildHudState, every frame): the arcs, HELP markers, the name under the crosshair. */
  hud(s) {
    const g = this.game, Z = this.Z, H = this.hs, t = g.time, me = g.local;
    s.threats = H;
    H.arcs.length = 0; H.help.length = 0; H.aim.on = false;
    while (H.saves.length && t - H.saves[0].t0 > SAVE_TIME) H.saves.shift();
    if (!me || Z.state === 'over') return;
    // HELP: squadmates held by a special (not whoever you watch: he has his own message)
    const vt = g.viewTarget || me;
    for (const p of g.players) {
      const h = p.pinnedBy || p.tonguedBy;
      if (!h || p === vt || !p.alive || p.team !== TEAM_CT || p.isZombie) continue;
      const e = H.helpPool[H.help.length] || (H.helpPool[H.help.length] = { p: null, by: null });
      e.p = p; e.by = h;
      H.help.push(e);
    }
    if (!me.alive) return;
    this.arcs(me, t);
    this.aim(me);
  }

  /** The telegraph arcs on you: gathered, most urgent first, merged by direction (MAX_ARCS). */
  arcs(me, t) {
    const Z = this.Z, H = this.hs, C = this.cands, o = me.pm.origin;
    C.length = 0;
    for (const r of Z.specials.threats()) {
      if (r.target !== me && !(r.kind === 'boomer' && flat(r.z.pm.origin, o) < 300)) continue;
      this.add(me, r.z, r.kind, r.phase, r.left, r.prog);
    }
    // lining up: in range, sees you, its trick ready within the lead
    const lead = PRE * (Z.diff.combo?.arcs ?? 1);
    for (const z of Z.pool) {
      const S = z.sp, T = z.alive && S && S.state === 'chase' && z.thSeen ? TRICK[z.special] : null;
      if (!T || z.target !== me || me.pinnedBy || me.tonguedBy) continue;
      const d = flat(z.pm.origin, o), wait = S.cd[T[0]] - t;
      if (d < T[1] || d > T[2] || wait > lead) continue;
      this.add(me, z, z.special, 'pre', Math.max(0, wait), Math.max(0, Math.min(1, 1 - wait / lead)));
    }
    if (!C.length) return;
    C.sort(byUrgency);
    for (const c of C) {
      let a = null;
      for (const b of H.arcs) {
        const d = angDiff(c.bearing, b.bearing);
        if (d >= b.lo + HALF - MERGE && d <= b.hi - HALF + MERGE) { a = b; b.lo = Math.min(b.lo, d - HALF); b.hi = Math.max(b.hi, d + HALF); b.n++; break; }
      }
      if (a || H.arcs.length >= MAX_ARCS) continue;
      a = H.arcPool[H.arcs.length];
      a.kind = c.kind; a.phase = c.phase; a.bearing = c.bearing; a.lo = -HALF; a.hi = HALF;
      a.left = c.left; a.prog = c.prog; a.n = 1; a.rgb = THREAT_RGB[c.kind] || WHITE;
      H.arcs.push(a);
    }
  }

  /** A threat on you (arcs), with its bearing: + on your left, like hudDamage. */
  add(me, z, kind, phase, left, prog) {
    const C = this.cands, P = this.candPool, o = me.pm.origin;
    const c = P[C.length] || (P[C.length] = { z: null, kind: null, phase: null, left: 0, prog: 0, bearing: 0 });
    c.z = z; c.kind = kind; c.phase = phase; c.left = left; c.prog = prog;
    c.bearing = angDiff(Math.atan2(z.pm.origin[1] - o[1], z.pm.origin[0] - o[0]) * DEG, me.pm.angles[1]);
    C.push(c);
  }

  /** The special under your crosshair (seen, within its body's width of the aim): its name and health. */
  aim(me) {
    const A = this.hs.aim, e = me.eyePos(this.eye), p = me.pm.angles[0] / DEG, y = me.pm.angles[1] / DEG;
    const fx = Math.cos(p) * Math.cos(y), fy = Math.cos(p) * Math.sin(y), fz = -Math.sin(p);
    let best = 1e9, bz = null;
    for (const z of this.Z.pool) {
      if (!z.special || !z.alive || !z.thSeen) continue;
      const dx = z.pm.origin[0] - e[0], dy = z.pm.origin[1] - e[1], dz = z.pm.origin[2] + 6 - e[2];
      const d = Math.hypot(dx, dy, dz) || 1;
      const along = (dx * fx + dy * fy + dz * fz);
      if (along <= 0) continue;
      const off = Math.sqrt(Math.max(0, d * d - along * along)); // (units from the aim line)
      if (off < 26 && off / along < best) { best = off / along; bz = z; }
    }
    if (!bz) return;
    A.on = true; A.name = bz.name; A.hp = Math.max(0, bz.health / (bz.maxHealth || 1)); A.rgb = THREAT_RGB[bz.special] || WHITE;
  }

  // ---------------------------------------------------------------- per frame
  /** Per frame (game.frame, zombie mode only): the specials' rim glow, pulsing on a telegraph. */
  frame(dt) {
    void dt;
    const t = this.game.time;
    for (const z of this.Z.pool) {
      const m = z.special ? z.model : null;
      if (!m?.setRim) continue;
      const S = z.sp;
      let k = 0, eyes = 1;
      if (z.alive && S) {
        const st = S.state;
        if (st === 'wind' || st === 'vomit' || st === 'air' || st === 'charge' || st === 'fly' || st === 'scream') { // (a screamer's shriek: zroster.js)
          const pulse = 0.5 + 0.5 * Math.sin(t * 22);
          k = RIM.base + (RIM.warn - RIM.base) * pulse; eyes = 1 + 2 * pulse;
        } else if (st === 'pin' || st === 'pull') k = RIM.hold + 0.12 * Math.sin(t * 8);
        else k = z.elite ? RIM.elite : RIM.base;
      }
      if (k === z.thRim) continue;
      z.thRim = k;
      m.setRim(THREAT_RGB[z.special] || WHITE, k);
      if (m.glowTint) m.setGlow(eyes);
    }
  }

  /** An unclaimed command (ZombieMode.command). True when it was ours. */
  command(p, cmd, args) { void p; void cmd; void args; return false; }

  // ---------------------------------------------------------------- drawing (HUD layer)
  font(hud, big) {
    const F = this.fonts;
    if (F.px !== hud.fontPx) { F.px = hud.fontPx; F.small = fontString(Math.max(9, Math.round(hud.fontPx * 0.8)), true); F.big = fontString(Math.round(hud.fontPx * 1.5), true); }
    return big ? F.big : F.small;
  }

  draw(hud, s) {
    const H = s.threats;
    if (!H || !this.Z.enabled) return;
    if (H.help.length) this.drawHelp(hud, H);
    if (s.alive) {
      if (H.arcs.length) this.drawArcs(hud, H);
      if (H.aim.on && !s.scope) this.drawAim(hud, H.aim);
    }
    if (H.saves.length) this.drawSaves(hud, H);
  }

  drawArcs(hud, H) {
    const g = hud.gTop, k = hud.k, t = hud.time;
    const cx = Math.floor(hud.vw / 2) + 0.5, cy = Math.floor(hud.vh / 2) + 0.5, R = Math.round(Math.min(hud.vh * 0.12, 58 * k));
    g.lineCap = 'butt';
    for (const a of H.arcs) {
      // screen angle: 0 up, clockwise; a bearing on your left (+) is counter-clockwise
      const th0 = (-(a.bearing + a.hi) - 90) / DEG, th1 = (-(a.bearing + a.lo) - 90) / DEG, mid = (-a.bearing - 90) / DEG;
      const c = a.rgb, pre = a.phase === 'pre';
      const flash = a.phase === 'attack' ? 0.6 + 0.4 * (Math.sin(t * 40) > 0 ? 1 : 0) : a.phase === 'hold' ? 0.75 + 0.25 * Math.sin(t * 9) : 1;
      const w = (pre ? 2 : a.phase === 'windup' ? 3.5 + 2.5 * a.prog : 6) * k;
      const alpha = pre ? 0.3 + 0.4 * a.prog : a.phase === 'windup' ? 0.75 + 0.25 * a.prog : flash;
      // a dark bed, the arc, and for a windup the brighter part closing in from both ends
      g.beginPath(); g.arc(cx, cy, R, th0, th1);
      g.strokeStyle = `rgba(0,0,0,${(0.45 * alpha).toFixed(3)})`; g.lineWidth = w + 2 * k; g.stroke();
      g.beginPath(); g.arc(cx, cy, R, th0, th1);
      g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(pre ? alpha : a.phase === 'windup' ? 0.5 * alpha : alpha).toFixed(3)})`; g.lineWidth = w; g.stroke();
      if (a.phase === 'windup') {
        const h = (th1 - th0) / 2 * a.prog;
        g.beginPath(); g.arc(cx, cy, R, mid - h, mid + h);
        g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(3)})`; g.lineWidth = w; g.stroke();
      }
      const ux = Math.cos(mid), uy = Math.sin(mid);
      // the smoker's tongue: a line out from the ring toward it (dashed as it coughs, then shooting out)
      if (a.kind === 'smoker' && !pre) {
        const L = (a.phase === 'windup' ? 10 : a.phase === 'attack' ? 6 + 18 * a.prog : 24) * k;
        g.setLineDash(a.phase === 'windup' ? [3 * k, 3 * k] : []);
        g.beginPath(); g.moveTo(cx + ux * (R - 2 * k), cy + uy * (R - 2 * k)); g.lineTo(cx + ux * (R + L), cy + uy * (R + L));
        g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(3)})`; g.lineWidth = Math.max(1.5, 2 * k); g.stroke();
        g.setLineDash([]);
      }
      // its name outside the ring (not when it's in front of you: you can see it)
      if (!pre && Math.abs(a.bearing) > 35) {
        const label = a.n > 1 ? `${NAME[a.kind] || a.kind.toUpperCase()} +${a.n - 1}` : NAME[a.kind] || a.kind.toUpperCase();
        const r2 = R + (a.kind === 'smoker' ? 30 : 12) * k;
        hud.text(label, cx + ux * r2, cy + uy * r2 - hud.lineH * (uy < -0.3 ? 0.9 : uy > 0.3 ? 0.1 : 0.5), c, { align: ux > 0.3 ? 'left' : ux < -0.3 ? 'right' : 'center', font: this.font(hud, false), alpha: Math.min(1, alpha + 0.2) });
      }
    }
  }

  drawAim(hud, A) {
    const k = hud.k, cx = hud.vw / 2, cy = hud.vh / 2;
    const y = Math.round(cy - 16 * k - hud.lineH); // (inside the arcs' ring)
    hud.text(A.name.toUpperCase(), cx, y, A.rgb, { align: 'center', font: this.font(hud, false), alpha: 0.95 });
    const g = hud.gTop, bw = Math.round(36 * k), bh = Math.max(2, Math.round(2 * k)), by = y + hud.lineH;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(cx - bw / 2 - 1, by - 1, bw + 2, bh + 2);
    g.fillStyle = `rgb(${A.rgb[0]},${A.rgb[1]},${A.rgb[2]})`; g.fillRect(cx - bw / 2, by, Math.round(bw * A.hp), bh);
  }

  drawHelp(hud, H) {
    const g = this.game, k = hud.k, T = hud.gTop, me = g.local, scr = this.scr;
    for (const e of H.help) {
      const o = e.p.pm.origin;
      scr[0] = o[0]; scr[1] = o[1]; scr[2] = o[2] + 44;
      if (!this.Z.downed.toScreen(hud, scr, scr)) continue;
      const x = scr[0], y = scr[1], on = scr[2] === 1, pulse = 0.5 + 0.5 * Math.sin(hud.time * 10);
      const c = THREAT_RGB[e.by.special] || WHITE;
      const big = this.font(hud, true);
      T.font = big;
      const tw = T.measureText('HELP!').width, bh = hud.fontPx * 1.5;
      T.fillStyle = `rgba(0,0,0,${on ? 0.6 : 0.5})`;
      T.fillRect(x - tw / 2 - 4 * k, y - bh / 2 - 2 * k, tw + 8 * k, bh + 4 * k);
      T.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(0.6 + 0.4 * pulse).toFixed(3)})`; T.lineWidth = Math.max(1, 1.5 * k);
      T.strokeRect(x - tw / 2 - 4 * k, y - bh / 2 - 2 * k, tw + 8 * k, bh + 4 * k);
      hud.text('HELP!', x, y - bh / 2, [255, 70 + 90 * pulse | 0, 50], { align: 'center', font: big });
      const dm = me?.alive ? Math.round(flat(me.pm.origin, o) * 0.0254) : null;
      const what = e.p.pinnedBy ? 'pinned' : 'grabbed';
      hud.text(dm != null ? `${e.p.name} ${what} - ${e.by.name}  ${dm}m` : `${e.p.name} ${what} - ${e.by.name}`, x, y + bh / 2 + 4 * k, c, { align: 'center', font: this.font(hud, false), alpha: on ? 1 : 0.85 });
    }
  }

  drawSaves(hud, H) {
    const t = this.game.time, cx = hud.vw / 2;
    let y = Math.round(hud.vh * 0.66); // (under the crosshair's streaks, over the HUD rows)
    for (let i = H.saves.length - 1; i >= 0; i--) {
      const e = H.saves[i], age = t - e.t0;
      const a = age < 0.15 ? age / 0.15 : age > SAVE_TIME - 0.5 ? Math.max(0, (SAVE_TIME - age) / 0.5) : 1;
      hud.text(e.text, cx, y, e.rgb, { align: 'center', font: this.font(hud, e.big), alpha: a });
      y += Math.round(hud.fontPx * (e.big ? 1.8 : 1.2));
    }
  }
}

const NAME = { hunter: 'HUNTER', charger: 'CHARGER', smoker: 'SMOKER', boomer: 'BOOMER', sprinter: 'SPRINTER', screamer: 'SCREAMER' };
const byUrgency = (a, b) => URGE[b.phase] - URGE[a.phase] || a.left - b.left;
