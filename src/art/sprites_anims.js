// Standard animation set for a human spec (TECH §12): idle_<dir>, walk_<dir> (4), run_<dir> (4),
// sit_<dir>, heads_down — plus per-character specials through C.specials(). Frames are rendered
// once and cached on the sheet; idles reuse canvases by index so long, subtle loops cost nothing.
import { frontGeom, sideGeom, walkGeom, renderFrame, anim, seq, DIRS, AX, AY } from './sprites_human.js';

export const SIT_DROP_FRONT = 4;
export const SIT_DROP_BACK = 5;

/** Seated geometry. 'up' = back to us at a desk; 'down' = facing us on a bench; sides = profile. */
export function sitGeom(C, dir, o = {}) {
  const D = C.dims;
  if (dir === 'up') {
    const drop = o.drop ?? D.sitDropUp ?? SIT_DROP_BACK;
    const g = frontGeom(C, 'up', { ...o, drop });
    g.seated = 'up';
    // forearms rest on the desk in front of the body: we see upper arms and elbows only
    for (const a of g.arms) {
      const out = a.screen === 0 ? -1 : 1;
      a.el = [a.sh[0] + out * (o.elbowOut ?? 0), a.sh[1] + 3];
      a.hd = [a.sh[0] - out * 1, a.sh[1] + 3];
      a.cover = 1; a.noHand = true;
    }
    for (const l of g.legs) l.seatedBack = true;
    return g;
  }
  if (dir === 'down') {
    const drop = o.drop ?? D.sitDropDown ?? SIT_DROP_FRONT;
    const g = frontGeom(C, 'down', { ...o, drop });
    g.seated = 'down';
    for (const l of g.legs) l.seatedFront = true;
    // hands rest on the lap
    for (const a of g.arms) {
      const inw = a.screen === 0 ? 1 : -1;
      a.el = [a.sh[0] - inw * (D.elbowOut || 0), a.sh[1] + D.elbowDy - 1];
      a.hd = [a.sh[0] + inw * 1, g.hip + (o.handDy ?? 0)];
    }
    return g;
  }
  const drop = o.drop ?? D.sitDropDown ?? SIT_DROP_FRONT;
  const g = sideGeom(C, dir, { ...o, drop });
  g.seated = 'side';
  const hip = g.hip, cx = g.cx;
  const kneeX = cx - (D.thigh ?? 4);
  const ankleY = D.ground - C.shoe.h + 1;
  g.legs.near = { hip: [cx + (D.hipDx || 0), hip], knee: [kneeX, hip], ankle: [kneeX, ankleY], lift: 0, seated: true };
  g.legs.far = { hip: [cx + 1 + (D.hipDx || 0), hip], knee: [kneeX + 1, hip], ankle: [kneeX + 1, ankleY], lift: 0, seated: true };
  g.arms.near.el = [cx, g.sh + D.elbowDy];
  g.arms.near.hd = [kneeX + 2, hip - 1];
  g.arms.far.el = [cx + 1, g.sh + D.elbowDy];
  g.arms.far.hd = [kneeX + 3, hip - 1];
  return g;
}

/** heads_down: seated at a desk, head on folded arms, seen from behind/above. */
export function headsDownGeom(C, o = {}) {
  const g = sitGeom(C, 'up', o);
  g.headsDown = true;
  g.head.y += 2;
  g.order = ['legs', 'torso', 'arms', 'head', 'over'];
  // folded arms on the desk: elbows wide beside the head, forearms tucked under it
  for (const a of g.arms) {
    const out = a.screen === 0 ? -1 : 1;
    a.el = [a.sh[0] + out * 2, a.sh[1] - 3];
    a.hd = [a.sh[0] - out * 2, a.sh[1] - 5];
    a.cover = 1; a.noHand = true;
  }
  return g;
}

export function buildHumanSheet(C) {
  const anims = {};
  const cache = new Map();
  const R = (g) => {
    if (C.adjust) g = C.adjust(g) || g;
    return renderFrame(C, g, g.mats || C.mats);
  };
  const ctx = {
    C, R, anim, seq,
    front: (dir, o) => frontGeom(C, dir, o),
    side: (dir, o) => sideGeom(C, dir, o),
    stand: (dir, o = {}) => (dir === 'down' || dir === 'up' ? frontGeom(C, dir, o) : sideGeom(C, dir, { near: { x: -1 }, far: { x: 1 }, ...o })),
    walk: (dir, i, run) => walkGeom(C, dir, i, run),
    sit: (dir, o) => sitGeom(C, dir, o),
    headsDown: (o) => headsDownGeom(C, o),
    memo: (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); },
  };
  for (const d of DIRS) {
    if (C.idle) anims[`idle_${d}`] = C.idle(d, ctx);
    else {
      const f = [R(ctx.stand(d)), R(ctx.stand(d, { breath: 1 }))];
      anims[`idle_${d}`] = anim(seq(f, [0, 0, 0, 1, 1, 1]), 4);
    }
    if (C.walk !== false) anims[`walk_${d}`] = anim([0, 1, 2, 3].map((i) => R(walkGeom(C, d, i))), C.walkFps || 7);
    if (C.run !== false) anims[`run_${d}`] = anim([0, 1, 2, 3].map((i) => R(walkGeom(C, d, i, true))), C.runFps || 11);
    if (C.sit !== false) {
      const f = [R(sitGeom(C, d)), R(sitGeom(C, d, { breath: 1 }))];
      anims[`sit_${d}`] = anim(seq(f, [0, 0, 0, 1, 1, 1]), 4);
    }
  }
  if (C.headsDown !== false) {
    const f = [R(headsDownGeom(C)), R(headsDownGeom(C, { breath: 1 }))];
    anims.heads_down = anim(seq(f, [0, 0, 0, 0, 1, 1, 1, 1]), 4);
  }
  C.specials?.(anims, ctx);
  return { fw: 24, fh: 32, ax: AX, ay: AY, anims };
}
