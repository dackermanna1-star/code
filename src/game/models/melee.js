// Melee weapons. Origin = right-hand grip, head/blade toward -Z, striking edge/face toward -Y.

function fireaxe({ k, vm, v, seg }) {
  k.zbox('wood', { y: 0, z0: -0.73, z1: 0.14, w: 0.026, h: 0.034, w1: 0.03, h1: 0.04 });
  k.zbox('woodDark', { y: 0, z0: 0.14, z1: 0.16, w: 0.032, h: 0.044 });
  k.box([0, 0, -0.69], [0.036, 0.06, 0.08], 'red');
  // blade (toward -Y), steel edge
  k.loft('red', [
    { c: [0, -0.028, -0.69], u: [0.017, 0, 0], v: [0, 0, 0.036] },
    { c: [0, -0.12, -0.69], u: [0.006, 0, 0], v: [0, 0, 0.062] },
  ], { skip: { cap0: true } });
  k.loft('steel', [
    { c: [0, -0.12, -0.69], u: [0.006, 0, 0], v: [0, 0, 0.062] },
    { c: [0, -0.158, -0.69], u: [0.0015, 0, 0], v: [0, 0, 0.078] },
  ], { skip: { cap0: true } });
  // pick (toward +Y)
  k.loft('red', [
    { c: [0, 0.028, -0.69], u: [0.016, 0, 0], v: [0, 0, 0.03] },
    { c: [0, 0.1, -0.675], u: [0.008, 0, 0], v: [0, 0, 0.012] },
    { c: [0, 0.155, -0.66], u: [0.002, 0, 0], v: [0, 0, 0.002] },
  ], { skip: { cap0: true, cap1: true } });
  if (vm) k.box([0, 0, 0.06], [0.032, 0.04, 0.14], 'rubber', { skip: { front: true, back: true } });
  return { kind: 'melee', twoHanded: true, tip: v(0, -0.158, -0.69), leftHand: v(0, 0, 0.1), muzzle: null, mag: null, pump: null, slide: null };
}

function crowbar({ k, vm, v, seg }) {
  const s = seg(6, 6);
  k.cyl([0, 0, -0.165], 0.011, 0.57, 'red', { axis: 'z', seg: s, caps: false });
  // chisel end (+Z), slightly bent up
  k.loft('blued', [
    { c: [0, 0, 0.12], u: [0.011, 0, 0], v: [0, 0.011, 0] },
    { c: [0, 0.008, 0.16], u: [0.014, 0, 0], v: [0, 0.006, -0.002] },
    { c: [0, 0.018, 0.19], u: [0.016, 0, 0], v: [0, 0.0015, 0] },
  ], { skip: { cap0: true } });
  // hook (toward -Z then curling down & back)
  const R = 0.05, N = vm ? 7 : 5, pts = [];
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 1.05;
    pts.push([-R + R * Math.cos(th), -0.45 - R * Math.sin(th), 0.022, Math.PI / 2 - th, 0.022]);
  }
  const last = pts[N];
  k.arc('red', { pts: pts.slice(0, N), w: 0.022 }, { skip: { cap0: true, cap1: true } });
  k.arc('blued', { pts: [pts[N - 1], [last[0], last[1], 0.008, last[3], 0.03]], w: 0.022 });
  return { kind: 'melee', twoHanded: false, tip: v(0, -0.05, -0.505), leftHand: v(0, 0, 0.08), muzzle: null, mag: null, pump: null, slide: null };
}

function cricket_bat({ k, vm, v }) {
  k.cyl([0, 0, 0.0], 0.016, 0.26, 'rubber', { axis: 'z', seg: 6 });
  k.cyl([0, 0, -0.15], 0.014, 0.06, 'woodLight', { axis: 'z', seg: 6, caps: false });
  k.loft('woodLight', [
    { c: [0, 0, -0.17], u: [0.02, 0, 0], v: [0, 0.016, 0] },
    { c: [0, 0, -0.22], u: [0.054, 0, 0], v: [0, 0.018, 0] },
    { c: [0, 0, -0.78], u: [0.054, 0, 0], v: [0, 0.018, 0] },
    { c: [0, 0, -0.82], u: [0.05, 0, 0], v: [0, 0.014, 0] },
  ], { skip: { cap0: true } });
  k.zbox('woodLight', { y: 0.024, z0: -0.72, z1: -0.24, w: 0.05, h: 0.014, w1: 0.03, skip: { bottom: true } });
  if (vm) {
    k.box([0, 0, 0.13], [0.036, 0.036, 0.012], 'rubber');
    k.box([0, -0.0185, -0.32], [0.08, 0.001, 0.05], 'cardboard', { skip: { top: true, front: true, back: true, left: true, right: true } });
  }
  return { kind: 'melee', twoHanded: true, tip: v(0, -0.018, -0.7), leftHand: v(0, 0, 0.08), muzzle: null, mag: null, pump: null, slide: null };
}

function baseball_bat({ k, vm, v, seg }) {
  const s = seg(8, 10);
  k.cyl([0, 0, 0.13], 0.022, 0.014, 'woodDark', { axis: 'z', seg: s });
  k.cyl([0, 0, 0.0], 0.0135, 0.25, 'rubber', { axis: 'z', seg: s, r2: 0.0125, caps: false });
  k.cyl([0, 0, -0.3], 0.033, 0.3, 'woodLight', { axis: 'z', seg: s, r2: 0.0135, caps: false });
  k.cyl([0, 0, -0.58], 0.034, 0.26, 'woodLight', { axis: 'z', seg: s, r2: 0.033, caps: false });
  k.cyl([0, 0, -0.72], 0.026, 0.02, 'woodLight', { axis: 'z', seg: s, r2: 0.034, cap1: false });
  return { kind: 'melee', twoHanded: true, tip: v(0, 0, -0.65), leftHand: v(0, 0, 0.08), muzzle: null, mag: null, pump: null, slide: null };
}

function katana({ k, vm, v, setOrigin }) {
  setOrigin([0, 0, 0.03]);
  k.zbox('wrap', { y: 0, z0: -0.045, z1: 0.22, w: 0.026, h: 0.034, w1: 0.024, h1: 0.03 });
  k.zbox('gold', { y: 0, z0: 0.22, z1: 0.232, w: 0.026, h: 0.032 });
  k.cyl([0, 0, -0.05], 0.042, 0.01, 'blued', { axis: 'z', seg: 8 });
  k.zbox('brass', { y: 0, z0: -0.075, z1: -0.055, w: 0.01, h: 0.034 });
  const N = vm ? 7 : 4, secs = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -0.055 - 0.66 * t;
    secs.push({ c: [0, 0.04 * t * t, z], u: [0.003 - 0.0012 * t, 0, 0], v: [0, 0.015 - 0.002 * t, 0] });
  }
  secs.push({ c: [0, 0.047, -0.755], u: [0.0012, 0, 0], v: [0, 0.006, 0] });
  secs.push({ c: [0, 0.052, -0.78], u: [0.0005, 0, 0], v: [0, 0.0006, 0] });
  k.loft('blade', secs, { f: { 0: 'chrome' }, skip: { cap0: true } });
  return { kind: 'melee', twoHanded: true, tip: v(0, 0.05, -0.77), leftHand: v(0, 0, 0.17), muzzle: null, mag: null, pump: null, slide: null };
}

function knife({ k, vm, v }) {
  k.zbox('rubber', { y: 0, z0: -0.005, z1: 0.105, w: 0.022, h: 0.028, w1: 0.024, h1: 0.03 });
  k.zbox('blued', { y: 0, z0: 0.105, z1: 0.115, w: 0.024, h: 0.03 });
  k.box([0, -0.004, -0.009], [0.016, 0.052, 0.008], 'blued');
  k.loft('blade', [
    { c: [0, 0, -0.013], u: [0.0028, 0, 0], v: [0, 0.015, 0] },
    { c: [0, -0.002, -0.12], u: [0.0025, 0, 0], v: [0, 0.015, 0] },
    { c: [0, -0.002, -0.16], u: [0.0018, 0, 0], v: [0, 0.011, 0] },
    { c: [0, 0.006, -0.19], u: [0.0005, 0, 0], v: [0, 0.001, 0] },
  ], { f: { 0: 'chrome', 2: 'darksteel' }, skip: { cap0: true } });
  if (vm) for (let i = 0; i < 3; i++) k.box([0, 0, 0.02 + i * 0.03], [0.025, 0.031, 0.006], 'black', { skip: { front: true, back: true } });
  return { kind: 'melee', twoHanded: false, tip: v(0, 0.004, -0.188), leftHand: v(-0.06, -0.04, 0.1), muzzle: null, mag: null, pump: null, slide: null };
}

function golf_club({ k, vm, v, seg }) {
  k.cyl([0, 0, 0.0], 0.0105, 0.25, 'rubber', { axis: 'z', seg: 6, r2: 0.0125 });
  k.cyl([0, 0, -0.52], 0.0045, 0.79, 'chrome', { axis: 'z', seg: seg(4, 6), r2: 0.006, caps: false });
  k.cyl([0, 0, -0.925], 0.008, 0.02, 'chrome', { axis: 'z', seg: 6, caps: false });
  k.box([0.038, -0.006, -0.955], [0.1, 0.026, 0.06], 'chrome', { taper: [1, 0.8], f: { bottom: 'steel' } });
  k.box([0.038, -0.006, -0.986], [0.098, 0.024, 0.006], 'steel');
  return { kind: 'melee', twoHanded: true, tip: v(0.034, -0.015, -0.955), leftHand: v(0, 0, 0.08), muzzle: null, mag: null, pump: null, slide: null };
}

function frying_pan({ k, vm, v, seg }) {
  const s = seg(10, 12), cz = -0.27;
  k.zbox('black', { y: 0.004, z0: -0.15, z1: 0.1, w: 0.03, h: 0.018, w1: 0.026, h1: 0.014, dy: 0.012 });
  k.cyl([0, -0.0075, cz], 0.105, 0.045, 'blued', { r2: 0.128, seg: s, cap1: false, capMat0: 'darksteel' });
  k.cyl([0, -0.0035, cz], 0.097, 0.037, 'gunmetal', { r2: 0.12, seg: s, flip: true, caps: false });
  k.ring([0, 0.015, cz], 0.12, 0.128, 'steel', { seg: s });
  k.disc([0, -0.022, cz], 0.097, 'darksteel', { seg: s });
  if (vm) k.box([0, 0.012, -0.12], [0.014, 0.01, 0.012], 'steel');
  return { kind: 'melee', twoHanded: false, tip: v(0, -0.03, -0.3), leftHand: v(-0.06, -0.04, 0.1), muzzle: null, mag: null, pump: null, slide: null };
}

function machete({ k, vm, v }) {
  k.zbox('woodDark', { y: 0, z0: -0.01, z1: 0.11, w: 0.024, h: 0.032, w1: 0.026, h1: 0.03 });
  k.box([0, -0.012, 0.12], [0.026, 0.044, 0.02], 'woodDark');
  k.loft('darksteel', [
    { c: [0, 0.002, -0.01], u: [0.003, 0, 0], v: [0, 0.018, 0] },
    { c: [0, -0.006, -0.3], u: [0.0028, 0, 0], v: [0, 0.026, 0] },
    { c: [0, -0.012, -0.47], u: [0.0024, 0, 0], v: [0, 0.03, 0] },
    { c: [0, 0.01, -0.53], u: [0.0012, 0, 0], v: [0, 0.008, 0] },
  ], { f: { 0: 'blade' } });
  if (vm) for (let i = 0; i < 2; i++) k.box([0, 0, 0.02 + i * 0.06], [0.027, 0.006, 0.006], 'brass', { skip: { bottom: true } });
  return { kind: 'melee', twoHanded: false, tip: v(0, 0.01, -0.53), leftHand: v(-0.06, -0.04, 0.1), muzzle: null, mag: null, pump: null, slide: null };
}

function guitar({ k, vm, v, seg, setOrigin }) {
  setOrigin([0, 0, -0.06]);
  const s = seg(10, 12);
  k.zbox('woodDark', { y: -0.004, z0: 0.025, z1: 0.18, w: 0.068, w1: 0.074, h: 0.016, dy: -0.018 });
  k.box([0, 0.012, 0.022], [0.05, 0.006, 0.006], 'whiteFlat');
  k.zbox('wood', { y: 0.0, z0: -0.42, z1: 0.02, w: 0.058, w1: 0.05, h: 0.024, h1: 0.022 });
  k.zbox('woodDark', { y: 0.0135, z0: -0.5, z1: 0.02, w: 0.054, w1: 0.048, h: 0.004, skip: { bottom: true } });
  // body: two bouts (figure-8), top facing +Y
  k.cyl([0, -0.04, -0.5], 0.135, 0.1, 'woodRed', { seg: s, capMat1: 'woodLight' });
  k.cyl([0, -0.0405, -0.74], 0.18, 0.1, 'woodRed', { seg: s, capMat1: 'woodLight', r2: 0.18 });
  k.disc([0, 0.0112, -0.58], 0.045, 'dark', { seg: 8 });
  k.box([0, 0.013, -0.79], [0.09, 0.006, 0.022], 'woodDark', { skip: { bottom: true } });
  k.box([0, 0.0165, -0.385], [0.018, 0.001, 0.81], [0x9a9a96, 'flat'], { skip: { bottom: true, front: true, back: true, left: true, right: true } });
  if (vm) {
    k.ring([0, 0.0108, -0.58], 0.045, 0.055, 'woodDark', { seg: 8 });
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) k.box([sx * 0.042, -0.006 - i * 0.004, 0.06 + i * 0.045], [0.012, 0.01, 0.01], 'chrome');
  }
  return { kind: 'melee', twoHanded: true, tip: v(0, -0.04, -0.85), leftHand: v(0, 0, 0.03), muzzle: null, mag: null, pump: null, slide: null };
}

export const MELEE = { fireaxe, crowbar, cricket_bat, baseball_bat, katana, knife, golf_club, frying_pan, machete, guitar };
