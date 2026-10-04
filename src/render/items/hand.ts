/**
 * First-person hand: Steve's right arm when empty-handed, held items in the main hand and
 * the off hand, with Minecraft's ItemInHandRenderer animation math (equip/switch dip, swing
 * and mining loop, eat/drink, bow draw with tremble, crossbow charge, trident raise, shield
 * block) plus weight: inertial sway on mouse turns, walking bob and a sprint pose.
 *
 * Rendered with forward PBR materials lit like the world (sun + sky SH + CSM shadows + the
 * propagated sky/block light at the hand) into a multisampled HDR target, then composited
 * into the post-TAA HDR buffer via `game.renderExtras.hand`.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ItemStack } from '../../game/items/registry';
import { itemBehavior } from '../../game/items/registry';
import type { ItemModels } from './itemModels';
import { bowPower } from '../../game/items/behaviors';

const D2R = Math.PI / 180;

/** Minimal PoseStack (post-multiplying transforms, like Minecraft's). */
class Pose {
  m = new THREE.Matrix4();
  private t = new THREE.Matrix4();
  reset() { this.m.identity(); return this; }
  translate(x: number, y: number, z: number) { this.m.multiply(this.t.makeTranslation(x, y, z)); return this; }
  rotX(deg: number) { if (deg) this.m.multiply(this.t.makeRotationX(deg * D2R)); return this; }
  rotY(deg: number) { if (deg) this.m.multiply(this.t.makeRotationY(deg * D2R)); return this; }
  rotZ(deg: number) { if (deg) this.m.multiply(this.t.makeRotationZ(deg * D2R)); return this; }
  scale(x: number, y = x, z = x) { this.m.multiply(this.t.makeScale(x, y, z)); return this; }
  copy(p: Pose) { this.m.copy(p.m); return this; }
}

interface HandSlot {
  shown: ItemStack | null;
  height: number;
  oHeight: number;
  model: THREE.Object3D | null;
  modelKey: string;
  root: THREE.Group;
}

function sameItem(a: ItemStack | null, b: ItemStack | null) {
  if (!a || !b) return a === b;
  return a.item === b.item && JSON.stringify(a.data ?? null) === JSON.stringify(b.data ?? null) && JSON.stringify(a.ench ?? null) === JSON.stringify(b.ench ?? null);
}

/** Custom first-person placement for an item (camera space, replaces the vanilla transforms). */
export type CustomHandPose = (ps: { m: THREE.Matrix4 }, o: { side: number; equip: number; swing: number; dt: number; model: THREE.Object3D }) => void;
const HAND_POSES = new Map<string, CustomHandPose>();
export function registerHandPose(itemName: string, fn: CustomHandPose) {
  HAND_POSES.set(itemName, fn);
}

export interface HandPoseOverride {
  pose: string;
  t: number;
}

export class FirstPersonHand {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.02, 20);
  private arm: THREE.Mesh;
  private armRoot = new THREE.Group();
  private main: HandSlot;
  private off: HandSlot;
  private rt: THREE.WebGLRenderTarget | null = null;
  private composite: { scene: THREE.Scene; camera: THREE.OrthographicCamera; mat: THREE.RawShaderMaterial };
  private pose = new Pose();
  // swing (visual, Minecraft swingTime rules)
  private swinging = false;
  private swingTime = 0;
  private oSwing = 0;
  private swingP = 0;
  private lastTick = 0;
  // sway / weight
  private lagYaw = 0;
  private lagPitch = 0;
  private sprint = 0;
  private lightInit = false;
  private models = new Map<string, THREE.Object3D>();
  override: HandPoseOverride | null = null;
  /** firstperson display transform for flat/handheld items: translation (px) xyz, rotation (deg) xyz. */
  display = [4.5, 4, -1, 0, 90, 25];
  samples = 4;
  visible = false;
  private frameDt = 0;

  constructor(readonly itemModels: ItemModels) {
    const mats = itemModels.mats;
    this.scene.add(this.camera);
    this.camera.add(this.armRoot);
    // Steve's right arm: model box (-3,-2,-2)..(1,10,2) px, pivot (-5, 2, 0)
    const geo = new RoundedBoxGeometry(4 / 16, 12 / 16, 4 / 16, 3, 0.55 / 16).translate(-1 / 16, 4 / 16, 0);
    this.arm = new THREE.Mesh(geo, mats.forward({ arm: true, roughness: 0.55, key: 'arm' }));
    this.arm.frustumCulled = false;
    this.armRoot.add(this.arm);
    this.armRoot.matrixAutoUpdate = false;
    const mk = (): HandSlot => {
      const root = new THREE.Group();
      root.matrixAutoUpdate = false;
      this.camera.add(root);
      return { shown: null, height: 0, oHeight: 0, model: null, modelKey: '', root };
    };
    this.main = mk();
    this.off = mk();
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: 'in vec3 position; out vec2 v_uv; void main(){ v_uv = position.xy*0.5+0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'precision highp float; uniform sampler2D t; in vec2 v_uv; out vec4 o; void main(){ o = texture(t, v_uv); }',
      uniforms: { t: { value: null } },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const m = new THREE.Mesh(tri, mat);
    m.frustumCulled = false;
    const sc = new THREE.Scene();
    sc.add(m);
    this.composite = { scene: sc, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  }

  /** The scene/camera pair for `game.renderExtras.hand`. */
  get extras() {
    return { scene: this.composite.scene, camera: this.composite.camera };
  }

  // ---------------------------------------------------------------------------- 20 TPS
  tick(player: any) {
    this.lastTick = performance.now();
    const inv = player.inventory;
    // equip heights (ItemInHandRenderer.tick)
    const main = inv.held as ItemStack | null;
    const off = inv.offhand as ItemStack | null;
    const strength = typeof player.attackStrength === 'function' ? player.attackStrength(1) : 1;
    const m = this.main;
    m.oHeight = m.height;
    const requip = !sameItem(m.shown, main);
    m.height += THREE.MathUtils.clamp((!requip ? strength * strength * strength : 0) - m.height, -0.4, 0.4);
    if (m.height < 0.1) m.shown = main;
    else if (!requip) m.shown = main;
    const o = this.off;
    o.oHeight = o.height;
    const requipOff = !sameItem(o.shown, off);
    o.height += THREE.MathUtils.clamp((!requipOff ? 1 : 0) - o.height, -0.4, 0.4);
    if (o.height < 0.1) o.shown = off;
    else if (!requipOff) o.shown = off;
    // swing (LivingEntity.swing + updateSwingTime, with Minecraft's restart-after-half rule)
    const dur = Math.max(1, 6 - (player.effectLevel?.('haste') ?? 0) + (player.effectLevel?.('mining_fatigue') ?? 0) * 2);
    this.oSwing = this.swingP;
    if (player.swingProgress === 0 && player.swingTicks === 0) {
      if (!this.swinging || this.swingTime >= dur / 2 || this.swingTime < 0) {
        this.swingTime = -1;
        this.swinging = true;
      }
    }
    if (this.swinging) {
      this.swingTime++;
      if (this.swingTime >= dur) { this.swingTime = 0; this.swinging = false; }
    } else this.swingTime = 0;
    this.swingP = this.swingTime / dur;
    if (this.swingP < this.oSwing) this.oSwing = this.swingP > 0 ? 0 : this.swingP;
  }

  private tickAlpha() {
    return Math.min(1, (performance.now() - this.lastTick) / 50);
  }

  private modelFor(stack: ItemStack, pull: number): THREE.Object3D {
    const s = pull > 0 ? { ...stack, data: { ...(stack.data ?? {}), pull: Math.round(pull * 3) / 3 } } : stack;
    const key = `${s.item.name}|${JSON.stringify(s.data ?? null)}|${s.ench ? 1 : 0}`;
    let m = this.models.get(key);
    if (!m) {
      m = this.itemModels.create(s, 'hand');
      this.models.set(key, m);
      if (this.models.size > 48) this.models.delete(this.models.keys().next().value!);
    }
    return m;
  }

  // ---------------------------------------------------------------------------- per frame
  /**
   * Animate and render into the hand target. Returns false if nothing should be drawn.
   * `light` = (sky, r, g, b) 0..1 at the hand (already smoothed by the caller or here).
   */
  update(game: any, dt: number, light: THREE.Vector4): boolean {
    const p = game.player;
    const cam: THREE.PerspectiveCamera = game.cameraCtl.camera;
    const hide = !p || game.cameraCtl.perspective !== 'first' || !!p.vehicle || p.dead || p.spectator || p.sleeping || game.ui?.hudHidden || p.usingItem?.stack.item.name === 'spyglass';
    this.visible = !hide;
    if (hide) return false;
    this.frameDt = dt;
    const r = game.renderer;
    const gl: THREE.WebGLRenderer = r.gl;
    const mats = this.itemModels.mats;
    // light (smoothed)
    const hl = mats.handLight.value;
    if (!this.lightInit) { hl.copy(light); this.lightInit = true; }
    else hl.lerp(light, 1 - Math.exp(-dt * 8));
    mats.time.value = game.realTime;
    // camera follows the view rotation (camera at the origin = camera-relative world space)
    this.camera.quaternion.copy(cam.quaternion);
    this.camera.aspect = r.width / r.height;
    this.camera.fov = 70;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    mats.handViewInvRot.value.setFromMatrix4(this.camera.matrixWorld);
    // weight: lag behind view rotation, sprint blend
    const k = 1 - Math.exp(-dt * 12);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    this.lagYaw += wrap(p.yaw - this.lagYaw) * k;
    this.lagPitch += (p.pitch - this.lagPitch) * k;
    const swayY = THREE.MathUtils.clamp(-wrap(p.yaw - this.lagYaw) * 0.18, -0.12, 0.12);
    const swayX = THREE.MathUtils.clamp(-(p.pitch - this.lagPitch) * 0.18, -0.1, 0.1);
    this.sprint += ((p.sprinting && p.onGround && !p.usingItem ? 1 : 0) - this.sprint) * (1 - Math.exp(-dt * 6));
    const ta = this.tickAlpha();
    let swing = THREE.MathUtils.lerp(this.oSwing, this.swingP, ta);
    if (!this.swinging && this.swingP === 0) swing = 0;
    const ov = this.override;
    if (ov?.pose === 'swing') swing = ov.t;
    // walking bob (ItemInHandRenderer bobView applied to the hand)
    const al = game.cameraCtl?.lastAlpha ?? 1;
    const lerpBob = (a: number | undefined, b: number | undefined) => (a ?? b ?? 0) + ((b ?? 0) - (a ?? b ?? 0)) * al;
    const ph = lerpBob(p.prevBobPhase, p.bobPhase) * Math.PI;
    const ba = game.cameraCtl.viewBobbing && !p.flying ? lerpBob(p.prevBobAmount, p.bobAmount) * (1 + this.sprint * 0.6) : 0;
    const base = new THREE.Matrix4()
      .multiply(new THREE.Matrix4().makeTranslation(Math.sin(ph) * ba * 0.03, -Math.abs(Math.cos(ph)) * ba * 0.05 - this.sprint * 0.05, 0))
      .multiply(new THREE.Matrix4().makeRotationZ(Math.sin(ph) * ba * 2.0 * D2R))
      .multiply(new THREE.Matrix4().makeRotationX((Math.abs(Math.cos(ph - 0.2)) * ba * 3.0 - this.sprint * 9) * D2R))
      .multiply(new THREE.Matrix4().makeRotationX(swayX))
      .multiply(new THREE.Matrix4().makeRotationY(swayY))
      .multiply(new THREE.Matrix4().makeRotationZ(-this.sprint * 6 * D2R));
    const using = p.usingItem as { stack: ItemStack; hand: 'main' | 'off'; ticks: number } | null;
    // ---- main hand
    const mainEquip = 1 - THREE.MathUtils.lerp(this.main.oHeight, this.main.height, ta);
    const offEquip = 1 - THREE.MathUtils.lerp(this.off.oHeight, this.off.height, ta);
    const mainStack = this.main.shown;
    this.armRoot.visible = !mainStack;
    if (!mainStack) {
      this.renderArm(1, swing, mainEquip);
      this.armRoot.matrix.premultiply(base);
    }
    this.placeItem(this.main, 1, mainStack, swing, mainEquip, using?.hand === 'main' ? using : null, base, ta);
    this.placeItem(this.off, -1, this.off.shown, 0, offEquip, using?.hand === 'off' ? using : null, base, ta);
    // ---- render to the multisampled HDR target
    const w = r.width, h = r.height;
    const samples = r.settings.quality === 'low' ? 0 : r.settings.quality === 'medium' ? 2 : this.samples;
    if (!this.rt || this.rt.width !== w || this.rt.height !== h || this.rt.samples !== samples) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthBuffer: true, stencilBuffer: false });
    }
    const prev = gl.getRenderTarget();
    const prevColor = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();
    gl.setRenderTarget(this.rt);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, false);
    gl.render(this.scene, this.camera);
    gl.setRenderTarget(prev);
    gl.setClearColor(prevColor, prevAlpha);
    this.composite.mat.uniforms.t.value = this.rt.texture;
    return true;
  }

  /** ItemInHandRenderer.renderPlayerArm */
  private renderArm(side: number, swing: number, equip: number) {
    const ps = this.pose.reset();
    const f1 = Math.sqrt(swing);
    const f2 = -0.3 * Math.sin(f1 * Math.PI);
    const f3 = 0.4 * Math.sin(f1 * Math.PI * 2);
    const f4 = -0.4 * Math.sin(swing * Math.PI);
    ps.translate(side * (f2 + 0.64000005), f3 - 0.6 + equip * -0.6, f4 - 0.71999997);
    ps.rotY(side * 45);
    const f5 = Math.sin(swing * swing * Math.PI);
    const f6 = Math.sin(f1 * Math.PI);
    ps.rotY(side * f6 * 70);
    ps.rotZ(side * f5 * -20);
    ps.translate(side * -1, 3.6, 3.5);
    ps.rotZ(side * 120);
    ps.rotX(200);
    ps.rotY(side * -135);
    ps.translate(side * 5.6, 0, 0);
    // ModelPart: pivot (-5, 2, 0) px
    ps.translate((side * -5) / 16, 2 / 16, 0);
    this.armRoot.matrix.copy(ps.m);
    this.arm.scale.x = side;
  }

  private placeItem(slot: HandSlot, side: number, stack: ItemStack | null, swing: number, equip: number, use: { stack: ItemStack; ticks: number } | null, base: THREE.Matrix4, ta: number) {
    if (slot.model) slot.root.remove(slot.model);
    slot.model = null;
    if (!stack) return;
    const ps = this.pose.reset();
    const beh = itemBehavior(stack.item);
    const ov = this.override;
    let pose = use && use.stack === stack ? beh?.usePose ?? '' : '';
    let usedTicks = use ? use.ticks + ta : 0;
    if (ov && side === 1 && ov.pose !== 'swing') { pose = ov.pose; usedTicks = ov.t * 32; }
    const name = stack.item.name;
    const custom = HAND_POSES.get(name);
    if (custom) {
      const model = this.modelFor(stack, 0);
      custom(ps, { side, equip, swing, dt: this.frameDt, model });
      slot.root.matrix.copy(base).multiply(ps.m);
      slot.root.add(model);
      slot.model = model;
      return;
    }
    let pull = 0;
    let customDisplay = false;
    const armT = () => ps.translate(side * 0.56, -0.52 + equip * -0.6, -0.72);
    if (pose === 'eat' || pose === 'drink') {
      const dur = stack.item.food?.eatTicks ?? 32;
      const remaining = Math.max(0, dur - usedTicks);
      const f1 = remaining / dur;
      if (f1 < 0.8) ps.translate(0, Math.abs(Math.cos((remaining / 4) * Math.PI) * 0.1), 0);
      const f3 = 1 - Math.pow(f1, 27);
      ps.translate(f3 * 0.6 * side, f3 * -0.5, 0);
      ps.rotY(side * f3 * 90);
      ps.rotX(f3 * 10);
      ps.rotZ(side * f3 * 30);
      armT();
    } else if (pose === 'bow') {
      // Minecraft's bow pull (draw toward the face, tremble at full draw) with the bow held
      // upright and the arrow aimed at the crosshair
      armT();
      const f8 = usedTicks;
      const f12 = bowPower(f8);
      pull = f12;
      ps.translate(side * -0.3, 0.34 + 0.02 * f12, 0.08 + f12 * 0.07);
      if (f12 > 0.1) {
        const f = Math.sin((f8 - 0.1) * 1.3) * (f12 - 0.1);
        ps.translate(f * 0.004, f * 0.006, 0);
      }
      const a = new THREE.Vector3(1, 1, 0).normalize(), l = new THREE.Vector3(1, -1, 0).normalize(), n = new THREE.Vector3(0, 0, -1);
      const F = new THREE.Vector3(-0.1 * side, 0.03, -1).normalize();
      const Dn = new THREE.Vector3(0.12 * side, -1, 0).normalize().addScaledVector(F, -0).normalize();
      const X = new THREE.Vector3().crossVectors(F, Dn).normalize();
      const Dc = new THREE.Vector3().crossVectors(X, F).normalize();
      const B1 = new THREE.Matrix4().makeBasis(a, l, n).transpose();
      const B2 = new THREE.Matrix4().makeBasis(F, Dc, X);
      ps.m.multiply(B2.multiply(B1));
      ps.scale(0.68);
      customDisplay = true;
    } else if (pose === 'crossbow') {
      armT();
      ps.translate(side * -0.4785682, -0.094387, 0.05731531);
      ps.rotX(-11.935);
      ps.rotY(side * 65.3);
      ps.rotZ(side * -9.785);
      const charge = Math.min(1, usedTicks / 25);
      if (charge > 0.1) ps.translate(0, Math.sin((usedTicks - 0.1) * 1.3) * (charge - 0.1) * 0.004, 0);
      ps.translate(0, 0, charge * 0.04);
      ps.scale(1, 1, 1 + charge * 0.2);
      ps.rotY(-side * 45);
    } else if (pose === 'spear') {
      armT();
      ps.translate(side * -0.5, 0.7, 0.1);
      ps.rotX(-55);
      ps.rotY(side * 35.3);
      ps.rotZ(side * -9.785);
      const f11 = Math.min(1, usedTicks / 10);
      if (f11 > 0.1) ps.translate(0, Math.sin((usedTicks - 0.1) * 1.3) * (f11 - 0.1) * 0.004, 0);
      ps.translate(0, 0, f11 * 0.2);
      ps.scale(1, 1, 1 + f11 * 0.2);
      ps.rotY(-side * 45);
    } else if (pose === 'block') {
      armT();
    } else {
      const sq = Math.sqrt(swing);
      ps.translate(side * -0.4 * Math.sin(sq * Math.PI), 0.2 * Math.sin(sq * Math.PI * 2), -0.2 * Math.sin(swing * Math.PI));
      armT();
      // applyItemArmAttackTransform
      const f = Math.sin(swing * swing * Math.PI);
      ps.rotY(side * (45 + f * -20));
      const f1 = Math.sin(sq * Math.PI);
      ps.rotZ(side * f1 * -20);
      ps.rotX(f1 * -80);
      ps.rotY(side * -45);
    }
    if (name === 'bow' && use && use.stack === stack) pull = bowPower(usedTicks);
    const model = this.modelFor(stack, name === 'bow' ? pull : 0);
    const kind = model.userData.kind;
    // display transform: firstperson_{right,left}hand
    if (customDisplay) {
      // pose already placed the model
    } else if (name === 'shield') {
      const blocking = pose === 'block';
      const b = blocking ? Math.min(1, usedTicks / 5) : 0;
      ps.translate(side * (-0.18 - 0.1 * b), 0.06 + 0.1 * b, 0.06 - 0.05 * b);
      ps.rotY(side * (12 - 18 * b));
      ps.rotZ(side * (-4 + 6 * b));
      ps.rotX(4 * b);
      ps.scale(0.62);
    } else if (kind === 'block') {
      ps.rotY(side * 45);
      ps.scale(0.4);
    } else {
      const D = this.display;
      ps.translate((side * D[0]) / 16, D[1] / 16, D[2] / 16);
      ps.rotX(D[3]);
      ps.rotY(side * D[4]);
      ps.rotZ(side * D[5]);
      ps.scale(0.68);
      if (side < 0) ps.scale(-1, 1, 1);
    }
    slot.root.matrix.copy(base).multiply(ps.m);
    slot.root.add(model);
    slot.model = model;
  }

  dispose() {
    this.rt?.dispose();
  }
}
