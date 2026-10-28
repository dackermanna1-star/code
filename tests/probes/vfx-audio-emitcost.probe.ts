// Probe: per-particle CPU cost of ParticleSystem emission and update, by feature set (repeated, medians).
import { ParticleSystem, DynamicTexture, Vector3, Color4, type Matrix, type Particle, type Scene } from "@babylonjs/core";
import { makeScene, stats, r3, renderUntil, gpuSync } from "./vfx-audio-util.ts";

function puffTex(scene: Scene): DynamicTexture {
  const t = new DynamicTexture("p", { width: 32, height: 32 }, scene, true);
  const c = t.getContext();
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  t.hasAlpha = true;
  t.update();
  return t;
}

type Variant = "default" | "customFns" | "customFns+drag" | "customFns+drag+colorGrad+sizeGrad";

export async function probe(): Promise<any> {
  const { engine, scene } = makeScene({ floor: false });
  engine.setHardwareScalingLevel(8);
  const tex = puffTex(scene);
  const out: any = {};
  // machine speed reference: 1e7 multiply-adds in plain JS
  {
    const t0 = performance.now();
    let acc = 0;
    for (let i = 0; i < 1e7; i++) acc = acc * 0.999999 + i * 1e-9;
    out.ref1e7MaddMs = r3(performance.now() - t0);
    out._acc = acc > 0;
  }
  const N = 2000;
  const variants: Variant[] = ["default", "customFns", "customFns+drag", "customFns+drag+colorGrad+sizeGrad"];
  for (const v of variants) {
    const ps = new ParticleSystem("bench-" + v, N, scene);
    ps.particleTexture = tex;
    ps.emitter = new Vector3(0, -100, 0);
    ps.manualEmitCount = 0;
    ps.minLifeTime = ps.maxLifeTime = 1000;
    ps.gravity = new Vector3(0, -9.81, 0);
    if (v !== "default") {
      let k = 0;
      ps.startPositionFunction = (_m: Matrix, pos: Vector3, p: Particle) => {
        k++;
        pos.set(Math.random(), -100 + Math.random(), Math.random());
        ps.color1.set(0.5, 0.5, 0.5, 1);
        p.metadata = k;
      };
      ps.startDirectionFunction = (_m: Matrix, d: Vector3) => d.set(Math.random() - 0.5, 1, Math.random() - 0.5);
    }
    if (v.includes("drag")) {
      ps.addDragGradient(0, 0.05);
      ps.addDragGradient(1, 0.1);
    }
    if (v.includes("colorGrad")) {
      ps.addColorGradient(0, new Color4(1, 1, 1, 1));
      ps.addColorGradient(1, new Color4(1, 1, 1, 0));
      ps.addSizeGradient(0, 0.1);
      ps.addSizeGradient(1, 0.4);
    }
    ps.updateSpeed = 1 / 60;
    ps.start();
    await renderUntil(scene, () => ps.isReady());
    const emitT: number[] = [];
    const updT: number[] = [];
    let last = 0;
    const orig = ps.animate.bind(ps);
    ps.animate = (pre?: boolean) => {
      const t0 = performance.now();
      orig(pre);
      last = performance.now() - t0;
    };
    for (let rep = 0; rep < 8; rep++) {
      ps.manualEmitCount = N;
      scene.render();
      gpuSync(engine);
      emitT.push(last);
      for (let f = 0; f < 10; f++) {
        scene.render();
        gpuSync(engine);
        updT.push(last);
      }
      // kill everything (recycled into the stock for the next rep)
      for (const p of ps.particles) p.lifeTime = 0;
      scene.render();
      gpuSync(engine);
    }
    const e = stats(emitT.slice(1)); // rep 0 = fresh allocation, others recycled
    const u = stats(updT);
    out[v] = {
      firstEmitMs_alloc: r3(emitT[0]),
      emitMs_recycled: e,
      emitUsPerParticle: r3((e.med * 1000) / N),
      updateMs: u,
      updateUsPerParticle: r3((u.med * 1000) / N),
    };
    ps.dispose(false);
  }
  return out;
}
