// Rendering of a BackroomsLevel. Ceiling fixtures light the level through a shader term that
// sums the nearest fixtures (5x5 cells) with a per-cell reachability mask so light does not leak
// through walls; flicker and outages are written into a small data texture every frame. The two
// fixtures nearest the camera are additionally real shadow-casting spot lights.

const LATTICE_GLSL = /* glsl */ `
uniform sampler2D uFix;     // n x n: r = fixture level (0 dead .. 1 on), g = 1 when a real spot light took over
uniform highp usampler2D uReach; // n x n: 25-bit mask of fixtures whose light reaches the cell
uniform vec4 uGrid;         // -half, cell, n, ceiling
uniform vec3 uLightCol;
uniform float uLightPow;
uniform float uAmbientFloor;
uniform float uBounce;      // non-directional bounce light (rooms are small and bright)
uniform sampler2D uWalls;   // n x n: r +x, g -x, b +z, a -z edge closed (1 wall, .78 door, .59 racking)
uniform vec4 uLamp;         // fixture height, falloff, reach, bounce falloff
uniform vec4 uLamp2;        // x: share of a fixture's light that goes sideways and up, y: beam exponent (0: troffer)
varying vec3 vLatP;
// contact darkening where floor/ceiling meet a wall of this cell
float edgeAO(vec3 P, float reach) {
  float cell = uGrid.y; float n = uGrid.z;
  vec2 g = (P.xz - uGrid.x) / cell;
  ivec2 c = ivec2(floor(g));
  if (c.x < 0 || c.y < 0 || c.x >= int(n) || c.y >= int(n)) return 1.0;
  vec4 w = texelFetch(uWalls, c, 0);
  vec2 f = (g - vec2(c)) * cell;
  float d = 9.0;
  if (w.r > 0.5) d = min(d, cell - f.x);
  if (w.g > 0.5) d = min(d, f.x);
  if (w.b > 0.5) d = min(d, cell - f.y);
  if (w.a > 0.5) d = min(d, f.y);
  return mix(0.55, 1.0, smoothstep(0.0, reach, d - 0.08));
}
varying vec3 vLatN;
vec3 latticeIrradiance(vec3 P, vec3 N) {
  float cell = uGrid.y; float n = uGrid.z; float H = uGrid.w;
  vec3 Q = P + N * 0.12; // sample the cell on the visible side of a wall
  ivec2 c = ivec2(floor((Q.xz - uGrid.x) / cell));
  int nn = int(n);
  if (c.x < 0 || c.y < 0 || c.x >= nn || c.y >= nn) return vec3(0.0);
  uint mask = texelFetch(uReach, c, 0).r;
  vec3 sum = vec3(0.0);
  float bounce = 0.0;
  for (int dj = -2; dj <= 2; dj++) {
    for (int di = -2; di <= 2; di++) {
      int bit = (dj + 2) * 5 + (di + 2);
      if ((mask & (1u << uint(bit))) == 0u) continue;
      ivec2 f = c + ivec2(di, dj);
      if (f.x < 0 || f.y < 0 || f.x >= nn || f.y >= nn) continue;
      vec4 fx = texelFetch(uFix, f, 0);
      float level = fx.r * (1.0 - fx.g);
      if (level <= 0.001) continue;
      vec3 L = vec3(uGrid.x + (float(f.x) + 0.5) * cell, uLamp.x, uGrid.x + (float(f.y) + 0.5) * cell) - P;
      float d2 = dot(L, L);
      float d = sqrt(d2);
      vec3 l = L / d;
      float cosN = max(dot(N, l), 0.0);
      float cosL = max(l.y, 0.0);
      float win = clamp(1.0 - d / uLamp.z, 0.0, 1.0);
      float beam = uLamp2.y > 0.0 ? pow(cosL, uLamp2.y) : cosL; // reflector lamps throw their light down
      sum += level * cosN * (uLamp2.x + (1.0 - uLamp2.x) * beam) * win * win / (d2 * uLamp.y + 0.55);
      bounce += level * win / (d2 * uLamp.w + 1.0);
    }
  }
  return (sum * 2.6 + bounce * uBounce) * uLightCol * uLightPow + uLightCol * uAmbientFloor;
}
`;

function patchLattice(material, shared, extra = {}) {
  material.userData.latticeShared = shared;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, shared, extra.uniforms || {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLatP;\nvarying vec3 vLatN;\n' + (extra.vertexHead || ''))
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 lp = vec4(transformed, 1.0);
          vec3 ln = objectNormal;
          #ifdef USE_INSTANCING
            lp = instanceMatrix * lp;
            ln = mat3(instanceMatrix) * ln;
          #endif
          vLatP = (modelMatrix * lp).xyz;
          vLatN = normalize(mat3(modelMatrix) * ln);
        }
        ${extra.vertexBody || ''}`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LATTICE_GLSL + (extra.fragmentHead || ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (extra.color || ''))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + (extra.roughness || ''))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (extra.emissive || ''))
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec3 latN = normalize(vLatN);
          vec3 irr = latticeIrradiance(vLatP, latN);
          reflectedLight.directDiffuse += irr * BRDF_Lambert(material.diffuseColor);
          // a broad sheen from the panels overhead so wet and glossy surfaces read
          vec3 vdir = normalize(cameraPosition - vLatP);
          float up = pow(max(dot(reflect(-vdir, latN), vec3(0.0, 1.0, 0.0)), 0.0), mix(64.0, 4.0, material.roughness));
          reflectedLight.indirectSpecular += irr * up * (1.0 - material.roughness) * 0.35;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'lattice-' + (extra.key || 'std');
  return material;
}

const NOISE_GLSL = /* glsl */ `
float brH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float brN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(brH(i), brH(i + vec2(1, 0)), f.x), mix(brH(i + vec2(0, 1)), brH(i + vec2(1, 1)), f.x), f.y); }
float brF(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * brN(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
uniform int uStyle;
uniform vec3 uWallCol;
uniform vec3 uWallAlt;
uniform vec3 uTrim;
uniform float uSeed;
`;

class LevelView {
  constructor(level, renderer, opts = {}) {
    this.level = level;
    this.renderer = renderer;
    const th = level.theme;
    const scene = (this.scene = new T3.Scene());
    const fogCol = new T3.Color(...th.fog);
    scene.background = fogCol.clone();
    scene.fog = new T3.FogExp2(fogCol, th.fogDensity + level.loop * 0.006);
    this.quality = opts.quality || 'high';
    this.time = 0;
    this.decals = new Lab.FloorDecals(renderer, {
      rect: { minX: -level.half, maxX: level.half, minZ: -level.half, maxZ: level.half },
      size: this.quality === 'low' ? 2048 : 4096,
    });
    this.buildLatticeTextures();
    // fixtures: flush troffers just under the ceiling unless the theme hangs lamps lower
    const lp = (this.lamp = LevelView.lampParams(level));
    this.shared = {
      uFix: { value: this.fixTex },
      uReach: { value: this.reachTex },
      uGrid: { value: new T3.Vector4(-level.half, level.cell, level.n, level.ceiling) },
      uLightCol: { value: new T3.Color(...th.lightCol) },
      uLightPow: { value: th.lightPow },
      uAmbientFloor: { value: 0.02 },
      uBounce: { value: 0.22 },
      uWalls: { value: this.wallTex },
      uLamp: { value: new T3.Vector4(lp.y, lp.fall, lp.win, lp.bounce) },
      uLamp2: { value: new T3.Vector4(lp.up, lp.beam, 0, 0) },
    };
    this.ambient = new T3.HemisphereLight(new T3.Color(...th.lightCol).multiplyScalar(0.9), new T3.Color(...th.carpet).multiplyScalar(0.6), th.ambient);
    scene.add(this.ambient);
    this.buildWalls();
    this.buildFloor();
    this.buildCeiling();
    this.buildProps();
    this.buildSpots();
    this.buildDust();
    this.wallDecals = new WallDecals(scene, 900);
  }

  static lampParams(level) {
    const th = level.theme, lp = th.lamp || {};
    return {
      y: lp.y ?? level.ceiling - 0.04, fall: lp.fall ?? 0.35, win: lp.win ?? 2.6 * level.cell, bounce: lp.bounce ?? 0.2,
      up: lp.up ?? 0.35, beam: lp.beam ?? 0, spot: lp.spot ?? 14, bias: lp.bias ?? -0.0006, normalBias: lp.normalBias ?? 0.025, spotDist: lp.spotDist ?? 9, spotY: lp.y !== undefined ? lp.y - 0.06 : level.ceiling - 0.05,
    };
  }

  // ---- fixture textures ------------------------------------------------------------------
  buildLatticeTextures() {
    const L = this.level, n = L.n;
    this.fixData = new Float32Array(n * n * 4);
    this.fixTex = new T3.DataTexture(this.fixData, n, n, T3.RGBAFormat, T3.FloatType);
    this.fixTex.minFilter = this.fixTex.magFilter = T3.NearestFilter;
    this.fixTex.needsUpdate = true;
    // reachability: fixture f lights cell c if a short walk through open edges links them
    const reach = new Uint32Array(n * n);
    for (let c = 0; c < n * n; c++) {
      const ci = c % n, cj = (c / n) | 0;
      const dist = new Map([[c, 0]]);
      const q = [c];
      for (let h = 0; h < q.length; h++) {
        const a = q[h], ai = a % n, aj = (a / n) | 0, da = dist.get(a);
        if (da >= 3) continue;
        for (let d = 0; d < 4; d++) {
          if (!L.wallOpen(ai, aj, d)) continue;
          const b = d === 0 ? a + 1 : d === 1 ? a - 1 : d === 2 ? a + n : a - n;
          const bi = b % n, bj = (b / n) | 0;
          if (Math.abs(bi - ci) > 2 || Math.abs(bj - cj) > 2 || dist.has(b)) continue;
          dist.set(b, da + 1);
          q.push(b);
        }
      }
      let m = 0;
      for (const [b, d] of dist) {
        const di = (b % n) - ci, dj = ((b / n) | 0) - cj;
        if (d <= Math.abs(di) + Math.abs(dj) + 1) m |= 1 << ((dj + 2) * 5 + (di + 2));
      }
      reach[c] = m >>> 0;
    }
    this.reachTex = new T3.DataTexture(reach, n, n, T3.RedIntegerFormat, T3.UnsignedIntType);
    this.reachTex.internalFormat = 'R32UI';
    this.reachTex.minFilter = this.reachTex.magFilter = T3.NearestFilter;
    this.reachTex.needsUpdate = true;
    // closed edges for contact shading (> 0.5); the value also says what closes it: wall, doorway
    // or racking (floor markings follow it)
    const wd = new Uint8Array(n * n * 4), code = [0, 255, 200, 150];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) for (let d = 0; d < 4; d++) wd[(j * n + i) * 4 + d] = code[L.edgeVal(i, j, d)];
    this.wallTex = new T3.DataTexture(wd, n, n, T3.RGBAFormat, T3.UnsignedByteType);
    this.wallTex.minFilter = this.wallTex.magFilter = T3.NearestFilter;
    this.wallTex.needsUpdate = true;
  }

  styleUniforms() {
    const th = this.level.theme;
    return {
      uStyle: { value: th.style },
      uWallCol: { value: new T3.Color(...th.wall) },
      uWallAlt: { value: new T3.Color(...th.wallAlt) },
      uTrim: { value: new T3.Color(...th.trim) },
      uSeed: { value: (this.level.seed % 1000) / 1000 },
    };
  }

  // ---- walls -----------------------------------------------------------------------------
  buildWalls() {
    const L = this.level;
    const geos = [];
    const steelColumns = L.theme.style === 4; // the warehouse builds its own columns
    for (const b of L.boxes) {
      if (b.kind !== 'wall' && b.kind !== 'pillar' && b.kind !== 'lintel') continue;
      if (b.kind === 'pillar' && steelColumns) continue;
      const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
      const g = new T3.BoxGeometry(w, h, d);
      g.translate((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      g.deleteAttribute('uv');
      geos.push(g);
    }
    const geo = ThreeUtils.mergeGeometries(geos);
    const th = L.theme;
    const mat = new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
    patchLattice(mat, this.shared, {
      key: 'wall',
      uniforms: this.styleUniforms(),
      fragmentHead: NOISE_GLSL,
      color: /* glsl */ `
        {
          vec3 P = vLatP; vec3 N = normalize(vLatN);
          vec2 uv = abs(N.x) > 0.5 ? vec2(P.z, P.y) : vec2(P.x, P.y);
          vec3 col = uWallCol;
          float grime = brF(uv * 0.55 + uSeed * 31.0);
          float fine = brN(uv * 70.0);
          if (uStyle == 0) {
            // Level 0 wallpaper: narrow stripes with a faint chevron motif between them
            float u = uv.x / 0.21;
            float stripe = smoothstep(0.035, 0.0, abs(fract(u) - 0.5) - 0.42);
            vec2 cu = vec2(fract(u) - 0.5, uv.y / 0.21);
            float chev = abs(fract(cu.y + abs(cu.x) * 0.9) - 0.5);
            float motif = smoothstep(0.06, 0.02, abs(chev - 0.22)) * step(abs(cu.x), 0.36);
            col = mix(uWallCol, uWallAlt, 0.5 * stripe + 0.28 * motif);
            col *= 0.93 + 0.07 * fine;
            // yellowed, water-stained, darker near the ceiling
            float stain = smoothstep(0.55, 0.78, brF(uv * vec2(0.9, 0.35) + 3.3));
            col = mix(col, col * vec3(0.72, 0.62, 0.42), stain * 0.55);
            float damp = smoothstep(0.42 + 0.25 * brF(vec2(uv.x * 1.4, 1.7)), 0.0, P.y);
            col = mix(col, col * vec3(0.6, 0.52, 0.36), damp * 0.6);
          } else if (uStyle == 1) {
            // board-formed concrete with tie holes and rain streaks
            col = uWallCol * (0.78 + 0.32 * grime) * (0.95 + 0.05 * fine);
            float boards = smoothstep(0.02, 0.0, abs(fract(uv.y / 0.3) - 0.5) - 0.48);
            col *= 1.0 - 0.12 * boards;
            vec2 tg = vec2(fract(uv.x / 1.2) - 0.5, fract(uv.y / 0.9) - 0.5);
            col *= 1.0 - 0.5 * smoothstep(0.03, 0.015, length(tg * vec2(1.2, 1.0)));
            float streak = smoothstep(0.6, 0.9, brN(vec2(uv.x * 6.0, uv.y * 0.25))) * smoothstep(0.0, 2.5, P.y);
            col *= 1.0 - 0.25 * streak;
          } else if (uStyle == 2) {
            // painted block tunnels: two-tone with a rust-stained band
            float band = step(1.05, P.y);
            col = mix(uWallAlt, uWallCol, band) * (0.78 + 0.3 * grime);
            vec2 bl = vec2(fract(uv.x / 0.4 + floor(uv.y / 0.2) * 0.5), fract(uv.y / 0.2));
            float mortar = 1.0 - smoothstep(0.0, 0.04, min(min(bl.x, 1.0 - bl.x) * 2.0, min(bl.y, 1.0 - bl.y)));
            col *= 1.0 - 0.3 * mortar;
            float rust = smoothstep(0.55, 0.85, brF(vec2(uv.x * 2.0, uv.y * 0.6) + 9.0)) * smoothstep(1.3, 0.2, abs(P.y - 1.05));
            col = mix(col, vec3(0.3, 0.14, 0.06), rust * 0.6);
          } else if (uStyle == 4) {
            // warehouse: painted block with a dark dado band and a safety stripe, cream block
            // above, corrugated cladding from 4.4 m up to the roof
            vec2 bl = vec2(fract(uv.x / 0.4 + floor(uv.y / 0.2) * 0.5), fract(uv.y / 0.2));
            float mortar = 1.0 - smoothstep(0.0, 0.03, min(min(bl.x, 1.0 - bl.x) * 2.0, min(bl.y, 1.0 - bl.y)));
            float blockTone = brH(floor(vec2(uv.x / 0.4 + floor(uv.y / 0.2) * 0.5, uv.y / 0.2)) + uSeed);
            float dado = step(P.y, 1.15);
            col = mix(uWallCol, uWallAlt, dado) * (0.84 + 0.2 * grime) * (0.95 + 0.05 * fine) * (0.96 + 0.06 * blockTone);
            col *= 1.0 - 0.2 * mortar;
            // scuffed paint and forklift scrapes low on the band
            float scuff = smoothstep(0.62, 0.8, brF(vec2(uv.x * 3.0, uv.y * 9.0) + 2.0)) * smoothstep(0.9, 0.2, P.y);
            col = mix(col, uWallCol * 0.55, scuff * 0.6);
            float stripe = smoothstep(0.012, 0.0, abs(P.y - 1.24) - 0.07);
            col = mix(col, uTrim * (0.8 + 0.25 * fine) * (0.85 + 0.15 * grime), stripe);
            // water stains running down from the cladding
            float run = smoothstep(0.58, 0.85, brN(vec2(uv.x * 4.0, uv.y * 0.3) + 5.0)) * smoothstep(1.2, 4.4, P.y);
            col *= 1.0 - 0.18 * run;
            if (P.y > 4.4) {
              float rib = fract(uv.x / 0.24);
              float prof = smoothstep(0.0, 0.12, rib) * smoothstep(0.62, 0.5, rib);
              prof = mix(prof, 0.55, smoothstep(0.08, 0.35, fwidth(uv.x / 0.24))); // no moire far away
              col = uWallCol * vec3(0.78, 0.76, 0.72) * (0.66 + 0.34 * prof) * (0.8 + 0.25 * grime);
              col *= 1.0 - 0.45 * smoothstep(0.03, 0.0, abs(P.y - 4.45)); // girt line
              float rustRun = smoothstep(0.6, 0.85, brN(vec2(uv.x * 8.0, uv.y * 0.4) + 11.0));
              col = mix(col, vec3(0.32, 0.16, 0.07), rustRun * 0.45);
            }
          } else {
            // office drywall with a chair rail
            col = uWallCol * (0.9 + 0.12 * grime) * (0.97 + 0.03 * fine);
            float rail = smoothstep(0.02, 0.0, abs(P.y - 0.92) - 0.035);
            col = mix(col, uTrim * 1.3, rail);
          }
          col *= mix(0.62, 1.0, smoothstep(0.0, 0.35, P.y)) * mix(0.7, 1.0, smoothstep(0.0, 0.3, uGrid.w - P.y));
          // baseboard
          float base = uStyle == 4 ? 0.0 : step(P.y, 0.1);
          col = mix(col, uTrim * (0.85 + 0.2 * fine), base);
          diffuseColor.rgb *= col;
        }`,
      roughness: 'roughnessFactor = uStyle == 1 ? 0.92 : uStyle == 2 ? 0.75 : uStyle == 4 ? (vLatP.y > 4.4 ? 0.55 : 0.8) : 0.88;',
    });
    const mesh = new T3.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.walls = mesh;
  }

  // ---- floor -----------------------------------------------------------------------------
  buildFloor() {
    const L = this.level, th = L.theme;
    const geo = new T3.PlaneGeometry(L.size, L.size, 1, 1).rotateX(-Math.PI / 2);
    const mat = new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const decals = this.decals;
    patchLattice(mat, this.shared, {
      key: 'floor',
      uniforms: { ...this.styleUniforms(), uCarpet: { value: new T3.Color(...th.carpet) }, uDecals: { value: decals.target.texture }, uRect: { value: decals.rectUniform } },
      fragmentHead: NOISE_GLSL + `
        uniform vec3 uCarpet; uniform sampler2D uDecals; uniform vec4 uRect;
        vec4 decalAt(vec2 xz) { vec2 uv = (xz - uRect.xy) / (2.0 * uRect.zw) + 0.5;
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0); return texture2D(uDecals, uv); }
        float floorWet = 0.0;`,
      color: /* glsl */ `
        {
          vec2 xz = vLatP.xz;
          vec3 col = uCarpet;
          float big = brF(xz * 0.22 + uSeed * 17.0);
          float mid = brF(xz * 1.3);
          float fib = brN(xz * 220.0) * 0.6 + brN(xz * 90.0) * 0.4;
          if (uStyle == 0) {
            col *= 0.84 + 0.22 * mid + 0.12 * (fib - 0.5);
            float damp = smoothstep(0.5, 0.72, big);
            col = mix(col, col * vec3(0.62, 0.55, 0.42), damp * 0.75);
            floorWet = damp * 0.5;
            float stain = smoothstep(0.68, 0.8, brF(xz * 0.7 + 4.2));
            col = mix(col, col * vec3(0.5, 0.42, 0.3), stain * 0.6);
          } else if (uStyle == 1) {
            col *= 0.75 + 0.35 * mid + 0.06 * (fib - 0.5);
            vec2 sl = abs(fract(xz / 2.0) - 0.5);
            col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.01, min(sl.x, sl.y) * 2.0));
            float puddle = smoothstep(0.6, 0.66, big);
            col *= 1.0 - 0.35 * puddle;
            floorWet = puddle;
          } else if (uStyle == 2) {
            col *= 0.7 + 0.4 * mid;
            vec2 g = abs(fract(xz / 0.6) - 0.5);
            col *= 1.0 - 0.25 * smoothstep(0.46, 0.5, max(g.x, g.y));
            float oil = smoothstep(0.62, 0.7, big);
            col *= 1.0 - 0.4 * oil;
            floorWet = oil * 0.8;
          } else if (uStyle == 4) {
            // sealed warehouse concrete: mottled and burnished, saw-cut joints, worn safety
            // paint along the racking and walls, hatching across doorways, tyre marks, oil
            col *= 0.8 + 0.3 * mid + 0.05 * (fib - 0.5);
            col *= 0.94 + 0.08 * brN(xz * vec2(0.7, 2.6) + 3.0);
            float J = uGrid.y * 0.5;
            vec2 jd = abs(fract(xz / J + 0.5) - 0.5) * J;
            col *= 1.0 - 0.35 * (1.0 - smoothstep(0.004, 0.014, min(jd.x, jd.y)));
            float C = uGrid.y;
            vec2 g = (xz - uGrid.x) / C;
            ivec2 c = ivec2(floor(g));
            float paint = 0.0, hatch = 0.0, dir = 0.5;
            if (c.x >= 0 && c.y >= 0 && c.x < int(uGrid.z) && c.y < int(uGrid.z)) {
              vec4 w = texelFetch(uWalls, c, 0);
              vec2 lp = (g - vec2(c)) * C;
              // distance to each side (+x, -x, +z, -z) and what closes it
              vec4 ds = vec4(C - lp.x, lp.x, C - lp.y, lp.y);
              vec4 isWall = step(0.9, w), isDoor = step(0.7, w) * (1.0 - isWall), isRack = step(0.5, w) * (1.0 - isWall - isDoor);
              vec4 off = isRack * 0.82 + (isWall + isDoor) * 0.75;
              vec4 closed = step(0.5, w);
              for (int k = 0; k < 4; k++) {
                if (closed[k] < 0.5) continue;
                float line = 1.0 - smoothstep(0.045, 0.06, abs(ds[k] - off[k]));
                // stop short of the perpendicular closed sides so lines meet in corners
                vec2 perp = k < 2 ? vec2(ds.z, ds.w) : vec2(ds.x, ds.y);
                vec2 pc = k < 2 ? vec2(closed.z, closed.w) : vec2(closed.x, closed.y);
                vec2 po = k < 2 ? vec2(off.z, off.w) : vec2(off.x, off.y);
                line *= mix(1.0, step(po.x - 0.06, perp.x), pc.x) * mix(1.0, step(po.y - 0.06, perp.y), pc.y);
                float along = k < 2 ? lp.y : lp.x;
                if (isDoor[k] > 0.5) {
                  float inDoor = step(abs(along - C * 0.5), 1.45);
                  line *= 1.0 - inDoor;
                  // yellow and black hatching across the opening
                  float h = step(ds[k], 0.9) * inDoor;
                  hatch = max(hatch, h);
                }
                paint = max(paint, line);
              }
              // tyre marks run along the aisles
              dir = (isRack.z + isRack.w) > 0.5 ? 1.0 : (isRack.x + isRack.y) > 0.5 ? 0.0 : 0.5;
            }
            float tyreX = smoothstep(0.55, 0.85, brN(vec2(xz.x * 0.35, xz.y * 7.0) + 1.3)) * smoothstep(0.35, 0.65, brN(xz * 0.4 + 2.0));
            float tyreZ = smoothstep(0.55, 0.85, brN(vec2(xz.y * 0.35, xz.x * 7.0) + 4.1)) * smoothstep(0.35, 0.65, brN(xz * 0.4 + 6.0));
            col *= 1.0 - 0.22 * mix(tyreZ, tyreX, dir);
            float wear = smoothstep(0.25, 0.6, brF(xz * 2.3 + 5.0)) * (0.7 + 0.3 * fib);
            vec3 yel = uTrim * (0.75 + 0.25 * brN(xz * 30.0));
            col = mix(col, yel, paint * wear);
            float stripes = step(0.5, fract((xz.x + xz.y) * 2.2));
            col = mix(col, mix(yel, vec3(0.03, 0.025, 0.02), stripes), hatch * wear * 0.9);
            // broad warm and grey patches from years of sweeping and spills, and the odd oil stain
            col *= mix(vec3(1.0), vec3(1.07, 0.97, 0.86), smoothstep(0.35, 0.75, brF(xz * 0.07 + 21.0)));
            float oil = smoothstep(0.7, 0.77, brF(xz * 0.32 + 13.0)) * (0.6 + 0.4 * brN(xz * 2.0));
            col *= 1.0 - 0.45 * oil;
            floorWet = oil * 0.85;
          } else {
            vec2 tile = floor(xz / 0.5);
            float tv = brH(tile + 3.0);
            col *= 0.86 + 0.14 * tv + 0.12 * (fib - 0.5);
            vec2 tg = abs(fract(xz / 0.5) - 0.5);
            col *= 1.0 - 0.18 * smoothstep(0.47, 0.5, max(tg.x, tg.y));
            float stain = smoothstep(0.66, 0.78, big);
            col = mix(col, col * 0.6, stain);
          }
          vec4 dec = decalAt(xz);
          col = mix(col, vec3(0.12, 0.12, 0.11), clamp(dec.g, 0.0, 1.0) * 0.8);
          float bt = dec.r;
          float bcov = smoothstep(0.03, 0.12, bt);
          vec3 bcol = mix(vec3(0.2, 0.011, 0.009), vec3(0.045, 0.0025, 0.002), smoothstep(0.15, 0.6, bt));
          col = mix(col, bcol, bcov);
          floorWet = max(floorWet, smoothstep(0.15, 0.45, bt));
          col *= edgeAO(vLatP, 0.45);
          diffuseColor.rgb *= col;
        }`,
      roughness: 'roughnessFactor = mix(uStyle == 1 ? 0.88 : uStyle == 4 ? 0.62 + 0.2 * brN(vLatP.xz * 0.9) : 0.97, 0.12, clamp(floorWet, 0.0, 1.0));',
    });
    const mesh = new T3.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.floor = mesh;
    this.particlesFloorY = 0;
  }

  // ---- ceiling with light panels ---------------------------------------------------------
  buildCeiling() {
    const L = this.level, th = L.theme;
    const geo = new T3.PlaneGeometry(L.size, L.size, 1, 1).rotateX(Math.PI / 2);
    geo.translate(0, L.ceiling, 0);
    const mat = new T3.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    patchLattice(mat, this.shared, {
      key: 'ceiling',
      uniforms: { ...this.styleUniforms(), uCeil: { value: new T3.Color(...th.ceilingCol) } },
      fragmentHead: NOISE_GLSL + 'uniform vec3 uCeil; float panelGlow = 0.0;',
      color: /* glsl */ `
        {
          vec2 xz = vLatP.xz;
          vec3 col = uCeil;
          float cellSz = uGrid.y;
          ivec2 c = ivec2(floor((xz - uGrid.x) / cellSz));
          vec2 local = xz - (uGrid.x + (vec2(c) + 0.5) * cellSz);
          float lvl = 0.0;
          if (c.x >= 0 && c.y >= 0 && c.x < int(uGrid.z) && c.y < int(uGrid.z)) lvl = texelFetch(uFix, c, 0).r;
          if (uStyle == 0 || uStyle == 3) {
            vec2 t = abs(fract(xz / 0.6) - 0.5);
            float gridL = smoothstep(0.47, 0.49, max(t.x, t.y));
            col *= 0.9 + 0.1 * brN(xz * 40.0);
            float stain = smoothstep(0.6, 0.75, brF(xz * 0.35 + uSeed * 9.0));
            col = mix(col, col * vec3(0.62, 0.52, 0.36), stain * 0.7);
            col = mix(col, col * 0.55, gridL);
          } else if (uStyle == 1) {
            col *= 0.75 + 0.3 * brF(xz * 0.8);
          } else if (uStyle == 4) {
            // galvanised roof deck: trapezoidal ribs spanning between the joists, water marks
            float rib = fract(xz.x / 0.3);
            float ribs = smoothstep(0.0, 0.08, rib) * smoothstep(0.55, 0.45, rib);
            col *= 0.8 + 0.2 * mix(ribs, 0.5, smoothstep(0.08, 0.35, fwidth(xz.x / 0.3)));
            col *= 0.8 + 0.3 * brF(xz * 0.6 + uSeed * 5.0);
            col = mix(col, col * vec3(0.6, 0.48, 0.34), smoothstep(0.62, 0.8, brF(xz * 0.25 + 3.0)) * 0.6);
          } else {
            col *= 0.6 + 0.4 * brF(xz * 1.2);
          }
          // the troffer: a 0.6 x 1.2 m diffuser panel with a metal frame (the warehouse hangs
          // its lamps from the roof structure instead)
          vec2 pd = abs(local) - vec2(0.3, 0.6) + (uStyle == 4 ? 9.0 : 0.0);
          float panel = step(max(pd.x, pd.y), 0.0);
          float frame = step(max(pd.x, pd.y), 0.035) * (1.0 - panel);
          col = mix(col, vec3(0.75), frame);
          col = mix(col, vec3(0.92, 0.92, 0.9), panel);
          panelGlow = panel * lvl;
          col *= edgeAO(vLatP, 0.35);
          diffuseColor.rgb *= col;
        }`,
      emissive: 'totalEmissiveRadiance += uLightCol * panelGlow * 3.2;',
    });
    const mesh = new T3.Mesh(geo, mat);
    this.scene.add(mesh);
    this.ceiling = mesh;
  }

  // ---- props -------------------------------------------------------------------------------
  buildProps() {
    const L = this.level;
    if (L.theme.style === 4) {
      this.dressing = new WarehouseDressing(this);
      return;
    }
    const mats = {
      metal: patchLattice(new T3.MeshStandardMaterial({ color: 0x6b6e66, roughness: 0.5, metalness: 0.6 }), this.shared, { key: 'prop' }),
      wood: patchLattice(new T3.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.8 }), this.shared, { key: 'prop' }),
      cardboard: patchLattice(new T3.MeshStandardMaterial({ color: 0x9a7b52, roughness: 0.95 }), this.shared, { key: 'prop' }),
      fabric: patchLattice(new T3.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 1 }), this.shared, { key: 'prop' }),
      dark: patchLattice(new T3.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.3 }), this.shared, { key: 'prop' }),
      partition: patchLattice(new T3.MeshStandardMaterial({ color: 0x6f747a, roughness: 0.95 }), this.shared, { key: 'prop' }),
      glow: new T3.MeshBasicMaterial({ color: 0xbfd6ff }),
    };
    this.propMats = mats;
    const byMat = new Map();
    const add = (mat, g) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g); };
    const box = (w, h, d, x, y, z) => new T3.BoxGeometry(w, h, d).translate(x, y, z);
    for (const p of L.props) {
      const parts = propParts(p.kind, p.def, box, mats);
      const m = new T3.Matrix4().makeRotationY(p.yaw).setPosition(p.x, 0, p.z);
      for (const [mat, g] of parts) { g.applyMatrix4(m); add(mat, g); }
    }
    for (const [mat, list] of byMat) {
      const geo = ThreeUtils.mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }));
      const mesh = new T3.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  // ---- real lights: the nearest fixtures cast shadows ------------------------------------
  buildSpots() {
    const th = this.level.theme;
    this.spots = [];
    const count = this.quality === 'low' ? 1 : 2;
    for (let k = 0; k < count; k++) {
      const s = new T3.SpotLight(new T3.Color(...th.lightCol), 0, this.lamp.spotDist, 1.25, 0.85, 1.6);
      s.castShadow = true;
      s.shadow.mapSize.set(this.quality === 'high' ? 1024 : 512, this.quality === 'high' ? 1024 : 512);
      s.shadow.camera.near = 0.1;
      s.shadow.camera.far = this.lamp.spotDist;
      s.shadow.bias = this.lamp.bias;
      s.shadow.normalBias = this.lamp.normalBias;
      this.scene.add(s, s.target);
      this.spots.push({ light: s, fixture: null, w: 0 });
    }
  }

  buildDust() {
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = Math.random() * this.level.ceiling; pos[i * 3 + 2] = (Math.random() - 0.5) * 16; }
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.BufferAttribute(pos, 3));
    const m = new T3.PointsMaterial({ color: new T3.Color(...this.level.theme.lightCol), size: 0.012, transparent: true, opacity: 0.35, depthWrite: false, fog: true });
    this.dust = new T3.Points(g, m);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  // light level at a world point (CPU version of the shader term, for the viewmodel & HUD)
  lightAt(x, y, z) {
    const L = this.level, n = L.n;
    const c = L.cellOf(x, z);
    if (c < 0) return 0;
    const ci = c % n, cj = (c / n) | 0, lp = this.lamp;
    let sum = 0;
    for (let dj = -2; dj <= 2; dj++)
      for (let di = -2; di <= 2; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const f = L.fixtures[j * n + i];
        if (f.level <= 0) continue;
        // (the troffer themes measure from the ceiling itself, as they always have)
        const dx = f.x - x, dy = (L.theme.lamp ? lp.y : L.ceiling) - y, dz = f.z - z, d2 = dx * dx + dy * dy + dz * dz;
        const reach = (this.reachTex.image.data[c] >>> ((dj + 2) * 5 + (di + 2))) & 1;
        if (!reach) continue;
        const win = clamp(1 - Math.sqrt(d2) / lp.win, 0, 1);
        sum += (f.level * win * win) / (d2 * lp.fall + 0.55);
      }
    return sum * L.theme.lightPow;
  }

  // ---- per frame ---------------------------------------------------------------------------
  update(dt, cam, events) {
    this.time += dt;
    const L = this.level, n = L.n, d = this.fixData, t = this.time;
    for (let k = 0; k < L.fixtures.length; k++) {
      const f = L.fixtures[k];
      if (f.state === 'flicker') {
        const s = Math.sin(t * 13.7 + f.phase) + Math.sin(t * 31.1 + f.phase * 2.3) + Math.sin(t * 2.3 + f.phase * 0.7) * 1.6;
        const burst = Math.sin(t * 0.37 + f.phase) > 0.65;
        f.level = burst ? (s > 0.4 ? 1 : s > -0.5 ? 0.25 : 0) : 1;
      } else if (f.state === 'dying') {
        f.dieT = (f.dieT || 0) + dt;
        f.level = f.dieT > 1.2 ? 0 : Math.random() < 0.5 ? 1 : 0.1;
        if (f.dieT > 1.2) f.state = 'dead';
      } else if (f.state === 'dead') f.level = 0;
      else f.level = 1;
      f.level *= this.blackout ? 0 : this.dim ?? 1;
      d[k * 4] = f.level;
      d[k * 4 + 1] = 0;
    }
    // the two nearest live fixtures become real shadow-casting spots
    const px = cam.position.x, pz = cam.position.z;
    const ranked = [];
    const ci = Math.floor((px + L.half) / L.cell), cj = Math.floor((pz + L.half) / L.cell);
    for (let j = cj - 2; j <= cj + 2; j++)
      for (let i = ci - 2; i <= ci + 2; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const f = L.fixtures[j * n + i];
        if (f.state === 'dead') continue;
        ranked.push([Math.hypot(f.x - px, f.z - pz), f, j * n + i]);
      }
    ranked.sort((a, b) => a[0] - b[0]);
    // assign by identity: a spot keeps its fixture while that stays among the nearest, so
    // crossing between two lights never resets both; a freed spot fades out before it moves
    const top = ranked.slice(0, this.spots.length);
    const held = new Set(this.spots.map((sp) => sp.fixture).filter(Boolean));
    const free = top.filter((r) => !held.has(r[1]));
    for (const sp of this.spots) {
      const keep = sp.fixture && top.some((r) => r[1] === sp.fixture);
      if (!keep && sp.fixture && sp.w > 0) {
        sp.w = Math.max(0, sp.w - dt * 4); // hand the fixture back to the shader light first
        if (sp.w <= 0) sp.fixture = null;
      } else if (!keep) {
        sp.fixture = null;
        const next = free.shift();
        if (next) { sp.fixture = next[1]; sp.k = next[2]; sp.w = 0; }
      } else {
        sp.w = Math.min(1, sp.w + dt * 3); // fade the hand-off from shader light to spot light
      }
      const f = sp.fixture;
      if (!f) { sp.light.intensity = 0; continue; }
      if (keep) sp.k = top.find((r) => r[1] === f)[2];
      d[sp.k * 4 + 1] = sp.w;
      sp.light.position.set(f.x, this.lamp.spotY, f.z);
      sp.light.target.position.set(f.x, 0, f.z);
      sp.light.intensity = this.lamp.spot * L.theme.lightPow * f.level * sp.w;
    }
    this.fixTex.needsUpdate = true;
    if (this.dressing) this.dressing.update(dt, cam);
    // dust drifts around the camera
    const p = this.dust.geometry.attributes.position, a = p.array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += Math.sin(t * 0.3 + i) * 0.0008;
      a[i + 1] -= 0.0012 + 0.0008 * Math.sin(i);
      if (a[i + 1] < 0) a[i + 1] = L.ceiling;
      if (a[i] - px > 8) a[i] -= 16; else if (a[i] - px < -8) a[i] += 16;
      if (a[i + 2] - pz > 8) a[i + 2] -= 16; else if (a[i + 2] - pz < -8) a[i + 2] += 16;
    }
    p.needsUpdate = true;
    this.decals.flush();
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.fixTex.dispose();
    this.reachTex.dispose();
    this.wallTex.dispose();
    this.decals.target.dispose();
    this.decals.geo.dispose();
    this.decals.material.dispose();
    this.wallDecals.mesh.dispose(); // instance buffer
    for (const sp of this.spots) sp.light.dispose(); // shadow maps
    if (this.dressing) this.dressing.dispose();
  }
}

// cheap but readable prop meshes; parts are [material, geometry] in prop space (y up, front +z)
function propParts(kind, def, box, mats) {
  const P = [];
  const { w, d, h } = def;
  switch (kind) {
    case 'cabinet':
      P.push([mats.metal, box(w, h, d, 0, h / 2, 0)]);
      for (let k = 0; k < 4; k++) P.push([mats.dark, box(w * 0.3, 0.02, 0.02, 0, h * (0.2 + k * 0.23), d / 2 + 0.01)]);
      break;
    case 'shelf':
      for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) P.push([mats.metal, box(0.035, h, 0.035, x, h / 2, z)]);
      for (let k = 0; k < 5; k++) P.push([mats.metal, box(w, 0.025, d, 0, 0.08 + k * (h - 0.1) / 4, 0)]);
      for (let k = 0; k < 4; k++) if (Math.random() < 0.7) P.push([mats.cardboard, box(w * (0.3 + Math.random() * 0.4), 0.25, d * 0.8, (Math.random() - 0.5) * w * 0.4, 0.22 + k * (h - 0.1) / 4, 0)]);
      break;
    case 'desk':
      P.push([mats.wood, box(w, 0.04, d, 0, h - 0.02, 0)]);
      P.push([mats.wood, box(0.04, h - 0.04, d * 0.95, -w / 2 + 0.03, (h - 0.04) / 2, 0)]);
      P.push([mats.wood, box(0.42, h - 0.04, d * 0.95, w / 2 - 0.22, (h - 0.04) / 2, 0)]);
      P.push([mats.dark, box(0.45, 0.32, 0.05, -0.2, h + 0.18, -d * 0.2)]);
      break;
    case 'crate':
      P.push([mats.wood, box(w, h, d, 0, h / 2, 0)]);
      for (const y of [0.05, h - 0.05]) P.push([mats.wood, box(w + 0.02, 0.07, d + 0.02, 0, y, 0)]);
      break;
    case 'boxes':
      P.push([mats.cardboard, box(w, 0.45, d, 0, 0.225, 0)]);
      P.push([mats.cardboard, box(w * 0.8, 0.35, d * 0.85, 0.04, 0.625, -0.02)]);
      P.push([mats.cardboard, box(w * 0.5, 0.25, d * 0.6, -0.08, 0.925, 0.03)]);
      break;
    case 'partition':
      P.push([mats.partition, box(w, h, d, 0, h / 2, 0)]);
      P.push([mats.metal, box(w, 0.03, d + 0.02, 0, h, 0)]);
      break;
    case 'barrel': {
      const g = new T3.CylinderGeometry(w / 2, w / 2, h, 16).translate(0, h / 2, 0);
      P.push([mats.metal, g]);
      break;
    }
    case 'vending':
      P.push([mats.dark, box(w, h, d, 0, h / 2, 0)]);
      P.push([mats.glow, box(w * 0.62, h * 0.55, 0.02, -w * 0.12, h * 0.6, d / 2 + 0.005)]);
      break;
    case 'sofa':
      P.push([mats.fabric, box(w, 0.42, d, 0, 0.21, 0)]);
      P.push([mats.fabric, box(w, 0.45, 0.2, 0, 0.62, -d / 2 + 0.1)]);
      for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) P.push([mats.fabric, box(0.2, 0.3, d, x, 0.55, 0)]);
      break;
    default:
      P.push([mats.metal, box(w, h, d, 0, h / 2, 0)]);
  }
  return P;
}

// Bullet holes and blood on walls, props and the ceiling. Two instanced quad meshes share one
// procedural 8 x 8 atlas: "marks" (holes, grazes, scorches) and "blood", so heavy bleeding never
// recycles the bullet holes. The atlas is painted with a height field from which a normal map is
// derived, so craters, torn paper, splinters and wet blood catch the light. Each pool is a ring and
// the decals next in line to be recycled fade out first.
//   tile name: [row, first column, variants]
const DECAL_TILES = {
  'hole:drywall': [0, 0, 4], 'exit:drywall': [0, 4, 2], 'hole:cardboard': [0, 6, 2],
  'hole:concrete': [1, 0, 4], 'exit:concrete': [1, 4, 2], 'hole:ceiling': [1, 6, 2],
  'hole:wood': [2, 0, 3], 'exit:wood': [2, 3, 2], 'hole:metal': [2, 5, 3],
  'exit:metal': [3, 0, 2], graze: [3, 2, 2], scorch: [3, 4, 2], 'hole:small': [3, 6, 2],
  spatter: [4, 0, 8], blood: [5, 0, 4], heavy: [5, 4, 4], drip: [6, 0, 4], smear: [6, 4, 4], drops: [7, 0, 4], dark: [7, 4, 4],
};
const DECAL_ALIAS = {
  hole: 'hole:drywall', 'hole:goods': 'hole:cardboard', 'exit:goods': 'hole:cardboard', 'exit:cardboard': 'hole:cardboard',
  'exit:ceiling': 'hole:ceiling', 'hole:default': 'hole:concrete', 'exit:default': 'exit:concrete', 'hole:carpet': 'hole:small',
};
const DECAL_BLOOD = { spatter: 1, blood: 1, heavy: 1, drip: 1, smear: 1, drops: 1, dark: 1 };

class WallDecals {
  constructor(scene, max = 800) {
    this.max = max;
    this.clock = null; // () => seconds; set by the gore system (game time), else wall-clock
    const { map, normal } = WallDecals.atlas();
    this.uTime = { value: 0 };
    this.marks = this.pool(scene, map, normal, max, false);
    this.blood = this.pool(scene, map, normal, Math.round(max * 1.6), true);
    // LevelView.dispose() frees `mesh`; free the blood pool's instance buffers with it
    this.mesh = this.marks.mesh;
    const own = this.mesh.dispose.bind(this.mesh), other = this.blood.mesh;
    this.mesh.dispose = () => { own(); other.dispose(); };
    this._x = new T3.Vector3(); this._y = new T3.Vector3(); this._z = new T3.Vector3(); this._t = new T3.Vector3();
  }

  pool(scene, map, normalMap, max, wet) {
    const geo = new T3.PlaneGeometry(1, 1);
    const tile = new T3.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    const info = new T3.InstancedBufferAttribute(new Float32Array(max * 4), 4); // born, wet, mode, opacity
    tile.setUsage(T3.DynamicDrawUsage);
    info.setUsage(T3.DynamicDrawUsage);
    geo.setAttribute('aTile', tile);
    geo.setAttribute('aInfo', info);
    const mat = new T3.MeshStandardMaterial({
      map, normalMap, transparent: true, depthWrite: false, roughness: 0.92, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: wet ? -5 : -4, polygonOffsetUnits: wet ? -6 : -4,
    });
    const u = { uDecalHead: { value: 0 }, uDecalMax: { value: max }, uDecalTime: this.uTime };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec2 aTile; attribute vec4 aInfo; varying vec4 vDecal; varying vec2 vDecalUv;
uniform float uDecalHead; uniform float uDecalMax;`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
vMapUv = vMapUv * 0.125 + aTile;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv = vNormalMapUv * 0.125 + aTile;
#endif
vDecal = aInfo; vDecalUv = uv;
// the oldest decals (next to be overwritten) fade out ahead of the ring's write head
vDecal.w *= smoothstep(0.0, 40.0, mod(float(gl_InstanceID) - uDecalHead + uDecalMax, uDecalMax));`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec4 vDecal; varying vec2 vDecalUv; uniform float uDecalTime;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
{
  float dAge = max(uDecalTime - vDecal.x, 0.0);
  if (vDecal.z > 0.5 && vDecal.z < 1.5) {
    // a run of blood creeping down the wall: the tile is revealed from the top
    float reach = 0.32 + 0.72 * (1.0 - exp(-dAge / 3.0));
    diffuseColor.a *= smoothstep(reach + 0.025, reach - 0.025, 1.0 - vDecalUv.y);
  }
  diffuseColor.a *= vDecal.w;
}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // the fixtures light the level through a term that ignores normal maps (see patchLattice), so
  // shade the relief here: faces tilted up toward the lamps catch light, faces tilted down and the
  // steep walls of a hole fall into shadow
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 geoN = normalize(vNormal);
  float rel = dot(normal - geoN, upV);
  float tilt = 1.0 - clamp(dot(normal, geoN), 0.0, 1.0);
  diffuseColor.rgb *= clamp(1.0 + 1.5 * rel - 1.2 * tilt, 0.2, 1.7);
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  float dAge = max(uDecalTime - vDecal.x, 0.0);
  // fresh blood is a glossy film that dulls as it dries; bare metal round a hit shines
  roughnessFactor = mix(roughnessFactor, 0.13, vDecal.y * (0.4 + 0.6 * exp(-dAge / 45.0)));
  if (vDecal.z > 1.5) roughnessFactor = mix(roughnessFactor, 0.3, smoothstep(0.35, 0.6, dot(diffuseColor.rgb, vec3(0.33))));
}`);
    };
    mat.customProgramCacheKey = () => 'walldecal';
    const mesh = new T3.InstancedMesh(geo, mat, max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = wet ? 2 : 1;
    mesh.instanceMatrix.setUsage(T3.DynamicDrawUsage);
    mesh.onBeforeRender = () => { this.uTime.value = this.now(); };
    scene.add(mesh);
    return { mesh, max, head: 0, tile, info, u, mat };
  }

  now() { return this.clock ? this.clock() : performance.now() / 1000; }

  // light the decals like the surfaces they sit on (the level's fixture lattice)
  useLattice(shared) {
    for (const p of [this.marks, this.blood]) {
      if (p.mat.userData.latticeShared) continue;
      patchLattice(p.mat, shared, { key: 'walldecal' });
      p.mat.needsUpdate = true;
    }
  }

  // kind: a tile name ('hole:<material>', 'exit:<material>', 'graze', 'scorch', 'spatter', 'blood',
  // 'heavy', 'drip', 'smear', 'drops', 'dark') or an alias ('hole'); point and normal in world space.
  // opts: dir (in-plane direction for the tile's +x: spatter tails, grazes), stretch (x scale),
  // angle (else random), wet (0..1, blood defaults to 1), alpha
  add(kind, point, normal, size = 0.06, opts = null) {
    const name = DECAL_TILES[kind] ? kind : DECAL_ALIAS[kind] || (kind.startsWith('exit:') ? 'exit:concrete' : kind.startsWith('hole:') ? 'hole:concrete' : 'blood');
    const tl = DECAL_TILES[name], bloody = DECAL_BLOOD[name] === 1;
    const P = bloody ? this.blood : this.marks;
    const i = P.head;
    P.head = (i + 1) % P.max;
    P.mesh.count = Math.max(P.mesh.count, i + 1);
    P.u.uDecalHead.value = P.head;
    // basis: z = normal, y = up the wall (north on floors and ceilings), x = y × z; or x along opts.dir
    const z = this._z.set(normal.x, normal.y, normal.z).normalize(), x = this._x, y = this._y;
    const dir = opts && opts.dir;
    let ok = false;
    if (dir) {
      x.set(dir.x, dir.y, dir.z).addScaledVector(z, -(dir.x * z.x + dir.y * z.y + dir.z * z.z));
      if (x.lengthSq() > 1e-6) { x.normalize(); y.crossVectors(z, x); ok = true; }
    }
    if (!ok) {
      if (Math.abs(z.y) < 0.9) y.set(0, 1, 0); else y.set(0, 0, 1);
      y.addScaledVector(z, -y.dot(z)).normalize();
      x.crossVectors(y, z);
      if (name !== 'drip') {
        const a = opts && opts.angle !== undefined ? opts.angle : Math.random() * TAU, c = Math.cos(a), s = Math.sin(a);
        const t = this._t.copy(x).multiplyScalar(c).addScaledVector(y, s);
        y.multiplyScalar(c).addScaledVector(x, -s);
        x.copy(t);
      }
    }
    // (no mirrored variants: a negative scale would flip the winding and cull the quad)
    const sx = size * ((opts && opts.stretch) || 1), sy = size;
    const off = bloody ? 0.0035 : 0.0025;
    const e = P.mesh.instanceMatrix.array, o = i * 16;
    e[o] = x.x * sx; e[o + 1] = x.y * sx; e[o + 2] = x.z * sx; e[o + 3] = 0;
    e[o + 4] = y.x * sy; e[o + 5] = y.y * sy; e[o + 6] = y.z * sy; e[o + 7] = 0;
    e[o + 8] = z.x; e[o + 9] = z.y; e[o + 10] = z.z; e[o + 11] = 0;
    e[o + 12] = point.x + z.x * off; e[o + 13] = point.y + z.y * off; e[o + 14] = point.z + z.z * off; e[o + 15] = 1;
    const col = tl[1] + Math.floor(Math.random() * tl[2]);
    // texture rows are flipped (canvas y down, uv y up)
    P.tile.setXY(i, col * 0.125, (7 - tl[0]) * 0.125);
    const mode = name === 'drip' ? 1 : name === 'hole:metal' || name === 'exit:metal' ? 2 : 0;
    const wet = opts && opts.wet !== undefined ? opts.wet : bloody && name !== 'dark' ? 1 : 0;
    P.info.setXYZW(i, this.now(), wet, mode, opts && opts.alpha !== undefined ? opts.alpha : 1);
    P.mesh.instanceMatrix.addUpdateRange(o, 16);
    P.tile.addUpdateRange(i * 2, 2);
    P.info.addUpdateRange(i * 4, 4);
    P.mesh.instanceMatrix.needsUpdate = true;
    P.tile.needsUpdate = true;
    P.info.needsUpdate = true;
  }

  clear() {
    for (const p of [this.marks, this.blood]) { p.mesh.count = 0; p.head = 0; p.u.uDecalHead.value = 0; }
  }

  // ---- the atlas ------------------------------------------------------------------------------
  static atlas() {
    return Lab.cached('br:walldecal-atlas2', () => WallDecals.paintAtlas(2048));
  }

  static paintAtlas(S) {
    const T = S / 8, R = Math.random;
    const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = S; return cv; };
    const colC = mk(), hgtC = mk();
    const c = colC.getContext('2d'), h = hgtC.getContext('2d');
    h.fillStyle = 'rgb(128,128,128)';
    h.fillRect(0, 0, S, S);
    const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
    const grey = (v, a = 1) => rgba(v, v, v, a);
    const jit = (v, d) => v + (R() - 0.5) * 2 * d;
    // an irregular closed outline: n points round (x, y), radius r (+/- jag), squashed by sx, sy
    const shape = (x, y, r, jag, n, sx = 1, sy = 1, rot = 0) => {
      // a low-frequency wobble from a few random control values, plus per-vertex roughness
      const m = 4 + ((R() * 4) | 0), ctl = [];
      for (let k = 0; k < m; k++) ctl.push(R() - 0.5);
      const pts = [];
      for (let k = 0; k < n; k++) {
        const f = (k / n) * m, i0 = Math.floor(f), t = f - i0, a0 = ctl[i0 % m], a1 = ctl[(i0 + 1) % m];
        const lo = a0 + (a1 - a0) * t * t * (3 - 2 * t);
        const a = rot + (k / n) * TAU, rr = r * (1 + jag * (lo * 1.3 + (R() - 0.5) * 0.9));
        pts.push(x + Math.cos(a) * rr * sx, y + Math.sin(a) * rr * sy);
      }
      return pts;
    };
    const path = (g, p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let k = 2; k < p.length; k += 2) g.lineTo(p[k], p[k + 1]); g.closePath(); };
    const fill = (g, p, style) => { g.fillStyle = style; path(g, p); g.fill(); };
    const radial = (g, x, y, r0, r1, stops) => { const gr = g.createRadialGradient(x, y, r0, x, y, r1); for (const [o, s] of stops) gr.addColorStop(o, s); return gr; };
    const disc = (g, x, y, r, style) => { g.fillStyle = style; g.beginPath(); g.arc(x, y, Math.max(0.3, r), 0, TAU); g.fill(); };
    const ell = (g, x, y, rx, ry, rot, style) => { g.fillStyle = style; g.beginPath(); g.ellipse(x, y, Math.max(0.3, rx), Math.max(0.3, ry), rot, 0, TAU); g.fill(); };
    // a scatter of specks in a ring band (colour by relative radius)
    const specks = (g, x, y, r0, r1, n, size, colFn, bias = 0.8) => {
      for (let k = 0; k < n; k++) {
        const a = R() * TAU, f = R() ** bias, r = r0 + (r1 - r0) * f, s = size * (0.4 + R());
        g.fillStyle = colFn(f);
        g.fillRect(x + Math.cos(a) * r - s / 2, y + Math.sin(a) * r - s / 2, s, s);
      }
    };
    // a tapered sliver from radius r0 at angle a, length len, base half-width w
    const sliver = (x, y, a, r0, len, w) => {
      const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
      const bx = x + ca * r0, by = y + sa * r0, tx = x + ca * (r0 + len), ty = y + sa * (r0 + len);
      return [bx + px * w, by + py * w, tx + px * w * 0.15, ty + py * w * 0.15, tx, ty, bx - px * w, by - py * w];
    };
    // a blood drop flying along +x: body ellipse plus a tapering tail (and a cast-off bead)
    const dropTail = (x, y, len, wid, tail, col, hv) => {
      ell(c, x, y, len / 2, wid / 2, 0, col);
      ell(h, x, y, len / 2, wid / 2, 0, grey(hv));
      const p = [x + len * 0.2, y - wid * 0.42, x + len / 2 + tail, y + jit(0, wid * 0.08), x + len * 0.2, y + wid * 0.42];
      fill(c, p, col);
      fill(h, p, grey(hv - 8));
      if (tail > wid * 0.6 && R() < 0.6) {
        const bx = x + len / 2 + tail * (1.15 + 0.4 * R()), br = wid * (0.12 + 0.12 * R());
        disc(c, bx, y + jit(0, wid * 0.1), br, col);
      }
    };
    const blood = (a = 1, v = 0) => rgba(jit(128, 12) - v, 7, 5, a);
    const deep = (a = 1) => rgba(jit(80, 6), 3, 3, a);

    const tile = (row, col, paint) => {
      const x0 = col * T, y0 = row * T, cx = x0 + T / 2, cy = y0 + T / 2;
      for (const g of [c, h]) { g.save(); g.beginPath(); g.rect(x0 + 3, y0 + 3, T - 6, T - 6); g.clip(); }
      paint(cx, cy, T);
      c.restore();
      h.restore();
    };
    const cracks = (cx, cy, r0, n, len, style, w) => {
      c.strokeStyle = style; c.lineWidth = w;
      for (let q = 0; q < n; q++) {
        let a = R() * TAU, r = r0;
        c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        const steps = 3 + (R() * 3) | 0;
        for (let s = 0; s < steps; s++) { a += (R() - 0.5) * 0.5; r += len / steps; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        c.stroke();
      }
    };

    // ---- row 0: drywall entry / exit, cardboard -------------------------------------------------
    for (let k = 0; k < 4; k++) tile(0, k, (cx, cy, u) => {
      // gypsum powder blown back out of the hole
      c.fillStyle = radial(c, cx, cy, u * 0.05, u * 0.45, [[0, rgba(244, 241, 232, 0.8)], [0.3, rgba(238, 234, 222, 0.42)], [1, rgba(230, 225, 210, 0)]]);
      c.beginPath(); c.arc(cx, cy, u * 0.45, 0, TAU); c.fill();
      specks(c, cx, cy, u * 0.1, u * 0.47, 360, u * 0.008, (f) => rgba(248, 246, 238, 0.7 * (1 - f) + 0.1));
      specks(c, cx, cy, u * 0.12, u * 0.34, 60, u * 0.01, (f) => rgba(140, 130, 112, 0.4 * (1 - f)), 1.3);
      // exposed gypsum core where the facing paper tore away
      const cr = u * (0.16 + 0.035 * R());
      const crater = shape(cx, cy, cr, 0.3, 26);
      fill(c, crater, rgba(238, 235, 226));
      fill(h, crater, radial(h, cx, cy, 0, cr, [[0, grey(20)], [0.5, grey(70)], [1, grey(112)]]));
      // the crater's inner wall: shaded gypsum going down into the hole
      c.fillStyle = radial(c, cx, cy, cr * 0.3, cr, [[0, rgba(150, 144, 132, 0.85)], [0.55, rgba(205, 200, 188, 0.5)], [1, rgba(230, 226, 216, 0)]]);
      path(c, crater); c.fill();
      specks(c, cx, cy, u * 0.07, cr, 50, u * 0.009, () => rgba(196, 190, 176, 0.75), 1);
      // flaps of the paper facing, folded into the crater
      for (let f = 0; f < 6 + k; f++) {
        const a = R() * TAU, r0 = cr * (0.45 + 0.3 * R()), r1 = cr * (1 + 0.12 * R()), w = 0.16 + 0.22 * R();
        const p = [cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1];
        const v = jit(0, 8);
        fill(c, p, rgba(214 + v, 204 + v, 178 + v));
        fill(h, p, grey(118));
        c.strokeStyle = rgba(96, 86, 70, 0.6); c.lineWidth = u * 0.004; path(c, p); c.stroke();
      }
      c.strokeStyle = rgba(105, 95, 78, 0.6); c.lineWidth = u * 0.008; path(c, crater); c.stroke();
      // the hole itself: a dark throat with a grey ring wiped off the bullet
      const hr = u * (0.072 + 0.018 * R());
      c.fillStyle = radial(c, cx, cy, hr * 0.9, hr * 1.55, [[0, rgba(55, 50, 45, 0.75)], [1, rgba(70, 64, 56, 0)]]);
      c.beginPath(); c.arc(cx, cy, hr * 1.55, 0, TAU); c.fill();
      const hole = shape(cx, cy, hr, 0.3, 14);
      fill(c, hole, radial(c, cx, cy, 0, hr * 1.1, [[0, rgba(4, 3, 2)], [0.7, rgba(14, 12, 10)], [1, rgba(48, 42, 36)]]));
      fill(h, hole, grey(0));
      cracks(cx, cy, cr * 0.95, 2 + k, u * 0.12, rgba(110, 100, 85, 0.38), u * 0.004);
    });
    for (let k = 0; k < 2; k++) tile(0, 4 + k, (cx, cy, u) => {
      // exit side: the far facing blows out in large peeled flaps over crumbled gypsum
      c.fillStyle = radial(c, cx, cy, u * 0.1, u * 0.47, [[0, rgba(238, 234, 222, 0.55)], [1, rgba(230, 225, 210, 0)]]);
      c.beginPath(); c.arc(cx, cy, u * 0.47, 0, TAU); c.fill();
      specks(c, cx, cy, u * 0.15, u * 0.48, 380, u * 0.01, (f) => rgba(240, 236, 225, 0.65 * (1 - f) + 0.1));
      const cr = u * (0.24 + 0.05 * R());
      const crater = shape(cx, cy, cr, 0.4, 20);
      fill(c, crater, rgba(226, 222, 210));
      fill(h, crater, radial(h, cx, cy, 0, cr, [[0, grey(20)], [0.5, grey(70)], [1, grey(118)]]));
      specks(c, cx, cy, u * 0.05, cr, 220, u * 0.016, () => (R() < 0.5 ? rgba(196, 192, 180, 0.8) : rgba(246, 244, 236, 0.8)), 1);
      specks(h, cx, cy, u * 0.05, cr, 160, u * 0.016, () => grey(R() < 0.5 ? 40 : 110, 0.8), 1);
      const nf = 2 + ((R() * 3) | 0), a0 = R() * TAU;
      for (let f = 0; f < nf; f++) {
        // a torn, curled flap of the facing: a ragged outer edge, its underside in shadow (unevenly
        // spaced and sized, so the hole does not read as a flower)
        const a = a0 + (f / nf) * TAU + jit(0, 1.1), r0 = cr * (0.7 + 0.15 * R()), r1 = cr * (1.0 + 0.75 * R() ** 2), w = 0.2 + 0.4 * R();
        const p = [cx + Math.cos(a - w) * r0, cy + Math.sin(a - w) * r0];
        for (let q = 0; q <= 6; q++) {
          const t = q / 6, aa = a - w * 0.6 + t * w * 1.3, rr = r1 * (0.82 + 0.18 * Math.sin(t * Math.PI)) * (0.9 + 0.2 * R());
          p.push(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr);
        }
        p.push(cx + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0);
        // the lifted facing keeps the wall's own finish, so it is mostly see-through here: a little
        // shade under it and white gypsum showing along the tear
        fill(c, p, rgba(60, 52, 42, 0.2));
        fill(h, p, radial(h, cx, cy, r0, r1, [[0, grey(140)], [1, grey(185)]]));
        // (only the torn outer edge shows the gypsum core)
        for (const [st, lw] of [[rgba(244, 241, 232, 0.85), 0.007], [rgba(70, 62, 50, 0.3), 0.0025]]) {
          c.strokeStyle = st; c.lineWidth = u * lw; c.beginPath(); c.moveTo(p[2], p[3]);
          for (let q = 4; q < p.length - 2; q += 2) c.lineTo(p[q], p[q + 1]);
          c.stroke();
        }
      }
      const hr = u * (0.1 + 0.025 * R());
      const hole = shape(cx, cy, hr, 0.35, 14);
      fill(c, hole, radial(c, cx, cy, 0, hr, [[0, rgba(5, 4, 3)], [0.75, rgba(24, 20, 16)], [1, rgba(70, 62, 52)]]));
      fill(h, hole, grey(0));
    });
    for (let k = 0; k < 2; k++) tile(0, 6 + k, (cx, cy, u) => {
      // cardboard: torn kraft liner, crushed flute, brown fibre dust
      specks(c, cx, cy, u * 0.06, u * 0.4, 160, u * 0.008, (f) => rgba(150, 118, 78, 0.4 * (1 - f)));
      const cr = u * (0.13 + 0.03 * R());
      const torn = shape(cx, cy, cr, 0.45, 20);
      fill(c, torn, rgba(jit(192, 6), jit(160, 6), jit(112, 6)));
      fill(h, torn, grey(100));
      c.strokeStyle = rgba(214, 188, 140, 0.8); c.lineWidth = u * 0.005;
      for (let f = 0; f < 40; f++) { const a = R() * TAU, r = cr * (0.8 + 0.4 * R()); c.beginPath(); c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.lineTo(cx + Math.cos(a + jit(0, 0.2)) * (r + u * 0.03), cy + Math.sin(a + jit(0, 0.2)) * (r + u * 0.03)); c.stroke(); }
      const hr = u * (0.07 + 0.015 * R());
      const hole = shape(cx, cy, hr, 0.3, 12);
      fill(c, hole, rgba(24, 17, 10));
      fill(h, hole, grey(5));
      c.save(); path(c, hole); c.clip();
      c.strokeStyle = rgba(120, 92, 58, 0.55); c.lineWidth = u * 0.008;
      for (let q = -3; q <= 3; q++) { c.beginPath(); c.moveTo(cx - hr, cy + q * u * 0.025); for (let s = 0; s <= 8; s++) c.lineTo(cx - hr + (s / 8) * hr * 2, cy + q * u * 0.025 + (s % 2 ? u * 0.008 : -u * 0.008)); c.stroke(); }
      c.restore();
    });

    // ---- row 1: concrete entry / exit, ceiling tile ---------------------------------------------
    const concrete = (cx, cy, u, big) => {
      c.fillStyle = radial(c, cx, cy, u * 0.08, u * 0.46, [[0, rgba(196, 193, 186, 0.5)], [0.4, rgba(186, 183, 176, 0.25)], [1, rgba(180, 177, 170, 0)]]);
      c.beginPath(); c.arc(cx, cy, u * 0.46, 0, TAU); c.fill();
      specks(c, cx, cy, u * 0.12, u * 0.47, 260, u * 0.008, (f) => rgba(205, 202, 195, 0.55 * (1 - f) + 0.08));
      const cr = u * (big ? 0.3 + 0.06 * R() : 0.2 + 0.06 * R());
      const crater = shape(cx, cy, cr, big ? 0.4 : 0.32, 30);
      fill(c, crater, rgba(jit(176, 5), jit(173, 5), jit(166, 5)));
      fill(h, crater, radial(h, cx, cy, 0, cr, [[0, grey(25)], [0.45, grey(70)], [1, grey(118)]]));
      // aggregate in the fresh fracture
      specks(c, cx, cy, 0, cr * 0.95, big ? 260 : 170, u * 0.014, () => (R() < 0.5 ? rgba(138, 134, 126, 0.85) : rgba(208, 205, 198, 0.85)), 1);
      specks(h, cx, cy, 0, cr * 0.95, 160, u * 0.014, () => grey(R() < 0.5 ? 45 : 100, 0.6), 1);
      const inner = shape(cx, cy, cr * 0.55, 0.3, 20);
      fill(c, inner, rgba(150, 147, 140, 0.8));
      const hr = u * (0.05 + 0.015 * R()) * (big ? 1.4 : 1);
      const hole = shape(cx, cy, hr, 0.3, 10);
      fill(c, hole, radial(c, cx, cy, 0, hr, [[0, rgba(12, 11, 10)], [1, rgba(48, 46, 42)]]));
      fill(h, hole, grey(0));
      c.strokeStyle = rgba(95, 92, 86, 0.45); c.lineWidth = u * 0.006; path(c, crater); c.stroke();
      // chips knocked off round the crater
      for (let q = 0; q < 10; q++) {
        const a = R() * TAU, r = cr * (1.05 + 0.5 * R());
        const p = shape(cx + Math.cos(a) * r, cy + Math.sin(a) * r, u * (0.008 + 0.014 * R()), 0.4, 5);
        const v = jit(0, 10);
        fill(c, p, rgba(168 + v, 165 + v, 158 + v, 0.9));
        fill(h, p, grey(95));
      }
      cracks(cx, cy, cr, big ? 4 : 2, u * 0.12, rgba(80, 78, 74, 0.35), u * 0.004);
    };
    for (let k = 0; k < 4; k++) tile(1, k, (cx, cy, u) => concrete(cx, cy, u, false));
    for (let k = 0; k < 2; k++) tile(1, 4 + k, (cx, cy, u) => concrete(cx, cy, u, true));
    for (let k = 0; k < 2; k++) tile(1, 6 + k, (cx, cy, u) => {
      // mineral-fibre ceiling tile: a crumbly, porous crater
      specks(c, cx, cy, u * 0.08, u * 0.42, 220, u * 0.009, (f) => rgba(236, 233, 224, 0.55 * (1 - f) + 0.05));
      const cr = u * (0.15 + 0.04 * R());
      const crater = shape(cx, cy, cr, 0.4, 16);
      fill(c, crater, rgba(212, 208, 196));
      fill(h, crater, radial(h, cx, cy, 0, cr, [[0, grey(30)], [1, grey(112)]]));
      specks(c, cx, cy, 0, cr, 200, u * 0.012, () => rgba(150, 146, 136, 0.7), 1);
      const hr = u * 0.07;
      const hole = shape(cx, cy, hr, 0.35, 10);
      fill(c, hole, rgba(18, 16, 14));
      fill(h, hole, grey(0));
    });

    // ---- row 2: wood entry / exit, metal dents --------------------------------------------------
    const woodFresh = () => rgba(jit(212, 12), jit(174, 12), jit(118, 10));
    for (let k = 0; k < 3; k++) tile(2, k, (cx, cy, u) => {
      // sawdust and fibres, raised splinters mostly along the grain (x)
      for (let q = 0; q < 140; q++) { const a = R() * TAU, r = u * (0.06 + 0.32 * R() ** 0.8); ell(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, u * 0.008, u * 0.003, 0, rgba(200, 165, 110, 0.45 * (1 - r / (u * 0.4)))); }
      const torn = shape(cx, cy, u * 0.14, 0.35, 20, 1.5, 0.8);
      fill(c, torn, rgba(196, 160, 108));
      fill(h, torn, grey(92));
      for (let q = 0; q < 14 + 2 * k; q++) {
        const a = (R() < 0.5 ? 0 : Math.PI) + jit(0, 0.55), len = u * (0.1 + 0.2 * R()), w = u * (0.014 + 0.016 * R());
        const p = sliver(cx, cy, a, u * 0.05, len, w);
        fill(c, p, woodFresh());
        fill(h, p, grey(190));
        c.strokeStyle = rgba(70, 45, 20, 0.45); c.lineWidth = u * 0.003; path(c, p); c.stroke();
      }
      const hr = u * (0.07 + 0.015 * R());
      const hole = shape(cx, cy, hr, 0.3, 14, 1.15, 0.9);
      fill(c, hole, radial(c, cx, cy, 0, hr * 1.1, [[0, rgba(14, 9, 4)], [1, rgba(48, 30, 16)]]));
      fill(h, hole, grey(0));
    });
    for (let k = 0; k < 2; k++) tile(2, 3 + k, (cx, cy, u) => {
      // exit: a long blow-out torn along the grain, bristling with splinters
      const cr = u * 0.27;
      const blow = shape(cx, cy, cr, 0.4, 20, 1.55, 0.5);
      fill(c, blow, rgba(198, 160, 108));
      fill(h, blow, radial(h, cx, cy, 0, cr * 1.4, [[0, grey(35)], [1, grey(120)]]));
      c.strokeStyle = rgba(110, 75, 40, 0.6); c.lineWidth = u * 0.005;
      for (let q = 0; q < 14; q++) { const yy = cy + jit(0, cr * 0.4); c.beginPath(); c.moveTo(cx - cr * 1.4, yy); c.bezierCurveTo(cx - cr * 0.5, yy + jit(0, 6), cx + cr * 0.5, yy + jit(0, 6), cx + cr * 1.4, yy); c.stroke(); }
      for (let q = 0; q < 18; q++) {
        const a = (R() < 0.5 ? 0 : Math.PI) + jit(0, 0.35), len = u * (0.12 + 0.2 * R()), w = u * (0.012 + 0.016 * R());
        const p = sliver(cx, cy, a, cr * 0.4, len, w);
        fill(c, p, woodFresh());
        fill(h, p, grey(210));
      }
      const hole = shape(cx, cy, u * 0.09, 0.35, 12, 1.3, 0.8);
      fill(c, hole, rgba(16, 10, 5));
      fill(h, hole, grey(0));
    });
    const metal = (cx, cy, u, through) => {
      // bullet lead / soot smear, paint knocked off round the strike, a bright dented lip
      c.fillStyle = radial(c, cx, cy, u * 0.04, u * 0.3, [[0, rgba(55, 55, 55, 0.45)], [1, rgba(55, 55, 55, 0)]]);
      c.beginPath(); c.arc(cx, cy, u * 0.3, 0, TAU); c.fill();
      const pr = u * (0.15 + 0.06 * R());
      const paint = shape(cx, cy, pr, 0.5, 22);
      fill(c, paint, rgba(158, 158, 154));
      fill(h, paint, grey(118));
      for (let q = 0; q < 7; q++) {
        const a = R() * TAU, r = pr * (1.05 + 0.5 * R());
        const p = shape(cx + Math.cos(a) * r, cy + Math.sin(a) * r, u * (0.012 + 0.02 * R()), 0.45, 6);
        fill(c, p, rgba(150, 150, 146, 0.95));
        fill(h, p, grey(120));
      }
      const lr = u * 0.11;
      c.fillStyle = radial(c, cx, cy, u * 0.04, lr, [[0, rgba(120, 120, 118)], [0.6, rgba(232, 232, 228)], [1, rgba(176, 176, 172)]]);
      c.beginPath(); c.arc(cx, cy, lr, 0, TAU); c.fill();
      h.fillStyle = radial(h, cx, cy, 0, lr * 1.25, [[0, grey(20)], [0.75, grey(150)], [0.85, grey(175)], [1, grey(128)]]);
      h.beginPath(); h.arc(cx, cy, lr * 1.25, 0, TAU); h.fill();
      c.strokeStyle = rgba(235, 235, 230, 0.6); c.lineWidth = u * 0.003;
      for (let q = 0; q < 8; q++) { const a = R() * TAU, r0 = lr * 0.9, r1 = pr * (0.7 + 0.5 * R()); c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a + 0.1) * r1, cy + Math.sin(a + 0.1) * r1); c.stroke(); }
      const hr = u * 0.05;
      disc(c, cx, cy, hr, through ? rgba(4, 4, 4) : radial(c, cx, cy, 0, hr, [[0, rgba(40, 40, 40)], [1, rgba(95, 95, 92)]]));
    };
    for (let k = 0; k < 3; k++) tile(2, 5 + k, (cx, cy, u) => metal(cx, cy, u, k === 2));

    // ---- row 3: metal exit petals, grazes, scorches, small holes --------------------------------
    for (let k = 0; k < 2; k++) tile(3, k, (cx, cy, u) => {
      metal(cx, cy, u, true);
      for (let q = 0; q < 6; q++) {
        const a = (q / 6) * TAU + jit(0, 0.3);
        const p = sliver(cx, cy, a, u * 0.03, u * (0.12 + 0.06 * R()), u * 0.045);
        const v = jit(0, 15);
        fill(c, p, rgba(205 + v, 205 + v, 200 + v));
        fill(h, p, grey(215));
        c.strokeStyle = rgba(60, 60, 58, 0.6); c.lineWidth = u * 0.004; path(c, p); c.stroke();
      }
      disc(c, cx, cy, u * 0.055, rgba(3, 3, 3));
      disc(h, cx, cy, u * 0.055, grey(0));
    });
    for (let k = 0; k < 2; k++) tile(3, 2 + k, (cx, cy, u) => {
      // ricochet gouge along +x: a scraped groove, pale at the bottom, debris thrown downrange
      const p = [];
      const N = 24;
      for (let q = 0; q <= N; q++) { const t = q / N, x = cx - u * 0.36 + t * u * 0.76, w = u * 0.07 * Math.sin(Math.PI * t ** 0.65) * (0.8 + 0.4 * R()); p.push(x, cy - w); }
      for (let q = N; q >= 0; q--) { const t = q / N, x = cx - u * 0.36 + t * u * 0.76, w = u * 0.07 * Math.sin(Math.PI * t ** 0.65) * (0.8 + 0.4 * R()); p.push(x, cy + w); }
      fill(c, p, rgba(196, 194, 186));
      fill(h, p, grey(60));
      c.strokeStyle = rgba(60, 58, 54, 0.75); c.lineWidth = u * 0.012;
      c.beginPath(); c.moveTo(cx - u * 0.3, cy); c.lineTo(cx + u * 0.32, cy + jit(0, u * 0.01)); c.stroke();
      for (let q = 0; q < 70; q++) { const x = cx + u * (0.1 + 0.32 * R()), y = cy + jit(0, u * 0.08 * (x - cx) / (u * 0.3)); disc(c, x, y, u * 0.004 * (0.5 + R()), rgba(150, 148, 140, 0.6)); }
    });
    for (let k = 0; k < 2; k++) tile(3, 4 + k, (cx, cy, u) => {
      c.fillStyle = radial(c, cx, cy, 0, u * 0.45, [[0, rgba(16, 14, 12, 0.8)], [0.5, rgba(26, 23, 20, 0.45)], [1, rgba(30, 27, 24, 0)]]);
      c.beginPath(); c.arc(cx, cy, u * 0.45, 0, TAU); c.fill();
      specks(c, cx, cy, 0, u * 0.45, 200, u * 0.02, (f) => rgba(18, 16, 14, 0.3 * (1 - f)));
    });
    for (let k = 0; k < 2; k++) tile(3, 6 + k, (cx, cy, u) => {
      specks(c, cx, cy, u * 0.05, u * 0.35, 120, u * 0.008, (f) => rgba(150, 146, 138, 0.45 * (1 - f)));
      const cr = shape(cx, cy, u * 0.14, 0.35, 12);
      fill(c, cr, rgba(128, 124, 116, 0.7));
      fill(h, cr, grey(80));
      const hole = shape(cx, cy, u * 0.07, 0.3, 10);
      fill(c, hole, rgba(10, 9, 8));
      fill(h, hole, grey(0));
    });

    // ---- row 4: directional spatter (travel along +x) -------------------------------------------
    for (let k = 0; k < 8; k++) tile(4, k, (cx, cy, u) => {
      const mx = cx - u * (0.12 + 0.08 * R()), my = cy + jit(0, u * 0.03);
      const len = u * (0.18 + 0.1 * R()), wid = u * (0.08 + 0.04 * R());
      dropTail(mx, my, len, wid, u * (0.12 + 0.12 * R()), blood(), 160);
      ell(c, mx - len * 0.05, my, len * 0.3, wid * 0.3, 0, deep(0.9));
      const n = 10 + (R() * 18) | 0;
      for (let q = 0; q < n; q++) {
        const t = R(), x = mx + len * 0.2 + t * u * 0.5, spread = u * 0.04 + (x - mx) * 0.38;
        const y = my + jit(0, spread);
        if (x > cx + u * 0.44) continue;
        const s = u * (0.008 + 0.03 * (1 - t) * R());
        dropTail(x, y, s * 2, s, s * (1 + 2.5 * R()), blood(0.95), 150);
      }
      // a few strays upstream
      for (let q = 0; q < 6; q++) disc(c, mx + jit(-u * 0.1, u * 0.12), my + jit(0, u * 0.15), u * 0.005 * (0.5 + R()), blood(0.9));
    });

    // ---- row 5: round splats, heavy exit spray ---------------------------------------------------
    for (let k = 0; k < 4; k++) tile(5, k, (cx, cy, u) => {
      // a splash striking about square on: a lumpy pool with a scalloped crown, a few short spines
      // ending in beads, and satellite drops thrown out unevenly (heavier on one or two sides)
      const r = u * (0.11 + 0.04 * R());
      const lump = (x, y, rr) => { const b = shape(x, y, rr, 0.3, 18); fill(c, b, blood()); fill(h, b, grey(160)); };
      lump(cx, cy, r * 0.75);
      for (let q = 0; q < 5 + k; q++) { const a = R() * TAU, d = r * (0.2 + 0.45 * R()); lump(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.3 + 0.35 * R())); }
      for (let q = 0; q < 28; q++) { const a = R() * TAU, d = r * (0.72 + 0.22 * R()), s = r * (0.06 + 0.12 * R()); disc(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, s, blood()); disc(h, cx + Math.cos(a) * d, cy + Math.sin(a) * d, s, grey(162)); }
      // the sides the spray went (satellites thrown mostly there)
      const s0 = R() * TAU, s1 = s0 + Math.PI * (0.6 + 0.8 * R());
      const side = () => { const b = R() < 0.75 ? (R() < 0.6 ? s0 : s1) : R() * TAU; return b + (R() - 0.5) * 1.3; };
      for (let q = 0; q < 5 + k; q++) {
        const a = side(), r0 = r * (0.7 + 0.2 * R()), len = r * (0.25 + 0.7 * R()), w = u * (0.006 + 0.01 * R());
        const p = sliver(cx, cy, a, r0, len, w);
        fill(c, p, blood()); fill(h, p, grey(150));
        disc(c, cx + Math.cos(a) * (r0 + len * 1.05), cy + Math.sin(a) * (r0 + len * 1.05), w * (0.9 + 0.8 * R()), blood());
      }
      for (let q = 0; q < 70; q++) {
        const a = side(), f = R(), rr = r * (1.15 + 2.6 * f ** 1.4);
        if (rr > u * 0.46) continue;
        const sz = u * (0.002 + 0.011 * (1 - f) * R());
        if (sz > u * 0.005 && R() < 0.55) {
          // elongated, its tail pointing away from the splash
          c.save(); c.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); c.rotate(a);
          h.save(); h.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); h.rotate(a);
          dropTail(0, 0, sz * 2.2, sz * 1.4, sz * (0.6 + 1.8 * R()), blood(0.95), 152);
          c.restore(); h.restore();
        } else disc(c, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, sz, blood(0.95));
      }
      // thicker, darker blood where it pooled (a couple of uneven patches, not a ring)
      for (let q = 0; q < 2 + (k & 1); q++) { const a = R() * TAU, d = r * 0.3 * R(); const b = shape(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.18 + 0.2 * R()), 0.4, 12); fill(c, b, deep(0.45)); fill(h, b, grey(175)); }
    });
    for (let k = 0; k < 4; k++) tile(5, 4 + k, (cx, cy, u) => {
      // exit wound spray striking square on: a dense core, radial spatter whose drops tail outwards,
      // flecks of tissue (and the odd bone chip)
      const core = shape(cx, cy, u * (0.07 + 0.03 * R()), 0.35, 20);
      fill(c, core, blood());
      fill(h, core, grey(165));
      for (let q = 0; q < 5; q++) {
        const a = R() * TAU, r = u * (0.04 + 0.08 * R());
        const b = shape(cx + Math.cos(a) * r, cy + Math.sin(a) * r, u * (0.025 + 0.04 * R()), 0.3, 14);
        fill(c, b, blood());
        fill(h, b, grey(160));
      }
      for (let q = 0; q < 260; q++) {
        const a = R() * TAU, f = R() ** 0.7, r = u * (0.05 + 0.41 * f);
        const s = u * (0.004 + 0.022 * (1 - f) * R() ** 1.5);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (f > 0.3 && R() < 0.6) {
          // tailing away from the centre
          c.save(); c.translate(x, y); c.rotate(a);
          h.save(); h.translate(x, y); h.rotate(a);
          dropTail(0, 0, s * 2, s, s * (0.5 + 2.5 * f), blood(0.95), 150);
          c.restore(); h.restore();
        } else {
          disc(c, x, y, s, blood(0.95));
          disc(h, x, y, s, grey(155));
        }
      }
      const dk = shape(cx, cy, u * 0.045, 0.4, 12);
      fill(c, dk, deep(0.9));
      for (let q = 0; q < 9; q++) {
        const a = R() * TAU, r = u * (0.03 + 0.2 * R());
        const p = shape(cx + Math.cos(a) * r, cy + Math.sin(a) * r, u * (0.007 + 0.012 * R()), 0.5, 6);
        const kind = R();
        fill(c, p, kind < 0.55 ? rgba(132, 58, 52) : kind < 0.88 ? rgba(40, 5, 4) : rgba(214, 204, 184));
        fill(h, p, grey(205));
      }
    });

    // ---- row 6: runs (drips) and smears ----------------------------------------------------------
    for (let k = 0; k < 4; k++) tile(6, k, (cx, cy, u) => {
      const ty = cy - u * 0.36;
      const top = shape(cx, ty, u * (0.05 + 0.025 * R()), 0.3, 18, 1.3, 0.7);
      fill(c, top, blood());
      fill(h, top, grey(165));
      const runs = 2 + (R() * 3) | 0;
      for (let q = 0; q < runs; q++) {
        let x = cx + jit(0, u * 0.08);
        const w = u * (0.006 + 0.007 * R()), len = u * (0.3 + 0.5 * R());
        const end = Math.min(ty + len, cy + u * 0.43);
        c.strokeStyle = blood(); h.strokeStyle = grey(155);
        for (const g of [c, h]) { g.lineCap = 'round'; g.lineWidth = w * 2; }
        c.beginPath(); h.beginPath(); c.moveTo(x, ty); h.moveTo(x, ty);
        for (let y = ty; y < end; y += u * 0.02) { x += jit(0, u * 0.003); c.lineTo(x, y); h.lineTo(x, y); }
        c.stroke(); h.stroke();
        ell(c, x, end, w * 1.3, w * 1.7, 0, blood());
        ell(h, x, end, w * 1.3, w * 1.7, 0, grey(170));
      }
    });
    for (let k = 0; k < 4; k++) tile(6, 4 + k, (cx, cy, u) => {
      // a wiped smear: parallel streaks along x, thinning out
      for (let q = 0; q < 40; q++) {
        const y = cy + jit(0, u * 0.1), x0 = cx - u * 0.38 + R() * u * 0.08, x1 = cx + u * (0.1 + 0.3 * R());
        c.strokeStyle = blood(0.15 + 0.35 * R()); c.lineWidth = u * (0.006 + 0.018 * R());
        c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y + jit(0, u * 0.02)); c.stroke();
      }
      const b = shape(cx - u * 0.3, cy, u * 0.08, 0.3, 14, 0.8, 1.2);
      fill(c, b, blood(0.85));
      fill(h, b, grey(150));
    });

    // ---- row 7: droplet clusters, dried blood ------------------------------------------------------
    for (let k = 0; k < 4; k++) tile(7, k, (cx, cy, u) => {
      const n = 4 + ((R() * 7) | 0);
      for (let q = 0; q < n; q++) {
        const x = cx + jit(0, u * 0.28), y = cy + jit(0, u * 0.28), r = u * (0.02 + 0.06 * R() ** 2);
        const b = shape(x, y, r, 0.15, 12);
        fill(c, b, blood());
        fill(h, b, grey(165));
        for (let s = 0; s < 3; s++) { const a = R() * TAU; disc(c, x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6, r * 0.18 * R(), blood()); }
      }
    });
    for (let k = 0; k < 4; k++) tile(7, 4 + k, (cx, cy, u) => {
      const b = shape(cx, cy, u * (0.22 + 0.08 * R()), 0.35, 24);
      fill(c, b, rgba(56, 14, 10, 0.9));
      fill(h, b, grey(140));
      c.strokeStyle = rgba(34, 8, 6, 0.8); c.lineWidth = u * 0.012; path(c, b); c.stroke();
      specks(c, cx, cy, 0, u * 0.2, 80, u * 0.02, () => rgba(40, 9, 7, 0.4), 1);
    });

    // ---- normal map from the (slightly blurred) height field -------------------------------------
    const blurC = mk(), bg = blurC.getContext('2d');
    bg.filter = `blur(${(T / 200).toFixed(2)}px)`;
    bg.drawImage(hgtC, 0, 0);
    const hd = bg.getImageData(0, 0, S, S).data;
    const nrmC = mk(), ng = nrmC.getContext('2d');
    const out = ng.createImageData(S, S), od = out.data;
    const k = 0.07 * (T / 256);
    for (let y = 0; y < S; y++) {
      const y0 = Math.max(0, y - 1), y1 = Math.min(S - 1, y + 1);
      for (let x = 0; x < S; x++) {
        const x0 = Math.max(0, x - 1), x1 = Math.min(S - 1, x + 1);
        const dx = hd[(y * S + x1) * 4] - hd[(y * S + x0) * 4];
        const dy = hd[(y1 * S + x) * 4] - hd[(y0 * S + x) * 4];
        // tangent-space normal (u right, v up; canvas y runs down)
        let nx = -dx * k, ny = dy * k;
        const il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        nx *= il; ny *= il;
        const o = (y * S + x) * 4;
        od[o] = (nx * 0.5 + 0.5) * 255; od[o + 1] = (ny * 0.5 + 0.5) * 255; od[o + 2] = (il * 0.5 + 0.5) * 255; od[o + 3] = 255;
      }
    }
    ng.putImageData(out, 0, 0);
    const map = new T3.CanvasTexture(colC);
    map.colorSpace = T3.SRGBColorSpace;
    map.anisotropy = 8;
    const normal = new T3.CanvasTexture(nrmC);
    normal.anisotropy = 8;
    return { map, normal };
  }
}
