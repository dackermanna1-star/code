// Handguns, SMGs and shotguns. Model space: -Z forward, +Y up, origin at the right-hand grip.
// Each builder receives the assemble() ctx and returns userData fields.

const shellFn = (pos, len = 0.055, r = 0.0095) => (s) => {
  s.cyl([pos[0], pos[1], pos[2] - 0.006], r, len - 0.012, 'red', { axis: 'z', seg: 6 });
  s.cyl([pos[0], pos[1], pos[2] + len / 2 - 0.006], r * 1.1, 0.012, 'brass', { axis: 'z', seg: 6 });
};

function trigger(k, vm, z, y, m = 'blued') { if (vm) k.box([0, y, z], [0.005, 0.016, 0.006], m); }
function guard(k, m, { y, z0, z1, w = 0.012, post = 0.018 }) {
  k.zbox(m, { y, z0, z1, w, h: 0.006 });
  k.box([0, y + post / 2, z0 + 0.003], [w, post, 0.006], m, { skip: { top: true, bottom: true } });
}

// ------------------------------------------------------------------ handguns
function pistol({ k, vm, v, part, setOrigin }) {
  setOrigin([0, -0.012, 0.01]);
  k.zbox('polymer', { y: 0.042, z0: -0.142, z1: 0.014, w: 0.026, h: 0.022, skip: { top: true } });
  guard(k, 'polymer', { y: 0.021, z0: -0.066, z1: -0.016 });
  trigger(k, vm, -0.04, 0.033);
  k.grip('polymer', { y: 0.042, z: 0.0, w: 0.03, h: 0.096, d: 0.048, rake: -0.24, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  if (vm) k.box([0, 0.038, 0.024], [0.022, 0.01, 0.014], 'polymer', { skip: { bottom: true } });
  const slide = part('slide', [0, 0.066, -0.075], (s) => {
    s.box([0, 0.066, -0.071], [0.027, 0.03, 0.178], 'blued', { taper: [0.78, 1], f: { back: 'gunmetal' } });
    if (vm) {
      s.box([0, 0.0845, -0.152], [0.004, 0.007, 0.006], 'blued');
      s.box([-0.0065, 0.0845, 0.008], [0.005, 0.007, 0.007], 'blued');
      s.box([0.0065, 0.0845, 0.008], [0.005, 0.007, 0.007], 'blued');
      s.box([0.0136, 0.071, -0.04], [0.0015, 0.011, 0.034], 'dark');
      s.box([0, 0.066, -0.1605], [0.011, 0.011, 0.002], 'dark');
    }
  });
  const mag = part('mag', [0, 0.042, 0.0], (m) => {
    m.push([0, 0.042, 0.0], [-0.24, 0, 0]);
    m.box([0, -0.053, 0.002], [0.021, 0.104, 0.034], 'blued', { skip: { top: true } });
    m.box([0, -0.11, 0.004], [0.029, 0.01, 0.044], 'polymer');
    m.pop();
  });
  return { kind: 'pistol', muzzle: v(0, 0.066, -0.161), leftHand: v(-0.028, -0.01, 0.014), mag, slide, pump: null };
}

function magnum({ k, vm, v, part, setOrigin }) {
  setOrigin([0, -0.012, 0.012]);
  k.zbox('chrome', { y: 0.046, z0: -0.17, z1: 0.026, w: 0.031, h: 0.026, skip: { top: true } });
  guard(k, 'chrome', { y: 0.019, z0: -0.088, z1: -0.014, w: 0.014, post: 0.022 });
  trigger(k, vm, -0.05, 0.032, 'steel');
  k.grip('rubber', { y: 0.042, z: 0.005, w: 0.037, h: 0.12, d: 0.06, rake: -0.2, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  if (vm) k.box([0, 0.074, 0.038], [0.01, 0.016, 0.012], 'steel');
  const slide = part('slide', [0, 0.078, -0.1], (s) => {
    s.box([0, 0.078, -0.102], [0.035, 0.044, 0.27], 'chrome', { taper: [0.6, 1], f: { back: 'steel' } });
    if (vm) {
      s.box([0, 0.103, -0.228], [0.005, 0.008, 0.014], 'steel');
      s.box([0, 0.103, 0.026], [0.022, 0.008, 0.008], 'steel');
      s.box([0, 0.078, -0.2375], [0.014, 0.014, 0.002], 'dark');
      s.box([0.0145, 0.084, -0.13], [0.002, 0.005, 0.15], 'blued');
      s.box([-0.0145, 0.084, -0.13], [0.002, 0.005, 0.15], 'blued');
    }
  });
  const mag = part('mag', [0, 0.042, 0.005], (m) => {
    m.push([0, 0.042, 0.005], [-0.2, 0, 0]);
    m.box([0, -0.062, 0.002], [0.025, 0.12, 0.04], 'steel', { skip: { top: true } });
    m.box([0, -0.126, 0.004], [0.034, 0.01, 0.054], 'rubber');
    m.pop();
  });
  return { kind: 'pistol', muzzle: v(0, 0.078, -0.238), leftHand: v(-0.03, -0.012, 0.016), mag, slide, pump: null };
}

// ------------------------------------------------------------------ SMGs
function smg({ k, vm, v, part, setOrigin }) {
  setOrigin([0, -0.008, 0.0]);
  k.zbox('blued', { y: 0.072, z0: -0.2, z1: 0.075, w: 0.05, h: 0.062 });
  k.box([0, 0.107, -0.06], [0.044, 0.008, 0.21], 'gunmetal', { skip: { bottom: true } });
  k.zbox('polymer', { y: 0.031, z0: -0.2, z1: -0.085, w: 0.047, h: 0.024 });
  k.cyl([0, 0.074, -0.206], 0.02, 0.014, 'gunmetal', { axis: 'z', seg: 8 });
  k.cyl([0, 0.074, -0.24], 0.0105, 0.06, 'blued', { axis: 'z', capMat0: 'dark', cap1: false });
  k.box([0, 0.116, 0.06], [0.03, 0.012, 0.012], 'blued', { skip: { bottom: true } });
  k.box([0, 0.118, -0.185], [0.026, 0.014, 0.01], 'blued', { skip: { bottom: true } });
  k.grip('polymer', { y: 0.042, z: -0.005, w: 0.036, h: 0.1, d: 0.058, rake: -0.1, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  guard(k, 'blued', { y: 0.019, z0: -0.092, z1: -0.03, w: 0.016, post: 0.022 });
  trigger(k, vm, -0.06, 0.03);
  k.box([0, 0.066, 0.086], [0.044, 0.046, 0.022], 'blued');
  for (const sx of [-1, 1]) k.zbox('blued', { x: sx * 0.0265, y: 0.05, z0: -0.18, z1: 0.09, w: 0.004, h: 0.012, skip: { nose: true, tail: true } });
  if (vm) {
    k.box([0, 0.116, -0.12], [0.012, 0.012, 0.016], 'black');
    k.box([0.0252, 0.08, -0.03], [0.002, 0.02, 0.05], 'dark');
  }
  const mag = part('mag', [0, 0.042, -0.005], (m) => {
    m.push([0, 0.042, -0.005], [-0.1, 0, 0]);
    m.box([0, -0.1, 0], [0.026, 0.2, 0.036], 'blued', { skip: { top: true } });
    m.box([0, -0.2, 0], [0.03, 0.008, 0.04], 'blued');
    m.pop();
  });
  return { kind: 'smg', muzzle: v(0, 0.074, -0.27), leftHand: v(0, 0.02, -0.15), mag, slide: null, pump: null };
}

function smg_silenced({ k, vm, v, part, seg, setOrigin }) {
  setOrigin([0, -0.01, 0.0]);
  k.zbox('gunmetal', { y: 0.068, z0: -0.15, z1: 0.07, w: 0.052, h: 0.078 });
  k.box([0, 0.113, -0.075], [0.012, 0.012, 0.016], 'black', { skip: { bottom: true } });
  k.box([0, 0.111, 0.055], [0.024, 0.008, 0.012], 'gunmetal', { skip: { bottom: true } });
  k.box([0, 0.111, -0.14], [0.012, 0.008, 0.01], 'gunmetal', { skip: { bottom: true } });
  k.box([0, 0.022, -0.135], [0.01, 0.018, 0.022], 'blued');
  k.cyl([0, 0.072, -0.3], 0.026, 0.3, 'black', { axis: 'z', seg: seg(6, 8), capMat0: 'dark', cap1: false });
  if (vm) {
    k.cyl([0, 0.072, -0.165], 0.0275, 0.014, 'gunmetal', { axis: 'z', seg: 8, caps: false });
    k.cyl([0, 0.072, -0.44], 0.0275, 0.014, 'gunmetal', { axis: 'z', seg: 8, caps: false });
    k.box([0.0262, 0.08, -0.02], [0.002, 0.022, 0.05], 'dark');
  }
  k.grip('polymer', { y: 0.03, z: -0.01, w: 0.034, h: 0.095, d: 0.052, rake: -0.06, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  guard(k, 'gunmetal', { y: 0.01, z0: -0.085, z1: -0.04, w: 0.014 });
  trigger(k, vm, -0.06, 0.02);
  k.box([0, 0.07, 0.084], [0.052, 0.06, 0.008], 'blued');
  if (vm) for (const sx of [-1, 1]) k.zbox('blued', { x: sx * 0.028, y: 0.096, z0: -0.13, z1: 0.08, w: 0.004, h: 0.006, skip: { nose: true, tail: true } });
  const mag = part('mag', [0, 0.03, -0.01], (m) => {
    m.push([0, 0.03, -0.01], [-0.06, 0, 0]);
    m.box([0, -0.08, 0], [0.024, 0.16, 0.034], 'blued', { skip: { top: true } });
    m.box([0, -0.16, 0], [0.028, 0.008, 0.038], 'blued');
    m.pop();
  });
  return { kind: 'smg', muzzle: v(0, 0.072, -0.452), leftHand: v(0, 0.044, -0.24), mag, slide: null, pump: null };
}

// ------------------------------------------------------------------ shotguns
function tradStock(k, F, { y = 0.045, z = -0.035, len = 0.34 }) {
  k.zbox(F, { y, z0: z, z1: z + 0.1, w: 0.036, h: 0.05, h1: 0.056, dy: -0.02, skip: { nose: true } });
  const yb = y - 0.02, zb = z + 0.1, ze = z + len;
  k.zbox(F, { y: yb, z0: zb, z1: ze, w: 0.038, w1: 0.043, h: 0.056, h1: 0.13, dy: -0.026, skip: { nose: true } });
  k.zbox('rubber', { y: yb - 0.026, z0: ze, z1: ze + 0.014, w: 0.043, h: 0.13, skip: { nose: true } });
}

function tubeAction(ctx, { M, zM, zT, yB = 0.077, yT = 0.047, recZ0 = -0.25, recZ1 = -0.035, recH = 0.064, recW = 0.044 }) {
  const { k, vm } = ctx;
  k.zbox(M, { y: 0.06, z0: recZ0, z1: recZ1, w: recW, h: recH });
  k.zbox(M, { y: 0.06 + recH / 2 + 0.003, z0: recZ0, z1: recZ1 - 0.01, w: recW * 0.7, h: 0.006, skip: { bottom: true } });
  k.cyl([0, yB, (recZ0 + zM) / 2], 0.0115, recZ0 - zM, M, { axis: 'z', seg: 6, capMat0: 'dark', cap1: false });
  k.cyl([0, yT, (recZ0 + zT) / 2], 0.0125, recZ0 - zT, M, { axis: 'z', seg: 6, cap1: false });
  k.box([0, (yB + yT) / 2, zT + 0.016], [0.016, yB - yT + 0.02, 0.012], M);
  if (vm) {
    k.box([0, yB + 0.013, zM + 0.006], [0.004, 0.004, 0.004], 'brass');
    k.box([recW / 2 + 0.001, 0.07, -0.15], [0.002, 0.022, 0.06], 'dark');
  }
}

function pumpGun(ctx, { M, F, P, zM, zP, stockLen = 0.34 }) {
  const { k, vm, v, part, marker, setOrigin } = ctx;
  setOrigin([0, 0.035, 0.015]);
  tubeAction(ctx, { M, zM, zT: zM + 0.04 });
  guard(k, M, { y: 0.02, z0: -0.115, z1: -0.04, post: 0.016 });
  trigger(k, vm, -0.075, 0.03);
  tradStock(k, F, { y: 0.045, z: -0.035, len: stockLen });
  const pump = part('pump', [0, 0.046, zP], (s) => {
    s.zbox(P, { y: 0.046, z0: zP - 0.1, z1: zP + 0.1, w: 0.046, h: 0.038, w1: 0.048 });
    if (vm) for (let i = 0; i < 4; i++) s.zbox(P === 'wood' ? 'woodDark' : 'rubber', { y: 0.046, z0: zP - 0.07 + i * 0.04, z1: zP - 0.06 + i * 0.04, w: 0.049, h: 0.041, skip: { nose: true, tail: true } });
  });
  const mag = marker('mag', [0, 0.03, -0.15], shellFn([0, 0.03, -0.15]));
  return { kind: 'shotgun', muzzle: v(0, 0.077, zM - 0.001), leftHand: v(0, 0.03, zP), mag, pump, slide: null };
}

function pump_shotgun(ctx) { return pumpGun(ctx, { M: 'blued', F: 'wood', P: 'wood', zM: -0.7, zP: -0.42 }); }
function chrome_shotgun(ctx) { return pumpGun(ctx, { M: 'chrome', F: 'black', P: 'black', zM: -0.64, zP: -0.4, stockLen: 0.33 }); }

function auto_shotgun(ctx) {
  const { k, vm, v, marker, setOrigin } = ctx;
  setOrigin([0, -0.012, 0.012]);
  tubeAction(ctx, { M: 'blued', zM: -0.75, zT: -0.69, recZ0: -0.27, recZ1: -0.015, recH: 0.066 });
  k.zbox('black', { y: 0.1, z0: -0.26, z1: -0.02, w: 0.022, h: 0.009, skip: { bottom: true } });
  k.zbox('polymer', { y: 0.048, z0: -0.52, z1: -0.27, w: 0.046, w1: 0.05, h: 0.04, h1: 0.044 });
  k.grip('polymer', { y: 0.03, z: 0.0, w: 0.032, h: 0.1, d: 0.048, rake: -0.32, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  guard(k, 'blued', { y: 0.016, z0: -0.085, z1: -0.02, post: 0.014 });
  trigger(k, vm, -0.05, 0.026);
  k.cyl([0, 0.068, 0.07], 0.016, 0.17, 'blued', { axis: 'z', seg: 6, cap0: false });
  k.zbox('polymer', { y: 0.062, z0: 0.12, z1: 0.31, w: 0.04, w1: 0.044, h: 0.06, h1: 0.13, dy: -0.02 });
  k.zbox('polymer', { y: 0.098, z0: 0.15, z1: 0.29, w: 0.034, h: 0.016, skip: { bottom: true } });
  k.zbox('rubber', { y: 0.042, z0: 0.31, z1: 0.325, w: 0.044, h: 0.13, skip: { nose: true } });
  if (vm) {
    k.box([0, 0.11, -0.05], [0.026, 0.016, 0.01], 'black');
    k.box([0, 0.096, -0.742], [0.004, 0.012, 0.01], 'black');
  }
  const mag = marker('mag', [0, 0.03, -0.17], shellFn([0, 0.03, -0.17]));
  return { kind: 'shotgun', muzzle: v(0, 0.077, -0.751), leftHand: v(0, 0.026, -0.4), mag, pump: null, slide: null };
}

function spas(ctx) {
  const { k, vm, v, marker, setOrigin } = ctx;
  setOrigin([0, -0.012, 0.012]);
  tubeAction(ctx, { M: 'blued', zM: -0.67, zT: -0.62, yB: 0.083, recZ0: -0.25, recZ1: -0.015, recH: 0.07, recW: 0.046 });
  k.zbox('perf', { y: 0.088, z0: -0.57, z1: -0.25, w: 0.034, h: 0.034, skip: { tail: true } });
  k.zbox('polymer', { y: 0.046, z0: -0.48, z1: -0.3, w: 0.054, h: 0.048 });
  if (vm) for (let i = 0; i < 4; i++) k.zbox('rubber', { y: 0.046, z0: -0.46 + i * 0.04, z1: -0.45 + i * 0.04, w: 0.057, h: 0.051, skip: { nose: true, tail: true } });
  k.grip('polymer', { y: 0.03, z: 0.0, w: 0.032, h: 0.1, d: 0.05, rake: -0.3, f: vm ? { left: 'grip', right: 'grip' } : undefined });
  guard(k, 'blued', { y: 0.016, z0: -0.085, z1: -0.02, post: 0.014 });
  trigger(k, vm, -0.05, 0.026);
  // folding skeletal stock (extended)
  k.box([0, 0.07, -0.005], [0.03, 0.03, 0.025], 'gunmetal');
  k.zbox('gunmetal', { y: 0.078, z0: 0.0, z1: 0.25, w: 0.013, h: 0.013, dy: -0.012 });
  k.zbox('gunmetal', { y: 0.008, z0: 0.03, z1: 0.25, w: 0.012, h: 0.012, dy: -0.045 });
  k.box([0, 0.016, 0.255], [0.036, 0.13, 0.012], 'gunmetal');
  k.box([0, -0.05, 0.236], [0.018, 0.012, 0.04], 'gunmetal');
  if (vm) {
    k.box([0, 0.112, -0.04], [0.024, 0.014, 0.01], 'black');
    k.box([0, 0.104, -0.565], [0.006, 0.014, 0.01], 'black');
  }
  const mag = marker('mag', [0, 0.03, -0.16], shellFn([0, 0.03, -0.16]));
  return { kind: 'shotgun', muzzle: v(0, 0.083, -0.671), leftHand: v(0, 0.024, -0.39), mag, pump: null, slide: null };
}

export const FIREARMS_A = { pistol, magnum, smg, smg_silenced, pump_shotgun, chrome_shotgun, auto_shotgun, spas };
