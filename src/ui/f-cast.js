// DOOM II cast call (f_finale.c F_StartCast / F_CastTicker / F_CastDrawer):
// each monster walks, attacks and dies on key press over BOSSBACK.

import { CAST } from '../game/data.js';
import { MOBJINFO, MT, S, stateSprite, stateFrame, stateTics, stateNext, FRAMEMASK } from '../game/tables.js';
import { huText, huWidth } from './f-text.js';

const S_NULL = S.S_NULL;

// "Sound hacks": attack sounds played as the cast steps into these states.
const CAST_SOUNDS = new Map(Object.entries({
  S_PLAY_ATK1: 'dshtgn',
  S_POSS_ATK2: 'pistol',
  S_SPOS_ATK2: 'shotgn',
  S_VILE_ATK2: 'vilatk',
  S_SKEL_FIST2: 'skeswg',
  S_SKEL_FIST4: 'skepch',
  S_SKEL_MISS2: 'skeatk',
  S_FATT_ATK8: 'firsht',
  S_FATT_ATK5: 'firsht',
  S_FATT_ATK2: 'firsht',
  S_CPOS_ATK2: 'shotgn',
  S_CPOS_ATK3: 'shotgn',
  S_CPOS_ATK4: 'shotgn',
  S_TROO_ATK3: 'claw',
  S_SARG_ATK2: 'sgtatk',
  S_BOSS_ATK2: 'firsht',
  S_BOS2_ATK2: 'firsht',
  S_HEAD_ATK2: 'firsht',
  S_SKULL_ATK2: 'sklatk',
  S_SPID_ATK2: 'shotgn',
  S_SPID_ATK3: 'shotgn',
  S_BSPI_ATK2: 'plasma',
  S_CYBER_ATK2: 'rlaunc',
  S_CYBER_ATK4: 'rlaunc',
  S_CYBER_ATK6: 'rlaunc',
  S_PAIN_ATK3: 'sklatk',
}).filter(([k]) => S[k] != null).map(([k, v]) => [S[k], v]));

const castInfo = (n) => MOBJINFO[MT[CAST[n].type.replace(/^MT_/, '')]];

export class CastCall {
  constructor(app, font) {
    this.app = app;
    this.font = font;
    this.patchCache = new Map();
  }

  start() {
    this.castnum = 0;
    this.caststate = castInfo(0).seestate;
    this.casttics = stateTics[this.caststate];
    this.castdeath = false;
    this.castframes = 0;
    this.castonmelee = 0;
    this.castattacking = false;
    this.app.audio.playMusic('D_EVIL');
  }

  sound(name) { if (name) this.app.audio.ui(name); }

  tick() {
    if (--this.casttics > 0) return; // not time to change state yet
    let stopattack = false;
    const st0 = this.caststate;
    if (stateTics[st0] === -1 || stateNext[st0] === S_NULL) {
      // Switch from the death state to the next monster.
      this.castnum++;
      this.castdeath = false;
      if (this.castnum >= CAST.length) this.castnum = 0;
      const info = castInfo(this.castnum);
      this.sound(info.seesound);
      this.caststate = info.seestate;
      this.castframes = 0;
    } else if (st0 === S.S_PLAY_ATK1) {
      stopattack = true; // "Oh, gross hack!"
    } else {
      const st = stateNext[st0];
      this.caststate = st;
      this.castframes++;
      this.sound(CAST_SOUNDS.get(st));
    }
    const info = castInfo(this.castnum);
    if (!stopattack && this.castframes === 12) {
      // Go into the attack frame, alternating melee and missile.
      this.castattacking = true;
      this.caststate = this.castonmelee ? info.meleestate : info.missilestate;
      this.castonmelee ^= 1;
      if (this.caststate === S_NULL) this.caststate = this.castonmelee ? info.meleestate : info.missilestate;
    }
    if (stopattack || (this.castattacking && (this.castframes === 24 || this.caststate === info.seestate))) {
      this.castattacking = false;
      this.castframes = 0;
      this.caststate = info.seestate;
    }
    this.casttics = stateTics[this.caststate];
    if (this.casttics === -1) this.casttics = 15;
  }

  // Any key kills the current cast member.
  responder() {
    if (this.castdeath) return true; // already in dying frames
    const info = castInfo(this.castnum);
    this.castdeath = true;
    this.caststate = info.deathstate;
    this.casttics = stateTics[this.caststate];
    this.castframes = 0;
    this.castattacking = false;
    this.sound(info.deathsound);
    return true;
  }

  spritePatch(id) {
    let p = this.patchCache.get(id);
    if (!p) {
      const img = this.app.res.images[id];
      if (!img) return null;
      p = { id, width: img.width, height: img.height, leftOffset: img.leftOffset, topOffset: img.topOffset };
      this.patchCache.set(id, p);
    }
    return p;
  }

  draw(r) {
    r.drawPatch('BOSSBACK', 0, 0);
    // F_CastPrint: the name centred at y 180.
    const name = CAST[this.castnum].name;
    huText(r, this.font, name, 160 - (huWidth(this.font, name) >> 1), 180);
    // The current frame, rotation 0, in the middle of the screen.
    const frames = this.app.res.sprites[stateSprite[this.caststate]];
    const fr = frames && frames[stateFrame[this.caststate] & FRAMEMASK];
    if (!fr || fr.images[0] < 0) return;
    const patch = this.spritePatch(fr.images[0]);
    if (patch) r.drawPatch(patch, 160, 170, { flip: fr.flip[0] });
  }
}
