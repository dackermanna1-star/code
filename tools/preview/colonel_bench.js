export async function bench() {
const T = {}; const t = (k, f) => { const a = performance.now(); const r = f(); T[k] = Math.round(performance.now() - a); return r; };
const C = await import('/src/art/colonel.js');
const SP = t('sprite', () => C.getColonelSprite());
const edges = [];
let nFrames = 0;
for (const [n, a] of Object.entries(SP.anims)) a.frames.forEach((f, i) => {
  nFrames++;
  const d = f.getContext('2d').getImageData(0, 0, 64, 64).data;
  let top = 0, side = 0, bottom = 0;
  for (let k = 0; k < 64; k++) { if (d[k * 4 + 3]) top++; if (d[(k * 64) * 4 + 3] || d[(k * 64 + 63) * 4 + 3]) side++; if (d[(63 * 64 + k) * 4 + 3]) bottom++; }
  if (top || side || bottom) edges.push(`${n}:${i}(t${top},s${side},b${bottom})`);
});
T.frames = nFrames; T.edgeHits = edges.join(' ');
const P = await import('/src/art/portraits_colonel.js');
t('portrait1', () => P.getColonelPortrait('serene', { light: 'fluor' }));
t('portrait_all', () => { for (const e of P.COLONEL_PORTRAIT_EXPRS) for (const l of P.COLONEL_LIGHTS) P.getColonelPortrait(e, { light: l }); });
const S = await import('/src/art/colonel_cg_scenes.js');
t('desk_gb', () => S.buildDeskGB(0)); t('desk_shade', () => S.shadeDesk(S.buildDeskGB(0), 0));
t('hand_first', () => { const c = document.createElement('canvas'); c.width = 480; c.height = 270; return 0; });
const G = await import('/src/art/cg_colonel.js');
const c = document.createElement('canvas'); c.width = 480; c.height = 270; const x = c.getContext('2d');
t('hand_cg_first', () => G.getColonelCg('colonel_hand').draw(x, 0, {}));
t('face_first', () => G.getColonelCg('colonel_face').draw(x, 0, { lit: 1 }));
t('face_blink', () => G.getColonelCg('colonel_face').draw(x, 3.25, { lit: 1 }));
t('face_level', () => G.getColonelCg('colonel_face').draw(x, 0, { lit: 0.5 }));
t('locker_first', () => G.getColonelCg('locker_slits').draw(x, 0, { phase: 0.9, faceIn: 0 }));
t('locker_face', () => G.getColonelCg('locker_slits').draw(x, 0, { phase: 1, faceIn: 1 }));
t('locker_steady', () => G.getColonelCg('locker_slits').draw(x, 0.5, { phase: 1, faceIn: 1 }));
for (let f = 0; f < 5; f++) t('vhs' + f, () => G.getColonelCg('vhs_frames').draw(x, 0, { frame: f }));
return T;
}
