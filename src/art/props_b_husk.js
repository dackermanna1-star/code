// Props B — husks. Translucent amber child-shells (alpha ~0.75), hollow, split down the back like
// the cicada shells on the oak; same ramps and outline as the husk sprites (sprites_husks.js) so
// a seated prop husk and a husk entity read as the same thing. Volumes are blob-shaded; hollow
// parts (eye sockets, the split, the inside) are drawn darker and more opaque on top.
//
// drawHusk(k, spec) — spec: { cx, seatY, floorY, size 0..1, view 'up'|'down'|'left'|'right',
//   head (view the head faces; ≠ view when 'turned'), pose 0|1, boy (breaker cap), clip }
// drawKneeling(k, spec) — Miss Adair: adult woman kneeling, bun, cat-eye glasses, red pen.
// drawFlakes(k, cx, floorY, size, seed) — a crumbled husk: a small pile of amber flakes.
import { PAL, mix, Blob, bay } from './props_b_kit.js';

export const HUSK_ALPHA = 0.76;
export const SHELL = ['#4a3214', '#6e4c1e', '#946a2c', '#b88234', PAL.amber_l, PAL.amber_ll];
export const SHELL_D = ['#3a2610', '#5a3c16', '#7a5622', '#9a6e2c', '#b88234'];
export const HAIR = [PAL.amber_dd, PAL.amber_d, '#8a5e24', PAL.amber, PAL.amber_l];
export const FACE = [PAL.amber, mix(PAL.amber, PAL.amber_l, 0.5), PAL.amber_l, mix(PAL.amber_l, PAL.amber_ll, 0.6), '#f8e2b0'];
export const HOLLOW = ['#140c04', '#22150a', '#34200e', '#4a3016'];
const RAMPS = [SHELL, HAIR, FACE, SHELL_D];
const M_SHELL = 0, M_HAIR = 1, M_FACE = 2, M_DARK = 3;
// parts (shade independently)
const P_HEAD = 1, P_TORSO = 2, P_ARM_L = 3, P_ARM_R = 4, P_LEG_L = 5, P_LEG_R = 6, P_CAP = 7, P_NECK = 8, P_HAND = 9;

/** 'a'..'f' / 'husk_c' / numbers → { size, pose, boy }. */
export function huskVariant(v) {
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (/boy|breaker|bb|^g$/.test(s)) return { key: 'boy', size: 0.35, pose: 1, boy: true };
    const m = s.match(/(?:husk_)?([a-f])/);
    if (m) return LETTERS[m[1]];
    if (/^\d+$/.test(s)) v = Number(s);
  }
  const n = typeof v === 'number' ? ((v | 0) % 6 + 6) % 6 : 0;
  return LETTERS['abcdef'[n]];
}
const LETTERS = {
  a: { key: 'a', size: 0.0, pose: 0 },
  b: { key: 'b', size: 0.22, pose: 1 },
  c: { key: 'c', size: 0.42, pose: 0 },
  d: { key: 'd', size: 0.6, pose: 1 },
  e: { key: 'e', size: 0.8, pose: 0 },
  f: { key: 'f', size: 1.0, pose: 1 },
};

function dims(size) {
  return {
    rx: 4, ry: size > 0.55 ? 5 : 4,
    sw: 4 + Math.round(size * 1.6),            // half shoulder width
    torso: 7 + Math.round(size * 3),           // seat → shoulder line
    neck: size > 0.5 ? 2 : 1,
    arm: 1 + (size > 0.7 ? 1 : 0),             // arm thickness - 1
    thigh: 4 + Math.round(size * 3),
  };
}

/** Seated child husk. Draws into k (translucent). */
export function drawHusk(k, spec) {
  const { cx, seatY, floorY = seatY + 7, size = 0.3, view = 'down', pose = 0, boy = false } = spec;
  const head = spec.head || view;
  const D = dims(size);
  const b = new Blob(k.w, k.h, k.ox, k.oy);
  const shY = seatY - D.torso;
  const hcy = shY - D.neck - D.ry + 1;
  const det = []; // detail ops after shading: [fn]

  // ---- body ----
  if (view === 'up' || view === 'down') {
    // torso: rounded shoulders, slight taper to the waist
    b.poly([[cx - D.sw + 1, shY], [cx + D.sw, shY], [cx + D.sw + 1, shY + 2], [cx + D.sw - 1, seatY + 1], [cx - D.sw + 1, seatY + 1], [cx - D.sw, shY + 2]], M_SHELL, P_TORSO);
    // arms hanging, slightly apart from the torso
    const ay0 = shY + 1, ay1 = seatY - (pose ? 1 : 2);
    const ax = D.sw + 1;
    b.R(cx - ax - D.arm, ay0, 2 + D.arm - 1, ay1 - ay0, M_SHELL, P_ARM_L);
    b.R(cx + ax - 1 + (D.arm ? 0 : 1), ay0, 2 + D.arm - 1, ay1 - ay0, M_SHELL, P_ARM_R);
    if (view === 'down') {
      // lap: thighs coming toward the viewer (foreshortened, lit on top), knees, shins, feet
      const kneeY = seatY + 2, tw = D.sw;
      b.R(cx - tw, seatY - 1, tw, kneeY - seatY + 2, M_SHELL, P_LEG_L, 0.12);
      b.R(cx + 1, seatY - 1, tw, kneeY - seatY + 2, M_SHELL, P_LEG_R, 0.12);
      const sh0 = kneeY + 2;
      b.R(cx - tw + 1, sh0, tw - 2, floorY - sh0 - 1, M_DARK, P_LEG_L);
      b.R(cx + 2, sh0, tw - 2, floorY - sh0 - 1, M_DARK, P_LEG_R);
      b.R(cx - tw + 1, floorY - 2, tw - 1, 2, M_DARK, P_LEG_L);
      b.R(cx + 2, floorY - 2, tw - 1, 2, M_DARK, P_LEG_R);
      // forearms forward, hands resting on the knees (pose 1) or folded in the lap (pose 0)
      if (pose) { b.R(cx - tw - 1, kneeY - 1, 3, 2, M_FACE, P_HAND); b.R(cx + tw - 1, kneeY - 1, 3, 2, M_FACE, P_HAND); }
      else { b.R(cx - 3, seatY, 3, 2, M_FACE, P_HAND); b.R(cx + 1, seatY, 3, 2, M_FACE, P_HAND); }
      det.push(() => { // gap between the knees, the shadow under the lap, hooked fingertips
        for (let y = seatY + 1; y < floorY - 1; y++) k.P(cx, y, 'rgba(20,12,4,0.6)');
        k.H(cx - tw + 1, kneeY + 1, tw - 2, 'rgba(20,12,4,0.45)'); k.H(cx + 2, kneeY + 1, tw - 2, 'rgba(20,12,4,0.45)');
        if (pose) { k.P(cx - tw - 1, kneeY + 1, 'rgba(62,42,16,0.85)'); k.P(cx + tw + 1, kneeY + 1, 'rgba(62,42,16,0.85)'); }
        else { k.P(cx - 3, seatY + 2, 'rgba(62,42,16,0.85)'); k.P(cx + 3, seatY + 2, 'rgba(62,42,16,0.85)'); }
      });
    } else {
      // back view: shoulder blades, the split, heels just visible under the seat
      det.push(() => backSplit(k, cx, shY, seatY, D));
    }
    // segment ridges across the torso
    for (let y = shY + 3; y < seatY; y += 2) for (let x = cx - D.sw; x <= cx + D.sw; x++) if (b.get(x, y) === M_SHELL && b.getPart(x, y) === P_TORSO) b.set(x, y, M_SHELL, P_TORSO, -0.18);
    for (let y = shY + 4; y < seatY; y += 3) for (const x of [cx - D.sw - 1, cx - D.sw - 2, cx + D.sw + 1, cx + D.sw + 2]) if (b.get(x, y) === M_SHELL) b.set(x, y, M_SHELL, b.getPart(x, y), -0.2);
  } else {
    // profile: s = +1 facing right, -1 facing left
    const s = view === 'right' ? 1 : -1;
    const tw = Math.max(5, D.sw + 1);
    const bx = cx - s * 1; // torso centre sits a little behind the hips
    b.poly([[bx - 2 * s, shY], [bx + (tw - 3) * s, shY], [bx + (tw - 2) * s, seatY + 1], [bx - 3 * s, seatY + 1], [bx - 3 * s, shY + 2]].map(([x, y]) => [x + (s < 0 ? 1 : 0), y]), M_SHELL, P_TORSO);
    // thigh forward, knee, shin to the floor, foot
    const kx = cx + s * (D.thigh + 1);
    const tx0 = Math.min(cx, kx), tx1 = Math.max(cx, kx);
    b.R(tx0, seatY - 2, tx1 - tx0 + 1, 3, M_DARK, P_LEG_L);
    b.R(kx - (s > 0 ? 2 : 0), seatY - 1, 3, floorY - seatY, M_DARK, P_LEG_R);
    b.R(kx - (s > 0 ? 2 : 0) + (s > 0 ? 0 : -1), floorY - 1, 4, 2, M_DARK, P_LEG_R);
    // arm: shoulder → elbow → hand resting on the knee
    const axs = bx + s * 1;
    b.R(axs - 1, shY + 1, 3, D.torso - 3, M_SHELL, P_ARM_L);
    b.R(Math.min(axs, kx - s * 2), seatY - 3, Math.abs(kx - s * 2 - axs) + 2, 2, M_SHELL, P_ARM_L);
    b.R(kx - s * 2 - 1, seatY - 4, 3, 2, M_SHELL, P_HAND);
    for (let y = shY + 3; y < seatY - 1; y += 2) for (let x = bx - 4; x <= bx + tw; x++) if (b.getPart(x, y) === P_TORSO) b.set(x, y, M_SHELL, P_TORSO, -0.18);
    det.push(() => { // the split as a ragged open lip along the back
      const back = bx - (s > 0 ? 3 : -3) + (s < 0 ? 1 : 0);
      for (let y = shY; y < shY + Math.min(6, D.torso - 1); y++) {
        k.P(back + (y & 1 ? 0 : -s), y, 'rgba(20,12,4,0.85)');
        k.P(back + s, y, 'rgba(240,207,140,0.7)');
      }
    });
  }
  // neck
  b.R(cx - 1, shY - D.neck, 3, D.neck + 1, M_SHELL, P_NECK);

  // ---- head ----
  headShape(b, cx + (head !== view && view === 'up' ? 0 : 0), hcy, D, head, boy);

  b.render(k, RAMPS, { reach: 4, vw: 0.7, edge: 0.45, rim: 0.4, alpha: HUSK_ALPHA, outline: PAL.amber_dd, outlineAlpha: 0.55, dither: false });
  // details: drawn on a layer for translucency
  for (const fn of det) fn();
  headDetail(k, cx, hcy, D, head, view, boy, spec.turned);
  // waxy specular glints
  k.P(cx - 2, hcy - D.ry + 1, 'rgba(255,244,216,0.85)');
  k.P(cx - D.sw + 1, shY + 1, 'rgba(255,244,216,0.55)');
}

function headShape(b, cx, cy, D, head, boy) {
  const { rx, ry } = D;
  if (head === 'down') {
    b.E(cx, cy, rx, ry, M_FACE, P_HEAD);
    // hair cap over the top and sides
    for (let y = cy - ry; y <= cy - 1; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      if (b.get(x, y) !== M_FACE) continue;
      const top = y < cy - ry + 3;
      const side = Math.abs(x - cx) >= rx - 1;
      if (top || side) b.set(x, y, M_HAIR, P_HEAD);
    }
    b.R(cx - 1, cy + ry, 3, 1, M_FACE, P_HEAD); // chin
  } else if (head === 'up') {
    b.E(cx, cy, rx, ry, M_HAIR, P_HEAD);
    b.R(cx - rx + 1, cy + ry, rx * 2 - 1, 1, M_HAIR, P_HEAD);
  } else {
    const s = head === 'right' ? 1 : -1;
    b.E(cx, cy, rx, ry, M_HAIR, P_HEAD);
    // face on the leading side
    for (let y = cy - 1; y <= cy + ry; y++) for (let x = cx; x !== cx + s * (rx + 2); x += s) if (b.get(x, y) === M_HAIR && Math.abs(x - cx) >= 1) b.set(x, y, M_FACE, P_HEAD);
    b.set(cx + s * (rx + 1), cy + 1, M_FACE, P_HEAD); // nose
    b.R(cx + s * 2 - (s < 0 ? 1 : 0), cy + ry, 2, 1, M_FACE, P_HEAD);
  }
  if (boy) { // flat cap: crown + a short brim toward the face
    const fwd = head === 'left' ? -1 : head === 'right' ? 1 : 0;
    b.E(cx, cy - ry + 2, rx + 1, 2, M_DARK, P_CAP);
    if (head === 'down') b.R(cx - rx, cy - ry + 3, rx * 2 + 1, 2, M_DARK, P_CAP);
    else if (fwd) b.R(cx + fwd * 2 - (fwd < 0 ? 3 : 0), cy - ry + 3, 5, 1, M_DARK, P_CAP);
  }
}

function headDetail(k, cx, cy, D, head, view, boy, turned) {
  const hol = 'rgba(20,12,4,0.9)', hol2 = 'rgba(52,32,14,0.85)';
  if (head === 'down') {
    // hollow eye sockets, a slack mouth slit
    const ey = cy + (D.ry > 4 ? 1 : 0) + (turned ? -1 : 0);
    k.R(cx - 3, ey, 2, 2, hol); k.R(cx + 2, ey + (turned ? 1 : 0), 2, 2, hol);
    k.P(cx - 3, ey - 1, hol2); k.P(cx + 3, ey - 1 + (turned ? 1 : 0), hol2);
    k.R(cx, ey + 3, 1, 1, hol2);
    if (boy) k.R(cx - 1, cy - D.ry + 1, 3, 2, mix(PAL.brass_d, PAL.amber_dd, 0.4)); // cap lamp (dark tin)
  } else if (head === 'up') {
    // the split runs up into the back of the head; a couple of combed strands
    k.P(cx, cy + D.ry, hol); k.P(cx - 1, cy + D.ry - 1, hol2); k.P(cx - 1, cy + D.ry - 2, 'rgba(52,32,14,0.6)');
    k.P(cx - 2, cy - 1, 'rgba(62,42,16,0.45)'); k.P(cx - 2, cy, 'rgba(62,42,16,0.45)'); k.P(cx + 2, cy - 2, 'rgba(62,42,16,0.45)'); k.P(cx + 2, cy - 1, 'rgba(62,42,16,0.45)');
  } else {
    const s = head === 'right' ? 1 : -1;
    k.R(cx + s * (D.rx - 1) - (s < 0 ? 1 : 0), cy + (D.ry > 4 ? 1 : 0), 2, 2, hol);
    k.P(cx + s * D.rx, cy + 3 + (D.ry > 4 ? 1 : 0), hol2);
    k.P(cx - s * 1, cy + 1, 'rgba(62,42,16,0.6)'); // ear
    if (boy) k.P(cx + s * (D.rx - 1), cy - D.ry + 1, mix(PAL.brass_d, PAL.amber_dd, 0.4));
  }
}

/** The split down the back: a dark seam opening between the shoulders, the shell's lips curled out. */
function backSplit(k, cx, shY, seatY, D) {
  const top = shY - D.neck, bot = Math.min(seatY - 1, shY + Math.max(3, D.torso - 3));
  for (let y = top; y <= bot; y++) {
    const open = y <= shY + 2;
    if (open) {
      k.R(cx - 1, y, 2, 1, 'rgba(20,12,4,0.95)');
      if (y === shY || y === shY + 1) k.P(cx, y, 'rgba(70,44,18,0.95)'); // the hollow inside
      k.P(cx - 2, y, 'rgba(248,226,176,0.8)');
      k.P(cx + 1, y, 'rgba(184,130,52,0.85)');
    } else {
      k.P(cx, y, 'rgba(20,12,4,0.85)');
      k.P(cx - 1, y, 'rgba(240,207,140,0.55)');
    }
  }
}

/** Crumbled husk: a low pile of amber flakes with a curled fragment of shell. */
export function drawFlakes(k, cx, floorY, size, seed = 0) {
  const b = new Blob(k.w, k.h, k.ox, k.oy);
  const w = 5 + Math.round(size * 2);
  b.E(cx, floorY - 2, w, 2, M_SHELL, 1);
  b.E(cx - 1, floorY - 3, w - 2, 2, M_SHELL, 1);
  b.E(cx + 2, floorY - 4, 2, 1, M_HAIR, 2);
  b.render(k, RAMPS, { reach: 3, alpha: HUSK_ALPHA, outline: PAL.amber_dd, outlineAlpha: 0.45 });
  // loose flakes scattered around the pile
  const pts = [[-8, -1], [7, 0], [-6, -4], [5, -5], [9, -2], [-3, 1], [2, 1], [-9, 1], [4, -7], [-5, -6]];
  for (let i = 0; i < pts.length; i++) {
    if (((seed >> i) & 1) && i > 5) continue;
    const [dx, dy] = pts[i];
    k.P(cx + dx, floorY + dy, i % 3 ? 'rgba(217,168,90,0.8)' : 'rgba(168,117,47,0.85)');
    if (i % 2 === 0) k.P(cx + dx + 1, floorY + dy, 'rgba(107,74,28,0.7)');
  }
  // a fragment of an empty hand / curl of shell at the top
  k.P(cx - 2, floorY - 5, 'rgba(240,207,140,0.85)'); k.P(cx - 1, floorY - 6, 'rgba(217,168,90,0.8)');
  k.P(cx + 1, floorY - 3, 'rgba(20,12,4,0.8)'); k.P(cx - 3, floorY - 2, 'rgba(20,12,4,0.6)');
}

/**
 * Miss Adair's husk: a grown woman kneeling at a desk, head bowed over the page, hair pinned up,
 * cat-eye glasses (shell-coloured frames, hollow lenses), the red pen in her hand.
 * view 'down' = facing the viewer (place her directly NORTH of the writing_desk: the desk hides
 * her lap and her hands rest on its far edge); 'up' = back to the viewer (south of the desk);
 * 'left'/'right' = profile.
 */
export function drawKneeling(k, { cx, groundY, view = 'down' }) {
  const b = new Blob(k.w, k.h, k.ox, k.oy);
  const rx = 4, ry = 5;
  const shY = groundY - 15;          // kneeling: shoulders ~15 px above the knees' ground line
  const hcy = shY - 5 + (view === 'down' ? 1 : 0); // head bowed forward
  const sw = 5;
  const P = { head: 1, torso: 2, armL: 3, armR: 4, legs: 5, bun: 6, hand: 7 };
  if (view === 'down' || view === 'up') {
    // cardigan torso (slightly hunched), hips, folded legs
    b.poly([[cx - sw + 1, shY], [cx + sw, shY], [cx + sw + 1, shY + 3], [cx + sw, groundY - 6], [cx - sw, groundY - 6], [cx - sw, shY + 3]], M_SHELL, P.torso);
    b.E(cx, groundY - 4, sw + 1, 3, M_DARK, P.legs);
    if (view === 'down') {
      // forearms reaching forward/down to the desk edge, the pen hand on the right
      b.R(cx - sw - 1, shY + 1, 2, 7, M_SHELL, P.armL);
      b.R(cx + sw, shY + 1, 2, 7, M_SHELL, P.armR);
      b.R(cx - sw, shY + 7, 4, 3, M_SHELL, P.armL);
      b.R(cx + sw - 3, shY + 7, 4, 3, M_SHELL, P.armR);
      b.R(cx - 3, shY + 9, 3, 2, M_FACE, P.hand);
      b.R(cx + 2, shY + 9, 3, 2, M_FACE, P.hand);
    } else {
      b.R(cx - sw - 1, shY + 1, 2, 9, M_SHELL, P.armL);
      // right arm raised forward to the desk above her
      b.R(cx + sw - 1, shY - 4, 2, 6, M_SHELL, P.armR);
      b.R(cx + sw - 1, shY - 6, 3, 2, M_FACE, P.hand);
      // soles of the feet behind the knees
      b.R(cx - 4, groundY - 2, 3, 2, M_DARK, P.legs); b.R(cx + 2, groundY - 2, 3, 2, M_DARK, P.legs);
    }
    for (let y = shY + 2; y < groundY - 6; y += 2) for (let x = cx - sw; x <= cx + sw; x++) if (b.getPart(x, y) === P.torso) b.set(x, y, M_SHELL, P.torso, -0.16);
    b.R(cx - 1, shY - 2, 3, 3, M_SHELL, 8);
    // head: bowed (down) shows the crown, the bun and the brow; (up) the bun and the nape
    b.E(cx, hcy, rx, ry, view === 'down' ? M_FACE : M_HAIR, P.head);
    if (view === 'down') for (let y = hcy - ry; y < hcy; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) if (b.getPart(x, y) === P.head && (y < hcy - 1 || Math.abs(x - cx) >= rx - 1)) b.set(x, y, M_HAIR, P.head);
    b.E(cx + (view === 'down' ? 0 : 0), hcy - ry, 3, 2, M_HAIR, P.bun);
  } else {
    const s = view === 'right' ? 1 : -1;
    // thighs slanting forward from the knees (on the ground), shins folded back under her
    b.poly([[cx - 3 * s, groundY - 1], [cx + 3 * s, groundY - 1], [cx + 2 * s, groundY - 7], [cx - 3 * s, groundY - 7]], M_DARK, P.legs);
    b.R(Math.min(cx - 7 * s, cx - 2 * s), groundY - 2, 6, 2, M_DARK, P.legs);
    // torso leaning forward
    b.poly([[cx - 3 * s, groundY - 7], [cx + 3 * s, groundY - 7], [cx + 5 * s, shY + 1], [cx - 1 * s, shY - 1]], M_SHELL, P.torso);
    for (let y = shY + 2; y < groundY - 7; y += 2) for (let x = cx - 6; x <= cx + 6; x++) if (b.getPart(x, y) === P.torso) b.set(x, y, M_SHELL, P.torso, -0.16);
    // arm reaching forward to the desk, pen hand
    b.R(Math.min(cx + 2 * s, cx + 8 * s), shY + 3, 7, 2, M_SHELL, P.armR);
    b.R(cx + 8 * s - (s < 0 ? 2 : 0), shY + 2, 3, 3, M_FACE, P.hand);
    // head bowed forward, bun at the back
    const hx = cx + 4 * s;
    b.E(hx, hcy + 1, rx, ry, M_HAIR, P.head);
    for (let y = hcy - 1; y <= hcy + ry + 1; y++) for (let x = hx; x !== hx + s * (rx + 2); x += s) if (b.getPart(x, y) === P.head && Math.abs(x - hx) >= 1) b.set(x, y, M_FACE, P.head);
    b.E(hx - 3 * s, hcy - 3, 2, 2, M_HAIR, P.bun);
  }
  b.render(k, RAMPS, { reach: 4, vw: 0.7, edge: 0.45, rim: 0.4, alpha: HUSK_ALPHA, outline: PAL.amber_dd, outlineAlpha: 0.55, dither: false });
  const hol = 'rgba(20,12,4,0.9)';
  const frame = 'rgba(62,42,16,0.95)';
  if (view === 'down') {
    // cat-eye glasses on the bowed face: lenses hollow, upswept outer corners
    const gy = hcy + 1;
    k.R(cx - 4, gy, 3, 2, hol); k.R(cx + 2, gy, 3, 2, hol);
    k.H(cx - 4, gy - 1, 3, frame); k.H(cx + 2, gy - 1, 3, frame);
    k.P(cx - 5, gy - 2, frame); k.P(cx + 5, gy - 2, frame); // the wings
    k.P(cx - 5, gy - 1, frame); k.P(cx + 5, gy - 1, frame);
    k.P(cx - 1, gy, frame); k.P(cx + 1, gy, frame); k.P(cx, gy, frame);
    // the red pen in the right hand, nib toward the page
    pen(k, cx + 3, shY + 7, 1);
    backFold(k, cx, shY);
  } else if (view === 'up') {
    // split down the back of the cardigan, glasses arms at the temples
    for (let y = shY - 2; y < shY + 8; y++) { k.R(cx, y, y < shY + 3 ? 2 : 1, 1, 'rgba(20,12,4,0.92)'); k.P(cx - 1, y, 'rgba(240,207,140,0.75)'); }
    k.P(cx - rx - 1, hcy, frame); k.P(cx + rx + 1, hcy, frame);
    pen(k, cx + sw, shY - 9, 0);
  } else {
    const s = view === 'right' ? 1 : -1;
    const hx = cx + 4 * s;
    const ex = hx + s * (rx - 1) - (s < 0 ? 1 : 0);
    k.R(ex, hcy + 2, 2, 2, hol);
    k.H(ex - (s > 0 ? 1 : 0), hcy + 1, 3, frame);
    k.P(ex + s * 2 - (s < 0 ? 0 : 0), hcy, frame); // upswept wing
    k.L(ex - s * 1, hcy + 2, hx - s * 2, hcy + 1, frame); // temple arm
    // the split along the back
    for (let y = shY; y < shY + 6; y++) k.P(cx - 1 * s + (y & 1) * -s, y + 1, 'rgba(20,12,4,0.85)');
    pen(k, cx + 9 * s - (s < 0 ? 1 : 0), shY + 1, s > 0 ? 2 : 3);
  }
  k.P(cx - 2, hcy - ry - 1, 'rgba(255,244,216,0.8)');
}
function backFold(k, cx, shY) { k.P(cx, shY, 'rgba(62,42,16,0.6)'); }
/** The red Flair: the only saturated thing on her. o = orientation. */
function pen(k, x, y, o) {
  const body = PAL.red_l, dkc = PAL.red, tip = PAL.ink;
  if (o === 1) { k.P(x, y, body); k.P(x + 1, y + 1, body); k.P(x + 2, y + 2, dkc); k.P(x + 3, y + 3, tip); k.P(x - 1, y - 1, dkc); }
  else if (o === 0) { k.V(x, y, 4, body); k.P(x, y + 4, tip); k.P(x + 1, y + 1, dkc); }
  else if (o === 2) { k.P(x, y, dkc); k.P(x + 1, y + 1, body); k.P(x + 2, y + 2, body); k.P(x + 3, y + 3, tip); }
  else { k.P(x, y, dkc); k.P(x - 1, y + 1, body); k.P(x - 2, y + 2, body); k.P(x - 3, y + 3, tip); }
}

export { bay };
