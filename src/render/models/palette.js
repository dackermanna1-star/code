// Colours (sRGB hex) and paint schemes used by the model library.
// Camouflage is driven by seeded noise over model-space position so patches
// read as large irregular blotches rather than per-triangle speckle.

import { makeNoise, hashSeed, mulberry32 } from './geom.js';
import { VEHICLE_SPECS, AIRCRAFT_SPECS } from '../../sim/specs.js';

export const MODEL_PALETTE = {
  coalition: {
    paint: 0xb3a07a,       // CARC-like desert tan
    paintDark: 0x8f7f5e,
    patchGreen: 0x6b6a48,
    patchBrown: 0x7d6747,
    heli: 0x5d6247,        // olive drab
    jet: 0x80878e,         // medium grey
    jetDark: 0x6c7279,
    transport: 0x7b8289,
    canvas: 0x8e8162,
  },
  federation: {
    paint: 0x4d5631,       // dark olive green
    paintDark: 0x3a4126,
    camoBrown: 0x5e4a30,
    camoBlack: 0x1f201b,
    heli: 0x46553a,        // dark green
    jetGreen: 0x5f6b3f,
    jetBrown: 0x7a5d3c,
    jetUnder: 0xa9b9c7,    // light blue-grey
    transport: 0x8a9298,
    canvas: 0x5b5a40,
  },
  shared: {
    track: 0x36332f,
    track2: 0x45413b,
    rubber: 0x262625,
    steel: 0x77736c,
    darkSteel: 0x4b4945,
    gunmetal: 0x35383b,
    black: 0x111111,
    glass: 0x1e2b37,       // dark blue-grey
    glassLight: 0x34475a,
    lens: 0xcfcabb,
    redLens: 0x6e1a12,
    amberLens: 0x8a5a14,
    strap: 0x2a2a26,
    olive: 0x4f5435,
    wood: 0x5b4b3b,
    rust: 0x6b3e22,
    burnt: 0x262321,
  },
  lights: {
    head: 0xfff1cc,
    tail: 0xff2a14,
    navRed: 0xff2416,
    navGreen: 0x22ff55,
    white: 0xffffff,
    amber: 0xffa21c,
    ir: 0xff5a5a,
    screen: 0x5cff9a,
    ledBlue: 0x3fa0ff,
  },
};

const S = MODEL_PALETTE.shared;

// Threshold giving a target coverage: the q-quantile of f sampled (seeded)
// over a box of dims [w, h, l] centred on x/z, from y = y0.
function quantile(f, dims, q, seed, y0 = 0) {
  const r = mulberry32(seed);
  const vals = [];
  for (let i = 0; i < 600; i++) vals.push(f((r() - 0.5) * dims[0], y0 + r() * dims[1], (r() - 0.5) * dims[2]));
  vals.sort((a, b) => a - b);
  return vals[Math.floor(q * (vals.length - 1))];
}

// Cheap smooth irregular field in about [-1, 1] for subtle paint variation.
export function sineField(seed, f = 1) {
  const r = mulberry32(seed);
  const a = Array.from({ length: 9 }, () => r() * 6.28);
  return (x, y, z) => {
    x *= f; y *= f; z *= f;
    return 0.6 * Math.sin(x * 0.71 + y * 0.33 + a[0]) * Math.sin(z * 0.57 - x * 0.29 + a[1])
      + 0.4 * Math.sin(y * 1.13 + z * 0.41 + a[2]) * Math.sin(x * 1.37 - z * 0.83 + a[3])
      + 0.25 * Math.sin(x * 2.3 + y * 1.9 + z * 2.1 + a[4]);
  };
}

function warpField(noise, sx, sy, sz, warp = 0.6) {
  return (x, y, z) => {
    const w = noise(x * 0.3 + 11.1, y * 0.3 + 2.7, z * 0.3);
    const wx = x + warp * w, wz = z - warp * w;
    return noise(wx * sx, y * sy, wz * sz) + 0.22 * noise(wx * sx * 2.13 + 5.2, y * sy * 2.13, wz * sz * 2.13);
  };
}

function shared() {
  return {
    track: { color: S.track, vary: 0 },
    track2: { color: S.track2 },
    rubber: S.rubber,
    rubber2: 0x2b2a27,
    steel: S.steel,
    darkSteel: S.darkSteel,
    gunmetal: S.gunmetal,
    black: { color: S.black, grime: false },
    glass: { color: S.glass, grime: false },
    glassLight: { color: S.glassLight, grime: false },
    lens: { color: S.lens, grime: false },
    redLens: { color: S.redLens, grime: false },
    amberLens: { color: S.amberLens, grime: false },
    strap: S.strap,
    wood: S.wood,
    rust: S.rust,
    burnt: S.burnt,
  };
}

// Ground vehicle palette. `scale` stretches camo blotches for bigger vehicles.
export function groundPalette(faction, type, scale = 1) {
  const seed = hashSeed('ground', type, faction);
  const varyF = sineField(seed ^ 0x51ed, 0.9);
  if (faction === 0) {
    const C = MODEL_PALETTE.coalition;
    const nP = makeNoise(seed ^ 0x77);
    const patch = warpField(nP, 0.55 / scale, 0.6 / scale, 0.4 / scale);
    const tan = { base: C.paint, layers: [], cell: 1e9, vary: 0.07, varyF };
    return {
      ...shared(),
      paint: tan,
      paintS: tan,
      paintPlain: { color: C.paint, vary: 0.05, varyF },
      paintDark: { color: C.paintDark, vary: 0.05, varyF },
      // sparse dark patches for a little visual break-up on large panels
      paintPatch: { base: C.paint, layers: [{ f: patch, t: 0.38, color: C.patchBrown }], cell: 0.9 * scale, vary: 0.07, varyF },
      canvas: { color: C.canvas, vary: 0.08, varyF },
      canvas2: { color: 0x6f6a4f, vary: 0.08, varyF },
      jerry: 0x5d6040,
      skirtRubber: 0x2e2c27,
    };
  }
  const F = MODEL_PALETTE.federation;
  const nA = makeNoise(seed ^ 0xa1);
  const nB = makeNoise(seed ^ 0xb2);
  const brown = warpField(nA, 0.26 / scale, 0.3 / scale, 0.2 / scale);
  const black = warpField(nB, 0.5 / scale, 0.55 / scale, 0.36 / scale);
  const sp = VEHICLE_SPECS[type];
  const dims = sp ? [sp.width, sp.height, sp.length] : [3, 2.5, 7];
  const layers = [
    { f: brown, t: quantile(brown, dims, 0.69, seed ^ 0x51), color: F.camoBrown },
    { f: black, t: quantile(black, dims, 0.88, seed ^ 0x52), color: F.camoBlack },
  ];
  const camo = { base: F.paint, layers, cell: 1.0 * scale, vary: 0.06, varyF };
  return {
    ...shared(),
    paint: camo,
    // small parts take the green/brown colour at their location without splitting
    paintS: { ...camo, layers: [layers[0]], cell: 1e9, split: false },
    paintPlain: { color: F.paint, vary: 0.05, varyF },
    paintDark: { color: F.paintDark, vary: 0.05, varyF },
    paintPatch: camo,
    canvas: { color: F.canvas, vary: 0.08, varyF },
    canvas2: { color: 0x4a4a35, vary: 0.08, varyF },
    jerry: 0x47502f,
    skirtRubber: 0x2b2d24,
  };
}

// Aircraft palette. Coalition: olive drab helicopters, medium grey jets and
// transports. Federation: dark green helicopters, two-tone green/brown jets
// with light blue-grey undersides, grey transports.
export function airPalette(faction, type) {
  const seed = hashSeed('air', type, faction);

  const big = type === 'transport_plane' ? 2.2 : type === 'fpv_drone' ? 0.02 : type === 'recon_uav' ? 0.3 : 1;
  const varyF = sineField(seed ^ 0x3c1, 0.8 / big);
  const C = MODEL_PALETTE.coalition, F = MODEL_PALETTE.federation;
  const heli = type === 'attack_heli' || type === 'transport_heli';
  let base, under = null, camo = null;
  if (type === 'fpv_drone') base = faction ? 0x2c2f27 : 0x34363a;
  else if (type === 'recon_uav') base = faction ? 0x7d856f : 0x9aa0a4;
  else if (heli) base = faction ? F.heli : C.heli;
  else if (type === 'jet') {
    if (faction) {
      const nA = makeNoise(seed ^ 0x77a);
      const brown = (x, y, z) => {
        const w = nA(x * 0.2 + 3.3, y * 0.2, z * 0.2);
        return nA(x * 0.2 + w * 0.5, y * 0.24, z * 0.16 - w * 0.4) + 0.2 * nA(x * 0.45, y * 0.45 + 9.1, z * 0.4);
      };
      base = F.jetGreen;
      const sp = AIRCRAFT_SPECS[type];
      camo = [{ f: brown, t: quantile(brown, [sp.width, sp.height, sp.length], 0.55, seed ^ 0x53, -sp.height / 2), color: F.jetBrown }];
      under = F.jetUnder;
    } else base = C.jet;
  } else base = faction ? F.transport : C.transport;
  const layers = camo ? [...camo] : [];
  if (under) {
    // underside: faces pointing down, or below the fuselage waterline on the sides
    layers.push({ f: (x, y, z, nx, ny) => ny * 2.2 + (y - 0.05), t: 0, below: true, color: under, normal: true, refine: false });
  }
  const skin = layers.length
    ? { base, layers, cell: type === 'transport_plane' ? 2.4 : 1.5, vary: 0.05, varyF }
    : { color: base, vary: 0.06, varyF };
  const skinS = layers.length ? { ...skin, split: false } : skin;
  return {
    ...shared(),
    glass: { color: 0x2f4152, grime: false },
    paint: skin,
    paintS: skinS,
    paintPlain: { color: base, vary: 0.05, varyF },
    paintDark: { color: faction && type === 'jet' ? 0x4b5534 : darken(base, 0.72) },
    panel: { color: darken(base, 0.88), vary: 0.04, varyF },
    under: { color: under ?? lighten(base, 1.12), vary: 0.04, varyF },
    rotor: 0x2b2d2f,
    tip: faction ? 0xb8b8b0 : 0x8c8c86,
    radome: faction ? 0x5d6156 : darken(base, 0.9),
    missile: 0xd6d6cf,
    missileOlive: 0x5b6146,
    olive: S.olive,
    jerry: 0x5d6040,
    missileBand: 0xb59a2a,
    bomb: 0x585d45,
    pod: faction ? 0x4c5a3e : 0x5a5f4a,
    exhaust: 0x3a3633,
    nozzle: 0x5f5b56,
    intake: 0x161616,
    canvas: faction ? 0x5b5a40 : 0x8e8162,
    frame: faction ? 0x2a2b28 : 0x26282b,
    carbon: 0x1d1e20,
    battery: faction ? 0x3a4a6a : 0x2f4f7a,
    warhead: 0x4f5636,
    copper: 0x8a5a2e,
    yellow: 0xc9a227,
    lightGrey: 0xb9bdbf,
  };
}

function darken(hex, f) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return (Math.round(r * f) << 16) | (Math.round(g * f) << 8) | Math.round(b * f);
}

function lighten(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}
