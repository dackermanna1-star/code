// Probe: CPU ParticleSystem semantics + pooled multi-position bursts + GPU particles support.
import {
  ParticleSystem,
  GPUParticleSystem,
  CustomParticleEmitter,
  DynamicTexture,
  Vector3,
  Color4,
  Scene,
  type BaseTexture,
  type Particle,
  type Matrix,
} from "@babylonjs/core";
import { makeScene, stats, r3, renderUntil, tick, gpuSync } from "./vfx-audio-util.ts";

// ---------------------------------------------------------------- textures (canvas -> DynamicTexture)
function makePuffTexture(scene: Scene, size = 64): DynamicTexture {
  const tex = new DynamicTexture("puffTex", { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

/** Thin vertical streak (texture V axis = particle direction in BILLBOARDMODE_STRETCHED). */
function makeStreakTexture(scene: Scene, w = 16, h = 64): DynamicTexture {
  const tex = new DynamicTexture("streakTex", { width: w, height: h }, scene, true);
  const ctx = tex.getContext();
  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h * 2 - 1; // -1..1 along the streak
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w * 2 - 1;
      const a = Math.exp(-(u * u) / 0.08) * Math.max(0, 1 - v * v);
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

// ---------------------------------------------------------------- SI-unit time hook
/** Make every pooled system advance exactly `gameDt()` seconds per rendered frame:
 *  ThinParticleSystem multiplies updateSpeed by scene.getAnimationRatio(), so divide it out. */
function installParticleClock(scene: Scene, systems: ParticleSystem[], gameDt: () => number): void {
  scene.onBeforeParticlesRenderingObservable.add(() => {
    const ratio = scene.getAnimationRatio();
    const s = gameDt() / ratio;
    for (const ps of systems) ps.updateSpeed = s;
  });
}

// ---------------------------------------------------------------- pooled burst system
export interface Burst {
  x: number; y: number; z: number; // world position
  nx: number; ny: number; nz: number; // surface normal (unit)
  count: number;
  speed: number; // m/s
  spread: number; // 0 = along normal, 1 = wide hemisphere
  radius: number; // spawn sphere radius (m)
  r: number; g: number; b: number; a: number; // tint (start colour)
  sizeMul: number;
}

export class BurstPool {
  readonly ps: ParticleSystem;
  private queue: Burst[] = [];
  private cur = 0;
  private left = 0;
  private active: Burst | null = null;
  emitted = 0;
  dropped = 0;
  /** scaleY multiplier (streak length for BILLBOARDMODE_STRETCHED). */
  stretch = 1;

  constructor(name: string, capacity: number, scene: Scene, texture: BaseTexture) {
    const ps = new ParticleSystem(name, capacity, scene);
    ps.particleTexture = texture;
    ps.emitter = Vector3.Zero(); // identity emitter matrix -> start functions write WORLD coords
    ps.manualEmitCount = 0; // manual mode (>-1): emitRate is ignored, only queued bursts emit
    ps.minEmitPower = 1;
    ps.maxEmitPower = 1; // direction function writes the full velocity (m/s with the clock hook)
    ps.startPositionFunction = (_wm: Matrix, pos: Vector3, p: Particle) => {
      const b = this.next();
      if (!b) {
        pos.set(0, -1e4, 0);
        p.lifeTime = 0;
        return;
      }
      // random point in a sphere of radius b.radius, pushed off the surface along the normal
      const r = b.radius * Math.cbrt(Math.random());
      const [ux, uy, uz] = randUnit();
      pos.set(b.x + ux * r + b.nx * b.radius, b.y + uy * r + b.ny * b.radius, b.z + uz * r + b.nz * b.radius);
      // creation queue order: lifetime -> position -> direction -> emitPower -> size -> angle -> color -> colorDead,
      // so system-level fields mutated HERE are picked up by the later steps for this particle only.
      ps.color1.set(b.r, b.g, b.b, b.a);
      ps.color2.set(b.r * 0.85, b.g * 0.85, b.b * 0.85, b.a);
      ps.colorDead.set(b.r, b.g, b.b, 0);
      ps.minScaleX = ps.maxScaleX = b.sizeMul;
      ps.minScaleY = ps.maxScaleY = b.sizeMul * this.stretch;
      p.metadata = b; // copied by recycleParticle's swap (Particle.copyTo copies metadata)
    };
    ps.startDirectionFunction = (_wm: Matrix, dir: Vector3) => {
      const b = this.active;
      if (!b) return;
      const [ux, uy, uz] = randUnit();
      let dx = b.nx + ux * b.spread;
      let dy = b.ny + uy * b.spread;
      let dz = b.nz + uz * b.spread;
      const len = Math.hypot(dx, dy, dz) || 1;
      const sp = b.speed * (0.35 + 0.65 * Math.random());
      dir.set((dx / len) * sp, (dy / len) * sp, (dz / len) * sp);
    };
    ps.start();
    this.ps = ps;
    // Clear the queue once the system consumed it (animate() sets manualEmitCount back to 0).
    scene.onAfterParticlesRenderingObservable.add(() => {
      if (ps.manualEmitCount === 0) {
        this.dropped += this.remaining();
        this.queue.length = 0;
        this.cur = 0;
        this.left = 0;
        this.active = null;
      }
    });
  }

  burst(b: Burst): void {
    this.queue.push(b);
    this.ps.manualEmitCount += b.count;
  }

  private remaining(): number {
    let n = this.left;
    for (let i = this.cur; i < this.queue.length; i++) n += this.queue[i].count;
    return n;
  }

  private next(): Burst | null {
    while (this.left <= 0) {
      if (this.cur >= this.queue.length) return null;
      this.active = this.queue[this.cur++];
      this.left = this.active.count;
    }
    this.left--;
    this.emitted++;
    return this.active;
  }
}

function randUnit(): [number, number, number] {
  const z = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(t), s * Math.sin(t), z];
}

function wrapAnimateTimer(ps: { animate(p?: boolean): void }, sink: number[]): void {
  const orig = ps.animate.bind(ps);
  ps.animate = (pre?: boolean) => {
    const t0 = performance.now();
    orig(pre);
    sink.push(performance.now() - t0);
  };
}

export async function probe(): Promise<any> {
  const { engine, scene } = makeScene({ wall: true });
  const out: any = {};
  engine.setHardwareScalingLevel(4); // 320x180 backbuffer while measuring (SwiftShader fill cost); 1 for the final screenshot
  const frame = (): number => {
    const t0 = performance.now();
    scene.render();
    const ms = performance.now() - t0;
    gpuSync(engine); // drain the GPU queue outside the timed region
    return ms;
  };
  const puff = makePuffTexture(scene);
  const streak = makeStreakTexture(scene);
  let dt = 1 / 60;
  const clocked: ParticleSystem[] = [];
  installParticleClock(scene, clocked, () => dt);
  const ratios: number[] = [];
  scene.onBeforeParticlesRenderingObservable.add(() => ratios.push(scene.getAnimationRatio()));

  // warm-up: wait until the floor/wall materials are compiled
  out.sceneReady = await renderUntil(scene, () => scene.isReady());

  // ------------------------------------------------ 1) SI units check (single ballistic particle)
  const unit = new ParticleSystem("unit", 4, scene);
  unit.particleTexture = puff;
  unit.emitter = Vector3.Zero();
  unit.manualEmitCount = 0;
  unit.minEmitPower = unit.maxEmitPower = 5;
  unit.minLifeTime = unit.maxLifeTime = 100;
  unit.gravity = new Vector3(0, -9.81, 0);
  unit.startPositionFunction = (_wm: Matrix, pos: Vector3) => pos.set(0, 0, 0);
  unit.startDirectionFunction = (_wm: Matrix, d: Vector3) => d.set(0, 1, 0);
  unit.start();
  clocked.push(unit);
  out.firstSystemReady = await renderUntil(scene, () => unit.isReady()); // dynamic shader import + compile
  unit.manualEmitCount = 1;
  frame(); // creation frame (new particles are created after the update pass -> no motion this frame)
  const ys: number[] = [];
  for (let i = 0; i < 60; i++) {
    frame();
    ys.push(unit.particles[0]?.position.y ?? NaN);
  }
  const N = 60, h = 1 / 60;
  out.siUnits = {
    yAfter60: r3(ys[59]),
    expectedSemiImplicit: r3(5 * N * h - 9.81 * h * h * (N * (N - 1)) / 2),
    expectedExact: r3(5 * 1 - 0.5 * 9.81),
    age: r3(unit.particles[0]?.age ?? NaN),
    animationRatioSeen: r3(ratios[ratios.length - 1]),
    updateSpeedSet: r3(unit.updateSpeed),
  };
  unit.dispose(false);
  clocked.length = 0;

  // ------------------------------------------------ 2) pooled bursts at 3 places in ONE frame
  const dust = new BurstPool("dustPool", 3000, scene, puff);
  dust.ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  dust.ps.minLifeTime = 1.2;
  dust.ps.maxLifeTime = 2.4;
  dust.ps.minSize = 0.12;
  dust.ps.maxSize = 0.35;
  dust.ps.minAngularSpeed = -1;
  dust.ps.maxAngularSpeed = 1;
  dust.ps.minInitialRotation = 0;
  dust.ps.maxInitialRotation = Math.PI * 2;
  dust.ps.gravity = new Vector3(0, -0.6, 0); // dust: light gravity + drag
  dust.ps.addDragGradient(0, 0.04);
  dust.ps.addDragGradient(1, 0.08);
  clocked.push(dust.ps);

  const sparks = new BurstPool("sparkPool", 1000, scene, streak);
  sparks.ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  sparks.ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
  sparks.stretch = 6;
  sparks.ps.minLifeTime = 0.25;
  sparks.ps.maxLifeTime = 0.6;
  sparks.ps.minSize = 0.03;
  sparks.ps.maxSize = 0.05;
  sparks.ps.gravity = new Vector3(0, -9.81, 0);
  sparks.ps.addColorGradient(0, new Color4(1, 1, 0.9, 1));
  sparks.ps.addColorGradient(0.4, new Color4(1, 0.75, 0.3, 1));
  sparks.ps.addColorGradient(1, new Color4(0.8, 0.2, 0.05, 0));
  clocked.push(sparks.ps);

  out.poolsReady = await renderUntil(scene, () => dust.ps.isReady() && sparks.ps.isReady());
  const base = { speed: 1.6, spread: 0.9, radius: 0.08, a: 0.9, sizeMul: 1 };
  const dcBefore = engine._drawCalls.current;
  // three different places + tints, queued in the same frame
  dust.burst({ ...base, x: -2.2, y: 0, z: 0, nx: 0, ny: 1, nz: 0, count: 400, r: 0.62, g: 0.48, b: 0.33 }); // wood (brown)
  dust.burst({ ...base, x: 0, y: 1.6, z: 1.98, nx: 0, ny: 0, nz: -1, count: 400, r: 0.95, g: 0.95, b: 0.93, sizeMul: 1.5 }); // drywall (white)
  dust.burst({ ...base, x: 2.2, y: 0, z: 0, nx: 0, ny: 1, nz: 0, count: 400, r: 0.55, g: 0.56, b: 0.58 }); // concrete (grey)
  const sp = { speed: 6, spread: 0.7, radius: 0.01, a: 1, sizeMul: 1, r: 1, g: 1, b: 1, count: 120 };
  sparks.burst({ ...sp, x: -0.9, y: 0.6, z: 1.98, nx: 0, ny: 0, nz: -1 });
  sparks.burst({ ...sp, x: 1.0, y: 1.0, z: 1.98, nx: 0, ny: 0, nz: -1 });
  const emitFrameMs = frame();
  const groups = new Map<Burst, { n: number; sx: number; sy: number; sz: number }>();
  for (const p of dust.ps.particles) {
    const b = p.metadata as Burst;
    const g = groups.get(b) ?? { n: 0, sx: 0, sy: 0, sz: 0 };
    g.n++;
    g.sx += p.position.x;
    g.sy += p.position.y;
    g.sz += p.position.z;
    groups.set(b, g);
  }
  out.pooledBursts = {
    emittedThisFrame: dust.ps.getActiveCount(),
    sparkCount: sparks.ps.getActiveCount(),
    manualEmitCountAfter: dust.ps.manualEmitCount,
    groups: [...groups.entries()].map(([b, g]) => ({ at: [b.x, b.y, b.z], n: g.n, centroid: [r3(g.sx / g.n), r3(g.sy / g.n), r3(g.sz / g.n)] })),
    firstParticleColor: dust.ps.particles[0] ? [r3(dust.ps.particles[0].color.r), r3(dust.ps.particles[0].color.g), r3(dust.ps.particles[0].color.b), r3(dust.ps.particles[0].color.a)] : null,
    drawCallsEmitFrame: engine._drawCalls.current - dcBefore,
    emitFrameRenderMs: r3(emitFrameMs),
  };
  // advance 0.25 s so the screenshot shows developed puffs
  for (let i = 0; i < 15; i++) frame();
  out.pooledBursts.after15Frames = { dust: dust.ps.getActiveCount(), sparks: sparks.ps.getActiveCount(), dropped: dust.dropped };

  // capacity overflow: queue more than capacity -> excess dropped, queue cleared
  const cap = new BurstPool("capPool", 100, scene, puff);
  clocked.push(cap.ps);
  await renderUntil(scene, () => cap.ps.isReady());
  cap.burst({ ...base, x: 0, y: -5, z: 0, nx: 0, ny: 1, nz: 0, count: 80, r: 1, g: 1, b: 1 });
  cap.burst({ ...base, x: 0, y: -5, z: 0, nx: 0, ny: 1, nz: 0, count: 80, r: 1, g: 1, b: 1 });
  frame();
  out.capacityOverflow = { active: cap.ps.getActiveCount(), dropped: cap.dropped, manualEmitCount: cap.ps.manualEmitCount };
  cap.ps.dispose(false);
  clocked.splice(clocked.indexOf(cap.ps), 1);

  // ------------------------------------------------ 3) CPU cost of animate() with N live particles
  const perf: any = {};
  for (const n of [2000, 5000]) {
    const stress = new BurstPool("stress" + n, n, scene, puff);
    stress.ps.minLifeTime = stress.ps.maxLifeTime = 100;
    stress.ps.gravity = new Vector3(0, -0.5, 0);
    stress.ps.addDragGradient(0, 0.02);
    stress.ps.addDragGradient(1, 0.02);
    clocked.push(stress.ps);
    await renderUntil(scene, () => stress.ps.isReady());
    stress.burst({ ...base, x: 0, y: -50, z: 0, nx: 0, ny: 1, nz: 0, count: n, r: 1, g: 1, b: 1 }); // off-screen
    const createMs = frame();
    const sink: number[] = [];
    wrapAnimateTimer(stress.ps, sink);
    const tR: number[] = [];
    for (let i = 0; i < 60; i++) tR.push(frame());
    // kill all, then emit again: particles now come from the recycled stock (no allocation)
    stress.ps.minLifeTime = stress.ps.maxLifeTime = 0.001;
    for (const p of stress.ps.particles) p.lifeTime = 0.001;
    frame();
    const deadCount = stress.ps.getActiveCount();
    stress.ps.minLifeTime = stress.ps.maxLifeTime = 100;
    stress.burst({ ...base, x: 0, y: -50, z: 0, nx: 0, ny: 1, nz: 0, count: n, r: 1, g: 1, b: 1 });
    const nBefore = sink.length;
    frame();
    const recycledEmitAnimateMs = sink[nBefore];
    perf["n" + n] = {
      active: stress.ps.getActiveCount(),
      animateMs: stats(sink.slice(0, 60)),
      renderFrameMs: stats(tR),
      firstEmitFrameMs_freshAlloc: r3(createMs),
      deadCountBeforeReemit: deadCount,
      reEmitAnimateMs_recycled: r3(recycledEmitAnimateMs),
    };
    stress.ps.dispose(false);
    clocked.splice(clocked.indexOf(stress.ps), 1);
  }
  out.cpuAnimateCost = perf;

  // ------------------------------------------------ 4) many one-shot systems vs one pool (same 30 x 60 particles)
  {
    const oneShotTex = makePuffTexture(scene); // SEPARATE texture: disposeOnStop -> scene calls ps.dispose() -> disposeTexture=true!
    const dc0 = engine._drawCalls.current;
    const t0 = performance.now();
    const systems: ParticleSystem[] = [];
    for (let i = 0; i < 30; i++) {
      const ps = new ParticleSystem("oneShot" + i, 60, scene);
      ps.particleTexture = oneShotTex;
      ps.emitter = new Vector3(-3 + i * 0.2, -20, 0);
      ps.manualEmitCount = 60;
      ps.minLifeTime = ps.maxLifeTime = 1;
      ps.disposeOnStop = true; // animate(): manualEmitCount===0 && disposeOnStop -> stop(); disposed when all dead
      ps.start();
      systems.push(ps);
      clocked.push(ps);
    }
    const createMs = performance.now() - t0;
    const readyNoYield = systems.filter((s) => s.isReady()).length;
    await tick();
    const readyAfterOneTick = systems.filter((s) => s.isReady()).length;
    const dcA = engine._drawCalls.current;
    const firstFrameMs = frame();
    const dcFrame = engine._drawCalls.current - dcA;
    const tF: number[] = [];
    for (let i = 0; i < 20; i++) tF.push(frame());
    let frames = 21;
    while (systems.some((s) => !s.isDisposed) && frames < 200) {
      frame();
      frames++;
    }
    out.manySystems = {
      count: 30,
      readyWithoutYield: readyNoYield,
      readyAfterOneTick,
      constructMs: r3(createMs),
      firstFrameMs: r3(firstFrameMs),
      drawCallsFirstFrame: dcFrame,
      steadyFrameMs: stats(tF),
      allDisposedAfterFrames: frames,
      allDisposed: systems.every((s) => s.isDisposed),
      inSceneList: scene.particleSystems.filter((s) => s.name.startsWith("oneShot")).length,
      sharedTextureWasDisposed: oneShotTex.getInternalTexture() === null,
      puffStillAlive: puff.getInternalTexture() !== null,
    };
    for (const s of systems) clocked.splice(clocked.indexOf(s), 1);

    // same work through ONE pooled system
    const pool30 = new BurstPool("pool30", 2000, scene, puff);
    pool30.ps.minLifeTime = pool30.ps.maxLifeTime = 1;
    clocked.push(pool30.ps);
    await renderUntil(scene, () => pool30.ps.isReady());
    const tq0 = performance.now();
    for (let i = 0; i < 30; i++) pool30.burst({ ...base, x: -3 + i * 0.2, y: -20, z: 0, nx: 0, ny: 1, nz: 0, count: 60, r: 1, g: 1, b: 1 });
    const queueMs = performance.now() - tq0;
    const dcB = engine._drawCalls.current;
    const poolFirst = frame();
    const dcPool = engine._drawCalls.current - dcB;
    const tP: number[] = [];
    for (let i = 0; i < 20; i++) tP.push(frame());
    out.onePool = { active: pool30.ps.getActiveCount(), queueMs: r3(queueMs), firstFrameMs: r3(poolFirst), drawCallsFirstFrame: dcPool, steadyFrameMs: stats(tP) };
    pool30.ps.dispose(false); // false = keep the shared texture
    clocked.splice(clocked.indexOf(pool30.ps), 1);

    // safe one-shot: no disposeOnStop; dispose(false) ourselves after the frame
    const safe = new ParticleSystem("safeOneShot", 60, scene);
    safe.particleTexture = puff;
    safe.emitter = new Vector3(0, -20, 0);
    safe.manualEmitCount = 60;
    safe.minLifeTime = safe.maxLifeTime = 0.3;
    const toDispose: ParticleSystem[] = [];
    safe.onAnimationEnd = () => toDispose.push(safe); // fired inside animate() once stopped && no particle alive
    const obs = scene.onAfterRenderObservable.add(() => {
      for (const ps of toDispose) ps.dispose(false);
      toDispose.length = 0;
    });
    safe.start();
    clocked.push(safe);
    await renderUntil(scene, () => safe.isReady());
    let sf = 0;
    while (!safe.isDisposed && sf < 120) {
      if (sf === 2) safe.stop(); // stop emitting; onAnimationEnd fires when the last particle died
      frame();
      sf++;
    }
    scene.onAfterRenderObservable.remove(obs);
    out.safeOneShot = { disposedAfterFrames: sf, isDisposed: safe.isDisposed, puffStillAlive: puff.getInternalTexture() !== null };
    clocked.splice(clocked.indexOf(safe), 1);
  }

  // ------------------------------------------------ 5) targetStopDuration (+ preWarm) on an emitRate system
  {
    const smokeTex = makePuffTexture(scene); // own texture (disposeOnStop disposes it)
    const smoke = new ParticleSystem("smoke", 500, scene);
    smoke.particleTexture = smokeTex;
    smoke.emitter = new Vector3(0, -20, 0);
    smoke.createPointEmitter(new Vector3(-0.2, 1, -0.2), new Vector3(0.2, 1, 0.2));
    smoke.emitRate = 120; // particles / s (with the clock hook)
    smoke.minLifeTime = smoke.maxLifeTime = 0.5;
    smoke.targetStopDuration = 1.0; // seconds of emission (with the clock hook)
    smoke.disposeOnStop = true;
    smoke.preWarmCycles = 30;
    smoke.preWarmStepOffset = 1;
    smoke.updateSpeed = 1 / 60; // pre-warm uses updateSpeed*preWarmStepOffset per cycle (no ratio) -> set BEFORE start()
    let stoppedAt = -1;
    let fr = 0;
    smoke.onStoppedObservable.add(() => (stoppedAt = fr));
    smoke.start();
    const afterPrewarm = smoke.getActiveCount();
    const actualFrameAfterPrewarm = smoke._actualFrame;
    clocked.push(smoke);
    await renderUntil(scene, () => smoke.isReady());
    const counts: number[] = [];
    while (!smoke.isDisposed && fr < 300) {
      frame();
      fr++;
      if (fr % 10 === 0) counts.push(smoke.getActiveCount());
    }
    out.targetStop = { activeRightAfterStartWithPrewarm: afterPrewarm, actualFrameAfterPrewarm: r3(actualFrameAfterPrewarm), stoppedAtFrame: stoppedAt, disposedAtFrame: fr, isDisposed: smoke.isDisposed, countsEvery10: counts };
    clocked.splice(clocked.indexOf(smoke), 1);
  }

  // ------------------------------------------------ 6) GPU particles
  {
    const gpuSupported = GPUParticleSystem.IsSupported;
    const caps = engine.getCaps();
    const info: any = { IsSupported: gpuSupported, supportTransformFeedbacks: caps.supportTransformFeedbacks, webGLVersion: engine.webGLVersion };
    if (gpuSupported) {
      const gps = new GPUParticleSystem("gpu", { capacity: 20000 }, scene);
      gps.particleTexture = puff;
      gps.emitter = new Vector3(3.8, 0.1, 1);
      gps.createConeEmitter(0.05, 0.4);
      gps.emitRate = 2000;
      gps.minLifeTime = 0.5;
      gps.maxLifeTime = 1.0;
      gps.minEmitPower = 2;
      gps.maxEmitPower = 3;
      gps.minSize = 0.02;
      gps.maxSize = 0.05;
      gps.gravity = new Vector3(0, -9.81, 0);
      gps.color1 = new Color4(0.5, 0.7, 1, 0.8);
      gps.color2 = new Color4(0.7, 0.85, 1, 0.8);
      gps.colorDead = new Color4(0.6, 0.8, 1, 0);
      gps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      gps.updateSpeed = 1 / 60 / scene.getAnimationRatio();
      gps.start();
      info.ready = await renderUntil(scene, () => gps.isReady());
      const counts: number[] = [];
      const tG: number[] = [];
      for (let i = 0; i < 30; i++) {
        tG.push(frame());
        counts.push(gps.getActiveCount());
      }
      // manual burst on GPU: manualEmitCount accumulates into _accumulatedCount (one emitter matrix per frame)
      gps.emitRate = 0;
      gps.manualEmitCount = 500;
      frame();
      info.activeAfter30Frames = counts[counts.length - 1];
      info.frameMs = stats(tG);
      info.afterManualBurst = gps.getActiveCount();
      info.hasStartPositionFunction = "startPositionFunction" in gps;
      info.isGPU = gps.isGPU;
      gps.emitRate = 2000;
    }
    out.gpu = info;
  }

  // ------------------------------------------------ 7) built-in emitter types + CustomParticleEmitter + wrapped updateFunction
  {
    const E = new Vector3(0, -30, 0);
    const mk = (name: string, setup: (ps: ParticleSystem) => void): ParticleSystem => {
      const ps = new ParticleSystem(name, 200, scene);
      ps.particleTexture = puff;
      ps.emitter = E.clone();
      ps.manualEmitCount = 200;
      ps.minLifeTime = ps.maxLifeTime = 10;
      ps.minEmitPower = ps.maxEmitPower = 2;
      setup(ps);
      ps.start();
      clocked.push(ps);
      return ps;
    };
    const point = mk("ePoint", (ps) => ps.createPointEmitter(new Vector3(-0.1, 1, -0.1), new Vector3(0.1, 1, 0.1)));
    const box = mk("eBox", (ps) => ps.createBoxEmitter(new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(-0.5, -0.1, -0.2), new Vector3(0.5, 0.1, 0.2)));
    const sphere = mk("eSphere", (ps) => ps.createSphereEmitter(0.5, 1));
    const cone = mk("eCone", (ps) => ps.createConeEmitter(0.3, Math.PI / 4));
    const ce = new CustomParticleEmitter();
    ce.particlePositionGenerator = (index: number, _p: Particle | null, outP: Vector3) => outP.set(index * 0.01, 0, 0);
    ce.particleDirectionGenerator = (_i: number, _p: Particle | null, outD: Vector3) => outD.set(0, 0, 1);
    const custom = mk("eCustom", (ps) => (ps.particleEmitterType = ce));
    const all = [point, box, sphere, cone, custom];
    await renderUntil(scene, () => all.every((ps) => ps.isReady()) && all.every((ps) => ps.getActiveCount() > 0));
    const rel = (ps: ParticleSystem) => ps.particles.map((p) => p.position.subtract(E));
    const maxAbs = (vs: Vector3[]) => vs.reduce((m, v) => new Vector3(Math.max(m.x, Math.abs(v.x)), Math.max(m.y, Math.abs(v.y)), Math.max(m.z, Math.abs(v.z))), Vector3.Zero());
    const coneAngles = cone.particles.map((p) => Math.acos(Math.min(1, p.direction.normalizeToNew().y)));
    out.emitterTypes = {
      pointMaxOffset: r3(maxAbs(rel(point)).length()),
      pointDirSpeed: r3(point.particles[0].direction.length()),
      boxMaxAbs: maxAbs(rel(box)).asArray().map(r3),
      sphereMaxRadius: r3(Math.max(...rel(sphere).map((v) => v.length()))),
      coneMaxAngleDeg: r3((Math.max(...coneAngles) * 180) / Math.PI),
      coneMaxRadialOffset: r3(Math.max(...rel(cone).map((v) => Math.hypot(v.x, v.z)))),
      customFirst3: rel(custom).slice(0, 3).map((v) => v.asArray().map(r3)),
      customDir: custom.particles[0].direction.asArray().map(r3),
      activeEach: all.map((ps) => ps.getActiveCount()),
    };
    for (const ps of all) {
      ps.dispose(false);
      clocked.splice(clocked.indexOf(ps), 1);
    }

    // wrapped updateFunction: keep the default aging/recycling, add a floor bounce afterwards
    const bouncy = new ParticleSystem("bouncy", 400, scene);
    bouncy.particleTexture = puff;
    bouncy.emitter = new Vector3(0, 0.5, -10);
    bouncy.createPointEmitter(new Vector3(-1, -3, -1), new Vector3(1, -1, 1));
    bouncy.minEmitPower = bouncy.maxEmitPower = 1;
    bouncy.minLifeTime = bouncy.maxLifeTime = 1.5;
    bouncy.gravity = new Vector3(0, -9.81, 0);
    bouncy.manualEmitCount = 300;
    const baseUpdate = bouncy.updateFunction;
    let bounces = 0;
    bouncy.updateFunction = (particles: Particle[]) => {
      baseUpdate(particles); // ages, moves, applies gravity, recycles dead particles (array shrinks)
      for (const p of particles) {
        if (p.position.y < 0) {
          p.position.y = 0;
          if (p.direction.y < 0) {
            p.direction.y *= -0.4;
            bounces++;
          }
        }
      }
    };
    bouncy.start();
    clocked.push(bouncy);
    await renderUntil(scene, () => bouncy.isReady());
    let minY = Infinity;
    let fr = 0;
    while (fr < 120 && (fr < 2 || bouncy.getActiveCount() > 0)) {
      frame();
      fr++;
      for (const p of bouncy.particles) minY = Math.min(minY, p.position.y);
    }
    out.updateFunctionWrap = { minY: r3(minY), bounces, allDeadAfterFrames: fr, activeAtEnd: bouncy.getActiveCount() };
    bouncy.dispose(false);
    clocked.splice(clocked.indexOf(bouncy), 1);
  }

  // final frames for the screenshot: re-burst so all effects are visible together
  dust.burst({ ...base, x: -2.2, y: 0, z: 0, nx: 0, ny: 1, nz: 0, count: 400, r: 0.62, g: 0.48, b: 0.33 });
  dust.burst({ ...base, x: 0, y: 1.6, z: 1.98, nx: 0, ny: 0, nz: -1, count: 400, r: 0.95, g: 0.95, b: 0.93, sizeMul: 1.5 });
  dust.burst({ ...base, x: 2.2, y: 0, z: 0, nx: 0, ny: 1, nz: 0, count: 400, r: 0.55, g: 0.56, b: 0.58 });
  sparks.burst({ ...sp, x: -0.9, y: 0.6, z: 1.98, nx: 0, ny: 0, nz: -1 });
  sparks.burst({ ...sp, x: 1.0, y: 1.0, z: 1.98, nx: 0, ny: 0, nz: -1 });
  engine.setHardwareScalingLevel(1);
  for (let i = 0; i < 12; i++) frame();
  out.final = { dust: dust.ps.getActiveCount(), sparks: sparks.ps.getActiveCount(), totalSystems: scene.particleSystems.length };
  return out;
}
