// Garment catalogue.  Fitted garments are described by a signed field over the
// body surface (negative = covered) plus an offset (fabric thickness + ease).
// All distances are metres in the rest pose.  Landmarks come from BodyAtlas.L.

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export const SLOTS = [
  { id: 'bra', label: 'Bra' },
  { id: 'briefs', label: 'Briefs' },
  { id: 'legwear', label: 'Legwear' },
  { id: 'socks', label: 'Socks' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'dress', label: 'Dress' },
  { id: 'layer', label: 'Knit / layer' },
  { id: 'outer', label: 'Outerwear' },
  { id: 'shoes', label: 'Shoes' },
];

// ---------------------------------------------------------------- helpers
/** Bikini-style leg line: inside (negative) above the line. */
function legLine(s, { crotchDrop = 0.012, sideY, frontRise = 0, backDrop = 0.02 }) {
  const L = s.L;
  const ax = Math.abs(s.x);
  const front = smoothstep(-0.02, 0.06, s.z);
  const back = 1 - smoothstep(-0.06, 0.02, s.z);
  const yLine = mix(L.crotchY - crotchDrop, sideY + frontRise * front - backDrop * back, smoothstep(0.025, 0.165, ax));
  return yLine - s.y;
}

export const CATALOG = {};
function add(def) { CATALOG[def.id] = def; return def; }

// ---------------------------------------------------------------- underwear (base layer, always worn)
add({
  id: 'briefs_hipster', label: 'Hipster briefs', slot: 'briefs', locked: true, layer: 1,
  defaults: { material: 'microfiber', color: '#1e1b20' },
  fitted: {
    field: (s) => {
      const L = s.L;
      if (s.arm > 0.3) return 1;
      const top = s.y - (L.pelvis.y + 0.005 - 0.012 * smoothstep(0.0, 0.1, s.z));
      const leg = legLine(s, { sideY: L.pelvis.y - 0.045, frontRise: 0.015, backDrop: 0.035 });
      return Math.max(top, leg);
    },
    offset: () => 0.0012,
    smooth: 6,
    hem: 0.0015,
  },
});

add({
  id: 'bra_bralette', label: 'Soft bralette', slot: 'bra', locked: true, layer: 1,
  defaults: { material: 'microfiber', color: '#1e1b20' },
  fitted: {
    field: (s) => {
      const L = s.L;
      if (s.arm > 0.35 || s.head > 0.3) return 1;
      const tip = s.x > 0 ? L.breastTipL : L.breastTipR;
      // cups
      const dx = s.x - tip.x * 0.92, dy = s.y - (tip.y + 0.005);
      const cupR = 0.088;
      let cup = Math.hypot(dx * 1.05, dy) - cupR;
      cup = Math.max(cup, s.y - (tip.y + 0.06 - 0.03 * smoothstep(0.02, 0.1, Math.abs(s.x)) * 0));
      cup = Math.max(cup, 0.02 - s.z);
      // centre gore
      const gore = Math.max(Math.abs(s.x) - 0.012, Math.abs(s.y - (tip.y - 0.05)) - 0.025, 0.03 - s.z);
      // under-bust band (all the way round)
      const bandY = tip.y - 0.085;
      const band = Math.abs(s.y - bandY) - 0.017;
      // straps over the shoulders to the back band
      const sx = mix(0.085, 0.1, smoothstep(tip.y, L.neckBase.y, s.y));
      const strap = Math.max(Math.abs(Math.abs(s.x) - sx) - 0.0065, tip.y + 0.02 - s.y);
      return Math.min(cup, gore, band, strap);
    },
    offset: () => 0.0016,
    smooth: 10,
    hem: 0.0015,
  },
});
