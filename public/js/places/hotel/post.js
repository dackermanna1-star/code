// How the hotel is drawn: the scene renders into a floating-point target
// (lit only by the hotel's own lamps and your flashlight), the hand holding
// the flashlight goes on top, then one pass tone-maps it like film - with
// grain, a vignette, a little colour fringing that grows when he's close,
// a red flash when something goes wrong, and fades to black.
import * as THREE from 'three';
import { H } from './state.js';

const VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = `
uniform sampler2D tDiffuse; uniform vec2 res; uniform float time, grain, vignette, aberr, exposure, fade, flash, gamma, warp, blur;
uniform vec3 flashCol;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  // dread: the picture breathes and swims a little
  uv += c * warp * (0.012 * sin(time * 1.7) + 0.008 * sin(time * 2.9 + uv.y * 6.0));
  c = uv - 0.5;
  float r2 = dot(c, c);
  float ab = aberr * (0.25 + r2 * 3.0);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + c * ab).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - c * ab).b;
  if (blur > 0.0) {
    vec3 s = vec3(0.0);
    for (int i = 0; i < 6; i++) { float a = float(i) * 1.0472; s += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * blur / res).rgb; }
    col = mix(col, s / 6.0, 0.7);
  }
  col *= exposure;
  col *= mix(1.0, smoothstep(0.75, 0.05, r2 * 1.6), vignette);
  col += flashCol * flash;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float n = hash(uv * res + fract(time * 13.37) * 100.0) - 0.5;
  gl_FragColor.rgb += n * grain * (0.6 + 0.4 * (1.0 - gl_FragColor.g));
  gl_FragColor.rgb = pow(max(gl_FragColor.rgb, 0.0), vec3(gamma));
  gl_FragColor.rgb *= 1.0 - fade;
}`;

export class Post {
  constructor(world) {
    this.world = world;
    const r = world.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = true;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false,
      uniforms: {
        tDiffuse: { value: this.rt.texture }, res: { value: size.clone() }, time: { value: 0 }, grain: { value: 0.045 }, vignette: { value: 0.75 },
        aberr: { value: 0.002 }, exposure: { value: 1 }, fade: { value: 1 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(0.6, 0, 0) },
        gamma: { value: 1 }, warp: { value: 0 }, blur: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2)), this.mat);
    this.quad.frustumCulled = false;
    this.screen = new THREE.Scene(); this.screen.add(this.quad);
    this.screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // the hand and flashlight are drawn last, over everything (they'd poke into walls otherwise)
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.vmScene.add(this.vmCam);
    this.flash = 0; this.shake = 0; this.t = 0;
    this.fade = 1; this.fadeTo = 1; this.fadeSpeed = 1;
    this.brightness = 1;
    // replace the world's render
    world.render = () => this.render();
  }
  resize() {
    const size = this.world.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt.setSize(Math.max(2, size.x), Math.max(2, size.y));
    this.mat.uniforms.res.value.copy(size);
    H.lights?.setScale(size.y);
  }
  fadeIn(s = 1) { this.fadeTo = 0; this.fadeSpeed = 1 / Math.max(0.01, s); }
  fadeOut(s = 1) { this.fadeTo = 1; this.fadeSpeed = 1 / Math.max(0.01, s); }
  hit(amount = 1, color = 0x990000) { this.flash = Math.max(this.flash, amount); this.mat.uniforms.flashCol.value.set(color); }
  update(dt, o = {}) {
    this.t += dt;
    const u = this.mat.uniforms;
    if (this.fade !== this.fadeTo) this.fade += Math.sign(this.fadeTo - this.fade) * Math.min(Math.abs(this.fadeTo - this.fade), dt * this.fadeSpeed);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    const fear = o.fear || 0;
    u.time.value = this.t;
    u.fade.value = this.fade;
    u.flash.value = this.flash * 0.6;
    u.aberr.value = 0.0015 + fear * 0.009 + this.flash * 0.01;
    u.vignette.value = 0.72 + fear * 0.25;
    u.warp.value = fear * 1.2 + (o.breath || 0) * 0.8;
    u.grain.value = 0.04 + fear * 0.05;
    u.blur.value = o.blur || 0;
    u.gamma.value = 1 / this.brightness;
    u.exposure.value = (o.exposure ?? 1) * 1.9 * (0.75 + this.brightness * 0.25);
  }
  render() {
    const r = this.world.renderer, w = this.world;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(w.scene, w.camera);
    this.info = { calls: r.info.render.calls, tris: r.info.render.triangles };
    if (this.vmScene.children.length > 1 && this.vmVisible !== false) {
      this.vmCam.aspect = w.camera.aspect; this.vmCam.fov = w.camera.fov; this.vmCam.updateProjectionMatrix();
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
