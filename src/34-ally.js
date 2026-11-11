// A hired mercenary: bought in the shop, he fights at the player's side until he is killed. He moves
// on the same motion capture and ragdoll as everyone else (so rounds stagger, wound and kill him),
// keeps a slot just behind and beside the player, never stands or fires across the player's line,
// picks his targets by threat (whoever is shooting at you, hollows closing in on you, the nearest
// visible gunman), gives each new target a human reaction time, and fires controlled bursts.
const MERC = { price: 1800, look: 'military_male_03', gun: 'rifle', tough: 1, react: [0.28, 0.42], slotSide: 1.9, slotBack: 0.3 };

class MercBrain {
  constructor(merc, person) {
    this.merc = merc; this.game = merc.game; this.p = person;
    this.def = { name: 'Mercenary', armor: true, speed: 1.75, voice: 0.95, light: true };
    this.gun = { ...ENEMY_GUNS[MERC.gun] };
    this.ammo = this.gun.mag;
    this.reloadT = 0;
    this.aiming = false;
    this.aimDir = new T3.Vector3(0, 0, 1);
    this.aimQ = new T3.Quaternion();
    this.knows = true;
    this.downed = false;
    this.lasing = 0;
    this.hp = 100; // claws and blows (rounds go through the injury model)
    this.target = null; this.acquiredT = 0; this.thinkT = 0; this.cool = 0; this.burst = 0;
    this.goal = null; this.pathT = -9;
    const c = person.ctl;
    c.assistGain *= 1.6; c.vAssist *= 2.3;
    quickGetUp(c, 3.2);
  }

  get pos() { return this.p.rd.pelvis.pos; }
  get headPos() { return this.p.rd.segments.head.body.pos; }
  hear() {}
  releaseToken() {}

  // the threat a hostile poses to the player and to him, lower is more urgent; null if he cannot see it
  threat(e, eyeAt) {
    const g = this.game, P = g.player.pos;
    if (e.downed || !e.combatEffective || !e.combatEffective()) return null;
    const ch = e.p.rd.segments.chest.body.pos;
    const d = Math.hypot(ch.x - eyeAt.x, ch.z - eyeAt.z);
    if (d > 32 || !g.level.visible(eyeAt, ch)) return null;
    const dp = Math.hypot(ch.x - P.x, ch.z - P.z);
    let s = d;
    if (e.hollow) s -= clamp(10 - dp, 0, 10) * 1.2; // hollows closing on the player first
    else if (e.aiming || e.token) s -= 6; // whoever is shooting at someone
    if (e === this.target) s -= 3; // stick with a target rather than flicking between them
    return s;
  }

  moveTo(pt, speed) {
    const c = this.p.ctl, pos = this.pos, g = this.game;
    if (Math.hypot(pt.x - pos.x, pt.z - pos.z) < 0.7) { if (c.walking) c.stopWalk('arrived'); return; }
    if (this.goal && Math.hypot(this.goal.x - pt.x, this.goal.z - pt.z) < 0.9 && c.walking && g.time - this.pathT < 1.4) { if (c.nav) c.nav.speed = speed; return; }
    const path = g.level.findPath(pos, pt, 0.34);
    if (!path || !path.length) return;
    this.goal = new I(pt.x, 0, pt.z); this.pathT = g.time;
    c.walkTo(path, null, { speed });
  }

  // where he wants to be: behind and to one side of the player, the side with room, out of the
  // player's line of fire
  slot() {
    const g = this.game, P = g.player, L = g.level;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = -fz, rz = fx;
    for (const side of [this.side || 1, -(this.side || 1)]) {
      const x = P.pos.x - fx * MERC.slotBack + rx * MERC.slotSide * side, z = P.pos.z - fz * MERC.slotBack + rz * MERC.slotSide * side;
      if (L.free(x, z, 0.35)) { this.side = side; return new I(x, 0, z); }
    }
    return new I(P.pos.x - fx * 1.2, 0, P.pos.z - fz * 1.2);
  }

  update(dt) {
    const g = this.game, c = this.p.ctl, P = g.player;
    if (!c.alive || !c.conscious) { this.aiming = false; return; }
    this.cool = Math.max(0, this.cool - dt);
    if (this.reloadT > 0) { this.reloadT -= dt; this.aiming = false; if (this.reloadT <= 0) this.ammo = this.gun.mag; }
    if (c.mode !== 'balance') { this.aiming = false; return; }
    const head = this.headPos;
    const eye = new I(head.x, head.y, head.z);
    // think a few times a second: target and position
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.22 + Math.random() * 0.08;
      let best = null, bs = Infinity;
      for (const e of g.enemies.alive) { const s = this.threat(e, eye); if (s !== null && s < bs) { bs = s; best = e; } }
      if (best !== this.target) { this.target = best; this.acquiredT = g.time + MERC.react[0] + Math.random() * (MERC.react[1] - MERC.react[0]); this.burst = 0; }
      const far = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      const s = this.slot();
      // keep up: walk when close, run to catch up; hold still to shoot when the slot is near
      if (far > 2.6 || !this.target) this.moveTo(s, far > 6 ? 3.8 : this.target ? 1.8 : 2.6);
      else if (c.walking && Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < 1.2) c.stopWalk('arrived');
    }
    const t = this.target;
    if (!t || t.downed || !P.alive) { this.aiming = false; return; }
    // aim at the chest, leading a mover a little
    const ch = t.p.rd.segments.chest.body;
    const want = new T3.Vector3(ch.pos.x + ch.vel.x * 0.08 - eye.x, ch.pos.y - eye.y - 0.05, ch.pos.z + ch.vel.z * 0.08 - eye.z).normalize();
    this.aimDir.lerp(want, 1 - Math.exp(-dt * 10)).normalize();
    this.aimQ.setFromEuler(new T3.Euler(Math.asin(clamp(this.aimDir.y, -1, 1)), Math.atan2(this.aimDir.x, this.aimDir.z) + Math.PI, 0, 'YXZ'));
    this.aiming = this.reloadT <= 0;
    if (!this.aiming || g.time < this.acquiredT || this.cool > 0) return;
    if (this.aimDir.dot(want) < 0.985) return; // not on target yet
    // never across the player: hold fire if the player is near the line, and shift sides
    const mz = this.muzzle();
    const tx = ch.pos.x - mz.x, tz = ch.pos.z - mz.z, tl = Math.hypot(tx, tz) || 1;
    const px = P.pos.x - mz.x, pz = P.pos.z - mz.z, along = (px * tx + pz * tz) / tl;
    if (along > 0 && along < tl && Math.abs(px * tz - pz * tx) / tl < 0.6) {
      // the player is in the way: step out to the other flank and fire from there
      if (this.game.time - (this.swapT || -9) > 1.2) { this.swapT = this.game.time; this.side = -(this.side || 1); this.moveTo(this.slot(), 2.8); }
      return;
    }
    if (this.ammo <= 0) { this.reloadT = this.gun.reload; g.audio.gunHandling('magOut', 'rifle'); if (g.sfx && g.sfx.say && Math.random() < 0.7) g.sfx.say(this, 'reload'); return; }
    this.fire(mz);
    this.burst = this.burst > 0 ? this.burst - 1 : 2 + Math.floor(Math.random() * 4);
    this.cool = this.burst > 0 ? 60 / this.gun.rpm : 0.32 + Math.random() * 0.4;
  }

  muzzle() {
    const r = this.game.renders.get(this.p);
    const m = r && r.gun && r.muzzleWorld ? r.muzzleWorld(new T3.Vector3()) : null;
    const h = this.headPos;
    return m ? new I(m.x, m.y, m.z) : new I(h.x + this.aimDir.x * 0.5, h.y - 0.2, h.z + this.aimDir.z * 0.5);
  }

  fire(mz) {
    const g = this.game, sb = g.sb;
    const dir = jitterDir(this.aimDir, this.gun.spread * 0.85 * (1 + 0.5 * this.p.ctl.pain));
    sb._shooter = 'ally';
    const paths = sb.fire(this.gun.ballistic, mz, new I(dir.x, dir.y, dir.z), { spreadScale: 0.0001, by: 'ally' });
    sb._shooter = null;
    this.ammo--;
    g.audio.gunshot(this.gun.sound, mz);
    g.effects.muzzleLight(toV3(mz), 1.1);
    const r = g.renders.get(this.p);
    if (r && r.muzzleFlash) r.muzzleFlash();
    if (this.anim) this.anim.onFire();
    if (g.blast && g.blast.casing) g.blast.casing(this, mz);
    if (paths && paths[0] && paths[0].to && Math.random() < 0.6) g.effects.tracer(toV3(mz), new T3.Vector3(paths[0].to.x, paths[0].to.y, paths[0].to.z));
  }
}

class Mercenary {
  constructor(game) {
    this.game = game;
    this.ai = null;
    this.hired = false;
    this.spawning = false;
    game.hooks.unshift(this); // first in line, so F revives him before it kicks anything
  }

  get alive() { return !!(this.ai && !this.ai.downed); }

  hire() {
    if (this.alive || this.spawning) return false;
    this.hired = true;
    this.spawn();
    return true;
  }

  async spawn() {
    const g = this.game, sb = g.sb;
    if (!sb || this.spawning) return;
    this.spawning = true;
    try {
      const gltf = await Assets.gltf('characters/' + MERC.look);
      if (!gltf || sb !== g.sb || !this.hired) return;
      const P = g.player, L = g.level;
      let pos = null;
      for (let k = 0; k < 40 && !pos; k++) {
        const a = P.yaw + Math.PI + (Math.random() - 0.5) * 2.4, d = 1.6 + Math.random() * 1.6;
        const x = P.pos.x - Math.sin(a) * d, z = P.pos.z - Math.cos(a) * d;
        if (L.free(x, z, 0.4) && sb.people.every((q) => Math.hypot(q.rd.pelvis.pos.x - x, q.rd.pelvis.pos.z - z) > 1)) pos = new I(x, 0, z);
      }
      if (!pos) return;
      const person = sb.spawnPerson(pos, P.yaw, { armor: { helmet: 1, vest: 0.7 }, look: 'br_ally', knockback: 0.6 });
      const ai = new MercBrain(this, person);
      person.ally = ai;
      const render = new CharacterRender(g, person, gltf, { tint: [0.92, 1, 0.92, 0] });
      render.setGun(ENEMY_GUNS[MERC.gun].model, { light: true });
      g.attachRender(person, render);
      if (ANIM.lib) { try { ai.anim = new AnimBody(ai, render, gltf, ANIM.lib); ai.anim.enter(0); } catch (e) { ai.anim = null; } }
      this.ai = ai;
      if (g.hud) g.hud.toast('MERCENARY ON SITE');
      if (g.sfx && !(g.sfx.say && g.sfx.say(ai, 'ack', { force: true }))) g.sfx.radio(ai.headPos);
    } finally { this.spawning = false; }
  }

  onLevel() {
    // the old body went with the old level; a living hire comes down with the player
    const wasAlive = this.alive;
    this.ai = null;
    if (this.hired && wasAlive) setTimeout(() => { if (this.hired && !this.ai) this.spawn(); }, 1200);
  }

  step(dt) {
    const ai = this.ai;
    if (!ai) return;
    const c = ai.p.ctl, inj = ai.p.injury;
    if (!ai.downed && (!inj.alive || (!c.conscious && (ai.koT = (ai.koT || 0) + dt) > 1.5))) {
      ai.downed = true; ai.aiming = false; ai.downT = this.game.time;
      if (ai.anim) ai.anim.wake('down');
      c.autoGetUp = false;
      if (this.game.hud) this.game.hud.toast(inj.alive ? 'MERCENARY DOWN · F TO REVIVE' : 'MERCENARY KILLED');
    }
    if (ai.downed) {
      if (!inj.alive) { this.hired = false; if (!ai.p.frozen && this.game.time - ai.downT > 10 && this.game.sb.people.includes(ai.p)) this.game.sb.freezePerson(ai.p); return; }
      // coming round after a revive
      if (this.waking) {
        if (inj.conscious) {
          this.waking = 0; ai.downed = false; ai.koT = 0; ai.hp = 70; c.autoGetUp = true; this.hired = true;
          if (this.game.hud) this.game.hud.toast('MERCENARY BACK IN THE FIGHT');
          if (this.game.sfx && !(this.game.sfx.say && this.game.sfx.say(ai, 'thanks', { force: true }))) this.game.sfx.radio(ai.headPos);
        } else if (this.game.time - this.waking > 3) { this.waking = 0; if (this.game.hud) this.game.hud.toast('HE IS TOO FAR GONE'); }
        return;
      }
      // a revive in progress: stay close for two seconds
      if (this.revive) {
        const P = this.game.player.pos, d = Math.hypot(P.x - ai.pos.x, P.z - ai.pos.z);
        if (d > 2.2 || !this.game.player.alive) { this.revive = null; if (this.game.hud) this.game.hud.toast('REVIVE INTERRUPTED'); }
        else if ((this.revive.t += dt) > 2) { this.revive = null; this.reviveNow(); }
      }
      return;
    }
    ai.update(dt);
    if (ai.anim) ai.anim.step(dt);
  }

  // F next to him while he is down (but alive): two seconds of patching him up
  melee() {
    const ai = this.ai, g = this.game;
    if (!ai || !ai.downed || !ai.p.injury.alive || this.revive) return false;
    const P = g.player.pos;
    if (Math.hypot(P.x - ai.pos.x, P.z - ai.pos.z) > 1.8) return false;
    this.revive = { t: 0 };
    if (g.hud) g.hud.toast('REVIVING…');
    if (g.sfx) g.sfx.medkit('open');
    return true;
  }

  // on his feet again: conscious, the bleeding clotted off, ready to fight
  reviveNow() {
    const ai = this.ai, g = this.game, inj = ai.p.injury;
    // let the injury model bring him round itself (it tells the controller), with the bleeding
    // clotted off and no knockout left to sit out
    inj.koTimer = 0; inj.concussion = 0;
    if (inj.hypoxia !== undefined) inj.hypoxia = Math.min(inj.hypoxia, 0.5);
    for (const w of inj.wounds || []) for (const b of w.bleeds || []) b.clot = b.clotMax;
    this.waking = g.time;
    if (g.sfx) g.sfx.medkit('inject');
  }

  // rounds that hit him put him on the ragdoll for a moment, like anyone else
  fx(e) {
    // a hollow's claws: knocked about, and enough of them put him down
    if (this.ai && e.type === 'zombieHit' && e.victim === this.ai.p && !this.ai.downed) {
      this.ai.hp -= 22;
      if (this.ai.anim) this.ai.anim.wake('hit');
      if (this.game.sfx) this.game.sfx.pain(this.ai.headPos, this.ai.hp < 30 ? 'cry' : 'grunt', 0.95);
      if (this.ai.hp <= 0) this.ai.p.injury.knockOut(60, 0.6);
    }
    if (this.ai && e.person === this.ai.p && (e.type === 'fleshHit' || e.type === 'armorHit') && this.ai.anim && e.type === 'fleshHit') this.ai.anim.wake('hit');
    return false;
  }

  // a marker over his head, so he is never mistaken for a hostile
  frame() {
    const g = this.game;
    if (!this.tag) {
      if (!g.hud || !g.hud.root) return;
      this.tag = document.createElement('div');
      this.tag.className = 'merc-tag';
      this.tag.textContent = '▼ MERC';
      g.hud.root.appendChild(this.tag);
    }
    const ai = this.ai;
    if (!ai || ai.downed || g.state !== 'play') { this.tag.style.display = 'none'; return; }
    const h = ai.headPos, v = new T3.Vector3(h.x, h.y + 0.35, h.z).project(g.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { this.tag.style.display = 'none'; return; }
    this.tag.style.display = '';
    this.tag.style.transform = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - v.y) / 2 * innerHeight).toFixed(0)}px) translate(-50%, -100%)`;
  }
}
