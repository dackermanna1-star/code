// Bodycam post-processing: the scene renders into an HDR multisampled target, then one pass adds
// bloom from the fluorescent panels, barrel distortion, chromatic fringing, vignette, grain,
// a light grade and the hurt / suppression treatments, and blood on the lens.
const LENS_DROPS = 12;
class BodycamPost {
  constructor(game) {
    this.game = game;
    this.enabled = true;
    const r = game.renderer;
    this.size = new T3.Vector2();
    r.getDrawingBufferSize(this.size);
    const mk = (w, h, samples = 0) => {
      const t = new T3.WebGLRenderTarget(w, h, { type: T3.HalfFloatType, depthBuffer: true });
      t.samples = samples;
      t.texture.minFilter = t.texture.magFilter = T3.LinearFilter;
      return t;
    };
    this.rt = mk(this.size.x, this.size.y, game.settings.quality === 'low' ? 0 : 4);
    this.bA = mk(this.size.x >> 2, this.size.y >> 2);
    this.bB = mk(this.size.x >> 2, this.size.y >> 2);
    this.cam = new T3.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new T3.Mesh(new T3.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new T3.Scene();
    this.scene.add(this.quad);
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.bright = new T3.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThresh: { value: 1.1 } },
      vertexShader: vs,
      fragmentShader: `uniform sampler2D tSrc; uniform float uThresh; varying vec2 vUv;
        void main(){ vec2 px = vec2(dFdx(vUv.x), dFdy(vUv.y));
          vec3 c = vec3(0.0);
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c += texture2D(tSrc, vUv + vec2(float(i), float(j)) * px * 1.5).rgb;
          c /= 9.0; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor = vec4(c * smoothstep(uThresh, uThresh * 2.2, l), 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.blur = new T3.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new T3.Vector2() } },
      vertexShader: vs,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
          c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
          c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.final = new T3.ShaderMaterial({
      uniforms: {
        tSrc: { value: null }, tBloom: { value: null }, uTime: { value: 0 }, uRes: { value: new T3.Vector2() },
        uLens: { value: 1 }, uHurt: { value: 0 }, uSup: { value: 0 }, uFlash: { value: 0 }, uDead: { value: 0 }, uExposure: { value: 1 },
        uDropA: { value: Array.from({ length: LENS_DROPS }, () => new T3.Vector4()) }, uDropB: { value: Array.from({ length: LENS_DROPS }, () => new T3.Vector4()) }, uDropN: { value: 0 },
      },
      vertexShader: vs,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform sampler2D tBloom; uniform float uTime; uniform vec2 uRes;
        uniform float uLens; uniform float uHurt; uniform float uSup; uniform float uFlash; uniform float uDead; uniform float uExposure;
        uniform vec4 uDropA[${LENS_DROPS}]; // blood on the lens: x, y (uv), radius (screen heights), opacity
        uniform vec4 uDropB[${LENS_DROPS}]; // seed, length of the trail it left running down, thickness
        uniform int uDropN;
        varying vec2 vUv;
        float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        vec2 barrel(vec2 uv, float k) { vec2 c = uv * 2.0 - 1.0; float r2 = dot(c, c); c *= 1.0 + k * r2 + k * 0.35 * r2 * r2; return c * 0.5 + 0.5; }
        void main() {
          float k = 0.085 * uLens;
          vec2 uv = barrel(vUv, k);
          // zoom in so the distorted edges stay on screen
          uv = (uv - 0.5) / (1.0 + k * 1.15) + 0.5;
          vec2 c = uv - 0.5;
          float edge = dot(c, c);
          float ca = (0.0018 + 0.006 * edge) * uLens + uHurt * 0.004 + uSup * 0.003;
          // blood on the lens: out-of-focus drops that bend the picture behind them, and the trails
          // of the bigger ones running down the glass
          vec2 lensOff = vec2(0.0); float bm = 0.0, bth = 0.0, bhi = 0.0;
          float asp = uRes.x / max(uRes.y, 1.0);
          for (int i = 0; i < ${LENS_DROPS}; i++) {
            if (i >= uDropN) break;
            vec4 A = uDropA[i]; vec4 B = uDropB[i];
            vec2 q = (vUv - A.xy) * vec2(asp, 1.0);
            float r = A.z;
            // splashes are smeared along a direction of their own
            float sa = B.w * 6.2832, cs = cos(sa), sn = sin(sa);
            vec2 qe = vec2(cs * q.x + sn * q.y, -sn * q.x + cs * q.y);
            qe.x /= 1.0 + 0.9 * fract(B.x * 7.0);
            if (q.y > r * 1.6 + B.y || q.y < -r * 1.6 || abs(q.x) > r * 1.6) continue;
            float ang = atan(qe.y, qe.x);
            float rr = r * (1.0 + 0.1 * sin(ang * 2.0 + B.x * 20.0) + 0.06 * sin(ang * 5.0 + B.x * 9.0));
            float d = length(qe);
            // out of focus this close to the lens: soft edges
            float m = 1.0 - smoothstep(rr * 0.35, rr * 1.15, d);
            // the trail above a drop that has slid down
            if (B.y > 0.0 && q.y > 0.0) {
              float w = r * (0.5 - 0.25 * clamp(q.y / max(B.y, 1e-4), 0.0, 1.0));
              float tr = (1.0 - smoothstep(w * 0.4, w, abs(q.x + 0.006 * sin(q.y * 60.0 + B.x * 10.0)))) * (1.0 - smoothstep(B.y * 0.85, B.y + r * 0.2, q.y));
              m = max(m, tr * 0.55);
            }
            m *= A.w;
            lensOff -= q * m * 0.12;
            bm = max(bm, m);
            bth = max(bth, m * B.z);
            bhi = max(bhi, m * (1.0 - smoothstep(0.0, rr * 0.35, length(q - vec2(-0.3, 0.35) * rr))));
          }
          if (bm > 0.0) uv += lensOff;
          vec3 col;
          col.r = texture2D(tSrc, uv + c * ca).r;
          col.g = texture2D(tSrc, uv).g;
          col.b = texture2D(tSrc, uv - c * ca).b;
          if (bm > 0.002) {
            // smeared, out-of-focus picture through the blood
            vec2 px = vec2(0.009, 0.009 * asp);
            vec3 bl = (texture2D(tSrc, uv + px).rgb + texture2D(tSrc, uv - px).rgb + texture2D(tSrc, uv + vec2(px.x, -px.y)).rgb + texture2D(tSrc, uv + vec2(-px.x, px.y)).rgb
              + texture2D(tSrc, uv + vec2(px.x * 1.6, 0.0)).rgb + texture2D(tSrc, uv - vec2(px.x * 1.6, 0.0)).rgb + texture2D(tSrc, uv + vec2(0.0, px.y * 1.6)).rgb + texture2D(tSrc, uv - vec2(0.0, px.y * 1.6)).rgb) * 0.125;
            col = mix(col, bl, min(1.0, bm * 1.6));
            // thin smears tint the picture, thick drops all but block it
            vec3 tint = mix(vec3(0.7, 0.13, 0.1), vec3(0.22, 0.012, 0.008), bth);
            col = mix(col, col * tint + vec3(0.01, 0.0, 0.0), bm * 0.9);
            col += vec3(0.45, 0.3, 0.28) * bhi * 0.1;
          }
          col += texture2D(tBloom, uv).rgb * 0.55;
          col *= uExposure;
          // grade: lift the blacks a touch, cool the shadows, warm the highlights
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(col, col * vec3(0.92, 0.98, 1.06), smoothstep(0.4, 0.0, l) * 0.35 * uLens);
          col = mix(vec3(l), col, 1.0 - 0.6 * uHurt - 0.9 * uDead);
          // vignette, heavier when suppressed
          float vig = smoothstep(0.85, 0.18, length(c * vec2(1.0, 0.82)) * (1.0 + uSup * 0.6));
          col *= mix(1.0, vig, 0.55 * uLens + 0.3 * uSup);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          // sensor noise and a faint rolling band, after tone mapping like a real camera
          float n = h12(gl_FragCoord.xy + fract(uTime * 7.31) * 913.0) - 0.5;
          gl_FragColor.rgb += n * (0.035 + 0.05 * uHurt) * uLens;
          gl_FragColor.rgb *= 1.0 - 0.025 * uLens * smoothstep(0.0, 1.0, sin(vUv.y * 3.0 - uTime * 0.7) * 0.5 + 0.5);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), uFlash);
          gl_FragColor.rgb *= 1.0 - uDead * 0.35;
        }`,
      depthTest: false, depthWrite: false,
    });
    this.time = 0;
    this.drops = Array.from({ length: LENS_DROPS }, () => ({ on: false, x: 0, y: 0, r: 0, a: 0, age: 0, hold: 0, seed: 0, run: 0, vy: 0, th: 0, dir: 0 }));
  }

  // blood on the bodycam lens (amount 0..1): a cluster of drops, the big ones run down and all fade
  lensBlood(amount = 0.5) {
    if (!this.game.settings.gore) return;
    amount = clamp(amount, 0, 1);
    // a few drops round one spot, most of them small
    const n = 1 + Math.round(amount * 4 * (0.4 + Math.random()));
    const cx = 0.25 + 0.5 * Math.random(), cy = 0.3 + 0.45 * Math.random();
    for (let k = 0; k < n; k++) {
      // reuse a free slot, else the faintest
      let d = this.drops.find((q) => !q.on);
      if (!d) d = this.drops.reduce((m, q) => (q.a < m.a ? q : m), this.drops[0]);
      const big = k === 0 ? amount > 0.35 : Math.random() < 0.15 + amount * 0.15;
      d.on = true;
      d.x = clamp(cx + (Math.random() - 0.5) * 0.36, 0.04, 0.96);
      d.y = clamp(cy + (Math.random() - 0.5) * 0.3, 0.06, 0.95);
      d.r = big ? (0.022 + 0.03 * amount) * (0.8 + 0.4 * Math.random()) : 0.005 + 0.012 * Math.random();
      d.a = clamp(0.45 + 0.4 * amount, 0, 0.9) * (0.75 + 0.25 * Math.random());
      d.age = 0;
      d.hold = 2 + 2.5 * Math.random() + amount * 2;
      d.seed = Math.random();
      d.run = 0;
      d.vy = big ? 0.008 + 0.016 * Math.random() : 0;
      d.th = big ? 0.55 + 0.4 * Math.random() : Math.random() * 0.4;
      d.dir = Math.random();
    }
  }

  updateDrops(dt) {
    const u = this.final.uniforms, A = u.uDropA.value, B = u.uDropB.value;
    let n = 0;
    const gore = this.game.settings.gore;
    for (const d of this.drops) {
      if (!d.on) continue;
      d.age += dt;
      if (d.age > d.hold) d.a -= dt * 0.35;
      if (d.vy > 0 && d.age > 0.3) { const s = d.vy * dt * Math.max(0, 1 - d.age / 6); d.y -= s; d.run += s; }
      if (d.a <= 0 || d.y < -0.1 || !gore) { d.on = false; continue; }
      A[n].set(d.x, d.y, d.r, Math.min(1, d.a));
      B[n].set(d.seed, d.run, d.th, d.dir);
      n++;
    }
    u.uDropN.value = n;
  }

  resize(w, h) {
    const r = this.game.renderer;
    r.getDrawingBufferSize(this.size);
    // the quality setting picks the MSAA level; three rebuilds the buffers after a dispose
    const samples = this.game.settings.quality === 'low' ? 0 : 4;
    if (this.rt.samples !== samples) { this.rt.samples = samples; this.rt.dispose(); }
    this.rt.setSize(this.size.x, this.size.y);
    this.bA.setSize(this.size.x >> 2, this.size.y >> 2);
    this.bB.setSize(this.size.x >> 2, this.size.y >> 2);
    void w; void h;
  }

  begin(r) {
    r.getDrawingBufferSize(this.size);
    if (this.rt.width !== this.size.x || this.rt.height !== this.size.y) this.resize();
    r.setRenderTarget(this.rt);
  }

  pass(r, mat, target) {
    this.quad.material = mat;
    r.setRenderTarget(target);
    r.render(this.scene, this.cam);
  }

  end(r, dt) {
    const g = this.game;
    this.time += dt;
    this.bright.uniforms.tSrc.value = this.rt.texture;
    this.pass(r, this.bright, this.bA);
    this.blur.uniforms.tSrc.value = this.bA.texture;
    this.blur.uniforms.uDir.value.set(1 / this.bA.width, 0);
    this.pass(r, this.blur, this.bB);
    this.blur.uniforms.tSrc.value = this.bB.texture;
    this.blur.uniforms.uDir.value.set(0, 1 / this.bA.height);
    this.pass(r, this.blur, this.bA);
    const u = this.final.uniforms, P = g.player;
    u.tSrc.value = this.rt.texture;
    u.tBloom.value = this.bA.texture;
    u.uTime.value = this.time;
    u.uLens.value = g.settings.bodycam;
    u.uHurt.value = clamp(1 - P.health / 40, 0, 1) * (P.alive ? 1 : 0);
    u.uSup.value = g.suppression || 0;
    u.uFlash.value = clamp((g.flashbang || 0) * 1.2, 0, 1);
    u.uDead.value = damp(u.uDead.value, P.alive ? 0 : 1, 1.5, dt);
    u.uRes.value.set(this.size.x, this.size.y);
    this.updateDrops(dt);
    this.pass(r, this.final, null);
  }
}
