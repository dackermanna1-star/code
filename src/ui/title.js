// Title screen: the D_AdvanceDemo page cycle (TITLEPIC / CREDIT / HELP2)
// without demo playback. Any key brings up the main menu like vanilla.

import { DoomFont } from './font.js';
import { drawText } from './menu-util.js';

const HINT_DELAY = 6 * 35;

export class TitleScreen {
  constructor(app) {
    this.app = app;
    this.font = new DoomFont(app.res);
    this.demosequence = -1;
    this.pagetic = 0;
    this.pagename = 'TITLEPIC';
    this.clock = 0;
  }

  start() {
    const app = this.app;
    app.game.state = 'title';
    if (app.input) {
      app.input.wantLock = false;
      app.input.releaseLock();
    }
    this.demosequence = -1;
    this.clock = 0;
    this.advance();
  }

  get commercial() { return this.app.gamemode === 'commercial'; }

  // D_DoAdvanceDemo with the demo steps (1, 3, 5, 6) skipped.
  advance() {
    const mode = this.app.gamemode;
    const count = mode === 'retail' ? 7 : 6;
    do {
      this.demosequence = (this.demosequence + 1) % count;
    } while (this.demosequence % 2 === 1 || this.demosequence === 6);
    switch (this.demosequence) {
      case 0:
        this.pagetic = this.commercial ? 35 * 11 : 170;
        this.pagename = 'TITLEPIC';
        // The title tune plays once, like D_StartTitle.
        this.app.audio.playMusic(this.commercial ? 'D_DM2TTL' : 'D_INTRO', false);
        break;
      case 2:
        this.pagetic = 200;
        this.pagename = 'CREDIT';
        break;
      case 4:
        if (this.commercial) {
          this.pagetic = 35 * 11;
          this.pagename = 'TITLEPIC';
          this.app.audio.playMusic('D_DM2TTL', false);
        } else {
          this.pagetic = 200;
          this.pagename = mode === 'retail' ? 'CREDIT' : 'HELP2';
        }
        break;
      default: break;
    }
    if (!this.app.res.patch(this.pagename)) this.pagename = 'TITLEPIC';
  }

  // D_PageTicker
  tick() {
    this.clock++;
    if (--this.pagetic < 0) this.advance();
  }

  draw(r) {
    r.fillRect(0, 0, r.W, r.H, 0);
    r.drawPatch(this.pagename, 0, 0);
    if (this.app.menu && this.app.menu.active) return;
    // Subtle hint once the player has watched for a few seconds.
    const t = this.clock - HINT_DELAY;
    if (t <= 0) return;
    const fadeIn = Math.min(1, t / 70);
    const pulse = 0.55 + 0.25 * Math.sin(t * 0.07);
    drawText(r, this.font, 'press any key', 160, 181, { align: 'center', trans: 2, alpha: fadeIn * pulse });
  }

  responder() {
    this.app.menu.open();
    return true;
  }
}
