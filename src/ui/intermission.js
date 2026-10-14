// Single-player intermission (port of wi_stuff.c): the stats count-up over the
// episode map (or INTERPIC), then the "you are here" pointer on the next
// level before moving on. Coordinates are the original 320x200 ones.

import { INTERMISSION, RNDTABLE } from '../game/data.js';
import { TICRATE } from '../game/defs.js';
import { customMapDef } from '../game/ct/maps.js';
import { DoomFont } from './font.js';

const SCREENWIDTH = 320;
const SCREENHEIGHT = 200;
const WI_TITLEY = 2;
const SP_STATSX = 50;
const SP_STATSY = 50;
const SP_TIMEX = 16;
const SP_TIMEY = SCREENHEIGHT - 32;
const SHOWNEXTLOCDELAY = 4;

const ST_STATCOUNT = 0;
const ST_SHOWNEXTLOC = 1;
const ST_NOSTATE = 2;
const ST_DONE = 3;

// Keys that work like BT_ATTACK / BT_USE for skipping.
const SKIP_CODES = new Set(['Enter', 'NumpadEnter', 'Space', 'Mouse0', 'Mouse1', 'Mouse2']);

export class Intermission {
  constructor(app) {
    this.app = app;
    this.state = ST_DONE;
    this.stats = null;
    this.rndindex = 0;
  }

  // m_random.c M_Random: the menu/UI random stream.
  mRandom() {
    this.rndindex = (this.rndindex + 1) & 0xff;
    return RNDTABLE[this.rndindex];
  }

  patch(name) { return this.app.res.patch(name); }

  start(stats) {
    const g = this.app.game;
    this.stats = stats;
    this.commercial = !!g.commercial;
    // A stand-alone map (Chinatown): its own background and title, no
    // episode map, and no next level (the stats stay up until the finale).
    this.custom = stats.custom ? customMapDef(stats.mapName) : null;
    // wbstartstruct_t: 0-based episode and map numbers.
    this.epsd = this.commercial ? 0 : stats.episode - 1;
    this.last = stats.map - 1;
    this.next = stats.next ? stats.next.map - 1 : -1;
    // G_DoCompleted marks the secret level as done when leaving ExM9.
    const p = g.player;
    if (!this.commercial && stats.map === 9 && p) p.didsecret = true;
    this.didsecret = !!(p && p.didsecret);
    this.maxkills = stats.totalKills || 1;
    this.maxitems = stats.totalItems || 1;
    this.maxsecret = stats.totalSecrets || 1;
    this.acceleratestage = 0;
    this.cnt = 0;
    this.bcnt = 0;
    this.pointerOn = false;
    this.loadData();
    this.initStats();
  }

  loadData() {
    const P = (n) => this.patch(n);
    if (this.custom) {
      const c = this.custom;
      this.lnameLast = c.menuPatch ? P(c.menuPatch) : null;
      this.lnameNext = null;
      this.titleText = this.lnameLast ? null : c.title;
      if (!this.font) this.font = new DoomFont(this.app.res);
    } else if (this.commercial) {
      const name = (m) => (m >= 0 ? P(`CWILV${String(m).padStart(2, '0')}`) : null);
      this.lnameLast = name(this.last);
      this.lnameNext = name(this.next);
    } else {
      const name = (m) => (m >= 0 && m < 9 ? P(`WILV${this.epsd}${m}`) : null);
      this.lnameLast = name(this.last);
      this.lnameNext = name(this.next);
      this.yah = [P('WIURH0'), P('WIURH1')];
      this.splat = [P('WISPLAT'), null];
    }
    // Episode 4 of Ultimate DOOM has no map: Chocolate uses INTERPIC.
    if (this.custom) this.background = (this.custom.interpic || []).map(P).find(Boolean) || null;
    else this.background = this.commercial || this.epsd > 2 ? P('INTERPIC') : P(`WIMAP${this.epsd}`);
    this.anims = [];
    if (!this.custom && !this.commercial && this.epsd <= 2) {
      const defs = INTERMISSION.anims[this.epsd] || [];
      defs.forEach((d, j) => {
        const a = { ...d, ctr: -1, nexttic: 0, p: [] };
        for (let i = 0; i < d.nanims; i++) {
          // "MONDO HACK": episode 2 anim 8 reuses anim 4's patches.
          const src = d.patchesFrom != null ? d.patchesFrom : j;
          a.p[i] = P(`WIA${this.epsd}${String(src).padStart(2, '0')}${String(i).padStart(2, '0')}`);
        }
        this.anims.push(a);
      });
    }
    this.num = [];
    for (let i = 0; i < 10; i++) this.num[i] = P(`WINUM${i}`);
    this.wiminus = P('WIMINUS');
    this.percent = P('WIPCNT');
    this.finished = P('WIF');
    this.entering = P('WIENTER');
    this.kills = P('WIOSTK');
    this.items = P('WIOSTI');
    this.spSecret = P('WISCRT2') || P('WIOSTS');
    this.colon = P('WICOLON');
    this.timepatch = P('WITIME');
    this.sucks = P('WISUCKS');
    this.par = P('WIPAR');
  }

  // --- Animated background ------------------------------------------------

  initAnimatedBack() {
    for (const a of this.anims) {
      a.ctr = -1;
      if (a.type === 'ANIM_ALWAYS') a.nexttic = this.bcnt + 1 + (this.mRandom() % a.period);
      else if (a.type === 'ANIM_RANDOM') a.nexttic = this.bcnt + 1 + a.data2 + (this.mRandom() % a.data1);
      else a.nexttic = this.bcnt + 1;
    }
  }

  updateAnimatedBack() {
    this.anims.forEach((a, i) => {
      if (this.bcnt !== a.nexttic) return;
      if (a.type === 'ANIM_ALWAYS') {
        if (++a.ctr >= a.nanims) a.ctr = 0;
        a.nexttic = this.bcnt + a.period;
      } else if (a.type === 'ANIM_RANDOM') {
        a.ctr++;
        if (a.ctr === a.nanims) {
          a.ctr = -1;
          a.nexttic = this.bcnt + a.data2 + (this.mRandom() % a.data1);
        } else {
          a.nexttic = this.bcnt + a.period;
        }
      } else if (!(this.state === ST_STATCOUNT && i === 7) && this.next === a.data1) {
        // ANIM_LEVEL ("gawd-awful hack for level anims")
        a.ctr++;
        if (a.ctr === a.nanims) a.ctr--;
        a.nexttic = this.bcnt + a.period;
      }
    });
  }

  // --- States -------------------------------------------------------------

  initStats() {
    this.state = ST_STATCOUNT;
    this.acceleratestage = 0;
    this.spState = 1;
    this.cntKills = this.cntItems = this.cntSecret = -1;
    this.cntTime = this.cntPar = -1;
    this.cntPause = TICRATE;
    this.initAnimatedBack();
  }

  updateStats() {
    const s = this.stats;
    const snd = (n) => this.app.audio.ui(n);
    const killsPct = Math.floor((s.kills * 100) / this.maxkills);
    const itemsPct = Math.floor((s.items * 100) / this.maxitems);
    const secretPct = Math.floor((s.secrets * 100) / this.maxsecret);
    const time = s.time;
    const par = s.par;
    this.updateAnimatedBack();

    if (this.acceleratestage && this.spState !== 10) {
      this.acceleratestage = 0;
      this.cntKills = killsPct;
      this.cntItems = itemsPct;
      this.cntSecret = secretPct;
      this.cntTime = time;
      this.cntPar = par;
      snd('barexp');
      this.spState = 10;
    }

    if (this.spState === 2) {
      this.cntKills += 2;
      if (!(this.bcnt & 3)) snd('pistol');
      if (this.cntKills >= killsPct) {
        this.cntKills = killsPct;
        snd('barexp');
        this.spState++;
      }
    } else if (this.spState === 4) {
      this.cntItems += 2;
      if (!(this.bcnt & 3)) snd('pistol');
      if (this.cntItems >= itemsPct) {
        this.cntItems = itemsPct;
        snd('barexp');
        this.spState++;
      }
    } else if (this.spState === 6) {
      this.cntSecret += 2;
      if (!(this.bcnt & 3)) snd('pistol');
      if (this.cntSecret >= secretPct) {
        this.cntSecret = secretPct;
        snd('barexp');
        this.spState++;
      }
    } else if (this.spState === 8) {
      if (!(this.bcnt & 3)) snd('pistol');
      this.cntTime += 3;
      if (this.cntTime >= time) this.cntTime = time;
      this.cntPar += 3;
      if (this.cntPar >= par) {
        this.cntPar = par;
        if (this.cntTime >= time) {
          snd('barexp');
          this.spState++;
        }
      }
    } else if (this.spState === 10) {
      if (this.acceleratestage) {
        snd('sgcock');
        // There is no map to show after an episode's last level.
        if (this.commercial || this.next < 0) this.initNoState();
        else this.initShowNextLoc();
      }
    } else if (this.spState & 1) {
      if (!--this.cntPause) {
        this.spState++;
        this.cntPause = TICRATE;
      }
    }
  }

  initShowNextLoc() {
    this.state = ST_SHOWNEXTLOC;
    this.acceleratestage = 0;
    this.cnt = SHOWNEXTLOCDELAY * TICRATE;
    this.initAnimatedBack();
  }

  updateShowNextLoc() {
    this.updateAnimatedBack();
    if (!--this.cnt || this.acceleratestage) this.initNoState();
    else this.pointerOn = (this.cnt & 31) < 20;
  }

  initNoState() {
    this.state = ST_NOSTATE;
    this.acceleratestage = 0;
    this.cnt = 10;
  }

  updateNoState() {
    this.updateAnimatedBack();
    if (!--this.cnt) this.finish();
  }

  finish() {
    this.state = ST_DONE;
    // G_WorldDone: taking the secret exit splats the secret level from now on.
    const p = this.app.game.player;
    if (this.stats.didSecret && p) p.didsecret = true;
    this.app.game.advance();
  }

  // --- Input / ticker -----------------------------------------------------

  responder(code, e) {
    if (e && e.repeat) return true;
    const inp = this.app.input;
    const isAction = (a) => inp && inp.bindsFor(a).includes(code);
    if (SKIP_CODES.has(code) || isAction('fire') || isAction('use')) this.acceleratestage = 1;
    return true;
  }

  tick() {
    if (this.state === ST_DONE || !this.stats) return;
    this.bcnt++;
    if (this.bcnt === 1) this.app.audio.playMusic(this.commercial ? 'D_DM2INT' : 'D_INTER');
    // WI_checkForAccelerate for gamepads (keys arrive through responder).
    const inp = this.app.input;
    if (inp && (inp.padPressed('fire') || inp.padPressed('use'))) this.acceleratestage = 1;
    switch (this.state) {
      case ST_STATCOUNT: this.updateStats(); break;
      case ST_SHOWNEXTLOC: this.updateShowNextLoc(); break;
      case ST_NOSTATE: this.updateNoState(); break;
      default: break;
    }
  }

  // --- Drawing ------------------------------------------------------------

  draw(r) {
    if (!this.stats) return;
    this.r = r;
    // After ExM8 (no next map) the stats stay up until the finale starts.
    if (this.state === ST_STATCOUNT || this.custom || (!this.commercial && this.next < 0)) {
      this.drawStats();
    } else if (this.state === ST_SHOWNEXTLOC) {
      this.drawShowNextLoc();
    } else {
      this.pointerOn = true;
      this.drawShowNextLoc();
    }
    this.r = null;
  }

  // Whether WI_drawEL runs on the final screen.
  showEL() {
    if (this.next < 0) return false;
    return !this.commercial || this.next !== 30;
  }

  dp(x, y, patch, opts) { if (patch) this.r.drawPatch(patch, x, y, opts); }

  slamBackground() {
    if (!this.background) this.r.fillRect(0, 0, this.r.W, this.r.H, 0);
    this.dp(0, 0, this.background);
  }

  drawAnimatedBack() {
    for (const a of this.anims) if (a.ctr >= 0) this.dp(a.loc.x, a.loc.y, a.p[a.ctr]);
  }

  // "<Levelname> Finished!"
  drawLF() {
    let y = WI_TITLEY;
    const ln = this.lnameLast;
    if (ln) {
      this.dp((SCREENWIDTH - ln.width) >> 1, y, ln);
      y += (5 * ln.height) >> 2;
    } else if (this.custom && this.titleText) {
      // No title graphic: the level name in the HUD font, twice its size.
      this.font.draw(this.r, this.titleText, SCREENWIDTH / 2, y + 2, { align: 'center', scale: 2 });
      y += 20;
    } else {
      y += 16;
    }
    if (this.finished) this.dp((SCREENWIDTH - this.finished.width) >> 1, y, this.finished);
  }

  // "Entering <LevelName>"
  drawEL() {
    let y = WI_TITLEY;
    if (this.entering) this.dp((SCREENWIDTH - this.entering.width) >> 1, y, this.entering);
    const ln = this.lnameNext;
    if (!ln) return;
    y += (5 * ln.height) >> 2;
    this.dp((SCREENWIDTH - ln.width) >> 1, y, ln);
  }

  // Draws the first patch of c[] that fits on screen at lnode n.
  drawOnLnode(n, c) {
    const node = INTERMISSION.lnodes[this.epsd] && INTERMISSION.lnodes[this.epsd][n];
    if (!node) return;
    for (let i = 0; i < 2 && c[i]; i++) {
      const left = node.x - c[i].leftOffset;
      const top = node.y - c[i].topOffset;
      const right = left + c[i].width;
      const bottom = top + c[i].height;
      if (left >= 0 && right < SCREENWIDTH && top >= 0 && bottom < SCREENHEIGHT) {
        this.dp(node.x, node.y, c[i]);
        return;
      }
    }
  }

  drawShowNextLoc() {
    this.slamBackground();
    this.drawAnimatedBack();
    if (!this.commercial) {
      if (this.epsd > 2) {
        this.drawEL();
        return;
      }
      const last = this.last === 8 ? this.next - 1 : this.last;
      for (let i = 0; i <= last; i++) this.drawOnLnode(i, this.splat);
      if (this.didsecret) this.drawOnLnode(8, this.splat);
      if (this.pointerOn && this.next >= 0) this.drawOnLnode(this.next, this.yah);
    }
    if (this.showEL()) this.drawEL();
  }

  // Right-aligned number ending at x; returns the new left x.
  drawNum(x, y, n, digits) {
    const zero = this.num[0];
    const fontwidth = zero ? zero.width : 11;
    if (digits < 0) {
      if (!n) digits = 1;
      else {
        digits = 0;
        for (let t = Math.abs(n); t; t = Math.floor(t / 10)) digits++;
      }
    }
    const neg = n < 0;
    if (neg) n = -n;
    if (n === 1994) return 0; // "non-number"
    while (digits--) {
      x -= fontwidth;
      this.dp(x, y, this.num[n % 10]);
      n = Math.floor(n / 10);
    }
    if (neg && this.wiminus) this.dp(x -= 8, y, this.wiminus);
    return x;
  }

  drawPercent(x, y, p) {
    if (p < 0) return;
    this.dp(x, y, this.percent);
    this.drawNum(x, y, p, -1);
  }

  drawTime(x, y, t) {
    if (t < 0) return;
    if (t <= 61 * 59) {
      const cw = this.colon ? this.colon.width : 6;
      let div = 1;
      do {
        const n = Math.floor(t / div) % 60;
        x = this.drawNum(x, y, n, 2) - cw;
        div *= 60;
        if (div === 60 || Math.floor(t / div)) this.dp(x, y, this.colon);
      } while (Math.floor(t / div));
    } else if (this.sucks) {
      this.dp(x - this.sucks.width, y, this.sucks);
    }
  }

  drawStats() {
    const lh = (3 * (this.num[0] ? this.num[0].height : 12)) >> 1;
    this.slamBackground();
    this.drawAnimatedBack();
    this.drawLF();
    this.dp(SP_STATSX, SP_STATSY, this.kills);
    this.drawPercent(SCREENWIDTH - SP_STATSX, SP_STATSY, this.cntKills);
    this.dp(SP_STATSX, SP_STATSY + lh, this.items);
    this.drawPercent(SCREENWIDTH - SP_STATSX, SP_STATSY + lh, this.cntItems);
    this.dp(SP_STATSX, SP_STATSY + 2 * lh, this.spSecret);
    this.drawPercent(SCREENWIDTH - SP_STATSX, SP_STATSY + 2 * lh, this.cntSecret);
    this.dp(SP_TIMEX, SP_TIMEY, this.timepatch);
    this.drawTime(SCREENWIDTH / 2 - SP_TIMEX, SP_TIMEY, this.cntTime);
    if (this.custom ? this.stats.par > 0 : this.epsd < 3) {
      this.dp(SCREENWIDTH / 2 + SP_TIMEX, SP_TIMEY, this.par);
      this.drawTime(SCREENWIDTH - SP_TIMEX, SP_TIMEY, this.cntPar);
    }
  }
}
