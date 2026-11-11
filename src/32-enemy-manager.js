// Spawning, shooter tokens, enemy ballistics vs the player, kills and loot, grenades.

// physics objects the game adds to the engine's throwable table
Object.assign(Lab.Throwables, {
  br_grenade: { label: 'Frag grenade', mass: 0.4, speed: 14, spin: [4, 6, 2], material: 'metal', friction: 0.6, restitution: 0.32, drag: 0.002, shapes: [{ type: 'sphere', r: 0.034 }] },
  br_gun_small: { label: 'Pistol', mass: 0.9, speed: 3, spin: [3, 5, 2], material: 'metal', friction: 0.6, restitution: 0.15, drag: 0.004, shapes: [{ type: 'box', half: [0.016, 0.06, 0.09], r: 0.006 }] },
  br_gun_long: { label: 'Rifle', mass: 3.4, speed: 3, spin: [2, 4, 1], material: 'metal', friction: 0.6, restitution: 0.1, drag: 0.006, shapes: [{ type: 'box', half: [0.025, 0.08, 0.42], r: 0.01 }] },
});
Object.assign(Lab.Ballistics, {
  br_fragment: { label: 'Fragment', round: 'steel fragment', mass: 0.0012, speed: 1100, diameter: 0.005, pen: 0.4, pellets: 1, spread: 0, rpm: 0, auto: false, recoil: 0, kick: 0 },
});

class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.tokensUsed = 0;
    this.maxTokens = 2;
    this.events = [];
    this.drops = [];
    this.grenades = [];
    this.corpses = [];
    this.scale = { tough: 1, speed: 1, spread: 1, react: 1, dmg: 1 };
    this.wave = 1;
    this.radioT = 0;
    this.gen = 0; // bumped by clear(): async spawns from before it are dropped
    game.hooks.push(this);
    game.damagePlayer = (amt, from, kind) => this.damagePlayer(amt, from, kind);
  }

  onLevel() {
    if (CharacterRender._warm) CharacterRender._warm.clear(); // new scene, new lights: compile again
    this.list.length = 0;
    this.tokensUsed = 0;
    this.drops.length = 0;
    this.grenades.length = 0;
    this.corpses.length = 0;
    const sb = this.game.sb, L = this.game.level;
    // tag every engine effect with whoever fired the shot that caused it
    const orig = sb.fx.bind(sb);
    sb.fx = (e) => {
      if (sb._shooter && e.by === undefined) e.by = sb._shooter;
      // an animated enemy goes physical the instant it is hit, so this bullet's impulse (applied
      // just before the effect is emitted) and the knock that follows act on a live ragdoll
      // light hits are ridden out on the animation instead (a flinch and a stumble); a body getting
      // up from the floor goes straight back to the ragdoll
      let soft = null;
      if ((e.type === 'fleshHit' || e.type === 'armorHit') && !e.severedPart && e.person && e.person.enemy && e.person.enemy.anim) {
        const ai = e.person.enemy, an = ai.anim;
        if (an.mode === 'anim' && this.rideOut(ai, e)) { soft = an; e.soft = true; }
        else an.wake('hit');
      }
      orig(e);
      if (soft && soft.active) {
        // the controller's own reactions to this hit would fire stale on the next wake: drop them
        const c = e.person.ctl;
        c.startle = 0;
        if (c.flinch) c.flinch.amount = 0;
        if (c.snap) c.snap.t0 = -9;
        soft.flinch(e);
      }
    };
    // the engine only knows its own obstacles: route hollows (and any replanning walker) through
    // the maze instead of straight into walls
    sb.zombieRoute = (a, b) => {
      if (L.segmentClear(a.x, a.z, b.x, b.z, 1.0, 0.3, 0.25)) return [new I(b.x, 0, b.z)];
      return L.findPath(a, b, 0.3) || [new I(b.x, 0, b.z)];
    };
    sb.planRoute = (from, goals) => {
      const path = [], goalEnds = [];
      let cur = from;
      for (const goal of goals) {
        const seg = L.findPath(cur, goal, 0.34);
        if (!seg || !seg.length) return null;
        path.push(...seg);
        goalEnds.push(path.length - 1);
        cur = seg[seg.length - 1];
      }
      return { path, goalEnds };
    };
    // hollow claws go through the same armour / god-mode / stats path as gunfire
    sb.hitPlayer = (amt, from, kind = 'hit', by = null) => {
      if (!sb.player || !sb.player.alive) return;
      this.damagePlayer(amt, from, kind);
      // a brute's blow throws the player back
      if (by && by.enemy && by.enemy.def.variant === 'brute') {
        const P = sb.player, dx = P.pos.x - from.x, dz = P.pos.z - from.z, dl = Math.hypot(dx, dz) || 1;
        P.vel.x += (dx / dl) * 6.5; P.vel.z += (dz / dl) * 6.5; P.vel.y = Math.max(P.vel.y, 2.2);
        this.game.shake = Math.max(this.game.shake || 0, 1);
      }
      sb.fx({ type: 'playerHit', amount: amt, from: from.clone(), kind, by });
    };
  }

  get alive() { return this.list.filter((a) => !a.downed); }
  renderOf(ai) { return this.game.renders.get(ai.p); }

  // ---- spawning --------------------------------------------------------------------------------
  async spawn(type, pos, yaw) {
    const def = ENEMY_TYPES[type];
    // from this wave's cast, the face used least so far (never a row of twins)
    const pool = (this.cast && this.cast[type]) || def.looks, used = this.lookUse || (this.lookUse = {});
    let look = pool[0], best = Infinity;
    for (const l of pool) { const u = (used[l] || 0) + Math.random() * 0.9; if (u < best) { best = u; look = l; } }
    used[look] = (used[look] || 0) + 1;
    const game = this.game, sb = game.sb, gen = this.gen;
    const gltf = await Assets.gltf('characters/' + look);
    // the level or the run changed while the model loaded
    if (!gltf || sb !== game.sb || gen !== this.gen) return null;
    // never drop a body into another one
    const L = game.level;
    const clear = (x, z) => L.free(x, z, 0.4) && sb.people.every((p) => Math.hypot(p.rd.pelvis.pos.x - x, p.rd.pelvis.pos.z - z) > 1.0) && Math.hypot(game.player.pos.x - x, game.player.pos.z - z) > 2.5;
    if (!clear(pos.x, pos.z)) {
      let found = null;
      for (let k = 0; k < 40 && !found; k++) {
        const a = Math.random() * TAU, d = 0.8 + Math.random() * 2.5;
        if (clear(pos.x + Math.cos(a) * d, pos.z + Math.sin(a) * d)) found = new I(pos.x + Math.cos(a) * d, 0, pos.z + Math.sin(a) * d);
      }
      if (!found) return null;
      pos = found;
    }
    let person, ai;
    if (def.hollow) {
      person = sb.spawnZombie(pos, yaw, def.melee || 'runner');
      ai = new HollowWrap(this, person, type, this.scale);
    } else {
      // fighters brace against hits: they stagger more than they fall
      person = sb.spawnPerson(pos, yaw, { armor: def.armor ? { ...def.armor } : null, look: 'br_' + type, knockback: def.knockback ?? 0.72 });
      const gunId = randPick(def.guns);
      ai = new Gunman(this, person, type, gunId, this.scale);
      person.zombie = ai;
    }
    person.enemy = ai;
    ai.spawnT = game.time;
    const render = new CharacterRender(game, person, gltf, { tint: def.variant === 'brute' ? [0.55, 0.52, 0.5, 0.95] : def.variant === 'crawler' ? [0.82, 0.8, 0.76, 0.9] : def.hollow ? [0.72, 0.7, 0.68, 0.8] : def.boss ? [0.85, 0.85, 0.85, 0] : [1, 1, 1, 0] });
    CharacterRender.prewarmBaked(game, render, look); // once per look and level
    if (!def.hollow) render.setGun(ENEMY_GUNS[ai.gunId].model, { drum: ENEMY_GUNS[ai.gunId].drum, light: def.light, laser: ENEMY_GUNS[ai.gunId].laser });
    game.attachRender(person, render);
    // gunmen move on motion-capture animation until something knocks them about
    if (!game.settings.physicsEnemies) {
      const lib = def.hollow ? (def.variant ? ANIM.libs.zombie || hollowAnimSet() : hollowAnimSet()) : ANIM.lib;
      if (lib) {
        try {
          ai.anim = def.hollow ? new AnimBody(ai, render, gltf, lib, { melee: person.zombie, maxRate: def.variant === 'crawler' ? 2.9 : lib.key === 'limp' ? 3.0 : 2.4, lean: def.variant === 'crawler' ? 1.0 : def.variant === 'brute' ? 0.2 : undefined }) : new AnimBody(ai, render, gltf, lib);
          ai.anim.enter(0);
        } catch (e) { console.warn('[anim] enemy stays physical', e); ai.anim = null; }
      }
    }
    this.list.push(ai);
    // every new arrival has a rough idea where the fight is
    ai.hear(game.player.pos, 10);
    ai.knows = Math.random() < 0.6;
    return ai;
  }

  // ---- tokens & coordination -------------------------------------------------------------------
  requestToken(ai) {
    if (ai.token) return true;
    if (this.tokensUsed >= this.maxTokens) return false;
    ai.token = true;
    this.tokensUsed++;
    return true;
  }
  engagedCount() { return this.list.filter((a) => !a.downed && a.visible).length; }
  aggression(ai) { return this.alive.length <= 2 || ai.def.aggression > 0.7 || this.game.player.health < 35; }

  playerHint(ai) {
    const P = this.game.player.pos;
    const k = ai.def.role === 'rush' ? 2 : 7;
    return new I(P.x + (Math.random() - 0.5) * k, 0, P.z + (Math.random() - 0.5) * k);
  }

  spotted(ai) {
    for (const o of this.list) {
      if (o === ai || o.downed || !o.hear) continue;
      if (Math.hypot(o.pos.x - ai.pos.x, o.pos.z - ai.pos.z) < 20) o.hear(ai.lastSeen || this.game.player.pos, 1.5);
    }
    this.bark(ai, 'contact');
  }

  lineToPoint(ai, pt) { return this.game.level.visible(ai.headPos, { x: pt.x, y: 1.1, z: pt.z }); }

  bark(ai, kind = 'chatter') {
    const sfx = this.game.sfx;
    if (!sfx) return false;
    // recorded callouts when the build has them (src/53-sfx.js say())
    if (!ai.hollow && sfx.say) {
      let grp = { contact: 'alert', search: 'search', reload: 'reload', grenade: 'grenade', blast: 'blast', mandown: 'mandown', push: 'push', hit: 'hit', kill: 'kill' }[kind];
      if (kind === 'chatter') grp = Math.random() < 0.4 ? (Math.random() < 0.5 ? 'push' : 'alert') : null;
      if (grp && sfx.say(ai, grp, { force: kind === 'grenade' })) return true;
      if (sfx.hasVox && sfx.hasVox('alert')) { if (ai.def.light && kind === 'chatter') sfx.radio(ai.headPos); return false; }
    }
    if (kind === 'contact' && !ai.hollow) sfx.voice(ai.headPos, 'alert', ai.def.voice || 1);
    if (kind === 'search' && !ai.hollow) { sfx.voice(ai.headPos, 'search', ai.def.voice || 1); return; }
    if (ai.def.light && kind !== 'reload') sfx.radio(ai.headPos);
    else if (kind === 'reload' || Math.random() < 0.4) this.game.audio.grunt(0.35 + Math.random() * 0.3, ai.headPos);
  }

  // ---- shooting ----------------------------------------------------------------------------------
  traceEnemyShot(ai, muzzle, dir) {
    const game = this.game, sb = game.sb, P = game.player;
    const people = sb.people.filter((p) => p !== ai.p);
    const proj = Lab.projectile(Lab.Ballistics[ai.gun.ballistic]);
    sb._shooter = ai;
    const res = Lab.traceShot({ world: sb.world, people, shape: anatomy(), forceScale: sb.settings.forceScale, fx: (e) => sb.fx(e) }, toP3(muzzle), new I(dir.x, dir.y, dir.z), proj, 120);
    sb._shooter = null;
    const end = toV3(res.end);
    const maxT = end.distanceTo(muzzle);
    // the player: a capsule from the shins to the top of the head
    let hitPlayer = null;
    if (P.alive) {
      const top = P.pos.y + P.eyeHeight + 0.12, bot = P.pos.y + 0.15, r = 0.27;
      const dx = P.pos.x - muzzle.x, dz = P.pos.z - muzzle.z;
      const dh = Math.hypot(dir.x, dir.z) || 1e-6;
      const t = (dx * dir.x + dz * dir.z) / (dh * dh);
      if (t > 0 && t < maxT + 0.3) {
        const cx = muzzle.x + dir.x * t, cz = muzzle.z + dir.z * t, cy = muzzle.y + dir.y * t;
        const off = Math.hypot(cx - P.pos.x, cz - P.pos.z);
        if (off < r && cy > bot && cy < top) hitPlayer = { y: cy, head: cy > P.pos.y + P.eyeHeight - 0.14 };
        else {
          const headY = P.pos.y + P.eyeHeight;
          const miss = Math.hypot(off, (cy - headY) * 0.8);
          if (miss < 1.3) this.nearMiss(muzzle, new T3.Vector3(cx, cy, cz), miss);
        }
      }
    }
    return { from: muzzle, to: hitPlayer ? new T3.Vector3(muzzle.x + dir.x * 40, muzzle.y + dir.y * 40, muzzle.z + dir.z * 40) : end, dir, hitPlayer, maxT };
  }

  onEnemyShot(ai, muzzle, paths) {
    const game = this.game;
    if (game.blast && game.blast.casing) game.blast.casing(ai, muzzle);
    game.audio.gunshot(ai.gun.sound, toP3(muzzle));
    game.effects.muzzleLight(muzzle, 1.2);
    for (const p of paths) {
      if (Math.random() < 0.65) {
        const to = p.hitPlayer ? game.player.eye(new I()) : p.to;
        game.effects.tracer(muzzle.clone(), new T3.Vector3(to.x, to.y - (p.hitPlayer ? 0.35 : 0), to.z));
      }
    }
    let total = 0, head = false;
    for (const p of paths) if (p.hitPlayer) { total += ai.gun.dmg; head = head || p.hitPlayer.head; }
    if (total > 0) {
      const d = muzzle.distanceTo(toV3(game.player.pos));
      const falloff = clamp(1.15 - d / (ai.gun.range * 2.2), 0.45, 1);
      this.damagePlayer(total * falloff * this.scale.dmg * (head ? 1.5 : 1), toP3(muzzle), head ? 'headshot' : 'bullet');
    }
    for (const h of this.game.hooks) h.onEnemyFire && h.onEnemyFire(ai, muzzle);
  }

  nearMiss(from, at, miss) {
    const g = this.game;
    g.suppression = Math.min(1, (g.suppression || 0) + 0.18 * (1.3 - miss));
    if (g.sfx) g.sfx.crack(toP3(at), 1.3 - miss);
  }

  damagePlayer(amount, from, kind = 'bullet') {
    const g = this.game, P = g.player;
    if (!P.alive || g.godMode) return;
    const st = g.stats;
    // armour plates absorb most of a hit until they are gone
    let absorbed = 0;
    if (g.armor > 0 && kind !== 'fall') {
      absorbed = Math.min(g.armor, amount * 0.65);
      g.armor -= absorbed * 1.1;
      if (g.armor < 0) g.armor = 0;
    }
    const dmg = amount - absorbed;
    P.damage(dmg, from, kind === 'headshot' ? 'hit' : kind);
    if (st) st.damageTaken += dmg;
    g.lastHurtFrom = from;
    for (const h of g.hooks) h.onPlayerDamaged && h.onPlayerDamaged(dmg, from, kind, absorbed);
  }

  // ---- engine effects ----------------------------------------------------------------------------
  fx(e) {
    const g = this.game;
    switch (e.type) {
      case 'fleshHit': {
        const ai = e.person.enemy;
        if (e.severedPart) return false; // a limb lying on the floor: blood, but no harm to its owner
        if (ai && ai.anim && !e.soft) ai.anim.wake('hit');
        // the dying take no more punishment: another round finishes them
        if (ai && ai.agony && e.person.injury.alive) { e.person.injury.kill('gunshot wounds'); ai.agony = null; }
        if (ai && !ai.downed) {
          const mult = SEG_MULT[e.seg.name] ?? 0.8;
          const dmg = e.energy * 0.11 * mult * (e.by === 'player' ? g.perks.damage : e.by === 'ally' ? 0.85 : 0.5) * (e.dmScale ?? 1);
          if (e.by === 'ally') ai.lastHit = { by: 'ally', seg: e.seg.name, time: g.time };
          ai.tough -= dmg;
          if (e.by === 'player' || e.by === 'player-grenade') {
            ai.lastHit = { by: 'player', seg: e.seg.name, time: g.time, weapon: g.arsenal.gun.id, grenade: e.by === 'player-grenade' };
            if (ai.hear) ai.hear(g.player.pos, 0.5);
            if (ai.suppressed !== undefined) ai.suppressed = Math.min(2, ai.suppressed + 0.3); // shaken, not cowed
          }
          if (ai.tough <= 0) this.finish(ai, e);
          // a leg hit he stays up through leaves a limp (it does not heal down here)
          if (ai.tough > 0 && /^(thigh|shin|foot)/.test(e.seg.name)) ai.limp = Math.min(1, (ai.limp || 0) + 0.45);
          if (ai.tough <= 0) void 0;
          else if (!ai.hollow && ai.gun && /^(handR|forearmR)$/.test(e.seg.name) && e.energy > 120 && !ai.disarmedT && Math.random() < 0.8) this.disarm(ai);
          // the living cry out (hollows have their own snarls); not on every pellet
          if (!ai.hollow && g.sfx && e.person.injury.alive && e.person.injury.conscious && g.time - (ai.painT ?? -9) > 0.5) {
            ai.painT = g.time;
            const bad = e.energy > 650 || ai.tough <= 0;
            if (!(bad && ai.tough > 0 && !ai.agony && Math.random() < 0.3 && this.bark(ai, 'hit')))
              g.sfx.pain(ai.headPos, ai.agony ? 'scream' : bad ? 'cry' : 'grunt', ai.def.voice || 1);
          }
        }
        return false;
      }
      case 'armorHit':
        if (e.person && e.person.enemy && e.person.enemy.anim && !e.soft) e.person.enemy.anim.wake('armor');
        return false;
      case 'zombieGroan':
        if (e.near < 24) g.audio.zombieGroan(e.kind, e.person.rd.segments.head.body.pos, clamp(1.2 - e.near / 20, 0.3, 1));
        return true;
      case 'zombieSwing':
        g.audio.zombieSnarl(e.kind, e.person.rd.segments.head.body.pos);
        return true;
      case 'objectAdded':
      case 'objectRemoved':
      case 'personAdded':
      case 'personRemoved':
      case 'personFrozen':
      case 'throw':
        return true;
      case 'playerHit': // already applied through damagePlayer (see onLevel)
        return true;
    }
    return false;
  }

  // a round through the gun hand or forearm knocks the weapon out of it: it clatters to the floor (a
  // real pickup) and, after a moment of scrambling, he draws a backup pistol from his belt
  disarm(ai) {
    const g = this.game, r = this.renderOf(ai);
    if (!r || !r.gun) return;
    const mesh = r.dropGun();
    if (mesh) this.dropGun(ai, mesh);
    ai.disarmedT = g.time;
    ai.aiming = false;
    ai.releaseToken();
    const backup = ENEMY_GUNS.pistol;
    ai.gunId = 'pistol'; ai.gun = backup; ai.ammo = backup.mag;
    ai.reloadT = 1.4 + Math.random() * 1.1; // drawing the sidearm
    if (ai.anim) ai.anim.pistol = true;
    setTimeout(() => { if (!ai.downed && this.renderOf(ai) === r && !r.gun) r.setGun(backup.model, {}); }, 900);
    if (g.hud && g.hud.feed) g.hud.feed('DISARMED', 'hs');
    if (g.sfx) g.sfx.pain(ai.headPos, 'cry', ai.def.voice || 1);
  }

  // whether an animated enemy rides a hit out on its feet (a flinch, a stumble) or goes over to
  // the ragdoll: heavy rounds, the head and neck, a leg that gives, a quick second hit (pellets
  // land together) and a body already badly hurt all go physical
  rideOut(ai, e) {
    const an = ai.anim, now = this.game.time;
    const seg = e.seg ? e.seg.name : '';
    const en = e.energy || 0;
    // hits in quick succession pile up; the hollowed shrug off one more than the living
    an.hits = now - an.lastHitT < (ai.hollow ? 0.6 : 0.8) ? an.hits + 1 : 1;
    an.lastHitT = now;
    const why = (r) => { an.ride = { r, seg, en: Math.round(en), type: e.type, hits: an.hits }; return r === 'ok'; };
    // a brute walks through what would floor a man: only heavy rounds and the head stop it
    if (ai.def.variant === 'brute') return why(seg === 'head' && en > 900 ? 'head' : en > 2200 ? 'heavy' : 'ok');
    if (an.hits > (ai.hollow ? 2 : 1)) return why('repeat');
    if (e.type === 'armorHit') return why(en < 2600 ? 'ok' : 'plate');
    if (seg === 'head' || seg === 'neck') return why('head');
    if (/^(thigh|shin|foot)/.test(seg) && (e.bone || en > (ai.hollow ? 520 : 380))) return why('leg');
    if (en > (ai.hollow ? 1100 : 750)) return why('heavy');
    if (ai.tough < ai.toughMax * (ai.hollow ? 0.22 : 0.4)) return why('hurt');
    return why('ok');
  }

  // a person ran out of toughness: decide how they go down
  finish(ai, e) {
    const inj = ai.p.injury, c = ai.p.ctl;
    if (ai.anim) ai.anim.wake('down');
    if (!inj.alive) return;
    const seg = e.seg.name;
    // the hollowed cannot be knocked out: they only stop when they are dead
    if (inj.undead || seg === 'head' || seg === 'neck' || e.energy > 1100) { inj.kill(seg === 'head' ? 'gunshot wound to the head' : 'gunshot wounds'); return; }
    const r = Math.random();
    if (r < 0.38) this.agonize(ai);
    else if (r < 0.62) inj.kill('gunshot wounds');
    else {
      inj.knockOut(9999, 1);
      c.autoGetUp = false;
    }
  }

  // fatally hurt but still awake: the legs go and they fold to the floor, clutch the wound, groan,
  // kick and try to roll over, weaker each time, until they bleed out
  agonize(ai) {
    const c = ai.p.ctl;
    c.autoGetUp = false;
    ai.agony = { t: 0, dur: 4 + Math.random() * 8, groanT: 0.5 + Math.random() * 0.8, moveT: 0.9 + Math.random() * 0.8 };
    if (this.game.sfx) setTimeout(() => this.game.sfx.pain(ai.headPos, 'scream', ai.def.voice || 1), 120);
    this.down(ai); // out of the fight (and counted), but left alive
  }

  updateAgony(ai, dt) {
    const a = ai.agony, p = ai.p, inj = p.injury, g = this.game;
    if (!inj.alive || !inj.conscious || ai.frozen) { ai.agony = null; return; }
    a.t += dt;
    const life = 1 - a.t / a.dur;
    if (life <= 0) { inj.kill('blood loss'); ai.agony = null; return; }
    // the legs will not hold them any more; the arms still press on the wounds (the engine does that
    // by itself while they are awake)
    if (inj.buckle) { inj.buckle.L = Math.min(inj.buckle.L, 0.06); inj.buckle.R = Math.min(inj.buckle.R, 0.06); inj.buckle.trunk = Math.min(inj.buckle.trunk, 0.35 + 0.4 * life); }
    const S = p.rd.segments;
    a.groanT -= dt;
    if (a.groanT <= 0) {
      a.groanT = 1.1 + Math.random() * 2.2 + (1 - life) * 1.5;
      const h = S.head.body.pos;
      if (g.sfx && Math.hypot(h.x - g.player.pos.x, h.z - g.player.pos.z) < 26) g.sfx.moan(h, 0.35 + 0.65 * life);
    }
    a.moveT -= dt;
    if (a.moveT > 0 || p.ctl.mode === 'balance') return;
    a.moveT = 0.5 + Math.random() * 1.3 + (1 - life) * 1.2;
    const k = 0.35 + 0.65 * life, imp = new I();
    const pick = Math.random();
    const on = (s) => s && !(p.severed && p.severed.has(s.name)); // a part shot off does not move with them
    if (pick < 0.35) {
      // a leg kicks or drags
      const side = Math.random() < 0.5 ? 'L' : 'R', shin = S['shin' + side], foot = S['foot' + side];
      if (on(shin) && on(foot)) {
        const d = new I().subVectors(foot.body.pos, S.pelvis ? S.pelvis.body.pos : p.rd.pelvis.pos);
        d.y = 0; if (d.lengthSq() > 1e-6) d.normalize();
        const back = Math.random() < 0.6 ? -1 : 1; // mostly drawing the knee up
        imp.set(d.x * back * 2.4 * k, 1.2 * k, d.z * back * 2.4 * k);
        foot.body.applyImpulse(imp, foot.body.pos);
      }
    } else if (pick < 0.6) {
      // tries to roll onto a side
      const ch = S.chest.body, sideways = new I(Math.random() - 0.5, 0, Math.random() - 0.5);
      if (sideways.lengthSq() > 1e-6) sideways.normalize();
      imp.set(sideways.x * 9 * k, 4 * k, sideways.z * 9 * k);
      ch.applyImpulse(imp, new I(ch.pos.x + sideways.x * 0.12, ch.pos.y, ch.pos.z + sideways.z * 0.12));
    } else if (pick < 0.8) {
      // lifts the head, then lets it fall back
      imp.set(0, 2.2 * k, 0);
      if (on(S.head)) S.head.body.applyImpulse(imp, S.head.body.pos);
      if (on(S.neck)) S.neck.body.applyImpulse(new I(0, 1.4 * k, 0), S.neck.body.pos);
    } else {
      // an arm reaches out or claws at the floor
      const side = Math.random() < 0.5 ? 'L' : 'R', hand = S['hand' + side], fore = S['forearm' + side];
      if (on(hand)) {
        const a2 = Math.random() * TAU;
        imp.set(Math.cos(a2) * 1.6 * k, 1.5 * k, Math.sin(a2) * 1.6 * k);
        hand.body.applyImpulse(imp, hand.body.pos);
        if (on(fore)) fore.body.applyImpulse(imp.scale(0.6), fore.body.pos);
      }
    }
  }

  // the AI reports itself out of the fight
  down(ai) {
    if (ai.downed) return;
    if (ai.anim) ai.anim.wake('down');
    ai.downed = true;
    ai.aiming = false;
    ai.releaseToken();
    const p = ai.p, g = this.game;
    // whatever brought them down (kick, bleed-out, a hollow out of toughness), they stay down
    if (p.injury.alive && !ai.agony && (p.injury.undead || p.ctl.mode === 'balance' || p.ctl.mode === 'getup')) {
      p.injury.kill(ai.lastHit && ai.lastHit.weapon === 'kick' ? 'blunt trauma' : 'injuries');
    }
    p.ctl.autoGetUp = false;
    p.ctl.armDriver = null;
    if (p.ctl.walking) p.ctl.stopWalk('down');
    const r = this.renderOf(ai);
    if (r) {
      const gun = r.dropGun();
      if (gun) this.dropGun(ai, gun);
    }
    const lh = ai.lastHit;
    const byPlayer = !!lh && lh.by === 'player' && g.time - lh.time < 6;
    const head = byPlayer && (lh.seg === 'head' || lh.seg === 'neck');
    const dist = Math.hypot(ai.pos.x - g.player.pos.x, ai.pos.z - g.player.pos.z);
    ai.diedAt = g.time;
    // a last cry (not from a headshot, and the dying in agony have their own screams)
    if (!ai.hollow && !ai.agony && !head && g.sfx && Math.random() < 0.75) setTimeout(() => g.sfx.voice(ai.headPos, 'death', ai.def.voice || 1), 60 + Math.random() * 200);
    this.corpses.push(ai);
    // a gunman who sees his man go down calls it
    if (!ai.hollow && Math.random() < 0.6) {
      const mate = this.alive.find((o) => o !== ai && !o.hollow && !o.downed && Math.hypot(o.pos.x - ai.pos.x, o.pos.z - ai.pos.z) < 18);
      if (mate) setTimeout(() => { if (!mate.downed) this.bark(mate, 'mandown'); }, 500 + Math.random() * 600);
    }
    const byAlly = !!lh && lh.by === 'ally' && g.time - lh.time < 6;
    this.events.push({ type: 'kill', ai, byPlayer, byAlly, head, dist, grenade: !!(lh && lh.grenade), weapon: lh && lh.weapon });
    // bodies stay where they fell for the rest of the level (frozen ones cost no physics)
  }

  removeCorpse(ai) {
    const g = this.game;
    this.corpses = this.corpses.filter((x) => x !== ai);
    this.list = this.list.filter((x) => x !== ai);
    g.detachRender(ai.p);
    if (g.sb.people.includes(ai.p)) g.sb.removePerson(ai.p);
  }

  dropGun(ai, mesh) {
    const g = this.game, sb = g.sb;
    const long = ai.gun.hold !== 'pistol';
    const p = mesh.position, q = mesh.quaternion;
    const obj = sb.addObject(long ? 'br_gun_long' : 'br_gun_small', new I(p.x, Math.max(p.y, 0.15), p.z), new Lab.Quat(q.x, q.y, q.z, q.w));
    const hand = ai.p.rd.segments.handR.body;
    obj.body.vel.copy(hand.vel).scale(0.8);
    obj.body.angVel.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    // the mesh's origin is the grip, the collider is centred on the receiver
    mesh.userData.offset = long ? new T3.Vector3(0, 0, 0.12) : new T3.Vector3(0, 0.01, 0.03);
    this.drops.push({ obj, mesh, t: 0, ammo: ai.gun.ballistic, taken: false, value: Math.round(ai.def.cash * 0.12) });
    if (this.drops.length > 16) this.removeDrop(this.drops[0]);
  }

  removeDrop(d) {
    this.drops = this.drops.filter((x) => x !== d);
    this.game.view.scene.remove(d.mesh);
    if (d.mesh.userData.owned) { disposeTree(null, d.mesh.userData.owned); d.mesh.userData.owned = null; }
    if (this.game.sb.objects.includes(d.obj)) this.game.sb.removeObject(d.obj);
  }

  // ---- grenades ----------------------------------------------------------------------------------
  launchGrenade(thrower, target) {
    const g = this.game, sb = g.sb;
    let from, dir, speed;
    if (thrower === 'player') {
      const P = g.player, eye = P.eye(new I());
      const v = g.viewDir(new T3.Vector3());
      from = new I(eye.x + v.x * 0.4, eye.y - 0.1 + v.y * 0.4, eye.z + v.z * 0.4);
      dir = new I(v.x, v.y + 0.18, v.z).normalize();
      speed = 13;
    } else {
      const h = thrower.headPos;
      from = new I(h.x, h.y + 0.2, h.z);
      const dx = target.x - h.x, dz = target.z - h.z, d = Math.hypot(dx, dz);
      speed = clamp(Math.sqrt(d * 9.81 / Math.sin(2 * 0.6)) * 0.95, 6, 15);
      dir = new I(dx / d * Math.cos(0.6), Math.sin(0.6), dz / d * Math.cos(0.6));
    }
    const obj = sb.throwObject('br_grenade', from, dir, speed);
    const mesh = EnemyManager.grenadeMesh();
    g.view.scene.add(mesh);
    this.grenades.push({ obj, mesh, fuse: thrower === 'player' ? 2.4 : 2.9, by: thrower === 'player' ? 'player-grenade' : thrower, warned: false });
    g.audio.whoosh(10, from);
    if (thrower !== 'player') for (const h of g.hooks) h.onGrenadeIncoming && h.onGrenadeIncoming(obj);
    if (thrower !== 'player' && thrower && thrower.headPos) this.bark(thrower, 'grenade');
  }

  static grenadeMesh() {
    const grp = new T3.Group();
    const body = new T3.Mesh(new T3.SphereGeometry(0.034, 14, 10), new T3.MeshStandardMaterial({ color: 0x3b4430, roughness: 0.6, metalness: 0.3 }));
    body.scale.set(1, 1.15, 1);
    const cap = new T3.Mesh(new T3.CylinderGeometry(0.012, 0.014, 0.03, 10), new T3.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.4 }));
    cap.position.y = 0.045;
    const lever = new T3.Mesh(new T3.BoxGeometry(0.008, 0.06, 0.012), cap.material);
    lever.position.set(0.02, 0.025, 0);
    grp.add(body, cap, lever);
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return grp;
  }

  explode(gr) {
    const g = this.game, sb = g.sb, pos = gr.obj.body.pos.clone();
    pos.y = Math.max(pos.y, 0.08);
    // out of the world first, or every fragment starts inside the grenade's own collider
    if (sb.objects.includes(gr.obj)) sb.removeObject(gr.obj);
    const P3 = toV3(pos);
    // fragments: real ballistic traces, so walls and bodies stop them
    sb._shooter = gr.by;
    const people = sb.people;
    const proj = Lab.Ballistics.br_fragment;
    for (let k = 0; k < 70; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * TAU, s = Math.sqrt(1 - u * u);
      const d = new I(s * Math.cos(a), u * 0.7 + 0.05, s * Math.sin(a)).normalize();
      Lab.traceShot({ world: sb.world, people, shape: anatomy(), forceScale: 1, fx: (e) => sb.fx(e) }, pos, d, Lab.projectile(proj), 14);
    }
    sb._shooter = null;
    // blast: knock ragdolls over, harder the closer they are (animated ones go physical first)
    for (const p of sb.people) {
      if (p.enemy && p.enemy.anim && Math.hypot(p.rd.pelvis.pos.x - pos.x, p.rd.pelvis.pos.z - pos.z) < 7.5) p.enemy.anim.wake('blast');
    }
    for (const p of sb.people) {
      let any = false;
      for (const b of p.rd.allBodies()) {
        const dx = b.pos.x - pos.x, dy = b.pos.y - pos.y, dz = b.pos.z - pos.z, d = Math.hypot(dx, dy, dz);
        if (d > 7.5) continue;
        if (!g.level.visible({ x: pos.x, y: pos.y + 0.3, z: pos.z }, b.pos)) continue;
        const f = clamp(1 - d / 7.5, 0, 1) ** 1.5 * 44 * b.mass / 6;
        b.applyImpulse(new I(dx / d * f, (dy / d + 0.6) * f, dz / d * f), b.pos);
        any = true;
      }
      if (any && p.enemy && !p.enemy.downed) {
        const d = Math.hypot(p.rd.pelvis.pos.x - pos.x, p.rd.pelvis.pos.z - pos.z);
        const dmg = clamp(1 - d / 6.5, 0, 1) * 250;
        p.enemy.tough -= dmg;
        if (gr.by === 'player-grenade') p.enemy.lastHit = { by: 'player', seg: 'chest', time: g.time, grenade: true };
        if (p.enemy.tough <= 0 && p.injury.alive) p.injury.kill('blast injuries');
        if (d < 4.5) { p.ctl.startle = 1; }
      }
    }
    for (const o of sb.objects) {
      const b = o.body, dx = b.pos.x - pos.x, dy = b.pos.y - pos.y, dz = b.pos.z - pos.z, d = Math.hypot(dx, dy, dz);
      if (d < 5 && d > 0.01) b.applyImpulse(new I(dx / d * 3 * b.mass, 4 * b.mass, dz / d * 3 * b.mass), b.pos), b.wake();
    }
    // the player
    const P = g.player;
    const eye = P.eye(new I());
    const pd = Math.hypot(eye.x - pos.x, eye.y - 0.6 - pos.y, eye.z - pos.z);
    if (pd < 8 && g.level.visible({ x: pos.x, y: pos.y + 0.3, z: pos.z }, eye)) {
      const dmg = clamp(1 - pd / 8, 0, 1) ** 1.3 * (gr.by === 'player-grenade' ? 70 : 95);
      if (dmg > 1) this.damagePlayer(dmg, pos, 'blast');
      g.shake = Math.max(g.shake, clamp(1.5 - pd / 6, 0.35, 1.2));
      g.flashbang = Math.max(g.flashbang || 0, clamp(1.1 - pd / 6, 0, 0.9));
    } else if (pd < 20) g.shake = Math.max(g.shake, clamp(0.7 - pd / 30, 0.2, 0.5));
    // visuals
    if (g.blast) g.blast.spawn(pos); // fireball, sparks, flash, smoke and char (src/57-blast.js)
    else {
      g.effects.muzzleLight(P3.clone().add(new T3.Vector3(0, 0.3, 0)), 9);
      g.effects.puff(P3, new T3.Vector3(0, 1, 0), 0x3a3530, 60, 4, 1.4);
      g.view.decals.splat(pos.x, pos.z, 0.55, 1, 0.95, 1, Math.random() * 6.28, Math.random());
    }
    if (g.sfx) g.sfx.explosion(pos, pd);
    else g.audio.impact('metal', 1, pos);
    for (const h of g.hooks) h.onExplosion && h.onExplosion(pos, gr);
    // someone who lived through it swears about it
    const shaken = this.alive.find((o) => !o.hollow && !o.downed && Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < 14);
    if (shaken) setTimeout(() => { if (!shaken.downed) this.bark(shaken, Math.random() < 0.6 ? 'blast' : 'mandown'); }, 600 + Math.random() * 500);
  }

  // ---- per step / frame --------------------------------------------------------------------------
  step(dt) {
    const g = this.game;
    // how many may shoot at the player at once: three from the start, one more every four waves
    this.maxTokens = Math.min(6, 3 + Math.floor((this.wave - 1) / 4));
    // hollowed and anyone the brain did not catch
    for (const ai of this.list) {
      if (ai.downed) continue;
      if (ai.hollow && !ai.combatEffective()) this.down(ai);
    }
    // hollows whose legs are shot out drag themselves on (the dismemberment module's crawl)
    if (g.dismember && g.dismember.crawlers) for (const ai of this.list) {
      if (!ai.hollow || ai.downed) continue;
      const c = ai.p.ctl;
      ai.floorT = c.mode === 'ground' ? (ai.floorT || 0) + dt : 0;
      if (ai.floorT > 1.2 && !c.ableToGetUp() && !g.dismember.crawlers.has(ai)) g.dismember.crawlers.add(ai);
    }
    // hollows: shamble, then scream and charge on sight
    for (const ai of this.list) if (ai.hollow && ai.anim && !ai.downed) ai.updateCharge(dt);
    // animated enemies: the sandbox skips dormant people, so think and move them here
    // (far ones, beyond 20 m, are posed every other step and beyond 35 m every fourth: the CPU cost
    // of animated enemies is mostly posing their bodies)
    const PP = g.player.pos;
    for (const ai of this.list) {
      if (!ai.anim) continue;
      if (ai.anim.active && !ai.downed) ai.update(dt);
      const an = ai.anim;
      if (an.mode === 'anim' && !ai.downed) {
        const d = Math.hypot(ai.pos.x - PP.x, ai.pos.z - PP.z);
        let every = d > 35 ? 4 : d > 20 ? 2 : 1;
        // never so coarse that one update carries a runner through a thin wall
        const sp = Math.hypot(an.vel.x, an.vel.z);
        if (sp > 0.1) every = Math.max(1, Math.min(every, Math.floor(0.2 / (sp * dt))));
        an.lodAcc = (an.lodAcc || 0) + dt;
        an.lodN = ((an.lodN || 0) + 1) % every;
        if (an.lodN !== 0) continue;
        an.step(an.lodAcc); an.lodAcc = 0;
      } else { an.lodAcc = 0; an.step(dt); }
    }
    // the dying
    for (const ai of this.corpses) if (ai.agony) this.updateAgony(ai, dt);
    // corpses settle, then freeze to save the simulation
    for (const ai of this.corpses) {
      if (ai.frozen || ai.agony || g.time - ai.diedAt < 3) continue;
      let still = true;
      for (const b of ai.p.rd.allBodies()) if (b.vel.lengthSq() > 0.03) { still = false; break; }
      if (still || g.time - ai.diedAt > 10) {
        if (ai.p.injury.alive && g.time - ai.diedAt < 25) continue; // let the dying writhe a while
        g.sb.freezePerson(ai.p);
        ai.frozen = true;
        ai.frozenAt = g.time;
      }
    }
    // settled corpses are baked into static meshes (one a step, to spread the cost)
    for (const ai of this.corpses) {
      if (!ai.frozen || ai.baked || g.time - ai.frozenAt < 5) continue;
      const r = this.renderOf(ai);
      ai.baked = true;
      if (r && r.bake) r.bake();
      break;
    }
    // grenades
    for (const gr of this.grenades) {
      gr.fuse -= dt;
      if (gr.fuse <= 0 && !gr.done) { gr.done = true; this.explode(gr); }
    }
    for (const gr of this.grenades.filter((x) => x.done)) {
      g.view.scene.remove(gr.mesh);
      disposeTree(gr.mesh);
      if (g.sb.objects.includes(gr.obj)) g.sb.removeObject(gr.obj);
    }
    this.grenades = this.grenades.filter((x) => !x.done);
    // pickups
    const P = g.player;
    for (const d of this.drops) {
      d.t += dt;
      if (d.taken || d.t < 0.8 || !P.alive) continue;
      const b = d.obj.body.pos;
      if (Math.hypot(b.x - P.pos.x, b.z - P.pos.z) < 1.25 && Math.abs(b.y - P.pos.y) < 1.2) {
        d.taken = true;
        for (const h of g.hooks) h.onPickup && h.onPickup(d);
        this.removeDrop(d);
      }
    }
  }

  frame(dt, simDt) {
    const alpha = clamp(this.game.acc / SIM_DT, 0, 1);
    const sync = (obj, mesh) => {
      const b = obj.body;
      const fp = b.framePos || b.pos, fr = b.frameRot || b.rot;
      mesh.position.set(fp.x + (b.pos.x - fp.x) * alpha, fp.y + (b.pos.y - fp.y) * alpha, fp.z + (b.pos.z - fp.z) * alpha);
      const q0 = new T3.Quaternion(fr.x, fr.y, fr.z, fr.w), q1 = new T3.Quaternion(b.rot.x, b.rot.y, b.rot.z, b.rot.w);
      mesh.quaternion.copy(q0.slerp(q1, alpha));
      if (mesh.userData.offset) mesh.position.add(mesh.userData.offset.clone().applyQuaternion(mesh.quaternion).negate());
    };
    for (const d of this.drops) sync(d.obj, d.mesh);
    for (const gr of this.grenades) sync(gr.obj, gr.mesh);
    void simDt;
  }

  onShot(paths, gun) {
    // the player's gunfire: everyone in earshot learns roughly where it came from, and bullets
    // passing close by pin enemies down
    const g = this.game, P = g.player.pos;
    const hearR = gun.suppressed ? 9 : 38;
    for (const ai of this.list) {
      if (ai.downed || !ai.hear) continue;
      const d = Math.hypot(ai.pos.x - P.x, ai.pos.z - P.z);
      if (d < hearR) ai.hear(P, gun.suppressed ? 6 : 3);
      if (ai.suppressed === undefined) continue;
      const h = ai.headPos;
      for (const path of paths) {
        const a = path.from, b = path.to;
        const ab = new T3.Vector3(b.x - a.x, b.y - a.y, b.z - a.z), L = ab.length();
        if (L < 0.01) continue;
        ab.multiplyScalar(1 / L);
        const t = clamp((h.x - a.x) * ab.x + (h.y - a.y) * ab.y + (h.z - a.z) * ab.z, 0, L);
        const miss = Math.hypot(a.x + ab.x * t - h.x, a.y + ab.y * t - h.y, a.z + ab.z * t - h.z);
        if (miss < 1.4) ai.suppressed = Math.min(2, ai.suppressed + 0.35 * (1.4 - miss));
      }
    }
  }

  clear() {
    const g = this.game;
    for (const ai of [...this.list]) {
      g.detachRender(ai.p);
      if (g.sb.people.includes(ai.p)) g.sb.removePerson(ai.p);
    }
    for (const d of [...this.drops]) this.removeDrop(d);
    for (const gr of this.grenades) { g.view.scene.remove(gr.mesh); disposeTree(gr.mesh); }
    this.gen = (this.gen || 0) + 1; // spawns still loading belong to the old run
    this.list.length = 0;
    this.corpses.length = 0;
    this.grenades.length = 0;
    this.tokensUsed = 0;
  }
}
