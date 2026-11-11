// Lights that react to the fight. A round through a ceiling panel or lamp kills it: a pop, a
// shower of sparks and glass, a brief stutter, then dark (the light term, the panel glow and the
// shadow spots all follow the fixture's state in LevelView). A grenade blows out the lights over
// it and sets the ones around stuttering. While a wave is on, the power browns out now and then
// and a tube near the player struggles for a few seconds before it catches again.
class DynamicLights {
  constructor(game) {
    this.game = game;
    this.temp = [];     // fixtures flickering for a while: { f, t, back }
    this.sparkT = [];   // fixtures shot out that still spit sparks: { f, t, next }
    this.brownT = 25;   // to the next stutter
    this.sag = 0;       // brownout dip, 0..1
    game.hooks.push(this);
  }

  onLevel() { this.temp.length = 0; this.sparkT.length = 0; this.sag = 0; this.brownT = 20 + Math.random() * 20; }

  lampY() {
    const v = this.game.view, L = v.level;
    return v.lamp && v.lamp.spotY !== undefined ? v.lamp.spotY + 0.05 : L.ceiling;
  }

  fixtureNear(x, z, r) {
    const L = this.game.view && this.game.view.level;
    if (!L) return null;
    const n = L.n, ci = Math.floor((x + L.half) / L.cell), cj = Math.floor((z + L.half) / L.cell);
    let best = null, bd = r;
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const f = L.fixtures[j * n + i], d = Math.hypot(f.x - x, f.z - z);
        if (d < bd) { bd = d; best = f; }
      }
    return best;
  }

  // a bullet stopped by something: if it is a lit fixture, break it
  onObjectHit(e) {
    const g = this.game, p = e.point;
    if (!g.view || !p) return;
    const y = this.lampY();
    if (Math.abs(p.y - y) > 0.35) return;
    const f = this.fixtureNear(p.x, p.z, 0.72);
    if (!f || f.state === 'dead' || f.state === 'dying' || f.broken) return;
    this.breakFixture(f, 1);
  }

  breakFixture(f, amount) {
    const g = this.game, y = this.lampY();
    f.broken = true;
    f.state = 'dying'; f.dieT = 0.75 + Math.random() * 0.3; // LevelView kills it at 1.2 s
    this.temp = this.temp.filter((r) => r.f !== f);
    const at = new T3.Vector3(f.x, y - 0.04, f.z), down = new T3.Vector3(0, -1, 0);
    if (g.gore && g.gore.sparks) g.gore.sparks(at, down, down, Math.round(18 * amount), 0.9);
    if (g.effects) {
      g.effects.muzzleLight(at, 2.2 * amount);
      g.effects.puff(at, down, 0xe8e6dc, 10, 1.6, 0.35, true);
    }
    if (g.blast && g.blast.ceilingDust) g.blast.ceilingDust(f.x, f.z, 0.8, 3);
    if (g.sfx && g.sfx.lampPop) g.sfx.lampPop(at, amount);
    this.sparkT.push({ f, t: 2.5 + Math.random() * 4, next: 0.2 });
  }

  flickerFor(f, t) {
    if (f.state !== 'on') return;
    f.state = 'flicker'; f.hard = true;
    this.temp.push({ f, t, back: 'on' });
  }

  onExplosion(pos) {
    const L = this.game.view && this.game.view.level;
    if (!L) return;
    for (const f of L.fixtures) {
      const d = Math.hypot(f.x - pos.x, f.z - pos.z);
      if (d > 9) continue;
      if (d < 3.6 && f.state !== 'dead' && !f.broken) this.breakFixture(f, 0.7);
      else if (d < 9) this.flickerFor(f, 0.6 + Math.random() * 1.6);
    }
  }

  step(dt) {
    const g = this.game, L = g.view && g.view.level;
    if (!L) return;
    for (let k = this.temp.length - 1; k >= 0; k--) {
      const r = this.temp[k];
      if ((r.t -= dt) > 0) continue;
      r.f.hard = false;
      if (r.f.state === 'flicker' && !r.f.broken) r.f.state = r.back;
      this.temp.splice(k, 1);
    }
    // a broken fixture spits a few sparks after it dies
    const y = this.lampY();
    for (let k = this.sparkT.length - 1; k >= 0; k--) {
      const s = this.sparkT[k];
      if ((s.t -= dt) <= 0) { this.sparkT.splice(k, 1); continue; }
      if ((s.next -= dt) > 0) continue;
      s.next = 0.25 + Math.random() * 1.1;
      const at = new T3.Vector3(s.f.x + (Math.random() - 0.5) * 0.4, y - 0.03, s.f.z + (Math.random() - 0.5) * 0.4), down = new T3.Vector3(0, -1, 0);
      if (g.gore && g.gore.sparks) g.gore.sparks(at, down, down, 3 + Math.floor(Math.random() * 5), 0.5);
      if (Math.random() < 0.5 && g.effects) g.effects.muzzleLight(at, 0.5);
      if (g.sfx && g.sfx.lampPop) g.sfx.lampPop(at, 0.25);
    }
    // the power struggles while a wave is on
    const fighting = g.enemies && g.enemies.alive.length > 0 && !(g.director && g.director.mod === 'blackout');
    if (fighting && (this.brownT -= dt) <= 0) {
      this.brownT = 18 + Math.random() * 30;
      if (Math.random() < 0.45) this.sag = 1; // the whole floor dips
      const P = g.player.pos, near = [];
      for (const f of L.fixtures) if (f.state === 'on' && Math.hypot(f.x - P.x, f.z - P.z) < 14) near.push(f);
      for (let m = 0; m < 1 + (Math.random() < 0.4 ? 1 : 0) && near.length; m++)
        this.flickerFor(near.splice((Math.random() * near.length) | 0, 1)[0], 2 + Math.random() * 5);
    }
    if (this.sag > 0) {
      this.sag = Math.max(0, this.sag - dt * 1.4);
      const v = g.view, s = this.sag;
      // a stuttering dip: deepest a moment in, with a couple of hiccups on the way back
      const dip = Math.sin(s * Math.PI) * (0.55 + 0.25 * Math.sin(s * 40));
      v.dim = (v.baseDim ?? (v.baseDim = v.dim ?? 1)) * (1 - clamp(dip, 0, 0.8));
      if (this.sag === 0) { v.dim = v.baseDim; v.baseDim = undefined; }
    }
  }
}
