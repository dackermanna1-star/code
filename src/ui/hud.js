// Counter-Strike 1.6 HUD, drawn the way the GoldSrc client draws it.
//
// Three stacked canvases over the game viewport:
//   under  normal blending  – sniper scope mask
//   add    mix-blend-mode: plus-lighter – every SPR_DrawAdditive / FillRGBA element
//          (numbers, icons, radar, crosshair, kill-feed weapon icons) is *added*
//          to the 3D image exactly like GoldSrc's additive sprites
//   top    normal blending  – console-font text (kill feed names, chat, centre
//          print, fps, net_graph, spectator bars) and the flashbang white-out
//
// Layout mirrors the CS 1.6 client code (health.cpp, battery.cpp, ammo.cpp,
// hud_timer, money, radar, deathnotice, saytext) using 640-sprite metrics:
// numbers are 20×24 cells, y = ScreenHeight - 1.5 * fontHeight, armor at
// ScreenWidth / 5, ammo at ScreenWidth - 8 * 20 - iconWidth, etc. Sprites are
// drawn 1:1 in screen pixels (as in GoldSrc), with the 320 set below 640 wide
// and a double-size set when the canvas is >= 1440 px tall.

import { digitSprites, layoutNumber, DIGIT_H } from './hud/digits.js';
import { PixelSprite, scaleSprite, makeCanvas } from './hud/pixel.js';
import { engineFontPx, engineLineHeight, spriteScale, fontString } from './hud/font.js';
import { hudSprite, tinted, weaponIcon, ammoSpriteName } from './icons.js';

export const RGB_YELLOWISH = [255, 160, 0];
export const RGB_REDISH = [255, 16, 16];
export const RGB_GREENISH = [0, 160, 0];
export const TEAM_COLORS = { T: [255, 63, 63], CT: [153, 204, 255], SPEC: [204, 204, 204] };
export const CON_COLOR = [255, 180, 30]; // con_color: default HUD text (chat, radio)
const CENTER_COLOR = [255, 255, 255];
const KILL_ICON = [255, 80, 0];
const TEAMKILL_ICON = [10, 240, 10];
const MIN_ALPHA = 100;
const FADE_TIME = 100;
const MAX_DEATHNOTICES = 4;
const DEATHNOTICE_TIME = 6;
const MAX_CHAT_LINES = 5;
const SAYTEXT_TIME = 5; // hud_saytext_time: one line scrolls away every 5 s

const css = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
const teamColor = (t) => TEAM_COLORS[t] || TEAM_COLORS.SPEC;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// cl_crosshair distances per weapon (iDistance), used when the game gives no bar size
const CROSSHAIR_BASE = {
  p228: 8, hegrenade: 8, smokegrenade: 8, fiveseven: 8, usp: 8, glock: 8, awp: 8, flashbang: 8, deagle: 8,
  mp5: 6, m3: 8, g3sg1: 6, ak47: 4, tmp: 7, knife: 7, p90: 7, xm1014: 9, mac10: 9, aug: 3,
  c4: 6, ump45: 6, m249: 6, scout: 5, sg550: 5, sg552: 5, elite: 4, famas: 4, galil: 4, m4a1: 4,
};

const SPEC_MODES = {
  locked: 'Locked Chase Camera', chase: 'Free Chase Camera', free: 'Free Chase Camera',
  roaming: 'Free Look', freelook: 'Free Look', firstperson: 'First Person', 'in-eye': 'First Person',
  map: 'Free Map Overview', death: '',
};

function makeLayer(additive) {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:block;';
  if (additive) {
    const ok = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('mix-blend-mode', 'plus-lighter');
    c.style.mixBlendMode = ok ? 'plus-lighter' : 'screen';
  }
  return c;
}

export class Hud {
  constructor(container) {
    this.container = container;
    // not a stacking context, so the additive layer blends with the game canvas
    this.root = document.createElement('div');
    this.root.className = 'cs-hud';
    this.root.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
    this.cvUnder = makeLayer(false);
    this.cvAdd = makeLayer(true);
    this.cvTop = makeLayer(false);
    this.cvUnder.style.zIndex = '5';
    this.cvAdd.style.zIndex = '6';
    this.cvTop.style.zIndex = '7';
    this.root.append(this.cvUnder, this.cvAdd, this.cvTop);
    container.appendChild(this.root);
    this.canvas = this.cvTop;
    this.gUnder = this.cvUnder.getContext('2d');
    this.gAdd = this.cvAdd.getContext('2d');
    this.gTop = this.cvTop.getContext('2d');

    this.time = 0;
    this.visible = true;
    this.kills = [];
    this.chatLines = [];
    this.chatScroll = 0;
    this.center = null;
    this.delta = null;
    this.blink = { count: 0, t: 0 };
    this.prev = { health: null, armor: null, money: null, weaponId: null };
    this.fade = { health: 0, armor: 0, ammo: 0, money: 0 };
    this.panic = { t: 0, on: false };
    this.pain = { front: 0, back: 0, left: 0, right: 0 };
    this.layers = []; // extra drawing from game-side modules (addLayer)
    this.sized = false;
    this.resize({ x: 0, y: 0, w: container.clientWidth || window.innerWidth, h: container.clientHeight || window.innerHeight });
    this.sized = false;
  }

  // ---------------------------------------------------------------- public API

  /**
   * Game viewport in CSS px. Optional rw/rh (or vw/vh) give the game's internal
   * render resolution (e.g. 640x480 mode): the HUD is then laid out at that
   * resolution and stretched with the 3D image, like the real low-res modes.
   */
  resize({ x = 0, y = 0, w, h, rw, rh, vw, vh } = {}) {
    w = Math.max(1, Math.round(w || 1));
    h = Math.max(1, Math.round(h || 1));
    const VW = Math.max(1, Math.round(vw || rw || w));
    const VH = Math.max(1, Math.round(vh || rh || h));
    this.vp = { x, y, w, h };
    this.vw = VW;
    this.vh = VH;
    Object.assign(this.root.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    for (const c of [this.cvUnder, this.cvAdd, this.cvTop]) {
      if (c.width !== VW) c.width = VW;
      if (c.height !== VH) c.height = VH;
    }
    this.k = spriteScale(VW, VH);
    this.fontPx = engineFontPx(VH);
    this.lineH = engineLineHeight(VH);
    this.font = fontString(this.fontPx);
    this.digits = digitSprites(this.k);
    this.radarDisc = null;
    this.sized = true;
  }

  setVisible(v) {
    this.visible = !!v;
    this.root.style.display = v ? '' : 'none';
  }

  /** Clear kill feed, chat and centre print (e.g. on a new game). */
  reset() {
    this.kills.length = 0;
    this.chatLines.length = 0;
    this.center = null;
    this.delta = null;
  }

  addKill({ attacker = '', attackerTeam = null, victim = '', victimTeam = null, weapon = 'world', headshot = false } = {}) {
    this.kills.push({ attacker: attacker || '', attackerTeam, victim: victim || '', victimTeam, weapon: weapon || 'world', headshot: !!headshot, time: this.time });
    while (this.kills.length > MAX_DEATHNOTICES) this.kills.shift();
  }

  /** Covered in Boomer bile: slimy green blotches over the view (k 0..1). */
  drawBile(T, k) {
    const vw = this.vw, vh = this.vh;
    if (!this.bileBlots) {
      this.bileBlots = [];
      for (let i = 0; i < 26; i++) this.bileBlots.push([Math.random(), Math.random() * 0.9 + 0.05, 0.06 + Math.random() * 0.16, Math.random()]);
    }
    T.fillStyle = css([90, 140, 20], 0.3 * k);
    T.fillRect(0, 0, vw, vh);
    for (const [x, y, r, a] of this.bileBlots) {
      const cx = x * vw, cy = (y + (this.time * 0.01 * a) % 0.1) * vh, rr = r * Math.min(vw, vh);
      const gr = T.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, `rgba(120,170,30,${(0.75 * k).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(90,140,20,0)');
      T.fillStyle = gr;
      T.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    }
  }

  /** A short green wash over the screen: you were patched up (medkit). */
  healFlash() { this.healAt = this.time; }

  centerPrint(text, seconds = 4) {
    this.center = text ? { lines: String(text).split('\n'), until: this.time + seconds } : null;
  }

  chat(name, team, text, { dead = false, teamOnly = false } = {}) {
    const segs = [];
    let prefix = dead ? '*DEAD*' : '';
    if (teamOnly) prefix += team === 'T' ? '(Terrorist) ' : team === 'CT' ? '(Counter-Terrorist) ' : '(Spectator) ';
    else if (dead) prefix += ' ';
    if (prefix) segs.push({ text: prefix, color: CON_COLOR });
    segs.push({ text: String(name), color: teamColor(team) });
    segs.push({ text: ' :  ' + String(text), color: CON_COLOR });
    this._pushChat(segs);
  }

  radio(name, team, text) {
    this._pushChat([
      { text: String(name), color: teamColor(team) },
      { text: ' (RADIO): ' + String(text), color: CON_COLOR },
    ]);
  }

  hint(text) {
    for (const line of String(text).split('\n')) this._pushChat([{ text: line, color: CON_COLOR }]);
  }

  /** Plain chat-area line (server messages such as "Player has joined"). */
  print(text, color = CON_COLOR) {
    this._pushChat([{ text: String(text), color }]);
  }

  /**
   * An extra HUD layer drawn every frame the HUD is up: fn(hud, s, dt) with the primitives
   * (text, spr, fillAdd, gUnder / gAdd / gTop, k, vw, vh...). z < 0: under the stock HUD
   * (screen tints, vignettes); z >= 0: over it, below the kill feed, chat and centre text.
   * Zombie survival features register theirs from their own modules. Returns a remover.
   */
  addLayer(fn, z = 0) {
    const l = { fn, z };
    this.layers.push(l);
    this.layers.sort((a, b) => a.z - b.z);
    return () => { const i = this.layers.indexOf(l); if (i >= 0) this.layers.splice(i, 1); };
  }

  drawLayers(s, dt, under) {
    for (const l of this.layers) if ((l.z < 0) === under) l.fn(this, s, dt);
  }

  moneyDelta(amount) {
    amount = Math.round(amount || 0);
    if (!amount) return;
    this.delta = { amount, t0: this.time };
  }

  /** BlinkAcct: money blinks red (e.g. "You have insufficient funds!"). */
  moneyBlink(times = 2) {
    this.blink = { count: times, t: 0 };
  }

  // ---------------------------------------------------------------- frame

  draw(s, dt = 0) {
    if (!this.sized) {
      const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
      this.resize({ x: 0, y: 0, w, h });
    }
    dt = clamp(dt || 0, 0, 0.25);
    this.time += dt;
    const { gUnder: U, gAdd: A, gTop: T, vw, vh } = this;
    U.clearRect(0, 0, vw, vh);
    A.clearRect(0, 0, vw, vh);
    T.clearRect(0, 0, vw, vh);
    if (!this.visible || !s || s.hidden) return;
    A.globalCompositeOperation = 'lighter';
    A.globalAlpha = 1;
    T.globalAlpha = 1;
    if (this.layers.length) this.drawLayers(s, dt, true);

    const alive = !!s.alive && s.team !== 'SPEC';
    if (alive && s.scope) this.drawScope();
    if (s.nightvision) this.fillAdd(0, 0, vw, vh, [50, 225, 50], 110);
    if (alive) {
      this.drawRadar(s);
      if (!s.scope) this.drawCrosshair(s);
      this.drawPain(s, dt);
      this.drawHealth(s, dt);
      this.drawArmor(s, dt);
      this.drawTimer(s, dt);
      this.drawMoney(s, dt);
      this.drawAmmo(s, dt);
      this.drawStatusIcons(s);
      this.drawFlashlight(s);
    } else {
      this.prev.weaponId = null;
      if (s.spectator) this.drawSpectator(s);
    }
    if (s.zombie) this.drawZombie(s);
    if (this.layers.length) this.drawLayers(s, dt, false);
    this.drawKills();
    this.drawChat();
    this.drawCenter();
    this.drawFps(s);
    if (s.flash > 0) {
      T.fillStyle = css([255, 255, 255], clamp(s.flash, 0, 1));
      T.fillRect(0, 0, vw, vh);
    }
    if (s.bile > 0) this.drawBile(T, s.bile);
    const ha = this.healAt != null ? 0.32 * (1 - (this.time - this.healAt) / 0.7) : 0;
    if (ha > 0) {
      T.fillStyle = css([60, 255, 90], ha);
      T.fillRect(0, 0, vw, vh);
    }
  }

  // ---------------------------------------------------------------- primitives

  // SPR_Set(r,g,b) after ScaleColors(a) + SPR_DrawAdditive
  spr(sprite, x, y, rgb, a = 255) {
    if (a <= 0 || !sprite) return;
    const g = this.gAdd;
    g.globalAlpha = Math.min(1, a / 255);
    g.drawImage(tinted(sprite, rgb), Math.round(x), Math.round(y));
    g.globalAlpha = 1;
  }

  // partial sprite (source rect in sprite pixels of the canvas)
  sprPart(sprite, sx, sy, sw, sh, x, y, rgb, a = 255) {
    if (a <= 0 || sw <= 0 || sh <= 0) return;
    const g = this.gAdd;
    g.globalAlpha = Math.min(1, a / 255);
    g.drawImage(tinted(sprite, rgb), sx, sy, sw, sh, Math.round(x), Math.round(y), sw, sh);
    g.globalAlpha = 1;
  }

  // FillRGBA (additive)
  fillAdd(x, y, w, h, rgb, a = 255) {
    if (a <= 0) return;
    const g = this.gAdd;
    g.globalAlpha = Math.min(1, a / 255);
    g.fillStyle = css(rgb);
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    g.globalAlpha = 1;
  }

  number(n, x, y, cells, rgb, a, drawZero = true) {
    const d = this.digits;
    const cw = 20 * this.k;
    return layoutNumber(n, x, y, cw, { cells, drawZero }, (i, dx, dy) => this.spr(d[i], dx, dy, rgb, a));
  }

  // DrawConsoleString with the engine font's drop shadow; returns end x
  text(str, x, y, rgb, { align = 'left', alpha = 1, g = this.gTop, font = this.font, shadow = null } = {}) {
    g.font = font;
    g.textBaseline = 'top';
    const w = g.measureText(str).width;
    let tx = x;
    if (align === 'center') tx = x - w / 2;
    else if (align === 'right') tx = x - w;
    tx = Math.round(tx);
    const ty = Math.round(y);
    const o = shadow ?? Math.max(1, Math.round(this.fontPx / 14));
    g.globalAlpha = alpha;
    g.fillStyle = 'rgba(0,0,0,0.9)';
    g.fillText(str, tx + o, ty + o);
    g.fillStyle = css(rgb);
    g.fillText(str, tx, ty);
    g.globalAlpha = 1;
    return tx + w;
  }

  textWidth(str) {
    this.gTop.font = this.font;
    return this.gTop.measureText(str).width;
  }

  // ---------------------------------------------------------------- elements

  drawHealth(s, dt) {
    const k = this.k, fh = DIGIT_H * k, dw = 20 * k, crossW = 24 * k;
    const hp = clamp(Math.round(s.health ?? 100), 0, 999);
    if (this.prev.health !== hp) {
      if (this.prev.health !== null) this.fade.health = FADE_TIME;
      this.prev.health = hp;
    }
    let a = MIN_ALPHA;
    if (this.fade.health > 0) {
      this.fade.health = Math.max(0, this.fade.health - dt * 20);
      a = MIN_ALPHA + (this.fade.health / FADE_TIME) * 128;
    }
    if (hp <= 15) a = 255;
    const rgb = hp > 25 ? RGB_YELLOWISH : [250, 0, 0];
    this.healthColor = rgb;
    const y = Math.round(this.vh - fh - fh / 2);
    this.spr(hudSprite('cross', k), crossW / 2, y, rgb, a);
    this.number(hp, crossW + dw / 2, y, 3, rgb, a);
  }

  drawArmor(s, dt) {
    const k = this.k, fh = DIGIT_H * k;
    const ar = clamp(Math.round(s.armor ?? 0), 0, 999);
    if (this.prev.armor !== ar) {
      if (this.prev.armor !== null) this.fade.armor = FADE_TIME;
      this.prev.armor = ar;
    }
    let a = MIN_ALPHA;
    if (this.fade.armor > 0) {
      this.fade.armor = Math.max(0, this.fade.armor - dt * 20);
      a = MIN_ALPHA + (this.fade.armor / FADE_TIME) * 128;
    }
    const rgb = RGB_YELLOWISH;
    const base = s.helmet ? 'suithelmet' : 'suit';
    const empty = hudSprite(base + '_empty', k), full = hudSprite(base + '_full', k);
    const x = Math.floor(this.vw / 5);
    const y = Math.round(this.vh - fh - fh / 2);
    const iOffset = Math.round(empty.height / 6);
    this.spr(empty, x, y - iOffset, rgb, a);
    // the full suit fills up from the bottom with the armor value
    const top = Math.round(full.height * (100 - Math.min(100, ar)) / 100);
    if (top < full.height) this.sprPart(full, 0, top, full.width, full.height - top, x, y - iOffset + top, rgb, a);
    this.number(ar, x + empty.width, y, 3, rgb, a);
  }

  drawTimer(s, dt) {
    if (s.roundTime == null || s.bombPlanted) return;
    const k = this.k, fh = DIGIT_H * k;
    const t = Math.max(0, Math.floor(s.roundTime));
    const minutes = Math.floor(t / 60), seconds = t - minutes * 60;
    let rgb = RGB_YELLOWISH;
    if (t <= 20) {
      this.panic.t += dt;
      if (this.panic.t > seconds / 40 + 0.1) {
        this.panic.t = 0;
        this.panic.on = !this.panic.on;
      }
      rgb = this.panic.on ? RGB_YELLOWISH : RGB_REDISH;
    }
    const a = MIN_ALPHA;
    const cx = Math.floor(this.vw / 2);
    const y = Math.round(this.vh - 1.5 * fh);
    this.spr(hudSprite('stopwatch', k), cx - 64 * k, y, rgb, a);
    this.number(minutes, cx - 36 * k, y, 2, rgb, a);
    const dot = Math.max(2, Math.round(2.5 * k));
    this.fillAdd(cx + 3 * k, y + 10 * k, dot, dot, rgb, a);
    this.fillAdd(cx + 3 * k, y + 19 * k, dot, dot, rgb, a);
    // seconds always two digits
    const d = this.digits, cw = 20 * k;
    this.spr(d[Math.floor(seconds / 10)], cx + 12 * k, y, rgb, a);
    this.spr(d[seconds % 10], cx + 12 * k + cw, y, rgb, a);
  }

  drawMoney(s, dt) {
    if (s.money == null) return;
    const k = this.k;
    const m = clamp(Math.round(s.money), 0, 99999);
    if (this.prev.money !== m) {
      if (this.prev.money !== null) this.fade.money = 5;
      this.prev.money = m;
    }
    this.fade.money = Math.max(0, this.fade.money - dt);
    const interp = (5 - this.fade.money) / 5;
    const alpha = 128 - interp * (128 - MIN_ALPHA);
    const y = Math.round(this.vh - 3 * DIGIT_H * k);
    const xd = this.vw - 134 * k, xn = this.vw - 116 * k;
    const dollar = hudSprite('dollar', k);
    let colors = [[RGB_YELLOWISH, 1]];
    if (this.blink.count > 0) {
      this.blink.t += dt;
      colors = [[this.blink.t > 0.5 ? RGB_REDISH : RGB_YELLOWISH, 1]];
      if (this.blink.t > 1) {
        this.blink.t = 0;
        this.blink.count--;
      }
    } else if (this.delta) {
      const age = this.time - this.delta.t0;
      if (age >= 5) this.delta = null;
      else {
        const di = age / 5;
        const dRgb = this.delta.amount < 0 ? RGB_REDISH : RGB_GREENISH;
        // the balance fades from the delta colour back to yellow
        colors = [[dRgb, 1 - di], [RGB_YELLOWISH, di]];
        const da = 255 - di * 255;
        const yd = Math.round(y - 1.25 * DIGIT_H * k);
        this.spr(hudSprite(this.delta.amount < 0 ? 'minus' : 'plus', k), xd, yd, dRgb, da);
        this.number(Math.abs(this.delta.amount), xn, yd, 5, dRgb, da);
      }
    }
    for (const [rgb, w] of colors) {
      if (w <= 0.001) continue;
      this.spr(dollar, xd, y, rgb, alpha * w);
      this.number(m, xn, y, 5, rgb, alpha * w);
    }
  }

  drawAmmo(s, dt) {
    const k = this.k, fh = DIGIT_H * k, dw = 20 * k;
    if (s.weaponId !== this.prev.weaponId) {
      this.prev.weaponId = s.weaponId;
      this.fade.ammo = 200;
    }
    if (this.fade.ammo > 0) this.fade.ammo = Math.max(0, this.fade.ammo - dt * 20);
    const clip = s.clip, reserve = s.reserve;
    if ((clip == null || clip < 0) && reserve == null) return;
    const a = Math.max(MIN_ALPHA, this.fade.ammo);
    const rgb = RGB_YELLOWISH;
    const icon = hudSprite(ammoSpriteName(s.weaponId) || 'ammo_9mm', k);
    const iw = icon.width;
    const y = Math.round(this.vh - fh - fh / 2);
    let x;
    if (clip != null && clip >= 0) {
      x = this.vw - 8 * dw - iw;
      x = this.number(clip, x, y, 3, rgb, a);
      x += dw / 2;
      this.fillAdd(x, y, Math.max(1, Math.round(dw / 10)), fh, rgb, a);
      x += Math.max(1, Math.round(dw / 10)) + dw / 2;
      x = this.number(reserve ?? 0, x, y, 3, rgb, a);
    } else {
      x = this.vw - 4 * dw - iw;
      x = this.number(reserve ?? 0, x, y, 3, rgb, a);
    }
    this.spr(icon, x, y - Math.round(icon.height / 8), rgb, a);
  }

  drawStatusIcons(s) {
    const k = this.k;
    const icons = [];
    if (s.inBuyZone) icons.push(['buyzone', RGB_GREENISH]);
    if (s.hasC4) {
      const flash = s.inBombZone && Math.floor(this.time * 2) % 2 === 0;
      icons.push(['c4', flash ? RGB_REDISH : RGB_GREENISH]);
    }
    if (s.hasDefuser) icons.push(['defuser', RGB_GREENISH]);
    let y = Math.floor(this.vh / 2);
    const x = 12 * k;
    for (const [name, rgb] of icons) {
      const spr = hudSprite(name, k);
      y -= spr.height + 5 * k;
      this.spr(spr, x, y, rgb, 255);
    }
  }

  drawFlashlight(s) {
    const k = this.k;
    const fl = s.flashlight || { on: false, battery: 1 };
    const bat = clamp(fl.battery ?? 1, 0, 1);
    const a = fl.on ? 225 : MIN_ALPHA;
    const rgb = bat < 0.2 ? RGB_REDISH : RGB_YELLOWISH;
    const w = 32 * k;
    const y = 16 * k;
    const x = this.vw - w - w / 2;
    const empty = hudSprite('flash_empty', k), full = hudSprite('flash_full', k);
    this.spr(empty, x, y, rgb, a);
    if (fl.on) this.spr(hudSprite('flash_beam', k), this.vw - w / 2, y, rgb, a);
    const off = Math.round(full.width * (1 - bat));
    if (off < full.width) this.sprPart(full, off, 0, full.width - off, full.height, x + off, y, rgb, a);
  }

  drawRadar(s) {
    const r = s.radar;
    if (!r) return;
    const k = this.k;
    const size = 128 * k, R = size / 2;
    if (!this.radarDisc || this.radarDisc.k !== k) {
      this.radarDisc = scaleSprite(radarDisc(), k);
      this.radarDisc.k = k;
    }
    this.spr(this.radarDisc, 0, 0, [6, 160, 6], 255);
    const pos = r.pos || [0, 0, 0];
    const yaw = ((r.yaw || 0) * Math.PI) / 180;
    const range = r.range || 1024;
    const scale = (R - 3 * k) / range;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const flashOn = Math.floor(this.time * 4) % 2 === 0;
    for (const b of r.blips || []) {
      if (b.alive === false) continue;
      const dx = b.x - pos[0], dy = b.y - pos[1];
      const right = dx * sy - dy * cy;
      const fwd = dx * cy + dy * sy;
      const px = R + right * scale, py = R - fwd * scale;
      if ((px - R) ** 2 + (py - R) ** 2 > (R - 2 * k) ** 2) continue;
      let rgb = [255, 255, 255], size = 2 * k, show = true;
      switch (b.kind) {
        case 'enemy': rgb = [255, 60, 60]; break;
        case 'bomb': rgb = [255, 16, 16]; size = 3 * k; break;
        case 'bomb_planted': rgb = [255, 16, 16]; size = 4 * k; show = flashOn; break;
        case 'hostage': rgb = [255, 255, 255]; size = 2 * k; break;
        default:
          if (b.bomb || b.carrier) rgb = [255, 16, 16];
          if (b.flash && flashOn) rgb = [255, 16, 16];
          break;
      }
      if (!show) continue;
      const zd = pos.length > 2 && b.z != null ? b.z - pos[2] : 0;
      this.radarDot(px, py, zd, size, rgb);
    }
  }

  // CHudRadar::DrawRadarDot: T above, upside-down T below, square otherwise
  radarDot(x, y, zd, size, rgb) {
    const k = this.k;
    if (Math.abs(zd) > 128) {
      const z = Math.min(3096, Math.abs(zd));
      const bar = Math.floor(z / 400) + 2;
      const u = k;
      this.fillAdd(x - 2 * u, y, 5 * u, u, rgb, 255);
      if (zd > 0) this.fillAdd(x, y, u, bar * u, rgb, 255);
      else this.fillAdd(x, y - bar * u, u, bar * u, rgb, 255);
    } else {
      this.fillAdd(x - size / 2, y - size / 2, size, size, rgb, 255);
    }
  }

  drawCrosshair(s) {
    const ch = s.crosshair;
    if (!ch || ch.visible === false) return;
    const vw = this.vw, vh = this.vh;
    const size = ch.size || 'auto';
    let base;
    if (size === 'small') base = 1024;
    else if (size === 'medium') base = 800;
    else if (size === 'large') base = 640;
    else base = vw < 640 ? 1024 : vw < 1024 ? 800 : 640;
    const iDistance = CROSSHAIR_BASE[s.weaponId] ?? 4;
    let dist = Math.max(ch.gap ?? iDistance, 0);
    let bar = ch.bar ?? Math.floor(Math.max(0, dist - iDistance) * 0.5) + 5;
    if (base !== vw) {
      dist *= vw / base;
      bar = Math.floor((vw * bar) / base);
    }
    dist = Math.floor(dist);
    const color = ch.color || [50, 250, 50];
    const a = clamp(ch.alpha ?? 255, 0, 255);
    const cx = Math.floor(vw / 2), cy = Math.floor(vh / 2);
    const rects = [
      [cx - dist - bar + 1, cy, bar, 1],
      [cx + dist, cy, bar, 1],
      [cx, cy - dist - bar + 1, 1, bar],
      [cx, cy + dist, 1, bar],
    ];
    if (ch.translucent === false) {
      const g = this.gTop;
      g.fillStyle = css(color, a / 255);
      for (const r of rects) g.fillRect(r[0], r[1], r[2], r[3]);
    } else {
      for (const r of rects) this.fillAdd(r[0], r[1], r[2], r[3], color, a);
    }
  }

  drawScope() {
    const g = this.gUnder, vw = this.vw, vh = this.vh;
    const cx = vw / 2, cy = vh / 2, r = vh / 2;
    g.fillStyle = '#000';
    g.fillRect(0, 0, vw, vh);
    g.globalCompositeOperation = 'destination-out';
    const soft = Math.max(1.5, vh / 400);
    const grad = g.createRadialGradient(cx, cy, r - soft * 2, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, Math.floor(cy), vw, 1);
    g.fillRect(Math.floor(cx), 0, 1, vh);
  }

  // pain direction indicators (640_pain.spr) around the centre. Each damage
  // entry's t is its age in seconds; HL starts an indicator at 1 and fades it
  // at 2/s, drawing it while it is above 0.4.
  drawPain(s, dt) {
    for (const d of s.damage || []) {
      if (!d || this.pain[d.dir] === undefined) continue;
      const age = Math.max(0, d.age ?? d.t ?? 0);
      this.pain[d.dir] = Math.max(this.pain[d.dir], 1 - age * 2);
    }
    const k = this.k;
    const cx = this.vw / 2, cy = this.vh / 2;
    const rgb = (s.health ?? 100) > 25 ? RGB_YELLOWISH : [250, 0, 0];
    const fFade = dt * 2;
    if (!this.painSprites || this.painSprites.k !== k) this.painSprites = makePainSprites(k);
    const frames = this.painSprites;
    for (const dir of ['front', 'right', 'back', 'left']) {
      const v = this.pain[dir];
      if (v > 0.4) {
        const spr = frames[dir];
        const sw = spr.width, sh = spr.height;
        let x, y;
        if (dir === 'front') { x = cx - sw / 2; y = cy - sh * 3; }
        else if (dir === 'back') { x = cx - sw / 2; y = cy + sh * 2; }
        else if (dir === 'right') { x = cx + sw * 2; y = cy - sh / 2; }
        else { x = cx - sw * 3; y = cy - sh / 2; }
        this.spr(spr, x, y, rgb, 255 * Math.max(v, 0.5));
        this.pain[dir] = Math.max(0, v - fFade);
      } else this.pain[dir] = 0;
    }
  }

  drawKills() {
    const now = this.time;
    while (this.kills.length && now - this.kills[0].time > DEATHNOTICE_TIME) this.kills.shift();
    if (!this.kills.length) return;
    const k = this.k;
    const step = Math.max(20 * k, this.lineH + 2);
    const margin = Math.round(this.fontPx);
    let y = Math.round((32 * this.vh) / 480) + 2;
    for (const e of this.kills) {
      const icon = weaponIcon(e.weapon, k);
      const hs = e.headshot ? weaponIcon('headshot', k) : null;
      const vwid = this.textWidth(e.victim);
      let x = this.vw - margin - vwid - icon.width - (hs ? hs.width : 0);
      const iy = y + Math.round((this.lineH - icon.height) / 2);
      if (e.attacker) {
        const awid = this.textWidth(e.attacker);
        const gap = Math.round(5 * k + this.fontPx * 0.5);
        x -= gap + awid;
        this.text(e.attacker, x, y, teamColor(e.attackerTeam));
        x += awid + gap;
      }
      const tk = e.attacker && e.attackerTeam && e.attackerTeam === e.victimTeam;
      this.spr(icon, x, iy, tk ? TEAMKILL_ICON : KILL_ICON, 255);
      x += icon.width;
      if (hs) {
        this.spr(hs, x, iy, KILL_ICON, 255);
        x += hs.width;
      }
      this.text(e.victim, x, y, teamColor(e.victimTeam));
      y += step;
    }
  }

  _pushChat(segs) {
    // wrap to MAX_LINE_WIDTH (ScreenWidth - 40)
    const maxW = this.vw - 40 * this.k;
    let line = [], w = 0;
    const out = [];
    for (const seg of segs) {
      const words = seg.text.split(/(\s+)/);
      let cur = '';
      for (const word of words) {
        const ww = this.textWidth(cur + word);
        if (w + ww > maxW && (cur || line.length)) {
          if (cur) line.push({ text: cur, color: seg.color });
          out.push(line);
          line = [];
          w = 0;
          cur = word.trimStart();
        } else cur += word;
      }
      if (cur) {
        line.push({ text: cur, color: seg.color });
        w += this.textWidth(cur);
      }
    }
    if (line.length) out.push(line);
    for (const l of out) {
      if (this.chatLines.length >= MAX_CHAT_LINES) this.chatLines.shift();
      this.chatLines.push(l);
    }
    if (this.chatScroll <= this.time) this.chatScroll = this.time + SAYTEXT_TIME;
  }

  drawChat() {
    if (!this.chatLines.length) return;
    if (this.chatScroll <= this.time) {
      this.chatLines.shift();
      this.chatScroll = this.time + SAYTEXT_TIME;
      if (!this.chatLines.length) return;
    }
    const lh = this.lineH;
    let y = this.vh - 60 * this.k - lh * (MAX_CHAT_LINES + 2);
    const x0 = 10 * this.k;
    for (const line of this.chatLines) {
      let x = x0;
      for (const seg of line) x = this.text(seg.text, x, y, seg.color);
      y += lh;
    }
  }

  drawCenter() {
    if (!this.center) return;
    if (this.time > this.center.until) {
      this.center = null;
      return;
    }
    let y = Math.round(this.vh * 0.35);
    for (const line of this.center.lines) {
      this.text(line, this.vw / 2, y, CENTER_COLOR, { align: 'center' });
      y += this.lineH;
    }
  }

  /** Zombie survival: wave number, zombies left / next-wave countdown, kills and best. */
  drawZombie(s) {
    const z = s.zombie, k = this.k, vw = this.vw;
    const top = s.alive ? 6 * k : Math.round(this.vh * 0.11) + 6 * k; // under the spectator bar
    const px = Math.round(this.fontPx * 1.7);
    this.text(z.wave ? `WAVE ${z.wave}` : 'GET READY', vw / 2, top, [210, 34, 24], { align: 'center', font: fontString(px, true) });
    const info = z.state === 'wave' ? `Zombies left: ${z.left}${z.extras ? ` (+${z.extras})` : ''}` : z.state === 'break' ? `Next wave in ${Math.ceil(z.next ?? 0)}` : 'GAME OVER';
    const y2 = top + Math.round(px * 1.2);
    this.text(`${info}     Kills: ${z.kills}     Best: ${z.best} wave${z.best === 1 ? '' : 's'}`, vw / 2, y2, [255, 176, 0], { align: 'center' });
    // boss health bar
    const b = z.boss;
    if (!b) return;
    const g = this.gTop;
    const w = Math.round(Math.min(vw * 0.5, 420 * k)), h = Math.round(9 * k);
    const x = Math.round(vw / 2 - w / 2), y = y2 + this.lineH + Math.round(4 * k);
    const f = Math.max(0, Math.min(1, b.hp / b.hpMax));
    const col = b.color || [220, 40, 30];
    this.text(b.name + (b.status ? `  -  ${b.status}` : ''), vw / 2, y, col, { align: 'center' });
    const by = y + this.lineH + Math.round(2 * k);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x - 2, by - 2, w + 4, h + 4);
    g.fillStyle = `rgba(${col[0] * 0.35 | 0},${col[1] * 0.35 | 0},${col[2] * 0.35 | 0},0.9)`;
    g.fillRect(x, by, w, h);
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    g.fillRect(x, by, Math.round(w * f), h);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x, by, Math.round(w * f), Math.max(1, Math.round(h * 0.3)));
  }

  drawFps(s) {
    const k = this.k;
    if (s.fps != null) this.text(`${Math.round(s.fps)} fps`, 2 * k, 2 * k, [255, 255, 255]);
    const n = s.netgraph;
    if (n) {
      const fps = n.fps ?? s.fps ?? 0;
      const inSize = Math.round(n.inSize ?? n.inBytes ?? 0), outSize = Math.round(n.outSize ?? n.outBytes ?? 0);
      const inRate = n.inRate ?? (inSize * 100) / 1024, outRate = n.outRate ?? (outSize * 100) / 1024;
      const lines = [
        `${fps.toFixed(1)} fps`,
        `in :  ${inSize} ${inRate.toFixed(2)} k/s`,
        `out:  ${outSize} ${outRate.toFixed(2)} k/s`,
        `loss: ${Math.round(n.loss ?? 0)} choke:  ${Math.round(n.choke ?? 0)}`,
      ];
      // net_graph uses the smaller, non-bold console font
      const px = Math.max(9, Math.round(this.fontPx * 0.8));
      const font = fontString(px, false);
      const lh = Math.round(px * 1.3);
      this.gTop.font = font;
      const maxW = Math.max(...lines.map((l) => this.gTop.measureText(l).width));
      const x = this.vw - maxW - 20 * k;
      let y = this.vh - 24 * k - lh * lines.length;
      for (const l of lines) {
        this.text(l, x, y, [215, 215, 205], { font, shadow: 1 });
        y += lh;
      }
    }
  }

  drawSpectator(s) {
    const sp = s.spectator;
    const g = this.gTop, vw = this.vw, vh = this.vh, k = this.k;
    const barH = Math.round(vh * 0.11);
    g.fillStyle = 'rgba(0,0,0,0.72)';
    g.fillRect(0, 0, vw, barH);
    g.fillRect(0, vh - barH, vw, barH);
    const orange = [255, 176, 0];
    const lh = this.lineH;
    // top bar: team scores left, map + time right
    let ty = Math.round((barH - lh * 2) / 2);
    if (sp.tScore != null || sp.ctScore != null) {
      this.text(`Terrorists :  ${sp.tScore ?? 0}`, 16 * k, ty, TEAM_COLORS.T);
      this.text(`Counter-Terrorists :  ${sp.ctScore ?? 0}`, 16 * k, ty + lh, TEAM_COLORS.CT);
    }
    this.text(`Map: ${sp.map || 'de_dust2'}`, vw - 16 * k, ty, orange, { align: 'right' });
    if (s.roundTime != null && !s.bombPlanted) {
      const t = Math.max(0, Math.floor(s.roundTime));
      this.text(`Time: ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, vw - 16 * k, ty + lh, orange, { align: 'right' });
    }
    // bottom bar: target + camera mode
    const by = vh - barH + Math.round((barH - lh) / 2);
    if (sp.target) {
      const hp = sp.health != null ? ` (${Math.max(0, Math.round(sp.health))})` : '';
      this.text(sp.target + hp, vw / 2, by, teamColor(sp.targetTeam), { align: 'center' });
    }
    const label = SPEC_MODES[sp.mode] ?? (sp.mode || '');
    if (label) this.text(label, vw - 16 * k, by, orange, { align: 'right' });
  }
}

// radar640.spr: translucent 128 px disc
function radarDisc() {
  const N = 128, c = 63.5, r = 63.6;
  const p = new PixelSprite(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d > r + 0.5) continue;
      // radar640.spr has a faint view cone and centre lines; in the Steam
      // 1.6 screenshots they are not visible, so the disc stays uniform
      const v = 84;
      const edge = Math.min(1, r + 0.5 - d);
      p.v[y * N + x] = (v / 255) * (edge < 1 ? 0.7 * edge : 1);
    }
  }
  return p.toCanvas();
}

function makePainSprites(k) {
  const mk = (w, h, draw) => {
    const c = makeCanvas(w * k, h * k);
    const g = c.getContext('2d');
    g.scale(k, k);
    draw(g, w, h);
    return c;
  };
  // soft orange arcs: brightest in the middle, fading at the ends and edges
  const arc = (g, cx, cy, r, a0, a1, th) => {
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const t0 = a0 + ((a1 - a0) * i) / steps, t1 = a0 + ((a1 - a0) * (i + 1)) / steps;
      const m = 1 - Math.abs((i + 0.5) / steps - 0.5) * 2;
      for (let j = 0; j < 3; j++) {
        g.strokeStyle = `rgba(255,255,255,${(0.25 + 0.75 * m) * [0.35, 0.6, 1][j]})`;
        g.lineWidth = th * [1, 0.66, 0.33][j];
        g.beginPath();
        g.arc(cx, cy, r, t0, t1 + 0.01);
        g.stroke();
      }
    }
  };
  const frames = {
    front: mk(128, 32, (g) => arc(g, 64, 140, 126, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42, 9)),
    back: mk(128, 32, (g) => arc(g, 64, -108, 126, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42, 9)),
    right: mk(32, 128, (g) => arc(g, -108, 64, 126, -0.42, 0.42, 9)),
    left: mk(32, 128, (g) => arc(g, 140, 64, 126, Math.PI - 0.42, Math.PI + 0.42, 9)),
  };
  frames.k = k;
  return frames;
}
