/**
 * The local player's body for third person and for portal views (you see yourself through
 * portals, carrying what you hold). While the body straddles a portal, a second copy is drawn
 * transformed through it, so the half that has gone in comes out of the other side; the wall and
 * the portal surfaces hide each copy's part behind its plane.
 */
import * as THREE from 'three';
import type { Game } from '../game';
import { createRig } from '../../entity/models/catalog';
import type { Rig } from '../../entity/models/rig';
import { animateHumanoid } from '../../entity/models/anim/humanoid';
import { newAnimState, type AnimState } from '../../entity/models/anim/common';
import { setEntityLight, createEntityMaterial } from '../../render/entityMaterial';
import { wrapAngle } from '../../entity/living';

interface Copy {
  rig: Rig;
  mem: Record<string, any>;
  held: THREE.Object3D | null;
  cape: THREE.Mesh | null;
}

/** Items that change the body's look (the hero gloves make you the hero) and are not drawn held. */
const LOOKS: Record<string, string> = { hero_gloves: 'hero' };

let CAPE_GEO: THREE.BufferGeometry | null = null;
function capeGeometry() {
  // hangs from the shoulders down the back (+z is behind the body)
  return (CAPE_GEO ??= new THREE.PlaneGeometry(0.66, 1.08, 6, 10).translate(0, -0.54, 0).rotateY(Math.PI));
}

export class PlayerBody {
  /** G-buffer scene (add to renderExtras.gbuffer). */
  readonly scene = new THREE.Scene();
  private copies: Copy[] = [];
  private readonly st: AnimState = newAnimState();
  private heldKey = '';
  private time = 0;
  private lastBy = 0;
  /** Visibility in the main view (third person). */
  mainVisible = false;
  private cloneM: THREE.Matrix4 | null = null;

  private variant = '';
  private capeMat: THREE.RawShaderMaterial | null = null;

  constructor(private game: Game) {
    this.build('');
  }

  private build(variant: string) {
    for (const c of this.copies) {
      c.rig.root.removeFromParent();
      c.rig.dispose();
    }
    this.copies.length = 0;
    this.variant = variant;
    this.heldKey = '#';
    for (let i = 0; i < 2; i++) {
      const rig = createRig('player', variant);
      rig.root.matrixAutoUpdate = i === 0;
      this.scene.add(rig.root);
      let cape: THREE.Mesh | null = null;
      if (variant === 'hero' && rig.attach.back) {
        this.capeMat ??= createEntityMaterial({ color: 0xf4f2ec, roughness: 0.8, side: THREE.DoubleSide });
        cape = new THREE.Mesh(capeGeometry(), this.capeMat);
        cape.position.set(0, 0.32, 0.02);
        rig.attach.back.add(cape);
      }
      this.copies.push({ rig, mem: {}, held: null, cape });
    }
  }

  /**
   * Show / hide for the view being drawn: portal views show the body, except a copy whose head
   * the view's camera is in (looking out of a portal right where you are standing).
   */
  setViewVisible(inView: boolean, camPos?: THREE.Vector3) {
    const p: any = this.game.player;
    const can = !!p && !p.spectator && !p.dead && !p.vehicle;
    const v = can && (inView || this.mainVisible);
    const far = (eye: THREE.Vector3) => !camPos || eye.distanceToSquared(camPos) > 0.45 * 0.45;
    this.copies[0].rig.root.visible = v && far(this.eye);
    this.copies[1].rig.root.visible = v && !!this.cloneM && far(this.cloneEye);
  }
  private readonly eye = new THREE.Vector3();
  private readonly cloneEye = new THREE.Vector3();

  /** Per frame: pose, light, held item; `clone` = transform of the second copy (or null). */
  update(alpha: number, dt: number, clone: THREE.Matrix4 | null) {
    const g = this.game;
    const p: any = g.player;
    if (!p) return;
    this.cloneM = clone;
    this.mainVisible = g.cameraCtl.perspective !== 'first';
    this.time += dt;
    const pos = p.renderPos(alpha, _p);
    this.eye.set(pos.x, pos.y + (g.cameraCtl.currentEyeHeight ?? 1.62), pos.z);
    if (clone) this.cloneEye.copy(this.eye).applyMatrix4(clone);
    const by = p.prevBodyYaw + wrapAngle(p.bodyYaw - p.prevBodyYaw) * alpha;
    const st = this.st;
    st.time = this.time;
    st.limbSwing = p.limbSwing;
    st.limbAmount = p.prevLimbSwingAmount + (p.limbSwingAmount - p.prevLimbSwingAmount) * alpha;
    st.speed = Math.hypot(p.vel.x, p.vel.z);
    st.headYaw = wrapAngle(p.yaw - by);
    st.headPitch = p.pitch;
    st.attack = p.swingProgress >= 0 ? Math.min(1, p.swingProgress + alpha / 6) : -1;
    st.onGround = p.onGround;
    st.inWater = p.inWater;
    st.vy = p.vel.y;
    st.sneaking = p.sneaking && !p.flying;
    st.swimming = p.swimming;
    const dy = wrapAngle(by - this.lastBy);
    this.lastBy = by;
    st.turnRate = dt > 0 ? dy / dt : 0;
    st.hurt = p.hurtTime > 0 ? p.hurtTime / p.hurtDuration : 0;
    const held = p.mainHand;
    const look = held ? LOOKS[held.item.name] ?? '' : '';
    if (look !== this.variant) this.build(look);
    st.holdItem = !!held && !look;
    st.aimGun = held?.item.name === 'portal_gun';
    // held item model
    const key = held ? held.item.name + '|' + JSON.stringify(held.data ?? null) : '';
    if (key !== this.heldKey) {
      this.heldKey = key;
      for (const c of this.copies) {
        c.held?.removeFromParent();
        c.held = held && !look && g.itemModels?.create ? g.itemModels.create(held, 'third_person') : null;
        if (c.held) c.rig.attach.handR?.add(c.held);
      }
    }
    // the cape streams back with speed and flutters
    const sp = Math.hypot(p.vel.x, p.vel.z) + Math.max(0, -p.vel.y) * 0.5;
    for (const c of this.copies) if (c.cape) {
      c.cape.rotation.x = -(0.08 + Math.min(1.25, sp * 0.06)) - Math.sin(this.time * (3 + sp * 0.4)) * (0.03 + Math.min(0.12, sp * 0.008));
      c.cape.rotation.z = Math.sin(this.time * 2.1) * 0.04;
    }
    if (this.capeMat) setEntityLight(this.capeMat, g.world.getLight(Math.floor(pos.x), Math.floor(pos.y + 1.2), Math.floor(pos.z)));
    const L = g.world.getLight(Math.floor(pos.x), Math.floor(pos.y + 1.2), Math.floor(pos.z));
    const hurt = p.hurtTime > 0 ? Math.min(1, (p.hurtTime + 1 - alpha) / 2) : 0;
    for (let i = 0; i < this.copies.length; i++) {
      const c = this.copies[i];
      const rig = c.rig;
      for (const m of rig.materials) {
        setEntityLight(m, L);
        m.uniforms.u_hurt.value = hurt;
      }
      c.held?.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.RawShaderMaterial | undefined;
        if (m?.uniforms?.u_light) setEntityLight(m, L);
      });
      rig.resetPose();
      animateHumanoid(rig, st, dt, c.mem, {});
    }
    const main = this.copies[0].rig.root;
    main.position.copy(pos);
    main.rotation.set(0, by, 0);
    main.updateMatrix();
    const cr = this.copies[1].rig.root;
    if (clone) {
      cr.matrix.multiplyMatrices(clone, main.matrix);
      cr.matrixWorldNeedsUpdate = true;
    }
    this.setViewVisible(false);
  }

  /** Glow parts of the held device (to tint them with the last shot colour). */
  heldMaterials(): THREE.RawShaderMaterial[] {
    const out: THREE.RawShaderMaterial[] = [];
    for (const c of this.copies)
      c.held?.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.RawShaderMaterial | undefined;
        if (m?.uniforms?.u_emissive && m.uniforms.u_emissive.value > 0.5) out.push(m);
      });
    return out;
  }

  dispose() {
    for (const c of this.copies) {
      c.rig.root.removeFromParent();
      c.rig.dispose();
    }
    this.copies.length = 0;
  }
}
const _p = new THREE.Vector3();
