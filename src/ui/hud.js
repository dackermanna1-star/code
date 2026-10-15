// Status bar (port of st_stuff.c / st_lib.c), heads-up messages and the
// automap level title (hu_stuff.c), plus modern fullscreen and minimal
// overlays drawn with the same original graphics.

import { DoomFont } from './font.js';
import { WP, AM, PW, ANG45, ANG180, normAngle, pointToAngle } from '../game/defs.js';
import { WEAPONINFO } from '../game/tables.js';
import { readyRounds, weaponCfg } from '../game/weapons.js';
import { RNDTABLE } from '../game/data.js';
import { keyName, drawText } from './menu-util.js';
import { CtHud } from './ct-hud.js';

const TICRATE = 35;
const HU_MSGTIMEOUT = 4 * TICRATE;
const SECRET_TEXT = 'A secret is revealed!';

// Face widget (st_stuff.c)
const ST_FACESTRIDE = 8;
const ST_NUMPAINFACES = 5;
const ST_TURNOFFSET = 3;
const ST_OUCHOFFSET = 5;
const ST_EVILGRINOFFSET = 6;
const ST_RAMPAGEOFFSET = 7;
const ST_GODFACE = ST_NUMPAINFACES * ST_FACESTRIDE;
const ST_DEADFACE = ST_GODFACE + 1;
const ST_EVILGRINCOUNT = 2 * TICRATE;
const ST_STRAIGHTFACECOUNT = Math.floor(TICRATE / 2);
const ST_TURNCOUNT = TICRATE;
const ST_RAMPAGEDELAY = 2 * TICRATE;
const ST_MUCHPAIN = 20;

const FACE_NAMES = (() => {
  const out = [];
  for (let i = 0; i < ST_NUMPAINFACES; i++) {
    for (let j = 0; j < 3; j++) out.push(`STFST${i}${j}`);
    out.push(`STFTR${i}0`, `STFTL${i}0`, `STFOUCH${i}`, `STFEVL${i}`, `STFKILL${i}`);
  }
  out.push('STFGOD0', 'STFDEAD0');
  return out;
})();

// Small ammo counters: y position per ammo type (clip, shell, cell, misl).
const AMMO_Y = [173, 179, 191, 185];
const AMMO_ICON = { [AM.CLIP]: 'CLIPA0', [AM.SHELL]: 'SHELA0', [AM.CELL]: 'CELLA0', [AM.MISL]: 'ROCKA0' };
const POWER_LABELS = [
  [PW.INVULNERABILITY, 'invulnerable'], [PW.INVISIBILITY, 'invisible'], [PW.IRONFEET, 'rad suit'], [PW.INFRARED, 'light amp'],
];

const GOLD = { trans: 2 };
const GRAY = { trans: 1 };
const NONE = {};

export class Hud {
  constructor(app) {
    this.app = app;
    this.font = new DoomFont(app.res);
    this.rnd = 0;
    this.clock = 0;
    this.msg = null; // {text, counter, force}
    this.center = null; // {text, counter}
    this.ct = new CtHud(this); // Chinatown's objective HUD
    this.ctInfo = null;
    this.reset();
  }

  // ST_Start / HU_Start
  reset() {
    const p = this.app.game && this.app.game.player;
    this.face = {
      index: 0, count: 0, priority: 0, lastattackdown: -1,
      oldweapons: p ? p.weaponowned.slice() : new Array(9).fill(false),
    };
    this.oldhealth = -1;
    this.painHealth = -1;
    this.painCalc = 0;
    this.msg = null;
    this.center = null;
    this.deadTics = 0;
  }

  get player() {
    const g = this.app.game;
    return g && g.player;
  }

  // App-generated message (always shown, like message_dontfuckwithme).
  message(text, opts = {}) {
    if (!text) return;
    this.msg = { text: String(text), counter: HU_MSGTIMEOUT, force: opts.force !== false };
  }

  // --- Ticker ---------------------------------------------------------------

  tick() {
    const p = this.player;
    this.clock++;
    this.rnd = RNDTABLE[(this.clock) & 0xff];
    if (!p) return;
    this.updateFace(p);
    this.oldhealth = p.health;
    this.deadTics = p.playerstate === 'dead' ? this.deadTics + 1 : 0;

    // HU_Ticker
    if (this.msg && this.msg.counter && !--this.msg.counter) this.msg = null;
    if (this.center && !--this.center.counter) this.center = null;
    if (p.message) {
      const text = String(p.message);
      p.message = null;
      if (text === SECRET_TEXT) {
        this.center = { text, counter: Math.round(2.5 * TICRATE) };
      } else if (this.app.settings.get('messages') && !(this.msg && this.msg.force)) {
        this.msg = { text, counter: HU_MSGTIMEOUT, force: false };
      }
    }
  }

  painOffset(p) {
    const health = p.health > 100 ? 100 : p.health;
    if (health !== this.painHealth) {
      this.painCalc = ST_FACESTRIDE * Math.floor(((100 - health) * ST_NUMPAINFACES) / 101);
      this.painHealth = health;
    }
    return this.painCalc;
  }

  // ST_updateFaceWidget. Priority: dead > evil grin > ouch/turned head >
  // rampage > god > straight ahead. The ouch test uses the corrected
  // (oldhealth - health) comparison so big hits actually show the face.
  updateFace(p) {
    const f = this.face;
    if (f.priority < 10) {
      if (!p.health) {
        f.priority = 9;
        f.index = ST_DEADFACE;
        f.count = 1;
      }
    }
    if (f.priority < 9) {
      if (p.bonuscount) {
        let grin = false;
        for (let i = 0; i < p.weaponowned.length; i++) {
          if (f.oldweapons[i] !== p.weaponowned[i]) {
            grin = true;
            f.oldweapons[i] = p.weaponowned[i];
          }
        }
        if (grin) {
          f.priority = 8;
          f.count = ST_EVILGRINCOUNT;
          f.index = this.painOffset(p) + ST_EVILGRINOFFSET;
        }
      }
    }
    if (f.priority < 8) {
      if (p.damagecount && p.attacker && p.attacker !== p.mo && p.mo) {
        f.priority = 7;
        if (this.oldhealth - p.health > ST_MUCHPAIN) {
          f.priority = 8;
          f.count = ST_TURNCOUNT;
          f.index = this.painOffset(p) + ST_OUCHOFFSET;
        } else {
          const bad = pointToAngle(p.mo.x, p.mo.y, p.attacker.x, p.attacker.y);
          const ang = normAngle(p.mo.angle);
          let diff;
          let right;
          if (bad > ang) {
            diff = bad - ang;
            right = diff > ANG180;
          } else {
            diff = ang - bad;
            right = diff <= ANG180;
          }
          f.count = ST_TURNCOUNT;
          f.index = this.painOffset(p);
          if (diff < ANG45) f.index += ST_RAMPAGEOFFSET;
          else if (right) f.index += ST_TURNOFFSET;
          else f.index += ST_TURNOFFSET + 1;
        }
      }
    }
    if (f.priority < 7) {
      if (p.damagecount) {
        if (this.oldhealth - p.health > ST_MUCHPAIN) {
          f.priority = 7;
          f.count = ST_TURNCOUNT;
          f.index = this.painOffset(p) + ST_OUCHOFFSET;
        } else {
          f.priority = 6;
          f.count = ST_TURNCOUNT;
          f.index = this.painOffset(p) + ST_RAMPAGEOFFSET;
        }
      }
    }
    if (f.priority < 6) {
      if (p.attackdown) {
        if (f.lastattackdown === -1) f.lastattackdown = ST_RAMPAGEDELAY;
        else if (!--f.lastattackdown) {
          f.priority = 5;
          f.index = this.painOffset(p) + ST_RAMPAGEOFFSET;
          f.count = 1;
          f.lastattackdown = 1;
        }
      } else f.lastattackdown = -1;
    }
    if (f.priority < 5) {
      if ((p.cheats & 2) || p.powers[PW.INVULNERABILITY]) {
        f.priority = 4;
        f.index = ST_GODFACE;
        f.count = 1;
      }
    }
    if (!f.count) {
      f.index = this.painOffset(p) + (this.rnd % 3);
      f.count = ST_STRAIGHTFACECOUNT;
      f.priority = 0;
    }
    f.count--;
  }

  // --- Drawing helpers ----------------------------------------------------

  patch(name) { return this.app.res.patch(name); }

  // STlib_drawNum: right-aligned at x, at most `digits` digits.
  drawNum(r, x, y, num, digits, prefix, opts = NONE) {
    const p0 = this.patch(`${prefix}0`);
    if (!p0) return;
    const w = p0.width;
    const neg = num < 0;
    if (neg) {
      if (digits === 2 && num < -9) num = -9;
      else if (digits === 3 && num < -99) num = -99;
      num = -num;
    }
    num = Math.floor(num);
    let cx = x;
    if (!num) r.drawPatch(p0, cx - w, y, opts);
    while (num && digits--) {
      cx -= w;
      r.drawPatch(this.patch(`${prefix}${num % 10}`), cx, y, opts);
      num = Math.floor(num / 10);
    }
    if (neg) r.drawPatch('STTMINUS', cx - 8, y, opts);
  }

  numWidth(num, prefix) {
    const p0 = this.patch(`${prefix}0`);
    if (!p0) return 0;
    return String(Math.max(0, Math.floor(num))).length * p0.width;
  }

  // Left-aligned number; returns the width drawn.
  drawNumLeft(r, x, y, num, prefix, opts = NONE) {
    const w = this.numWidth(num, prefix);
    this.drawNum(r, x + w, y, num, 4, prefix, opts);
    return w;
  }

  // Key box contents like ST_updateWidgets: skulls override cards.
  keyBoxes(p) {
    const out = [];
    for (let i = 0; i < 3; i++) {
      let k = p.cards[i] ? i : -1;
      if (p.cards[i + 3]) k = i + 3;
      out.push(k);
    }
    return out;
  }

  isMagWeapon(p) {
    return !!(weaponCfg(p.readyweapon).mag && p.useMagazines);
  }

  // Big ammo number styling: gold while reloading, blinking when the
  // magazine is dry but reserve remains.
  ammoStyle(p, rounds) {
    if (p.mods && p.mods.reload) return GOLD;
    const type = WEAPONINFO[p.readyweapon].ammo;
    if (this.isMagWeapon(p) && rounds === 0 && type !== AM.NOAMMO && p.ammo[type] > 0) {
      return (this.clock & 8) ? null : NONE;
    }
    return NONE;
  }

  // --- Draw -----------------------------------------------------------------

  draw(r, rect, frac) {
    const p = this.player;
    if (!p) return;
    const mode = this.app.settings.get('hud');
    this.ctInfo = this.ct.info();
    if (this.ctInfo) this.ct.drawFade(r, rect, this.ctInfo);
    if (mode === 'classic') this.drawClassic(r, p);
    else if (mode === 'minimal') this.drawMinimal(r, p);
    else this.drawFullscreen(r, p);
    this.drawText(r, p, rect, mode);
    if (this.ctInfo) this.ct.draw(r, p, rect, mode, this.ctInfo);
  }

  // Edges of the visible screen in virtual coordinates (widescreen aware).
  edges(r) {
    const extra = r.vLeft / r.vScaleX;
    return { left: -extra, right: 320 + extra };
  }

  // Fill the widescreen strip beside the 320-wide bar with the backdrop flat
  // (FLOOR7_2 / GRNROCK) like R_FillBackScreen, with the BRDR_B bevel on top.
  fillBarSides(r) {
    if (r.vLeft <= 0.5) return;
    const commercial = this.app.game.commercial;
    const flat = this.app.res.flatByName.get(commercial ? 'GRNROCK' : 'FLOOR7_2');
    const sx = r.vScaleX, sy = r.vScaleY;
    const { left, right } = this.edges(r);
    if (!flat) {
      r.fillRect(0, 168 * sy, r.vLeft + 1, 32 * sy, 0);
      r.fillRect(r.vLeft + 320 * sx - 1, 168 * sy, r.vLeft + 1, 32 * sy, 0);
      return;
    }
    const tile = (vx) => {
      const bx = r.vLeft + vx * sx;
      // Flats tile from virtual (0,0): rows at y 128 and 192 cross the bar.
      r.drawImage(flat.id, bx, 168 * sy, { scaleX: sx, scaleY: sy, srcX: 0, srcY: 40, srcW: 64, srcH: 24 });
      r.drawImage(flat.id, bx, 192 * sy, { scaleX: sx, scaleY: sy, srcX: 0, srcY: 0, srcW: 64, srcH: 8 });
    };
    for (let vx = Math.floor(left / 64) * 64; vx < 0; vx += 64) tile(vx);
    for (let vx = 320; vx < right; vx += 64) tile(vx);
    const b = this.patch('BRDR_B');
    if (b) {
      for (let vx = Math.floor(left / 8) * 8; vx < 0; vx += 8) r.drawPatch(b, vx, 168);
      for (let vx = 320; vx < right; vx += 8) r.drawPatch(b, vx, 168);
    }
  }

  drawClassic(r, p) {
    this.fillBarSides(r);
    r.drawPatch('STBAR', 0, 168);
    // Single player: the arms panel covers the frags area.
    r.drawPatch('STARMS', 104, 168);

    // Ready weapon ammo (rounds ready to fire; magazine for mag weapons).
    const rounds = readyRounds(p);
    if (Number.isFinite(rounds)) {
      const style = this.ammoStyle(p, rounds);
      if (style) this.drawNum(r, 44, 171, rounds, 3, 'STTNUM', style);
    }

    // Health and armor percentages.
    this.drawNum(r, 90, 171, p.health, 3, 'STTNUM');
    r.drawPatch('STTPRCNT', 90, 171);
    this.drawNum(r, 221, 171, p.armorpoints, 3, 'STTNUM');
    r.drawPatch('STTPRCNT', 221, 171);

    // Weapons owned (slots 2-7).
    for (let i = 0; i < 6; i++) {
      let owned = p.weaponowned[i + 1];
      if (i === 1 && p.weaponowned[WP.SUPERSHOTGUN]) owned = true;
      const name = owned ? `STYSNUM${i + 2}` : `STGNUM${i + 2}`;
      r.drawPatch(name, 111 + (i % 3) * 12, 172 + Math.floor(i / 3) * 10);
    }

    // Face
    r.drawPatch(FACE_NAMES[this.face.index] || FACE_NAMES[0], 143, 168);

    // Keys (Chinatown's key items take the boxes there).
    const keys = this.keyBoxes(p);
    for (let i = 0; i < 3; i++) {
      if (keys[i] >= 0) r.drawPatch(`STKEYS${keys[i]}`, 239, 171 + i * 10);
    }
    if (this.ctInfo) this.ct.drawItemsClassic(r, this.ctInfo);

    // Ammo reserve and maximum per type.
    for (let i = 0; i < 4; i++) {
      this.drawNum(r, 288, AMMO_Y[i], p.ammo[i], 3, 'STYSNUM');
      this.drawNum(r, 314, AMMO_Y[i], p.maxammo[i], 3, 'STYSNUM');
    }
  }

  // Ammo icon, fitted to a maximum height, bottom-aligned; returns width.
  drawIcon(r, name, rightX, bottomY, maxH = 16) {
    const pt = this.patch(name);
    if (!pt) return 0;
    const scale = pt.height > maxH ? maxH / pt.height : 1;
    const w = pt.width * scale;
    r.drawPatch(pt, rightX - w, bottomY - pt.height * scale, { noOffset: true, scale });
    return w;
  }

  drawKeysRow(r, p, rightX, y) {
    const keys = this.keyBoxes(p);
    let x = rightX;
    for (let i = 2; i >= 0; i--) {
      if (keys[i] < 0) continue;
      const pt = this.patch(`STKEYS${keys[i]}`);
      if (!pt) continue;
      x -= pt.width;
      r.drawPatch(pt, x, y + (7 - pt.height), { noOffset: true });
      x -= 2;
    }
    return rightX - x;
  }

  // Ammo readout at the bottom right: "mag / reserve" for magazine weapons.
  drawAmmoRight(r, p, right, bottom, icons) {
    const type = WEAPONINFO[p.readyweapon].ammo;
    if (type === AM.NOAMMO) return 0;
    const y = bottom - 16;
    let x = right;
    if (icons && AMMO_ICON[type]) {
      const iw = this.drawIcon(r, AMMO_ICON[type], x, bottom, 16);
      if (iw) x -= iw + 4;
    }
    const rounds = readyRounds(p);
    if (this.isMagWeapon(p)) {
      const reserve = p.ammo[type];
      x -= this.numWidth(reserve, 'STTNUM');
      this.drawNumLeft(r, x, y, reserve, 'STTNUM', GRAY);
      const slash = this.font.glyph('/');
      if (slash) {
        x -= slash.width + 3;
        r.drawPatch(slash, x, y + 5, { noOffset: true, trans: 1 });
        x -= 3;
      }
      x -= this.numWidth(rounds, 'STTNUM');
      const style = this.ammoStyle(p, rounds);
      if (style) this.drawNumLeft(r, x, y, rounds, 'STTNUM', style);
    } else {
      x -= this.numWidth(rounds, 'STTNUM');
      this.drawNumLeft(r, x, y, rounds, 'STTNUM');
    }
    return right - x;
  }

  drawFullscreen(r, p) {
    const { left, right } = this.edges(r);
    const L = left + 4, R = right - 4, B = 196;
    // Face, health, armor at the bottom left.
    const face = this.patch(FACE_NAMES[this.face.index] || FACE_NAMES[0]);
    let x = L;
    if (face) {
      r.drawPatch(face, x - 5, B - 31, {});
      x += 26;
    }
    x += this.drawNumLeft(r, x, B - 16, p.health, 'STTNUM');
    r.drawPatch('STTPRCNT', x, B - 16);
    x += 14 + 10;
    const armorIcon = p.armortype === 2 ? 'ARM2A0' : 'ARM1A0';
    const aw = this.drawIcon(r, armorIcon, x + 31, B, 17);
    x += aw ? aw + 2 : 0;
    x += this.drawNumLeft(r, x, B - 16, p.armorpoints, 'STTNUM', p.armorpoints ? NONE : GRAY);
    r.drawPatch('STTPRCNT', x, B - 16, p.armorpoints ? NONE : GRAY);

    // Ammo bottom right, keys above it, then Chinatown's key items.
    this.drawAmmoRight(r, p, R, B, true);
    const kw = this.drawKeysRow(r, p, R, B - 27);
    let y = B - 27 - (kw > 0 ? 11 : 2) - 8;
    if (this.ctInfo) {
      const ih = this.ct.drawItemsRow(r, this.ctInfo, R, y + 7);
      if (ih) y -= ih + 3;
    }

    // Power-up timers, right aligned above the keys.
    for (const [pw, label] of POWER_LABELS) {
      const t = p.powers[pw];
      if (!t) continue;
      const secs = Math.ceil(t / TICRATE);
      const warn = t < 4 * 32 && (t & 8);
      drawText(r, this.font, `${label} ${secs}`, R, y, { align: 'right', trans: warn ? 8 : 2 });
      y -= 9;
    }
  }

  drawMinimal(r, p) {
    const { left, right } = this.edges(r);
    const L = left + 4, R = right - 4, B = 196;
    let x = L;
    x += this.drawNumLeft(r, x, B - 16, p.health, 'STTNUM');
    r.drawPatch('STTPRCNT', x, B - 16);
    x += 14 + 10;
    x += this.drawNumLeft(r, x, B - 16, p.armorpoints, 'STTNUM', GRAY);
    r.drawPatch('STTPRCNT', x, B - 16, GRAY);
    this.drawAmmoRight(r, p, R, B, false);
    const kw = this.drawKeysRow(r, p, R, B - 27);
    if (this.ctInfo) this.ct.drawItemsRow(r, this.ctInfo, R, B - 27 - (kw > 0 ? 11 : 2) - 1);
  }

  // Messages, automap title, centred notices and the death hint.
  drawText(r, p, rect, mode) {
    const { left } = this.edges(r);
    const font = this.font;
    const x = left + (r.vLeft > 0 ? 2 : 0);
    // Under Chinatown's objective line when there is one.
    if (this.msg) drawText(r, font, this.msg.text, x, this.ctInfo && this.ctInfo.objective ? 11 : 0);

    // Automap level title (HU_TITLEX/Y), above the bar or the HUD numbers.
    const am = this.app.automap;
    if (am && am.active) {
      const g = this.app.game;
      const title = g.levelTitle ? g.levelTitle() : g.mapName();
      drawText(r, font, title, x, mode === 'classic' ? 167 - 7 : 196 - 16 - 12);
    }

    const viewBottom = rect.h / r.vScaleY;
    if (this.center) {
      const a = Math.min(1, this.center.counter / 12);
      drawText(r, font, this.center.text, 160, Math.round(viewBottom * 0.3), { align: 'center', trans: 2, alpha: a });
    }

    if (p.playerstate === 'dead' && this.deadTics > TICRATE) {
      const keys = this.app.settings.get('binds').use || [];
      const name = keys.length ? keyName(keys[0]).toLowerCase() : 'use';
      const t = (this.deadTics - TICRATE) / TICRATE;
      const alpha = Math.min(1, t) * (0.65 + 0.35 * Math.sin(this.clock * 0.12));
      const y = Math.round(viewBottom - (mode === 'classic' ? 14 : 34));
      drawText(r, font, `press ${name} to restart`, 160, y, { align: 'center', trans: 1, alpha });
    }
  }
}
