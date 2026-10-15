// Pickup items / throwables / carryables. Authored roughly bottom-centred; itemmodels.js
// re-grounds every item so the origin is exactly at the bottom-centre, front facing +Z.

function medkit({ k, vm, v }) {
  k.box([0, 0.11, 0], [0.3, 0.22, 0.09], 'red', { taper: [0.96, 0.9] });
  k.box([0, 0.11, 0], [0.306, 0.226, 0.022], 'redDark', { skip: { front: true, back: true } });
  for (const sz of [1, -1]) k.box([0, 0.11, sz * 0.046], [0.13, 0.13, 0.006], 'white', { f: sz > 0 ? { front: 'dCross' } : { back: 'dCross' }, skip: sz > 0 ? { back: true } : { front: true } });
  k.box([0, 0.236, 0], [0.13, 0.014, 0.026], 'black');
  for (const sx of [-1, 1]) k.box([sx * 0.058, 0.225, 0], [0.014, 0.014, 0.02], 'black', { skip: { top: true, bottom: true } });
  if (vm) for (const sx of [-1, 1]) k.box([sx * 0.11, 0.11, 0.0], [0.02, 0.222, 0.092], 'black', { skip: { top: true, bottom: true, left: true, right: true } });
  return { category: 'health' };
}

function defib({ k, vm, v, seg }) {
  k.box([0, 0.055, 0], [0.32, 0.11, 0.23], 'yellow', { taper: [0.97, 0.95] });
  k.box([0, 0.112, 0], [0.31, 0.012, 0.22], 'orange');
  k.box([0, 0.121, -0.055], [0.11, 0.006, 0.09], 'dark', { f: { top: 'dBolt' }, skip: { bottom: true } });
  k.box([0, 0.06, 0.117], [0.12, 0.05, 0.004], 'dark', { skip: { back: true } });
  for (const sx of [-1, 1]) {
    k.box([sx * 0.085, 0.13, 0.055], [0.085, 0.022, 0.075], 'darksteel', { taper: [0.9, 0.9] });
    k.cyl([sx * 0.085, 0.16, 0.055], 0.016, 0.04, 'black', { seg: 6 });
    k.box([sx * 0.085, 0.183, 0.055], [0.05, 0.012, 0.022], 'red');
  }
  k.box([0, 0.08, -0.12], [0.12, 0.016, 0.018], 'black');
  if (vm) for (const sx of [-1, 1]) k.box([sx * 0.13, 0.125, 0.03], [0.008, 0.008, 0.1], 'black');
  return { category: 'health' };
}

function pills({ k, vm, v, seg }) {
  const s = seg(8, 10);
  k.cyl([0, 0.036, 0], 0.024, 0.072, [0xf07010, 'glass'], { seg: s, cap1: false });
  k.cyl([0, 0.034, 0], 0.0252, 0.03, 'whiteFlat', { seg: s, caps: false });
  k.cyl([0, 0.08, 0], 0.026, 0.018, 'white', { seg: s });
  if (vm) k.cyl([0, 0.034, 0], 0.025, 0.008, 'red', { seg: s, caps: false });
  return { category: 'health' };
}

function adrenaline({ k, vm, v }) {
  const y = 0.017;
  k.cyl([-0.005, y, 0], 0.0155, 0.1, 'white', { axis: 'x', seg: 6, cap1: false });
  k.cyl([-0.012, y, 0], 0.016, 0.035, 'yellow', { axis: 'x', seg: 6, caps: false });
  k.cyl([0.062, y, 0], 0.017, 0.036, 'orange', { axis: 'x', seg: 6, cap0: false });
  k.cyl([-0.064, y, 0], 0.0105, 0.02, 'grey', { axis: 'x', seg: 6 });
  k.box([-0.056, y, 0], [0.006, 0.03, 0.04], 'white');
  if (vm) k.box([0.022, y, 0.0], [0.03, 0.006, 0.033], 'glassClear');
  return { category: 'health' };
}

function pipebomb({ k, vm, v, part }) {
  const y = 0.03;
  k.cyl([0, y, 0], 0.024, 0.17, 'darksteel', { axis: 'x', seg: 6, caps: false });
  for (const sx of [-1, 1]) k.cyl([sx * 0.094, y, 0], 0.03, 0.024, 'darksteel', { axis: 'x', seg: 6 });
  for (const sx of [-1, 1]) k.cyl([sx * 0.038, y, 0], 0.0258, 0.03, [0xb8b8b0, 'grime'], { axis: 'x', seg: 6, caps: false });
  k.box([0, y + 0.03, 0], [0.05, 0.014, 0.034], 'black');
  k.box([0.03, y + 0.029, 0.012], [0.03, 0.004, 0.004], 'red');
  k.box([0.03, y + 0.029, -0.012], [0.03, 0.004, 0.004], 'blue');
  k.box([0.116, y, 0], [0.02, 0.005, 0.005], 'cloth');
  const light = part('light', [0, y + 0.043, 0], (s) => s.box([0, y + 0.043, 0], [0.014, 0.012, 0.014], 'lightRed', { skip: { bottom: true } }));
  return { category: 'throwable', light };
}

function molotov({ k, vm, v, seg }) {
  const s = seg(6, 8);
  k.cyl([0, 0.07, 0], 0.034, 0.14, 'glassBrown', { seg: s, cap1: false });
  k.cyl([0, 0.155, 0], 0.034, 0.03, 'glassBrown', { seg: s, r2: 0.014, caps: false });
  k.cyl([0, 0.195, 0], 0.013, 0.05, 'glassBrown', { seg: s, caps: false });
  k.cyl([0, 0.075, 0], 0.0345, 0.06, 'cardboard', { seg: s, caps: false });
  k.box([0, 0.232, 0], [0.024, 0.04, 0.024], 'cloth', { taper: [1.2, 1.2] });
  k.push([0.018, 0.212, 0], [0, 0, -0.25]); k.box([0, 0, 0], [0.008, 0.06, 0.03], 'cloth'); k.pop();
  k.push([-0.006, 0.258, 0.004], [0.3, 0.4, 0.5]); k.box([0, 0, 0], [0.03, 0.016, 0.022], 'cloth'); k.pop();
  return { category: 'throwable', wick: v(0, 0.265, 0) };
}

function bilejar({ k, vm, v, seg }) {
  const s = seg(8, 10);
  k.cyl([0, 0.05, 0], 0.042, 0.1, 'bile', { seg: s, cap1: false });
  k.cyl([0, 0.11, 0], 0.042, 0.02, 'glassGreen', { seg: s, r2: 0.037, caps: false });
  k.cyl([0, 0.129, 0], 0.039, 0.018, 'darksteel', { seg: s });
  k.box([0, 0.139, 0], [0.082, 0.003, 0.02], 'cloth', { skip: { bottom: true } });
  if (vm) k.cyl([0, 0.06, 0], 0.0425, 0.03, 'cloth', { seg: s, caps: false });
  return { category: 'throwable' };
}

function upgrade_incendiary({ k, vm, v }) {
  k.box([0, 0.1, 0], [0.32, 0.2, 0.2], [0x6e5a36, 'grime'], { taper: [0.9, 0.86] });
  k.box([0, 0.1, 0.101], [0.2, 0.14, 0.006], 'dFlame', { skip: { back: true } });
  k.box([0, 0.2, 0.0], [0.29, 0.012, 0.18], 'dFlame');
  k.box([0, 0.15, 0.09], [0.3, 0.07, 0.03], [0x5a4a2c, 'grime'], { skip: { back: true } });
  k.box([0, 0.225, 0], [0.12, 0.012, 0.03], 'black');
  for (const sx of [-1, 1]) k.box([sx * 0.055, 0.213, 0], [0.012, 0.016, 0.026], 'black', { skip: { top: true, bottom: true } });
  if (vm) for (const sx of [-1, 1]) k.box([sx * 0.11, 0.1, 0], [0.024, 0.202, 0.204], 'black', { skip: { top: true, bottom: true, left: true, right: true } });
  return { category: 'upgrade' };
}

function upgrade_explosive({ k, vm, v }) {
  k.box([0, 0.09, 0], [0.34, 0.18, 0.2], [0x3c4a58, 'metal']);
  k.box([0, 0.186, 0], [0.344, 0.012, 0.204], [0x2c3640, 'metal'], { f: { top: 'dBlast' } });
  k.box([0, 0.09, 0.101], [0.18, 0.13, 0.006], 'dBlast', { skip: { back: true } });
  for (const sx of [-1, 1]) k.box([sx * 0.13, 0.17, 0.104], [0.03, 0.03, 0.01], 'steel');
  k.box([0, 0.205, 0], [0.12, 0.012, 0.03], 'black');
  for (const sx of [-1, 1]) k.box([sx * 0.055, 0.197, 0], [0.012, 0.014, 0.026], 'black', { skip: { top: true, bottom: true } });
  if (vm) k.box([0, 0.04, 0.102], [0.33, 0.01, 0.004], 'yellow');
  return { category: 'upgrade' };
}

function laser_sight({ k, vm, v }) {
  k.box([0, 0.03, 0], [0.18, 0.06, 0.12], 'blued');
  k.box([0, 0.03, 0.061], [0.12, 0.016, 0.002], 'laser', { skip: { back: true } });
  k.box([0, 0.063, 0], [0.04, 0.006, 0.07], 'gunmetal');
  k.box([0, 0.08, -0.005], [0.05, 0.03, 0.08], 'black');
  k.cyl([0, 0.083, 0.045], 0.011, 0.014, 'black', { axis: 'z', seg: 6, capMat1: 'laser' });
  k.box([0.026, 0.09, -0.02], [0.006, 0.008, 0.012], 'red');
  return { category: 'upgrade' };
}

function gascan({ k, vm, v }) {
  k.box([0, 0.13, 0], [0.25, 0.26, 0.13], 'red', { taper: [0.94, 0.9] });
  for (const a of [0.7, -0.7]) { k.push([0, 0.13, 0.066], [0, 0, a]); k.box([0, 0, 0], [0.25, 0.022, 0.006], 'red', { skip: { back: true } }); k.pop(); }
  k.box([-0.04, 0.29, 0], [0.13, 0.018, 0.03], 'red');
  for (const x of [-0.098, 0.018]) k.box([x, 0.272, 0], [0.016, 0.022, 0.024], 'red', { skip: { top: true, bottom: true } });
  k.push([0.082, 0.26, 0], [0, 0, -0.55]);
  k.cyl([0, 0.035, 0], 0.016, 0.07, 'yellow', { seg: 6, cap1: false });
  k.cyl([0, 0.095, 0], 0.012, 0.05, 'yellow', { seg: 6, r2: 0.008 });
  k.cyl([0, 0.125, 0], 0.01, 0.012, 'black', { seg: 6 });
  k.pop();
  return { category: 'carry' };
}

function propane({ k, vm, v, seg }) {
  const s = seg(10, 12);
  k.cyl([0, 0.02, 0], 0.115, 0.04, 'white', { seg: s, caps: false });
  k.cyl([0, 0.045, 0], 0.11, 0.03, 'white', { seg: s, r2: 0.15, cap1: false });
  k.cyl([0, 0.21, 0], 0.15, 0.3, 'white', { seg: s, caps: false });
  k.cyl([0, 0.29, 0], 0.153, 0.025, 'red', { seg: s, caps: false });
  k.cyl([0, 0.38, 0], 0.15, 0.04, 'white', { seg: s, r2: 0.1, cap0: false, capMat1: 'grey' });
  k.cyl([0, 0.43, 0], 0.1, 0.06, 'white', { seg: s, caps: false });
  k.cyl([0, 0.43, 0], 0.095, 0.06, 'grey', { seg: s, caps: false, flip: true });
  k.cyl([0, 0.42, 0], 0.016, 0.04, 'brass', { seg: 6 });
  k.cyl([0, 0.445, 0], 0.032, 0.01, 'blued', { seg: 6 });
  k.box([0.03, 0.41, 0], [0.04, 0.014, 0.014], 'brass');
  if (vm) for (const sz of [-1, 1]) k.box([0, 0.442, sz * 0.1], [0.06, 0.022, 0.004], 'dark');
  return { category: 'carry' };
}

function oxygen({ k, vm, v, seg }) {
  const s = seg(8, 10);
  k.cyl([0, 0.3, 0], 0.075, 0.56, 'green', { seg: s, cap1: false });
  k.cyl([0, 0.605, 0], 0.075, 0.05, 'white', { seg: s, r2: 0.032, cap0: false });
  k.cyl([0, 0.4, 0], 0.077, 0.1, 'whiteFlat', { seg: s, caps: false });
  k.cyl([0, 0.645, 0], 0.02, 0.03, 'steel', { seg: 6 });
  k.box([0, 0.675, 0], [0.04, 0.035, 0.035], 'brass');
  k.cyl([0, 0.7, 0], 0.03, 0.01, 'blued', { seg: 6 });
  k.cyl([0.035, 0.675, 0], 0.008, 0.035, 'brass', { axis: 'x', seg: 6 });
  return { category: 'carry' };
}

function fireworks({ k, vm, v, seg }) {
  k.box([0, 0.09, 0], [0.36, 0.18, 0.26], 'cardboard', { f: { front: 'dStars', back: 'dStars' }, skip: { top: true } });
  k.box([0, 0.176, 0], [0.354, 0.002, 0.254], 'dark', { skip: { bottom: true, front: true, back: true, left: true, right: true } });
  const cols = ['red', 'blue', 'yellow', 'green', 'white', 'orange', 'red', 'yellow', 'blue'];
  const s = seg(5, 6);
  let n = 0;
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
    const h = 0.08 + ((n * 37) % 5) * 0.03, r = 0.026 + ((n * 13) % 3) * 0.005;
    const x = ix * 0.11 + ((n * 7) % 3 - 1) * 0.008, z = iz * 0.075;
    k.cyl([x, 0.176 + h / 2 - 0.02, z], r, h + 0.04, cols[n], { seg: s, cap0: false, capMat1: 'cardboard' });
    if (vm || n % 2 === 0) k.box([x, 0.176 + h - 0.015, z], [0.004, 0.025, 0.004], 'cloth');
    n++;
  }
  return { category: 'carry' };
}

function cola({ k, vm, v, seg }) {
  k.box([0, 0.06, 0], [0.2, 0.12, 0.13], 'red', { f: { front: 'dLabel', back: 'dLabel', left: 'dLabel', right: 'dLabel' }, skip: { top: true } });
  k.box([0, 0.118, 0], [0.198, 0.002, 0.128], 'dark', { skip: { bottom: true, front: true, back: true, left: true, right: true } });
  k.box([0, 0.165, 0], [0.19, 0.1, 0.006], 'white', { taper: [0.75, 1], f: { front: 'dLabel', back: 'dLabel' } });
  const s = seg(5, 6);
  for (const x of [-0.064, 0, 0.064]) for (const z of [-0.034, 0.034]) {
    k.cyl([x, 0.14, z], 0.028, 0.04, 'cola', { seg: s, r2: 0.012, caps: false });
    k.cyl([x, 0.185, z], 0.012, 0.05, 'cola', { seg: s, cap0: false, capMat1: 'red' });
    if (vm) k.cyl([x, 0.204, z], 0.013, 0.012, 'whiteFlat', { seg: s, caps: false });
  }
  return { category: 'carry' };
}

function ammo_pile({ k, vm, v }) {
  k.box([-0.04, 0.1, 0], [0.5, 0.2, 0.32], [0x6a6a3a, 'wood'], { f: { front: 'dStencil' } });
  k.push([0.03, 0.2, -0.01], [0, 0.22, 0]);
  k.box([0, 0.075, 0], [0.4, 0.15, 0.26], 'oliveDark', { f: { front: 'dStencil' } });
  k.push([0.0, 0.15, 0.0], [0, -0.35, 0]);
  k.box([0, 0.09, 0], [0.28, 0.18, 0.13], 'olive', { f: { front: 'dStencil' } });
  k.box([0, 0.182, 0], [0.29, 0.012, 0.14], 'oliveDark');
  k.box([0, 0.195, 0], [0.1, 0.012, 0.02], 'black');
  k.pop(); k.pop();
  k.push([-0.2, 0.0, 0.25], [0, 0.4, 0]);
  k.box([0, 0.09, 0], [0.28, 0.18, 0.13], 'olive', { f: { front: 'dStencil' } });
  k.box([0, 0.182, 0], [0.29, 0.012, 0.14], 'oliveDark');
  k.pop();
  const loose = [[0.12, 0.25, 0.3, 'yellow'], [0.2, 0.18, -0.5, 'green'], [0.05, 0.32, 1.1, 'cardboard'], [0.26, 0.3, 0.2, 'red']];
  for (const [x, z, a, m] of loose) { k.push([x, 0.025, z], [0, a, 0]); k.box([0, 0, 0], [0.1, 0.05, 0.065], m, { f: { top: 'white' } }); k.pop(); }
  return { category: 'ammo' };
}

export const ITEMS = { medkit, defib, pills, adrenaline, pipebomb, molotov, bilejar, upgrade_incendiary, upgrade_explosive, laser_sight, gascan, propane, oxygen, fireworks, cola, ammo_pile };
