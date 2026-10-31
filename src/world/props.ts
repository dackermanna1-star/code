import * as THREE from 'three';
import type { Game } from '../game';
import { G, groups, RAPIER } from './physics';
import { crateTexture, drumTexture } from './textures';
import { rand } from '../core/math';

interface Prop {
  kind: 'drum' | 'crate';
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  broken: boolean;
  lastHit: number;
  half: THREE.Vector3;
}

const _v = new THREE.Vector3();

/** Dynamic, interactive props: oil drums that topple and roll, crates that shatter. Nothing is removed. */
export class Props {
  list: Prop[] = [];
  constructor(public game: Game) {
    const drumTexs = [drumTexture('#2f4f7a', 21), drumTexture('#7a2a22', 22), drumTexture('#3c5a34', 23)];
    const drumMats = drumTexs.map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.45 }));
    const drumGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16);
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(31), roughness: 0.8, color: 0xd8c8b0 });
    const crateGeo = new THREE.BoxGeometry(0.75, 0.75, 0.75);
    const drums: [number, number][] = [[-8.8, -7.6], [-8.2, -8.4], [8.9, 6.4], [9.4, -6.9], [-3.4, 9.7], [12.0, 1.5], [-12.1, -1.9]];
    drums.forEach(([x, z], i) => this.add('drum', drumGeo, drumMats[i % drumMats.length], x, 0.44, z, new THREE.Vector3(0.29, 0.44, 0.29)));
    const crates: [number, number, number][] = [[-6.0, 9.9, 0], [-5.2, 9.8, 0], [-5.6, 9.85, 0.75], [6.2, -9.9, 0], [10.6, 3.2, 0], [-10.4, -3.8, 0]];
    for (const [x, z, y] of crates) this.add('crate', crateGeo, crateMat, x, 0.375 + y, z, new THREE.Vector3(0.375, 0.375, 0.375));
  }

  private add(kind: Prop['kind'], geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, half: THREE.Vector3) {
    const g = this.game;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    mesh.rotation.y = rand(0, Math.PI);
    g.scene.add(mesh);
    const q = mesh.quaternion;
    const body = g.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.3).setAngularDamping(0.5),
    );
    const cd = kind === 'drum' ? RAPIER.ColliderDesc.cylinder(half.y, half.x) : RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z);
    cd.setMass(kind === 'drum' ? 18 : 9).setFriction(0.7).setRestitution(0.15).setCollisionGroups(groups(G.PROP, G.STATIC | G.CORPSE | G.RAGDOLL | G.PROP));
    g.physics.world.createCollider(cd, body);
    body.sleep();
    this.list.push({ kind, mesh, body, broken: false, lastHit: 0, half });
  }

  update(dt: number) {
    const g = this.game;
    for (const p of this.list) {
      if (p.broken) continue;
      const t = p.body.translation();
      const r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      // live fighters shove props they walk into (no physics bodies for live characters)
      for (const f of g.fighters) {
        if (!f.alive) continue;
        const dx = t.x - f.x, dz = t.z - f.z;
        const d = Math.hypot(dx, dz);
        const minD = f.radius + p.half.x + 0.05;
        if (d < minD && d > 1e-3 && t.y < 1.2) {
          const sp = Math.hypot(f.vx, f.vz);
          const k = (minD - d) * (p.kind === 'drum' ? 40 : 25) + sp * 6;
          p.body.applyImpulse({ x: (dx / d) * k * dt * 10, y: 0, z: (dz / d) * k * dt * 10 }, true);
        }
      }
      // impacts from ragdolls (thrown / falling bodies)
      const lv = p.body.linvel();
      const speed = Math.hypot(lv.x, lv.y, lv.z);
      if (speed > 2.2 && g.time - p.lastHit > 0.25) {
        p.lastHit = g.time;
        _v.set(t.x, t.y, t.z);
        if (p.kind === 'drum') {
          g.audio.play('metal_hit', { pos: _v, vol: Math.min(1, speed / 6) });
          g.fx.dust(_v.clone().setY(0), 0.6);
        } else if (speed > 3.2) this.breakCrate(p);
        else g.audio.play('wood_break', { pos: _v, vol: 0.4 });
      }
    }
  }

  /** Thrown/falling bodies smash crates they hit hard. */
  checkBody(pos: THREE.Vector3, vel: number) {
    if (vel < 2.5) return;
    for (const p of this.list) {
      if (p.broken || p.kind !== 'crate') continue;
      const t = p.body.translation();
      if (Math.hypot(t.x - pos.x, t.z - pos.z) < 0.75 && pos.y < t.y + 0.9) this.breakCrate(p);
    }
  }

  breakCrate(p: Prop) {
    const g = this.game;
    p.broken = true;
    const t = p.body.translation();
    const at = new THREE.Vector3(t.x, t.y, t.z);
    g.audio.play('wood_break', { pos: at });
    g.fx.woodBurst(at, 26);
    g.cam.addTrauma(0.15);
    g.physics.world.removeRigidBody(p.body);
    p.mesh.removeFromParent();
  }
}
