/* =============================================================================
   nemuri II — LENS (module 30): the sequel's look, lens presets, settings panel.

   world shader : OBJECT_VERT / OBJECT_FRAG are swapped before any dream is
                  built. classic = the original shader strings verbatim; the
                  other lenses = "moonlight": per-vertex key + hemispheric light
                  (box faces read as facets), rim glow on silhouettes, height
                  mist, aerial hue shift toward the sky. switching lens re-syncs
                  every objMat material in the scene (one recompile).
   sky          : a gradient dome (horizon glow, stars, aurora when dark) that
                  follows the camera; hidden in classic.
   post         : classic keeps the untouched original post material and the
                  full-size canvas. every other lens renders scene -> rt (low
                  res) -> bloom (1/4 res) -> one grade pass (warp, ripple, chroma,
                  outline, palette ramp, dither, grain, per-lens look, vignette,
                  blood, flash) written straight into a canvas whose drawing
                  buffer is the internal resolution (css pixelated upscale).
                  postMat's uniforms are shared by reference, so the base keeps
                  driving uWarp / uDesat / uBlood / uFlash / uVig.
   settings     : O opens the panel; L cycles the lens. everything applies live.
   ============================================================================= */
var lensMod = N2.mods.lens = {};

/* -------------------------------------------------------------- lenses ---- */
var LENS_ORDER = ["lucid", "vhs", "ink", "dusk", "classic"];
var LENSES = {
  classic: { id: 0, h: 232, title: "first sleep", sub: "the dream as you saw it the first time" },
  lucid:   { id: 1, h: 288, title: "lucid", sub: "the dream, seen clearly", bloom: 0.62, outline: 0.55, ramp: 0.45, steps: 16, sat: 1.12, ca: 0.0005, vig: 1.1, grain: 1.0, thresh: 0.7 },
  vhs:     { id: 2, h: 240, title: "tape", sub: "a recording of a night you don't remember", bloom: 0.8, outline: 0.0, ramp: 0.18, steps: 20, sat: 0.92, ca: 0.0026, vig: 1.35, grain: 1.5, thresh: 0.5 },
  ink:     { id: 3, h: 300, title: "ink", sub: "a dream drawn by a careful hand", bloom: 0.25, outline: 1.0, ramp: 0.0, steps: 8, sat: 1.0, ca: 0.0, vig: 0.7, grain: 0.6, thresh: 0.7 },
  dusk:    { id: 4, h: 270, title: "dusk", sub: "watercolour, left out in the evening", bloom: 0.45, outline: 0.4, ramp: 0.22, steps: 7, sat: 0.9, ca: 0.0005, vig: 1.0, grain: 0.8, thresh: 0.62 }
};
function curLensName() { var n = N2.settings.lens; return LENSES[n] ? n : "lucid"; }
function curLens() { return LENSES[curLensName()]; }
function isClassic() { return curLensName() === "classic"; }

/* ------------------------------------------------------ shared uniforms ---- */
var U_style = { value: isClassic() ? 0 : 1 };
var U_skyTop = { value: new THREE.Color(0x101830) };
var U_skyHor = { value: new THREE.Color(0x303850) };
var U_glowC = { value: new THREE.Color(0x8898c0) };
var U_keyDir = { value: new THREE.Vector3(0.4, 0.75, 0.3).normalize() };
var U_keyCol = { value: new THREE.Color(0.5, 0.5, 0.55) };
var U_ambTop = { value: new THREE.Color(0.62, 0.64, 0.7) };
var U_ambBot = { value: new THREE.Color(0.4, 0.4, 0.44) };
var U_mist = { value: 1 };
var U_eyeY = { value: 0 };
var U_night = { value: 0 };
var U_moonC = { value: new THREE.Color(0xf2ead0) };
var U_aurora = { value: new THREE.Color(0x70e0c0) };
var U_motion = { value: 1 };
var U_auroraAmt = { value: 0 };

/* ---------------------------------------------------------- world shader ---- */
var ORIG_VERT = OBJECT_VERT, ORIG_FRAG = OBJECT_FRAG;
// Lighting is per vertex (gouraud, like the hardware the original imitates): box faces carry
// hard normals so they read as facets, low-poly round things get soft bands. The fragment
// shader stays nearly as cheap as the original one, which matters under software GL.
var SKY_FN = [
  "vec3 skyAt(float el) {",
  "  vec3 c = mix(uSkyHor, uSkyTop, smoothstep(0.0, 0.72, el));",
  "  return mix(c, uSkyHor * 0.72, smoothstep(0.0, -0.45, el));",
  "}"
].join("\n");
var SEQ_VERT = [
  "varying vec2 vUvA;",
  "varying float vWA;",
  "varying float vDist;",
  "varying vec3 vLitF;",
  "varying vec3 vLitB;",
  "varying vec3 vRim;",
  "varying vec3 vFogC;",
  "varying vec3 vFogT;",
  "varying vec2 vMist;",
  "uniform vec2 uGrid;",
  "uniform vec2 uRepeat;",
  "uniform float uBright;",
  "uniform vec2 uFogDist;",
  "uniform vec3 uSkyTop;",
  "uniform vec3 uSkyHor;",
  "uniform vec3 uGlowC;",
  "uniform vec3 uKeyDir;",
  "uniform vec3 uKeyCol;",
  "uniform vec3 uAmbTop;",
  "uniform vec3 uAmbBot;",
  "uniform float uMist;",
  "uniform float uEyeY;",
  SKY_FN,
  "vec3 lightFor(vec3 N) {",
  "  float wrap = clamp(dot(N, uKeyDir) * 0.62 + 0.38, 0.0, 1.0);",
  "  return mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5) + uKeyCol * (wrap * wrap);",
  "}",
  "void main() {",
  "  vec4 wp = modelMatrix * vec4(position, 1.0);",
  "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
  "  vDist = -mv.z;",
  "  vec4 clip = projectionMatrix * mv;",
  "  vec3 ndc = clip.xyz / clip.w;",
  "  ndc.xy = floor(ndc.xy * uGrid + 0.5) / uGrid;",
  "  clip.xyz = ndc * clip.w;",
  "  gl_Position = clip;",
  "  float w = clip.w;",
  "  vUvA = uv * uRepeat * w;",
  "  vWA = w;",
  // moonlight
  "  vec3 n = mat3(modelMatrix) * normal;",
  "  float nl = length(n);",
  "  float emis = smoothstep(1.22, 1.6, uBright);",
  "  if (nl < 1e-5) { n = vec3(0.0, 1.0, 0.0); emis = 1.0; } else n /= nl;",
  "  vec3 toC = cameraPosition - wp.xyz;",
  "  float dc = max(length(toC), 1e-3);",
  "  float fv = clamp((dc - uFogDist.x) / max(0.001, uFogDist.y - uFogDist.x), 0.0, 1.0);",
  "  vLitF = mix(lightFor(n), vec3(1.0), emis);",
  "  vLitB = mix(lightFor(-n), vec3(1.0), emis);",
  "  float fres = 1.0 - abs(dot(n, toC / dc)); fres = fres * fres * fres;",
  "  vRim = uGlowC * (fres * 0.34 * (1.0 - abs(n.y)) * (1.0 - fv) * (1.0 - emis));",
  // aerial perspective + height mist
  "  vFogC = skyAt((wp.y - cameraPosition.y) / dc);",
  "  float lf = dot(vFogC, vec3(0.299, 0.587, 0.114));",
  "  vFogT = mix(vec3(1.0), min(vFogC / max(lf, 0.03), vec3(2.5)), 0.42 * (1.0 - emis * 0.6));",
  "  float mist = exp(-max(wp.y - uEyeY, 0.0) * 0.16) * uMist;",
  "  vMist = vec2(0.8 + 0.42 * mist, 0.1 * mist);",
  "}"
].join("\n");
var SEQ_FRAG = [
  "varying vec2 vUvA;",
  "varying float vWA;",
  "varying float vDist;",
  "varying vec3 vLitF;",
  "varying vec3 vLitB;",
  "varying vec3 vRim;",
  "varying vec3 vFogC;",
  "varying vec3 vFogT;",
  "varying vec2 vMist;",
  "uniform sampler2D uMap;",
  "uniform float uHasMap;",
  "uniform vec3 uColor;",
  "uniform float uOpacity;",
  "uniform vec3 uFog;",
  "uniform vec2 uFogDist;",
  "uniform vec2 uScroll;",
  "uniform float uTime;",
  "uniform float uBright;",
  "void main() {",
  "  vec2 uv = vUvA / vWA + uScroll * uTime;",
  "  vec3 col = uColor;",
  "  float a = uOpacity;",
  "  if (uHasMap > 0.5) { vec4 t = texture2D(uMap, uv); col *= t.rgb; a *= t.a; }",
  "  col *= uBright;",
  "  if (a < 0.04) discard;",
  "  float f = clamp((vDist - uFogDist.x) / max(0.001, uFogDist.y - uFogDist.x), 0.0, 1.0);",
  "  vec3 lit = col * (gl_FrontFacing ? vLitF : vLitB) + vRim;",
  "  lit = mix(lit, lit * vFogT, f);",
  "  float ff = clamp(f * vMist.x + vMist.y * smoothstep(0.0, uFogDist.x + 6.0, vDist), 0.0, 1.0);",
  "  ff = max(ff, smoothstep(0.84, 1.0, f));",
  "  gl_FragColor = vec4(mix(lit, vFogC, ff), a);",
  "}"
].join("\n");
// classic uses the original shader strings verbatim; every other lens the sequel ones.
// objMat() reads these globals at material-creation time.
function setWorldStyle(seq) { OBJECT_VERT = seq ? SEQ_VERT : ORIG_VERT; OBJECT_FRAG = seq ? SEQ_FRAG : ORIG_FRAG; U_style.value = seq ? 1 : 0; }
setWorldStyle(!isClassic());

function addSeqUniforms(u) {
  u.uSkyTop = U_skyTop; u.uSkyHor = U_skyHor; u.uGlowC = U_glowC;
  u.uKeyDir = U_keyDir; u.uKeyCol = U_keyCol; u.uAmbTop = U_ambTop; u.uAmbBot = U_ambBot;
  u.uMist = U_mist; u.uEyeY = U_eyeY;
}
var _objMat = objMat;
objMat = function (o) {
  var m = _objMat.apply(this, arguments);
  try {
    if (m && m.uniforms) { addSeqUniforms(m.uniforms); m._n2obj = true; }
  } catch (e) {}
  return m;
};
// bring one material in line with the current lens (also adopts objMat materials made before this module)
function syncMaterial(m) {
  if (!m || !m.isShaderMaterial) return;
  if (!m._n2obj) {
    if (m.vertexShader !== ORIG_VERT || m.fragmentShader !== ORIG_FRAG || !m.uniforms || !m.uniforms.uBright) return;
    addSeqUniforms(m.uniforms); m._n2obj = true;
  }
  if (m.vertexShader !== OBJECT_VERT || m.fragmentShader !== OBJECT_FRAG) {
    m.vertexShader = OBJECT_VERT; m.fragmentShader = OBJECT_FRAG; m.needsUpdate = true;
  }
}
function syncTree(root) {
  if (!root || !root.traverse) return;
  root.traverse(function (o) {
    var m = o.material; if (!m) return;
    if (Array.isArray(m)) for (var i = 0; i < m.length; i++) syncMaterial(m[i]); else syncMaterial(m);
  });
}

/* ------------------------------------------------------------- sky dome ---- */
// The smooth parts of the sky (gradient, horizon glow, wide moon glow) are evaluated per VERTEX on a
// dense dome and interpolated; only the sharp parts (moon disc + halo core, stars, aurora rays) stay
// per pixel. Software GL shades every dome fragment even where the world covers it (no early-z), so
// the per-pixel cost is what matters. The dome sits on the far plane (z = w) and draws after the opaque
// world with a LessEqual test, so it never paints over anything.
var SKY_VERT = [
  "varying vec3 vDir;",
  "varying vec3 vBase;",
  "uniform vec3 uSkyTop;",
  "uniform vec3 uSkyHor;",
  "uniform vec3 uGlowC;",
  "uniform vec3 uKeyDir;",
  "uniform vec3 uMoonC;",
  SKY_FN,
  "void main() {",
  "  vDir = position;",
  "  vec3 d = normalize(position); float el = d.y;",
  "  vec3 c = skyAt(el);",
  "  c += uGlowC * (0.12 * exp(-abs(el) * 10.0));",                 // horizon glow
  "  float md = max(dot(d, uKeyDir), 0.0);",
  "  c += uMoonC * (pow(md, 6.0) * 0.05);",                          // the wide part of the moon's glow
  "  vBase = c;",
  "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
  "  gl_Position.z = gl_Position.w;",
  "}"
].join("\n");
var SKY_FRAG = [
  "varying vec3 vDir;",
  "varying vec3 vBase;",
  "uniform vec3 uKeyDir;",
  "uniform vec3 uMoonC;",
  "uniform vec3 uAurora;",
  "uniform float uNight;",
  "uniform float uTime;",
  "uniform float uMotion;",
  "uniform float uAuroraAmt;",
  "float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }",
  "void main() {",
  "  vec3 c = vBase;",
  "  vec3 d = normalize(vDir);",
  "  float el = d.y;",
  "  float md = dot(d, uKeyDir);",
  "  if (md > 0.93) {",
  "    float disc = smoothstep(0.9988, 0.9993, md);",
  "    c = mix(c, uMoonC, disc * (0.35 + 0.6 * uNight));",
  "    c += uMoonC * (pow(md, 48.0) * 0.16);",                       // moon halo core
  "  }",
  "#ifdef STARS",
  "  if (el > -0.02) {",
  "    float t = uTime * uMotion;",
  "    vec3 sd = d * 110.0; vec3 cell = floor(sd); float hs = h3(cell);",
  "    if (hs > 0.972) {",
  "      vec3 fr = fract(sd) - 0.5; float s = smoothstep(0.34, 0.0, length(fr));",
  "      float tw = 0.65 + 0.35 * sin(t * (1.0 + hs * 3.0) + hs * 40.0);",
  "      c += vec3(0.9, 0.92, 1.0) * s * tw * uNight * smoothstep(-0.02, 0.18, el) * (hs > 0.993 ? 1.0 : 0.45);",
  "    }",
  "#ifdef AURORA",
  "    if (el > 0.15 && el < 0.78) {",
  "      float az = atan(d.z, d.x);",
  "      float base = 0.3 + 0.06 * sin(az * 2.0 + t * 0.03) + 0.025 * sin(az * 5.0 - t * 0.05);",
  "      float x = el - base;",
  "      float sheet = smoothstep(-0.025, 0.0, x) * exp(-max(x, 0.0) * 9.0);",
  "      float rays = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(az * 61.0 + sin(az * 9.0 + t * 0.1) * 2.5), 3.0);",
  "      float fold = 0.5 + 0.5 * sin(az * 3.0 + t * 0.02);",
  "      c += uAurora * sheet * rays * fold * uNight * uAuroraAmt * 0.32;",
  "    }",
  "#endif",
  "  }",
  "#endif",
  "  gl_FragColor = vec4(c, 1.0);",
  "}"
].join("\n");
var skyDome = null, ownSky = false;
// software GL runs every instruction of a branch for every pixel (masked), so the star and aurora
// code is compiled in only when the sky is actually dark (with hysteresis; programs are cached)
var skyStars = false, skyAur = false;
function syncSkyDefines() {
  if (!skyDome) return;
  var n = U_night.value, st = skyStars ? n > 0.004 : n > 0.02, au = st && U_auroraAmt.value > 0.01;
  if (st === skyStars && au === skyAur) return;
  skyStars = st; skyAur = au;
  var d = {}; if (st) d.STARS = 1; if (au) d.AURORA = 1;
  skyDome.material.defines = d; skyDome.material.needsUpdate = true;
}
// a dream that brings its own full sky dome (a big inside-out sphere) hides ours: it would be overdrawn anyway
function hasOwnSky(z) {
  var found = false;
  try {
    if (z && z.group) z.group.traverse(function (o) {
      if (found || !o.isMesh || !o.material || o.material.side !== THREE.BackSide || !o.geometry) return;
      var g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      var sc = o.scale ? Math.max(o.scale.x, o.scale.y, o.scale.z) : 1;
      if (g.boundingSphere && g.boundingSphere.radius * sc > 250 && o.material.depthTest !== false && o.material.opacity !== 0 && !o.material.transparent) found = true;
    });
  } catch (e) { found = false; }
  return found;
}
function ensureDome() {
  if (skyDome || !scene) return skyDome;
  var mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthTest: true, depthFunc: THREE.LessEqualDepth, depthWrite: false, fog: false,
    uniforms: { uSkyTop: U_skyTop, uSkyHor: U_skyHor, uGlowC: U_glowC, uKeyDir: U_keyDir, uMoonC: U_moonC, uAurora: U_aurora, uNight: U_night, uTime: U_time, uMotion: U_motion, uAuroraAmt: U_auroraAmt }
  });
  skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 40, 36), mat);
  // after the world's opaque meshes (renderOrder 0), before a world's own sky dome (1000) and the lantern (9990+)
  skyDome.frustumCulled = false; skyDome.renderOrder = 999; skyDome.name = "n2-sky";
  scene.add(skyDome);
  return skyDome;
}

/* ------------------------------------------------------------ post chain ---- */
var BLOOM_FRAG = [
  "varying vec2 vUv;",
  "uniform sampler2D uScene;",
  "uniform vec2 uTexel;",
  "uniform float uThresh;",
  "vec3 bp(vec2 o) { vec3 c = texture2D(uScene, vUv + o * uTexel).rgb; float l = max(c.r, max(c.g, c.b)); return c * smoothstep(uThresh, 1.0, l); }",
  "void main() {",
  "  vec3 s = (bp(vec2(-1.0, -1.0)) + bp(vec2(1.0, 1.0)) + bp(vec2(1.0, -1.0)) + bp(vec2(-1.0, 1.0))) * 0.09;",
  "  s += (bp(vec2(3.0, 0.0)) + bp(vec2(-3.0, 0.0)) + bp(vec2(0.0, 3.0)) + bp(vec2(0.0, -3.0))) * 0.08;",
  "  s += (bp(vec2(4.0, 4.0)) + bp(vec2(-4.0, 4.0)) + bp(vec2(4.0, -4.0)) + bp(vec2(-4.0, -4.0))) * 0.06;",
  "  s += (bp(vec2(8.0, 0.0)) + bp(vec2(-8.0, 0.0)) + bp(vec2(0.0, 8.0)) + bp(vec2(0.0, -8.0))) * 0.045;",
  "  s += (bp(vec2(7.0, 7.0)) + bp(vec2(-7.0, 7.0)) + bp(vec2(7.0, -7.0)) + bp(vec2(-7.0, -7.0))) * 0.03;",
  "  gl_FragColor = vec4(s, 1.0);",
  "}"
].join("\n");

// one low-res pass does everything (screen-res passes are what SwiftShader pays for):
// warp / ripple / tape wobble -> chroma split -> outline -> bloom -> per-lens look ->
// grain -> vignette, scanlines, pulse, blood, flash. written straight into the low-res canvas (css upscales it).
var GRADE_FRAG = [
  "varying vec2 vUv;",
  "uniform sampler2D uScene;",
  "uniform sampler2D uBloomTex;",
  "uniform vec2 uLowRes;",
  "uniform float uTime;",
  "uniform float uDesat;",
  "uniform float uWarp;",
  "uniform float uVig;",
  "uniform float uBlood;",
  "uniform float uFlash;",
  "uniform float uGrain;",
  "uniform float uBloomAmt;",
  "uniform float uOutline;",
  "uniform float uRampMix;",
  "uniform float uSteps;",
  "uniform float uSat;",
  "uniform float uMotion;",
  "uniform float uWarm;",
  "uniform float uCA;",
  "uniform float uRipple;",
  "uniform float uVigK;",
  "uniform float uPulse;",
  "uniform vec3 uRamp0;",
  "uniform vec3 uRamp1;",
  "uniform vec3 uRamp2;",
  "uniform vec3 uRamp3;",
  "uniform vec3 uRamp4;",
  "uniform vec3 uInk;",
  "uniform vec3 uPaper;",
  "uniform vec3 uGlowC;",
  "float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }",
  "float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }",
  "float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }",
  "float Bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }",
  "float Bayer4(vec2 a){ return Bayer2(0.5*a) * 0.25 + Bayer2(a); }",
  "vec3 ramp(float l) {",
  "  l = clamp(l, 0.0, 1.0) * 4.0;",
  "  vec3 c = mix(uRamp0, uRamp1, clamp(l, 0.0, 1.0));",
  "  c = mix(c, uRamp2, clamp(l - 1.0, 0.0, 1.0));",
  "  c = mix(c, uRamp3, clamp(l - 2.0, 0.0, 1.0));",
  "  return mix(c, uRamp4, clamp(l - 3.0, 0.0, 1.0));",
  "}",
  "void main() {",
  "  vec2 px = 1.0 / uLowRes;",
  "  vec2 p = floor(vUv * uLowRes);",
  "  vec2 q = vUv - 0.5;",
  "  vec2 uv = vUv;",
  "  float wm = uWarp * mix(0.3, 1.0, uMotion);",
  "  if (wm > 0.001) {",
  "    uv.x += sin(uv.y * 22.0 + uTime * 6.0) * 0.012 * wm;",
  "    uv.y += sin(uv.x * 17.0 + uTime * 5.0) * 0.012 * wm;",
  "  }",
  "  if (uRipple > 0.001) {",
  "    float asp = uLowRes.x / uLowRes.y;",
  "    vec2 qa = q * vec2(asp, 1.0); float r = length(qa); float fr = r - uRipple * 1.1;",
  "    float w = sin(fr * 46.0) * exp(-fr * fr * 60.0) * (1.0 - uRipple);",
  "    uv += (qa / max(r, 0.001)) * vec2(1.0 / asp, 1.0) * w * 0.014 * mix(0.35, 1.0, uMotion);",
  "  }",
  "#if LENS == 2",
  "  float t2 = uTime * uMotion;",
  "  float row = p.y;",
  "  uv.x += (sin(uv.y * 3.1 + t2 * 1.3) * 0.0014 + (hash(vec2(row, floor(t2 * 30.0))) - 0.5) * 0.0016) * mix(0.25, 1.0, uMotion);",
  "  uv.x += smoothstep(0.03, 0.0, abs(uv.y - (1.0 - fract(t2 * 0.07)))) * 0.008 * uMotion;",
  "  uv.x += smoothstep(0.045, 0.0, uv.y) * (hash(vec2(row * 1.7, floor(t2 * 20.0))) - 0.3) * 0.025;",
  "#endif",
  "  vec3 c = texture2D(uScene, uv).rgb;",
  "  vec3 cn = texture2D(uScene, uv + vec2(0.0, px.y)).rgb;",
  "  vec3 cs = texture2D(uScene, uv - vec2(0.0, px.y)).rgb;",
  "  vec3 ce = texture2D(uScene, uv + vec2(px.x, 0.0)).rgb;",
  "  vec3 cw = texture2D(uScene, uv - vec2(px.x, 0.0)).rgb;",
  "  if (uCA > 0.00005) {",
  "#if LENS == 2",
  "    vec2 dir = vec2(uCA * 1.6, 0.0);",
  "#else",
  "    vec2 dir = q * uCA * 6.0;",
  "#endif",
  "    c.r = texture2D(uScene, uv + dir).r;",
  "    c.b = texture2D(uScene, uv - dir).b;",
  "  }",
  "  float l = luma(c);",
  "  float mx = max(max(luma(cn), luma(cs)), max(luma(ce), luma(cw)));",
  "  float cd = max(max(length(c - cn), length(c - cs)), max(length(c - ce), length(c - cw)));",
  "  float edge = clamp(smoothstep(0.05, 0.2, mx - l) * 0.85 + smoothstep(0.22, 0.45, cd) * step(l, mx) * 0.35, 0.0, 1.0);",
  "  if (uDesat > 0.001) c = mix(c, vec3(l), uDesat);",
  "  vec3 bl = texture2D(uBloomTex, uv).rgb;",
  "  float gt = uMotion > 0.5 ? fract(uTime * 7.31) : 0.0;",
  "  float grain = hash(p + vec2(gt * 113.0, gt * 71.0)) - 0.5;",
  "  float d = ign(p) - 0.5;",
  "  vec3 o;",
  "#if LENS == 1",
  // ------- lucid: moonlit print. tone quantised in sqrt space (fine steps in the dark),
  // each tone band tinted by the dream's curated ramp, chroma kept.
  "  c += bl * uBloomAmt;",
  "  float L = luma(c);",
  "  c = max(mix(vec3(L), c, uSat), 0.0);",
  "  float Lq = floor(sqrt(L) * uSteps + d + 0.5) / uSteps; Lq *= Lq;",
  "  vec3 chroma = c * (Lq / max(L, 0.004));",
  "  vec3 rc = ramp(Lq);",
  "  vec3 tint = min(rc / max(luma(rc), 0.02), vec3(2.4));",
  "  o = chroma * mix(vec3(1.0), tint, uRampMix);",
  "  o = mix(o, rc, uRampMix * 0.28);",
  "  o += uRamp1 * (0.06 * (1.0 - Lq) * uRampMix);",
  "  o = mix(o, uRamp0, edge * uOutline);",
  "  o += grain * uGrain * 0.045 * (0.15 + sqrt(Lq));",
  "#elif LENS == 2",
  // ------- tape: chroma bleed, lifted blacks, soft levels
  "  vec3 sm = (cw + texture2D(uScene, uv - vec2(px.x * 2.0, 0.0)).rgb + texture2D(uScene, uv - vec2(px.x * 3.0, 0.0)).rgb + c) * 0.25;",
  "  float L = luma(c);",
  "  c = vec3(L) + (sm - vec3(luma(sm))) * 1.15 * uSat;",
  "  c += bl * uBloomAmt * vec3(1.0, 0.9, 1.05);",
  "  c = c * 0.9 + vec3(0.045, 0.04, 0.07);",
  "  c = mix(c, ramp(luma(c)), uRampMix);",
  "  c.r *= 1.03; c.b *= 1.05;",
  "  c += (hash(vec2(p.y, floor(uTime * 24.0 * uMotion))) - 0.5) * 0.025 * uMotion;",
  "  o = floor(c * uSteps + d + 0.5) / uSteps;",
  "  o += grain * uGrain * 0.06;",
  "  o *= 0.84 + 0.16 * mod(p.y, 2.0);",
  "  o += smoothstep(0.04, 0.0, vUv.y) * 0.08;",
  "#elif LENS == 3",
  // ------- ink: an engraving on warm paper. tone -> solid / three hatch layers / paper
  "  float L = luma(c + bl * uBloomAmt);",
  "  float t = smoothstep(0.03, 0.62, sqrt(max(L, 0.0)) * 0.9 + 0.02);",
  "  float ink = 0.0;",
  "  if (t < 0.78 && mod(p.x + p.y, 4.0) < 1.0) ink = 1.0;",
  "  if (t < 0.55 && mod(p.x - p.y, 4.0) < 1.0) ink = 1.0;",
  "  if (t < 0.34 && mod(p.y, 2.0) < 1.0) ink = 1.0;",
  "  if (t < 0.16) ink = 1.0;",
  "  ink = max(ink, step(0.45, edge * uOutline));",
  "  o = mix(uPaper - hash(floor(p * 0.5)) * 0.05, uInk, ink);",
  "  float mxc = max(c.r, max(c.g, c.b));",
  "  o = mix(o, uGlowC, smoothstep(0.82, 0.98, mxc) * smoothstep(0.08, 0.3, mxc - min(c.r, min(c.g, c.b))) * 0.8);",
  "  o += grain * uGrain * 0.03;",
  "#else",
  // ------- dusk: watercolour pools, split tone, paper
  "  c = (c * 2.0 + cn + cs + ce + cw) / 6.0 + bl * uBloomAmt;",
  "  float L = luma(c);",
  "  float qq = L * uSteps;",
  "  float Lq = (floor(qq) + smoothstep(0.35, 0.65, fract(qq))) / uSteps;",
  "  vec3 chroma = mix(vec3(L), c, uSat) * (Lq / max(L, 0.004));",
  "  vec3 tone = mix(vec3(0.42, 0.3, 0.56), vec3(1.06, 0.8, 0.56), smoothstep(0.04, 0.6, Lq));",
  "  o = chroma * mix(vec3(1.0), tone * 1.3, 0.6);",
  "  o = mix(o, ramp(Lq), uRampMix);",
  "  o = o * 0.8 + vec3(0.2, 0.16, 0.14) * (0.55 + 0.45 * sqrt(Lq));",
  "  o *= mix(vec3(1.06, 0.93, 0.86), vec3(0.92, 0.9, 1.04), vUv.y);",
  "  o *= 1.0 - edge * uOutline * 0.35;",
  "  o *= 0.93 + (hash(floor(p * vec2(0.5, 1.0))) * 0.5 + hash(floor(p * vec2(1.0, 0.33)) + 7.0) * 0.5) * 0.1;",
  "  o += grain * uGrain * 0.035;",
  "#endif",
  "  o = mix(o, o * vec3(1.13, 0.99, 0.78), uWarm * 0.62);",
  "  float qd = dot(q, q);",
  "  o *= 1.0 - qd * uVig * uVigK;",
  "  o *= 1.0 + uPulse * 0.12 * (1.0 - qd * 3.0);",
  "  if (uBlood > 0.001) o = mix(o, vec3(0.42, 0.0, 0.0), clamp(uBlood, 0.0, 1.0) * (0.28 + qd * 1.15));",
  "  o += vec3(uFlash);",
  "  gl_FragColor = vec4(clamp(o, 0.0, 1.0), 1.0);",
  "}"
].join("\n");
var bloomMat = null, gradeMat = null, rtBloom = null, postMesh = null;
var GU = null; // grade uniforms (several shared by reference with postMat, which the base drives)
function ensureMats() {
  if (gradeMat || !postMat) return !!gradeMat;
  var pu = postMat.uniforms;
  bloomMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT, fragmentShader: BLOOM_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uScene: { value: null }, uTexel: { value: new THREE.Vector2(1 / 384, 1 / 232) }, uThresh: { value: 0.6 } }
  });
  GU = {
    uScene: { value: null }, uBloomTex: { value: null }, uLowRes: pu.uLowRes,
    uTime: U_time, uDesat: pu.uDesat, uWarp: pu.uWarp, uVig: pu.uVig, uBlood: pu.uBlood, uFlash: pu.uFlash,
    uGrain: { value: 0.5 }, uBloomAmt: { value: 0.6 }, uOutline: { value: 0.5 },
    uRampMix: { value: 0.45 }, uSteps: { value: 12 }, uSat: { value: 1 }, uMotion: U_motion, uWarm: { value: 0 },
    uCA: { value: 0 }, uRipple: { value: 0 }, uVigK: { value: 1 }, uPulse: { value: 0 },
    uRamp0: { value: new THREE.Color(0.03, 0.035, 0.08) }, uRamp1: { value: new THREE.Color(0.16, 0.16, 0.26) }, uRamp2: { value: new THREE.Color(0.4, 0.42, 0.5) },
    uRamp3: { value: new THREE.Color(0.68, 0.7, 0.74) }, uRamp4: { value: new THREE.Color(0.96, 0.92, 0.8) },
    uInk: { value: new THREE.Color(0.07, 0.075, 0.13) }, uPaper: { value: new THREE.Color(0.92, 0.88, 0.79) }, uGlowC: U_glowC
  };
  gradeMat = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: GRADE_FRAG, depthTest: false, depthWrite: false, uniforms: GU, defines: { LENS: Math.max(1, curLens().id) } });
  return true;
}
function findPostMesh() {
  if (postMesh) return postMesh;
  if (!postScene) return null;
  for (var i = 0; i < postScene.children.length; i++) if (postScene.children[i].isMesh) { postMesh = postScene.children[i]; break; }
  return postMesh;
}
// The sequel lenses grade straight into the canvas at the internal resolution; the canvas keeps
// its full CSS size and #view's image-rendering:pixelated does the nearest-neighbour upscale.
// (a screen-sized shader pass is the single most expensive thing under software GL.)
// classic keeps the original full-size canvas and post pass, untouched.
var canvasLow = false;
function sizeCanvas() {
  if (!renderer) return;
  var want = !isClassic();
  var W = want ? internalW : window.innerWidth, H = want ? internalH : window.innerHeight;
  var el = renderer.domElement;
  if (el.width !== W || el.height !== H) renderer.setSize(W, H, false);
  canvasLow = want;
}
function rebuildAux() {
  if (!ensureMats() || !rt) return;
  if (rtBloom) rtBloom.dispose();
  var bw = Math.max(2, Math.ceil(internalW / 4)), bh = Math.max(2, Math.ceil(internalH / 4));
  rtBloom = new THREE.WebGLRenderTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false });
  bloomMat.uniforms.uScene.value = rt.texture; bloomMat.uniforms.uTexel.value.set(1 / internalW, 1 / internalH);
  GU.uScene.value = rt.texture; GU.uBloomTex.value = rtBloom.texture;
}

// INTERNAL_H follows the lens and the resolution setting
function targetH() {
  var s = +N2.settings.resScale; if (!(s > 0)) s = 1;
  return Math.max(120, Math.min(1080, Math.round(curLens().h * s)));
}
var _makeRT = makeRT;
makeRT = function () {
  INTERNAL_H = targetH();
  _makeRT.apply(this, arguments);
  try { rebuildAux(); sizeCanvas(); } catch (e) { if (window.console) console.warn("[N2 lens] aux targets", e); }
};

var DBG = lensMod._dbg = {};
var _render = render;
render = function () {
  if (isClassic() || !gradeMat || !rtBloom || !findPostMesh()) {
    if (postMesh && postMesh.material !== postMat) postMesh.material = postMat;
    if (canvasLow && isClassic()) sizeCanvas();
    return _render.apply(this, arguments);
  }
  if (!canvasLow) sizeCanvas();
  N2.emit("beforeRender");
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, camera);
  if (!DBG.noBloom) { postMesh.material = bloomMat; renderer.setRenderTarget(rtBloom); renderer.render(postScene, postCam); }
  postMesh.material = gradeMat; renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  postMesh.material = postMat;
  N2.emit("afterRender");
};

/* ------------------------------------------------- per-dream colouring ---- */
var _tc = new THREE.Color(), _tc2 = new THREE.Color(), _clear = new THREE.Color();
function lum(c) { return c.r * 0.299 + c.g * 0.587 + c.b * 0.114; }
function withLum(c, L) {
  var l = lum(c);
  if (l < 0.002) { c.setRGB(L, L, L); return c; }
  c.multiplyScalar(L / l);
  // scaling a saturated colour can clip; pull it toward grey until it fits
  var mx = Math.max(c.r, c.g, c.b);
  if (mx > 1) { var k = (mx - 1) / Math.max(0.001, mx - L); c.lerp(_tc2.setRGB(L, L, L), Math.min(1, k)); }
  return c;
}
function col(x, d) { return (x && x.isColor) ? x : new THREE.Color(d); }
var dreamKey = { az: 0.6, el: 0.75 };
// a private generator so the lens never shifts the engine's Math.random stream (keeps classic identical)
var _ls = (Date.now() ^ 0x5bd1e995) >>> 0;
function lrand() { _ls = (_ls + 0x6D2B79F5) >>> 0; var t = _ls; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function tuneDream(z) {
  if (!z || !GU) return;
  var P = z.palette || {};
  var fog = (z.fog && z.fog.color) ? z.fog.color : col(null, 0x202030);
  var sky = col(z.sky, 0x101020);
  var glow = col(P.glow, 0x9aa8d0), ground = col(P.ground, fog.getHex()), wallA = col(P.wallA, fog.getHex()), accent = col(P.accent, 0x8070a0);
  var night = lum(sky) < 0.2;
  // a curated five-stop ramp: ink -> shadow -> mid -> light -> moon-gold highlight
  withLum(GU.uRamp0.value.copy(fog).lerp(_tc.setRGB(0.05, 0.05, 0.14), 0.72), 0.035);
  withLum(GU.uRamp1.value.copy(ground).lerp(_tc.setRGB(0.22, 0.2, 0.42), 0.38), 0.17);
  withLum(GU.uRamp2.value.copy(wallA).lerp(fog, 0.45).lerp(accent, 0.12), 0.4);
  withLum(GU.uRamp3.value.copy(sky).lerp(glow, 0.35).lerp(_tc.setRGB(0.98, 0.9, 0.8), 0.38), 0.66);
  withLum(GU.uRamp4.value.copy(glow).lerp(_tc.setRGB(1.0, 0.9, 0.7), 0.62), 0.92);
  // ink lens paper takes a breath of the dream's sky
  GU.uPaper.value.setRGB(0.93, 0.89, 0.8).lerp(sky, 0.1); withLum(GU.uPaper.value, 0.88);
  GU.uInk.value.setRGB(0.06, 0.065, 0.12).lerp(fog, 0.12); withLum(GU.uInk.value, 0.06);
  U_glowC.value.copy(glow).lerp(_tc.setRGB(0.8, 0.9, 1.0), 0.3);
  U_aurora.value.copy(glow).lerp(_tc.setRGB(0.45, 0.95, 0.8), 0.55);
  // the key light: a moon, somewhere above
  dreamKey.az = lrand() * Math.PI * 2; dreamKey.el = 0.55 + lrand() * 0.45;
  if (z.bedroom) { dreamKey.az = 0.9; dreamKey.el = 0.9; }
  U_keyDir.value.set(Math.cos(dreamKey.az) * Math.cos(dreamKey.el), Math.sin(dreamKey.el), Math.sin(dreamKey.az) * Math.cos(dreamKey.el)).normalize();
  if (night) U_keyCol.value.setRGB(0.84, 0.88, 1.0).lerp(glow, 0.15).multiplyScalar(0.46);
  else U_keyCol.value.setRGB(1.0, 0.94, 0.84).lerp(glow, 0.1).multiplyScalar(0.42);
  U_moonC.value.setRGB(0.96, 0.92, 0.8).lerp(glow, 0.15);
  withLum(U_ambTop.value.copy(sky).lerp(_tc.setRGB(1, 1, 1), 0.55), 0.63);
  withLum(U_ambBot.value.copy(fog).lerp(ground, 0.5).lerp(_tc.setRGB(0.4, 0.38, 0.5), 0.4), 0.5);
  U_mist.value = z.bedroom ? 0.3 : 1;
  U_auroraAmt.value = (!z.bedroom && lrand() < 0.4) ? 0.5 + lrand() * 0.5 : 0;
}
// every frame: the sky follows the base's live clear colour and fog (fx, night dread...)
var _hsl = { h: 0, s: 0, l: 0 }, skyL = 0.1;
function hueToward(h, target, k) { var d = target - h; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; h += d * k; return h - Math.floor(h); }
function tickSky() {
  if (!renderer) return;
  try { renderer.getClearColor(_clear); } catch (e) { return; }
  var L = lum(_clear);
  // zenith: the dream's sky colour, deeper and more saturated, leaning toward night blue
  _clear.getHSL(_hsl);
  var grey = _hsl.s < 0.06;
  var hz = grey ? 0.62 : hueToward(_hsl.h, 0.64, _hsl.s < 0.2 ? 0.35 : 0.18);
  U_skyTop.value.setHSL(hz, Math.min(0.78, (grey ? 0.22 : _hsl.s * 1.3 + 0.16)), _hsl.l * 0.6 + 0.004);
  // horizon: the fog, lifted, breathing the dream's glow colour
  U_skyHor.value.copy(U_fog.value).lerp(_clear, 0.2);
  U_skyHor.value.getHSL(_hsl);
  U_skyHor.value.setHSL(_hsl.h, Math.min(0.8, _hsl.s * 1.15 + 0.04), Math.min(0.92, _hsl.l * 1.16 + 0.02));
  U_skyHor.value.lerp(U_glowC.value, 0.1);
  U_night.value = Math.max(0, Math.min(1, (0.2 - L) / 0.15));
  syncSkyDefines();
  skyL += (Math.max(L, lum(U_fog.value)) - skyL) * 0.1;
  U_eyeY.value = pos.y;
}

/* ---------------------------------------------------------- reactions ---- */
var lucT = 0, lucS = 0, chase = 0, chaseS = 0, pulseV = 0, rippleT = -1, warmT = 0, warmS = 0, extWarm = 0;
lensMod.pulse = function (amount) { pulseV = Math.min(1.5, pulseV + (amount == null ? 0.5 : +amount || 0)); };
lensMod.ripple = function () { rippleT = 0; };
lensMod.warm = function (amount) { extWarm = Math.max(0, Math.min(1, +amount || 0)); };
N2.on("lucidity", function (level) { lucT = Math.max(0, Math.min(1, +level || 0)); });
N2.on("chaseStart", function () { chase = 1; lensMod.pulse(0.8); });
N2.on("chaseEnd", function () { chase = 0; lensMod.pulse(0.6); });
N2.on("realityCheck", function () { rippleT = 0; lensMod.pulse(0.25); });
N2.on("shard", function () { lensMod.pulse(0.35); });
N2.on("lanternLit", function () { lensMod.pulse(0.9); });
N2.on("powerUnlocked", function () { lensMod.pulse(0.6); });
N2.on("ending", function () { lensMod.pulse(1.2); });

function tickLens(dt) {
  if (!GU) return;
  var L = curLens(), s = N2.settings, rm = !!s.reducedMotion;
  U_motion.value = rm ? 0 : 1;
  lucS += (lucT - lucS) * Math.min(1, dt * 1.5);
  chaseS += (chase - chaseS) * Math.min(1, dt * 2);
  pulseV = Math.max(0, pulseV - dt * 1.4);
  var nm = N2.mods.nightmare, lanternOn = false;
  try { lanternOn = !!(nm && nm.lanternOn && nm.lanternOn()); } catch (e) {}
  warmT = Math.max(extWarm, lanternOn ? 1 : 0);
  warmS += (warmT - warmS) * Math.min(1, dt * 2);
  if (rippleT >= 0) { rippleT += dt / 1.3; if (rippleT >= 1) rippleT = -1; }
  if (isClassic()) return;
  var t = U_time.value;
  var heart = chaseS > 0.01 ? Math.pow(Math.max(0, Math.sin(t * 7.2)), 8) * chaseS : 0;
  var g0 = +s.grain; if (s.grain == null || !isFinite(g0)) g0 = 0.5;
  GU.uGrain.value = Math.max(0, Math.min(1, g0)) * (L.grain || 1);
  GU.uBloomAmt.value = (L.bloom || 0) * (1 + lucS * 0.7 + pulseV * 0.5) * (1 - Math.min(0.7, skyL * 1.1));
  GU.uOutline.value = L.outline || 0;
  GU.uRampMix.value = (L.ramp || 0) * (1 - lucS * 0.3);
  GU.uSteps.value = L.steps || 12;
  GU.uSat.value = (L.sat || 1) * (1 + lucS * 0.22) * (1 - chaseS * 0.25);
  GU.uWarm.value = warmS;
  bloomMat.uniforms.uThresh.value = (L.thresh || 0.6) - lucS * 0.08;
  var fu = GU;
  var ca = (L.ca || 0) * (1 + lucS * 1.2) + chaseS * 0.0026 + heart * 0.004 + pulseV * 0.003 + Math.min(1, postMat.uniforms.uWarp.value) * 0.002;
  if (L.id === 3) ca = (chaseS * 0.0026 + heart * 0.004 + pulseV * 0.003) * 0.6;
  fu.uCA.value = rm ? 0 : ca;
  var breath = rm ? 1 : 1 + Math.sin(t * 0.42) * 0.1;
  fu.uVigK.value = (L.vig || 1) * breath * (1 + chaseS * 0.6 + heart * 0.8);
  fu.uPulse.value = Math.min(1, pulseV) * (rm ? 0.4 : 1);
  fu.uRipple.value = rippleT >= 0 ? rippleT : 0;
}

/* -------------------------------------------------------- applying lens ---- */
// the lens name gets its own label (updated in place) so fast cycling never queues toasts
var lensLabel = null, lensLabelT = null;
function announceLens() {
  if (N2.ui.isOpen(PANEL_ID)) return;
  try {
    if (!lensLabel) { lensLabel = N2.ui.el("div", "n2-toast n2-lens-label", "", N2.ui.region("top")); }
    var L = curLens();
    lensLabel.textContent = "lens · " + L.title;
    var sm = document.createElement("small"); sm.textContent = L.sub; lensLabel.appendChild(sm);
    lensLabel.classList.add("on");
    if (lensLabelT) clearTimeout(lensLabelT);
    lensLabelT = setTimeout(function () { lensLabel.classList.remove("on"); }, 2200);
  } catch (e) {}
}
function applyLens(announce) {
  var name = curLensName(), L = LENSES[name];
  setWorldStyle(L.id !== 0);
  if (scene) syncTree(scene);
  if (skyDome) skyDome.visible = L.id !== 0;
  if (gradeMat && gradeMat.defines.LENS !== Math.max(1, L.id)) {
    gradeMat.defines.LENS = Math.max(1, L.id); gradeMat.needsUpdate = true;
  }
  if (renderer && postMat) { makeRT(); }
  if (announce) announceLens();
  refreshPanel();
}
lensMod.setLens = function (name) {
  if (!LENSES[name]) return false;
  N2.setSetting("lens", name);   // the settings handler applies it
  return true;
};
lensMod.lens = function () { return curLensName(); };
lensMod.lenses = function () { return LENS_ORDER.map(function (n) { return { id: n, title: LENSES[n].title, sub: LENSES[n].sub }; }); };
lensMod.cycle = function () {
  var i = LENS_ORDER.indexOf(curLensName());
  lensMod.setLens(LENS_ORDER[(i + 1) % LENS_ORDER.length]);
  announceLens();
};
// debug: ms per frame of the whole render, or of one pass ("scene" | "bloom" | "grade" | "final" | "post0")
lensMod._bench = function (n, part) {
  n = n || 30; var gl = renderer.getContext(), px = new Uint8Array(4), t0 = performance.now();
  for (var i = 0; i < n; i++) {
    if (!part) render();
    else if (part === "scene") { renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera); }
    else if (findPostMesh()) {
      var m = { bloom: [bloomMat, rtBloom], grade: [gradeMat, null], post0: [postMat, null] }[part];
      postMesh.material = m[0]; renderer.setRenderTarget(m[1]); renderer.render(postScene, postCam);
      postMesh.material = postMat;
    }
    renderer.setRenderTarget(null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  return Math.round((performance.now() - t0) / n * 10) / 10;
};
lensMod._state = function () { return { pitch: pitch, sens: SENS, volOwned: volOwned, gain: (audio && audio.master) ? audio.master.gain.value : null, canvas: renderer ? [renderer.domElement.width, renderer.domElement.height] : null, internal: [internalW, internalH], fov: camera ? camera.fov : null }; };
lensMod.uniforms = { style: U_style, skyTop: U_skyTop, skyHor: U_skyHor, glow: U_glowC, keyDir: U_keyDir };

/* ---------------------------------------------------------- live settings ---- */
var BASE_SENS = SENS;
function applyFov() {
  if (!camera) return;
  var z = N2.lastZone, base = (z && z.fov) || 72;
  var f = +N2.settings.fov || 72;
  camera.fov = Math.max(30, Math.min(140, base * f / 72));
  camera.updateProjectionMatrix();
}
function applySens() { var k = +N2.settings.sens; if (!(k > 0)) k = 1; SENS = BASE_SENS * k; }

// volume: if the input module exists it owns the audio chain (spec); otherwise we scale fadeMaster ourselves
var volOwned = false, volLast = 0.28;
function volK() { var v = +N2.settings.volume; return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; }
function installVolume() {
  if (volOwned || (N2.mods.input && N2.mods.input.ownsVolume !== false)) return;
  if (!audio || typeof audio.fadeMaster !== "function") return;
  volOwned = true;
  var _fm = audio.fadeMaster;
  audio.fadeMaster = function (v, t) { volLast = v; return _fm.call(this, v * volK(), t); };
  var _tm = audio.toggleMute;
  if (typeof _tm === "function") audio.toggleMute = function () { var r = _tm.apply(this, arguments); try { if (this.ctx && !this.muted) audio.fadeMaster(0.28, 0.3); } catch (e) {} return r; };
}
function applyVolume() {
  installVolume();
  if (!volOwned || !audio.ctx || audio.muted) return;
  try { audio.fadeMaster(paused ? 0.05 : volLast, 0.15); } catch (e) {}
}

function applySetting(key) {
  try {
    if (key === "lens") applyLens(false);
    else if (key === "resScale") { if (renderer && postMat) makeRT(); }
    else if (key === "fov") applyFov();
    else if (key === "sens") applySens();
    else if (key === "volume") applyVolume();
  } catch (e) { if (window.console) console.warn("[N2 lens] setting", key, e); }
  refreshPanel();
}
N2.on("settings", function (s, key) { applySetting(key); });

// invert y: a capturing listener notes pitch before the base's (bubbling) handler runs, then
// ours (registered later, so it runs after the base) rewrites the vertical part, inverted.
var invertListener = false, pitch0 = 0;
function installInvert() {
  if (invertListener) return; invertListener = true;
  window.addEventListener("mousemove", function () { pitch0 = pitch; }, true);
  window.addEventListener("mousemove", function (e) {
    if (!N2.settings.invertY) return;
    if (N2.uiOpen || paused) return;
    if (phase !== "play" && phase !== "transition") return;
    if (!(pointerLocked || dragging)) return;
    pitch = Math.max(-1.45, Math.min(1.45, pitch0 + (e.movementY || 0) * SENS));
  });
}

/* ------------------------------------------------------------- hooks ---- */
N2.on("start", function () {
  try {
    ensureMats(); ensureDome(); rebuildAux();
    applyLens(false); applySens(); applyFov(); installInvert(); applyVolume();
    if (N2.lastZone) { tuneDream(N2.lastZone); syncTree(N2.lastZone.group); }
  } catch (e) { if (window.console) console.warn("[N2 lens] start", e); }
});
N2.on("dreamBuilt", function (z) {
  try { ensureMats(); ensureDome(); tuneDream(z); applyFov(); if (z && z.group) syncTree(z.group); ownSky = hasOwnSky(z); } catch (e) {}
});
N2.on("beforeRender", function () {
  try {
    if (skyDome && camera) { skyDome.position.copy(camera.position); skyDome.visible = !isClassic() && !ownSky; }
    if (!isClassic()) tickSky();
  } catch (e) {}
});
N2.on("frame", function (dt) {
  try {
    tickLens(dt || 0.016);
    if (N2.settings.reducedMotion && typeof shake === "number" && shake > 0.25) shake = 0.25;
  } catch (e) {}
});

/* --------------------------------------------------------- settings panel ---- */
N2.bind("KeyO", "settings", "lens");
N2.bind("KeyL", "cycle lens", "lens");
var PANEL_ID = "n2-settings";
var ROWS = [
  { k: "lens", label: "lens", type: "choice", opts: LENS_ORDER.map(function (n) { return [n, LENSES[n].title]; }) },
  { k: "resScale", label: "resolution", type: "choice", opts: [[0.7, "soft"], [1, "native"], [1.4, "fine"], [2, "sharp"]] },
  { k: "fov", label: "field of view", type: "range", min: 55, max: 110, step: 1, fmt: function (v) { return Math.round(v) + "°"; } },
  { k: "sens", label: "look sensitivity", type: "range", min: 0.2, max: 3, step: 0.05, fmt: function (v) { return (+v).toFixed(2) + "×"; } },
  { k: "invertY", label: "invert look", type: "bool" },
  { k: "volume", label: "volume", type: "range", min: 0, max: 1, step: 0.05, fmt: function (v) { return Math.round(v * 100) + "%"; } },
  { k: "grain", label: "film grain", type: "range", min: 0, max: 1, step: 0.05, fmt: function (v) { return Math.round(v * 100) + "%"; } },
  { k: "reducedMotion", label: "reduced motion", type: "bool" },
  { k: "hud", label: "hud", type: "bool" },
  { k: "touch", label: "touch controls", type: "choice", opts: [["auto", "auto"], ["on", "on"], ["off", "off"]] }
];
var panel = null, rowEls = [], focusRow = 0, descEl = null;
N2.ui.css([
  "#n2-settings .n2-sheet{width:min(92vw,620px);position:relative;background:linear-gradient(180deg,rgba(9,14,28,.94),rgba(5,8,18,.94));border-color:rgba(160,200,220,.22);box-shadow:0 0 90px rgba(90,150,190,.14),inset 0 0 40px rgba(240,215,154,.03);}",
  "#n2-settings h2{display:flex;justify-content:space-between;align-items:baseline;}",
  "#n2-settings h2 small{font-size:10px;letter-spacing:.2em;color:var(--n2-dim);}",
  ".n2-set-row{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:14px;padding:8px 10px;border-left:2px solid transparent;transition:background .25s,border-color .25s;}",
  ".n2-set-row.focus{border-left-color:var(--n2-gold);background:rgba(240,215,154,.05);}",
  ".n2-set-row label{font-size:11px;letter-spacing:.2em;color:var(--n2-dim);text-transform:lowercase;}",
  ".n2-set-row.focus label{color:var(--n2-ink);}",
  ".n2-seg{display:flex;flex-wrap:wrap;gap:6px;}",
  ".n2-seg button{font:inherit;font-size:11px;letter-spacing:.16em;color:var(--n2-dim);background:transparent;border:1px solid rgba(160,190,210,.18);padding:5px 10px;cursor:pointer;text-transform:lowercase;transition:all .2s;}",
  ".n2-seg button:hover{color:var(--n2-ink);border-color:rgba(143,208,210,.5);}",
  ".n2-seg button.on{color:#0a0f1c;background:var(--n2-gold);border-color:var(--n2-gold);}",
  ".n2-rng{display:flex;align-items:center;gap:12px;}",
  ".n2-rng input{flex:1;-webkit-appearance:none;appearance:none;height:2px;background:rgba(160,190,210,.25);outline:none;cursor:pointer;}",
  ".n2-rng input::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:var(--n2-teal);box-shadow:0 0 10px rgba(143,208,210,.6);}",
  ".n2-rng input::-moz-range-thumb{width:11px;height:11px;border-radius:50%;border:none;background:var(--n2-teal);}",
  ".n2-rng span{min-width:46px;text-align:right;font-size:11px;letter-spacing:.12em;color:var(--n2-teal);}",
  ".n2-set-desc{margin:14px 10px 4px;min-height:16px;font-size:10px;letter-spacing:.18em;color:var(--n2-dim);}",
  ".n2-set-foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:0 10px;}",
  ".n2-set-foot{gap:10px;flex-wrap:wrap;}.n2-set-tch{display:none;}",
  "@media (pointer:coarse){.n2-set-kb{display:none;}.n2-set-tch{display:inline;}}",
  ".n2-set-foot .n2-muted{font-size:10px;letter-spacing:.14em;}",
  ".n2-set-foot>div{display:flex;gap:8px;flex-shrink:0;margin-left:12px;}",
  "@media (max-width:560px){.n2-set-row{grid-template-columns:1fr;gap:6px;}}"
].join("\n"), "n2-lens-css");

function buildPanel() {
  if (panel) return panel;
  panel = N2.ui.panel(PANEL_ID, "settings <small>o · esc to close</small>");
  var sheet = panel.sheet;
  rowEls = [];
  ROWS.forEach(function (r, idx) {
    var row = N2.ui.el("div", "n2-set-row", "", sheet);
    var lab = N2.ui.el("label", "", r.label, row);
    row.addEventListener("mousemove", function () { if (focusRow !== idx) setFocus(idx); });
    var ctl;
    if (r.type === "choice" || r.type === "bool") {
      ctl = N2.ui.el("div", "n2-seg", "", row);
      var opts = r.type === "bool" ? [[true, "on"], [false, "off"]] : r.opts;
      opts.forEach(function (o) {
        var b = N2.ui.el("button", "", o[1], ctl); b.type = "button"; b._val = o[0];
        b.addEventListener("click", function (e) { e.preventDefault(); setFocus(idx); N2.setSetting(r.k, o[0]); b.blur(); });
      });
    } else {
      ctl = N2.ui.el("div", "n2-rng", "", row);
      var inp = document.createElement("input"); inp.type = "range"; inp.min = r.min; inp.max = r.max; inp.step = r.step; ctl.appendChild(inp);
      var out = N2.ui.el("span", "", "", ctl);
      inp.addEventListener("input", function () { N2.setSetting(r.k, +inp.value); });
      inp.addEventListener("keydown", function (e) { e.preventDefault(); });   // our own key handling below
      ctl._inp = inp; ctl._out = out;
    }
    row._r = r; row._ctl = ctl; rowEls.push(row);
  });
  descEl = N2.ui.el("div", "n2-set-desc", "", sheet);
  var foot = N2.ui.el("div", "n2-set-foot", "", sheet);
  N2.ui.el("span", "n2-muted n2-set-kb", "↑↓ choose · ←→ change · l cycles lenses", foot);
  N2.ui.el("span", "n2-muted n2-set-tch", "tap or slide to change", foot);
  var btns = N2.ui.el("div", "", "", foot);
  var reset = N2.ui.el("button", "n2-btn", "defaults", btns); reset.type = "button";
  reset.addEventListener("click", function () { var d = N2.settingsDefaults || {}; for (var k in d) N2.setSetting(k, d[k]); N2.ui.toast("settings restored"); });
  var close = N2.ui.el("button", "n2-btn", "close", btns); close.type = "button";
  close.addEventListener("click", function () { lensMod.closeSettings(); });
  refreshPanel();
  return panel;
}
function valEq(a, b) { return a === b || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-6); }
function refreshPanel() {
  if (!panel) return;
  var s = N2.settings;
  rowEls.forEach(function (row, i) {
    var r = row._r, v = s[r.k];
    row.classList.toggle("focus", i === focusRow);
    if (r.type === "choice" || r.type === "bool") {
      var bs = row._ctl.querySelectorAll("button");
      for (var j = 0; j < bs.length; j++) bs[j].classList.toggle("on", valEq(bs[j]._val, r.type === "bool" ? !!v : v));
    } else {
      if (document.activeElement !== row._ctl._inp) row._ctl._inp.value = v;
      row._ctl._out.textContent = r.fmt(+v);
    }
  });
  if (descEl) {
    var r0 = ROWS[focusRow];
    var DESC = {
      lens: "“" + curLens().title + "” — " + curLens().sub,
      resScale: "how finely the dream is drawn (" + internalW + "×" + internalH + " now). lower is kinder to old machines",
      fov: "how wide you see. some dreams narrow or widen it on their own",
      sens: "how quickly the dream turns with your hand",
      invertY: "push forward to look down",
      volume: "how loudly the dream hums",
      grain: "the fine sand on the lens",
      reducedMotion: "softens wobble, shake, ripples and colour fringing",
      hud: "the small quiet words at the edges (h)",
      touch: "on-screen controls for fingers. auto shows them on touch screens"
    };
    descEl.textContent = DESC[r0.k] || "";
  }
}
function setFocus(i) { focusRow = (i + ROWS.length) % ROWS.length; refreshPanel(); }
function stepRow(dir) {
  var r = ROWS[focusRow], v = N2.settings[r.k];
  if (r.type === "bool") { N2.setSetting(r.k, !v); return; }
  if (r.type === "choice") {
    var i = 0; for (var j = 0; j < r.opts.length; j++) if (valEq(r.opts[j][0], v)) i = j;
    var nv = r.opts[(i + dir + r.opts.length) % r.opts.length][0];
    N2.setSetting(r.k, nv);
    return;
  }
  var x = Math.max(r.min, Math.min(r.max, (+v || 0) + dir * r.step));
  N2.setSetting(r.k, Math.round(x / r.step) * r.step);
}
lensMod.openSettings = function () { buildPanel(); refreshPanel(); N2.ui.open(PANEL_ID); };
lensMod.closeSettings = function () { N2.ui.close(PANEL_ID); };
lensMod.isSettingsOpen = function () { return N2.ui.isOpen(PANEL_ID); };

N2.on("keydown", function (e) {
  try {
    var code = e.code;
    if (N2.ui.isOpen(PANEL_ID) && N2.ui.top() === PANEL_ID) {
      if (code === "KeyO") { lensMod.closeSettings(); return true; }
      if (code === "ArrowUp" || code === "KeyW") { setFocus(focusRow - 1); return true; }
      if (code === "ArrowDown" || code === "KeyS" || code === "Tab") { setFocus(focusRow + (e.shiftKey && code === "Tab" ? -1 : 1)); return true; }
      if (code === "ArrowLeft" || code === "KeyA") { stepRow(-1); return true; }
      if (code === "ArrowRight" || code === "KeyD" || code === "Enter" || code === "Space") { stepRow(1); return true; }
      return false;
    }
    if (N2.uiOpen) return false;
    if (code === "KeyO") { lensMod.openSettings(); return true; }
    if (code === "KeyL" && phase !== "title") { lensMod.cycle(); return true; }
  } catch (err) {}
  return false;
}, 60);
N2.on("uiClose", function (id) { if (id === PANEL_ID && phase === "play" && !paused && !useDrag && !N2.uiOpen) { try { tryLock(); } catch (e) {} } });
