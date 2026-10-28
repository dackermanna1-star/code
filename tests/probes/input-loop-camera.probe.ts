// First-person camera driven manually (no attachControl): defaults, Euler conventions, roll, pitch
// singularity, same-frame pose updates, parenting (shake rig), forward ray, rotationQuaternion.
import {
  Engine, Scene, Vector3, Quaternion, FreeCamera, UniversalCamera, TransformNode, MeshBuilder, HemisphericLight, Matrix,
} from "@babylonjs/core";
import { r } from "./input-loop-util.ts";

const v = (x: Vector3) => [r(x.x, 3), r(x.y, 3), r(x.z, 3)];

export async function probe() {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, false);
  const scene = new Scene(engine);
  new HemisphericLight("h", new Vector3(0, 1, 0), scene);
  MeshBuilder.CreateBox("b", { size: 1 }, scene);
  const out: Record<string, unknown> = {};

  const free = new FreeCamera("free", new Vector3(0, 1.6, 0), scene);
  const uni = new UniversalCamera("uni", new Vector3(0, 1.6, 0), scene);
  out.defaults = {
    minZ: free.minZ,
    maxZ: free.maxZ,
    fovRad: free.fov,
    fovMode: free.fovMode === FreeCamera.FOVMODE_VERTICAL_FIXED ? "VERTICAL_FIXED" : free.fovMode,
    inertia: free.inertia,
    speed: free.speed,
    layerMask: "0x" + free.layerMask.toString(16),
    freeInputs: Object.keys(free.inputs.attached),
    universalInputs: Object.keys(uni.inputs.attached),
    activeCameraIsFirstCreated: scene.activeCamera === free,
    rotationQuaternionDefault: free.rotationQuaternion ?? null,
    upVector: v(free.upVector),
  };
  uni.inputs.clear();
  out.universalInputsAfterClear = Object.keys(uni.inputs.attached);

  // Euler conventions (left-handed, +Z forward, +Y up)
  const cam = free;
  const dir = () => v(cam.getDirection(Vector3.Forward()));
  const conv: Record<string, unknown> = {};
  cam.rotation.set(0, 0, 0);
  scene.render();
  conv.yaw0 = dir();
  cam.rotation.set(0, Math.PI / 2, 0);
  scene.render();
  conv.yawPlus90 = dir();
  cam.rotation.set(Math.PI / 6, 0, 0);
  scene.render();
  conv.pitchPlus30 = dir();
  cam.rotation.set(0, 0, 0.2);
  scene.render();
  conv.rollPlus0_2_upVector = v(cam.upVector);
  conv.rollPlus0_2_cameraUp = v(cam.getDirection(Vector3.Up()));
  cam.rotation.set(0, 0, 0);
  scene.render();
  conv.rollBack0_upVector = v(cam.upVector);
  out.eulerConventions = conv;

  // pitch singularity
  const sing: Record<string, unknown> = {};
  for (const p of [Math.PI / 2 - 0.001, Math.PI / 2, Math.PI / 2 + 0.2]) {
    cam.rotation.set(p, 0.3, 0);
    const m = cam.getViewMatrix(true);
    sing["pitch_" + r(p, 4)] = { finite: m.m.every((x) => Number.isFinite(x)), forward: dir(), up: v(cam.getDirection(Vector3.Up())) };
  }
  out.pitchSingularity = sing;
  cam.rotation.set(0, 0, 0);

  // pose set inside onBeforeRenderObservable is used for the same frame
  const target = new Vector3(3, 2, -4);
  let seenInAfterRender: number[] = [];
  const o1 = scene.onBeforeRenderObservable.add(() => {
    cam.position.copyFrom(target);
    cam.rotation.set(0.1, 1.0, 0);
  });
  const o2 = scene.onAfterRenderObservable.add(() => {
    const inv = scene.getViewMatrix().clone().invert();
    seenInAfterRender = v(inv.getTranslation());
  });
  scene.render();
  scene.onBeforeRenderObservable.remove(o1);
  scene.onAfterRenderObservable.remove(o2);
  out.poseSetInOnBeforeRender_usedSameFrame = { eyeFromSceneViewMatrix: seenInAfterRender, expected: v(target) };

  // parented camera (shake rig): head node carries the base pose, camera carries local shake offsets
  const head = new TransformNode("head", scene);
  head.position.set(1, 1.7, 2);
  head.rotation.set(0, Math.PI / 2, 0); // parent with Euler rotation
  const shakeCam = new FreeCamera("shakeCam", Vector3.Zero(), scene, false);
  shakeCam.parent = head;
  shakeCam.position.set(0.02, -0.01, 0);
  shakeCam.rotation.set(0.01, -0.02, 0.03);
  scene.activeCamera = shakeCam;
  scene.render();
  out.parentedCamera = {
    globalPosition: v(shakeCam.globalPosition),
    forward: v(shakeCam.getDirection(Vector3.Forward())),
    note: "global = head pose * local offset",
  };
  scene.activeCamera = cam;

  // forward ray
  cam.position.set(0, 1.6, 0);
  cam.rotation.set(0, Math.PI / 4, 0);
  scene.render();
  const ray = cam.getForwardRay(2);
  out.forwardRay = { origin: v(ray.origin), direction: v(ray.direction), length: ray.length };
  const front = cam.getFrontPosition(2);
  out.getFrontPosition2 = v(front);

  // rotationQuaternion overrides rotation
  cam.rotation.set(0, 0, 0);
  cam.rotationQuaternion = Quaternion.RotationYawPitchRoll(-Math.PI / 2, 0, 0);
  scene.render();
  out.rotationQuaternion = { forward: dir(), eulerIgnored: v(cam.rotation) };
  cam.rotationQuaternion = null as unknown as Quaternion;
  scene.render();
  out.rotationQuaternionClearedForward = dir();

  // projection: fov/minZ/maxZ changes picked up without extra calls
  cam.fov = (75 * Math.PI) / 180;
  cam.minZ = 0.05;
  cam.maxZ = 300;
  scene.render();
  const P = cam.getProjectionMatrix();
  out.projection = { m00: r(P.m[0], 4), m11: r(P.m[5], 4), expected_m11_1_over_tan_half_fov: r(1 / Math.tan(cam.fov / 2), 4) };

  // per-frame cost of setting pose + render with nothing else (sanity)
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) {
    cam.position.set(Math.sin(i), 1.6, Math.cos(i));
    cam.rotation.set(0.1 * Math.sin(i), i * 0.01, 0);
    cam.getViewMatrix(); // lazily recomputed
  }
  out.setPose_getViewMatrix_us = r(((performance.now() - t0) / 200) * 1000, 2);
  void Matrix;
  engine.dispose();
  return out;
}
