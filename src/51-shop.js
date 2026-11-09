// Between-wave shop.
const PERKS = {
  kevlar: { name: 'Kevlar Weave', max: 3, base: 700, step: 500, desc: '+25 maximum armour.', apply: (g) => { g.maxArmor += 25; } },
  trauma: { name: 'Trauma Kit', max: 3, base: 800, step: 600, desc: '+20 maximum health.', apply: (g) => { g.player.maxHealth += 20; g.player.heal(20); } },
  quick: { name: 'Quick Hands', max: 2, base: 900, step: 700, desc: '+12% reload speed with every weapon.', apply: (g) => { g.perks.reload += 0.12; } },
  bandolier: { name: 'Bandolier', max: 2, base: 600, step: 600, desc: '+1 grenade capacity.', apply: (g) => { g.arsenal.maxGrenades++; } },
  scavenger: { name: 'Scavenger', max: 2, base: 500, step: 600, desc: '+40% ammunition stripped from dropped weapons.', apply: (g) => { g.perks.ammoFind += 0.4; } },
  wind: { name: 'Second Wind', max: 2, base: 700, step: 700, desc: '+3 HP/s regeneration after six quiet seconds.', apply: (g) => { g.perks.regen += 3; } },
  marathon: { name: 'Marathon', max: 2, base: 600, step: 500, desc: '+8% movement speed.', apply: (g) => { g.perks.speed += 0.08; } },
};
const BOOSTS = {
  hollow: { name: 'Hollow Points', price: 650, desc: 'Next wave only: +25% damage.', apply: (g) => { g.perks.next.damage = 1.25; }, active: (g) => !!g.perks.next.damage },
  adren: { name: 'Adrenaline Shot', price: 450, desc: 'Next wave only: +15% speed, steadier aim.', apply: (g) => { g.perks.next.speed = 1.15; g.perks.next.recoil = 0.75; }, active: (g) => !!g.perks.next.speed },
  plates: { name: 'Overplate', price: 500, desc: 'Next wave only: +50 armour above your maximum.', apply: (g) => { g.armor = Math.min(g.maxArmor + 50, g.armor + 50); }, active: (g) => g.armor >= g.maxArmor + 50 },
};
const AMMO_COST = { pistol: 1.5, smg: 1.6, rifle: 2.6, shotgun: 7, marksman: 10, whisper: 22 };

class Shop {
  constructor(game, director) {
    this.game = game;
    this.dir = director;
    this.perkLv = {};
    const root = (this.root = mkEl('div', 'shop', document.body));
    root.innerHTML = `
      <div class="head"><div><h3>SUPPLY CACHE</h3><div class="sub"></div></div><div class="wallet"><b>0</b></div></div>
      <div class="tabs"></div>
      <div class="grid"></div>
      <div class="foot"><div class="loadout"></div><div class="tm"></div><button data-a="ready">Ready · Next wave</button></div>`;
    this.tabs = ['weapons', 'supplies', 'upgrades', 'attachments', 'perks'];
    this.tab = 'weapons';
    const tabs = root.querySelector('.tabs');
    for (const t of this.tabs) { const s = mkEl('span', '', tabs, t); s.dataset.t = t; }
    tabs.addEventListener('click', (e) => { const t = e.target.dataset.t; if (t) { this.tab = t; this.render(); } });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      this.game.audio.unlock();
      if (b.dataset.a === 'ready') { this.dir.closeIntermission(); this.close(); return; }
      this.buy(b.dataset);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.dir.closeIntermission(); this.close(); }
      else if (e.code === 'Escape' || e.code === 'KeyB') { this.close(true); }
      else if (/^Digit[1-5]$/.test(e.code)) { this.tab = this.tabs[+e.code.slice(5) - 1]; this.render(); }
    });
  }

  get isOpen() { return this.root.classList.contains('on'); }

  open() {
    this.root.classList.add('on');
    document.body.classList.add('shopping');
    this.game.shopOpen = true;
    this.game.input.unlock();
    this.render();
  }

  close(walk = false) {
    this.closedAt = performance.now();
    this.root.classList.remove('on');
    document.body.classList.remove('shopping');
    this.game.shopOpen = false;
    if (walk || this.dir.state === 'countdown' || this.dir.state === 'wave') this.game.input.lock();
  }

  price(kind, id, extra) {
    const g = this.game;
    if (kind === 'weapon') return WEAPONS[id].price;
    if (kind === 'upgrade') { const u = UPGRADES[id], lv = extra.upgrades[id]; return lv >= u.max ? null : u.base + u.step * lv; }
    if (kind === 'attach') return ATTACHMENTS[id].price;
    if (kind === 'perk') { const p = PERKS[id], lv = this.perkLv[id] || 0; return lv >= p.max ? null : p.base + p.step * lv; }
    if (kind === 'boost') return BOOSTS[id].price;
    if (kind === 'ammo') {
      let c = 0;
      for (const w of g.arsenal.slots) if (w) c += (w.maxReserve - w.reserve) * (AMMO_COST[w.def.ballistic] || 2);
      return Math.ceil(c / 5) * 5;
    }
    if (kind === 'frag') return 250;
    if (kind === 'armor') return 300;
    if (kind === 'med') return 250;
    return 0;
  }

  buy(ds) {
    const g = this.game, d = this.dir, a = g.arsenal;
    const slot = ds.slot !== undefined ? +ds.slot : null;
    const w = slot !== null ? a.slots[slot] : null;
    const cost = this.price(ds.k, ds.id, w);
    if (cost === null || cost > d.cash) { g.audio.gunHandling('dry', 'pistol'); return; }
    switch (ds.k) {
      case 'weapon': {
        const def = WEAPONS[ds.id];
        if (a.owned(ds.id)) return;
        // replace the weapon in the active primary slot if both are full; refund half its value
        if (def.slot === 'primary' && a.slots[0] && a.slots[1]) {
          const i = a.index === 1 ? 1 : 0;
          d.cash += a.slots[i].value();
          a.slots[i] = null;
        }
        g.vm.prepare(def.rig); // start loading the rig while the shop is still open
        a.give(ds.id);
        break;
      }
      case 'upgrade': w.upgrades[ds.id]++; w.refreshBallistics(); if (ds.id === 'mag') w.ammo = w.magSize; break;
      case 'attach': w.attachments.add(ds.id); w.refreshBallistics(); w.ammo = Math.min(w.ammo, w.magSize); if (w === a.gun) g.vm.configure(w); break;
      case 'perk': this.perkLv[ds.id] = (this.perkLv[ds.id] || 0) + 1; PERKS[ds.id].apply(g); break;
      case 'boost': if (BOOSTS[ds.id].active(g)) return; BOOSTS[ds.id].apply(g); break;
      case 'ammo': for (const x of a.slots) if (x) x.reserve = x.maxReserve; break;
      case 'frag': if (a.grenades >= a.maxGrenades) return; a.grenades++; break;
      case 'armor': if (g.armor >= g.maxArmor) return; g.armor = Math.min(g.maxArmor, g.armor + 50); break;
      case 'med': if (g.player.health >= g.player.maxHealth) return; g.player.health = g.player.maxHealth; break;
    }
    d.cash -= cost;
    g.audio.gunHandling(ds.k === 'weapon' || ds.k === 'attach' ? 'equip' : 'magIn', 'rifle');
    this.render();
  }

  stat(label, v) { return `<span>${label}</span><i><b style="width:${clamp(v, 0.04, 1) * 100}%"></b></i>`; }

  weaponStats(def) {
    const b = Lab.Ballistics[def.ballistic];
    const energy = 0.5 * b.mass * b.speed * b.speed * (b.pellets || 1);
    return this.stat('DAMAGE', Math.log10(energy) / 4.1 - 0.35) + this.stat('RATE', def.rpm / 950) + this.stat('ACCURACY', 1 - def.adsSpread / 0.9) + this.stat('MOBILITY', (def.move - 0.8) / 0.22) + this.stat('CAPACITY', Math.log(def.mag) / Math.log(80));
  }

  card({ title, tag = '', desc = '', stats = '', price, k, id, slot, label = 'Buy', owned = false, disabled = false, pips = null }) {
    const d = this.dir;
    const can = price !== null && price !== undefined && price <= d.cash && !disabled;
    const pipHtml = pips ? `<div class="pips">${Array.from({ length: pips[1] }, (_, i) => `<i class="${i < pips[0] ? 'on' : ''}"></i>`).join('')}</div>` : '';
    return `<div class="item ${owned ? 'owned' : ''}">
      <div class="t"><b>${title}</b><em>${tag}</em></div>
      <div class="d">${desc}</div>
      ${stats ? `<div class="st">${stats}</div>` : ''}
      <div class="row">${pipHtml || `<span class="price ${price !== null && price > d.cash ? 'no' : ''}">${price === null || price === undefined ? '—' : price === 0 ? 'FREE' : '$' + fmt(price)}</span>`}
      ${pips ? `<span class="price ${price !== null && price > d.cash ? 'no' : ''}">${price === null ? 'MAX' : '$' + fmt(price)}</span>` : ''}
      <button data-k="${k}" data-id="${id}" ${slot !== undefined ? `data-slot="${slot}"` : ''} ${can ? '' : 'disabled'}>${owned ? 'Owned' : label}</button></div>
    </div>`;
  }

  render() {
    const g = this.game, d = this.dir, a = g.arsenal;
    const r = this.root;
    r.querySelector('.wallet b').textContent = fmt(d.cash);
    r.querySelector('.head .sub').textContent = `${g.level.theme.code} · ${g.level.theme.title} — NEXT: WAVE ${d.wave + 1}${(d.wave + 1) % 5 === 0 ? ' · BOSS' : ''}`;
    for (const s of r.querySelectorAll('.tabs span')) s.classList.toggle('on', s.dataset.t === this.tab);
    r.querySelector('.loadout').innerHTML = a.slots.map((s, i) => `<span class="${i === a.index ? 'on' : ''}">${i + 1} · ${s ? s.def.short : 'EMPTY'}</span>`).join('') + `<span>FRAG ${a.grenades}/${a.maxGrenades}</span><span>ARMOR ${Math.round(g.armor)}</span>`;
    let html = '';
    if (this.tab === 'weapons') {
      for (const [id, def] of Object.entries(WEAPONS)) {
        if (id === 'p9') continue;
        const owned = !!a.owned(id);
        html += this.card({ title: def.name, tag: def.cls, desc: def.desc, stats: this.weaponStats(def), price: def.price, k: 'weapon', id, owned, disabled: owned });
      }
    } else if (this.tab === 'supplies') {
      html += this.card({ title: 'Ammunition Resupply', tag: 'All weapons', desc: 'Fill the reserve of every weapon you carry.', price: this.price('ammo'), k: 'ammo', id: 'all', disabled: this.price('ammo') === 0, label: 'Refill' });
      html += this.card({ title: 'Frag Grenade', tag: `${a.grenades}/${a.maxGrenades}`, desc: 'Steel-cased fragmentation grenade. 2.4 s fuse, bounces off walls.', price: 250, k: 'frag', id: 'frag', disabled: a.grenades >= a.maxGrenades });
      html += this.card({ title: 'Armour Plate', tag: `${Math.round(g.armor)}/${g.maxArmor}`, desc: '+50 armour. Absorbs most of each hit until it is spent.', price: 300, k: 'armor', id: 'armor', disabled: g.armor >= g.maxArmor });
      html += this.card({ title: 'Trauma Medkit', tag: `${Math.ceil(g.player.health)}/${g.player.maxHealth}`, desc: 'Patch up to full health.', price: 250, k: 'med', id: 'med', disabled: g.player.health >= g.player.maxHealth });
      html += `<div class="sect">One-wave boosts</div>`;
      for (const [id, b] of Object.entries(BOOSTS)) {
        const on = b.active(g);
        html += this.card({ title: b.name, tag: on ? 'Active' : 'Boost', desc: b.desc, price: b.price, k: 'boost', id, disabled: on, label: on ? 'Ready' : 'Buy' });
      }
    } else if (this.tab === 'upgrades') {
      a.slots.forEach((w, slot) => {
        if (!w) return;
        html += `<div class="sect">${w.def.name}</div>`;
        for (const [id, u] of Object.entries(UPGRADES)) {
          const lv = w.upgrades[id];
          html += this.card({ title: u.name, tag: w.def.short, desc: u.desc, price: this.price('upgrade', id, w), k: 'upgrade', id, slot, pips: [lv, u.max], label: 'Upgrade' });
        }
      });
    } else if (this.tab === 'attachments') {
      a.slots.forEach((w, slot) => {
        if (!w) return;
        const list = w.def.attachments.filter((x) => !(w.def.fixed || []).includes(x));
        html += `<div class="sect">${w.def.name}</div>`;
        if (!list.length) html += `<div class="item"><div class="d">No attachments for this weapon.</div></div>`;
        for (const id of list) {
          const owned = w.attachments.has(id);
          html += this.card({ title: ATTACHMENTS[id].name, tag: w.def.short, desc: ATTACHMENTS[id].desc, price: ATTACHMENTS[id].price, k: 'attach', id, slot, owned, disabled: owned, label: 'Fit' });
        }
      });
    } else if (this.tab === 'perks') {
      for (const [id, p] of Object.entries(PERKS)) {
        const lv = this.perkLv[id] || 0;
        html += this.card({ title: p.name, tag: 'Permanent', desc: p.desc, price: this.price('perk', id), k: 'perk', id, pips: [lv, p.max], label: 'Train' });
      }
    }
    r.querySelector('.grid').innerHTML = html;
  }

  frame() {
    if (!this.isOpen) return;
    const d = this.dir;
    const left = Math.max(0, Math.ceil((d.intermissionTime || 60) - d.stateT));
    this.root.querySelector('.foot .tm').textContent = d.state === 'intermission' ? `SPACE / ENTER WHEN READY  ·  ESC TO WALK AROUND (${left}s)  ·  B TO REOPEN` : '';
    this.root.querySelector('.wallet b').textContent = fmt(d.cash);
    if (d.state !== 'intermission') this.close();
  }
}
