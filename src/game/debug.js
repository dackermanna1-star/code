// Debug / test hooks exposed as window.__game.debug
import * as THREE from 'three';
import { AutoPilot } from './bot.js';

export function installDebug(game) {
  const W = () => game.world;
  game.debug = {
    passive(on = true) { W().noBotCombat = on; },
    god(on = true) { for (const s of W().survivors) s.invuln = on ? 1e9 : 0; },
    spawnMob(n = 20, near = false) { const w = W(); w.director.enabled = true; w.director.spawnMob(n, near ? { near: w.player.body.pos } : { reason: 'debug' }); },
    spawnSpecial(type, dist = 10) {
      const w = W(), p = w.player;
      const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const pos = p.body.pos.clone().addScaledVector(f, dist);
      const n = w.nav.nearest(pos.x, pos.y + 0.5, pos.z, 6);
      return w.director.spawnSpecial(type, { node: n, aware: true });
    },
    spawnCommons(n = 5, dist = 8) {
      const w = W(), p = w.player;
      const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      for (let i = 0; i < n; i++) {
        const pos = p.body.pos.clone().addScaledVector(f, dist + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4));
        const node = w.nav.nearest(pos.x, pos.y + 0.5, pos.z, 6);
        if (node >= 0) w.director.spawnCommon(node, { mob: true });
      }
    },
    give(id) { const p = W().player; p.give(id); },
    teleport(x, y, z) { const w = W(); for (const s of w.survivors) { s.body.pos.set(x + (Math.random() - 0.5), y + 0.05, z + (Math.random() - 0.5)); s.body.vel.set(0, 0, 0); } },
    autopilot(on = true) { const w = W(); if (on) { const ap = new AutoPilot(w, w.player); w.player.controller = ap; game.autopilot = ap; } },
    look(yaw, pitch = 0) { game.player.yaw = yaw; game.player.pitch = pitch; },
    startDirector() { W().director.start(); },
    info() {
      const w = W();
      return {
        t: +w.time.toFixed(1), fps: game.hud.fps, phase: w.director.phase, enabled: w.director.enabled, panic: !!w.director.panic,
        infected: w.infected.filter((z) => z.alive).map((z) => z.type).reduce((a, t) => (a[t] = (a[t] || 0) + 1, a), {}),
        dead: w.infected.filter((z) => !z.alive).length, progress: Math.round(w.director.teamProgress()), total: Math.round(w.director.totalFlow),
        surv: w.survivors.map((s) => ({ n: s.name, st: s.state, hp: Math.round(s.total), pos: s.body.pos.toArray().map((v) => +v.toFixed(1)), w: s.activeWeapon ? s.activeWeapon.id : s.activeItem, pin: s.pinnedBy ? s.pinnedBy.type : null, k: s.stats.commons, mode: s.controller && s.controller.mode })),
        msgs: w.messages.map((m) => m.text), ended: w.ended || null,
      };
    },
  };
}
