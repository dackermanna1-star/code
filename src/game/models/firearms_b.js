// Rifles, snipers, launcher, machine gun and chainsaw. Model space: -Z forward, +Y up, origin at right-hand grip.

function guard(k, m, { y, z0, z1, w = 0.012, post = 0.016 }) {
  k.zbox(m, { y, z0, z1, w, h: 0.006 });
  k.box([0, y + post / 2, z0 + 0.003], [w, post, 0.006], m, { skip: { top: true, bottom: true } });
}
function trigger(k, vm, z, y) { if (vm) k.box([0, y, z], [0.005, 0.016, 0.006], 'blued'); }
function buttPad(k, { y, z, w, h }) { k.zbox('rubber', { y, z0: z, z1: z + 0.013, w, h, skip: { nose: true } }); }
function boxMag(part, { pivot, rake = 0.08, len, d, w = 0.024, m = 'blued', plate = true }) {
  return part('mag', pivot, (s) => {
    s.push(pivot, [rake, 0, 0]);
    s.box([0, -len / 2, 0], [w, len, d], m, { skip: { top: true }, taperBottom: [1, 0.92] });
    if (plate) s.box([0, -len, 0], [w + 0.004, 0.007, d * 0.95 + 0.004], m);
    s.pop();
  });
}
function scope(k, seg, { y, z0, z1, r, bell, ringY, rings, m = 'blued' }) {
  const s = seg(6, 8);
  for (const rz of rings) k.box([0, (ringY + y) / 2, rz], [0.014, y - ringY, 0.014], m, { skip: { top: true } });
  const tz0 = z0 + 0.06, tz1 = z1 - 0.045;
  k.cyl([0, y, (tz0 + tz1) / 2], r, tz1 - tz0, m, { axis: 'z', seg: s, caps: false });
  k.cyl([0, y, z0 + 0.03], bell, 0.06, m, { axis: 'z', seg: s, r2: r, capMat0: 'glassClear', cap1: false });
  k.cyl([0, y, z1 - 0.0225], r, 0.045, m, { axis: 'z', seg: s, r2: r * 1.35, cap0: false, capMat1: 'dark' });
  k.box([0, y + r + 0.006, (tz0 + tz1) / 2], [0.014, 0.012, 0.016], m, { skip: { bottom: true } });
  if (seg(0, 1)) k.box([r + 0.006, y, (tz0 + tz1) / 2], [0.012, 0.014, 0.016], m, { skip: { left: true } });
}

// ------------------------------------------------------------------ assault rifles
function m16({ k, vm, v, part, seg, setOrigin }) {
  setOrigin([0, -0.012, 0.015]);
  const B = 'blued';
  k.zbox(B, { y: 0.045, z0: -0.16, z1: 0.05, w: 0.038, h: 0.036 });
  k.zbox(B, { y: 0.02, z0: -0.158, z1: -0.082, w: 0.034, h: 0.03, skip: { top: true } });
  k.zbox(B, { y: 0.083, z0: -0.2, z1: 0.06, w: 0.04, h: 0.042 });
  // carry handle
  k.box([0, 0.128, -0.06], [0.016, 0.018, 0.17], B);
  k.box([0, 0.111, -0.135], [0.016, 0.018, 0.02], B, { skip: { top: true, bottom: true } });
  k.box([0, 0.111, 0.015], [0.016, 0.018, 0.02], B, { skip: { top: true, bottom: true } });
  if (vm) k.box([0, 0.141, 0.012], [0.012, 0.01, 0.014], B, { skip: { bottom: true } });
  // handguard + delta ring
  k.cyl([0, 0.08, -0.36], 0.025, 0.31, 'polymer', { axis: 'z', seg: seg(6, 8), cap1: false });
  k.cyl([0, 0.08, -0.205], 0.028, 0.014, B, { axis: 'z', seg: 8, cap0: false });
  // barrel, triangle front sight, flash hider
  k.cyl([0, 0.083, -0.6], 0.0075, 0.17, B, { axis: 'z', caps: false });
  k.box([0, 0.083, -0.54], [0.02, 0.022, 0.026], B);
  k.box([0, 0.118, -0.54], [0.01, 0.05, 0.03], B, { taper: [0.6, 0.12], skip: { bottom: true } });
  k.cyl([0, 0.083, -0.705], 0.0105, 0.04, B, { axis: 'z', capMat0: 'dark', cap1: false });
  // A2 stock + grip
  k.zbox('polymer', { y: 0.07, z0: 0.06, z1: 0.33, w: 0.038, w1: 0.042, h: 0.05, h1: 0.11, dy: -0.025, skip: { nose: true } });
  buttPad(k, { y: 0.045, z: 0.33, w: 0.042, h: 0.11 });
  k.grip('polymer', { y: 0.03, z: 0.012, w: 0.03, h: 0.095, d: 0.042, rake: -0.38, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  guard(k, B, { y: 0.017, z0: -0.07, z1: -0.005 });
  trigger(k, vm, -0.04, 0.026);
  if (vm) {
    k.box([0, 0.1, 0.07], [0.03, 0.008, 0.02], B);
    k.box([0.0205, 0.082, -0.08], [0.002, 0.018, 0.06], 'dark');
    k.box([0.024, 0.095, -0.0], [0.01, 0.012, 0.02], B);
  }
  const mag = boxMag(part, { pivot: [0, 0.008, -0.12], rake: 0.14, len: 0.14, d: 0.062 });
  return { kind: 'rifle', muzzle: v(0, 0.083, -0.726), leftHand: v(0, 0.054, -0.33), mag, slide: null, pump: null };
}

function ak47({ k, vm, v, part, seg, setOrigin }) {
  setOrigin([0, -0.012, 0.012]);
  k.zbox('blued', { y: 0.06, z0: -0.2, z1: 0.04, w: 0.038, h: 0.05 });
  k.zbox('gunmetal', { y: 0.091, z0: -0.15, z1: 0.04, w: 0.032, h: 0.014, dy: -0.004, skip: { bottom: true } });
  k.box([0, 0.094, -0.17], [0.03, 0.024, 0.04], 'blued', { skip: { bottom: true } });
  k.zbox('wood', { y: 0.058, z0: -0.4, z1: -0.2, w: 0.042, w1: 0.044, h: 0.04, h1: 0.042, skip: { tail: true } });
  k.zbox('wood', { y: 0.092, z0: -0.37, z1: -0.19, w: 0.03, h: 0.024, skip: { bottom: true } });
  k.cyl([0, 0.093, -0.4], 0.008, 0.06, 'blued', { axis: 'z', cap1: false });
  k.box([0, 0.083, -0.44], [0.02, 0.03, 0.022], 'blued');
  k.cyl([0, 0.072, -0.5], 0.008, 0.2, 'blued', { axis: 'z', caps: false });
  k.box([0, 0.086, -0.575], [0.016, 0.022, 0.022], 'blued');
  k.box([0, 0.107, -0.575], [0.016, 0.022, 0.012], 'blued', { taper: [0.75, 1], skip: { bottom: true } });
  k.cyl([0, 0.072, -0.612], 0.0105, 0.034, 'blued', { axis: 'z', capMat0: 'dark', cap1: false });
  k.zbox('wood', { y: 0.06, z0: 0.04, z1: 0.28, w: 0.036, w1: 0.04, h: 0.045, h1: 0.11, dy: -0.042, skip: { nose: true } });
  buttPad(k, { y: 0.018, z: 0.28, w: 0.04, h: 0.11 });
  k.grip('woodDark', { y: 0.038, z: 0.008, w: 0.03, h: 0.092, d: 0.04, rake: -0.32 });
  guard(k, 'blued', { y: 0.02, z0: -0.085, z1: -0.005 });
  trigger(k, vm, -0.04, 0.03);
  if (vm) {
    k.box([0.02, 0.066, -0.08], [0.003, 0.014, 0.1], 'blued');
    k.box([0.026, 0.078, -0.01], [0.012, 0.01, 0.012], 'blued');
    k.box([0, 0.107, -0.165], [0.008, 0.008, 0.03], 'blued');
  }
  const mag = part('mag', [0, 0.035, -0.115], (s) => {
    const pts = []; let y = 0.04, z = -0.115, a = 0.08;
    for (let i = 0; i < 4; i++) {
      pts.push([y, z, 0.058 + i * 0.002, a]);
      const L = i === 0 ? 0.05 : 0.055; a += 0.2;
      y -= Math.cos(a - 0.1) * L; z -= Math.sin(a - 0.1) * L;
    }
    pts[3][3] -= 0.05;
    s.arc('darksteel', { w: 0.026, pts });
    const [ly, lz, , la] = pts[3];
    const ex = (t) => [ly - Math.cos(la) * t, lz - Math.sin(la) * t, 0.066, la];
    if (vm) s.arc('blued', { w: 0.029, pts: [ex(-0.004), ex(0.004)] });
  });
  return { kind: 'rifle', muzzle: v(0, 0.072, -0.63), leftHand: v(0, 0.036, -0.3), mag, slide: null, pump: null };
}

function scar({ k, vm, v, part, setOrigin }) {
  setOrigin([0, -0.012, 0.015]);
  k.zbox('tan', { y: 0.086, z0: -0.42, z1: 0.06, w: 0.046, h: 0.054 });
  k.zbox('tan', { y: 0.088, z0: -0.46, z1: -0.42, w: 0.036, w1: 0.046, h: 0.036, h1: 0.054, dy: -0.002, skip: { tail: true } });
  k.zbox('black', { y: 0.117, z0: -0.45, z1: 0.06, w: 0.022, h: 0.008, skip: { bottom: true } });
  k.zbox('black', { y: 0.046, z0: -0.17, z1: 0.055, w: 0.04, h: 0.032 });
  k.zbox('black', { y: 0.022, z0: -0.158, z1: -0.085, w: 0.036, h: 0.026, skip: { top: true } });
  k.cyl([0, 0.088, -0.51], 0.0085, 0.1, 'blued', { axis: 'z', caps: false });
  k.cyl([0, 0.088, -0.578], 0.012, 0.04, 'blued', { axis: 'z', capMat0: 'dark', cap1: false });
  k.box([0, 0.128, -0.43], [0.012, 0.016, 0.01], 'black', { skip: { bottom: true } });
  k.box([0, 0.128, 0.045], [0.02, 0.016, 0.014], 'black', { skip: { bottom: true } });
  k.box([-0.028, 0.096, -0.2], [0.012, 0.01, 0.016], 'black');
  if (vm) for (const sx of [-1, 1]) k.zbox('black', { x: sx * 0.025, y: 0.074, z0: -0.42, z1: -0.24, w: 0.006, h: 0.012 });
  // angular skeletal stock
  k.box([0, 0.088, 0.07], [0.04, 0.05, 0.022], 'black');
  k.zbox('tan', { y: 0.088, z0: 0.08, z1: 0.305, w: 0.036, w1: 0.04, h: 0.05, h1: 0.12, dy: -0.034, skip: { nose: true } });
  k.zbox('black', { y: 0.118, z0: 0.13, z1: 0.27, w: 0.03, h: 0.016, dy: -0.004, skip: { bottom: true } });
  k.zbox('black', { y: 0.054, z0: 0.305, z1: 0.32, w: 0.04, h: 0.12 });
  k.grip('black', { y: 0.032, z: 0.012, w: 0.03, h: 0.095, d: 0.044, rake: -0.32, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  guard(k, 'black', { y: 0.017, z0: -0.07, z1: -0.005 });
  trigger(k, vm, -0.04, 0.026);
  const mag = boxMag(part, { pivot: [0, 0.01, -0.12], rake: 0.1, len: 0.13, d: 0.062, m: 'blued' });
  return { kind: 'rifle', muzzle: v(0, 0.088, -0.598), leftHand: v(0, 0.054, -0.3), mag, slide: null, pump: null };
}

// ------------------------------------------------------------------ snipers
function hunting_rifle({ k, vm, v, part, seg, setOrigin }) {
  setOrigin([0, 0.03, 0.02]);
  k.zbox('wood', { y: 0.05, z0: -0.47, z1: -0.035, w: 0.04, w1: 0.042, h: 0.036, h1: 0.046 });
  k.zbox('wood', { y: 0.083, z0: -0.42, z1: -0.25, w: 0.026, h: 0.018, skip: { bottom: true } });
  k.zbox('blued', { y: 0.083, z0: -0.25, z1: -0.02, w: 0.034, h: 0.034 });
  k.cyl([0, 0.08, -0.6], 0.009, 0.3, 'blued', { axis: 'z', capMat0: 'dark', cap1: false });
  if (vm) k.box([0, 0.093, -0.74], [0.004, 0.012, 0.008], 'blued');
  k.zbox('wood', { y: 0.045, z0: -0.035, z1: 0.065, w: 0.036, h: 0.05, h1: 0.056, dy: -0.02, skip: { nose: true } });
  k.zbox('wood', { y: 0.025, z0: 0.065, z1: 0.31, w: 0.038, w1: 0.043, h: 0.056, h1: 0.13, dy: -0.026, skip: { nose: true } });
  buttPad(k, { y: -0.001, z: 0.31, w: 0.043, h: 0.13 });
  guard(k, 'blued', { y: 0.014, z0: -0.11, z1: -0.035 });
  trigger(k, vm, -0.07, 0.024);
  scope(k, seg, { y: 0.13, z0: -0.31, z1: 0.06, r: 0.0125, bell: 0.021, ringY: 0.1, rings: [-0.19, -0.03] });
  const mag = boxMag(part, { pivot: [0, 0.035, -0.15], rake: 0.05, len: 0.05, d: 0.05, w: 0.022 });
  return { kind: 'sniper', muzzle: v(0, 0.08, -0.751), leftHand: v(0, 0.03, -0.34), mag, slide: null, pump: null };
}

function sniper_military({ k, vm, v, part, seg, setOrigin }) {
  setOrigin([0, -0.012, 0.015]);
  k.zbox('blued', { y: 0.075, z0: -0.26, z1: 0.06, w: 0.042, h: 0.05 });
  k.zbox('polymer', { y: 0.068, z0: -0.58, z1: -0.26, w: 0.05, w1: 0.052, h: 0.05, h1: 0.054 });
  k.cyl([0, 0.08, -0.715], 0.0095, 0.27, 'blued', { axis: 'z', caps: false });
  k.cyl([0, 0.08, -0.875], 0.0145, 0.05, 'blued', { axis: 'z', capMat0: 'dark', cap1: false });
  k.zbox('polymer', { y: 0.07, z0: 0.06, z1: 0.35, w: 0.04, w1: 0.044, h: 0.055, h1: 0.12, dy: -0.025, skip: { nose: true } });
  k.zbox('polymer', { y: 0.11, z0: 0.12, z1: 0.3, w: 0.036, h: 0.022, skip: { bottom: true } });
  buttPad(k, { y: 0.045, z: 0.35, w: 0.044, h: 0.12 });
  k.grip('polymer', { y: 0.05, z: 0.012, w: 0.032, h: 0.1, d: 0.046, rake: -0.3, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  guard(k, 'blued', { y: 0.034, z0: -0.07, z1: -0.005 });
  trigger(k, vm, -0.04, 0.043);
  scope(k, seg, { y: 0.14, z0: -0.33, z1: 0.07, r: 0.016, bell: 0.029, ringY: 0.1, rings: [-0.2, -0.02] });
  // deployed bipod
  k.box([0, 0.038, -0.54], [0.03, 0.012, 0.03], 'blued', { skip: { top: true } });
  for (const sx of [-1, 1]) {
    k.push([sx * 0.012, 0.036, -0.54], [0.75, 0, sx * 0.3]);
    k.box([0, -0.1, 0], [0.009, 0.2, 0.009], 'blued', { skip: { top: true, bottom: true } });
    if (vm) k.box([0, -0.2, 0.004], [0.012, 0.01, 0.022], 'rubber');
    k.pop();
  }
  const mag = boxMag(part, { pivot: [0, 0.05, -0.14], rake: 0.05, len: 0.08, d: 0.06, w: 0.026 });
  return { kind: 'sniper', muzzle: v(0, 0.08, -0.901), leftHand: v(0, 0.04, -0.42), mag, slide: null, pump: null };
}

// ------------------------------------------------------------------ launcher / mg
function grenade_launcher({ k, vm, v, part, marker, setOrigin }) {
  setOrigin([0, 0.03, 0.02]);
  k.zbox('blued', { y: 0.058, z0: -0.075, z1: 0.0, w: 0.052, h: 0.066 });
  k.zbox('wood', { y: 0.05, z0: 0.0, z1: 0.1, w: 0.042, h: 0.062, h1: 0.066, dy: -0.02, skip: { nose: true } });
  k.zbox('wood', { y: 0.03, z0: 0.1, z1: 0.31, w: 0.044, w1: 0.05, h: 0.066, h1: 0.135, dy: -0.022, skip: { nose: true } });
  k.zbox('rubber', { y: 0.008, z0: 0.31, z1: 0.335, w: 0.05, h: 0.135, skip: { nose: true } });
  guard(k, 'blued', { y: 0.012, z0: -0.06, z1: 0.0, post: 0.018 });
  trigger(k, vm, -0.03, 0.022);
  if (vm) k.box([0, 0.096, -0.02], [0.014, 0.012, 0.03], 'blued');
  const barrel = part('barrel', [0, 0.03, -0.075], (b) => {
    b.cyl([0, 0.07, -0.24], 0.027, 0.33, 'gunmetal', { axis: 'z', seg: 8, capMat0: 'dark', cap1: false });
    b.zbox('wood', { y: 0.034, z0: -0.31, z1: -0.085, w: 0.05, w1: 0.052, h: 0.032 });
    b.box([0, 0.1, -0.13], [0.034, 0.006, 0.06], 'blued');
    b.box([0, 0.1, -0.395], [0.006, 0.01, 0.012], 'blued');
    if (vm) b.cyl([0, 0.07, -0.4], 0.029, 0.012, 'blued', { axis: 'z', seg: 8, caps: false });
  });
  const mag = marker('mag', [0, 0.07, -0.08], (s) => {
    s.cyl([0, 0.07, -0.06], 0.022, 0.04, 'brass', { axis: 'z', seg: 8 });
    s.cyl([0, 0.07, -0.1], 0.012, 0.04, 'olive', { axis: 'z', seg: 8, r2: 0.02 });
  }, { parent: barrel });
  return { kind: 'launcher', muzzle: v(0, 0.07, -0.406), leftHand: v(0, 0.018, -0.2), mag, barrel, slide: null, pump: null };
}

function m60({ k, vm, v, part, seg, setOrigin }) {
  setOrigin([0, -0.012, 0.012]);
  k.zbox('gunmetal', { y: 0.07, z0: -0.3, z1: 0.06, w: 0.056, h: 0.072 });
  k.zbox('blued', { y: 0.114, z0: -0.2, z1: 0.03, w: 0.062, h: 0.018, skip: { bottom: true } });
  k.cyl([0, 0.086, -0.56], 0.0145, 0.52, 'blued', { axis: 'z', seg: seg(6, 8), caps: false });
  k.cyl([0, 0.086, -0.845], 0.018, 0.05, 'blued', { axis: 'z', capMat0: 'dark', cap1: false });
  k.cyl([0, 0.05, -0.48], 0.012, 0.36, 'blued', { axis: 'z', cap1: false });
  k.zbox('polymer', { y: 0.05, z0: -0.5, z1: -0.3, w: 0.062, w1: 0.066, h: 0.05, skip: { tail: true } });
  k.box([0, 0.11, -0.8], [0.008, 0.03, 0.012], 'blued', { skip: { bottom: true } });
  // carry handle
  k.box([0.01, 0.106, -0.4], [0.012, 0.04, 0.012], 'blued', { skip: { bottom: true } });
  k.box([0.01, 0.132, -0.43], [0.014, 0.014, 0.12], 'polymer');
  // bipod
  k.box([0, 0.066, -0.7], [0.03, 0.02, 0.026], 'blued', { skip: { top: true } });
  for (const sx of [-1, 1]) {
    k.push([sx * 0.012, 0.062, -0.7], [0.7, 0, sx * 0.28]);
    k.box([0, -0.11, 0], [0.01, 0.22, 0.01], 'blued', { skip: { top: true, bottom: true } });
    if (vm) k.box([0, -0.22, 0.004], [0.014, 0.01, 0.024], 'rubber');
    k.pop();
  }
  k.zbox('polymer', { y: 0.068, z0: 0.06, z1: 0.36, w: 0.046, w1: 0.05, h: 0.062, h1: 0.105, dy: -0.025, skip: { nose: true } });
  buttPad(k, { y: 0.043, z: 0.36, w: 0.05, h: 0.105 });
  k.grip('polymer', { y: 0.036, z: 0.0, w: 0.032, h: 0.1, d: 0.046, rake: -0.25, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  guard(k, 'blued', { y: 0.02, z0: -0.075, z1: -0.01, post: 0.016 });
  trigger(k, vm, -0.045, 0.03);
  if (vm) {
    k.box([0, 0.128, 0.02], [0.03, 0.012, 0.012], 'blued');
    k.box([0.03, 0.08, -0.08], [0.012, 0.012, 0.02], 'blued');
  }
  const mag = part('mag', [-0.065, 0.03, -0.14], (s) => {
    s.box([-0.065, 0.02, -0.14], [0.06, 0.11, 0.12], 'olive', { f: { left: 'dStencil' } });
    s.box([-0.065, 0.078, -0.14], [0.064, 0.008, 0.124], 'oliveDark');
    s.box([-0.058, 0.09, -0.14], [0.026, 0.012, 0.05], 'brass', { skip: { bottom: true } });
    s.box([-0.036, 0.102, -0.14], [0.026, 0.012, 0.05], 'brass', { skip: { bottom: true } });
  });
  return { kind: 'mg', muzzle: v(0, 0.086, -0.871), leftHand: v(0, 0.024, -0.4), mag, slide: null, pump: null };
}

// ------------------------------------------------------------------ chainsaw
function chainsaw({ k, vm, v }) {
  k.zbox('black', { y: 0.0, z0: -0.045, z1: 0.1, w: 0.03, h: 0.032 });
  k.box([0, -0.05, 0.1], [0.028, 0.1, 0.03], 'orange');
  k.zbox('orange', { y: -0.02, z0: -0.3, z1: -0.045, w: 0.12, w1: 0.11, h: 0.16 });
  k.zbox('orange', { y: 0.07, z0: -0.27, z1: -0.07, w: 0.1, w1: 0.08, h: 0.024, skip: { bottom: true } });
  k.zbox('black', { y: -0.105, z0: -0.3, z1: 0.115, w: 0.1, h: 0.014 });
  k.zbox('polymer', { x: -0.065, y: -0.02, z0: -0.26, z1: -0.08, w: 0.012, h: 0.12, skip: { right: true } });
  k.box([-0.076, 0.03, -0.16], [0.012, 0.016, 0.05], 'black');
  k.box([0.05, -0.03, -0.31], [0.04, 0.06, 0.03], 'steel');
  // wrap-around front handle + guard
  k.box([-0.072, 0.0, -0.22], [0.016, 0.17, 0.02], 'black');
  k.box([-0.008, 0.095, -0.22], [0.144, 0.018, 0.022], 'black');
  k.box([0.058, 0.07, -0.22], [0.016, 0.06, 0.02], 'black', { skip: { bottom: true } });
  k.box([0, 0.08, -0.283], [0.1, 0.07, 0.008], 'black');
  // bar + chain
  k.zbox('steel', { y: -0.04, z0: -0.78, z1: -0.28, w: 0.008, h: 0.068, h1: 0.076, skip: { tail: true } });
  k.cyl([0, -0.04, -0.78], 0.034, 0.008, 'steel', { axis: 'x', seg: 6 });
  k.zbox('chain', { y: -0.003, z0: -0.785, z1: -0.29, w: 0.012, h: 0.009, skip: { tail: true, nose: true } });
  k.zbox('chain', { y: -0.077, z0: -0.785, z1: -0.29, w: 0.012, h: 0.009, skip: { tail: true, nose: true } });
  k.cyl([0, -0.04, -0.783], 0.042, 0.012, 'chain', { axis: 'x', seg: 6, caps: false });
  if (vm) for (let i = 0; i < 6; i++) k.box([0, 0.004, -0.33 - i * 0.08], [0.008, 0.008, 0.016], 'chrome', { taper: [1, 0.2], skip: { bottom: true } });
  return { kind: 'chainsaw', muzzle: v(0, -0.04, -0.826), leftHand: v(-0.01, 0.095, -0.22), mag: null, slide: null, pump: null };
}

export const FIREARMS_B = { m16, ak47, scar, hunting_rifle, sniper_military, grenade_launcher, m60, chainsaw };
