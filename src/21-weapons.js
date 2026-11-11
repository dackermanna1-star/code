// Player weapons: catalogue, upgrades, attachments and the arsenal state machine. Ballistics
// (penetration, wounding, knockback) come from the engine; per-instance copies of its ballistic
// entries carry upgrades (damage scaling, suppressed muzzle velocity).

const WEAPONS = {
  p9: {
    name: 'P9 Service Pistol', short: 'P9', cls: 'Pistol', rig: 'pistol', ballistic: 'pistol', slot: 'sidearm',
    price: 0, mag: 15, reserve: 45, maxReserve: 120, rpm: 420, auto: false,
    hipSpread: 0.95, adsSpread: 0.95, adsTime: 0.16, move: 1.0,
    recoil: { up: 0.022, side: 0.008, pattern: 'pistol' }, vm: { back: 0.035, up: 9, side: 2.2, roll: 2.4, flash: 0.8 },
    attachments: ['suppressor', 'laser'], desc: 'Reliable 9 mm sidearm. Accurate and forgiving to carry.',
  },
  kv9: {
    name: 'KV-9 Submachine Gun', short: 'KV-9', cls: 'SMG', rig: 'smg', ballistic: 'smg', slot: 'primary',
    price: 1400, mag: 30, reserve: 120, maxReserve: 300, rpm: 900, auto: true,
    hipSpread: 1.05, adsSpread: 1.05, adsTime: 0.14, move: 1.0,
    recoil: { up: 0.0085, side: 0.0075, pattern: 'smg' }, vm: { back: 0.018, up: 3.2, side: 1.6, roll: 1.2, flash: 0.75 },
    attachments: ['suppressor', 'laser', 'extmag', 'grip'], desc: 'Fast-firing 9 mm. Shreds at close range, struggles against armour.',
  },
  m870: {
    name: 'M870 Pump Shotgun', short: 'M870', cls: 'Shotgun', rig: 'remington', ballistic: 'shotgun', slot: 'primary',
    price: 1600, mag: 6, reserve: 30, maxReserve: 60, rpm: 75, auto: false, pump: 0.55, perShell: true,
    hipSpread: 0.95, adsSpread: 0.95, adsTime: 0.2, move: 0.96,
    recoil: { up: 0.07, side: 0.02, pattern: 'shotgun' }, vm: { back: 0.06, up: 12, side: 2.5, roll: 3, flash: 1.3, pump: true },
    attachments: ['suppressor', 'laser', 'grip'], desc: 'Nine pellets of 00 buckshot. Pump between shots, reloads shell by shell.',
  },
  ak74: {
    name: 'AK-74M Assault Rifle', short: 'AK-74M', cls: 'Rifle', rig: 'ak74', ballistic: 'rifle', slot: 'primary',
    price: 2600, mag: 30, reserve: 120, maxReserve: 270, rpm: 650, auto: true,
    hipSpread: 1.0, adsSpread: 1.0, adsTime: 0.22, move: 0.95,
    recoil: { up: 0.0125, side: 0.0085, pattern: 'rifle' }, vm: { back: 0.026, up: 4.8, side: 1.4, roll: 1.4, flash: 1 },
    attachments: ['suppressor', 'laser', 'extmag', 'grip'], desc: 'Hard-hitting, high-velocity rifle. Punches through drywall and light armour.',
  },
  saiga: {
    name: 'Saiga-12K Combat Shotgun', short: 'SAIGA-12', cls: 'Shotgun', rig: 'saiga', ballistic: 'shotgun', slot: 'primary',
    price: 3000, mag: 8, reserve: 32, maxReserve: 64, rpm: 280, auto: false,
    hipSpread: 1.0, adsSpread: 1.0, adsTime: 0.22, move: 0.94,
    recoil: { up: 0.055, side: 0.022, pattern: 'shotgun' }, vm: { back: 0.05, up: 10, side: 2.8, roll: 2.6, flash: 1.3 },
    attachments: ['suppressor', 'laser', 'extmag', 'grip'], desc: 'Semi-automatic magazine-fed shotgun. Clears rooms.',
  },
  acr: {
    name: 'ACR Carbine', short: 'ACR', cls: 'Rifle', rig: 'acr', ballistic: 'rifle', slot: 'primary', fixed: ['reddot'],
    price: 3600, mag: 30, reserve: 150, maxReserve: 300, rpm: 760, auto: true,
    hipSpread: 0.9, adsSpread: 0.9, adsTime: 0.2, move: 0.96,
    recoil: { up: 0.0095, side: 0.006, pattern: 'rifle' }, vm: { back: 0.022, up: 3.8, side: 1.1, roll: 1.1, flash: 0.9 },
    attachments: ['suppressor', 'laser', 'extmag', 'grip'], desc: 'Modular flat-top carbine with a red dot and a gentle, predictable recoil.',
  },
  rpk: {
    name: 'RPK-74 Light Machine Gun', short: 'RPK-74', cls: 'LMG', rig: 'ak74', drum: true, ballistic: 'rifle', slot: 'primary',
    price: 5200, mag: 75, reserve: 150, maxReserve: 450, rpm: 600, auto: true, reloadScale: 1.45,
    hipSpread: 1.35, adsSpread: 1.35, adsTime: 0.32, move: 0.86,
    recoil: { up: 0.0105, side: 0.0095, pattern: 'lmg' }, vm: { back: 0.024, up: 4.2, side: 1.8, roll: 1.5, flash: 1.05 },
    attachments: ['suppressor', 'laser', 'grip'], desc: '75-round drum. Suppressive fire that walls off whole corridors.',
  },
  sr10: {
    name: 'M24 Sniper Rifle', short: 'M24', cls: 'Sniper', rig: 'acr', mount: 'm24', ballistic: 'marksman', slot: 'primary',
    price: 4200, mag: 5, reserve: 30, maxReserve: 60, rpm: 48, auto: false, bolt: 0.95,
    hipSpread: 4, adsSpread: 0.05, adsTime: 0.3, move: 0.9, zoom: 4,
    recoil: { up: 0.06, side: 0.012, pattern: 'sniper' }, vm: { back: 0.06, up: 12, side: 1.5, roll: 2.2, flash: 1.4, bolt: true },
    attachments: ['suppressor', 'extmag'], desc: 'Bolt-action 7.62 mm with a 4x scope. One clean shot ends any argument.',
  },
  whisper: {
    name: 'Whisper .338 Sniper', short: 'WHISPER', cls: 'Sniper', rig: 'acr', mount: 'm24', ballistic: 'whisper', slot: 'primary', fixed: ['suppressor'],
    price: 7000, mag: 5, reserve: 25, maxReserve: 40, rpm: 52, auto: false, bolt: 0.85,
    hipSpread: 5, adsSpread: 0.04, adsTime: 0.34, move: 0.88, zoom: 5,
    recoil: { up: 0.08, side: 0.015, pattern: 'sniper' }, vm: { back: 0.07, up: 13, side: 2, roll: 2.4, flash: 0.5, bolt: true },
    attachments: [], desc: 'Suppressed .338 Lapua. Punches through walls, armour and whoever is behind them.',
  },
};

const ATTACHMENTS = {
  suppressor: { name: 'Suppressor', price: 900, desc: 'Muffled report, no muzzle flash. Enemies struggle to locate you. -6% velocity.' },
  reddot: { name: 'Red Dot Sight', price: 600, desc: 'Clean sight picture.' }, // fixed on the ACR, not sold
  laser: { name: 'Laser Module', price: 750, desc: 'Visible laser dot shows where rounds go. -30% hip-fire spread.' },
  extmag: { name: 'Extended Magazine', price: 800, desc: '+50% magazine capacity.' },
  grip: { name: 'Vertical Grip', price: 700, desc: '-20% recoil, steadier hip fire.' },
};

const UPGRADES = {
  damage: { name: 'Hot Loads', max: 3, base: 700, step: 650, desc: '+12% wounding energy per level' },
  mag: { name: 'Mag Well', max: 3, base: 500, step: 450, desc: '+20% magazine capacity per level' },
  reload: { name: 'Speed Reload', max: 3, base: 450, step: 400, desc: '+14% reload speed per level' },
  handling: { name: 'Recoil Control', max: 3, base: 550, step: 500, desc: '-14% recoil, +12% scope speed per level' },
};

// deterministic per-shot recoil shapes (x: yaw, y: pitch) the player learns to pull against
const RECOIL_PATTERNS = {
  pistol: (n) => [Math.sin(n * 1.7) * 0.4, 1],
  smg: (n) => [Math.sin(n * 0.9) * 0.9 + (n > 10 ? 0.6 : 0), n < 8 ? 1.1 : 0.7],
  rifle: (n) => [n < 6 ? 0.15 : Math.sin(n * 0.45) * 1.3, n < 9 ? 1.25 : 0.55],
  lmg: (n) => [Math.sin(n * 0.3) * 1.4, n < 12 ? 1.0 : 0.6],
  shotgun: () => [(Math.random() - 0.5) * 0.6, 1],
  sniper: () => [(Math.random() - 0.5) * 0.3, 1],
};

// one owned weapon with its upgrades, attachments, magazine and reserve
class WeaponInstance {
  constructor(id) {
    this.id = id;
    this.def = WEAPONS[id];
    this.rig = this.def.rig;
    this.drum = !!this.def.drum;
    this.upgrades = { damage: 0, mag: 0, reload: 0, handling: 0 };
    this.attachments = new Set(this.def.fixed || []);
    this.ammo = this.magSize;
    this.reserve = this.def.reserve;
    this.cool = 0;
    this.shotsInBurst = 0;
    this.ballisticKey = 'br_' + id + '_' + ((Math.random() * 1e6) | 0);
    this.refreshBallistics();
  }
  get magSize() {
    let m = this.def.mag * (1 + 0.2 * this.upgrades.mag);
    if (this.attachments.has('extmag')) m *= 1.5;
    return Math.round(m);
  }
  get maxReserve() { return Math.round(this.def.maxReserve * (1 + 0.15 * this.upgrades.mag)); }
  get reloadSpeed() { return (1 + 0.14 * this.upgrades.reload) / (this.def.reloadScale || 1); }
  get recoilScale() { return (1 - 0.14 * this.upgrades.handling) * (this.attachments.has('grip') ? 0.8 : 1); }
  get adsTime() { return this.def.adsTime / (1 + 0.12 * this.upgrades.handling); }
  get suppressed() { return this.attachments.has('suppressor'); }
  // there is no aiming down iron or red-dot sights: only a magnified scope is raised to the eye
  get zoom() { return this.def.zoom || 1; }
  get scoped() { return (this.def.zoom || 1) > 2; }
  refreshBallistics() {
    const base = Lab.Ballistics[this.def.ballistic];
    Lab.Ballistics[this.ballisticKey] = {
      ...base,
      label: this.def.name,
      speed: base.speed * (this.suppressed ? 0.94 : 1),
      mass: base.mass * (1 + 0.12 * this.upgrades.damage),
      rpm: this.def.rpm,
      auto: this.def.auto,
      // the engine's ragdoll knockback table is keyed by weapon class, not by this instance key
      knockClass: { marksman: 'sniper', whisper: 'sniper' }[this.def.ballistic] || this.def.ballistic,
    };
  }
  value() {
    let v = this.def.price * 0.5;
    for (const k in this.upgrades) for (let l = 0; l < this.upgrades[k]; l++) v += (UPGRADES[k].base + UPGRADES[k].step * l) * 0.5;
    return Math.round(v / 10) * 10;
  }
}

// carried weapons + grenades; drives timing, reload and switching
class Arsenal {
  constructor() {
    this.slots = [null, null, new WeaponInstance('p9')]; // primary A, primary B, sidearm
    this.index = 2;
    this.prevIndex = 2;
    this.state = 'equip'; // equip | idle | reload | holster | pump | inspect | throw | heal
    this.t = 0;
    this.stateDur = 0.45;
    this.pending = null;
    this.ads = false;
    this.adsAmount = 0;
    this.triggerHeld = false;
    this.events = [];
    this.grenades = 1;
    this.maxGrenades = 4;
    this.medkits = 1;
    this.maxMedkits = 3;
    this.injected = false;
    this.reloadShellT = 0;
  }
  get gun() { return this.slots[this.index]; }
  owned(id) { return this.slots.find((w) => w && w.id === id) || null; }
  give(id) {
    const w = new WeaponInstance(id);
    const def = w.def;
    if (def.slot === 'sidearm') { this.slots[2] = w; this.select(2); return w; }
    let i = this.slots[0] ? (this.slots[1] ? (this.index === 1 ? 1 : 0) : 1) : 0;
    this.slots[i] = w;
    this.select(i, true);
    return w;
  }
  select(i, force = false) {
    if (!this.slots[i] || (i === this.index && !force)) return;
    // switching weapons before the jab calls a medkit off (the kit is kept)
    if (this.state === 'heal' && !this.injected) this.events.push({ type: 'healCancel' });
    if (this.state === 'holster') { this.pending = i; return; }
    this.pending = i;
    this.state = 'holster';
    this.t = 0;
    this.stateDur = 0.24;
    this.events.push({ type: 'holster', gun: this.gun });
  }
  cycle(dir) {
    for (let k = 1; k <= 3; k++) {
      const i = (this.index + dir * k + 30) % 3;
      if (this.slots[i]) { this.select(i); return; }
    }
  }
  reload() {
    const g = this.gun;
    if ((this.state !== 'idle' && this.state !== 'inspect') || g.ammo >= g.magSize || g.reserve <= 0) return false;
    if (this.state === 'inspect') this.events.push({ type: 'inspectCancel', gun: g });
    this.state = 'reload';
    this.t = 0;
    this.reloadShellT = 0;
    this.stateDur = 2.2 / g.reloadSpeed; // replaced from the reload clip by the game

    this.events.push({ type: 'reloadStart', gun: g, empty: g.ammo === 0 });
    return true;
  }
  // the game feeds the reload duration from the animation clip
  setReloadDuration(d) { this.stateDur = d; }
  spreadScale(player) {
    const g = this.gun, d = g.def;
    const speed = clamp(player.speed / 3.3, 0, 1.6);
    let s = d.hipSpread + (d.adsSpread - d.hipSpread) * this.adsAmount;
    s *= 1 + 0.8 * speed * (1 - 0.5 * this.adsAmount) + 0.06 * Math.min(this.gun.shotsInBurst, 12) * (d.auto ? 1 : 0);
    if (!player.onGround) s *= 2.5;
    if (player.crouch > 0.5) s *= 0.75;
    if (g.attachments.has('grip')) s *= 0.85;
    if (g.attachments.has('laser')) s *= 0.7;
    return Math.min(s, 12);
  }
  // events accumulate in this.events until the game drains them
  update(dt, trigger, blocked) {
    this.t += dt;
    const g = this.gun;
    g.cool = Math.max(0, g.cool - dt);
    const canAds = !blocked && this.state !== 'holster' && this.state !== 'equip' && this.state !== 'throw' && this.state !== 'heal';
    const target = this.ads && canAds && g.scoped ? 1 : 0;
    this.adsAmount = clamp(this.adsAmount + Math.sign(target - this.adsAmount) * (dt / g.adsTime), 0, 1);
    let fired = false;
    switch (this.state) {
      case 'equip':
        if (this.t > this.stateDur) { this.state = 'idle'; this.t = 0; }
        break;
      case 'holster':
        if (this.t > this.stateDur) {
          this.prevIndex = this.index;
          this.index = this.pending ?? this.index;
          this.pending = null;
          this.state = 'equip';
          this.t = 0;
          this.stateDur = 0.5;
          this.gun.shotsInBurst = 0;
          this.events.push({ type: 'equip', gun: this.gun });
        }
        break;
      case 'reload':
        if (g.def.perShell) {
          // shells go in one at a time across the clip; firing interrupts once a shell is in
          const per = this.stateDur / Math.max(1, Math.min(g.magSize, 6));
          this.reloadShellT += dt;
          if (this.reloadShellT >= per && g.ammo < g.magSize && g.reserve > 0) {
            this.reloadShellT -= per;
            g.ammo++; g.reserve--;
            this.events.push({ type: 'shell', gun: g });
          }
          if (trigger && g.ammo > 0 && this.t > 0.2) { this.state = 'idle'; this.events.push({ type: 'reloadCancel', gun: g }); break; }
          if (this.t > this.stateDur + 0.05 && g.ammo < g.magSize && g.reserve > 0) {
            // a Mag Well tube holds more shells than one pass of the clip loads
            this.t = 0; this.reloadShellT = 0;
            this.events.push({ type: 'reloadLoop', gun: g });
          } else if (g.ammo >= g.magSize || g.reserve <= 0 || this.t > this.stateDur + 0.05) {
            this.state = 'pump'; this.t = 0; this.stateDur = 0.35;
            this.events.push({ type: 'reloadEnd', gun: g });
          }
        } else if (this.t >= this.stateDur * 0.92) {
          const n = Math.min(g.magSize - g.ammo, g.reserve);
          g.ammo += n; g.reserve -= n;
          this.state = 'idle';
          this.events.push({ type: 'reloadEnd', gun: g });
        }
        break;
      case 'inspect':
        // firing, aiming or blocking (sprint, shop) puts the weapon straight back to work
        if (trigger || this.ads || blocked) { this.state = 'idle'; this.events.push({ type: 'inspectCancel', gun: g }); break; }
        if (this.t > this.stateDur) this.state = 'idle';
        break;
      case 'pump':
      case 'throw':
        if (this.t > this.stateDur) this.state = 'idle';
        break;
      case 'heal':
        if (!this.injected) {
          // a fresh trigger pull before the jab calls it off and keeps the kit
          if (trigger && !this.triggerHeld && this.t > 0.08) { this.endHeal('healCancel'); break; }
          if (this.t >= this.injectAt) { this.injected = true; this.medkits = Math.max(0, this.medkits - 1); this.events.push({ type: 'healInject' }); }
        } else if (trigger && !this.triggerHeld && this.t > this.injectAt + 0.2) { this.endHeal('healEnd'); break; } // back to the fight early
        if (this.t >= this.stateDur) this.endHeal('healEnd');
        break;
      case 'idle':
        if (blocked) { g.shotsInBurst = 0; break; }
        if (trigger && g.cool <= 0 && (g.def.auto || !this.triggerHeld)) {
          if (g.ammo > 0) {
            g.ammo--;
            g.cool = 60 / g.def.rpm + (g.def.pump && g.ammo > 0 ? 0 : 0);
            fired = true;
            g.shotsInBurst++;
            if (g.def.pump && g.ammo > 0) { this.state = 'pump'; this.t = 0; this.stateDur = g.def.pump; this.events.push({ type: 'pump', gun: g, delay: 0.12 }); }
            if (g.def.bolt && g.ammo > 0) { this.state = 'pump'; this.t = 0; this.stateDur = g.def.bolt; this.events.push({ type: 'bolt', gun: g, delay: 0.15 }); }
          } else if (!this.triggerHeld) {
            this.events.push({ type: 'dry', gun: g });
            if (g.reserve > 0) this.reload();
          }
        }
        if (!trigger) g.shotsInBurst = Math.max(0, g.shotsInBurst - dt * 10);
        if (g.ammo === 0 && g.reserve > 0 && !trigger && this.state === 'idle') this.reload();
        break;
    }
    this.triggerHeld = trigger;
    return fired;
  }
  // dur: length of the inspect clip (no clip, no inspect)
  inspect(dur) {
    if (this.state !== 'idle' || !(dur > 0)) return false;
    this.state = 'inspect';
    this.t = 0;
    this.stateDur = dur;
    return true;
  }
  // a medkit: the weapon goes down, the injector comes up and the jab lands at injectAt, when the
  // kit is used up; the weapon then takes a moment to come back up before it can fire
  useMedkit(dur, injectAt) {
    if (this.medkits <= 0 || (this.state !== 'idle' && this.state !== 'reload' && this.state !== 'inspect')) return false;
    if (this.state === 'reload') this.events.push({ type: 'reloadCancel', gun: this.gun });
    if (this.state === 'inspect') this.events.push({ type: 'inspectCancel', gun: this.gun });
    this.state = 'heal';
    this.t = 0;
    this.stateDur = dur;
    this.injectAt = injectAt;
    this.injected = false;
    this.events.push({ type: 'healStart' });
    return true;
  }
  endHeal(type) {
    this.state = 'equip';
    this.t = 0;
    this.stateDur = 0.3;
    this.events.push({ type });
  }
  throwGrenade() {
    if (this.grenades <= 0 || (this.state !== 'idle' && this.state !== 'reload' && this.state !== 'inspect')) return false;
    // a throw abandons a reload (rounds already loaded stay) or an inspect: stop its animation
    if (this.state === 'reload') this.events.push({ type: 'reloadCancel', gun: this.gun });
    if (this.state === 'inspect') this.events.push({ type: 'inspectCancel', gun: this.gun });
    this.grenades--;
    this.state = 'throw';
    this.t = 0;
    this.stateDur = 0.6;
    return true;
  }
  recoil(rng = Math.random) {
    const g = this.gun, d = g.def;
    const pat = RECOIL_PATTERNS[d.recoil.pattern] || RECOIL_PATTERNS.rifle;
    const [px, py] = pat(g.shotsInBurst);
    const k = (1 - 0.3 * this.adsAmount) * g.recoilScale;
    return {
      up: d.recoil.up * py * k * (0.85 + 0.3 * rng()),
      side: d.recoil.side * (px + (rng() - 0.5) * 0.8) * k,
    };
  }
}
