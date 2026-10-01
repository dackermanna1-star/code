// Projectiles & timed entities (techniques). Each has an owner, a hit spec,
// a world AABB hitbox, a lifetime, optional custom update/draw, clash strength.
(function () {
  'use strict';
  const JJK = (typeof window !== 'undefined' ? window : globalThis).JJK;
  const U = JJK.U;

  let pid = 0;
  class Projectile {
    constructor(owner, o) {
      this.id = pid++;
      this.owner = owner;
      this.x = o.x; this.y = o.y;
      this.vx = o.vx || 0; this.vy = o.vy || 0;
      this.w = o.w || 12; this.h = o.h || 12; // half sizes (world units)
      this.life = o.life || 120; this.t = 0;
      this.hit = o.hit || null; // hit spec (see moves)
      this.hits = o.hits || 1; // number of hits before dying
      this.interval = o.interval || 8; // frames between multi-hits
      this.lastHit = -999;
      this.hp = o.hp != null ? o.hp : 1; // clash strength
      this.kind = o.kind || 'proj';
      this.type = o.type || 'generic';
      this.facing = o.facing || owner.facing;
      this.dead = false;
      this.data = o.data || {};
      this.onUpdate = o.update || null;
      this.onDraw = o.draw || null;
      this.onHit = o.onHit || null;
      this.onBlock = o.onBlock || null;
      this.onEnd = o.onEnd || null;
      this.onClash = o.onClash || null;
      this.pierce = !!o.pierce;
      this.layer = o.layer || 'front';
      this.noCollide = !!o.noCollide;
      this.bypassInf = !!o.bypassInf;
      this.reflectable = o.reflectable !== false;
      this.moveId = o.moveId || '';
      this.frozen = 0;
      this.stopped = false;
    }
    get box() { return [this.x - this.w, this.y - this.h, this.x + this.w, this.y + this.h]; }
    update(m) {
      if (this.frozen > 0) { this.frozen--; return; }
      this.t++;
      if (this.onUpdate) this.onUpdate(this, m);
      if (!this.stopped) { this.x += this.vx; this.y += this.vy; }
      if (this.t >= this.life) this.kill(m);
      if (Math.abs(this.x) > JJK.STAGE_HALF + 200) this.kill(m);
    }
    kill(m) {
      if (this.dead) return;
      this.dead = true;
      if (this.onEnd) this.onEnd(this, m);
    }
    draw(ctx, cam, m) {
      if (this.onDraw) this.onDraw(this, ctx, cam, m);
    }
  }
  JJK.Projectile = Projectile;

  // Collision step for all projectiles vs fighters and each other.
  JJK.updateProjectiles = function (m) {
    const list = m.projectiles;
    for (const p of list) if (!p.dead) p.update(m);
    // projectile clashes
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.noCollide || a.kind === 'field') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.noCollide || b.kind === 'field' || a.owner === b.owner) continue;
        if (!JJK.Combat.overlap(a.box, b.box)) continue;
        const ah = a.hp, bh = b.hp;
        a.hp -= bh; b.hp -= ah;
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        if (JJK.FX) JJK.FX.hitSpark(cx, cy, 1, 0.7, '#ffffff');
        if (JJK.Audio) JJK.Audio.play('explosion', { vol: 0.6 });
        if (a.onClash) a.onClash(a, b, m);
        if (b.onClash) b.onClash(b, a, m);
        if (a.hp <= 0) a.kill(m);
        if (b.hp <= 0) b.kill(m);
      }
    }
    // vs fighters
    for (const p of list) {
      if (p.dead || !p.hit || p.noCollide) continue;
      if (p.hitsLeft === undefined) p.hitsLeft = p.hits;
      if (p.hitsLeft <= 0) continue;
      if (p.t - p.lastHit < p.interval) continue;
      for (const f of m.fighters) {
        if (f === p.owner) continue;
        if (f.invulnTo('proj', false)) continue;
        if (p.hit.ground && f.y > 2) continue;
        if (f.st === 'juggle' && f.combo.jug >= 16 && !p.hit.otg) continue;
        let touching = false;
        let pt = null;
        for (const hu of f.hurt) {
          if (JJK.Combat.overlap(p.box, hu)) {
            touching = true;
            pt = [(Math.max(p.box[0], hu[0]) + Math.min(p.box[2], hu[2])) / 2, (Math.max(p.box[1], hu[1]) + Math.min(p.box[3], hu[3])) / 2];
            break;
          }
        }
        if (!touching) continue;
        p.lastHit = p.t;
        const res = JJK.Combat.resolve(m, p.owner, f, p.hit, pt, { proj: p, kind: 'proj', moveId: p.moveId });
        if (res === 'nullified' || res === 'countered') { if (!p.pierce || res === 'countered') p.hitsLeft = 0; }
        else {
          p.hitsLeft--;
          if (res === 'hit' && p.onHit) p.onHit(p, f, m);
          if (res === 'block' && p.onBlock) p.onBlock(p, f, m);
        }
        if (p.hitsLeft <= 0 && !p.pierce) p.kill(m);
      }
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
  };
})();
