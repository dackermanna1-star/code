// Blood on the floor. The engine's injury model gives every wound a live external flow (mL/s) and
// a position on its body; the floor-decal layer grows pools from volumes of blood. Wounds near the
// floor feed a pool where they lie, wounds higher up drip a trail, and a body that dies keeps
// draining for a while into a pool under its worst wound.
class BloodPools {
  constructor(game) {
    this.game = game;
    this.drip = new Map(); // wound -> accumulated mL waiting to fall
    game.hooks.push(this);
  }

  onLevel() { this.drip.clear(); }

  step(dt) {
    const g = this.game;
    if (!g.settings.gore || !g.sb || !g.view) return;
    const decals = g.view.decals;
    const w = new I(), n = new I();
    // settled corpses are frozen out of the sandbox's list but still drain
    const people = new Set(g.sb.people);
    if (g.enemies) for (const ai of g.enemies.corpses) people.add(ai.p);
    for (const p of people) {
      const inj = p.injury;
      if (!inj) continue;
      // after death the heart stops and the engine's flow ends: release a residual pool instead
      if (!inj.alive) { this.drain(p, dt, decals); continue; }
      if (p.frozen) continue;
      for (const wd of inj.wounds) {
        const flow = wd.extNow || 0;
        if (flow < 0.02 || !wd.body) continue;
        wd.body.localToWorld(wd.local, w);
        const vol = flow * dt * 2.5; // game scale: pools read within seconds rather than minutes
        if (w.y < 0.4) {
          // lying in it: the pool spreads from just beside the wound
          if (wd.normal) { wd.body.localDirToWorld(wd.normal, n); w.x += n.x * 0.05; w.z += n.z * 0.05; }
          decals.addPoolVolume(w.x, w.z, vol);
        } else {
          // upright: drops fall under the wound, a few centimetres apart as the body moves
          const acc = (this.drip.get(wd) || 0) + vol;
          if (acc > 1.6) {
            const x = w.x + (Math.random() - 0.5) * 0.06, z = w.z + (Math.random() - 0.5) * 0.06;
            decals.splat(x, z, 0.009 + Math.random() * 0.008, 0, 0.8, 1, Math.random() * TAU, Math.random());
            decals.addPoolVolume(x, z, acc * 0.5);
            this.drip.set(wd, 0);
          } else this.drip.set(wd, acc);
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
    const w = new I();
    if (s.wound && s.wound.body) s.wound.body.localToWorld(s.wound.local, w);
    if (!s.wound || w.y > 0.45) {
      const c = p.rd.segments.chest ? p.rd.segments.chest.body.pos : p.rd.pelvis.pos;
      w.set(c.x, c.y, c.z);
    }
    if (w.y > 0.7) return; // still propped up against something: wait
    decals.addPoolVolume(w.x, w.z, rel);
  }
}
