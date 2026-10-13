// The perk draft overlay (zombie survival, perks.js): the cards of your open offer dealt
// along the bottom of the view - icon, name, rarity colour, what it does (a gamble's downside
// in red), the synergy it would complete - with keys 1..n (or a click while the pointer is
// free: the buy menu, a fresh page), a reroll button, and how long until the wave picks for
// you. It never takes the pointer: you keep moving and looking while it's up. Also the
// "SYNERGY UNLOCKED" card. DOM in the HUD's root (z above the HUD canvases, under the menus).
//
//   const ui = new PerkDraftUI(hud.root, { onPick(k), onReroll(), sound(name) });
//   ui.show(view, { reroll })   view: perks.js ZPerks.view(offer)
//   ui.pick(k) / ui.hide(now) / ui.timer(left, total) / ui.rerollState(r) / ui.toast(t) / ui.frame(dt)
import { perkIcon } from './perkicons.js';
import { tinted } from './icons.js';

const CSS = `
.zp-root { position: absolute; inset: 0; pointer-events: none; z-index: 9; --u: 1px; overflow: hidden;
  font-family: "Segoe UI", Inter, Roboto, "Helvetica Neue", "DejaVu Sans", Arial, sans-serif; color: #f3e9dc; }
.zp-draft { position: absolute; left: 50%; bottom: calc(90 * var(--u)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; }
.zp-draft.out { animation: zp-out 0.32s ease-in forwards; }
@keyframes zp-out { to { opacity: 0; transform: translateX(-50%) translateY(calc(18 * var(--u))); } }
.zp-head { text-align: center; margin-bottom: calc(7 * var(--u)); animation: zp-head 0.35s ease-out both; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9); }
@keyframes zp-head { from { opacity: 0; transform: translateY(calc(-8 * var(--u))); } }
.zp-kick { font-size: calc(8.5 * var(--u)); font-weight: 800; letter-spacing: 0.34em; text-transform: uppercase; color: #f2a541; display: flex; align-items: center; justify-content: center; gap: calc(8 * var(--u)); }
.zp-kick::before, .zp-kick::after { content: ""; width: calc(26 * var(--u)); height: 1px; background: linear-gradient(90deg, transparent, #f2a541); }
.zp-kick::after { background: linear-gradient(90deg, #f2a541, transparent); }
.zp-title { margin-top: calc(1 * var(--u)); font-size: calc(19 * var(--u)); font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: #fff; }
.zp-draft.rare .zp-title { color: #9cc8ff; text-shadow: 0 0 calc(14 * var(--u)) rgba(90, 160, 255, 0.85), 0 1px 2px #000; }
.zp-draft.trophy .zp-title { color: #ffd27a; text-shadow: 0 0 calc(14 * var(--u)) rgba(255, 185, 40, 0.8), 0 1px 2px #000; }
.zp-cards { display: flex; gap: calc(10 * var(--u)); perspective: calc(700 * var(--u)); }
.zp-card { --c: 205, 205, 205; position: relative; width: calc(146 * var(--u)); min-height: calc(166 * var(--u)); pointer-events: auto; cursor: pointer; box-sizing: border-box;
  padding: calc(8 * var(--u)) calc(9 * var(--u)); display: flex; flex-direction: column; align-items: center;
  background: linear-gradient(180deg, rgba(var(--c), 0.2) 0%, rgba(20, 14, 16, 0.88) 34%, rgba(10, 8, 9, 0.93) 100%);
  border: 1px solid rgba(var(--c), 0.5); border-top: calc(3 * var(--u)) solid rgb(var(--c)); border-radius: calc(3 * var(--u));
  box-shadow: 0 0 calc(16 * var(--u)) rgba(var(--c), 0.22), inset 0 0 calc(22 * var(--u)) rgba(var(--c), 0.07), 0 calc(8 * var(--u)) calc(20 * var(--u)) rgba(0, 0, 0, 0.55);
  transform-origin: 50% 100%; animation: zp-deal 0.46s cubic-bezier(0.2, 0.9, 0.25, 1.12) both; animation-delay: calc(var(--i) * 85ms);
  transition: transform 0.14s ease, box-shadow 0.14s ease; overflow: hidden; }
@keyframes zp-deal { from { opacity: 0; transform: translateY(calc(46 * var(--u))) rotateX(62deg) scale(0.86); } 60% { opacity: 1; } to { opacity: 1; transform: none; } }
.zp-card:hover { transform: translateY(calc(-5 * var(--u))); box-shadow: 0 0 calc(26 * var(--u)) rgba(var(--c), 0.45), inset 0 0 calc(26 * var(--u)) rgba(var(--c), 0.12), 0 calc(12 * var(--u)) calc(24 * var(--u)) rgba(0, 0, 0, 0.6); }
.zp-card.rare, .zp-card.relic, .zp-card.syn { --shine: 1; }
.zp-card .zp-shine { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: linear-gradient(105deg, transparent 35%, rgba(var(--c), 0.28) 48%, rgba(255, 255, 255, 0.22) 50%, rgba(var(--c), 0.28) 52%, transparent 65%);
  background-size: 260% 100%; }
.zp-card.rare .zp-shine, .zp-card.relic .zp-shine { opacity: 1; animation: zp-shine 2.6s ease-in-out infinite; animation-delay: calc(0.6s + var(--i) * 0.2s); }
@keyframes zp-shine { from { background-position: 130% 0; } 55%, to { background-position: -30% 0; } }
.zp-card.curse { --c: 240, 64, 52; background: linear-gradient(180deg, rgba(150, 18, 24, 0.42) 0%, rgba(24, 8, 10, 0.92) 40%, rgba(12, 5, 6, 0.95) 100%);
  border-color: rgba(240, 64, 52, 0.55); animation: zp-deal 0.46s cubic-bezier(0.2, 0.9, 0.25, 1.12) both, zp-throb 1.6s ease-in-out infinite; animation-delay: calc(var(--i) * 85ms), 0.6s; }
@keyframes zp-throb { 50% { box-shadow: 0 0 calc(24 * var(--u)) rgba(240, 64, 52, 0.42), inset 0 0 calc(30 * var(--u)) rgba(240, 64, 52, 0.12), 0 calc(8 * var(--u)) calc(20 * var(--u)) rgba(0, 0, 0, 0.55); } }
.zp-card.syn { box-shadow: 0 0 0 1px rgba(255, 96, 210, 0.55), 0 0 calc(22 * var(--u)) rgba(255, 96, 210, 0.35), 0 calc(8 * var(--u)) calc(20 * var(--u)) rgba(0, 0, 0, 0.55); }
.zp-key { position: absolute; left: calc(7 * var(--u)); top: calc(7 * var(--u)); min-width: calc(17 * var(--u)); height: calc(17 * var(--u)); box-sizing: border-box;
  font-size: calc(10.5 * var(--u)); font-weight: 900; line-height: calc(15 * var(--u)); text-align: center; color: #fff; background: rgba(0, 0, 0, 0.55); border: 1px solid rgba(var(--c), 0.75); border-radius: calc(2 * var(--u)); }
.zp-rar { position: absolute; right: calc(8 * var(--u)); top: calc(10 * var(--u)); font-size: calc(7.5 * var(--u)); font-weight: 900; letter-spacing: 0.2em; text-transform: uppercase; color: rgb(var(--c)); }
.zp-icon { display: block; width: calc(50 * var(--u)); height: calc(50 * var(--u)); margin: calc(15 * var(--u)) 0 calc(5 * var(--u)); flex: none;
  filter: drop-shadow(0 0 calc(7 * var(--u)) rgba(var(--c), 0.75)); }
.zp-name { font-size: calc(12.5 * var(--u)); font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: #fff; text-align: center; line-height: 1.1; text-shadow: 0 1px 2px #000; }
.zp-text { margin-top: calc(5 * var(--u)); font-size: calc(9.4 * var(--u)); line-height: 1.32; text-align: center; color: rgba(243, 233, 220, 0.86); }
.zp-card.curse .zp-text { color: #a7e8a0; }
.zp-bane { margin-top: calc(2 * var(--u)); font-size: calc(9.4 * var(--u)); line-height: 1.32; text-align: center; color: #ff7a6a; font-weight: 700; }
.zp-text b, .zp-bane b { font-weight: 900; }
.zp-meta { margin-top: auto; padding-top: calc(6 * var(--u)); text-align: center; font-size: calc(7.5 * var(--u)); font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(243, 233, 220, 0.42); }
.zp-meta.syn { color: rgb(255, 120, 220); text-shadow: 0 0 calc(8 * var(--u)) rgba(255, 96, 210, 0.7); }
.zp-card.picked { animation: zp-picked 0.5s ease-out forwards; pointer-events: none; z-index: 2; }
@keyframes zp-picked { 0% { transform: none; } 35% { transform: translateY(calc(-14 * var(--u))) scale(1.1); box-shadow: 0 0 calc(40 * var(--u)) rgba(var(--c), 0.9), inset 0 0 calc(40 * var(--u)) rgba(var(--c), 0.35); }
  100% { transform: translateY(calc(-40 * var(--u))) scale(1.04); opacity: 0; } }
.zp-card.gone { animation: zp-gone 0.3s ease-in forwards; pointer-events: none; }
@keyframes zp-gone { to { transform: translateY(calc(30 * var(--u))) rotateX(40deg) scale(0.9); opacity: 0; } }
.zp-foot { display: flex; align-items: center; justify-content: space-between; gap: calc(12 * var(--u)); width: 100%; margin-top: calc(7 * var(--u)); font-size: calc(8.6 * var(--u)); text-shadow: 0 1px 2px #000; }
.zp-hint { color: rgba(243, 233, 220, 0.7); letter-spacing: 0.04em; }
.zp-hint b { color: #fff; font-weight: 900; }
.zp-roll { pointer-events: auto; cursor: pointer; padding: calc(3 * var(--u)) calc(9 * var(--u)); border: 1px solid rgba(242, 165, 65, 0.5); border-radius: calc(2 * var(--u));
  background: rgba(30, 20, 10, 0.6); color: #f2a541; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; transition: background 0.14s, color 0.14s; }
.zp-roll b { display: inline-block; min-width: calc(12 * var(--u)); margin-right: calc(5 * var(--u)); text-align: center; color: #fff; background: rgba(242, 165, 65, 0.3); border-radius: calc(2 * var(--u)); }
.zp-roll:hover { background: rgba(242, 165, 65, 0.22); color: #fff; }
.zp-roll.off { opacity: 0.42; cursor: default; pointer-events: none; }
.zp-roll.poor { color: #ff7a6a; border-color: rgba(255, 90, 70, 0.45); }
.zp-timer { width: 100%; height: calc(3 * var(--u)); margin-top: calc(6 * var(--u)); background: rgba(0, 0, 0, 0.55); border-radius: calc(2 * var(--u)); overflow: hidden; }
.zp-timer i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #e0452b, #f2a541); transform-origin: 0 50%; }
.zp-timer.low i { background: #e0452b; animation: zp-blink 0.5s steps(2) infinite; }
@keyframes zp-blink { 50% { opacity: 0.35; } }
.zp-toast { --c: 255, 96, 210; position: absolute; left: 50%; bottom: calc(96 * var(--u)); transform: translateX(-50%); display: flex; align-items: center; gap: calc(12 * var(--u));
  padding: calc(10 * var(--u)) calc(18 * var(--u)) calc(10 * var(--u)) calc(12 * var(--u)); min-width: calc(250 * var(--u)); max-width: calc(380 * var(--u)); box-sizing: border-box;
  background: linear-gradient(90deg, rgba(var(--c), 0.24), rgba(16, 9, 14, 0.9) 45%); border: 1px solid rgba(var(--c), 0.55); border-left: calc(3 * var(--u)) solid rgb(var(--c)); border-radius: calc(3 * var(--u));
  box-shadow: 0 0 calc(30 * var(--u)) rgba(var(--c), 0.35), 0 calc(10 * var(--u)) calc(24 * var(--u)) rgba(0, 0, 0, 0.55); animation: zp-toast-in 0.5s cubic-bezier(0.2, 0.9, 0.25, 1.2) both; }
.zp-toast.out { animation: zp-toast-out 0.5s ease-in forwards; }
@keyframes zp-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(calc(-20 * var(--u))) scale(0.9); } }
@keyframes zp-toast-out { to { opacity: 0; transform: translateX(-50%) translateY(calc(-12 * var(--u))); } }
.zp-ticon { width: calc(46 * var(--u)); height: calc(46 * var(--u)); flex: none; filter: drop-shadow(0 0 calc(9 * var(--u)) rgba(var(--c), 0.9)); animation: zp-pulse 1.2s ease-in-out infinite; }
@keyframes zp-pulse { 50% { filter: drop-shadow(0 0 calc(16 * var(--u)) rgba(var(--c), 1)); } }
.zp-tk { font-size: calc(8 * var(--u)); font-weight: 900; letter-spacing: 0.32em; text-transform: uppercase; color: rgb(var(--c)); }
.zp-tn { font-size: calc(17 * var(--u)); font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: #fff; line-height: 1.15; text-shadow: 0 0 calc(10 * var(--u)) rgba(var(--c), 0.6); }
.zp-tf { font-size: calc(8.5 * var(--u)); font-weight: 700; letter-spacing: 0.06em; color: rgba(243, 233, 220, 0.6); }
.zp-tt { margin-top: calc(3 * var(--u)); font-size: calc(9.5 * var(--u)); line-height: 1.3; color: rgba(243, 233, 220, 0.9); }
`;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** A canvas with glyph key drawn in rgb, size CSS px (sharp on high-DPI screens). */
function iconCanvas(cls, key, size, rgb) {
  const c = el('canvas', cls);
  const px = Math.max(16, Math.round(size * Math.min(3, window.devicePixelRatio || 1)));
  c.width = c.height = px;
  c.getContext('2d').drawImage(tinted(perkIcon(key, px, [1, 0.8, 0.66]), rgb), 0, 0);
  return c;
}

const PICK_T = 0.5; // s the pick animation runs before the overlay goes (or the next offer comes)

export class PerkDraftUI {
  constructor(parent, cb = {}) {
    this.cb = cb;
    if (!document.getElementById('zp-css')) {
      const st = document.createElement('style');
      st.id = 'zp-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.parent = parent;
    this.root = el('div', 'zp-root');
    parent.appendChild(this.root);
    this.draft = null; // the overlay's element
    this.cards = [];
    this.visible = false;
    this.busy = 0; // s of the pick animation left
    this.pending = null; // a view to show once it's done ([view, opts]), or 'hide'
    this.toastEl = null; this.toastT = 0; this.toastQ = null; // (the synergy card, and one waiting for the cards to go)
    this.sfx = []; // [{ at (s), name }]: the cards' deal sounds, staggered
    this.t = 0;
    this.lastFrac = -1; this.lastLow = null; this.lastRoll = null;
    this.u = 0;
    this.top = null; // (measure)
    this.layout();
    window.addEventListener('resize', () => this.layout());
  }

  /** --u: 1 at 640 x 480-ish, so the cards fill the same share of any screen (n cards across). */
  layout(n = this.cards.length || 3) {
    const W = this.parent.clientWidth || window.innerWidth, H = this.parent.clientHeight || window.innerHeight;
    const across = n * 146 + (n - 1) * 10 + 30;
    const u = Math.max(0.6, Math.min(H / 530, W / across));
    if (Math.abs(u - this.u) > 0.001) { this.u = u; this.root.style.setProperty('--u', `${u.toFixed(3)}px`); }
    this.measure();
  }

  /**
   * Where our top edge is (a share of the view's height; null: nothing up): the draft's, or the
   * synergy card's (where the cards were, or just above them while a draft is up). The centre
   * prints keep above it (perks.js draw).
   */
  measure() {
    const rr = this.root.getBoundingClientRect();
    const frac = (e) => (e && rr.height > 0 ? (e.getBoundingClientRect().top - rr.top) / rr.height : null);
    const dtop = this.draft ? frac(this.draft) : null;
    const t = this.toastEl && !this.toastEl.classList.contains('out') ? this.toastEl : null;
    if (t) t.style.bottom = dtop != null ? `calc(${((1 - dtop) * 100).toFixed(2)}% + ${Math.round(8 * this.u)}px)` : '';
    const ttop = t ? frac(t) : null;
    this.top = dtop == null ? ttop : ttop == null ? dtop : Math.min(dtop, ttop);
  }

  /** Show view (perks.js ZPerks.view). o.reroll: the same offer dealt again (the cards flip back in). */
  show(view, o = {}) {
    if (this.busy > 0) { this.pending = [view, o]; return; }
    this.build(view, o);
  }

  build(view, o) {
    this.clear();
    if (this.toastEl) { this.toastQ = this.toastData; this.toastEl.remove(); this.toastEl = null; } // (a synergy card up: it comes back when the cards go)
    this.visible = true;
    this.layout(view.cards.length);
    const d = el('div', `zp-draft${view.rare ? ' rare' : ''}${view.source === 'trophy' ? ' trophy' : ''}`);
    const head = el('div', 'zp-head');
    head.append(el('div', 'zp-kick', view.kicker), el('div', 'zp-title', view.title));
    const row = el('div', 'zp-cards');
    this.cards = view.cards.map((c, i) => {
      const card = el('div', `zp-card ${c.rarity}${c.curse ? ' curse' : ''}${c.syn.length ? ' syn' : ''}`);
      card.style.setProperty('--c', c.rgb.join(', '));
      card.style.setProperty('--i', String(i));
      card.appendChild(el('div', 'zp-shine'));
      card.appendChild(el('div', 'zp-key', String(c.key)));
      card.appendChild(el('div', 'zp-rar', c.label));
      card.appendChild(iconCanvas('zp-icon', c.icon, 50 * this.u, c.rgb));
      card.appendChild(el('div', 'zp-name', c.name));
      card.appendChild(el('div', 'zp-text', c.curse ? `▲ ${c.text}` : c.text));
      if (c.bane) card.appendChild(el('div', 'zp-bane', `▼ ${c.bane}`));
      const meta = c.syn.length ? el('div', 'zp-meta syn', `+ ${c.syn[0].with} = ${c.syn[0].name}`)
        : el('div', 'zp-meta', c.max > 1 ? `Stacks ${c.have}/${c.max}` : c.squad ? 'Squad aura' : c.tags.join(' · '));
      card.appendChild(meta);
      card.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); this.cb.onPick?.(i); });
      row.appendChild(card);
      return card;
    });
    const foot = el('div', 'zp-foot');
    this.hint = el('div', 'zp-hint');
    const n = view.cards.length;
    this.hint.innerHTML = `<b>${n > 1 ? `1-${n}` : '1'}</b> or click to pick &nbsp;·&nbsp; <span class="zp-left"></span>`;
    this.leftEl = this.hint.querySelector('.zp-left');
    foot.appendChild(this.hint);
    this.roll = null;
    if (view.reroll) {
      this.roll = el('div', 'zp-roll');
      this.roll.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); this.cb.onReroll?.(); });
      foot.appendChild(this.roll);
      this.lastRoll = null;
      this.rerollState(view.reroll);
    }
    const tm = el('div', 'zp-timer');
    this.bar = el('i');
    tm.appendChild(this.bar);
    this.timerEl = tm;
    this.lastFrac = -1; this.lastLow = null; this.lastLeft = null;
    d.append(head, row, foot, tm);
    this.root.appendChild(d);
    this.draft = d;
    this.measure();
    // the deal: a flick per card as it lands
    this.sfx.length = 0;
    for (let i = 0; i < n; i++) this.sfx.push({ at: this.t + (o.reroll ? 0.05 : 0.12) + i * 0.085, name: 'perk_deal' });
  }

  clear() {
    this.draft?.remove();
    this.draft = null;
    this.cards = [];
    this.roll = null;
    this.measure();
  }

  /** Card k was picked: it rises and glows, the others fall away; then the overlay goes (or the next offer is dealt). */
  pick(k) {
    if (!this.draft) return;
    this.cards.forEach((c, i) => c.classList.add(i === k ? 'picked' : 'gone'));
    this.draft.querySelector('.zp-foot')?.remove();
    this.timerEl?.remove();
    this.busy = PICK_T;
    this.pending = 'hide';
  }

  /** Take the overlay down (now: no fade). */
  hide(now = false) {
    this.sfx.length = 0;
    if (now) { this.busy = 0; this.pending = null; this.toastQ = null; this.toastEl?.remove(); this.toastEl = null; this.clear(); this.visible = false; return; }
    if (this.busy > 0) { this.pending = 'hide'; return; }
    if (!this.draft) { this.visible = !!this.toastEl; return; }
    const d = this.draft;
    d.classList.add('out');
    this.draft = null; this.cards = [];
    this.measure();
    window.setTimeout(() => d.remove(), 340);
    this.visible = !!this.toastEl;
  }

  /** Seconds until the wave picks for you (null: no clock), of total. */
  timer(left, total) {
    if (!this.draft || !this.bar) return;
    const f = left == null ? 1 : Math.max(0, Math.min(1, left / total));
    if (Math.abs(f - this.lastFrac) > 0.002) { this.lastFrac = f; this.bar.style.transform = `scaleX(${f.toFixed(3)})`; }
    const low = left != null && left < 4;
    if (low !== this.lastLow) { this.lastLow = low; this.timerEl.classList.toggle('low', low); }
    const s = left == null ? -1 : Math.ceil(left);
    if (s !== this.lastLeft) { this.lastLeft = s; this.leftEl.textContent = s < 0 ? 'take your time' : `random pick in ${s} s`; }
  }

  /** The reroll button: { key, used, free, cost, afford }. */
  rerollState(r) {
    if (!this.roll || !r) return;
    const L = this.lastRoll;
    if (L && L.key === r.key && L.used === r.used && L.free === r.free && L.cost === r.cost && L.afford === r.afford) return; // (as shown)
    this.lastRoll = { key: r.key, used: r.used, free: r.free, cost: r.cost, afford: r.afford };
    const label = r.used ? 'Rerolled' : r.free ? `Reroll · free (${r.free} left)` : `Reroll · $${r.cost}`;
    this.roll.innerHTML = `<b>${r.key}</b>${label}`;
    this.roll.classList.toggle('off', !!r.used);
    this.roll.classList.toggle('poor', !r.used && !r.free && !r.afford);
  }

  /** "SYNERGY UNLOCKED": t { kicker, name, from, text, icon, rgb }. While cards are up it waits for them to go (then shows where they were). */
  toast(t) {
    if (this.draft || this.busy > 0) { this.toastQ = t; return; }
    this.toastEl?.remove();
    this.toastData = t;
    const d = el('div', 'zp-toast');
    d.style.setProperty('--c', t.rgb.join(', '));
    const body = el('div');
    body.append(el('div', 'zp-tk', t.kicker), el('div', 'zp-tn', t.name), el('div', 'zp-tf', t.from), el('div', 'zp-tt', t.text));
    d.append(iconCanvas('zp-ticon', t.icon, 46 * this.u, t.rgb), body);
    this.root.appendChild(d);
    this.toastEl = d;
    this.toastT = 6;
    this.visible = true;
    this.measure();
  }

  /** Per frame: the pick animation, the toast's time, the deal sounds. */
  frame(dt) {
    this.t += dt;
    if (this.sfx.length && this.sfx[0].at <= this.t) { this.cb.sound?.(this.sfx.shift().name); }
    if (this.busy > 0) {
      this.busy -= dt;
      if (this.busy <= 0) {
        this.busy = 0;
        const p = this.pending;
        this.pending = null;
        this.clear();
        this.visible = !!this.toastEl;
        if (p && p !== 'hide') this.build(p[0], p[1]);
      }
    }
    if (this.toastQ && !this.draft && this.busy <= 0) { const q = this.toastQ; this.toastQ = null; this.toast(q); }
    if (this.toastEl) {
      this.toastT -= dt;
      if (this.toastT <= 0.5 && !this.toastEl.classList.contains('out')) { this.toastEl.classList.add('out'); this.measure(); }
      if (this.toastT <= 0) { this.toastEl.remove(); this.toastEl = null; this.visible = !!this.draft; }
    }
  }
}
