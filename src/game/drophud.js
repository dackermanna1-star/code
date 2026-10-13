// Zombie survival drops on the HUD (Milestone 3.5, owner: drops; pickups.js builds it). One
// layer over the stock HUD and one under it:
//  - the announcer banner when a power-up is taken (its glyph and name, big, in its colour,
//    with what it does) or a crate is opened (what was in it)
//  - the running power-ups as glyph chips at the bottom middle, a ring running down round
//    each and its seconds under it (blinking through the last 3)
//  - markers over power-ups on the floor (their seconds left) and over the airdrop (distance,
//    INBOUND / the seconds it has left), pinned to the screen edge when it's off screen
//  - loot on the radar: small dots in the loot's colour, power-ups pulsing, the crate blinking
//    (pinned to the rim when it's out of range)
//  - the crate's "hold E" prompt and its bar, short pickup lines under the crosshair
//    ("+$85", "+25 HEALTH"), the Nuke's white flash; under the HUD, a red pulse at the screen
//    edges while Insta-Kill is on
// Glyphs are drawn with canvas paths (procedural, like everything else).
import { fontString } from '../ui/hud/font.js';
import { POWERUPS } from './powerups.js';

const BANNER_T = 2.8, BANNER_FADE = 0.5, TOAST_T = 1.7, FLASH_T = 1.6;
const CRATE_RGB = [255, 150, 50], WHITE = [255, 255, 255];
const _s = [0, 0, 0], _p = [0, 0, 0];
const css = (rgb, a = 1) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;

/** A glyph for id (a POWERUPS id, 'crate' or 'flare') centred at (x, y), radius r, in rgb. */
export function drawGlyph(G, id, x, y, r, rgb, alpha = 1) {
  G.save();
  G.globalAlpha = alpha;
  G.translate(x, y);
  G.fillStyle = css(rgb);
  G.strokeStyle = 'rgba(0,0,0,0.85)';
  G.lineWidth = Math.max(1, r * 0.12);
  G.lineJoin = 'round';
  const fs = () => { G.stroke(); G.fill(); };
  switch (id) {
    case 'maxammo': // three rounds
      for (let i = -1; i <= 1; i++) {
        const bx = i * r * 0.55, w = r * 0.4;
        G.beginPath();
        G.moveTo(bx - w / 2, r * 0.8); G.lineTo(bx - w / 2, -r * 0.15);
        G.quadraticCurveTo(bx - w / 2, -r * 0.85, bx, -r * 0.95);
        G.quadraticCurveTo(bx + w / 2, -r * 0.85, bx + w / 2, -r * 0.15);
        G.lineTo(bx + w / 2, r * 0.8); G.closePath();
        fs();
        G.fillStyle = 'rgba(0,0,0,0.45)'; G.fillRect(bx - w / 2, -r * 0.15, w, r * 0.1); G.fillStyle = css(rgb);
      }
      break;
    case 'instakill': { // a skull
      G.beginPath(); G.arc(0, -r * 0.15, r * 0.72, Math.PI * 0.85, Math.PI * 0.15); G.lineTo(r * 0.42, r * 0.85); G.lineTo(-r * 0.42, r * 0.85); G.closePath();
      fs();
      G.fillStyle = 'rgba(0,0,0,0.9)';
      G.beginPath(); G.ellipse(-r * 0.3, -r * 0.1, r * 0.2, r * 0.24, 0, 0, Math.PI * 2); G.fill();
      G.beginPath(); G.ellipse(r * 0.3, -r * 0.1, r * 0.2, r * 0.24, 0, 0, Math.PI * 2); G.fill();
      G.beginPath(); G.moveTo(0, r * 0.15); G.lineTo(-r * 0.09, r * 0.33); G.lineTo(r * 0.09, r * 0.33); G.closePath(); G.fill();
      for (let i = -1; i <= 1; i++) G.fillRect(i * r * 0.2 - r * 0.03, r * 0.5, r * 0.06, r * 0.3);
      break;
    }
    case 'doublecash': // a coin, x2
      G.beginPath(); G.arc(0, 0, r * 0.9, 0, Math.PI * 2); fs();
      G.fillStyle = 'rgba(0,0,0,0.8)';
      G.font = `bold ${Math.round(r * 1.05)}px sans-serif`; G.textAlign = 'center'; G.textBaseline = 'middle';
      G.fillText('x2', 0, r * 0.06);
      break;
    case 'nuke': // the trefoil
      G.beginPath(); G.arc(0, 0, r * 0.95, 0, Math.PI * 2); G.fillStyle = 'rgba(0,0,0,0.7)'; G.fill();
      G.fillStyle = css(rgb);
      for (let i = 0; i < 3; i++) {
        const a0 = (i * 120 - 90 - 30) * Math.PI / 180, a1 = (i * 120 - 90 + 30) * Math.PI / 180;
        G.beginPath(); G.arc(0, 0, r * 0.85, a0, a1); G.arc(0, 0, r * 0.28, a1, a0, true); G.closePath(); G.fill();
      }
      G.beginPath(); G.arc(0, 0, r * 0.17, 0, Math.PI * 2); G.fill();
      break;
    case 'firesale': // a price tag
      G.beginPath();
      G.moveTo(-r * 0.85, -r * 0.5); G.lineTo(r * 0.35, -r * 0.5); G.lineTo(r * 0.9, 0); G.lineTo(r * 0.35, r * 0.5); G.lineTo(-r * 0.85, r * 0.5); G.closePath();
      fs();
      G.fillStyle = 'rgba(0,0,0,0.85)';
      G.beginPath(); G.arc(r * 0.42, 0, r * 0.12, 0, Math.PI * 2); G.fill();
      G.font = `bold ${Math.round(r * 0.8)}px sans-serif`; G.textAlign = 'center'; G.textBaseline = 'middle';
      G.fillText('%', -r * 0.25, r * 0.04);
      break;
    case 'flare': // a parachute coming down
      G.beginPath(); G.arc(0, -r * 0.2, r * 0.8, Math.PI, 0); G.closePath(); fs();
      G.strokeStyle = css(rgb); G.lineWidth = Math.max(1, r * 0.1);
      G.beginPath(); G.moveTo(-r * 0.75, -r * 0.2); G.lineTo(-r * 0.2, r * 0.5); G.moveTo(r * 0.75, -r * 0.2); G.lineTo(r * 0.2, r * 0.5); G.stroke();
      G.fillRect(-r * 0.3, r * 0.45, r * 0.6, r * 0.45);
      break;
    default: // 'crate': a strapped box
      G.beginPath(); G.rect(-r * 0.8, -r * 0.65, r * 1.6, r * 1.4); fs();
      G.fillStyle = 'rgba(0,0,0,0.6)';
      G.fillRect(-r * 0.8, -r * 0.35, r * 1.6, r * 0.12);
      G.fillRect(-r * 0.08, -r * 0.65, r * 0.16, r * 1.4);
  }
  G.restore();
}

export class DropHud {
  constructor(pk) {
    this.pk = pk;
    this.F = { px: 0, big: '', big2: '', mid: '', small: '' };
    this.bn = null; // the banner: { id, title, sub, rgb, t0 }
    this.toasts = []; // [{ text, rgb, t0, dur }]
    this.flashT = -99;
    this.tintT = -99; this.tintRgb = WHITE;
    this.rows = []; // pickups.hud's buff rows (reused)
    this.edgeCv = null; // Insta-Kill's red screen edges (a canvas per screen size)
    const hud = pk.game.hud;
    hud?.addLayer?.((h, s, dt) => this.draw(h, s, dt), 2);
    hud?.addLayer?.((h, s) => this.under(h, s), -2);
  }

  get now() { return this.pk.game.hud?.time ?? this.pk.game.time; }

  reset() { this.bn = null; this.toasts.length = 0; this.flashT = this.tintT = -99; }

  buffRow(i) { return this.rows[i] || (this.rows[i] = { id: null, left: 0, frac: 0 }); }

  /** The announcer banner for power-up id, taken by p. */
  banner(id, p) {
    const P = POWERUPS[id], me = this.pk.game.local;
    const by = p && p !== me ? `  -  ${p.name}` : '';
    const sub = typeof P.sub === 'function' ? P.sub(this.pk.Z) : P.sub;
    this.bn = { id, title: P.name, sub: sub + by, rgb: P.rgb, t0: this.now };
  }

  /** Any banner: glyph id (a POWERUPS id, 'crate', 'flare'), title, sub, rgb. */
  show(id, title, sub, rgb = CRATE_RGB) { this.bn = { id, title, sub, rgb, t0: this.now }; }

  /** The crate's contents (got: airdrop.js reward) for whoever opened it. */
  crateBanner(got, p) {
    const me = this.pk.game.local;
    if (p === me) this.bn = { id: 'crate', title: got.name, sub: got.kind === 'kit' ? got.text : `Supply crate: ${got.text}, and armour`, rgb: CRATE_RGB, t0: this.now };
    else this.toast(`${p.name} opened the crate: ${got.name}`, CRATE_RGB, 3);
  }

  toast(text, rgb, dur = TOAST_T) {
    const T = this.toasts;
    T.push({ text, rgb, t0: this.now, dur });
    while (T.length > 3) T.shift();
  }

  flash() { this.flashT = this.now; }

  /** A quick wash of colour over the screen (a power-up taken). */
  tint(rgb) { this.tintT = this.now; this.tintRgb = rgb; }

  fonts(hud) {
    const F = this.F;
    if (F.px !== hud.fontPx) {
      F.px = hud.fontPx;
      F.big = fontString(Math.round(hud.fontPx * 2.4), true);
      F.big2 = fontString(Math.round(hud.fontPx * 1.7), true);
      F.mid = fontString(Math.round(hud.fontPx * 1.05), true);
      F.small = fontString(Math.max(9, Math.round(hud.fontPx * 0.85)), true);
    }
    return F;
  }

  // ---------------------------------------------------------------- under the HUD
  under(hud, s) {
    const Z = this.pk.Z;
    if (!s.zombie || !Z?.enabled || !s.alive || !this.pk.active.has('instakill')) return;
    const G = hud.gUnder, W = hud.vw, H = hud.vh, A = this.pk.active.get('instakill');
    const left = A.until - this.pk.game.time;
    const a = (0.14 + 0.08 * Math.sin(hud.time * 5)) * Math.min(1, left / 1.5);
    if (a <= 0) return;
    G.globalAlpha = Math.min(1, a);
    G.drawImage(this.edges(W, H), 0, 0);
    G.globalAlpha = 1;
  }

  /** The red edge glow, drawn once per screen size. */
  edges(W, H) {
    let c = this.edgeCv;
    if (c && c.width === W && c.height === H) return c;
    c = this.edgeCv = document.createElement('canvas');
    c.width = W; c.height = H;
    const G = c.getContext('2d'), e = Math.round(Math.min(W, H) * 0.09);
    for (const [x, y, w, h, x0, y0, x1, y1] of [[0, 0, W, e, 0, 0, 0, e], [0, H - e, W, e, 0, H, 0, H - e], [0, 0, e, H, 0, 0, e, 0], [W - e, 0, e, H, W, 0, W - e, 0]]) {
      const gr = G.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(230,20,20,1)'); gr.addColorStop(1, 'rgba(230,20,20,0)');
      G.fillStyle = gr; G.fillRect(x, y, w, h);
    }
    return c;
  }

  // ---------------------------------------------------------------- over the HUD
  draw(hud, s) {
    const pk = this.pk, Z = pk.Z;
    if (!s.zombie || !Z?.enabled) return;
    const F = this.fonts(hud), now = hud.time;
    if (Z.state === 'wave' || Z.state === 'break') {
      this.markers(hud, s, F);
      if (s.radar) this.radar(hud, s);
      if (s.alive) this.chips(hud, s, F);
      this.prompt(hud, s, F);
    }
    this.drawToasts(hud, F, now);
    this.drawBanner(hud, F, now);
    const tt = now - this.tintT;
    if (tt >= 0 && tt < 0.45) {
      hud.gTop.fillStyle = css(this.tintRgb, 0.22 * (1 - tt / 0.45));
      hud.gTop.fillRect(0, 0, hud.vw, hud.vh);
    }
    const ft = now - this.flashT;
    if (ft >= 0 && ft < FLASH_T) {
      const a = ft < 0.12 ? 0.95 : 0.95 * Math.exp(-(ft - 0.12) / 0.4);
      const G = hud.gTop;
      G.fillStyle = `rgba(255,250,235,${a.toFixed(3)})`;
      G.fillRect(0, 0, hud.vw, hud.vh);
    }
  }

  /** Power-ups on the floor (in view, within 2000 u) and the airdrop (always, pinned to the edge off screen). */
  markers(hud, s, F) {
    const g = this.pk.game, t = g.time, k = hud.k, D = this.pk.Z.downed, cam = g.camPos || g.local?.eyePos();
    if (!cam) return;
    for (const d of g.dropped) {
      if (d.kind !== 'powerup' || d.taken) continue;
      if (Math.hypot(d.pos[0] - cam[0], d.pos[1] - cam[1]) > 2000) continue;
      _p[0] = d.pos[0]; _p[1] = d.pos[1]; _p[2] = d.pos[2] + 44;
      if (!D.toScreen(hud, _p, _s) || _s[2] !== 1) continue;
      const P = POWERUPS[d.id], left = d.expire ? d.expire - t : 99;
      const blink = left < 5 && (t * 4) % 1 > 0.6;
      if (blink) continue;
      drawGlyph(hud.gTop, d.id, _s[0], _s[1], Math.round(8 * k), P?.rgb || [255, 255, 255], 0.9);
      if (d.expire) hud.text(`${Math.ceil(left)}`, _s[0], _s[1] + 10 * k, P?.rgb || [255, 255, 255], { align: 'center', font: F.small, alpha: 0.9 });
    }
    const C = s.drops?.crate;
    if (!C || C.state === 'opened') return;
    _p[0] = C.pos[0]; _p[1] = C.pos[1]; _p[2] = C.pos[2] + (C.state === 'flare' ? 60 : 50);
    if (!D.toScreen(hud, _p, _s)) return;
    const x = _s[0], y = _s[1], on = _s[2] === 1;
    const pulse = 0.75 + 0.25 * Math.sin(hud.time * 6);
    if (C.state === 'landed' && C.left < 5 && (t * 4) % 1 > 0.6) return;
    const me = g.local;
    const du = me?.alive ? Math.hypot(C.pos[0] - me.pm.origin[0], C.pos[1] - me.pm.origin[1], C.pos[2] - me.pm.origin[2]) : null;
    if (du != null && du < 110 && C.state === 'landed') return; // (right beside it: the prompt says it all)
    drawGlyph(hud.gTop, C.state === 'landed' ? 'crate' : 'flare', x, y, Math.round(10 * k), CRATE_RGB, on ? pulse : 0.85);
    const dm = du != null ? Math.round(du * 0.0254) : null;
    const what = C.state === 'landed' ? `AIRDROP  ${Math.ceil(C.left)}s` : 'AIRDROP INBOUND';
    hud.text(dm != null ? `${what}  ${dm}m` : what, x, y + 12 * k, CRATE_RGB, { align: 'center', font: F.small });
  }

  /** Loot on the radar (hud.drawRadar's layout: a 128k disc at the top left, range s.radar.range). */
  radar(hud, s) {
    const r = s.radar, k = hud.k, t = this.pk.game.time;
    for (const d of this.pk.game.dropped) {
      if (d.taken || d.kind === 'weapon' || d.kind === 'airdrop' || d.kind === 'trophy') continue;
      if (d.kind === 'powerup') { if ((t * 3) % 1 < 0.7) this.dot(hud, r, d.pos, POWERUPS[d.id]?.rgb || WHITE, 3 * k, false); }
      else this.dot(hud, r, d.pos, this.pk.kinds[d.kind]?.rgb || WHITE, 2 * k, false);
    }
    const C = s.drops?.crate;
    if (C && C.state !== 'opened' && (t * 2) % 1 < 0.6) this.dot(hud, r, C.pos, CRATE_RGB, 4 * k, true);
  }

  /** A radar dot at world pos (pin: kept on the rim when it's out of range). */
  dot(hud, r, pos, rgb, size, pin) {
    const k = hud.k, R = 64 * k, scale = (R - 3 * k) / (r.range || 1024), yaw = (r.yaw || 0) * Math.PI / 180;
    const sy = Math.sin(yaw), cy = Math.cos(yaw), dx = pos[0] - r.pos[0], dy = pos[1] - r.pos[1];
    let px = (dx * sy - dy * cy) * scale, py = -(dx * cy + dy * sy) * scale;
    const l = Math.hypot(px, py), lim = R - 3 * k;
    if (l > lim) { if (!pin) return; px *= lim / l; py *= lim / l; }
    hud.fillAdd(R + px - size / 2, R + py - size / 2, size, size, rgb, 255);
  }

  /** The running power-ups: glyph chips along the bottom middle, above the break's countdown. */
  chips(hud, s, F) {
    const B = s.drops?.buffs;
    if (!B?.length) return;
    const k = hud.k, G = hud.gTop, r = Math.round(15 * k), gap = Math.round(12 * k);
    const n = B.length, w = n * r * 2 + (n - 1) * gap;
    const y = Math.round(hud.vh - 1.5 * 25 * k - r - 22 * k);
    let x = Math.round(hud.vw / 2 - w / 2 + r);
    for (const b of B) {
      const P = POWERUPS[b.id], rgb = P.rgb;
      const low = b.left < 3, on = !low || (hud.time * 4) % 1 < 0.6;
      G.fillStyle = 'rgba(0,0,0,0.55)';
      G.beginPath(); G.arc(x, y, r + 3 * k, 0, Math.PI * 2); G.fill();
      G.strokeStyle = css(rgb, 0.25); G.lineWidth = Math.max(2, 2.5 * k);
      G.beginPath(); G.arc(x, y, r + 1 * k, 0, Math.PI * 2); G.stroke();
      G.strokeStyle = css(rgb, 1);
      G.beginPath(); G.arc(x, y, r + 1 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * b.frac); G.stroke();
      if (on) drawGlyph(G, b.id, x, y, Math.round(r * 0.72), rgb, 1);
      hud.text(`${Math.ceil(b.left)}`, x, y + r + 5 * k, low ? [255, 80, 60] : rgb, { align: 'center', font: F.small, alpha: on ? 1 : 0.5 });
      x += r * 2 + gap;
    }
  }

  /** Beside the crate: "hold E", and the bar while you're opening it. */
  prompt(hud, s, F) {
    const C = s.drops?.prompt;
    if (!C || !s.alive) return;
    const k = hud.k, W = hud.vw, y0 = Math.round(hud.vh * 0.6);
    if (C.mine && C.prog > 0) {
      const bw = Math.round(Math.min(W * 0.36, 240 * k)), bh = Math.round(7 * k), x = Math.round(W / 2 - bw / 2), by = y0 + hud.lineH + Math.round(3 * k);
      hud.text('Opening the supply crate...', W / 2, y0, CRATE_RGB, { align: 'center' });
      const G = hud.gTop;
      G.fillStyle = 'rgba(0,0,0,0.6)'; G.fillRect(x - 2, by - 2, bw + 4, bh + 4);
      G.fillStyle = css([CRATE_RGB[0] * 0.3, CRATE_RGB[1] * 0.3, CRATE_RGB[2] * 0.3], 0.85); G.fillRect(x, by, bw, bh);
      G.fillStyle = css(CRATE_RGB); G.fillRect(x, by, Math.round(bw * Math.min(1, C.prog)), bh);
    } else hud.text('Hold E (use) to open the supply crate', W / 2, y0, CRATE_RGB, { align: 'center' });
    void F;
  }

  drawToasts(hud, F, now) {
    const T = this.toasts;
    let y = Math.round(hud.vh * 0.665);
    for (let i = 0; i < T.length; i++) {
      const e = T[i], age = now - e.t0;
      if (age > e.dur || age < 0) { T.splice(i--, 1); continue; }
      const a = Math.min(1, age / 0.1, (e.dur - age) / 0.4);
      hud.text(e.text, hud.vw / 2, y - age * 10 * hud.k, e.rgb, { align: 'center', font: F.mid, alpha: a });
      y += hud.lineH + Math.round(2 * hud.k);
    }
  }

  /** The announcer banner: glyph and name, big, in its colour (it pops in, holds, fades). */
  drawBanner(hud, F, now) {
    const b = this.bn;
    if (!b) return;
    const age = now - b.t0;
    if (age < 0 || age > BANNER_T + BANNER_FADE) { this.bn = null; return; }
    // (M3 integration: the wave type's banner sits in the same band - the newest news wins; its tag stays under the wave info)
    const D = this.pk.Z?.director;
    if (D?.bannerOn?.()) D.bannerT = -99;
    const k = hud.k, G = hud.gTop, W = hud.vw;
    const a = Math.min(1, age / 0.12, (BANNER_T + BANNER_FADE - age) / BANNER_FADE);
    const pop = 1 + 0.35 * Math.max(0, 1 - age / 0.18);
    const bh = Math.round(hud.fontPx * 4.6), BS = this.pk.game.bosses?.stage;
    const y = Math.round(Math.max(hud.vh * 0.235, BS && hud.time - BS.bannerAt < 0.1 ? BS.bannerBottom + bh * 0.2 + 4 * k : 0)); // (under a boss's banner: bossstage.js)
    G.globalAlpha = a * 0.5;
    const gr = G.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.2, 'rgba(0,0,0,1)'); gr.addColorStop(0.8, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    G.fillStyle = gr;
    G.fillRect(0, y - Math.round(bh * 0.2), W, bh);
    G.globalAlpha = 1;
    // the title, its glow behind it
    G.font = F.big;
    let tw = G.measureText(b.title).width, font = F.big;
    if (tw > W * 0.72) { font = F.big2; G.font = font; tw = G.measureText(b.title).width; } // (a long name: a size down)
    const gr2 = Math.round(hud.fontPx * 1.3 * pop);
    const gx = Math.round(W / 2 - tw / 2 - gr2 - 10 * k);
    G.save();
    G.shadowColor = css(b.rgb, 0.9); G.shadowBlur = 18 * k;
    hud.text(b.title, W / 2, y, b.rgb, { align: 'center', alpha: a, font });
    G.restore();
    drawGlyph(G, b.id, gx, y + Math.round(hud.fontPx * 1.25), gr2, b.rgb, a);
    hud.text(b.sub, W / 2, y + Math.round(hud.fontPx * 2.8), [235, 230, 220], { align: 'center', alpha: a * 0.95, font: F.mid });
  }
}
