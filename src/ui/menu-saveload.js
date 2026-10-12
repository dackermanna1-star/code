// Load / Save game menus in the original m_menu.c style: six slots drawn
// with the M_LSLEFT/M_LSCNTR/M_LSRGHT frame, typed save descriptions, and
// the vanilla prompts. Saves live in localStorage (see game/savegame.js).

import { slotSummaries } from '../game/savegame.js';
import { STRINGS } from '../game/data.js';

const SLOTS = 6;
const SAVESTRINGSIZE = 24;
const LINEHEIGHT = 16;

export function buildSaveLoadMenus(menu) {
  const load = { kind: 'saveload', mode: 'load', x: 80, y: 54, lastOn: 0, prev: null };
  const save = { kind: 'saveload', mode: 'save', x: 80, y: 54, lastOn: 0, prev: null };
  return { load, save };
}

function slotText(summary) {
  if (!summary) return STRINGS.EMPTYSTRING || 'empty slot';
  return String(summary.description || summary.mapName).slice(0, SAVESTRINGSIZE);
}

export function openLoadMenu(menu) {
  const app = menu.app;
  menu.slots = slotSummaries(SLOTS);
  menu.saveEdit = null;
  menu.setup(menu.saveload.load);
  if (!menu.slots.some(Boolean)) menu.itemOn = 0;
  return app;
}

export function openSaveMenu(menu) {
  const app = menu.app;
  const g = app.game;
  if (g.state !== 'level' || !g.player || g.player.playerstate !== 'live') {
    menu.startMessage(STRINGS.SAVEDEAD || "you can't save if you aren't playing!\n\npress a key.");
    return;
  }
  menu.slots = slotSummaries(SLOTS);
  menu.saveEdit = null;
  menu.setup(menu.saveload.save);
}

export function saveLoadResponder(menu, m, code, e) {
  const app = menu.app;
  // Typing a description
  if (menu.saveEdit) {
    const ed = menu.saveEdit;
    if (code === 'Escape') {
      menu.saveEdit = null;
      menu.sound('swtchx');
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      const desc = ed.text.trim() || app.game.levelTitle();
      menu.saveEdit = null;
      if (app.saveToSlot(menu.itemOn, desc)) {
        menu.sound('pistol');
        menu.close();
      }
      return true;
    }
    if (code === 'Backspace') {
      ed.text = ed.text.slice(0, -1);
      return true;
    }
    const ch = e && e.key && e.key.length === 1 ? e.key : null;
    if (ch && ch >= ' ' && ch <= '~' && ed.text.length < SAVESTRINGSIZE - 1) {
      // The HUD font only has upper case and common punctuation.
      if (menu.font.glyph(ch) || ch === ' ') ed.text += ch;
    }
    return true;
  }
  switch (code) {
    case 'ArrowDown':
      menu.itemOn = (menu.itemOn + 1) % SLOTS;
      menu.sound('pstop');
      return true;
    case 'ArrowUp':
      menu.itemOn = (menu.itemOn + SLOTS - 1) % SLOTS;
      menu.sound('pstop');
      return true;
    case 'Mouse0': {
      const v = menu.mouseV;
      if (!v) return true;
      const i = Math.floor((v.y - m.y + 2) / LINEHEIGHT);
      if (i < 0 || i >= SLOTS || v.x < m.x - 40 || v.x > m.x + 200) return true;
      menu.itemOn = i;
    }
    // falls through
    case 'Enter':
    case 'NumpadEnter': {
      m.lastOn = menu.itemOn;
      if (m.mode === 'load') {
        if (!menu.slots[menu.itemOn]) {
          menu.sound('oof');
          return true;
        }
        menu.sound('pistol');
        app.loadFromSlot(menu.itemOn);
      } else {
        menu.sound('pistol');
        const existing = menu.slots[menu.itemOn];
        menu.saveEdit = { text: existing ? slotText(existing) : '' };
      }
      return true;
    }
    default:
      return true;
  }
}

export function drawSaveLoad(menu, r, m) {
  r.drawPatch(m.mode === 'load' ? 'M_LOADG' : 'M_SAVEG', 72, 28);
  for (let i = 0; i < SLOTS; i++) {
    const y = m.y + LINEHEIGHT * i;
    // Slot frame (M_DrawSaveLoadBorder)
    let x = m.x;
    r.drawPatch('M_LSLEFT', x - 8, y + 7);
    for (let k = 0; k < 24; k++, x += 8) r.drawPatch('M_LSCNTR', x, y + 7);
    r.drawPatch('M_LSRGHT', x, y + 7);
    let text = slotText(menu.slots && menu.slots[i]);
    if (menu.saveEdit && i === menu.itemOn) {
      text = menu.saveEdit.text + ((menu.clock >> 3) & 1 ? '_' : '');
    }
    menu.font.draw(r, text.toUpperCase(), m.x, y);
  }
  const skull = ['M_SKULL1', 'M_SKULL2'][menu.whichSkull];
  r.drawPatch(skull, m.x - 32, m.y - 5 + menu.itemOn * LINEHEIGHT);
}
