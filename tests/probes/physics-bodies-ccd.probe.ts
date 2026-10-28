// Q10: tunneling of small fast bodies through thin slabs (no CCD API is exposed by the plugin)
import { Vector3, Quaternion, TransformNode, Mesh, VertexData, PhysicsBody, PhysicsMotionType, PhysicsShape, PhysicsShapeBox, PhysicsShapeSphere, PhysicsShapeMesh } from "@babylonjs/core";
import { makeWorld, stepN, r3 } from "./physics-bodies-util";

type SlabKind = "box5cm" | "box1cm" | "box6mm" | "meshPlane" | "dynamicDoor4cm" | "dynamicDoor10cm" | "animatedDoor4cm";

async function shoot(opts: { slab: SlabKind; projectile: "box2cm" | "sphere1cm" | "shard10x10x0.5cm" | "box30cm" | "box10cm"; speed: number; dt: number; spin?: number }) {
  const w = await makeWorld({ gravity: new Vector3(0, 0, 0) });
  const { scene } = w;
  const slabNode = new TransformNode("slab", scene);
  let slabShape: PhysicsShape;
  const thick = opts.slab === "box5cm" ? 0.05 : opts.slab === "box1cm" ? 0.01 : opts.slab === "box6mm" ? 0.006 : opts.slab === "dynamicDoor4cm" || opts.slab === "animatedDoor4cm" ? 0.04 : opts.slab === "dynamicDoor10cm" ? 0.1 : 0;
  if (opts.slab === "meshPlane") {
    const m = new Mesh("plane", scene);
    const vd = new VertexData();
    vd.positions = [0, -2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2];
    vd.indices = [0, 1, 2, 0, 2, 3];
    vd.applyToMesh(m);
    slabShape = new PhysicsShapeMesh(m, scene);
    m.dispose();
  } else {
    slabShape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(thick, 4, 4), scene);
  }
  const isDyn = opts.slab === "dynamicDoor4cm" || opts.slab === "dynamicDoor10cm";
  const slab = new PhysicsBody(slabNode, isDyn ? PhysicsMotionType.DYNAMIC : opts.slab === "animatedDoor4cm" ? PhysicsMotionType.ANIMATED : PhysicsMotionType.STATIC, false, scene);
  slab.shape = slabShape;
  if (isDyn) slab.setMassProperties({ mass: 20 });
  const pn = new TransformNode("proj", scene);
  pn.position.set(-3, 0.3, 0.2);
  const pb = new PhysicsBody(pn, PhysicsMotionType.DYNAMIC, false, scene);
  pb.shape = opts.projectile === "box2cm" ? new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.02, 0.02, 0.02), scene)
    : opts.projectile === "sphere1cm" ? new PhysicsShapeSphere(Vector3.Zero(), 0.01, scene)
    : opts.projectile === "box30cm" ? new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.3, 0.3, 0.3), scene)
    : opts.projectile === "box10cm" ? new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.1, 0.1, 0.1), scene)
    : new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.1, 0.1, 0.005), scene);
  if (opts.projectile !== "box30cm") pb.shape.density = 2500;
  pb.shape = pb.shape; // re-assign so the density is used for mass
  pb.setLinearVelocity(new Vector3(opts.speed, 0, 0));
  if (opts.spin) pb.setAngularVelocity(new Vector3(opts.spin, opts.spin * 0.7, 0));
  const steps = Math.ceil(0.5 / opts.dt);
  // tunneled = the projectile centre crossed the slab mid-plane within the slab's 4x4 m extent
  let tunneled = false;
  let prevRel = pn.position.x - slabNode.position.x;
  for (let i = 0; i < steps; i++) {
    stepN(scene, 1, opts.dt);
    const rel = pn.position.x - slabNode.position.x;
    const inside = Math.abs(pn.position.y - slabNode.position.y) < 2 && Math.abs(pn.position.z - slabNode.position.z) < 2;
    if (prevRel < 0 && rel > 0 && inside) tunneled = true;
    prevRel = rel;
  }
  const x = pn.position.x;
  const res = { tunneled, x: r3(x), vx: r3(pb.getLinearVelocity().x) };
  w.engine.dispose();
  return res;
}

export async function probe() {
  const out: Record<string, unknown> = {};
  const speeds = [5, 10, 20, 30, 60, 100, 200];
  for (const slab of ["box5cm", "box1cm", "box6mm", "meshPlane", "dynamicDoor4cm"] as SlabKind[]) {
    for (const projectile of ["box2cm", "sphere1cm", "shard10x10x0.5cm", "box30cm"] as const) {
      const row: Record<string, string> = {};
      for (const speed of speeds) {
        const r60 = await shoot({ slab, projectile, speed, dt: 1 / 60, spin: projectile === "shard10x10x0.5cm" ? 40 : 0 });
        row["v" + speed] = r60.tunneled ? "TUNNEL" : "stop";
      }
      out[`${slab}__${projectile}__60Hz`] = row;
    }
  }
  // substepping effect on the worst case found at 60 Hz
  const cases = [
    { slab: "dynamicDoor4cm" as SlabKind, projectile: "box2cm" as const, spin: 0 },
    { slab: "dynamicDoor4cm" as SlabKind, projectile: "box30cm" as const, spin: 0 },
    { slab: "box6mm" as SlabKind, projectile: "shard10x10x0.5cm" as const, spin: 40 },
    { slab: "box5cm" as SlabKind, projectile: "shard10x10x0.5cm" as const, spin: 40 },
  ];
  for (const c of [
    { slab: "animatedDoor4cm" as SlabKind, projectile: "box2cm" as const },
    { slab: "dynamicDoor10cm" as SlabKind, projectile: "box2cm" as const },
    { slab: "dynamicDoor4cm" as SlabKind, projectile: "box10cm" as const },
    { slab: "dynamicDoor10cm" as SlabKind, projectile: "box10cm" as const },
  ]) {
    const row: Record<string, string> = {};
    for (const speed of speeds) {
      const r = await shoot({ slab: c.slab, projectile: c.projectile, speed, dt: 1 / 60 });
      row["v" + speed] = r.tunneled ? "TUNNEL" : "stop";
    }
    out[`${c.slab}__${c.projectile}__60Hz`] = row;
  }
  for (const c of cases) {
    for (const dt of [1 / 120, 1 / 240]) {
      const row: Record<string, string> = {};
      for (const speed of speeds) {
        const r = await shoot({ slab: c.slab, projectile: c.projectile, speed, dt, spin: c.spin });
        row["v" + speed] = r.tunneled ? "TUNNEL" : "stop";
      }
      out[`${c.slab}__${c.projectile}__${Math.round(1 / dt)}Hz`] = row;
    }
  }
  return out;
}
