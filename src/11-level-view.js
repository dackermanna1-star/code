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
    const steelColumns = L.theme.style === 4 || L.theme.style === 6; // the warehouse and the hotel build their own columns
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
      fragmentHead: NOISE_GLSL + HOTEL_GLSL.head, // the hotel's helpers (src/14-hotel.js)
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
          } else if (uStyle == 6) {
            // the hotel: walnut wainscot, damask or striped paper (src/14-hotel.js)
            ${HOTEL_GLSL.wall}
          } else {
            // office drywall with a chair rail
            col = uWallCol * (0.9 + 0.12 * grime) * (0.97 + 0.03 * fine);
            float rail = smoothstep(0.02, 0.0, abs(P.y - 0.92) - 0.035);
            col = mix(col, uTrim * 1.3, rail);
          }
          col *= mix(0.62, 1.0, smoothstep(0.0, 0.35, P.y)) * mix(0.7, 1.0, smoothstep(0.0, 0.3, uGrid.w - P.y));
          // baseboard
          float base = uStyle == 4 || uStyle == 6 ? 0.0 : step(P.y, 0.1);
          col = mix(col, uTrim * (0.85 + 0.2 * fine), base);
          diffuseColor.rgb *= col;
        }`,
      roughness: 'roughnessFactor = uStyle == 6 ? hotelRough : uStyle == 1 ? 0.92 : uStyle == 2 ? 0.75 : uStyle == 4 ? (vLatP.y > 4.4 ? 0.55 : 0.8) : 0.88;',
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
      fragmentHead: NOISE_GLSL + HOTEL_GLSL.head + `
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
          } else if (uStyle == 6) {
            // the hotel: patterned carpets, marble, parquet (src/14-hotel.js)
            ${HOTEL_GLSL.floor}
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
      roughness: 'roughnessFactor = mix(uStyle == 6 ? hotelRough : uStyle == 1 ? 0.88 : uStyle == 4 ? 0.62 + 0.2 * brN(vLatP.xz * 0.9) : 0.97, 0.12, clamp(floorWet, 0.0, 1.0));',
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
      fragmentHead: NOISE_GLSL + HOTEL_GLSL.head + 'uniform vec3 uCeil; float panelGlow = 0.0;',
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
          } else if (uStyle == 6) {
            // the hotel: plaster, coffers over the lobby and ballroom (src/14-hotel.js)
            ${HOTEL_GLSL.ceiling}
          } else {
            col *= 0.6 + 0.4 * brF(xz * 1.2);
          }
          // the troffer: a 0.6 x 1.2 m diffuser panel with a metal frame (the warehouse and the
          // hotel hang their own lamps instead)
          vec2 pd = abs(local) - vec2(0.3, 0.6) + (uStyle == 4 || uStyle == 6 ? 9.0 : 0.0);
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
    if (L.theme.style === 6) {
      this.dressing = new HotelDressing(this); // src/14-hotel.js
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

// bullet holes and blood on walls / props: one instanced quad mesh with a procedural atlas
class WallDecals {
  constructor(scene, max = 800) {
    this.max = max;
    this.next = 0;
    const atlas = WallDecals.atlas();
    const geo = new T3.PlaneGeometry(1, 1);
    const uvOff = new Float32Array(max * 2);
    geo.setAttribute('aTile', new T3.InstancedBufferAttribute(uvOff, 2));
    const mat = new T3.MeshStandardMaterial({ map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.6 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aTile;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * 0.25 + aTile;\n#endif');
    };
    this.mesh = new T3.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(T3.DynamicDrawUsage);
    this.tiles = geo.attributes.aTile;
    scene.add(this.mesh);
    this._m = new T3.Matrix4();
    this._q = new T3.Quaternion();
  }
  static atlas() {
    return Lab.cached('br:walldecal-atlas', () => {
      const S = 512, c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      const T = S / 4;
      // row 0: bullet holes in drywall/concrete
      for (let k = 0; k < 4; k++) {
        const cx = k * T + T / 2, cy = T / 2;
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, T * 0.42);
        grd.addColorStop(0, 'rgba(10,8,6,1)'); grd.addColorStop(0.12, 'rgba(20,16,12,1)'); grd.addColorStop(0.2, 'rgba(70,60,48,0.9)');
        grd.addColorStop(0.45, 'rgba(120,110,90,0.35)'); grd.addColorStop(1, 'rgba(120,110,90,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, T * 0.42, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(30,25,20,0.6)'; g.lineWidth = 1.2;
        for (let r = 0; r < 6; r++) { const a = Math.random() * TAU, l = T * (0.12 + Math.random() * 0.22); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke(); }
      }
      // rows 1-3: blood splatters (directional, with satellite drops)
      for (let k = 0; k < 12; k++) {
        const col = k % 4, row = 1 + ((k / 4) | 0);
        const cx = col * T + T / 2, cy = row * T + T / 2;
        g.save(); g.translate(cx, cy);
        const base = row === 3 ? 'rgba(60,4,4,' : 'rgba(110,8,8,';
        for (let s = 0; s < 26; s++) {
          const a = (Math.random() - 0.5) * (row === 1 ? 1.4 : 6), r = Math.random() ** 1.5 * T * 0.4, rad = (1 - r / (T * 0.45)) * T * (0.03 + Math.random() * 0.07);
          g.fillStyle = base + (0.6 + Math.random() * 0.4) + ')';
          g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r, rad * 1.6, rad, a, 0, TAU); g.fill();
        }
        g.fillStyle = base + '0.95)'; g.beginPath(); g.arc(0, 0, T * 0.09, 0, TAU); g.fill();
        if (row === 2) for (let s = 0; s < 4; s++) { const x = (Math.random() - 0.5) * T * 0.3; g.fillRect(x, 0, 2 + Math.random() * 3, T * (0.2 + Math.random() * 0.25)); }
        g.restore();
      }
      const tex = new T3.CanvasTexture(c);
      tex.colorSpace = T3.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    });
  }
  // kind: 'hole' | 'blood' | 'drip' | 'dark'; point and normal in world space
  add(kind, point, normal, size = 0.06) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    const n = new T3.Vector3(normal.x, normal.y, normal.z).normalize();
    this._q.setFromUnitVectors(new T3.Vector3(0, 0, 1), n);
    const spin = new T3.Quaternion().setFromAxisAngle(new T3.Vector3(0, 0, 1), kind === 'drip' ? 0 : Math.random() * TAU);
    this._q.multiply(spin);
    const p = new T3.Vector3(point.x, point.y, point.z).addScaledVector(n, 0.004);
    this._m.compose(p, this._q, new T3.Vector3(size, size, size));
    this.mesh.setMatrixAt(i, this._m);
    const tile = kind === 'hole' ? [Math.floor(Math.random() * 4), 0] : kind === 'drip' ? [Math.floor(Math.random() * 4), 2] : kind === 'dark' ? [Math.floor(Math.random() * 4), 3] : [Math.floor(Math.random() * 4), 1];
    // texture rows are flipped (canvas y down, uv y up)
    this.tiles.setXY(i, tile[0] * 0.25, (3 - tile[1]) * 0.25);
    this.tiles.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.mesh.count = 0; this.next = 0; }
}
