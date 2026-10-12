// Port of p_switch.c: the switch texture list, P_ChangeSwitchTexture and
// the button timers that flip repeatable switches back.

import { SWITCHES } from '../data.js';

export const BUTTONTIME = 35;

// P_InitSwitchList: texture number pairs [off, on, off, on, ...]. Pairs whose
// textures are missing are skipped (vanilla would abort).
export function initSwitchList(w) {
  let episode = 1;
  if (w.commercial || w.gamemode === 'commercial') episode = 3;
  else if (w.gamemode === 'registered' || w.gamemode === 'retail') episode = 2;
  const res = w.res;
  const list = [];
  for (const sw of SWITCHES) {
    if (sw.episode > episode) continue;
    const t1 = res.textureByName.get(sw.name1);
    const t2 = res.textureByName.get(sw.name2);
    if (!t1 || !t2) continue;
    list.push(t1.index, t2.index);
  }
  return list;
}

function buttonSound(w, line, name) {
  const sec = line.frontsector;
  if (!sec) return;
  const org = sec.soundorg;
  org.z = (sec.floorheight + sec.ceilingheight) / 2;
  w.sound(org, name);
}

// P_StartButton: start a button counting down till it turns off.
function startButton(sp, line, where, texture, time) {
  // See if button is already pressed
  for (const b of sp.buttons) {
    if (b.btimer && b.line === line) return;
  }
  sp.buttons.push({ line, where, btexture: texture, btimer: time });
}

// P_ChangeSwitchTexture. useAgain = true for buttons (repeatable switches).
// Note: as in vanilla the special is cleared before the exit check, so S1
// exit switches play 'swtchn' too.
export function changeSwitchTexture(sp, line, useAgain) {
  const w = sp.w;
  if (!useAgain) line.special = 0;
  const side = line.front;
  if (!side) return;
  const texTop = side.toptexture;
  const texMid = side.midtexture;
  const texBot = side.bottomtexture;
  let sound = 'swtchn';
  // Exit switch?
  if (line.special === 11) sound = 'swtchx';
  const list = sp.switchlist;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === texTop) {
      buttonSound(w, line, sound);
      side.toptexture = list[i ^ 1];
      w.sideChanged(side);
      if (useAgain) startButton(sp, line, 'top', list[i], BUTTONTIME);
      return;
    }
    if (list[i] === texMid) {
      buttonSound(w, line, sound);
      side.midtexture = list[i ^ 1];
      w.sideChanged(side);
      if (useAgain) startButton(sp, line, 'middle', list[i], BUTTONTIME);
      return;
    }
    if (list[i] === texBot) {
      buttonSound(w, line, sound);
      side.bottomtexture = list[i ^ 1];
      w.sideChanged(side);
      if (useAgain) startButton(sp, line, 'bottom', list[i], BUTTONTIME);
      return;
    }
  }
}

// The "DO BUTTONS" part of P_UpdateSpecials.
export function updateButtons(sp) {
  const w = sp.w;
  let expired = false;
  for (const b of sp.buttons) {
    if (!b.btimer) continue;
    if (--b.btimer) continue;
    const side = b.line.front;
    if (side) {
      switch (b.where) {
        case 'top': side.toptexture = b.btexture; break;
        case 'middle': side.midtexture = b.btexture; break;
        case 'bottom': side.bottomtexture = b.btexture; break;
        default: break;
      }
      w.sideChanged(side);
    }
    buttonSound(w, b.line, 'swtchn');
    expired = true;
  }
  if (expired) sp.buttons = sp.buttons.filter((b) => b.btimer);
}
