// Blood on the floor. The engine's injury model gives every wound a live external flow (mL/s) and
// a position on its body; the floor-decal layer grows pools from volumes of blood. Wounds near the
// floor feed a pool where they lie, wounds higher up drip a trail, and a body that dies keeps
// draining for a while into a pool under its worst wound. Opened arteries spurt with the pulse.
const _bDir = new T3.Vector3(), _bPos = new T3.Vector3(), _bW = new I(), _bN = new I();
class BloodPools {
  constructor(game) {
    this.game = game;
    this.people = new Set(); // reused every step
    game.hooks.push(this);
    // impacts, spray, spatter and lens blood live with the blood (see 57-gore.js)
    if (!game.gore) game.gore = new GoreFX(game);
  }

  onLevel() { this.people.clear(); }

  step(dt) {
    const g = this.game;
    if (!g.settings.gore || !g.sb || !g.view) return;
    const decals = g.view.decals;
    const w = _bW, n = _bN;
    // settled corpses are frozen out of the sandbox's list but still drain
    const people = this.people;
    people.clear();
    for (const p of g.sb.people) people.add(p);
    if (g.enemies) for (const ai of g.enemies.corpses) people.add(ai.p);
    for (const p of people) {
      const inj = p.injury;
      if (!inj) continue;
      // after death the heart stops and the engine's flow ends: release a residual pool instead
      if (!inj.alive) { this.drain(p, dt, decals); continue; }
      if (p.frozen) continue;
      const P = g.particles;
      for (const wd of inj.wounds) {
        const flow = wd.extNow || 0;
        if (flow < 0.02 || !wd.body) continue;
        wd.body.localToWorld(wd.local, w);
        if (wd.normal) wd.body.localDirToWorld(wd.normal, n); else n.set(0, 0, 0);
        // an opened artery spurts with every heartbeat (the engine advances spurtPhase with the pulse)
        if (wd.arterial && flow > 2.5 && inj.hr > 20 && !wd.pressure && P) {
          const beat = Math.floor(wd.spurtPhase || 0);
          if (wd._beat !== beat) {
            wd._beat = beat;
            const ml = flow / Math.max(inj.hr / 60, 0.5);
            _bDir.set(n.x, n.y + 0.25, n.z).normalize();
            _bPos.set(w.x + n.x * 0.01, w.y + n.y * 0.01, w.z + n.z * 0.01);
            P.spray(_bPos, _bDir, Math.min(5 + Math.round(ml * 2), 24), 1.1 + Math.min(flow / 10, 2.2), 0.3, 0.0011, 0.003, 0, ml / 14);
          }
        }
        const vol = flow * dt * 2.5; // game scale: pools read within seconds rather than minutes
        if (w.y < 0.4) {
          // lying in it: the pool spreads from just beside the wound
          w.x += n.x * 0.05; w.z += n.z * 0.05;
          decals.addPoolVolume(w.x, w.z, vol);
        } else {
          // upright: drops gather and fall from under the wound (landing as splats and a pool)
          const acc = (wd._drip || 0) + vol; // mL gathering before a drop falls
          if (acc > 0.8) {
            const x = w.x + n.x * 0.012 + (Math.random() - 0.5) * 0.02, z = w.z + n.z * 0.012 + (Math.random() - 0.5) * 0.02;
            if (P) P.emit(x, w.y - 0.01, z, n.x * 0.15, -0.3, n.z * 0.15, 0.0038 + Math.random() * 0.0025, acc * 0.9, 0);
            else { decals.splat(x, z, 0.012, 0, 0.8, 1, Math.random() * TAU, Math.random()); decals.addPoolVolume(x, z, acc * 0.5); }
            wd._drip = 0;
          } else wd._drip = acc;
        }
      }
    }
  }

  // residual drain of a body: a budget set at death, released along a decaying curve at the worst
  // wound (or the torso when the wounds are off the floor)
  drain(p, dt, decals) {
    const inj = p.injury;
    let s = p._pool;
    if (!s) {
      let worst = null, wr = 0;
      for (const wd of inj.wounds) { const r = (wd.extRate || 0) + (wd.arterial ? 2 : 0) + (wd.seg && wd.seg.name === 'head' ? 1 : 0); if (wd.body && r >= wr) { wr = r; worst = wd; } }
      const lost = inj.lostExternal || 0;
      s = p._pool = { left: worst ? clamp(380 + inj.wounds.length * 110 + lost * 0.5, 380, 1700) : 0, wound: worst, t: 0 };
    }
    if (s.left < 4) return;
    s.t += dt;
    if (s.t < 0.6) return; // let the body land first
    const rel = s.left * Math.min(1, dt / 5);
    s.left -= rel;
    const w = _bW;
    if (s.wound && s.wound.body) s.wound.body.localToWorld(s.wound.local, w);
    if (!s.wound || w.y > 0.45) {
      const c = p.rd.segments.chest ? p.rd.segments.chest.body.pos : p.rd.pelvis.pos;
      w.set(c.x, c.y, c.z);
    }
    if (w.y > 0.7) return; // still propped up against something: wait
    decals.addPoolVolume(w.x, w.z, rel);
  }
}
