// Frame-rate governor: dynamic resolution. The quality setting picks a base render scale; when the
// real frame time runs long (GPU- or fill-bound, e.g. a laptop at a high-DPI window size) the scale
// steps down until frames fit again, and creeps back up once there is headroom. Steps are coarse
// and spaced out so the picture does not pump, and a level that failed is not retried for a while.
const PERF = { target: 1000 / 58, down: 0.88, up: 1.06, floor: { low: 0.5, medium: 0.6, high: 0.7 } };

class PerfGovernor {
  constructor(game) {
    this.game = game;
    this.scale = 1;
    this.ema = 16.7;
    this.slowT = 0; this.fastT = 0; this.coolT = 0;
    this.failed = 2; // the scale at which frames last ran long (do not climb straight back to it)
    game.hooks.push(this);
  }

  // the quality setting's own ratio (see applySettings)
  get base() {
    const q = this.game.settings.quality;
    return Math.min(window.devicePixelRatio || 1, q === 'low' ? 0.85 : q === 'medium' ? 1.1 : 1.6);
  }

  reset() { this.scale = 1; this.failed = 2; this.slowT = this.fastT = 0; this.coolT = 1.5; this.apply(); }

  apply() {
    const g = this.game, r = g.renderer;
    const want = this.base * this.scale;
    if (Math.abs(r.getPixelRatio() - want) < 0.005) return;
    r.setPixelRatio(want);
    g.resize();
  }

  frame(dt) {
    const g = this.game;
    if (g.state !== 'play' || g.settings.dynamicRes === false) return;
    const ms = dt * 1000;
    if (ms > 250) return; // a hitch (tab switch, level load): ignore
    this.ema += (ms - this.ema) * 0.08;
    this.coolT = Math.max(0, this.coolT - dt);
    if (this.ema > PERF.target + 1.2) { this.slowT += dt; this.fastT = 0; }
    else if (this.ema < PERF.target - 0.6) { this.fastT += dt; this.slowT = 0; }
    else { this.slowT = 0; this.fastT = 0; }
    if (this.coolT > 0) return;
    const floor = PERF.floor[g.settings.quality] ?? 0.6;
    if (this.slowT > 0.75 && this.scale > floor) {
      this.failed = this.scale;
      this.scale = Math.max(floor, this.scale * PERF.down);
      this.slowT = 0; this.coolT = 1.2;
      this.apply();
    } else if (this.fastT > 3.5 && this.scale < 1) {
      const next = Math.min(1, this.scale * PERF.up);
      // a level that just failed waits longer before it is tried again
      if (next >= this.failed && this.fastT < 12) return;
      this.scale = next;
      this.fastT = 0; this.coolT = 1.5;
      this.apply();
    }
  }

  onLevel() { this.coolT = 2; this.slowT = this.fastT = 0; this.sweepT = 0.4; this.sweeps = 3; }

  // ---- shader warm-up ---------------------------------------------------------------------------
  // A material's program is built the first time it is drawn, and building one stalls the frame
  // (tens of milliseconds on a laptop GPU). Programs are built ahead here instead, in the variant the
  // frame really uses: with the bodycam pass on, the scene draws into its render target (linear
  // output), not to the screen. With KHR_parallel_shader_compile the driver builds them in the
  // background. objs: an Object3D, or a list of meshes still parented elsewhere.
  warm(objs) {
    const g = this.game, r = g.renderer;
    if (!r || !g.camera || !g.view) return;
    const list = Array.isArray(objs) ? objs : null;
    const root = list ? { traverse: (fn) => { for (const m of list) fn(m); }, traverseVisible: () => {} } : objs;
    const prev = r.getRenderTarget(), post = g.post;
    try {
      if (post && post.enabled && post.rt) r.setRenderTarget(post.rt);
      if (r.compileAsync) r.compileAsync(root, g.camera, g.view.scene).catch(() => {});
      else r.compile(root, g.camera, g.view.scene);
    } catch (e) { void e; } finally { r.setRenderTarget(prev); }
  }

  // the whole scene a few times after a level loads (pools and effects fill in as they first run)
  step(dt) {
    if (!(this.sweeps > 0)) return;
    if ((this.sweepT -= dt) > 0) return;
    this.sweepT = 1.5; this.sweeps--;
    const g = this.game;
    if (g.blast && g.blast.prewarm) { try { g.blast.prewarm(); } catch (e) { void e; } }
    this.warm(g.view.scene);
    if (g.vm && g.vm.scene) this.warm(g.vm.scene);
  }
}
