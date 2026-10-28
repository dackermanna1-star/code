// Shared test room for render-lighting-* probes: 5 x 3 x 4 m box room built from boxes, south window opening,
// a few boxes inside, golden-hour sun from the SW.
import {
  Vector3, Color3, MeshBuilder, PBRMaterial, DirectionalLight, type Scene, type Mesh,
} from "@babylonjs/core";

export const ROOM = { w: 5, h: 3, d: 4, t: 0.2, win: { x0: 1.0, x1: 2.5, y0: 0.9, y1: 2.2 } };

/** Sun direction (from sun towards scene) for azimuth (deg from north, clockwise) and elevation (deg). Babylon LH: +X east, +Z north. */
export function sunDirection(azimuthDeg: number, elevationDeg: number): Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const toSun = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  return toSun.scale(-1).normalize();
}

export function makePbr(scene: Scene, name: string, rgb: [number, number, number], roughness = 0.9): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = new Color3(rgb[0], rgb[1], rgb[2]);
  m.metallic = 0;
  m.roughness = roughness;
  return m;
}

export interface Room { meshes: Mesh[]; casters: Mesh[]; floor: Mesh; props: Mesh[] }

export function buildRoom(scene: Scene): Room {
  const { w, h, d, t, win } = ROOM;
  const wallMat = makePbr(scene, "wall", [0.78, 0.74, 0.68]);
  const floorMat = makePbr(scene, "floorMat", [0.45, 0.3, 0.18], 0.7);
  const ceilMat = makePbr(scene, "ceil", [0.85, 0.85, 0.85]);
  const propMat = makePbr(scene, "prop", [0.35, 0.45, 0.6], 0.6);
  const propMat2 = makePbr(scene, "prop2", [0.7, 0.25, 0.2], 0.5);
  const meshes: Mesh[] = [];
  const box = (name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: PBRMaterial): Mesh => {
    const m = MeshBuilder.CreateBox(name, { width: x1 - x0, height: y1 - y0, depth: z1 - z0 }, scene);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.material = mat;
    meshes.push(m);
    return m;
  };
  const floor = box("floor", -t, w + t, -t, 0, -t, d + t, floorMat);
  box("ceiling", -t, w + t, h, h + t, -t, d + t, ceilMat);
  box("wallN", -t, w + t, 0, h, d, d + t, wallMat);
  box("wallW", -t, 0, 0, h, 0, d, wallMat);
  box("wallE", w, w + t, 0, h, 0, d, wallMat);
  // south wall (z in [-t,0]) with a window opening
  box("wallS_left", -t, win.x0, 0, h, -t, 0, wallMat);
  box("wallS_right", win.x1, w + t, 0, h, -t, 0, wallMat);
  box("wallS_below", win.x0, win.x1, 0, win.y0, -t, 0, wallMat);
  box("wallS_above", win.x0, win.x1, win.y1, h, -t, 0, wallMat);
  const props: Mesh[] = [];
  props.push(box("crate1", 0.6, 1.2, 0, 0.6, 2.0, 2.6, propMat));
  props.push(box("crate2", 1.2, 1.7, 0, 0.9, 3.0, 3.5, propMat2));
  props.push(box("table", 2.2, 3.2, 0.7, 0.75, 1.0, 1.6, propMat));
  props.push(box("tableLeg", 2.25, 2.3, 0, 0.7, 1.05, 1.1, propMat));
  props.push(box("tableLeg2", 3.1, 3.15, 0, 0.7, 1.5, 1.55, propMat));
  return { meshes, casters: meshes.slice(), floor, props };
}

/** Golden-hour sun. Places the light position upstream of the room centre (matters for shadow ortho projection). */
export function makeSun(scene: Scene, azimuthDeg = 225, elevationDeg = 20): DirectionalLight {
  const dir = sunDirection(azimuthDeg, elevationDeg);
  const sun = new DirectionalLight("sun", dir, scene);
  const centre = new Vector3(ROOM.w / 2, ROOM.h / 2, ROOM.d / 2);
  sun.position = centre.subtract(dir.scale(20));
  sun.diffuse = new Color3(1.0, 0.72, 0.45);
  sun.specular = new Color3(1.0, 0.72, 0.45);
  return sun;
}

/** Floor point lit through the window centre (ray along sun dir from window centre at height y). */
export function sunPatchPoint(dir: Vector3, y = 1.4): Vector3 {
  const { win } = ROOM;
  const start = new Vector3((win.x0 + win.x1) / 2, y, 0);
  const tHit = start.y / -dir.y;
  return start.add(dir.scale(tHit));
}
