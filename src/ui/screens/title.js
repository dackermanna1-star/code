// Title screen (TECH §16): title_bg CG, the decayed HALLOWELL logotype, "the things left behind",
// "Press any key" (unlocks audio), then New Game / Continue / Load / Settings / Credits.
// Resolves { action: 'new' } | { action: 'load', slot }.
// New Game asks first when an autosave exists (its first checkpoint replaces it; slots 1-3 are kept).
// A footer line says when this browser isn't keeping saves (HW.storage.persistent === false) or when
// the last Continue / Load failed (HW.game.loadError).
import { HW } from '../../engine/hw.js';
import { Screen, Z_TOP } from '../screen.js';
import { C, F, W, H } from '../theme.js';
import { font } from '../text.js';
import { FONT } from '../fonts.js';
import { rect, triangle, vignette, canvas, ctx2d, dither, AP, clamp, ease, snap } from '../gfx.js';
import { logo } from '../logo.js';
import { spaced } from '../widgets.js';
import * as svc from '../services.js';

/** Endings gallery: each variant replays one ending's epilogue from a prepared state (engine/game.js endingGallery). */
export const ENDING_GALLERY = [
  { id: 'e_dismissed', label: 'Dismissed', variant: 'dismissed' },
  { id: 'e_dismissed_m', label: 'Dismissed — form kept', variant: 'dismissed_form' },
  { id: 'e_withdrawn3', label: 'Withdrawn — all three', variant: 'withdrawn_3' },
  { id: 'e_withdrawn1', label: 'Withdrawn — Leah only', variant: 'withdrawn_1' },
  { id: 'e_withdrawn0', label: 'Withdrawn — alone', variant: 'withdrawn_0' },
  { id: 'e_present', label: 'Present', variant: 'present' },
  { id: 'e_truant', label: 'Truant', variant: 'truant' },
];
/** The gallery is on in the endings build, and in the game once any ending has been seen. */
function galleryOpen() {
  if (globalThis.__HW_GALLERY__ === true) return true;
  try { return !!globalThis.localStorage?.getItem('hallowell.endingSeen'); } catch { return false; }
}

export class TitleScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.z = Z_TOP;
    this.fadeIn = 1.2; this.fadeOut = 1.1;
    this.phase = 'press';
    this.sel = 0;
    this.bg = canvas(480, 270);
    this.menuT = 0;
    this.busy = false;
    // A Continue / Load that just failed comes back to the menu with a word about it.
    this.loadError = HW.game?.loadError || null;
    if (HW.game) HW.game.loadError = null;
    if (this.loadError) { this.phase = 'menu'; this.menuT = 0; }
    this._buildItems();
  }
  _buildItems() {
    const latest = svc.latestSave();
    this.items = [
      { id: 'new', label: 'New Game' },
      latest ? { id: 'continue', label: 'Continue', slot: latest } : null,
      { id: 'load', label: 'Load', disabled: !svc.anySave() },
      { id: 'settings', label: 'Settings' },
      { id: 'credits', label: 'Credits' },
      galleryOpen() ? { id: 'endings', label: 'Endings' } : null,
    ].filter(Boolean);
    this.sub = null;
    if (latest && this.sel === 0) this.sel = 1;
  }

  async _activate(it) {
    if (it.disabled) { svc.sfx('door_locked', { vol: 0.4 }); return; }
    svc.sfx('ui_confirm');
    if (it.id === 'new') {
      const auto = svc.saveSummary('auto');
      if (auto) {
        this.busy = true;
        const nb = (x) => String(x).replace(/ /g, '\u00a0'); // keep "V — Upstairs" on one line
        const ok = await this.open('confirm', {
          text: `Start a new game?\nYour autosave (${nb(auto.chapterTitle || 'in progress')}, ${svc.fmtTime(auto.playtime || 0)}) will be replaced. Saves in slots 1-3 are kept.`,
          yes: 'New Game', no: 'Cancel', danger: true,
        });
        this.busy = false;
        if (!ok) return;
      }
      this.close({ action: 'new' });
    } else if (it.id === 'continue') this.close({ action: 'load', slot: it.slot });
    else if (it.id === 'load') {
      this.busy = true;
      const slot = await this.open('saveload', { mode: 'load', fromTitle: true });
      this.busy = false;
      if (slot) this.close({ action: 'load', slot });
    } else if (it.id === 'settings') { this.busy = true; await this.open('settings'); this.busy = false; }
    else if (it.id === 'credits') { this.busy = true; await this.open('credits'); this.busy = false; }
    else if (it.id === 'endings') { this.sub = this.items; this.items = [...ENDING_GALLERY, { id: 'back', label: 'Back' }]; this.sel = 0; this.menuT = 0; }
    else if (it.id === 'back') { this._buildItems(); this.sel = this.items.findIndex((x) => x.id === 'endings'); }
    else if (it.variant) this.close({ action: 'ending', variant: it.variant });
  }

  update(dt, input) {
    if (this.phase === 'menu') this.menuT += dt;
    this._thunder();
    if (!input || this.busy || this.closing) return;
    if (this.phase === 'press') {
      if (this.t > 0.6 && input.anyPressed()) {
        try { HW.audio?.unlock?.(); HW.audio?.music?.('title'); } catch (e) { svc.warnOnce('title.unlock', e); }
        svc.sfx('ui_confirm');
        this.phase = 'menu'; this.menuT = 0;
        this._buildItems();
      }
      return;
    }
    const n = this.items.length;
    if (input.repeat('up')) { this.sel = (this.sel + n - 1) % n; svc.sfx('ui_move'); }
    if (input.repeat('down')) { this.sel = (this.sel + 1) % n; svc.sfx('ui_move'); }
    if (input.pressed('confirm')) this._activate(this.items[this.sel]);
    else if (input.pressed('cancel') && this.sub) { svc.sfx('ui_cancel'); this._activate({ id: 'back' }); }
    else if (input.pressed('cancel')) { this.phase = 'press'; svc.sfx('ui_cancel'); }
  }

  /**
   * Thunder follows the backdrop's own lightning: on each strike's rising edge
   * (title_bg.lightning(t) — the same clock the CG draws with) a roll a beat later.
   */
  _thunder() {
    let lt = 0;
    try { lt = Number(svc.cgArt('title_bg')?.lightning?.(this.t)) || 0; } catch (e) { svc.warnOnce('title.lightning', e); }
    if (lt >= 0.5 && this._ltArmed !== false) {
      this._ltArmed = false;
      if (!this.closing) svc.sfx('thunder', { vol: 0.6, delay: 0.45 + Math.random() * 0.6 });
    } else if (lt < 0.05) this._ltArmed = true;
  }

  render(ctx) {
    // backdrop CG (480×270, ×2)
    const bx = ctx2d(this.bg);
    bx.setTransform(1, 0, 0, 1, 0, 0); bx.globalAlpha = 1; bx.globalCompositeOperation = 'source-over';
    rect(bx, 0, 0, 480, 270, '#05060a');
    try { svc.cgArt('title_bg')?.draw?.(bx, this.t, {}); } catch (e) { svc.warnOnce('title_bg', e); }
    ctx.drawImage(this.bg, 0, 0, W, H);
    vignette(ctx, 0.7, 0.7);
    dither(ctx, 0, 300, W, 240, 'rgba(3,4,7,0.9)', 0.25 + 0.25 * ease.out(clamp(this.menuT / 0.6)) * (this.phase === 'menu' ? 1 : 0));

    // logotype: fades up slowly; draws at 2× (art pixels)
    const L = logo();
    const la = ease.inOut(clamp((this.t - 0.3) / 2.2));
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * la;
    const lx = snap(W / 2 - L.w), ly = 92;
    ctx.drawImage(L.canvas, lx, ly, L.w * 2, L.h * 2);
    const sub = font({ family: FONT.typed, size: 20, lineHeight: 26, tracking: 3, threshold: 0.42 });
    ctx.globalAlpha = a0 * ease.inOut(clamp((this.t - 1.6) / 1.6));
    sub.draw(ctx, 'the things left behind', W / 2, ly + L.h * 2 + 6, '#a39a84', { align: 'center' });
    ctx.globalAlpha = a0;

    const fs = F.small;
    if (this.phase === 'press') {
      const k = clamp((this.t - 2.2) / 0.8);
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.t * 1.3));
      ctx.globalAlpha = a0 * k * pulse;
      fs.draw(ctx, spaced('Press any key'), W / 2, 404, '#cfc6ab', { align: 'center' });
      ctx.globalAlpha = a0;
    } else {
      // the endings list is longer: tighter rows, ending above the footer
      const step = this.sub ? 25 : 34, top = this.sub ? 466 - (this.items.length - 1) * step : 330;
      this.items.forEach((it, i) => {
        const k = ease.out(clamp((this.menuT - i * 0.05) / 0.3));
        if (k <= 0) return;
        ctx.globalAlpha = a0 * k;
        const y = top + i * step;
        const sel = i === this.sel;
        const label = spaced(it.label);
        const col = it.disabled ? '#4d4b50' : sel ? '#f0e6cc' : '#8a8478';
        fs.draw(ctx, label, W / 2, y, col, { align: 'center' });
        if (sel) {
          const w = fs.width(label);
          const nudge = Math.floor(this.t * 2.5) % 2 ? AP : 0;
          triangle(ctx, snap(W / 2 - w / 2 - 28 + nudge), y + 3, 5, C.red, 'right');
          rect(ctx, snap(W / 2 - w / 2), y + 22, snap(w), AP, 'rgba(200,66,59,0.6)');
        }
      });
      ctx.globalAlpha = a0;
    }
    // footer — or, in its place, why saves won't work (a failed load says so at once)
    const note = this._notice();
    ctx.globalAlpha = a0 * (note && this.loadError ? 1 : ease.out(clamp((this.t - 2.5) / 1)));
    if (note) fs.draw(ctx, note, W / 2, H - 34, '#b0544c', { align: 'center' });
    else fs.draw(ctx, 'KETTLE RUN, PA  ·  OCTOBER 18, 1996', W / 2, H - 34, '#4f4c50', { align: 'center' });
    ctx.globalAlpha = a0;
  }

  _notice() {
    if (this.loadError && this.t < 8) return "That save couldn't be loaded.";
    if (HW.storage && HW.storage.persistent === false) return 'This browser is blocking storage: saves last only until the page closes.';
    return null;
  }
}
