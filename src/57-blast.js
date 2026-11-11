// Grenade blasts, seen: a white-hot core and a rolling orange fireball (additive sprites), sparks
// and burning fragments flung out, a bright light flash that decays over a quarter second (the
// pooled effects light, so no new lights and no shader recompiles), heavy smoke, and char: a sooty
// scorch with radial streaks burnt into the floor and scorch marks on the walls around.
class BlastFX {
  constructor(game) {
    this.game = game;
    this.live = [];   // { sprites: [...], t }
    this.sparks = []; // pooled spark sprites
    this.flashes = [];
    this.tex = null;
    game.hooks.push(this);
  }

  ensure() {
    if (this.tex) return;
    const mk = (stops) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      const t = new T3.CanvasTexture(c); t.needsUpdate = true; return t;
    };
    this.tex = {
      core: mk([[0, 'rgba(255,255,245,1)'], [0.3, 'rgba(255,240,190,0.95)'], [0.65, 'rgba(255,170,60,0.4)'], [1, 'rgba(255,120,20,0)']]),
      fire: mk([[0, 'rgba(255,210,120,0.9)'], [0.4, 'rgba(255,120,30,0.6)'], [0.75, 'rgba(180,50,10,0.2)'], [1, 'rgba(80,20,5,0)']]),
      spark: mk([[0, 'rgba(255,250,220,1)'], [0.35, 'rgba(255,200,90,0.8)'], [1, 'rgba(255,120,20,0)']]),
      ring: mk([[0, 'rgba(255,240,210,0)'], [0.72, 'rgba(255,240,210,0)'], [0.86, 'rgba(255,235,200,0.55)'], [1, 'rgba(255,230,190,0)']]),
    };
    this.mat = (tex) => new T3.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: T3.AdditiveBlending, fog: false, toneMapped: false });
    this.quad = new T3.PlaneGeometry(1, 1);
  }

  // one hidden instance of every effect mesh in the scene, so the shader warm-up builds their
  // programs before the first blast or ejected case (see PerfGovernor.warm)
  prewarm() {
    const scene = this.game.view && this.game.view.scene;
    if (!scene || this._warmScene === scene) return;
    this._warmScene = scene;
    this.ensure();
    for (const kind of Object.keys(this.tex)) { const s = this.sprite(kind); s.visible = false; }
    for (const k of ['pistol', 'rifle']) {
      try { const m = Lab.casingMesh(k); m.visible = false; m.castShadow = m.receiveShadow = false; scene.add(m); } catch (e) { void e; }
    }
  }

  // a sprite from the scene's spare pool (sprites are cheap; keep them around between blasts)
  sprite(kind) {
    const scene = this.game.view.scene;
    this.pool = this.pool || [];
    let s = this.pool.find((p) => !p.visible && p.userData.kind === kind && p.parent === scene);
    if (!s) {
      s = new T3.Mesh(this.quad, this.mat(this.tex[kind])); // a camera-facing quad (see frame)
      s.userData.kind = kind;
      s.frustumCulled = false;
      scene.add(s);
      this.pool.push(s);
    }
    s.visible = true;
    return s;
  }

  onLevel() { this.pool = []; this.live.length = 0; this.sparks.length = 0; this.flashes.length = 0; this.cases = []; }

  // spent brass from enemy guns: thrown out to the right of the gun, bouncing with a clink, then
  // lying where it stopped (a pool of 80; the oldest is picked up again)
  casing(ai, muzzle) {
    const g = this.game, scene = g.view && g.view.scene;
    if (!scene || !ai.gun || ai.gun.pellets) return; // a pump shotgun keeps its hull until it is worked
    this.cases = this.cases || [];
    let c = this.cases.find((x) => x.rest && x.m.parent === scene && this.cases.length >= 80) || null;
    if (!c && this.cases.length >= 80) c = this.cases[0];
    if (!c) {
      const m = Lab.casingMesh(ai.gun.hold === 'pistol' ? 'pistol' : 'rifle');
      m.castShadow = m.receiveShadow = false;
      scene.add(m);
      c = { m, v: new T3.Vector3(), w: new T3.Vector3(), rest: false, bounced: 0 };
      this.cases.push(c);
    } else { this.cases.splice(this.cases.indexOf(c), 1); this.cases.push(c); }
    const d = ai.aimDir, rx = -d.z, rz = d.x, rl = Math.hypot(rx, rz) || 1;
    c.m.position.set(muzzle.x - d.x * 0.25, muzzle.y + 0.02, muzzle.z - d.z * 0.25);
    c.v.set((rx / rl) * (1.6 + Math.random()), 1.2 + Math.random() * 0.8, (rz / rl) * (1.6 + Math.random()));
    c.w.set(Math.random() * 30, 20, Math.random() * 30);
    c.rest = false; c.bounced = 0;
  }

  // dust shaken down from the ceiling around a blast or a hit to the ceiling
  ceilingDust(x, z, r, n) {
    const g = this.game, L = g.level;
    if (!L || !g.effects) return;
    const col = (L.theme && L.theme.floorDust) || 0xb8ad96;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, d = Math.random() * r;
      g.effects.puff(new T3.Vector3(x + Math.cos(a) * d, L.ceiling - 0.05, z + Math.sin(a) * d), new T3.Vector3(0, -1, 0), col, 6, 0.6, 0.5);
    }
  }

  spawn(pos) {
    const g = this.game;
    if (!g.view || !g.view.scene) return;
    this.ensure();
    const P = new T3.Vector3(pos.x, Math.max(pos.y, 0.1) + 0.2, pos.z);
    // fireball: a hot core inside a larger, slower orange ball, and a few licking tongues
    const parts = [];
    P.y += 0.25;
    const core = this.sprite('core'); core.position.copy(P); parts.push({ s: core, grow: 6.5, life: 0.3, size0: 1.2, up: 0.6 });
    const ball = this.sprite('fire'); ball.position.copy(P); parts.push({ s: ball, grow: 9.5, life: 0.75, size0: 1.6, up: 1.2 });
    const ball2 = this.sprite('fire'); ball2.position.copy(P); parts.push({ s: ball2, grow: 7.0, life: 0.55, size0: 1.0, up: 2.0 });
    for (let k = 0; k < 10; k++) {
      const t = this.sprite('fire'), a = Math.random() * TAU;
      t.position.copy(P);
      parts.push({ s: t, grow: 2.4 + Math.random() * 1.5, life: 0.35 + Math.random() * 0.3, size0: 0.5, up: 0.6, v: new T3.Vector3(Math.cos(a) * 7, 1.5 + Math.random() * 3.5, Math.sin(a) * 7) });
    }
    this.live.push({ parts, t: 0 });
    // sparks and burning fragments
    for (let k = 0; k < 48; k++) {
      const s = this.sprite('spark'), u = Math.random() * 2 - 1, a = Math.random() * TAU, sp = 6 + Math.random() * 12, r = Math.sqrt(1 - u * u);
      s.position.copy(P);
      this.sparks.push({ s, v: new T3.Vector3(r * Math.cos(a) * sp, Math.abs(u) * sp * 0.8 + 1.5, r * Math.sin(a) * sp), t: 0, life: 0.35 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.06 });
    }
    // light: bright and warm, decaying over a quarter second
    this.flashes.push({ p: P.clone(), t: 0 });
    // smoke: a dark column, a lighter rolling cloud, debris chips
    g.effects.puff(P, new T3.Vector3(0, 1, 0), 0x2a2622, 140, 7, 2.4);
    g.effects.puff(P, new T3.Vector3(0, 1, 0), 0x5a524a, 80, 9, 1.6);
    g.effects.puff(P, new T3.Vector3(0, 1, 0), undefined, 70, 10, 0.5, true);
    // the pressure wave: a ring of dust thrown out along the floor
    const dust = (g.level && g.level.theme && g.level.theme.floorDust) || 0x8a7a5c;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      g.effects.puff(new T3.Vector3(pos.x, 0.12, pos.z), new T3.Vector3(Math.cos(a), 0.12, Math.sin(a)), dust, 18, 9, 1.4);
    }
    const ring = this.sprite('ring'); ring.position.set(pos.x, 0.06, pos.z); ring.userData.flat = true;
    parts.push({ s: ring, grow: 16, life: 0.32, size0: 0.6, up: 0 });
    this.char(pos);
    this.ceilingDust(pos.x, pos.z, 4, 7);
  }

  // char: a burnt core, a sooty halo and radial streaks on the floor; scorches on walls in reach
  char(pos) {
    const g = this.game, D = g.view.decals;
    if (D) {
      D.splat(pos.x, pos.z, 0.75, 2, 1.0, 1, Math.random() * TAU, Math.random());
      D.splat(pos.x, pos.z, 1.55, 2, 0.5, 1, Math.random() * TAU, Math.random());
      for (let k = 0; k < 9; k++) {
        const a = Math.random() * TAU, d = 0.5 + Math.random() * 1.0;
        D.splat(pos.x + Math.cos(a) * d, pos.z + Math.sin(a) * d, 0.18 + Math.random() * 0.25, 2, 0.45 + Math.random() * 0.3, 1, Math.random() * TAU, Math.random());
      }
    }
    const W = g.view.wallDecals, world = g.sb && g.sb.world;
    if (!W || !world || !world.raycastAll) return;
    const levelOnly = (b) => !!(b.userData && b.userData.level);
    const o = new I(pos.x, Math.max(pos.y, 0.1) + 0.35, pos.z);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + Math.random() * 0.3, up = (Math.random() - 0.3) * 0.7;
      const d = new I(Math.cos(a), up, Math.sin(a)).normalize();
      let h = null;
      for (const q of world.raycastAll(o, d, 2.4, levelOnly)) if (!h || q.tIn < h.tIn) h = q;
      if (!h || h.tIn < 0.05 || Math.abs(h.normal.y) > 0.6) continue;
      const near = 1 - h.tIn / 2.4;
      W.add('scorch', h.point, h.normal, (0.45 + 0.75 * near) * (0.8 + Math.random() * 0.4));
    }
  }

  frame(dt) {
    const g = this.game, cq = g.camera && g.camera.quaternion;
    if (this.cases) for (const c of this.cases) {
      if (c.rest) continue;
      c.v.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
      if (c.m.position.y < 0.012) {
        c.m.position.y = 0.012;
        if (c.bounced === 0 && g.audio && Math.random() < 0.6) g.audio.impact('metal', 0.07 + Math.random() * 0.05, toP3(c.m.position, new I()));
        c.bounced++;
        c.v.set(c.v.x * 0.45, -c.v.y * 0.3, c.v.z * 0.45);
        c.w.multiplyScalar(0.5);
        if (c.bounced > 2 || Math.abs(c.v.y) < 0.3) { c.rest = true; c.m.rotation.x = Math.PI / 2; c.m.rotation.z = 0; }
      }
    }
    if (this.pool && cq) for (const s of this.pool) if (s.visible && !s.userData.flat) s.quaternion.copy(cq);
    if (this.pool) for (const s of this.pool) if (s.userData.flat) s.rotation.set(-Math.PI / 2, 0, 0);
    for (const L of this.live) {
      L.t += dt;
      for (const p of L.parts) {
        const k = clamp(L.t / p.life, 0, 1);
        if (k >= 1) { p.s.visible = false; continue; }
        if (p.v) { p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(Math.exp(-dt * 4)); }
        else p.s.position.y += p.up * dt;
        const sz = p.size0 + p.grow * (1 - (1 - k) * (1 - k));
        p.s.scale.set(sz, sz, 1);
        p.s.material.opacity = (1 - k) * (1 - k);
      }
    }
    this.live = this.live.filter((L) => L.t < 1);
    for (const sp of this.sparks) {
      sp.t += dt;
      sp.v.y -= 9.8 * dt;
      sp.s.position.addScaledVector(sp.v, dt);
      if (sp.s.position.y < 0.02) { sp.s.position.y = 0.02; sp.v.y *= -0.3; sp.v.x *= 0.6; sp.v.z *= 0.6; }
      const k = sp.t / sp.life;
      sp.s.scale.setScalar(sp.size * (1 - 0.6 * k));
      sp.s.material.opacity = 1 - k;
      if (k >= 1) sp.s.visible = false;
    }
    this.sparks = this.sparks.filter((sp) => sp.t < sp.life);
    for (const f of this.flashes) {
      f.t += dt;
      const k = Math.max(0, 1 - f.t / 0.42);
      if (k > 0 && g.effects) g.effects.muzzleLight(f.p, 6 * k * k + 0.6 * k);
    }
    this.flashes = this.flashes.filter((f) => f.t < 0.42);
  }
}
