// Probe: micro-debris rendering — thin instances (matrix + colour buffers) vs SolidParticleSystem,
// driven by the same JS ballistic simulation with floor collision. Measures per-frame CPU cost.
import { Mesh, MeshBuilder, StandardMaterial, SolidParticleSystem, Matrix, Quaternion, Color3, Color4, Vector3, type Scene } from "@babylonjs/core";
import { makeScene, stats, r3, renderUntil, gpuSync } from "./vfx-audio-util.ts";

// ------------------------------------------------------------------ ballistic sim (no physics bodies)
class DebrisSim {
  n = 0;
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly q: Float32Array; // quaternion xyzw
  readonly w: Float32Array; // angular velocity (rad/s)
  readonly s: Float32Array; // uniform scale (m)
  readonly col: Float32Array; // rgba
  readonly sleep: Uint8Array;
  readonly cap: number;
  constructor(cap: number) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.q = new Float32Array(cap * 4);
    this.w = new Float32Array(cap * 3);
    this.s = new Float32Array(cap);
    this.col = new Float32Array(cap * 4);
    this.sleep = new Uint8Array(cap);
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, r: number, g: number, b: number): number {
    if (this.n >= this.cap) return -1; // a real system would recycle the oldest
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.q.set([0, 0, 0, 1], i * 4);
    this.w.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30], i * 3);
    this.s[i] = size;
    this.col.set([r, g, b, 1], i * 4);
    this.sleep[i] = 0;
    return i;
  }
  step(dt: number, floorY: number): void {
    const { pos, vel, q, w, s, sleep } = this;
    const g = -9.81 * dt;
    for (let i = 0; i < this.n; i++) {
      if (sleep[i]) continue;
      const i3 = i * 3, i4 = i * 4;
      vel[i3 + 1] += g;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      const half = s[i] * 0.35;
      if (pos[i3 + 1] < floorY + half) {
        pos[i3 + 1] = floorY + half;
        if (vel[i3 + 1] < 0) vel[i3 + 1] = -vel[i3 + 1] * 0.3; // restitution
        vel[i3] *= 0.6; // friction on contact
        vel[i3 + 2] *= 0.6;
        w[i3] *= 0.5; w[i3 + 1] *= 0.5; w[i3 + 2] *= 0.5;
        if (vel[i3] * vel[i3] + vel[i3 + 1] * vel[i3 + 1] + vel[i3 + 2] * vel[i3 + 2] < 0.01) sleep[i] = 1;
      }
      // q += 0.5*dt*(omega (x) q), renormalise
      const wx = w[i3], wy = w[i3 + 1], wz = w[i3 + 2];
      const qx = q[i4], qy = q[i4 + 1], qz = q[i4 + 2], qw = q[i4 + 3];
      const h = 0.5 * dt;
      let nx = qx + h * (wx * qw + wy * qz - wz * qy);
      let ny = qy + h * (wy * qw + wz * qx - wx * qz);
      let nz = qz + h * (wz * qw + wx * qy - wy * qx);
      let nw = qw + h * (-wx * qx - wy * qy - wz * qz);
      const inv = 1 / Math.hypot(nx, ny, nz, nw);
      q[i4] = nx * inv; q[i4 + 1] = ny * inv; q[i4 + 2] = nz * inv; q[i4 + 3] = nw * inv;
    }
  }
}

/** Write compose(scale, quat, pos) into a Babylon (row-vector, translation at 12..14) matrix buffer. */
function writeMatrices(sim: DebrisSim, out: Float32Array): void {
  const { pos, q, s } = sim;
  for (let i = 0; i < sim.n; i++) {
    const i3 = i * 3, i4 = i * 4, o = i * 16;
    const x = q[i4], y = q[i4 + 1], z = q[i4 + 2], w = q[i4 + 3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sc = s[i];
    out[o] = (1 - (yy + zz)) * sc; out[o + 1] = (xy + wz) * sc; out[o + 2] = (xz - wy) * sc; out[o + 3] = 0;
    out[o + 4] = (xy - wz) * sc; out[o + 5] = (1 - (xx + zz)) * sc; out[o + 6] = (yz + wx) * sc; out[o + 7] = 0;
    out[o + 8] = (xz + wy) * sc; out[o + 9] = (yz - wx) * sc; out[o + 10] = (1 - (xx + yy)) * sc; out[o + 11] = 0;
    out[o + 12] = pos[i3]; out[o + 13] = pos[i3 + 1]; out[o + 14] = pos[i3 + 2]; out[o + 15] = 1;
  }
}

function makeShard(scene: Scene, name: string): Mesh {
  // flat-shaded tetrahedron squashed into a chip: 12 vertices, 4 triangles, proper normals
  const m = MeshBuilder.CreatePolyhedron(name, { type: 0, size: 0.5, flat: true }, scene);
  m.bakeTransformIntoVertices(Matrix.Scaling(1, 0.45, 0.8));
  return m;
}

function spawnBurst(sim: DebrisSim, count: number, cx: number, cz: number, rgb: [number, number, number]): void {
  for (let k = 0; k < count; k++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3;
    const c = 0.8 + Math.random() * 0.2;
    sim.spawn(cx, 1.2, cz, Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp, 0.015 + Math.random() * 0.03, rgb[0] * c, rgb[1] * c, rgb[2] * c);
  }
}

export async function probe(): Promise<any> {
  const { engine, scene, camera } = makeScene({ wall: false });
  camera.position.set(0, 2.2, -4.5);
  camera.setTarget(new Vector3(0, 0, 0.5));
  const out: any = {};
  engine.setHardwareScalingLevel(4);
  const frame = (): number => {
    const t0 = performance.now();
    scene.render();
    const ms = performance.now() - t0;
    gpuSync(engine);
    return ms;
  };

  const mat = new StandardMaterial("debrisMat", scene);
  mat.diffuseColor = Color3.White(); // instanceColor multiplies this
  mat.specularColor = new Color3(0.15, 0.15, 0.15);

  const results: any = {};
  for (const N of [2000, 5000]) {
    // identical sims for both renderers
    const simA = new DebrisSim(N);
    const simB = new DebrisSim(N);
    for (const sim of [simA, simB]) {
      Math.random = mulberry(1234); // same spawn sequence
      spawnBurst(sim, N / 2, -0.6, 0, [0.62, 0.45, 0.28]); // wood chips
      spawnBurst(sim, N / 2, 0.6, 0.6, [0.92, 0.92, 0.9]); // ceramic chips
    }
    Math.random = origRandom;

    // --- A) thin instances
    const ti = makeShard(scene, "tiShard" + N);
    ti.material = mat;
    const matBuf = new Float32Array(N * 16);
    const colBuf = new Float32Array(N * 4);
    colBuf.set(simA.col);
    writeMatrices(simA, matBuf);
    const tSet0 = performance.now();
    ti.thinInstanceSetBuffer("matrix", matBuf, 16, false); // false = dynamic GPU buffer (we update it every frame)
    ti.thinInstanceSetBuffer("color", colBuf, 4, false); // -> "instanceColor" attribute, multiplies diffuse
    const setBufferMs = performance.now() - tSet0;
    ti.alwaysSelectAsActiveMesh = true; // instances move -> skip frustum culling instead of refreshing bounds
    const tBI = performance.now();
    ti.thinInstanceRefreshBoundingInfo(false);
    const refreshBoundsMs = performance.now() - tBI;

    // --- B) SPS
    const shapeB = makeShard(scene, "spsModel" + N);
    const tBuild0 = performance.now();
    const sps = new SolidParticleSystem("sps" + N, scene, { updatable: true, isPickable: false });
    sps.addShape(shapeB, N);
    const spsMesh = sps.buildMesh();
    const buildMs = performance.now() - tBuild0;
    shapeB.dispose();
    spsMesh.material = mat;
    sps.isAlwaysVisible = true;
    sps.computeBoundingBox = false;
    sps.computeParticleTexture = false;
    for (let i = 0; i < N; i++) {
      const p = sps.particles[i];
      p.color = new Color4(simB.col[i * 4], simB.col[i * 4 + 1], simB.col[i * 4 + 2], 1);
      p.rotationQuaternion = new Quaternion();
    }
    sps.computeParticleColor = true;
    sps.setParticles(); // upload colours once
    sps.computeParticleColor = false; // colours are stored: skip per-frame colour work
    spsMesh.hasVertexAlpha = false;
    await renderUntil(scene, () => scene.isReady());

    const simMs: number[] = [], tiWrite: number[] = [], tiUpload: number[] = [], spsCopy: number[] = [], spsSet: number[] = [];
    const renderTi: number[] = [], renderSps: number[] = [];
    for (let f = 0; f < 90; f++) {
      let t = performance.now();
      simA.step(1 / 60, 0);
      simMs.push(performance.now() - t);
      simB.step(1 / 60, 0);
      // A
      t = performance.now();
      writeMatrices(simA, matBuf);
      tiWrite.push(performance.now() - t);
      t = performance.now();
      ti.thinInstanceCount = simA.n;
      ti.thinInstanceBufferUpdated("matrix");
      tiUpload.push(performance.now() - t);
      // B
      t = performance.now();
      const ps = sps.particles, P = simB.pos, Q = simB.q, S = simB.s;
      for (let i = 0; i < simB.n; i++) {
        const p = ps[i];
        p.position.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        p.rotationQuaternion!.set(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]);
        p.scaling.setAll(S[i]);
      }
      spsCopy.push(performance.now() - t);
      t = performance.now();
      sps.setParticles();
      spsSet.push(performance.now() - t);
      // render each alone
      spsMesh.setEnabled(false);
      ti.setEnabled(true);
      renderTi.push(frame());
      ti.setEnabled(false);
      spsMesh.setEnabled(true);
      renderSps.push(frame());
    }
    const asleep = simA.sleep.reduce((a, b) => a + b, 0);
    results["n" + N] = {
      verticesPerShard: ti.getTotalVertices(),
      spsTotalVertices: spsMesh.getTotalVertices(),
      simStepMs: stats(simMs),
      simStepFirst10Ms_allAwake: stats(simMs.slice(0, 10)),
      thinInstances: { writeMatricesMs: stats(tiWrite), bufferUpdatedMs: stats(tiUpload), renderMs: stats(renderTi), setBufferOnceMs: r3(setBufferMs), refreshBoundingInfoMs: r3(refreshBoundsMs) },
      sps: { copyToParticlesMs: stats(spsCopy), setParticlesMs: stats(spsSet), renderMs: stats(renderSps), buildMeshMs: r3(buildMs) },
      asleepAfter90Frames: asleep,
    };

    // capacity growth for thin instances: re-set a bigger buffer
    if (N === 5000) {
      const big = new Float32Array(N * 2 * 16);
      big.set(matBuf);
      const t = performance.now();
      ti.thinInstanceSetBuffer("matrix", big, 16, false);
      results.thinInstanceRegrow5000to10000Ms = r3(performance.now() - t);
      results.countAfterRegrow = ti.thinInstanceCount;
      ti.thinInstanceCount = N; // shrink the drawn count again (must be <= buffer capacity)
      results.countAfterSet = ti.thinInstanceCount;
      ti.thinInstanceCount = N * 3; // ignored: higher than buffer capacity
      results.countAfterTooBig = ti.thinInstanceCount;
    }
    if (N === 2000) {
      // keep these for the screenshot
      (out as any)._keep = { ti, spsMesh };
      ti.position.x = -1.3;
      spsMesh.position.x = 1.3;
    } else {
      ti.dispose();
      sps.dispose();
    }
  }
  out.results = results;

  // --- expandable SPS: runtime add / remove (each needs buildMesh(), which rebuilds the whole geometry)
  {
    const model = makeShard(scene, "xModel");
    const sps = new SolidParticleSystem("spsX", scene, { updatable: true, expandable: true, isPickable: false });
    sps.addShape(model, 2000);
    sps.buildMesh();
    let t = performance.now();
    sps.addShape(model, 100);
    const addShapeMs = performance.now() - t;
    t = performance.now();
    sps.buildMesh();
    const rebuildAfterAddMs = performance.now() - t;
    const nAfterAdd = sps.nbParticles;
    t = performance.now();
    sps.removeParticles(0, 99);
    const removeMs = performance.now() - t;
    t = performance.now();
    sps.buildMesh();
    const rebuildAfterRemoveMs = performance.now() - t;
    out.expandableSps = { addShape100Ms: r3(addShapeMs), buildMeshAfterAddMs: r3(rebuildAfterAddMs), nAfterAdd, removeParticles100Ms: r3(removeMs), buildMeshAfterRemoveMs: r3(rebuildAfterRemoveMs), nAfterRemove: sps.nbParticles };
    model.dispose();
    sps.dispose();
  }

  // screenshot frame: thin instances (left) and SPS (right) at full resolution
  const keep = (out as any)._keep as { ti: Mesh; spsMesh: Mesh };
  keep.ti.setEnabled(true);
  keep.spsMesh.setEnabled(true);
  delete (out as any)._keep;
  engine.setHardwareScalingLevel(1);
  for (let i = 0; i < 3; i++) frame();
  out.drawCallsHint = "1 draw call each (thin-instanced mesh / SPS mesh)";
  return out;
}

// tiny helpers
const origRandom = Math.random;
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
