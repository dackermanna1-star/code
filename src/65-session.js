// Session glue: menus, run lifecycle, director events -> HUD, player tools (light, kick, grenade).
const PLAYER_BASE = { walk: Lab.PLAYER.walk, sprint: Lab.PLAYER.sprint, crouch: Lab.PLAYER.crouch };

class Session {
  constructor(game) {
    this.game = game;
    game.hooks.push(this);
    this.flashOn = false;
  }

  onLevel(level) {
    const g = this.game;
    // weapon light: always in the scene (so shaders never recompile), dark until switched on
    const l = new T3.SpotLight(0xfff3dd, 0, 26, 0.38, 0.55, 1.4);
    l.castShadow = false;
    g.view.scene.add(l, l.target);
    this.light = l;
    g.applyLightSetting && g.applyLightSetting();
    void level;
  }

  // ---- director events ---------------------------------------------------------------------------
  step(dt) {
    const g = this.game, P = g.player;
    // perks that act every step
    const wv = g.perks.waves || {};
    g.perks.damage = wv.damage || 1;
    // perks, boosts and the weight of the gun in hand (the shop's MOBILITY stat)
    const gun = g.arsenal.gun;
    const sp = g.perks.speed * (wv.speed || 1) * ((gun && gun.def.move) || 1) * (g.level.wetAt(P.pos.x, P.pos.z) ? 0.88 : 1); // wading (Level 37)
    Lab.PLAYER.walk = PLAYER_BASE.walk * sp;
    Lab.PLAYER.sprint = PLAYER_BASE.sprint * sp;
    Lab.PLAYER.crouch = PLAYER_BASE.crouch * sp;
    for (const e of g.director.drainEvents()) this.onDirector(e);
    void dt; void P;
  }

  onDirector(e) {
    const g = this.game, hud = g.hud;
    switch (e.type) {
      case 'waveStart': {
        g.perks.waves = g.perks.next || {};
        g.perks.next = {};
        const s = e.spec;
        if (s.boss) hud.announce(`WAVE ${e.wave}`, 'JUGGERNAUT', 'Something heavy is walking the halls', true, 4);
        else if (s.swarm) hud.announce(`WAVE ${e.wave}`, 'THE HOLLOWED', 'They are not people any more', true, 4);
        else if (e.mod) hud.announce(`WAVE ${e.wave}`, WAVE_MODS[e.mod].name, WAVE_MODS[e.mod].sub, e.mod === 'blackout', 3.6);
        else hud.announce(`${g.level.theme.code}`, `WAVE ${e.wave}`, `${s.kinds.length} hostiles inbound`, false, 3);
        g.audio.sting(s.boss || s.swarm ? 'boss' : 'wave');
        break;
      }
      case 'waveCleared':
        hud.announce('AREA SECURE', 'WAVE CLEARED', `+$${fmt(e.bonus)}${e.descend ? '  ·  THE FLOOR GIVES WAY' : ''}`, false, 3);
        g.audio.sting('clear');
        break;
      case 'state':
        if (e.state === 'intermission') { g.shop.open(); }
        if (e.state === 'countdown') hud.announce('GET READY', '3', '', false, 1);
        break;
      case 'descend':
        hud.announce('YOU NOCLIP DEEPER', `${e.theme.code}`, e.theme.title, false, 4.5);
        g.hud.toast(e.theme.blurb);
        break;
      case 'kill':
        if (e.byPlayer) {
          hud.feed(`${e.name}${e.tags.length ? ' · ' + e.tags.join(' · ') : ''}`, e.head ? 'hs' : e.boss ? 'boss' : '', e.cash);
          hud.hit(e.head ? 'head' : 'kill');
          g.audio.hitTick(true, e.head);
          if (e.boss) hud.announce('ELIMINATED', 'JUGGERNAUT DOWN', `+$${fmt(e.cash)}`, false, 3);
        }
        break;
      case 'boss':
        hud.toast('JUGGERNAUT INBOUND');
        break;
      case 'cash':
        if (e.why && e.amount > 0 && !/CLEARED/.test(e.why)) hud.toast(`${e.why}  +$${fmt(e.amount)}`);
        break;
      case 'pickup':
        if (e.ammo > 0) hud.toast(`+${e.ammo} ROUNDS`);
        break;
      case 'toast':
        hud.toast(e.text);
        break;
      case 'gameOver':
        // stop clicks during the death cam from grabbing the pointer again (startRun re-enables)
        g.input.enabled = false;
        g.input.unlock();
        setTimeout(() => { g.input.unlock(); g.screens.gameOver(); }, 2200);
        break;
    }
  }

  onDied(e) { this.game.deathCause = e.kind === 'blast' ? 'Caught in a blast.' : e.kind === 'claw' ? 'Torn apart by the Hollowed.' : e.kind === 'fall' ? 'The floor was further down than it looked.' : 'Shot dead.'; }

  onGrenadeIncoming() { this.game.hud.toast('⚠ GRENADE'); }

  onLock(locked) {
    const g = this.game;
    if (locked) { g.screens.close(); return; }
    if (g.state === 'play' && !g.shopOpen && g.player.alive && !g.screens.cur) g.screens.open('pause');
  }

  // ---- player tools ------------------------------------------------------------------------------
  frame(dt, simDt, inp) {
    const g = this.game;
    if (inp.pressed && inp.pressed.has && inp.pressed.has('KeyT')) this.toggleLight();
    // (the shop's own key handler closes it on B; ignore that same press here)
    if (inp.pressed && inp.pressed.has('KeyB') && g.director.state === 'intermission' && !g.shopOpen && performance.now() - (g.shop.closedAt || 0) > 250) g.shop.open();
    g.shop.frame();
    void dt; void simDt;
  }

  toggleLight() {
    this.flashOn = !this.flashOn;
    this.game.audio.gunHandling('dry', 'pistol');
  }

  beforeRender(dt) {
    const g = this.game, l = this.light;
    if (!l) return;
    const cam = g.camera;
    const target = this.flashOn ? 22 : 0;
    l.intensity = damp(l.intensity, target, 18, dt);
    const fwd = g.viewDir(new T3.Vector3());
    const right = new T3.Vector3(Math.cos(g.player.yaw), 0, -Math.sin(g.player.yaw));
    l.position.copy(cam.position).addScaledVector(right, 0.12).add(new T3.Vector3(0, -0.1, 0));
    l.target.position.copy(cam.position).addScaledVector(fwd, 8);
  }

  melee() {
    const g = this.game, P = g.player;
    if (!P.alive || g.state !== 'play') return true;
    if (g.time - (this.meleeT ?? -9) < 0.65) return true;
    this.meleeT = g.time;
    const eye = P.eye(new I()), f = P.forward(new I());
    let best = null, bd = 1.8;
    for (const ai of g.enemies.alive) {
      const c = ai.p.rd.segments.chest.body.pos;
      const dx = c.x - eye.x, dz = c.z - eye.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * f.x + dz * f.z) / Math.max(d, 0.01) > 0.55) { bd = d; best = ai; }
    }
    g.vm.kz.kick(-3);
    g.vm.kp.kick(2);
    g.audio.whoosh(9, null);
    if (!best) return true;
    if (best.anim) best.anim.wake('kick');
    const chest = best.p.rd.segments.chest.body;
    const dir = new I(f.x, 0.15, f.z).normalize().scale(best.def.boss ? 50 : 110);
    g.sb.shove(chest, chest.pos.clone(), dir, 0.1);
    best.tough -= best.def.boss ? 8 : 22;
    best.lastHit = { by: 'player', seg: 'chest', time: g.time, weapon: 'kick' };
    if (best.tough <= 0 && best.p.injury.alive) best.p.injury.kill('blunt trauma');
    if (best.suppressed !== undefined) best.suppressed = 2;
    g.audio.impact('flesh', 0.8, chest.pos);
    g.hud.hit('hit');
    return true;
  }

  throwGrenade() {
    const g = this.game;
    if (!g.player.alive || g.state !== 'play') return true;
    if (!g.arsenal.throwGrenade()) { if (g.arsenal.grenades <= 0) g.hud.toast('NO GRENADES'); return true; }
    const sb = g.sb;
    setTimeout(() => { if (g.player.alive && g.sb === sb && g.state === 'play') g.enemies.launchGrenade('player'); }, 260);
    g.vm.lower.kick(4);
    return true;
  }
}

// ---- game lifecycle helpers ------------------------------------------------------------------------
Object.assign(BackroomsGame.prototype, {
  async startRun() {
    this.audio.unlock();
    await loadAnimLibrary();
    this.screens.close();
    this.enemies.clear();
    this.director.newRun();
    this.shop.perkLv = {};
    this.state = 'play';
    this.deathCause = null;
    this.suppression = 0;
    this.flashbang = 0;
    await this.vm.equip(this.arsenal.gun, false);
    this.arsenal.state = 'equip';
    this.arsenal.t = 0;
    this.hud.show(true);
    this.input.enabled = true;
    if (!this.debugRun) this.input.lock();
    this.vm.prepare('smg'); this.vm.prepare('ak74'); this.vm.prepare('remington');
  },
  resume() {
    this.audio.unlock();
    this.screens.close();
    if (this.director.state === 'over') { this.startRun(); return; }
    this.input.lock();
  },
  applySettings() {
    const s = this.settings;
    this.input.sensitivity = 0.0022 * s.sensitivity;
    this.input.invertY = !!s.invertY;
    this.input.adsHold = !!s.adsHold;
    this.audio.setVolume(s.volume);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, s.quality === 'low' ? 0.85 : s.quality === 'medium' ? 1.1 : 1.6));
    this.resize();
    this.saveSettings();
  },
});
