// Bodycam post-processing: the scene renders into an HDR multisampled target, then one pass adds
// bloom from the fluorescent panels, barrel distortion, chromatic fringing, vignette, grain,
// a light grade and the hurt / suppression treatments.
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
      },
      vertexShader: vs,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform sampler2D tBloom; uniform float uTime; uniform vec2 uRes;
        uniform float uLens; uniform float uHurt; uniform float uSup; uniform float uFlash; uniform float uDead; uniform float uExposure;
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
          vec3 col;
          col.r = texture2D(tSrc, uv + c * ca).r;
          col.g = texture2D(tSrc, uv).g;
          col.b = texture2D(tSrc, uv - c * ca).b;
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
  }

  resize(w, h) {
    const r = this.game.renderer;
    r.getDrawingBufferSize(this.size);
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
    this.pass(r, this.final, null);
  }
}
