// Cheat codes typed during play (m_cheat.c sequences, st_stuff.c effects).
// Typed characters are kept in a short buffer and matched on its suffix,
// which behaves like the per-cheat pointers of cht_CheckCheat.

import { WP, PW, TAU, INVULNTICS } from '../game/defs.js';
import { STRINGS } from '../game/data.js';
import { MUSIC_NAMES } from '../game/info.js';
import { givePower } from '../game/inter.js';

const CF_NOCLIP = 1;
const CF_GODMODE = 2;
const BEHOLD = 'vsiral'; // idbehold v/s/i/r/a/l -> power 0..5

export class Cheats {
  constructor(app) {
    this.app = app;
    this.buf = '';
  }

  get player() {
    const g = this.app.game;
    return g && g.state === 'level' ? g.player : null;
  }

  key(ch) {
    const p = this.player;
    if (!p || !p.mo || !ch || ch.length !== 1) return;
    this.buf = (this.buf + ch.toLowerCase()).slice(-16);
    const b = this.buf;
    const ends = (seq) => b.endsWith(seq);
    const S = STRINGS;
    let hit = true;

    if (ends('iddqd')) {
      p.cheats ^= CF_GODMODE;
      if (p.cheats & CF_GODMODE) {
        if (p.mo) p.mo.health = 100;
        p.health = 100;
        p.message = S.STSTR_DQDON;
      } else p.message = S.STSTR_DQDOFF;
    } else if (ends('idkfa')) {
      this.giveArsenal(p, true);
      p.message = S.STSTR_KFAADDED;
    } else if (ends('idfa')) {
      this.giveArsenal(p, false);
      p.message = S.STSTR_FAADDED;
    } else if (ends('idspispopd') || ends('idclip')) {
      p.cheats ^= CF_NOCLIP;
      p.message = (p.cheats & CF_NOCLIP) ? S.STSTR_NCON : S.STSTR_NCOFF;
    } else if (/idbehold[vsiral]$/.test(b)) {
      const i = BEHOLD.indexOf(b[b.length - 1]);
      if (!p.powers[i]) givePower(p, i);
      else if (i !== PW.STRENGTH) p.powers[i] = 1;
      else p.powers[i] = 0;
      p.message = S.STSTR_BEHOLDX;
    } else if (ends('idbehold')) {
      // Menu of choices; keep the buffer so the next letter completes it.
      p.message = S.STSTR_BEHOLD;
      return;
    } else if (ends('idchoppers')) {
      p.weaponowned[WP.CHAINSAW] = true;
      // Vanilla stored `true` (a single tic); grant the real power instead.
      p.powers[PW.INVULNERABILITY] = INVULNTICS;
      p.message = S.STSTR_CHOPPERS;
    } else if (ends('idmypos')) {
      p.message = this.position(p);
    } else if (ends('iddt')) {
      const am = this.app.automap;
      if (am && am.cycleCheat) am.cycleCheat();
    } else if (/idmus..$/.test(b)) {
      this.changeMusic(p, b.slice(-2));
    } else if (/idclev..$/.test(b)) {
      this.changeLevel(p, b.slice(-2));
    } else hit = false;
    if (hit) this.buf = '';
  }

  // idkfa / idfa: every weapon, full ammo, blue armor (and keys).
  giveArsenal(p, keys) {
    const commercial = this.app.game.commercial;
    p.armorpoints = 200;
    p.armortype = 2;
    for (let i = 0; i < p.weaponowned.length; i++) {
      // The super shotgun only exists in DOOM II.
      if (i === WP.SUPERSHOTGUN && !commercial) continue;
      p.weaponowned[i] = true;
    }
    // Full ammo counting loaded magazines, then fill every magazine.
    for (let i = 0; i < p.ammo.length; i++) {
      const loaded = p.loadedAmmo ? p.loadedAmmo(i) : 0;
      p.ammo[i] = Math.max(0, p.maxammo[i] - loaded);
    }
    if (p.topOffMagazines) p.topOffMagazines();
    if (keys) p.cards.fill(true);
  }

  // "ang=0x%x;x,y=(0x%x,0x%x)" with BAM angle and fixed-point coordinates.
  position(p) {
    const hex = (n) => (n >>> 0).toString(16);
    const ang = Math.round((p.mo.angle / TAU) * 4294967296) >>> 0;
    const fx = Math.round(p.mo.x * 65536) | 0;
    const fy = Math.round(p.mo.y * 65536) | 0;
    return `ang=0x${hex(ang)};x,y=(0x${hex(fx)},0x${hex(fy)})`;
  }

  changeMusic(p, digits) {
    const S = STRINGS;
    if (!/^\d\d$/.test(digits)) { p.message = S.STSTR_NOMUS; return; }
    const d0 = Number(digits[0]), d1 = Number(digits[1]);
    let name = null;
    if (this.app.game.commercial) {
      const n = d0 * 10 + d1;
      const idx = MUSIC_NAMES.indexOf('runnin') + n - 1;
      if (n >= 1 && n <= 35 && MUSIC_NAMES[idx]) name = MUSIC_NAMES[idx];
    } else {
      const idx = (d0 - 1) * 9 + (d1 - 1);
      if (idx >= 0 && idx <= 31 && MUSIC_NAMES[1 + idx]) name = MUSIC_NAMES[1 + idx];
    }
    const lump = name ? `D_${name.toUpperCase()}` : null;
    if (!lump || !this.app.stack.has(lump)) { p.message = S.STSTR_NOMUS; return; }
    p.message = S.STSTR_MUS;
    this.app.audio.playMusic(lump);
  }

  changeLevel(p, digits) {
    if (!/^\d\d$/.test(digits)) return;
    const g = this.app.game;
    const mode = this.app.gamemode || g.gamemode;
    let ep;
    let map;
    if (g.commercial) {
      ep = 1;
      map = Number(digits);
    } else {
      ep = Number(digits[0]);
      map = Number(digits[1]);
    }
    if (ep < 1 || map < 1) return;
    if (mode === 'retail' && (ep > 4 || map > 9)) return;
    if (mode === 'registered' && (ep > 3 || map > 9)) return;
    if (mode === 'shareware' && (ep > 1 || map > 9)) return;
    if (mode === 'commercial' && (ep > 1 || map > 34)) return;
    if (!this.app.stack.mapLumps(g.mapName(ep, map))) return;
    g.warp(ep, map);
    if (this.app.hud) this.app.hud.message(STRINGS.STSTR_CLEV, { force: false });
  }
}
