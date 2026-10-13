// Zombie survival: the boss block under the wave info (hud.js drawZombie; Milestone 3.4).
//  - The boss's name, its status (ENRAGED, CORE EXPOSED...) and its phase (II, III).
//  - Its health bar: notches where the phases come (diff.boss.phases), a pale "ghost" of the
//    damage just dealt that drains after a moment.
//  - Its posture bar beneath: amber, pulsing once it's nearly full; BROKEN in white-gold while
//    it kneels (the time left).
//  - The elites' bars under it (the Alpha Hunter, the Juggernaut, the Twin Elites).
// b: bosses.hudInfo() ({ name (null: elites only), hp, hpMax, status, color, posture, broken,
// brokenLeft, phase, phases, elites: [{ name, hp, hpMax, rgb, status }] }).
import { fontString } from './hud/font.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const AMBER = [255, 176, 0], GOLD = [255, 214, 90], DIM = [190, 170, 130];
const S = { id: null, ghost: 1, held: 0, last: 1, tPrev: 0, px: 0, small: '' };

/** Where the block ended last (hud.time it was drawn at): the boss banners go under it (bossstage.js). */
export const BAR = { bottom: 0, t: -1 };

const rgba = (c, k, a) => `rgba(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0},${a})`;

/** Draw the block from y down (hud: the Hud). Returns the y under it. */
export function drawBossBar(hud, b, y) {
  const g = hud.gTop, k = hud.k, vw = hud.vw, t = hud.time, dt = Math.min(0.1, Math.max(0, t - S.tPrev));
  S.tPrev = t;
  if (S.px !== hud.fontPx) { S.px = hud.fontPx; S.small = fontString(Math.max(8, Math.round(hud.fontPx * 0.85)), true); }
  const w = Math.round(Math.min(vw * 0.5, 420 * k)), x = Math.round(vw / 2 - w / 2);
  if (b.name) {
    const h = Math.round(9 * k);
    const f = Math.max(0, Math.min(1, b.hp / b.hpMax));
    const col = b.color || [220, 40, 30];
    // the damage ghost: holds a moment, then drains down to the bar
    if (S.id !== b.name || f > S.ghost + 0.001) { S.id = b.name; S.ghost = f; S.held = t; }
    if (f < S.last - 0.0005) S.held = t;
    S.last = f;
    if (t - S.held > 0.45) S.ghost = Math.max(f, S.ghost - 0.5 * dt);
    const ph = b.phase ? `  ${ROMAN[b.phase] || b.phase + 1}` : '';
    hud.text(b.name + ph + (b.status ? `  -  ${b.status}` : ''), vw / 2, y, b.broken ? GOLD : col, { align: 'center' });
    const by = y + hud.lineH + Math.round(2 * k);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x - 2, by - 2, w + 4, h + 4);
    g.fillStyle = rgba(col, 0.35, 0.9);
    g.fillRect(x, by, w, h);
    g.fillStyle = 'rgba(255,235,210,0.75)';
    g.fillRect(x + Math.round(w * f), by, Math.round(w * (S.ghost - f)), h);
    g.fillStyle = b.broken && (t * 6) % 1 < 0.5 ? 'rgb(255,240,200)' : `rgb(${col[0]},${col[1]},${col[2]})`;
    g.fillRect(x, by, Math.round(w * f), h);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x, by, Math.round(w * f), Math.max(1, Math.round(h * 0.3)));
    // the phases' notches (passed ones dim)
    if (b.phases) {
      for (let i = 0; i < b.phases.length; i++) {
        const nx = x + Math.round(w * b.phases[i]);
        g.fillStyle = i < b.phase ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)';
        g.fillRect(nx - 1, by - 2, Math.max(2, Math.round(2 * k)), h + 4);
      }
    }
    y = by + h + Math.round(4 * k);
    // the posture bar
    if (b.posture != null) {
      const ph2 = Math.max(3, Math.round(5 * k));
      const p = b.broken ? b.brokenLeft : b.posture;
      const hot = !b.broken && p > 0.8;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(x - 2, y - 2, w + 4, ph2 + 4);
      g.fillStyle = 'rgba(80,60,20,0.85)';
      g.fillRect(x, y, w, ph2);
      const pulse = 0.5 + 0.5 * Math.sin(t * (b.broken ? 14 : 18));
      g.fillStyle = b.broken ? `rgba(255,${220 + 35 * pulse | 0},${150 + 100 * pulse | 0},1)` : hot ? `rgba(255,${190 + 50 * pulse | 0},${60 + 80 * pulse | 0},1)` : `rgb(${AMBER[0]},${AMBER[1]},${AMBER[2]})`;
      g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, p))), ph2);
      hud.text(b.broken ? 'BROKEN' : 'POSTURE', x - Math.round(6 * k), y + ph2 / 2 - hud.fontPx * 0.5, b.broken ? GOLD : DIM, { align: 'right', font: S.small, alpha: b.broken ? 1 : 0.85 });
      y += ph2 + Math.round(6 * k);
    }
  }
  // the elites
  const E = b.elites;
  if (E && E.length) {
    const ew = Math.round(w * 0.6), ex = Math.round(vw / 2 - ew / 2), eh = Math.max(3, Math.round(5 * k));
    for (const e of E) {
      hud.text(e.name + (e.status ? `  -  ${e.status}` : ''), vw / 2, y, e.rgb, { align: 'center', font: S.small });
      const ey = y + Math.round(hud.fontPx * 1.15);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(ex - 1, ey - 1, ew + 2, eh + 2);
      g.fillStyle = rgba(e.rgb, 0.3, 0.9);
      g.fillRect(ex, ey, ew, eh);
      g.fillStyle = `rgb(${e.rgb[0]},${e.rgb[1]},${e.rgb[2]})`;
      g.fillRect(ex, ey, Math.round(ew * Math.max(0, Math.min(1, e.hp / e.hpMax))), eh);
      y = ey + eh + Math.round(5 * k);
    }
  }
  BAR.bottom = y; BAR.t = t;
  return y;
}
