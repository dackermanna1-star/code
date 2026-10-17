// MASTER PALETTE — every art module draws from these named colors (plus derived shades made
// with the helpers below). Art agents may retune hex values for harmony but must not rename or
// remove keys; add new keys at the end of a group if needed.
//
// Look: dirty institutional green, nicotine cream, faded mustard, cold moonlight blue, rust brown,
// wet black. Saturated accents are reserved for the supernatural (crimson sash, brass, husk amber,
// mine-fire red, safety orange).

export const PAL = {
  // darks & neutrals
  ink: '#0a0a0f', night: '#111219', shadow: '#1b1c27', g1: '#272834', g2: '#383946', g3: '#52525e',
  g4: '#75737c', g5: '#9c9897', g6: '#c4bdb0', white: '#f0ece2', paper: '#e4dbc2', paper_d: '#bfb393',

  // nicotine cream (upper walls, ceilings, paper)
  cream_d: '#9e9270', cream: '#c4b78c', cream_l: '#ded2a8',

  // institutional green (lower walls, lockers, chalkboards)
  green_dd: '#18241c', green_d: '#2a3d30', green: '#435e49', green_l: '#66826a', mint: '#93ab8e',
  slate: '#26332d', slate_l: '#3a4a42',

  // mustard / faded yellow
  mustard_d: '#6f5a24', mustard: '#9d812e', yellow: '#c9aa47', yellow_l: '#e6d188',

  // rust / browns / wood
  brown_dd: '#24170f', brown_d: '#42291b', brown: '#64402b', rust: '#874628', tan: '#9d7752', tan_l: '#c2a174',
  wood_d: '#43291a', wood: '#664427', wood_l: '#8c643b', maple: '#b88a55', maple_l: '#d6ad74',

  // brick
  brick_d: '#4a2019', brick: '#6e3226', brick_l: '#8e4a36', mortar: '#7a6d5e',

  // cold blues (moonlight, night sky, denim)
  blue_dd: '#0f1626', blue_d: '#1b2741', blue: '#2f4a72', blue_l: '#58789f', moon: '#97afcb', moon_l: '#c4d4e6',
  denim_d: '#3a5276', denim: '#56769e', denim_l: '#82a0c2', denim_ll: '#a9c0d8',

  // reds
  blood_d: '#330b0f', red_d: '#651219', red: '#9a2229', red_l: '#c8423b', crimson: '#84101f', crimson_l: '#b22234',
  velvet_d: '#3d0d14', velvet: '#6a1720',

  // skin (Tess, Danny, Leah — fair; Marcus, Denise — deep)
  skin_dd: '#6e4234', skin_d: '#a96f56', skin: '#d39a7a', skin_l: '#efc6a6', freckle: '#b6694a',
  dskin_dd: '#2a170f', dskin_d: '#4a2a1b', dskin: '#6d4129', dskin_l: '#94603f',

  // hair
  hair_r_dd: '#4e1a0e', hair_r_d: '#7c2812', hair_r: '#b2441b', hair_r_l: '#dc6f2c', hair_r_ll: '#f2995a',
  hair_k: '#17120f', hair_k_l: '#2e2520', hair_b: '#3d2a1c', hair_b_l: '#5e4430', hair_g: '#8e8a86', hair_g_l: '#c2beb8',

  // brass & gold (the Colonel's buttons, epaulettes, frames)
  brass_d: '#5e4a1c', brass: '#9a7d34', gold: '#cfae55', gold_l: '#f0d98c',

  // the Colonel's flesh & coat
  flesh_dd: '#5e4e4a', flesh_d: '#8a7670', flesh: '#bba79b', flesh_l: '#ddcdbf', flesh_sick: '#a8a487',
  navy_dd: '#0c1020', navy_d: '#161d36', navy: '#232e52', navy_l: '#36446e',

  // husks (translucent amber), cicada
  amber_dd: '#3e2a10', amber_d: '#6b4a1c', amber: '#a8752f', amber_l: '#d9a85a', amber_ll: '#f0cf8c',

  // safety-patrol orange
  orange_d: '#b8480f', orange: '#f06a1c', orange_l: '#ff9a3c',

  // fire / mine glow
  fire_dd: '#2e0a05', fire_d: '#5a1408', fire: '#b83a17', fire_l: '#f07a28', ember: '#ffb04a',

  // light colors
  fluor: '#d6efcf', fluor_d: '#a8c7a2', lamp_green: '#7fbf7a', exit_red: '#ff3b2e', crt: '#b9d8c2',
};

// Light presets used by lighting.js (color + defaults). Kept here so art & lighting agree on hues.
export const LIGHT_COLORS = {
  flashlight: '#fff1d6',   // warm white Maglite
  flashlight_dim: '#e8c890',
  moon: '#7f9cc4',
  exit_sign: '#ff3b2e',
  fluor: '#d6efcf',
  lamp_green: '#9ed69a',
  bulb: '#ffd59a',
  boiler: '#ff7a2a',
  candle: '#ffb860',
  lamp_miner: '#ffc070',
  spot: '#fff4e0',
  streetlamp: '#ffcf8a',
  headlights: '#fff6dc',
  crt: '#b9d8c2',
  led_red: '#ff2a1a',
  mine_fire: '#d03a12',
  lightning: '#dfe8ff',
  dawn: '#c9b6c8',
};

// ---- helpers ---------------------------------------------------------------------------------
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Linear mix of two hex colors, t in [0,1]. */
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export const darken = (c, t) => mix(c, '#000000', t);
export const lighten = (c, t) => mix(c, '#ffffff', t);
