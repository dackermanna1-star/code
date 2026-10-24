import * as THREE from 'three';
import { RAPIER, GROUPS, BodySync, type RBody, type RCollider } from '../physics/Physics';
import { ctx } from '../game/ctx';
import { events } from '../game/events';
import { levelTexture } from '../render/LevelTextures';
import { rand } from '../core/math';

export interface DoorOpts {
  width: number;
  height: number;
  thickness?: number;
  /** door closed orientation (radians around Y); door extends along local +X from the hinge */
  rotY: number;
  saloon?: boolean;
  tex?: string;
  color?: THREE.ColorRepresentation;
  maxAngle?: number;
  window?: boolean;
  sign?: string;
}

/** A hinged physics door. */
export class Door {
  body: RBody;
  anchor: RBody;
  joint: RAPIER.ImpulseJoint | null;
  sync: BodySync;
  mesh: THREE.Group;
  broken = false;
  collider: RCollider;

  constructor(scene: THREE.Scene, hinge: THREE.Vector3, public o: DoorOpts) {
    const { world } = ctx.physics;
    const t = o.thickness ?? 0.06;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.rotY);
    const along = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const center = hinge.clone().addScaledVector(along, o.width / 2);
    center.y = hinge.y + o.height / 2;
    this.anchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hinge.x, hinge.y + o.height / 2, hinge.z));
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setAngularDamping(o.saloon ? 1.2 : 2.5)
        .setLinearDamping(0.5)
        .setCanSleep(true),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(o.width / 2 - 0.01, o.height / 2, t / 2)
        .setDensity(o.saloon ? 180 : 380)
        .setFriction(0.4)
        .setCollisionGroups(GROUPS.PROP)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(200),
      this.body,
    );
    ctx.physics.register(this.collider, {
      kind: 'prop',
      material: 'wood',
      entity: this,
      onContactForce: (ev) => {
        if (ev.impulse > 2.5) events.emit('impact', { pos: ev.point.clone(), normal: ev.dir.clone(), material: 'wood', strength: Math.min(1.2, ev.impulse / 40) });
        if (!this.broken && ev.impulse > (o.saloon ? 70 : 110)) this.breakOff(ev.dir);
      },
    });
    // hinge joint: anchor at hinge (in anchor frame: 0), in door frame: -width/2 along local x
    const jd = RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: -o.width / 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    jd.limitsEnabled = true;
    const max = o.maxAngle ?? 1.75;
    jd.limits = [-max, max];
    this.joint = world.createImpulseJoint(jd, this.anchor, this.body, true);
    const raw = (world.impulseJoints as any).raw;
    if (o.saloon) raw.jointConfigureMotor(this.joint.handle, 3, 0, 0, 25, 3);
    else raw.jointConfigureMotorVelocity(this.joint.handle, 3, 0, 0.8);

    // visual
    this.mesh = new THREE.Group();
    const tex = levelTexture(o.tex ?? 'woodPanel');
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: o.color ?? 0xffffff, roughness: 0.75 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(o.width - 0.02, o.height, t), mat);
    panel.castShadow = true;
    panel.receiveShadow = true;
    this.mesh.add(panel);
    if (o.saloon) {
      // slats
      const slatMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7 });
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(o.width - 0.1, 0.03, t + 0.01), slatMat);
        s.position.y = -o.height / 2 + (o.height / 4) * (i + 1);
        this.mesh.add(s);
      }
    } else {
      const knobMat = new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.8, roughness: 0.3 });
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, t + 0.08), knobMat);
      knob.position.set(o.width / 2 - 0.12, -0.05, 0);
      this.mesh.add(knob);
      if (o.window) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(o.width * 0.5, o.height * 0.25, t + 0.005), new THREE.MeshStandardMaterial({ color: 0x8ab0c0, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.5 }));
        g.position.y = o.height * 0.22;
        this.mesh.add(g);
      }
      if (o.sign) {
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 48;
        const gg = c.getContext('2d')!;
        gg.fillStyle = '#e8dcc0';
        gg.fillRect(0, 0, 128, 48);
        gg.fillStyle = '#1a1410';
        gg.font = 'bold 28px Rubik, sans-serif';
        gg.textAlign = 'center';
        gg.textBaseline = 'middle';
        gg.fillText(o.sign, 64, 26);
        const st = new THREE.CanvasTexture(c);
        st.colorSpace = THREE.SRGBColorSpace;
        const sm = new THREE.MeshStandardMaterial({ map: st, roughness: 0.6 });
        for (const side of [1, -1]) {
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.14), sm);
          sign.position.set(0, o.height * 0.22, side * (t / 2 + 0.003));
          if (side < 0) sign.rotation.y = Math.PI;
          this.mesh.add(sign);
        }
      }
    }
    scene.add(this.mesh);
    this.sync = new BodySync(this.body, this.mesh);
  }

  breakOff(dir: THREE.Vector3): void {
    if (this.broken || !this.joint) return;
    this.broken = true;
    ctx.physics.world.removeImpulseJoint(this.joint, true);
    this.joint = null;
    this.body.applyImpulse({ x: dir.x * -20, y: 5, z: dir.z * -20 }, true);
    events.emit('impact', { pos: this.sync.currPos.clone(), normal: dir.clone(), material: 'wood', strength: 1.4 });
    events.emit('noise', { pos: this.sync.currPos.clone(), radius: 12, kind: 'break', source: null });
    ctx.fx?.debris(this.sync.currPos, new THREE.Vector3(0, 1, 0), 10, '#5a3820', 'splinter', 0.03, 3);
  }

  capture(): void {
    if (!this.body.isSleeping()) this.sync.capture();
  }

  apply(alpha: number): void {
    this.sync.apply(alpha);
  }
}

/** Breakable glass pane. */
export class GlassPane {
  mesh: THREE.Mesh;
  collider: RCollider | null;
  broken = false;
  private static mat: THREE.MeshStandardMaterial | null = null;

  constructor(scene: THREE.Scene, center: THREE.Vector3, w: number, h: number, rotY: number, public onBreak?: () => void, tint: THREE.ColorRepresentation = 0x9ab8c8) {
    if (!GlassPane.mat) {
      GlassPane.mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    }
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), GlassPane.mat);
    this.mesh.position.copy(center);
    this.mesh.rotation.y = rotY;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    const desc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, 0.03)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCollisionGroups(GROUPS.STATIC)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(60);
    this.collider = ctx.physics.world.createCollider(desc);
    ctx.physics.register(this.collider, {
      kind: 'static',
      material: 'glass',
      entity: this,
      onContactForce: (ev) => {
        if (ev.impulse > 6) this.shatter(ev.dir.clone().negate());
      },
    });
    (this.collider as any).__glass = this;
  }

  shatter(dir: THREE.Vector3): void {
    if (this.broken) return;
    this.broken = true;
    const c = this.mesh.position.clone();
    const w = (this.mesh.geometry as THREE.BoxGeometry).parameters.width;
    const h = (this.mesh.geometry as THREE.BoxGeometry).parameters.height;
    this.mesh.removeFromParent();
    if (this.collider) {
      ctx.physics.removeCollider(this.collider);
      this.collider = null;
    }
    const fx = ctx.fx;
    if (fx) {
      const rot = this.mesh.rotation.y;
      const along = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
      for (let i = 0; i < 28; i++) {
        const p = c.clone().addScaledVector(along, rand(-w / 2, w / 2));
        p.y += rand(-h / 2, h / 2);
        fx.debris(p, dir, 1, '#c8e0e8', 'glass', rand(0.03, 0.07), 4);
      }
    }
    events.emit('impact', { pos: c, normal: dir, material: 'glass', strength: 1.6, otherMaterial: 'break' as any });
    events.emit('noise', { pos: c, radius: 14, kind: 'break', source: null });
    this.onBreak?.();
  }
}
