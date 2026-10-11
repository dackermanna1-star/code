// Builds the per-frame HudState for src/ui/hud.js from the game state.

import { TEAM_T, TEAM_CT, TEAM_SPEC } from './player.js';

// CS 1.6 client crosshair base distance / delta per weapon (CHudAmmo::DrawCrosshair)
const XHAIR = {
  p228: [8, 3], hegrenade: [8, 3], smokegrenade: [8, 3], fiveseven: [8, 3], usp: [8, 3], glock: [8, 3], awp: [8, 3], flashbang: [8, 3], deagle: [8, 3],
  mp5: [6, 2], m3: [8, 6], g3sg1: [6, 4], ak47: [4, 4], tmp: [7, 3], knife: [7, 3], p90: [7, 3], xm1014: [9, 4], mac10: [9, 3],
  aug: [3, 3], c4: [6, 3], ump45: [6, 3], m249: [6, 3], scout: [5, 3], sg550: [5, 3], sg552: [5, 3],
};

const xh = { dist: 4, lastClip: -1, lastWeapon: null };

export function buildHudState(game, extra = {}) {
  const me = game.local;
  const s = { fps: extra.fps, netgraph: extra.netgraph, damage: [], flash: 0 };
  if (!me) return { ...s, alive: false, team: TEAM_SPEC };
  const target = me.alive ? me : (game.spectate?.mode === 'chase' && game.spectate.target?.alive ? game.spectate.target : null);
  const p = target || me;
  const w = p.alive ? p.active : null;
  s.alive = me.alive;
  s.team = me.team;
  s.health = Math.max(0, Math.round(p.health));
  s.armor = Math.round(p.armor);
  s.helmet = p.helmet;
  s.money = me.money;
  s.weaponId = w?.id || null;
  if (w && w.def.clip > 0) { s.clip = w.clip; s.reserve = w.ammo; }
  else if (w && w.def.slot === 4) { s.clip = null; s.reserve = w.count || 1; }
  else { s.clip = null; s.reserve = null; }
  const R = game.rounds;
  s.bombPlanted = !!(R.bomb && !R.bomb.exploded && !R.bomb.defused);
  s.roundTime = s.bombPlanted ? null : R.timeLeft();
  s.hasC4 = !!p.weapons?.[5];
  s.inBombZone = s.hasC4 && !!game.bombZoneOf(p);
  s.inBuyZone = me.alive && game.inBuyZone(me) && R.buyTimeLeft();
  s.hasDefuser = !!p.defuser;
  s.spectator = me.alive ? null : { target: target ? target.name : null, mode: game.spectate?.mode || 'free' };

  // dynamic crosshair
  const settings = extra.settings;
  if (w) {
    const [base, delta] = XHAIR[w.id] || [4, 3];
    let target = base;
    const v = p.pm.velocity;
    const speed = Math.hypot(v[0], v[1]);
    if (!p.pm.onground) target *= 2;
    else if (speed > 140) target *= 1.5;
    if (p.pm.ducking) target *= 0.8;
    if (xh.lastWeapon !== w) { xh.lastWeapon = w; xh.lastClip = w.clip; xh.dist = target; }
    if (w.clip < xh.lastClip) xh.dist = Math.min(15, xh.dist + delta);
    xh.lastClip = w.clip;
    xh.dist += (target - xh.dist) * Math.min(1, (extra.dt || 0.016) * 6);
    if (xh.dist < target) xh.dist = target;
    xh.dist -= 0.013 * 60 * (extra.dt || 0.016) * (xh.dist - target);
  }
  const scoped = p.fov < 90 && w && /awp|scout|g3sg1|sg550/.test(w.id);
  s.scope = scoped ? (p.fov <= 15 ? 2 : 1) : 0;
  s.crosshair = {
    visible: !!w && !scoped && me.alive,
    gap: settings?.get('cl_dynamiccrosshair') === 0 ? 4 : xh.dist,
    color: settings?.get('crosshairColor') || [50, 250, 50],
    size: settings?.get('crosshairSize') || 'auto',
  };

  // radar
  const blips = [];
  for (const q of game.players) {
    if (q === p || !q.alive || q.team !== me.team || me.team === TEAM_SPEC) continue;
    const o = q.pm.origin;
    blips.push({ x: o[0], y: o[1], z: o[2], kind: 'teammate', alive: true, bomb: !!q.weapons[5] });
  }
  if (me.team === TEAM_T) {
    if (R.bomb && !R.bomb.exploded) blips.push({ x: R.bomb.pos[0], y: R.bomb.pos[1], z: R.bomb.pos[2], kind: 'bomb_planted', flash: true });
    const dropped = game.dropped.find((d) => d.weapon.id === 'c4');
    if (dropped) blips.push({ x: dropped.pos[0], y: dropped.pos[1], z: dropped.pos[2], kind: 'bomb' });
  }
  s.radar = { yaw: p.pm.angles[1], pos: [p.pm.origin[0], p.pm.origin[1], p.pm.origin[2]], blips, range: 1024 };

  // flashbang
  const t = game.time;
  if (me.alive && me.flashUntil > t) {
    const max = me.flashMax ?? 1;
    if (t < me.flashFull) s.flash = max;
    else s.flash = max * (me.flashUntil - t) / Math.max(0.01, me.flashUntil - me.flashFull);
  }
  s.damage = (game.damageIndicators || []).filter((d) => t - d.t < 1).map((d) => ({ dir: d.dir, t: t - d.t }));
  return s;
}
