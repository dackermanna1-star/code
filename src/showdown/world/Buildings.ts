import * as THREE from 'three';
import { RAPIER } from '../../physics/Physics';
import { ConvexPoly, FacadeAttrs, polyGeometry } from './Poly';
import { STYLE } from './Facade';

export interface BuildingSpec {
  x: number;
  z: number;
  /** footprint size along x / z (or radii for a lathe) */
  w: number;
  d: number;
  h: number;
  y0?: number;
  style: number;
  floor?: number;
  bay?: number;
  color: number;
  glass?: number;
  rotY?: number;
  /** solid of revolution profile [r, y] (radius scaled by w/2, d/2) */
  profile?: [number, number][];
  sides?: number;
  name?: string;
}

let seedN = 1;

/** One sliceable building piece: convex polyhedron, mesh and collider. */
export class Building {
  poly: ConvexPoly;
  attrs: FacadeAttrs;
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody | null = null;
  collider: RAPIER.Collider | null = null;
  /** Static and standing (pieces cut off it become debris). */
  standing = true;
  name: string;

  constructor(poly: ConvexPoly, attrs: FacadeAttrs, mat: THREE.Material, name = '') {
    this.poly = poly;
    this.attrs = attrs;
    this.name = name;
    this.mesh = new THREE.Mesh(polyGeometry(poly, attrs), mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.building = this;
  }

  static fromSpec(s: BuildingSpec, mat: THREE.Material) {
    const y0 = s.y0 ?? 0;
    const poly = s.profile
      ? ConvexPoly.lathe(
          s.profile.map(([r, y]) => [r, y0 + y] as [number, number]),
          s.sides ?? 20,
          s.w / 2,
          s.d / 2,
        )
      : ConvexPoly.box(s.w / 2, s.d / 2, y0, y0 + s.h);
    const attrs: FacadeAttrs = {
      fac: [s.style, s.floor ?? 3.9, s.bay ?? (s.style === STYLE.CURTAIN ? 1.6 : 2.6), (seedN++ * 0.6180339) % 1],
      box: [s.w / 2, s.d / 2, y0 + s.h, y0],
      color: new THREE.Color(s.color),
      glass: new THREE.Color(s.glass ?? 0x6f8fb0),
    };
    const b = new Building(poly, attrs, mat, s.name ?? '');
    b.mesh.position.set(s.x, 0, s.z);
    b.mesh.rotation.y = s.rotY ?? 0;
    b.mesh.updateMatrixWorld();
    return b;
  }

  /** Fixed collider matching the polyhedron. */
  makeStatic(world: RAPIER.World, groups: number) {
    const m = this.mesh;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(m.position.x, m.position.y, m.position.z)
        .setRotation({ x: m.quaternion.x, y: m.quaternion.y, z: m.quaternion.z, w: m.quaternion.w }),
    );
    const pts = new Float32Array(this.poly.vertices().flatMap((v) => [v.x, v.y, v.z]));
    const desc = RAPIER.ColliderDesc.convexHull(pts);
    if (!desc) return;
    desc.setCollisionGroups(groups).setFriction(0.8).setRestitution(0.05);
    this.collider = world.createCollider(desc, body);
    this.body = body;
  }

  dispose(world: RAPIER.World | null) {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    if (world && this.body) world.removeRigidBody(this.body);
    this.body = null;
    this.collider = null;
  }
}
