// Melee QA: swing timing vs damage, swings to kill, knockback, durability, sweep, walls, block breaking,
// shove + stomp. Usage: node dev/qa-combat-melee.cjs [section,...]   sections: weapons,sweep,wall,blocks,shove,break
const { boot } = require('./qa-combat-lib.cjs');
const WEAPONS = ['fists', 'kitchen_knife', 'hunting_knife', 'machete', 'katana', 'baseball_bat', 'nail_bat', 'crowbar', 'hammer', 'fire_axe', 'hatchet', 'golf_club', 'frying_pan', 'lead_pipe', 'sledgehammer', 'shovel', 'spear', 'police_baton', 'wrench', 'pitchfork', 'wooden_club', 'screwdriver'];
(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const want = (s) => !only || only.includes(s);
  const T = await boot({ fast: true });
  const s = await T.openSpot();
  await T.tp(s.x, s.y, s.z, 0, 0);
  await T.wait(2000);
  const killAll = () => T.ev(() => { const g = window.game; for (const z of g.zombies.zombies) if (!z.dead) z.die({}); g.zombies.zombies.length = 0; });
  const freeze = (zi, hp = 100) => T.ev(([zi, hp]) => { const z = window.__zmap[zi]; z.__upd = z.update.bind(z); z.update = (dt) => { if (window.__live) z.__upd(dt); }; z.hp = z.maxHp = hp; z.state = 'idle'; }, [zi, hp]);
  await T.ev(() => { window.game.player.skills.melee = { level: 0, xp: 0 }; });
  if (want('weapons')) {
    for (const id of WEAPONS) {
      await killAll();
      await T.hold(id === 'fists' ? null : id);
      await T.wait(450);
      const zi = await T.spawnFront(1.5);
      await freeze(zi);
      await T.wait(150);
      // timing: swing, then poll until the zombie loses hp
      const r = await T.ev(async (zi) => {
        const g = window.game, z = window.__zmap[zi], P = g.player;
        const cam = g.renderer.camera.position;
        const THREE = cam.constructor;
        const tp = z.visual.getPartPosition('torso', new THREE());
        const dx = tp.x - cam.x, dy = tp.y - cam.y, dz = tp.z - cam.z;
        P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        P.stamina = 100;
        const hp0 = z.hp, x0 = z.x, z0 = z.z;
        g.combat.cooldown = 0;
        const t0 = g.clock;
        const stack = P.inv.selectedStack, dur0 = stack ? stack.dur : null;
        g.combat.swing(stack, g.combat.def.melee ? g.combat.def : (await import('/src/items/items.js')).getItemDef('fists'), false);
        const vmHit = g.viewmodel.action ? g.viewmodel.action.dur * 0 : 0;
        const pend = g.combat.pendingHits[0]?.t;
        const animDur = g.viewmodel.action?.dur;
        const cd = g.combat.cooldown;
        let tHit = null;
        for (let i = 0; i < 200 && tHit == null; i++) {
          await new Promise((r) => setTimeout(r, 15));
          if (z.hp < hp0 || z.dead) tHit = g.clock - t0;
        }
        await new Promise((r) => setTimeout(r, 400));
        return { pend: +(pend ?? -1).toFixed(3), animDur: +(animDur ?? -1).toFixed(3), cooldown: +cd.toFixed(3), tHit: tHit == null ? null : +tHit.toFixed(3), dmg: +(hp0 - Math.max(0, z.hp)).toFixed(1), push: +Math.hypot(z.x - x0, z.z - z0).toFixed(2), state: z.state, durLoss: stack && dur0 != null ? +(dur0 - stack.dur).toFixed(2) : null, vmHit };
      }, zi);
      // swings to kill a 100hp walker aimed at the body / head
      const kill = async (part) => {
        await killAll();
        const zi2 = await T.spawnFront(1.5);
        await freeze(zi2);
        let n = 0;
        for (; n < 25; n++) {
          const zz = await T.zinfo(zi2);
          if (zz.dead) break;
          await T.ev(([zi2]) => { const z = window.__zmap[zi2]; z.x = window.game.player.x - Math.sin(window.game.player.yaw) * 1.5; z.z = window.game.player.z - Math.cos(window.game.player.yaw) * 1.5; z.vx = z.vz = 0; z.state = 'idle'; }, [zi2]);
          await T.aimAt(zi2, part);
          await T.ev(async () => { const g = window.game; g.combat.cooldown = 0; g.player.stamina = 100; const d = g.combat.def.melee ? g.combat.def : (await import('/src/items/items.js')).getItemDef('fists'); g.combat.swing(g.player.inv.selectedStack, d, false); const h = g.combat.pendingHits.pop(); if (h) g.combat.resolveMelee(h); g.viewmodel.cancel(); });
          if (await T.ev(() => !window.game.player.inv.selectedStack && window.__lastHeld !== null)) {}
        }
        return n;
      };
      r.bodyHits = await kill('torso');
      r.headHits = await kill('head');
      console.log(id, JSON.stringify(r));
    }
  }
  if (want('sweep')) {
    for (const id of ['katana', 'machete', 'sledgehammer', 'kitchen_knife']) {
      await killAll();
      await T.hold(id);
      await T.wait(400);
      const a = await T.spawnFront(1.4, {}, -0.35), b = await T.spawnFront(1.6, {}, 0.4);
      await freeze(a); await freeze(b);
      await T.wait(100);
      const r = await T.ev(([a, b]) => {
        const g = window.game, P = g.player;
        P.pitch = 0;
        g.combat.cooldown = 0; P.stamina = 100;
        g.combat.swing(P.inv.selectedStack, g.combat.def, false);
        const h = g.combat.pendingHits.pop(); g.combat.resolveMelee(h);
        const Z = window.__zmap;
        return { a: +(100 - Z[a].hp).toFixed(1), b: +(100 - Z[b].hp).toFixed(1) };
      }, [a, b]);
      console.log('sweep', id, JSON.stringify(r));
    }
  }
  if (want('wall')) {
    // zombie behind a wall block, slightly off-axis: no melee hit / shove through the wall
    await killAll();
    await T.hold('baseball_bat');
    await T.wait(400);
    const r = await T.ev(async () => {
      const g = window.game, P = g.player, w = g.world;
      const { B } = await import('/src/world/blocks.js');
      P.yaw = 0; P.pitch = 0;
      const bx = Math.floor(P.x), bz = Math.floor(P.z) - 1, by = Math.floor(P.y);
      for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 3; dy++) w.setBlock(bx + dx, by + dy, bz, B.brick_red, 0);
      const z = g.zombies.spawn(P.x + 0.5, P.y, P.z - 1.75, { variant: 'walker' });
      z.update = () => {}; z.hp = 100;
      P.yaw = 0.35; // look slightly to the side so the crosshair ray misses the body
      g.combat.cooldown = 0; P.stamina = 100;
      g.combat.swing(P.inv.selectedStack, g.combat.def, false);
      const h = g.combat.pendingHits.pop(); g.combat.resolveMelee(h);
      const afterSwing = z.hp;
      g.combat.shoveT = 0; g.combat.doShove();
      const afterShove = z.hp;
      for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 3; dy++) w.setBlock(bx + dx, by + dy, bz, 0, 0);
      z.die({});
      return { afterSwing: +afterSwing.toFixed(1), afterShove: +afterShove.toFixed(1) };
    });
    console.log('wall', JSON.stringify(r));
  }
  if (want('blocks')) {
    const cases = [['fire_axe', 'log_oak'], ['hatchet', 'log_oak'], ['baseball_bat', 'log_oak'], ['sledgehammer', 'brick_red'], ['fire_axe', 'brick_red'], ['crowbar', 'door'], ['fire_axe', 'door'], ['fists', 'door'], ['shovel', 'dirt'], ['pickaxe', 'dirt'], ['pickaxe', 'brick_red'], ['kitchen_knife', 'planks_oak']];
    for (const [id, blk] of cases) {
      await killAll();
      await T.hold(id === 'fists' ? null : id);
      await T.wait(300);
      const r = await T.ev(async ([blk]) => {
        const g = window.game, P = g.player, w = g.world;
        const { B, BLOCKS } = await import('/src/world/blocks.js');
        P.yaw = 0; P.pitch = 0;
        const bx = Math.floor(P.x), bz = Math.floor(P.z) - 2, by = Math.floor(P.y);
        if (blk === 'door') w.placeDoor(bx, by, bz, 0, 'door_wood', {});
        else w.setBlock(bx, by + 1, bz, B[blk] ?? B.planks, 0);
        const cam = g.renderer.camera.position;
        const ty = blk === 'door' ? by + 1.5 : by + 1.5;
        P.pitch = Math.atan2(ty - cam.y, Math.abs(cam.z - (bz + 1)) + 0.0);
        P.x = bx + 0.5; P.z = bz + 1 + 1.0;
        const id0 = w.get(bx, by + 1, bz);
        let n = 0;
        for (; n < 40; n++) {
          if (w.get(bx, by + 1, bz) !== id0) break;
          g.combat.cooldown = 0; P.stamina = 100;
          const d = g.combat.def.melee ? g.combat.def : (await import('/src/items/items.js')).getItemDef('fists');
          g.combat.swing(P.inv.selectedStack, d, false);
          const h = g.combat.pendingHits.pop(); if (h) g.combat.resolveMelee(h);
        }
        const broke = w.get(bx, by + 1, bz) !== id0;
        // clean up
        if (blk === 'door') { const dd = w.getDoor(bx, by, bz); if (dd) w.removeDoor(dd); } else w.setBlock(bx, by + 1, bz, 0, 0);
        g.viewmodel.cancel();
        return { swings: n, broke, name: BLOCKS[id0]?.name };
      }, [blk]);
      console.log('block', id, blk, JSON.stringify(r));
    }
  }
  if (want('shove')) {
    await killAll();
    await T.hold('kitchen_knife');
    await T.wait(300);
    const zi = await T.spawnFront(1.3);
    await T.ev((zi) => { const z = window.__zmap[zi]; z.hp = 100; }, zi);
    const r = await T.ev(async (zi) => {
      const g = window.game, P = g.player, z = window.__zmap[zi];
      P.pitch = 0;
      const x0 = z.x, z0 = z.z;
      g.combat.shoveT = 0; P.stamina = 100;
      g.combat.doShove();
      await new Promise((r) => setTimeout(r, 600));
      return { push: +Math.hypot(z.x - x0, z.z - z0).toFixed(2), state: z.state, hp: +z.hp.toFixed(1) };
    }, zi);
    console.log('shove', JSON.stringify(r));
    await T.shot('shove');
    // stomp a downed zombie: it must stay down, and die after a few stomps
    await killAll();
    const zj = await T.spawnFront(1.1);
    const st = await T.ev(async (zj) => {
      const g = window.game, P = g.player, z = window.__zmap[zj];
      z.hp = z.maxHp = 100;
      z.setState('down', 3);
      P.pitch = -1.0;
      const log = [];
      for (let i = 0; i < 6 && !z.dead; i++) {
        g.combat.cooldown = 0; P.stamina = 100;
        if (z.state !== 'down') z.setState('down', 3);
        const target = g.combat.findStompTarget();
        g.combat.doStomp();
        log.push({ hp: +z.hp.toFixed(1), state: z.state, target: !!target });
        await new Promise((r) => setTimeout(r, 120));
      }
      return { dead: z.dead, log };
    }, zj);
    console.log('stomp', JSON.stringify(st));
  }
  if (want('break')) {
    // durability: a weapon at 1 durability breaks on the next hit
    await killAll();
    await T.hold('kitchen_knife');
    await T.ev(() => { window.game.player.inv.selectedStack.dur = 0.5; });
    await T.wait(300);
    const zi = await T.spawnFront(1.4);
    await freeze(zi);
    await T.aimAt(zi, 'torso');
    const r = await T.ev(() => {
      const g = window.game, P = g.player;
      window.__toasts.length = 0;
      for (let k = 0; k < 3 && P.inv.selectedStack; k++) {
        g.combat.cooldown = 0; P.stamina = 100;
        g.combat.swing(P.inv.selectedStack, g.combat.def, false);
        const h = g.combat.pendingHits.pop(); if (h) g.combat.resolveMelee(h);
      }
      return { held: P.inv.selectedStack ? P.inv.selectedStack.id : null, toasts: window.__toasts.slice(), vm: g.viewmodel.meta.id };
    });
    console.log('break', JSON.stringify(r));
  }
  await T.done();
})();
