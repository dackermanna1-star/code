import * as G from '../geo.js';

// =============================================================================
// Bus-world terrain shading (only used when the bus geography is mapped in:
// bus.html remaps ../geo.js -> src/bus/world/geo.js, GEO_FEATURES.bus).
//
//  * BUS_BAKE_FRAG: clipmap bake = (height incl. the road corridor + sea,
//    water mask, cut depth (natural - final: + cutting / - embankment),
//    curvature of the NATURAL terrain).
//  * BUS_LAND_GLSL: land cover along the coach route -
//      Cedar Bay farmland plain (small fields, hedgerows, woodlots),
//      Ridgefield pasture & orchards, forested Hollow Range (broadleaf ->
//      conifer -> alpine meadow / rock / late snow patches), the Hollow River
//      on the valley floor (water, gravel bars, riparian strip, meadows),
//      dry golden coastal terrace with scrub, bluffs and coves, towns;
//      road verges from the road field (gravel shoulder, mown grass, rock /
//      earth cuttings, grassed embankments).
//  * BUS_MAIN_LAND: lighting incl. cloud shadows / overcast diffuse and
//    the river surface, then aerial perspective.
// =============================================================================

const BUS = !!(G.GEO_FEATURES && G.GEO_FEATURES.bus);
const f1 = (v) => Number(v).toFixed(1);

// valley polyline with cumulative length (x, z, floor, along)
function valleyTable() {
  const V = G.VALLEY || [];
  const out = [];
  let cum = 0, pass = 0, passAlong = 0;
  for (let i = 0; i < V.length; i++) {
    if (i > 0) cum += Math.hypot(V[i][0] - V[i - 1][0], V[i][1] - V[i - 1][1]);
    out.push([V[i][0], V[i][1], V[i][2], cum]);
    if (V[i][2] > V[pass][2]) { pass = i; passAlong = cum; }
  }
  return { rows: out, passAlong, total: cum };
}

const VT = BUS ? valleyTable() : { rows: [], passAlong: 0, total: 0 };
// Ridgefield village (route.js STOP_DEFS 'ridgefield': dep + (-24300, -11350))
const RIDGE = [-24300, -11350];

export const BUS_BAKE_FRAG = !BUS ? '' : /* glsl */`
precision highp float;
${G.GEO_GLSL}
uniform vec2 uBakeOrigin;
uniform float uBakeScale;
uniform float uBlockX0;
uniform float uApron;
void main() {
  vec2 p = floor(gl_FragCoord.xy);
  vec2 ij = vec2(p.x - uBlockX0 - uApron, p.y - uApron);
  vec2 w = uBakeOrigin + ij * uBakeScale;
  float hn = geoNatural(w);
  float hl = geoApplyRoad(hn, busRoadSample(w));
  float m = geoWater(w);
  float h = mix(hl, ${f1(G.SEABED ?? -25)}, m);
  const float CD = 350.0;
  float lap = geoNatural(w + vec2(CD, 0.0)) + geoNatural(w - vec2(CD, 0.0)) + geoNatural(w + vec2(0.0, CD)) + geoNatural(w - vec2(0.0, CD)) - 4.0 * hn;
  gl_FragColor = vec4(h, m, (hn - hl) * (1.0 - m), lap * 0.25);
}`;

const N = VT.rows.length;
export const BUS_LAND_GLSL = !BUS ? '' : /* glsl */`
uniform float uBusWet;              // ground wetness 0..1 (weather)
uniform sampler2D tCloudShadow;     // clouds module ground shadow map (1x1 white until it exists)
uniform vec2 uCloudShadowCenter;
uniform float uCloudShadowSize;
uniform float uCloudShadowAmount;
float cloudShadow(vec2 worldXZ) {
  vec2 uv = (worldXZ - uCloudShadowCenter) / uCloudShadowSize + 0.5;
  float edge = smoothstep(0.0, 0.08, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
  float s = texture2D(tCloudShadow, clamp(uv, 0.0, 1.0)).r;
  return mix(1.0, s, edge * uCloudShadowAmount);
}

#define BUS_PASS_ALONG ${f1(VT.passAlong)}
const vec4 BUS_VAL[${N}] = vec4[${N}](
  ${VT.rows.map((r) => `vec4(${f1(r[0])}, ${f1(r[1])}, ${f1(r[2])}, ${f1(r[3])})`).join(',\n  ')});
// (signed lateral offset: + = right of the downstream / westward direction, along-valley metres, floor height, distance)
vec4 busValley(vec2 w) {
  float best = 1e12; vec4 r = vec4(0.0, 0.0, 0.0, 1e6);
  for (int i = 0; i < ${N - 1}; i++) {
    vec4 a = BUS_VAL[i], b = BUS_VAL[i + 1];
    vec2 ab = b.xy - a.xy;
    float L2 = dot(ab, ab);
    float t = clamp(dot(w - a.xy, ab) / L2, 0.0, 1.0);
    vec2 pd = w - (a.xy + ab * t);
    float d2 = dot(pd, pd);
    if (d2 < best) { best = d2; float L = sqrt(L2); r = vec4((ab.x * pd.y - ab.y * pd.x) / L, a.w + t * L, a.z + (b.z - a.z) * t, 0.0); }
  }
  r.w = sqrt(best);
  return r;
}

struct BusSurf {
  float rug;        // macro-relief strength (ruggedness)
  float river;      // river surface coverage
  float depth;      // river depth proxy (m)
  float riparian;   // trees along the banks (darker reflections)
  float wetK;       // how much the surface darkens when wet
  float valleyWall; // 0..1: walls rise around (river reflections show them)
};

// small irregular fields with hedgerows (European-style patchwork), rotated per 2 km cell
vec3 busFields(vec2 wm, float pw, float lush, vec4 nM, vec4 nK, vec4 nF, vec4 nH, inout float soilMix) {
  // 2 km farm blocks (everything relative to the block, so the 16 km detail period never shows)
  vec2 wmw = wm + nK.zw * 18.0 + nF.xy * 3.0;
  vec2 cellI = floor(wmw / 2048.0);
  vec2 local = wmw - cellI * 2048.0;
  vec2 cellA = cellI + uAnchor * 0.5;                          // absolute block index
  float ang = (hash12(cellA + 4.7) - 0.5) * 0.9;
  float ca = cos(ang), sa = sin(ang);
  vec2 q = mat2(ca, -sa, sa, ca) * (local - 1024.0) + 4096.0;
  // field grid: strips of ~900 m, column width per strip, rows per column
  float strip = floor(q.y / 900.0);
  float colW = 150.0 + 170.0 * hash12(vec2(strip, 1.0) + cellA * 1.7);
  float ci = floor(q.x / colW);
  float cf = q.x / colW - ci;
  float rowH = 120.0 + 260.0 * hash12(vec2(ci, strip) + cellA + 3.3);
  float ri = floor(q.y / rowH);
  float rf = q.y / rowH - ri;
  vec2 fid = vec2(ci, ri) + vec2(strip * 13.0, 0.0) + cellA * 97.0;
  vec2 fsz = vec2(colW, rowH);
  vec2 fm = vec2(cf, rf) * fsz;
  float rnd = hash12(fid + 0.37);
  // late June: ripening wheat & barley, green maize, beet / potato rows, cut hay, pasture, fallow
  vec3 col; float rows = 0.0, soilK = 0.0, rowAlongX = step(fsz.y, fsz.x);
  if (rnd < 0.20) { col = vec3(0.205, 0.172, 0.082) * (0.92 + 0.16 * fract(rnd * 41.0)); rows = 0.17; }       // wheat, golden green
  else if (rnd < 0.30) { col = vec3(0.245, 0.215, 0.120); rows = 0.15; }                                       // barley, paler
  else if (rnd < 0.42) { col = vec3(0.040, 0.078, 0.022); rows = 0.76; soilK = 0.25; }                         // maize
  else if (rnd < 0.50) { col = vec3(0.046, 0.088, 0.028); rows = 0.5; soilK = 0.3; }                           // beet / potatoes
  else if (rnd < 0.60) { col = vec3(0.150, 0.140, 0.075); rows = 0.0; }                                       // hay just cut (windrows)
  else if (rnd < 0.84) { col = mix(vec3(0.060, 0.090, 0.034), vec3(0.085, 0.104, 0.045), fract(rnd * 17.0)); }  // pasture / grass ley
  else if (rnd < 0.92) { col = vec3(0.115, 0.088, 0.058); rows = 1.2; soilK = 1.0; }                           // ploughed / fallow
  else { col = vec3(0.172, 0.160, 0.110); soilK = 0.6; }                                                       // stubble
  col = mix(col, col * vec3(0.8, 1.06, 0.8), lush * 0.4);
  col *= 0.88 + 0.22 * hash12(fid + 5.1);
  col *= 0.86 + 0.16 * nK.x + 0.10 * nF.x + 0.06 * nH.y;                                                       // soil / moisture patches
#if DETAIL > 0
  float coord = rowAlongX > 0.5 ? fm.y : fm.x;
  if (rows > 0.0 && pw < rows * 0.8) {
    float rw = abs(fract(coord / rows) - 0.5) * 2.0;
    float amp = (1.0 - sstep(rows * 0.3, rows * 0.8, pw));
    col = mix(col, soilK > 0.5 ? col * 0.7 : mix(col, vec3(0.11, 0.085, 0.055), 0.45), amp * sstep(0.4, 0.95, rw) * 0.7);
  }
  if (rnd < 0.30) col = mix(col, col * 0.78, lineAA(abs(fract(coord / 24.0) - 0.5) * 24.0, 0.5, pw) * 0.6);    // tramlines
  if (rnd >= 0.50 && rnd < 0.60) col = mix(col, vec3(0.19, 0.17, 0.09), lineAA(abs(fract(coord / 7.5) - 0.5) * 7.5, 1.4, pw) * 0.7); // windrows
  {
    float passW = 12.0 + 6.0 * floor(hash12(fid + 8.8) * 3.0);
    float pass = sstep(-0.3, 0.3, sin(coord * PI / passW)) * 2.0 - 1.0;
    col *= 1.0 + pass * 0.035 * (1.0 - sstep(passW * 0.35, passW * 0.9, pw));
  }
#endif
  soilMix = max(soilMix, soilK);
  // field margins + hedgerows / tree lines (most boundaries)
  float e = min(min(fm.x, fsz.x - fm.x), min(fm.y, fsz.y - fm.y));
  float sf = fract(q.y / 900.0) * 900.0;
  e = min(e, min(sf, 900.0 - sf));
  e = min(e, min(min(local.x, 2048.0 - local.x), min(local.y, 2048.0 - local.y)));
  col = mix(col, vec3(0.075, 0.098, 0.040), lineAA(e, 5.0 + 4.0 * hash12(fid + 4.4), pw) * 0.8);
  float hedgeSide = hash12(fid * 1.3 + 11.0);
  if (hedgeSide < 0.72) {
    float clump = 0.6 + 0.4 * nH.w;
    float gap = sstep(-0.55, -0.35, nF.z + nH.x * 0.3);   // gaps / gateways
    col = mix(col, vec3(0.022, 0.040, 0.016) * (0.8 + 0.45 * clump), lineAA(e, 6.0 * clump, pw) * 0.92 * gap);
  }
  return col;
}

vec3 busForest(float pw, float conifer, float dry, vec4 nF, vec4 nB, vec4 nK) {
  vec3 dec = mix(vec3(0.030, 0.056, 0.020), vec3(0.046, 0.072, 0.026), nF.z * 0.5 + 0.5);    // beech / oak / chestnut
  vec3 con = mix(vec3(0.017, 0.030, 0.015), vec3(0.027, 0.041, 0.020), nF.z * 0.5 + 0.5);    // pine / fir
  vec3 oak = mix(vec3(0.034, 0.042, 0.022), vec3(0.052, 0.054, 0.030), nF.y * 0.5 + 0.5);    // evergreen oak / chaparral
  vec3 c = mix(mix(dec, con, conifer), oak, dry);
  // stands of different age / species
  c *= 0.85 + 0.3 * (nK.w * 0.5 + 0.5);
#if DETAIL > 0
  float crown = nF.w * 0.6 + nB.z * 0.4;
  c *= 1.0 + crown * 0.55 * (1.0 - sstep(1.5, 6.0, pw));
#endif
  return c;
}

vec3 landAlbedo(vec2 wa, vec2 wm, float h, vec3 N, float dist, float pw, float cut, inout vec3 dn, inout float dnK, out BusSurf S) {
  S.rug = 0.0; S.river = 0.0; S.depth = 0.0; S.riparian = 0.0; S.wetK = 0.7; S.valleyWall = 0.0;
  vec2 dD = wa - uGeoDep, dA = wa - uGeoArr;
  float slope = 1.0 - N.y;
  vec4 nM = noiseT(wm / 16384.0);
  vec4 nK = noiseT(wm / 2048.0);
  vec4 nF = noiseT(wm / 256.0);
#if DETAIL > 0
  vec4 nH = noiseT(wm / 128.0);
  vec4 nB = noiseT(wm / 64.0);
#else
  vec4 nH = nF.yzwx, nB = nF.wzyx;
#endif
#if DETAIL > 0
  float nearF = 1.0 - sstep(120.0, 700.0, dist);
#else
  float nearF = 1.0 - sstep(60.0, 260.0, dist);
#endif
  float soilMix = 0.0;
  float farF = sstep(25.0, 140.0, pw);
  float valleyC = clamp(vCurv / 25.0, -1.0, 1.0);              // + hollow / - ridge
  float southFace = clamp(N.z * 3.0, -1.0, 1.0);               // +Z = south: sunny, drier

  // ---- regions
  float depPlain = 1.0 - sstep(10000.0, 24000.0, length(dD));
  float ridgeF = 1.0 - sstep(2500.0, 7000.0, length(wa - vec2(${f1(RIDGE[0])}, ${f1(RIDGE[1])})) + nK.y * 800.0);
  float shore = geoCoastX(dA.y) + 120.0 * geoVnoise(vec2(dA.y / 300.0, 3.7));
  float coastD = dA.x - shore;                                 // m inland from the gulf shore
  float coastal = (1.0 - sstep(5000.0, 21000.0, coastD + nM.x * 3000.0)) * (1.0 - sstep(26000.0, 34000.0, dA.y));
  float dry = clamp(coastal * 1.05 + southFace * 0.25 * coastal - valleyC * 0.3 + nM.y * 0.15, 0.0, 1.0);

  // ---- valley of the Hollow River (signed lateral offset, along, floor)
  vec4 rv = vec4(0.0, 0.0, 0.0, 1e6);
  if (wa.x < -24000.0 && wa.x > -68500.0 && wa.y > -20500.0 && wa.y < -9500.0) rv = busValley(wa);
  float vfw = geoValleyFloorW(wa);
  float floorH = rv.z + 0.004 * max(0.0, rv.w - 40.0);
  float onFloor = (1.0 - sstep(vfw * 0.85, vfw * 1.15, rv.w)) * (1.0 - sstep(2.0, 6.0, abs(h - floorH)));
  S.valleyWall = 1.0 - sstep(800.0, 2600.0, rv.w);

  // ---- farmland vs natural cover
  float flatness = 1.0 - sstep(0.035, 0.13, slope + nK.x * 0.02 - max(valleyC, 0.0) * 0.03);
  float lowland = 1.0 - sstep(300.0, 650.0, h + nM.y * 120.0);
  float agri = flatness * lowland * sstep(-0.35, 0.15, nM.x * 0.6 + nK.y * 0.25 + max(valleyC, 0.0) * 0.4 + depPlain * 0.6 + ridgeF * 0.5 - 0.1);
  agri = max(agri, depPlain * flatness * 0.96);
  agri *= 1.0 - coastal * 0.85;
  agri *= 1.0 - onFloor * 0.6;                                 // valley floor: meadows (below)
  float lush = clamp(1.0 - dry + max(valleyC, 0.0), 0.0, 1.0);
  vec3 farmMean = mix(vec3(0.098, 0.108, 0.052), vec3(0.150, 0.130, 0.070), dry) * (0.85 + 0.25 * nK.x + 0.12 * nM.z);
  vec3 col = farmMean;
  if (farF < 0.999 && agri > 0.001) col = mix(busFields(wm, pw, lush, nM, nK, nF, nH, soilMix), farmMean, farF);

  // natural: grass (green -> golden), forest (broadleaf -> conifer), scrub
  vec3 grassG = vec3(0.062, 0.086, 0.034) * (0.85 + 0.12 * nK.z + 0.1 * (nF.y * 0.5 + 0.5) + 0.08 * nM.w);
  vec3 grassD = vec3(0.228, 0.180, 0.092) * (0.88 + 0.12 * nK.z + 0.1 * (nF.y * 0.5 + 0.5));
  vec3 grassNat = mix(grassG, grassD, sstep(0.25, 0.75, dry));
  grassNat = mix(grassNat, vec3(0.13, 0.115, 0.07), sstep(0.3, 0.9, nK.x * 0.6 + nM.z * 0.5 + southFace * 0.3) * 0.35 * (1.0 - dry));
  float fN = nM.x * 0.35 + nM.y * 0.22 + nM.z * 0.18 + nK.x * 0.18 + nK.y * 0.12 + nK.w * 0.06;
  float mountain = sstep(120.0, 450.0, h) * (1.0 - coastal * 0.5);
  float fP = fN + slope * 2.4 + max(-valleyC, 0.0) * 0.12 - max(valleyC, 0.0) * 0.2 + mountain * 0.55
           - 0.18 - depPlain * 0.5 - ridgeF * 0.25 - dry * 0.32 - onFloor * 0.8 + (coastal * (-southFace) * 0.25);
  float treeLine = 1.0 - sstep(1650.0, 1950.0, h + nK.z * 120.0 - southFace * 80.0);
  float forestP = sstep(-0.03, 0.12, fP + (nK.w * 0.5 + nF.x * 0.5) * 0.08) * treeLine;
  forestP *= mix(1.0, 0.55 + 0.45 * sstep(-0.2, 0.3, nK.w + nF.y * 0.4), sstep(0.95, 0.4, forestP));
  float conifer = sstep(650.0, 1250.0, h + nK.w * 180.0 - southFace * 60.0);
  vec3 forest = busForest(pw, conifer, dry * 0.9, nF, nB, nK);
  // coastal scrub (chaparral / coyote brush): dark, patchy, on the terrace and north faces
  float scrubP = coastal * sstep(0.05, 0.45, nH.x * 0.5 + nF.z * 0.4 - southFace * 0.25 + max(valleyC, 0.0) * 0.6 + nK.y * 0.3);
  vec3 natural = mix(grassNat, mix(vec3(0.048, 0.056, 0.032), vec3(0.075, 0.074, 0.050), nF.w * 0.5 + 0.5), scrubP * 0.85);
  natural = mix(natural, forest, forestP);
  float shrub = sstep(0.55, 0.75, nH.w + nF.z * 0.3) * (1.0 - sstep(1.0, 4.0, pw)) * (0.3 + 0.5 * dry);
  natural = mix(natural, forest * 0.9, shrub * (1.0 - forestP));
  col = mix(natural, col, agri);

  // woodlots, tree lines along creeks (farmland), Ridgefield orchards
  float creekN = nM.x + 0.18 * nM.w + 0.25 * valleyC;
  float cw = fwidth(creekN);
  float creek = 1.0 - sstep(0.025 - cw, 0.025 + cw, abs(creekN - 0.1));
  float woodlot = sstep(0.52, 0.6, nM.z * 0.7 + nM.w * 0.3 + nK.y * 0.08) * (1.0 - dry * 0.8);
  col = mix(col, busForest(pw, 0.0, 0.0, nF, nB, nK) * 1.05, max(creek * (0.6 + 0.4 * nK.w), woodlot) * agri);
  float orchard = ridgeF * agri * sstep(0.1, 0.3, nK.z * 0.6 + nF.w * 0.3);
  if (orchard > 0.01) {
    vec2 og = fract(wm / vec2(6.4, 5.12));
    float tree = (1.0 - sstep(0.25, 0.42, length(og - 0.5))) * (1.0 - sstep(1.2, 3.0, pw));
    vec3 orc = mix(vec3(0.07, 0.09, 0.04), vec3(0.026, 0.05, 0.02), tree);
    orc = mix(orc, vec3(0.052, 0.068, 0.030), sstep(0.8, 3.0, pw));
    col = mix(col, orc, orchard);
  }

  // ---- valley floor: meadows, the river, gravel bars, riparian trees
  if (onFloor > 0.001) {
    vec3 meadow = mix(vec3(0.056, 0.090, 0.032), vec3(0.11, 0.115, 0.055), sstep(-0.2, 0.6, nK.z + nF.x * 0.3)) * (0.88 + 0.2 * (nH.y * 0.5 + 0.5));
    col = mix(col, meadow, onFloor * (1.0 - agri * 0.5) * (1.0 - forestP * 0.7));
    float a = rv.y - BUS_PASS_ALONG;                         // + downstream west of the pass, - east branch
    float rw = a > 0.0 ? mix(3.0, 34.0, sstep(400.0, 30000.0, a)) : mix(2.0, 13.0, sstep(400.0, 11000.0, -a));
    rw *= sstep(150.0, 900.0, abs(a)) * (0.85 + 0.3 * (geoVnoise(vec2(rv.y / 600.0, 2.2)) * 0.5 + 0.5));
    float rc = -vfw * (0.42 + 0.16 * geoVnoise(vec2(rv.y / 1300.0, 4.1))) + 22.0 * sin(rv.y / 190.0 + 3.0 * geoVnoise(vec2(rv.y / 700.0, 1.7)));
    float dr = abs(rv.x - rc);
    float edgeW = max(pw, 0.4);
    float wat = (1.0 - sstep(rw * 0.5 - edgeW, rw * 0.5 + edgeW, dr)) * onFloor;
    float barW = rw * (0.2 + 1.2 * sstep(-0.1, 0.6, geoVnoise(vec2(rv.y / 230.0, 7.7)) + nF.y * 0.3));
    float bar = (1.0 - sstep(rw * 0.5 + barW * 0.7, rw * 0.5 + barW, dr)) * onFloor * (1.0 - wat);
    vec3 gravel = mix(vec3(0.20, 0.19, 0.17), vec3(0.28, 0.26, 0.22), nH.z * 0.5 + 0.5) * (0.85 + 0.25 * nB.x);
    col = mix(col, gravel, bar);
    soilMix = max(soilMix, bar);
    float ripW = 10.0 + 22.0 * (nK.w * 0.5 + 0.5);
    float rip = (1.0 - sstep(rw * 0.5 + barW + ripW * 0.7, rw * 0.5 + barW + ripW, dr)) * sstep(rw * 0.5 + barW * 0.6, rw * 0.5 + barW + 2.0, dr);
    rip *= onFloor * sstep(-0.35, 0.0, nF.x + nH.w * 0.4) * step(0.5, rw);
    col = mix(col, vec3(0.030, 0.052, 0.022) * (0.85 + 0.35 * (nB.y * 0.5 + 0.5)), rip);
    S.riparian = 1.0 - sstep(rw * 0.5, rw * 0.5 + barW + ripW + 15.0, dr);
    S.river = wat;
    S.depth = (rw * 0.5 - dr) * 0.12 + 0.2;
  }

  // ---- mountains: alpine meadow, scree, rock, late snow patches
  vec3 rock = mix(vec3(0.120, 0.112, 0.100), vec3(0.185, 0.176, 0.160), nK.x * 0.5 + 0.5);       // limestone / granite grey
  rock = mix(rock, vec3(0.150, 0.118, 0.088), sstep(0.2, 0.7, nM.w) * 0.4);
  rock = mix(rock, vec3(0.230, 0.200, 0.155), coastal);                                          // coastal sandstone / mudstone
  float alpine = sstep(1650.0, 1950.0, h + nK.z * 140.0) * (1.0 - agri);
  vec3 alpineCol = mix(vec3(0.080, 0.092, 0.048), vec3(0.135, 0.125, 0.092), sstep(-0.3, 0.6, nK.w + southFace * 0.3));
  col = mix(col, alpineCol, alpine * (1.0 - forestP * 0.5));
  float rockP = sstep(0.24, 0.42, slope + max(-valleyC, 0.0) * 0.06 + nK.y * 0.05) * (0.45 + 0.55 * sstep(250.0, 1200.0, h) + coastal * 0.5);
  rockP = max(rockP, sstep(1800.0, 2150.0, h + nK.x * 150.0 - valleyC * 120.0) * 0.85);
  rockP *= 1.0 - agri * 0.9;
  rockP = clamp(rockP, 0.0, 1.0);
  col = mix(col, rock, rockP);
  float snowLine = 1850.0 + nM.y * 100.0 + nK.x * 80.0 + southFace * 300.0 - valleyC * 220.0;
  float snow = sstep(snowLine, snowLine + 120.0, h + nF.y * 30.0) * (1.0 - sstep(0.32, 0.55, slope));
  snow *= sstep(0.15, 0.5, nK.y * 0.5 + nK.z * 0.3 + valleyC * 0.7 - southFace * 0.6 + nF.x * 0.2);
  col = mix(col, vec3(0.72, 0.74, 0.78) * (0.9 + 0.1 * nF.z), snow);
  S.rug = clamp(sstep(0.02, 0.18, slope) * 0.9 + sstep(150.0, 1100.0, h) * 0.5 + rockP * 0.3, 0.0, 1.0);

  // ---- coast: beaches in coves, wet rock at the waterline
  if (coastD < 600.0 && dA.y < 36000.0) {
    float sandW = 35.0 + 45.0 * (nK.x * 0.5 + 0.5) + 20.0 * nF.w;
    float beach = (1.0 - sstep(sandW * 0.75, sandW, coastD)) * (1.0 - sstep(0.12, 0.3, slope)) * (1.0 - sstep(6.0, 14.0, h));
    vec3 sand = vec3(0.40, 0.335, 0.235) * (0.94 + 0.1 * nF.x);
    sand = mix(sand * 0.62, sand, sstep(-8.0, 14.0, coastD));
    col = mix(col, sand, beach);
    col = mix(col, rock * 0.55, (1.0 - sstep(0.0, 3.0, h)) * (1.0 - beach) * sstep(0.1, 0.3, slope));
    soilMix *= 1.0 - beach;
    rockP *= 1.0 - beach;
  }

  // ---- towns & city ground (buildings / lots come from the city module)
  float town = 1.0 - sstep(0.65, 1.0, length(dD - vec2(${f1(G.DEP_TOWN.x)}, ${f1(G.DEP_TOWN.z)})) / ${f1(G.DEP_TOWN.radius)} + nK.x * 0.12);
  float village = 1.0 - sstep(0.55, 0.95, length(wa - vec2(${f1(RIDGE[0])}, ${f1(RIDGE[1])})) / 650.0 + nK.y * 0.15);
  float city = sstep(${f1(G.ARR_CITY.xMin)}, ${f1(G.ARR_CITY.xMin + 800)}, dA.x + nK.y * 300.0) * (1.0 - sstep(${f1(G.ARR_CITY.xMax - 1500)}, ${f1(G.ARR_CITY.xMax)}, dA.x + nK.z * 400.0))
    * sstep(${f1(G.ARR_CITY.zMin)}, ${f1(G.ARR_CITY.zMin + 1500)}, dA.y + nK.w * 400.0) * (1.0 - sstep(${f1(G.ARR_CITY.zMax - 600)}, ${f1(G.ARR_CITY.zMax)}, dA.y + nK.x * 300.0));
  float urb = max(max(town, village * 0.8), city) * (1.0 - S.river);
  if (urb > 0.001) {
    vec3 ug = mix(vec3(0.060, 0.080, 0.036), vec3(0.090, 0.090, 0.060), sstep(-0.2, 0.5, nF.x + nH.z * 0.4));   // mown lawns / verges
    ug = mix(ug, vec3(0.11, 0.105, 0.098), sstep(0.25, 0.6, nH.y * 0.6 + nF.w * 0.4) * 0.6);                   // paving / parking
    ug = mix(ug, vec3(0.08, 0.085, 0.065), sstep(4.0, 30.0, pw));
    col = mix(col, ug, urb * 0.9);
    soilMix *= 1.0 - urb;
    rockP *= 1.0 - urb;
  }

  // ---- road corridor (road field): shoulder gravel, mown verge, cuttings & embankments
  vec4 rf = busRoadSample(wa);
  if (rf.g < 400.0 && rf.b > 0.5) {
    float hw = rf.a;
    float cw2 = hw - (hw > 13.0 ? 6.0 : 4.2);                   // carriageway half width (asphalt drawn by the road module)
    float dR = rf.g;
    float urbR = max(urb, 0.0);
    float cutD = max(cut, 0.0), fillD = max(-cut, 0.0);
    float slopeZone = sstep(hw + 0.5, hw + 3.0, dR);
    // cuttings: rock in the mountains / at depth, earth with sparse grass elsewhere
    float hard = clamp(sstep(150.0, 450.0, h) + sstep(4.0, 10.0, cutD) * 0.6 + coastal * 0.4, 0.0, 1.0);
    vec3 cutCol = mix(mix(vec3(0.150, 0.118, 0.082), vec3(0.120, 0.105, 0.070), nF.z * 0.5 + 0.5), rock * (0.9 + 0.2 * nB.x), hard);
    cutCol = mix(cutCol, grassNat * 1.1, sstep(0.3, 0.8, nH.x * 0.5 + nB.w * 0.4 + 0.2 - hard * 0.5) * 0.6);
    float cutM = sstep(0.8, 2.5, cutD) * slopeZone * sstep(0.08, 0.22, slope);
    col = mix(col, cutCol, cutM * (1.0 - urbR));
    rockP = max(rockP, cutM * hard * (1.0 - urbR));
    // embankments: grassed (sown) slopes, a little worn
    float fillM = sstep(0.8, 2.5, fillD) * slopeZone;
    vec3 emb = mix(vec3(0.075, 0.098, 0.040), vec3(0.150, 0.135, 0.080), dry * 0.8 + nH.z * 0.15) * (0.9 + 0.2 * nB.y);
    col = mix(col, emb, fillM * (1.0 - urbR));
    // mown verge strip beyond the shoulder (lighter, finer grass), fields kept back by a fence line
    float verge = (1.0 - sstep(hw + 4.0 + 5.0 * (nF.y * 0.5 + 0.5), hw + 10.0 + 6.0 * (nF.y * 0.5 + 0.5), dR)) * (1.0 - cutM) * (1.0 - fillM);
    vec3 vergeCol = mix(vec3(0.085, 0.110, 0.045), vec3(0.200, 0.170, 0.095), dry) * (0.9 + 0.15 * nH.w);
    col = mix(col, vergeCol, verge * (1.0 - urbR * 0.7) * (1.0 - snow));
    // gravel shoulder / formation (under and just beside the asphalt): no grass on the road
    float sh = 1.0 - sstep(cw2 + 0.6, cw2 + 1.6 + 0.6 * (nH.y * 0.5 + 0.5), dR);
    vec3 shCol = mix(vec3(0.115, 0.108, 0.098), vec3(0.165, 0.152, 0.130), nB.z * 0.5 + 0.5);
    col = mix(col, shCol, sh);
    soilMix = max(soilMix, sh);
    S.river *= sstep(cw2 + 2.0, cw2 + 6.0, dR);
  }

  // ---- near-field texture detail (normalised so the macro colour is preserved)
  if (nearF > 0.001) {
#if DETAIL > 0
    vec3 tg = (texture2D(tGrass, wm / 4.0).rgb * 0.6 + texture2D(tGrass, wm.yx / 16.0).rgb * 0.4) / MEAN_GRASS;
    vec3 td = (texture2D(tDirt, wm / 4.0).rgb * 0.65 + texture2D(tDirt, wm.yx / 16.0).rgb * 0.35) / MEAN_DIRT;
    vec3 tm = texture2D(tMeadow, wm / 8.0).rgb / MEAN_MEADOW;
#else
    vec3 tg = texture2D(tGrass, wm / 4.0).rgb / MEAN_GRASS;
    vec3 td = texture2D(tDirt, wm / 4.0).rgb / MEAN_DIRT;
    vec3 tm = tg;
#endif
    float dryish = sstep(0.12, 0.25, lum(col)) * (1.0 - soilMix);
    vec3 tex = mix(mix(tg, tm, dryish * 0.7), td, soilMix);
    if (rockP > 0.01) tex = mix(tex, texture2D(tRock, wm / 16.0).rgb / MEAN_ROCK, rockP);
    col *= mix(vec3(1.0), clamp(tex, 0.2, 3.0), nearF);
#if DETAIL > 0
    vec3 ng = texture2D(tGrassN, wm / 4.0).xyz * 2.0 - 1.0;
    vec3 nd = texture2D(tDirtN, wm / 4.0).xyz * 2.0 - 1.0;
    dn = mix(ng, nd, soilMix);
    if (rockP > 0.01) dn = mix(dn, texture2D(tRockN, wm / 16.0).xyz * 2.0 - 1.0, rockP);
    dnK = nearF;
#endif
  }
  S.wetK = mix(0.55, 1.0, max(soilMix, rockP));
  return col;
}
`;

// River surface on the valley floor (painted on the flat floor; reflections incl. the valley walls).
export const BUS_WATER_GLSL = !BUS ? '' : /* glsl */`
vec3 busRiver(vec3 dir, float dist, vec2 wm, float pw, float depth, float riparian, float walls, vec3 wallCol) {
  float sig2;
  vec3 n = waveNormal(wm * 3.0 + vec2(uTime * 0.9, uTime * 0.25), pw * 3.0, 0.55, sig2);
  vec3 V = -dir;
  float nv = max(dot(n, V), 1e-3);
  float F = fresnelW(nv);
  vec3 R = reflect(dir, n);
  R.y = max(R.y, 0.004);
  R = normalize(R);
  vec3 skyR = atmSkyView(R) + atmNightSky(R);
  // banks / valley walls in the reflection at low elevations
  float wallEl = mix(0.0, 0.32, walls) + riparian * 0.18;
  skyR = mix(wallCol, skyR, sstep(wallEl * 0.6, wallEl + 0.06, R.y));
  vec3 sunE = uAtmSunIllum * atmSunTransmittance(0.0, uAtmSunDir.y);
  vec3 Hs = normalize(uAtmSunDir + V);
  float nh = max(dot(n, Hs), 1e-3), nh2 = nh * nh;
  float D = exp(-(1.0 - nh2) / (nh2 * sig2)) / (PI * sig2 * nh2 * nh2);
  vec3 glitter = sunE * fresnelW(dot(Hs, V)) * D / (4.0 * nv) * (1.0 - riparian * 0.6);
  vec3 Ein = sunE * max(uAtmSunDir.y, 0.0) + uSkyIrrUp + uMoonIrr * max(uAtmMoonDir.y, 0.0);
  float dpt = clamp(depth, 0.1, 3.0);
  vec3 att = exp(-vec3(0.9, 0.35, 0.45) * dpt * 2.0);
  vec3 bed = vec3(0.16, 0.14, 0.10) * Ein / PI;
  vec3 deep = Ein * vec3(0.0035, 0.0068, 0.0058);
  vec3 under = bed * att + deep * (1.0 - att);
  return under * (1.0 - F) + skyR * F + glitter;
}
`;

// Land branch of main() (replaces the flight one): lighting with cloud shadows, river, aerial perspective.
export const BUS_MAIN_LAND = !BUS ? '' : /* glsl */`
    vec3 dn = vec3(0.0, 0.0, 1.0);
    float dnK = 0.0;
    BusSurf S;
    vec3 alb = landAlbedo(wa, wm, h, N, dist, pw, vData.y, dn, dnK, S);
    alb *= 1.0 - uBusWet * S.wetK * 0.38 * (1.0 - S.river);
    vec3 Nd = N;
    float rug = S.rug;
    if (rug > 0.02) {
      vec4 r1 = texture2D(tRelief, wm / 8192.0);
#if DETAIL > 0
      vec4 r2 = texture2D(tRelief, wm.yx / 2048.0);
#else
      vec4 r2 = r1.gbar;
#endif
      vec2 g = (r1.rg * 2.0 - 1.0) * 0.55 + (r2.gr * 2.0 - 1.0) * 0.35;
      Nd = normalize(Nd + vec3(-g.x, 0.0, -g.y) * rug * 0.75);
      alb *= 0.9 + 0.2 * mix(r1.b, r2.b, 0.4) * rug;
    }
    if (dnK > 0.001) Nd = normalize(Nd + vec3(dn.x, 0.0, dn.y) * 0.9 * dnK);
    float ndl = dot(Nd, uAtmSunDir);
    float diff = max(0.0, ndl * 0.88 + 0.12) * sstep(-0.12, 0.05, dot(N, uAtmSunDir));
    float cs = cloudShadow(wa);
    vec3 skyE = mix(uSkyIrrDown, uSkyIrrUp, Nd.y * 0.5 + 0.5);
    // sunlight scattered down by the clouds that shade this point: overcast stays fairly bright and neutral
    float sunHz = lum(vSunT) * max(uAtmSunDir.y, 0.0);
    vec3 E = vSunT * diff * cs + skyE * (1.0 - 0.3 * (1.0 - cs)) + vec3(sunHz * 0.2 * (1.0 - cs) * (Nd.y * 0.4 + 0.6))
           + uMoonIrr * max(0.0, dot(Nd, uAtmMoonDir));
    col = alb / PI * E;
    if (S.river > 0.001) {
      vec3 wallCol = vec3(0.035, 0.05, 0.025) / PI * (skyE + vSunT * 0.3 * cs);
      col = mix(col, busRiver(dir, dist, wm, pw, S.depth, S.riparian, S.valleyWall, wallCol), S.river);
    }
    vec3 Td = exp(-max(vOdd, vec3(0.0)));
    vec3 F = clamp((1.0 - Td) / max(1.0 - exp(-max(vOdD, vec3(0.0))), vec3(1e-5)), 0.0, 1.0);
    col = col * Td + sky * F;
`;
