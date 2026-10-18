// Build timings for the Colonel's art: ?part=bench (sprite, portraits, each CG's first draw and
// background preparation steps). Prints "bench {...}" to the console.
export async function bench() {
  const T = {}; const t = (k, f) => { const a = performance.now(); const r = f(); T[k] = Math.round(performance.now() - a); return r; };
  const C = await import('/src/art/colonel.js');
  const SP = t('sprite', () => C.getColonelSprite());
  let nFrames = 0;
  for (const a of Object.values(SP.anims)) nFrames += a.frames.length;
  T.frames = nFrames;
  const P = await import('/src/art/portraits_colonel.js');
  t('portrait1', () => P.getColonelPortrait('serene', { light: 'fluor' }));
  // the hand: each background prep step, per light
  const HN = await import('/src/art/colonel_cg_hand.js');
  for (const light of ['fluor', 'red']) {
    const steps = [];
    for (let n = 0; n < 40; n++) { const a = performance.now(); const done = HN.prepHand(light); steps.push(Math.round(performance.now() - a)); if (done) break; }
    T['hand_prep_' + light] = steps.join('+');
  }
  T.hand_prof = JSON.stringify(HN.PROF);
  t('hand_compose10', () => { for (let i = 0; i < 10; i++) HN.composeHand({ light: 'fluor', swell: 1, reach: i / 10, slack: 0 }); });
  const G = await import('/src/art/cg_colonel.js');
  const c = document.createElement('canvas'); c.width = 480; c.height = 270; const x = c.getContext('2d');
  t('hand_draw', () => G.getColonelCg('colonel_hand').draw(x, 0, {}));
  t('face_first', () => G.getColonelCg('colonel_face').draw(x, 0, { lit: 1 }));
  t('face_level', () => G.getColonelCg('colonel_face').draw(x, 0, { lit: 0.5 }));
  t('locker_first', () => G.getColonelCg('locker_slits').draw(x, 0, { phase: 0.9, faceIn: 0 }));
  t('locker_face', () => G.getColonelCg('locker_slits').draw(x, 0, { phase: 1, faceIn: 1 }));
  t('locker_steady', () => G.getColonelCg('locker_slits').draw(x, 0.5, { phase: 1, faceIn: 1 }));
  const nv = G.getColonelCg('vhs_frames').frames || 5;
  for (let f = 0; f < nv; f++) t('vhs' + f, () => G.getColonelCg('vhs_frames').draw(x, 0, { frame: f }));
  return T;
}
