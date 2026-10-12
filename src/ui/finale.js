// Episode endings (port of f_finale.c): the text crawl over a tiled flat,
// then DOOM's art screens (HELP2/CREDIT, VICTORY2, the episode 3 bunny
// scroll, ENDPIC), the DOOM II cast call after MAP30, or straight back to
// the game after DOOM II's in-between texts.

import { DoomFont } from './font.js';
import { FINALE_TEXTSPEED as TEXTSPEED, FINALE_TEXTWAIT as TEXTWAIT } from '../game/data.js';
import { CastCall } from './f-cast.js';

const SCREENWIDTH = 320;
const SCREENHEIGHT = 200;
const HU_FONTSTART = 33;
const HU_FONTEND = 95;
// finalecount at which the bunny scroll shows its last "THE END" stage.
const BUNNY_END = 1180 + 6 * 5;

export class Finale {
  constructor(app) {
    this.app = app;
    this.font = new DoomFont(app.res);
    this.cast = new CastCall(app, this.font);
    this.stage = null;
    this.count = 0;
  }

  start(f) {
    const g = this.app.game;
    this.f = f || {};
    this.commercial = !!g.commercial;
    this.text = this.f.text || '';
    this.flat = this.app.res.flatByName.get(String(this.f.flat || '').toUpperCase()) || null;
    this.episode = this.f.episode || g.episode;
    this.castAfter = this.commercial && this.f.afterMap === 30;
    this.stage = 'text';
    this.count = 0;
    this.laststage = 0;
    this.app.audio.playMusic(this.commercial ? 'D_READ_M' : 'D_VICTOR');
  }

  // finalecount at which the whole text has been typed out.
  textEnd() { return 10 + this.text.length * TEXTSPEED; }

  artLump() {
    const f = this.f;
    if (this.app.game.gamemode === 'retail' && f.artUltimate) return f.artUltimate;
    return f.art || null;
  }

  startArt() {
    this.stage = 'art';
    this.count = 0;
    this.laststage = 0;
    this.app.wipe();
    if (this.episode === 3) this.app.audio.playMusic('D_BUNNY');
  }

  startCast() {
    this.stage = 'cast';
    this.count = 0;
    this.app.wipe();
    this.cast.start();
  }

  done() {
    this.stage = 'done';
    this.app.game.finaleDone();
  }

  // A key or button: the first press finishes the text, the next moves on.
  press() {
    switch (this.stage) {
      case 'text':
        if (this.count < 10) return;
        if (this.count < this.textEnd()) { this.count = this.textEnd(); return; }
        if (!this.commercial) this.startArt();
        else if (this.castAfter) this.startCast();
        else this.done();
        break;
      case 'art':
        if (this.f.bunnyScroll && this.count < BUNNY_END) { this.count = BUNNY_END; return; }
        this.done();
        break;
      case 'cast':
        this.cast.responder();
        break;
      default:
        break;
    }
  }

  responder(code, e) {
    if (e && e.repeat) return true;
    this.press();
    return true;
  }

  tick() {
    if (!this.stage || this.stage === 'done') return;
    const inp = this.app.input;
    if (inp && (inp.padPressed('fire') || inp.padPressed('use'))) this.press();
    this.count++;
    if (this.stage === 'cast') {
      this.cast.tick();
      return;
    }
    if (this.commercial) return; // DOOM II waits for a button
    if (this.stage === 'text' && this.count > this.text.length * TEXTSPEED + TEXTWAIT) {
      this.startArt();
    } else if (this.stage === 'art' && this.f.bunnyScroll) {
      // A pistol shot as each letter of "THE END" appears.
      if (this.count < 1180) this.laststage = 0;
      else {
        const stage = Math.min(6, Math.floor((this.count - 1180) / 5));
        if (stage > this.laststage) {
          this.app.audio.ui('pistol');
          this.laststage = stage;
        }
      }
    }
  }

  // --- Drawing ------------------------------------------------------------

  draw(r) {
    switch (this.stage) {
      case 'text': this.drawText(r); break;
      case 'art': this.drawArt(r); break;
      case 'cast': this.cast.draw(r); break;
      case 'done': this.drawArt(r); break;
      default: break;
    }
  }

  // Tiles the 64x64 flat over the whole buffer, aligned to the 4:3 screen.
  tileFlat(r) {
    if (!this.flat) return;
    const sx = r.vScaleX, sy = r.vScaleY;
    const left = -r.vLeft / sx;
    const right = (r.W - r.vLeft) / sx;
    for (let vx = Math.floor(left / 64) * 64; vx < right; vx += 64) {
      for (let vy = 0; vy < SCREENHEIGHT; vy += 64) {
        r.drawImage(this.flat.id, r.vLeft + vx * sx, vy * sy, { scaleX: sx, scaleY: sy });
      }
    }
  }

  // F_TextWrite
  drawText(r) {
    this.tileFlat(r);
    let cx = 10;
    let cy = 10;
    let count = Math.max(0, Math.floor((this.count - 10) / TEXTSPEED));
    const text = this.text;
    for (let i = 0; count > 0 && i < text.length; i++, count--) {
      const ch = text[i];
      if (ch === '\n') {
        cx = 10;
        cy += 11;
        continue;
      }
      const c = ch.toUpperCase().charCodeAt(0);
      const g = c >= HU_FONTSTART && c <= HU_FONTEND ? this.font.glyph(ch) : null;
      if (!g) {
        cx += 4;
        continue;
      }
      if (cx + g.width > SCREENWIDTH) break;
      r.drawPatch(g, cx, cy);
      cx += g.width;
    }
  }

  drawArt(r) {
    if (this.f.bunnyScroll) {
      this.drawBunny(r);
      return;
    }
    const lump = this.artLump();
    if (lump) r.drawPatch(lump, 0, 0);
  }

  // F_BunnyScroll: PFUB2 slides off to the left as PFUB1 comes in.
  drawBunny(r) {
    let scrolled = SCREENWIDTH - Math.trunc((this.count - 230) / 2);
    scrolled = Math.max(0, Math.min(SCREENWIDTH, scrolled));
    r.drawPatch('PFUB2', -scrolled, 0, { noOffset: true });
    r.drawPatch('PFUB1', SCREENWIDTH - scrolled, 0, { noOffset: true });
    // Keep the widescreen margins black.
    const left = Math.ceil(r.vLeft);
    if (left > 0) {
      r.fillRect(0, 0, left, r.H, 0);
      r.fillRect(r.W - left, 0, left, r.H, 0);
    }
    if (this.count < 1130) return;
    const stage = this.count < 1180 ? 0 : Math.min(6, Math.floor((this.count - 1180) / 5));
    r.drawPatch(`END${stage}`, (SCREENWIDTH - 13 * 8) / 2, (SCREENHEIGHT - 8 * 8) / 2);
  }
}
