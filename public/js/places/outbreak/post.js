// How the Outbreak is drawn: the world renders into a floating-point target
// (with smoothed edges), the held weapon goes on top in its own pass, and a
// final pass tone-maps it like film with a slightly cold, washed-out grade.
// The same pass shows how you're doing: the colour drains when you've lost
// blood, the edges darken and blur when you're about to pass out, a red flash
// when you're hit, a white one for a flashbang of pain.
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = `
uniform sampler2D tDiffuse; uniform vec2 res;
uniform float time, exposure, vignette, desat, blur, flash, fade, grain, gamma, scope, chroma, sharpen;
uniform vec3 flashCol, tint;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main() {
  vec2 uv = vUv, c = uv - 0.5;
  float r2 = dot(c * vec2(res.x / res.y, 1.0), c * vec2(res.x / res.y, 1.0));
  vec3 col;
  float ab = chroma * (0.2 + r2 * 2.0);
  col.r = texture2D(tDiffuse, uv + c * ab).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - c * ab).b;
  if (sharpen > 0.0) {
    vec2 px = 1.0 / res;
    vec3 n4 = texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb;
    col = max(col + (col * 4.0 - n4) * sharpen * 0.25, 0.0);
  }
  if (blur > 0.0) {
    vec3 s = vec3(0.0);
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; s += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * blur * (0.5 + r2) / res * 6.0).rgb; }
    col = mix(col, s / 8.0, clamp(blur, 0.0, 1.0) * smoothstep(0.0, 0.25, r2 + 0.05));
  }
  col *= exposure;
  // the grade: a little cold in the shadows, warm in the light, a touch less colour
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 0.9 - desat * 0.9);
  col *= tint;
  col = mix(col * vec3(0.94, 0.98, 1.06), col * vec3(1.04, 1.0, 0.95), smoothstep(0.05, 0.6, l));
  col *= mix(1.0, smoothstep(0.85, 0.08, r2), vignette);
  col += flashCol * flash;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash(uv * res + fract(time * 7.13) * 91.0) - 0.5) * grain;
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, 0.0), vec3(gamma));
  // a scope: everything outside the circle is black
  if (scope > 0.0) {
    vec2 sc = c * vec2(res.x / res.y, 1.0); float d = length(sc);
    // the reticle: fine crosshairs, heavy posts from the edge, a gap in the middle
    float px1 = 1.0 / res.y;
    float thin = max(step(abs(sc.y), px1) * step(abs(sc.x), 0.43), step(abs(sc.x), px1) * step(abs(sc.y), 0.43)) * step(0.006, d);
    float post = max(step(abs(sc.y), px1 * 3.0) * step(0.14, abs(sc.x)), step(abs(sc.x), px1 * 3.0) * step(0.14, abs(sc.y)));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.01), clamp(thin + post, 0.0, 1.0) * step(d, 0.43) * scope);
    gl_FragColor.rgb *= mix(1.0, smoothstep(0.43, 0.41, d), scope);
  }
  gl_FragColor.rgb *= 1.0 - fade;
}`;

export class Post {
  constructor(world) {
    this.world = world;
    const r = world.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.samples = 4;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), { type: THREE.HalfFloatType, samples: this.samples, depthBuffer: true });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.rt.texture }, res: { value: size.clone() }, time: { value: 0 }, exposure: { value: 1 }, vignette: { value: 0.45 },
        desat: { value: 0 }, blur: { value: 0 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(0.7, 0, 0) }, fade: { value: 1 }, grain: { value: 0.018 },
        gamma: { value: 1 }, scope: { value: 0 }, chroma: { value: 0.0006 }, sharpen: { value: 0.25 }, tint: { value: new THREE.Color(1, 1, 1) },
      },
    });
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g, this.mat); this.quad.frustumCulled = false;
    this.screen = new THREE.Scene(); this.screen.add(this.quad);
    this.screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // the weapon in your hands: its own scene, drawn last
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
    this.vmScene.add(this.vmCam);
    this.vmVisible = true;
    this.flash = 0; this.t = 0;
    this.fade = 1; this.fadeTo = 1; this.fadeSpeed = 1;
    this.brightness = 1;
    this.overlays = [];
    world.render = () => this.render();
  }
  setSamples(n) {
    if (this.samples === n) return;
    this.samples = n;
    const size = this.world.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.dispose();
    this.rt = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), { type: THREE.HalfFloatType, samples: n, depthBuffer: true });
    this.mat.uniforms.tDiffuse.value = this.rt.texture;
  }
  resize() {
    const size = this.world.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(Math.max(2, size.x), Math.max(2, size.y));
    this.mat.uniforms.res.value.copy(size);
  }
  fadeIn(s = 1) { this.fadeTo = 0; this.fadeSpeed = 1 / Math.max(0.01, s); }
  fadeOut(s = 1) { this.fadeTo = 1; this.fadeSpeed = 1 / Math.max(0.01, s); }
  hit(amount = 1, color = 0x990000) { this.flash = Math.max(this.flash, amount); this.mat.uniforms.flashCol.value.set(color); }
  update(dt, o = {}) {
    this.t += dt;
    const u = this.mat.uniforms;
    if (this.fade !== this.fadeTo) this.fade += Math.sign(this.fadeTo - this.fade) * Math.min(Math.abs(this.fadeTo - this.fade), dt * this.fadeSpeed);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    u.time.value = this.t;
    u.fade.value = this.fade;
    u.flash.value = this.flash * 0.5;
    u.desat.value = o.desat || 0;
    u.blur.value = o.blur || 0;
    u.vignette.value = 0.42 + (o.vignette || 0);
    u.scope.value = o.scope || 0;
    u.exposure.value = (o.exposure ?? 1) * (0.8 + this.brightness * 0.2);
    u.gamma.value = 1 / (0.85 + this.brightness * 0.15);
    u.chroma.value = 0.0006 + (o.chroma || 0);
    if (o.tint) u.tint.value.copy(o.tint); else u.tint.value.setRGB(1, 1, 1);
  }
  render() {
    const r = this.world.renderer, w = this.world;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(w.scene, w.camera);
    this.info = { calls: r.info.render.calls, tris: r.info.render.triangles };
    for (const fn of this.overlays) fn(r);
    if (this.vmVisible && this.vmScene.children.length > 1) {
      this.vmCam.aspect = w.camera.aspect; this.vmCam.updateProjectionMatrix();
      const ac = r.autoClear;
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vmScene, this.vmCam);
      r.autoClear = ac;
    }
    r.setRenderTarget(null);
    r.render(this.screen, this.screenCam);
  }
}
