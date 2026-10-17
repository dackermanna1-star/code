// Pause menu: Resume, Items, Sketchbook, Settings, Save, Load, Quit to Title — beside a status
// card (chapter, where you are, objective in Tess's pencil, who's with you, time).
import { HW } from '../../engine/hw.js';
import { Screen } from '../screen.js';
import { C, F, CHAPTERS, handFont } from '../theme.js';
import { steelPanel, rect, dither, paperSheet, AP, clamp, ease, snap } from '../gfx.js';
import { headerTab, hints, optionList, spaced } from '../widgets.js';
import * as svc from '../services.js';

/** Map name + current room name for status lines. */
export function whereAmI() {
  let map = '', room = '';
  try {
    const id = HW.map?.id || svc.state().map;
    const maps = HW.data?.maps;
    const def = HW.map?.data || (maps && (Array.isArray(maps) ? maps.find((m) => m.id === id) : maps[id]));
    map = def?.name || '';
    const p = HW.player;
    if (p && HW.map?.roomAt) room = HW.map.roomAt(p.x, p.y)?.name || '';
  } catch { /* stubs */ }
  return { map, room };
}

/** Close every game-pausing menu (before using an item, loading, quitting). */
export function closeMenus(ui) { for (const s of ui.screens) if (s.pausesGame && !s.closing) s.close(null); }

export class PauseScreen extends Screen {
  constructor(ui, args) {
    super(ui, args);
    this.pausesGame = true; this.singleton = true;
    this.dimWorld = 0.66;
    this.sel = 0; this.busy = false;
  }
  onOpen() { svc.sfx('ui_open'); }
  get items() {
    const canSave = svc.canSave();
    return [
      { id: 'resume', label: 'Resume' }, { id: 'items', label: 'Items' }, { id: 'sketchbook', label: 'Sketchbook' },
      { id: 'settings', label: 'Settings' }, { id: 'save', label: 'Save', disabled: !canSave }, { id: 'load', label: 'Load', disabled: !svc.anySave() },
      { id: 'quit', label: 'Quit to Title' },
    ];
  }
  async _do(it) {
    if (it.disabled) { svc.sfx('door_locked', { vol: 0.4 }); return; }
    svc.sfx('ui_confirm');
    this.busy = true;
    try {
      if (it.id === 'resume') this.close(null);
      else if (it.id === 'items') await this.open('inventory');
      else if (it.id === 'sketchbook') await this.open('sketchbook');
      else if (it.id === 'settings') await this.open('settings');
      else if (it.id === 'save') await this.open('saveload', { mode: 'save' });
      else if (it.id === 'load') await this.open('saveload', { mode: 'load' });
      else if (it.id === 'quit') {
        const yes = await this.open('confirm', { text: 'Quit to the title screen? Anything since your last save will be lost.', yes: 'Quit', no: 'Stay', danger: true });
        if (yes) {
          this.ui.reset();
          const g = HW.game;
          if (g?.quitToTitle) g.quitToTitle(); else if (g?.toTitle) g.toTitle(); else this.ui.title();
        }
      }
    } finally { this.busy = false; }
  }
  update(dt, input) {
    if (!input || this.busy) return;
    const items = this.items;
    if (input.repeat('up')) { this.sel = (this.sel + items.length - 1) % items.length; svc.sfx('ui_move'); }
    if (input.repeat('down')) { this.sel = (this.sel + 1) % items.length; svc.sfx('ui_move'); }
    if (input.pressed('confirm')) this._do(items[this.sel]);
    else if (input.pressed('cancel') || input.pressed('pause')) { svc.sfx('ui_close'); this.close(null); }
    else if (input.pressed('inventory')) this._do(items[1]);
    else if (input.pressed('sketchbook')) this._do(items[2]);
  }
  render(ctx) {
    const k = ease.out(clamp(this.t / 0.2));
    const slide = snap((1 - k) * -24);
    // menu panel
    const px = 48 + slide, py = 64, pw = 320, ph = 412;
    steelPanel(ctx, px, py, pw, ph, { fill: 'rgba(10,11,14,0.95)', rivets: true, seed: 11 });
    headerTab(ctx, px + 20, py - 16, 'Paused');
    const items = this.items;
    optionList(ctx, items, this.sel, px + 10, py + 34, { width: pw - 20, rowH: 50, t: this.t });
    const cur = items[this.sel];
    if (cur.disabled) F.small.draw(ctx, cur.id === 'save' ? 'Not now. Somewhere quiet.' : 'Nothing saved yet.', px + 50, py + 34 + this.sel * 50 + 40, C.red);
    // status card
    this._status(ctx, 400 - slide, 64);
    hints(ctx, [['BACK', this.ui.input.keyLabel('cancel')], ['SELECT', this.ui.input.keyLabel('confirm')]]);
  }
  _status(ctx, x, y) {
    const w = 512, h = 412;
    const s = svc.state();
    dither(ctx, x + 10, y + 10, w, h, 'rgba(0,0,0,1)', 0.5);
    ctx.drawImage(paperSheet(w, h, { seed: 'pausecard', stains: 1, tone: '#d9cfae' }), x, y);
    // paperclip
    rect(ctx, x + 30, y - 12, 12, 40, '#8d8c90'); rect(ctx, x + 34, y - 8, 4, 32, '#d9cfae');
    rect(ctx, x + 30, y - 12, 12, AP, '#c9c8cc');
    const ch = s.chapter | 0;
    const [num, name] = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, ch))];
    F.typedS.draw(ctx, num === 'PROLOGUE' || num === 'EPILOGUE' ? num : `CHAPTER ${num}`, x + 60, y + 26, '#5a5450');
    F.typedL.draw(ctx, name || num, x + 60, y + 48, '#1e1d22');
    const { map, room } = whereAmI();
    F.typedS.draw(ctx, [map, room].filter(Boolean).join(' — ') || 'Hallowell Consolidated School', x + 60, y + 92, '#3e3b3c');
    rect(ctx, x + 60, y + 120, w - 120, AP, C.red);
    // objective in pencil
    F.small.draw(ctx, spaced('Objective'), x + 60, y + 132, '#6a6466');
    const hf = handFont('tess');
    const lines = hf.font.wrap(s.objective || '...', w - 120).slice(0, 5);
    lines.forEach((l, i) => hf.font.draw(ctx, l, x + 60, y + 156 + i * 32 - 6, hf.color));
    // who's with Tess
    const party = (s.party || []).filter((id) => svc.chars()[id]);
    const by = y + h - 104;
    F.small.draw(ctx, spaced('With'), x + 60, by, '#6a6466');
    if (!party.length) hf.font.draw(ctx, 'Nobody.', x + 60, by + 20, hf.color);
    party.slice(0, 3).forEach((id, i) => {
      const p = svc.portrait(id, 'neutral', {});
      const bx = x + 60 + i * 150, byy = by + 24;
      rect(ctx, bx - AP, byy - AP, 60, 60, '#1a1a1e');
      if (p) ctx.drawImage(p, 22, 12, 56, 56, bx + AP, byy + AP, 52, 52);
      F.typedS.draw(ctx, svc.chars()[id].name, bx + 66, byy + 16, '#2a2a2e');
    });
    F.typedS.draw(ctx, `TIME ${svc.fmtTime(s.playtime)}`, x + w - 40, by, '#5a5450', { align: 'right' });
  }
}
