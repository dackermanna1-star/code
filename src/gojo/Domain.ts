import * as THREE from 'three';
import { G } from '../core/G';
import { clamp } from '../core/math';
import { Streaks } from './GojoFX';

const VOID_GLSL = /* glsl */ `
uniform vec3 uV; uniform float uTime;
float vh3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn3(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vh3(i), vh3(i + vec3(1,0,0)), f.x), mix(vh3(i + vec3(0,1,0)), vh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(vh3(i + vec3(0,0,1)), vh3(i + vec3(1,0,1)), f.x), mix(vh3(i + vec3(0,1,1)), vh3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float vfbm(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn3(p); p = p * 2.07 + vec3(3.1, 1.7, 5.3); a *= 0.5; } return s; }
// the infinite void: deep space, nebula, stars, light streaming into the singularity
vec3 voidSky(vec3 d){
  float cv = clamp(dot(d, uV), -1.0, 1.0);
  float th = acos(cv);
  vec3 ax = normalize(cross(uV, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
  vec3 ay = cross(ax, uV);
  float phi = atan(dot(d, ay), dot(d, ax));
  vec3 col = vec3(0.002, 0.004, 0.014);
  // nebula swirling around the singularity
  float sw = phi + th * 1.6 - uTime * 0.04;
  float neb = vfbm(vec3(cos(sw) * 1.4 + th * 1.2, sin(sw) * 1.4, th * 2.2 + uTime * 0.02));
  col += vec3(0.02, 0.06, 0.2) * smoothstep(0.42, 0.95, neb) * 1.6;
  col += vec3(0.1, 0.02, 0.16) * smoothstep(0.62, 1.0, neb) * 1.2;
  col += vec3(0.15, 0.3, 0.6) * pow(smoothstep(0.7, 1.05, neb), 3.0);
  // stars
  vec3 sd = d * 150.0;
  vec3 cell = floor(sd);
  float h = vh3(cell);
  float star = step(0.982, h) * smoothstep(0.45, 0.0, length(fract(sd) - 0.5));
  col += mix(vec3(0.7, 0.85, 1.2), vec3(1.1, 0.9, 1.2), vh3(cell + 7.0)) * star * (0.55 + 0.45 * sin(uTime * 2.5 + h * 60.0)) * 1.4;
  // streams of light rushing into the centre
  float lanes = 110.0;
  float u = (phi / 6.2831853 + 0.5) * lanes;
  float lane = floor(u);
  float lh = vh3(vec3(lane, 1.7, 3.1));
  float lw = abs(fract(u) - 0.5);
  float flow = fract(log(th + 0.03) * 1.6 + uTime * (0.3 + lh * 0.7) + lh * 9.0);
  float dash = smoothstep(0.0, 0.06, flow) * smoothstep(0.5, 0.1, flow);
  float stream = step(0.5, lh) * smoothstep(0.16, 0.0, lw) * dash * smoothstep(0.03, 0.3, th);
  col += mix(vec3(0.25, 0.55, 1.4), vec3(1.0, 1.05, 1.4), lh) * stream * 1.5;
  // horizon glow where the mirror floor meets infinity
  col += vec3(0.18, 0.36, 0.85) * exp(-abs(d.y) * 26.0) * 0.55;
  // event horizon, photon ring, halo and glare
  float hole = smoothstep(0.058, 0.072, th);
  col *= hole;
  float ring = exp(-pow((th - 0.074) / 0.011, 2.0));
  col += vec3(1.7, 1.9, 2.3) * ring * 3.5;
  col += vec3(0.3, 0.55, 1.2) * exp(-th * 6.0) * 1.1 * hole;
  col += vec3(0.9, 0.95, 1.1) * (pow(abs(cos(phi)), 90.0) + pow(abs(sin(phi)), 90.0)) * exp(-th * 3.5) * 0.9 * hole;
  return col;
}`;

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const DOME_FRAG = /* glsl */ `
${VOID_GLSL}
varying vec3 vDir;
void main(){ gl_FragColor = vec4(voidSky(normalize(vDir)), 1.0); }`;

const WORLD_VERT = /* glsl */ `
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FLOOR_FRAG = /* glsl */ `
${VOID_GLSL}
uniform vec3 uCam; uniform vec3 uCenter; uniform float uR; uniform float uEdge;
varying vec3 vWorld;
void main(){
  vec2 rel = vWorld.xz - uCenter.xz;
  float dc = length(rel);
  if (dc > uR) discard;
  vec3 d = normalize(vWorld - uCam);
  // the floor is a still black mirror; ripples roll out from the caster
  float rip = sin(dc * 2.2 - uTime * 2.4) * exp(-dc * 0.035) * 0.012;
  vec3 r = normalize(vec3(d.x + rel.x * rip * 0.02, abs(d.y), d.z + rel.y * rip * 0.02));
  float fres = 0.35 + 0.65 * pow(1.0 - abs(d.y), 3.0);
  vec3 col = voidSky(r) * 0.42 * fres;
  col += vec3(0.05, 0.1, 0.22) * (0.5 + 0.5 * sin(dc * 2.2 - uTime * 2.4)) * exp(-dc * 0.08) * 0.35;
  // faint lattice, the only sign of a floor at all
  vec2 g = abs(fract(vWorld.xz * 0.25) - 0.5);
  col += vec3(0.05, 0.1, 0.2) * smoothstep(0.485, 0.5, max(g.x, g.y)) * exp(-length(vWorld - uCam) * 0.05);
  // leading edge while the domain spreads
  float e = exp(-pow((uR - dc) / 0.7, 2.0)) * uEdge;
  col += vec3(1.2, 1.6, 2.4) * e * 3.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const BUBBLE_FRAG = /* glsl */ `
${VOID_GLSL}
uniform vec3 uCam; uniform float uA;
varying vec3 vWorld;
void main(){
  vec3 d = normalize(vWorld - uCam);
  vec3 col = voidSky(d);
  // bright seam where the barrier meets the ground
  col += vec3(1.0, 1.4, 2.2) * exp(-abs(vWorld.y) * 3.0) * 1.5;
  gl_FragColor = vec4(col, uA);
}`;

type Phase = 'off' | 'sign' | 'expand' | 'inside' | 'collapse';

/**
 * Domain Expansion: Infinite Void. A barrier spreads from Gojo; inside it the
 * world is replaced by the void and every trapped zombie is overloaded with
 * infinite information: paralysed and slowly breaking down.
 */
export class Domain {
  phase: Phase = 'off';
  t = 0;
  readonly R = 55;
  readonly center = new THREE.Vector3();
  readonly V = new THREE.Vector3(0, 0, 1);
  private dome: THREE.Mesh;
  private floor: THREE.Mesh;
  private bubble: THREE.Mesh;
  private uniforms = { uV: { value: new THREE.Vector3(0, 0, 1) }, uTime: { value: 0 } };
  private floorMat: THREE.ShaderMaterial;
  private bubbleMat: THREE.ShaderMaterial;
  private streaks: Streaks;
  private dotT = 0;
  readonly duration = 12;
  /** Called on phase changes (HUD callouts). */
  onPhase: ((p: Phase) => void) | null = null;

  constructor(scene: THREE.Scene) {
    const domeMat = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -999;
    this.dome.visible = false;
    scene.add(this.dome);

    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: { ...this.uniforms, uCam: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector3() }, uR: { value: 0 }, uEdge: { value: 1 } },
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -12,
    });
    const fg = new THREE.PlaneGeometry(900, 900, 1, 1);
    fg.rotateX(-Math.PI / 2);
    this.floor = new THREE.Mesh(fg, this.floorMat);
    this.floor.position.y = 0.03;
    this.floor.frustumCulled = false;
    this.floor.visible = false;
    this.floor.renderOrder = 3;
    scene.add(this.floor);

    this.bubbleMat = new THREE.ShaderMaterial({
      vertexShader: WORLD_VERT,
      fragmentShader: BUBBLE_FRAG,
      uniforms: { ...this.uniforms, uCam: { value: new THREE.Vector3() }, uA: { value: 0 } },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), this.bubbleMat);
    this.bubble.frustumCulled = false;
    this.bubble.visible = false;
    this.bubble.renderOrder = 40;
    scene.add(this.bubble);

    this.streaks = new Streaks(scene, () => G.camera);
  }

  get active() {
    return this.phase !== 'off';
  }
  get inside() {
    return this.phase === 'inside';
  }

  /** Remaining fraction of the domain (HUD). */
  get remaining() {
    return this.phase === 'inside' ? 1 - this.t / this.duration : this.phase === 'off' ? 0 : 1;
  }

  /** Zombies beyond the barrier are not drawn while the void replaces the world. */
  hides(x: number, z: number) {
    return (this.phase === 'inside' || this.phase === 'collapse') && Math.hypot(x - this.center.x, z - this.center.z) > this.R;
  }

  begin() {
    if (this.phase !== 'off') return false;
    const pl = G.player;
    this.center.set(pl.pos.x, 0, pl.pos.z);
    // the singularity hangs over the horizon straight ahead
    const f = new THREE.Vector3(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    this.V.copy(f).multiplyScalar(Math.cos(0.12)).setY(Math.sin(0.12)).normalize();
    this.uniforms.uV.value.copy(this.V);
    G.atmosphere.voidLight.copy(this.V);
    this.set('sign');
    return true;
  }

  private set(p: Phase) {
    this.phase = p;
    this.t = 0;
    this.onPhase?.(p);
  }

  /** Immediately tear the domain down (death, new day, reverting). */
  end() {
    if (this.phase === 'off') return;
    this.restoreWorld();
    this.release();
    this.phase = 'off';
    G.audio?.loop('domainLoop', 0);
  }

  private release() {
    for (const z of G.zombies.list) {
      if (z.voidT > 0) {
        z.voidT = Math.min(z.voidT, 0.6);
        z.fx.eyes = 1;
      }
    }
    if (G.bodyRenderer) G.bodyRenderer.uniforms.flashCol.value.setRGB(1.0, 0.22, 0.12);
  }

  private restoreWorld() {
    G.env.group.visible = true;
    G.fx.stains.overlay.visible = true;
    G.liquid?.setVisible(true);
    G.atmosphere.voidMix = 0;
    this.dome.visible = false;
    this.floor.visible = false;
    this.bubble.visible = false;
    this.streaks.clear();
  }

  private enterVoid() {
    G.env.group.visible = false;
    G.fx.stains.overlay.visible = false;
    G.liquid?.setVisible(false);
    this.dome.visible = true;
    this.floor.visible = true;
    this.floor.position.y = 0.005;
    this.floorMat.uniforms.uR.value = 450;
    this.floorMat.uniforms.uEdge.value = 0;
    this.bubble.visible = false;
    if (G.bodyRenderer) G.bodyRenderer.uniforms.flashCol.value.setRGB(0.32, 0.58, 1.15);
  }

  private trap(radius: number, dt: number, overload: boolean) {
    for (const z of G.zombies.list) {
      if (!z.alive) continue;
      if (Math.hypot(z.x - this.center.x, z.z - this.center.z) > radius) continue;
      z.voidT = 0.35;
      z.fx.eyes = 3.2;
      if (overload && Math.random() < dt * 5) z.fx.flash = Math.max(z.fx.flash, 0.6 + Math.random() * 0.4);
    }
  }

  update(dt: number) {
    this.uniforms.uTime.value += dt;
    if (this.phase === 'off') return;
    this.t += dt;
    const cam = G.camera.position;
    this.dome.position.copy(cam);
    this.floorMat.uniforms.uCam.value.copy(cam);
    this.floorMat.uniforms.uCenter.value.copy(this.center);
    this.bubbleMat.uniforms.uCam.value.copy(cam);
    const post = G.renderer.post;

    if (this.phase === 'sign') {
      G.atmosphere.voidMix = Math.min(0.25, this.t * 0.3);
      if (this.t >= 0.8) {
        this.set('expand');
        G.audio?.play('domainStart', { volume: 1.1 });
        this.bubble.visible = true;
        this.floor.visible = true;
        this.floor.position.y = 0.03;
        this.floorMat.uniforms.uEdge.value = 1;
        G.player.addTrauma(0.5);
      }
    } else if (this.phase === 'expand') {
      const k = clamp(this.t / 1.15, 0, 1);
      const e = 1 - Math.pow(1 - k, 2.2);
      const r = 0.8 + (this.R + 6 - 0.8) * e;
      this.bubble.position.copy(this.center);
      this.bubble.scale.setScalar(r);
      this.bubbleMat.uniforms.uA.value = 0.35 + 0.55 * k;
      this.floorMat.uniforms.uR.value = r;
      G.atmosphere.voidMix = 0.25 + 0.6 * k;
      this.trap(r, dt, false);
      G.player.addTrauma(dt * 0.6);
      post.aberration = Math.max(post.aberration, 0.6 * (1 - k));
      if (k >= 1) {
        this.set('inside');
        this.enterVoid();
        post.impact = 1.3;
        post.impactColor.setRGB(0.6, 0.85, 1.0);
        post.flash = Math.max(post.flash, 0.9);
        post.aberration = 1.5;
        G.player.addTrauma(0.7);
      }
    } else if (this.phase === 'inside') {
      G.atmosphere.voidMix = 1;
      this.trap(this.R, dt, true);
      // information overload: the void slowly breaks every mind inside it
      this.dotT += dt;
      if (this.dotT >= 0.25) {
        const tick = this.dotT;
        this.dotT = 0;
        for (const z of [...G.zombies.list]) {
          if (!z.alive || z.voidT <= 0) continue;
          // the overload builds: by the end of the domain nothing inside is left standing
          const boss = z.type.id === 'boss';
          const rate = 0.03 + 0.012 * this.t;
          const dmg = (boss ? 0.3 : 1) * rate * z.maxHp * tick;
          G.zombies.damage(z, { damage: dmg, part: 1, x: z.x, y: z.y + 1.5 * z.scale, z: z.z, dx: 0, dy: 1, dz: 0, stopping: 0, pen: 999, kind: 'fire', weapon: 'void', noBlood: true, noWound: true, premult: true });
        }
      }
      // streams of light rushing past toward the singularity
      const n = Math.round(110 * dt + Math.random());
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = 3 + Math.random() * 26;
        const x = cam.x + Math.cos(a) * rr - this.V.x * 30;
        const z = cam.z + Math.sin(a) * rr - this.V.z * 30;
        const y = 0.3 + Math.random() * 14;
        const sp = 26 + Math.random() * 30;
        const w = Math.random();
        this.streaks.emit(x, y, z, this.V.x * sp, this.V.y * sp * 0.4, this.V.z * sp, 1.4 + Math.random(), 0.02, 0.6 + w * 0.8, 0.9 + w * 0.6, 2.2, { stretch: 0.06 });
      }
      if (this.t >= this.duration) {
        this.set('collapse');
        G.audio?.play('domainEnd', { volume: 1.0 });
        G.audio?.loop('domainLoop', 0);
        post.impact = 1.25;
        post.impactColor.setRGB(0.85, 0.9, 1.0);
        post.flash = Math.max(post.flash, 0.45);
        this.restoreWorld();
        this.release();
        G.player.addTrauma(0.5);
        // shards of the void
        for (let i = 0; i < 160; i++) {
          const a = Math.random() * Math.PI * 2;
          const e = (Math.random() - 0.2) * 1.2;
          const r = 4 + Math.random() * 20;
          const sp = 4 + Math.random() * 10;
          G.fx.sparksP.emit(cam.x + Math.cos(a) * r, 1 + Math.random() * 8, cam.z + Math.sin(a) * r, Math.cos(a) * sp, Math.sin(e) * sp, Math.sin(a) * sp, 0.6 + Math.random() * 0.8, 0.06, 0.02, 1.4, 1.8, 2.6, 1, 0.3, 0.5, 1.2, 0, 0.6, 0.4);
        }
      } else G.audio?.loop('domainLoop', 0.85);
    } else if (this.phase === 'collapse') {
      G.atmosphere.voidMix = Math.max(0, 1 - this.t / 0.9) * 0.6;
      if (this.t >= 0.9) {
        G.atmosphere.voidMix = 0;
        this.phase = 'off';
        this.onPhase?.('off');
      }
    }
    this.streaks.update(dt);
  }
}
