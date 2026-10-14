// The crane's in-world affordance while its pallet hangs (DESIGN §4.3):
//  * the drop square painted on the planks under the pallet (dashed hazard
//    yellow, worn), which brightens and breathes when zombies crowd into it;
//  * the hook block catching the light now and then — a steady pulse when
//    the drop would be worth it, brighter when the Bosun is lined up with it.
import * as THREE from 'three';
import { CRANE, HUNTER } from '../../config/world';
import type { World } from '../../core/World';
import { clamp, rand, type Ctx } from './ctx';
import { F } from './fx';

const VERT = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */ `
  uniform float uR, uLight, uArmed, uTime, uOn;
  varying vec2 vP;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 a = abs(vP);
    float edge = max(a.x, a.y);
    // A painted band just inside the drop square, with corner brackets and dashes along the sides.
    float band = smoothstep(uR - 0.17, uR - 0.12, edge) * (1.0 - smoothstep(uR - 0.05, uR + 0.01, edge));
    float along = a.x > a.y ? vP.y : vP.x;
    float corner = step(uR - 0.6, min(a.x, a.y));
    float dash = max(corner, step(0.5, fract(along * 1.1 + 0.25)));
    // Worn paint: broken up by the plank grain and scuffs.
    float wear = (0.35 + 0.65 * h(floor(vP * vec2(9.0, 3.0)))) * (0.6 + 0.4 * h(floor(vP * vec2(31.0, 23.0)) + 7.0));
    float paint = band * dash * wear;
    if (paint < 0.01) discard;
    vec3 col = vec3(0.86, 0.66, 0.16) * uLight;
    float pulse = uArmed * (0.55 + 0.45 * sin(uTime * 7.0));
    col += vec3(1.0, 0.72, 0.2) * pulse * 0.55;
    gl_FragColor = vec4(col, paint * (0.3 + 0.4 * uArmed) * uOn);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const HOOK_GLINT = new THREE.Color(1.0, 0.86, 0.55);

export class CraneCue {
  private mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private on = 0;
  private armed = 0;
  private glintT = 1.5;
  private readonly _v = new THREE.Vector3();

  constructor(private ctx: Ctx) {
    const R = CRANE.radius;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uR: { value: R }, uLight: { value: 1 }, uArmed: { value: 0 }, uTime: { value: 0 }, uOn: { value: 0 } },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * R + 0.2, 2 * R + 0.2), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(CRANE.hookX, 0.015, CRANE.hookZ);
    this.mesh.renderOrder = 2;
    this.mesh.name = 'CraneDropZone';
    this.mesh.visible = false;
    ctx.scene.add(this.mesh);
  }

  update(dt: number, w: World): void {
    const ctx = this.ctx;
    const hanging = w.crane.state === 'hanging' && !w.gameEnded;
    this.on += ((hanging ? 1 : 0) - this.on) * Math.min(1, dt * (hanging ? 2 : 8));
    const crowd = w.pier.under >= CRANE.crowd;
    this.armed += ((hanging && crowd ? 1 : 0) - this.armed) * Math.min(1, dt * 5);
    this.mesh.visible = this.on > 0.01;
    const u = this.mat.uniforms;
    u.uOn.value = this.on;
    u.uArmed.value = this.armed;
    u.uTime.value = ctx.time;
    // Paint is lit by the scene: dimmer at night (the pulse still glows).
    u.uLight.value = 0.85 - 0.55 * ctx.darkness;
    if (!hanging) return;

    // The hook block: an occasional glint; a steady pulse when the drop would pay.
    const hp = ctx.env.craneHookPosition(this._v);
    const p = w.players[0];
    let lined = 0;
    if (p && p.alive) {
      const off = Math.abs(w.pier.hookOffset({ x: p.x - 0.6, y: p.y + HUNTER.muzzleHeight, z: p.z }));
      lined = Number.isFinite(off) ? clamp(1 - off / CRANE.hintBand, 0, 1) : 0;
    }
    if (this.armed > 0.05) {
      const k = this.armed * (0.7 + 0.5 * Math.sin(ctx.time * 7)) * (1 + lined);
      ctx.halos.push(hp.x, hp.y, hp.z, HOOK_GLINT, 1.1 * k, 1.1, 1.0);
    }
    this.glintT -= dt * (1 + 2 * lined + 2 * this.armed);
    if (this.glintT <= 0) {
      this.glintT = rand(1.6, 2.6);
      ctx.effects.emit(true, hp.x + rand(-0.2, 0.2), hp.y + rand(0, 0.25), hp.z + 0.25, {
        size: [0.15, 0.55 + 0.3 * lined],
        life: 0.22,
        color: 0xfff0c8,
        color1: 0xffc060,
        alpha: [0.9, 0],
        frame: F.Star,
        vr: rand(-4, 4),
      });
    }
  }

  clear(): void {
    this.on = 0;
    this.armed = 0;
    this.mesh.visible = false;
  }
}
