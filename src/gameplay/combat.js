// Combat rules: attack data, attack selection (combos, weapons), hit resolution, blocking,
// grappling and throws. Characters call into this module; it emits events for audio, FX,
// guards and the social system.
import { CONFIG } from '../config.js';
import { angleDiff, yawTo, clamp } from '../core/mathutil.js';

// Timings in seconds. hitAt = when the strike lands. range: preferred distance band used by
// automatic move selection (inspired by "Last Stance" free-flow combat, toned down for a
// prison brawler: no launches, no spinning kicks, short motion warping).
export const ATTACKS = {
  jab: { anim: 'jab', dur: 0.36, hitAt: 0.13, range: 1.3, arc: 1.0, dmg: 5, poise: 16, stam: 5, lunge: 0.35, band: 'mid', region: 'head', next: 'cross', sound: 'punch_light' },
  cross: { anim: 'cross', dur: 0.42, hitAt: 0.17, range: 1.35, arc: 0.95, dmg: 7, poise: 22, stam: 7, lunge: 0.4, band: 'mid', region: 'head', next: 'hook', sound: 'punch_light' },
  hook: { anim: 'hook', dur: 0.48, hitAt: 0.2, range: 1.2, arc: 1.3, dmg: 8, poise: 30, stam: 9, lunge: 0.3, band: 'mid', region: 'head', next: 'uppercut', sound: 'punch_heavy' },
  bodyhook: { anim: 'hook', mirror: true, dur: 0.46, hitAt: 0.2, range: 1.1, arc: 1.3, dmg: 7, poise: 34, stam: 8, lunge: 0.25, band: 'close', region: 'gut', next: 'uppercut', sound: 'body_hit' },
  uppercut: { anim: 'uppercut', dur: 0.55, hitAt: 0.25, range: 1.15, arc: 0.95, dmg: 11, poise: 60, stam: 11, lunge: 0.3, band: 'close', region: 'head', heavy: true, knock: true, sound: 'punch_heavy', minCombo: 2 },
  kick: { anim: 'kick', dur: 0.62, hitAt: 0.27, range: 1.6, arc: 0.95, dmg: 9, poise: 42, stam: 11, lunge: 0.35, band: 'far', region: 'gut', heavy: true, sound: 'kick' },
  haymaker: { anim: 'haymaker', dur: 0.75, hitAt: 0.41, range: 1.4, arc: 1.1, dmg: 13, poise: 75, stam: 15, lunge: 0.55, band: 'mid', region: 'head', heavy: true, guardBreak: true, knock: true, sound: 'punch_heavy' },
  stomp: { anim: 'stomp', dur: 0.6, hitAt: 0.27, range: 1.25, arc: 1.4, dmg: 7, poise: 0, stam: 8, lunge: 0.25, ground: true, region: 'gut', sound: 'kick' },
  swing: { anim: 'swing', dur: 0.55, hitAt: 0.26, range: 1.55, arc: 1.5, dmgMul: 1, poise: 34, stam: 9, lunge: 0.3, weapon: true, next: 'swingB', region: 'head', sound: 'club_hit' },
  swingB: { anim: 'swing', mirror: true, dur: 0.55, hitAt: 0.26, range: 1.55, arc: 1.5, dmgMul: 1.1, poise: 38, stam: 9, lunge: 0.3, weapon: true, next: 'swing', region: 'head', sound: 'club_hit' },
  overhead: { anim: 'overhead', dur: 0.85, hitAt: 0.53, range: 1.5, arc: 1.0, dmgMul: 1.5, poise: 85, stam: 15, lunge: 0.4, weapon: true, heavy: true, guardBreak: true, knock: true, region: 'head', sound: 'club_hit' },
  swing2h: { anim: 'swing2h', dur: 0.75, hitAt: 0.41, range: 1.6, arc: 1.7, dmgMul: 1.2, poise: 60, stam: 13, lunge: 0.35, weapon: true, heavy: true, region: 'chest', sound: 'club_hit' },
  shove: { anim: 'shove', dur: 0.45, hitAt: 0.2, range: 1.2, arc: 1.1, dmg: 1, poise: 30, stam: 6, lunge: 0.2, push: 4.5, region: 'chest', sound: 'body_hit' },
  knee: { anim: 'knee', dur: 0.5, hitAt: 0.22, dmg: 6, poise: 26, stam: 6, grapple: true, region: 'gut', sound: 'body_hit' },
  headbutt: { anim: 'headbutt', dur: 0.55, hitAt: 0.28, dmg: 9, poise: 45, stam: 9, grapple: true, heavy: true, region: 'head', sound: 'punch_heavy' },
  counter: { anim: 'cross', dur: 0.38, hitAt: 0.12, range: 1.6, arc: 1.6, dmg: 9, poise: 55, stam: 6, lunge: 0.5, region: 'head', heavy: true, knock: false, sound: 'parry' },
};

/** Pick the attack for a button press given the character's situation. */
export function chooseAttack(c, kind, prev) {
  const held = c.held;
  if (c.state === 'grapple') return kind === 'heavy' ? 'headbutt' : 'knee';
  const tgt = c.combatTarget;
  if (tgt && tgt.isDown && tgt.state !== 'thrown' && Math.hypot(tgt.x - c.x, tgt.z - c.z) < 1.9) return 'stomp';
  if (held && held.def.dmg > 0) {
    if (kind === 'heavy') return held.def.carry === 'twoHand' ? 'swing2h' : 'overhead';
    if (prev && ATTACKS[prev] && ATTACKS[prev].weapon && ATTACKS[prev].next) return ATTACKS[prev].next;
    return held.def.carry === 'twoHand' ? 'swing2h' : 'swing';
  }
  const dist = tgt ? Math.hypot(tgt.x - c.x, tgt.z - c.z) - tgt.radius : 99;
  if (kind === 'heavy') return prev === 'cross' || prev === 'hook' || prev === 'bodyhook' ? 'haymaker' : dist < 0.75 ? 'uppercut' : 'kick';
  const combo = c.combo || 0;
  if (prev && ATTACKS[prev] && ATTACKS[prev].next && !ATTACKS[prev].weapon) {
    const nx = ATTACKS[prev].next;
    if ((ATTACKS[nx].minCombo || 0) <= combo) return nx;
  }
  // Free-flow style opener: pick by distance band so the swing fits the gap.
  if (dist < 0.62) return combo % 2 ? 'bodyhook' : 'hook';
  return 'jab';
}

/** Damage scaling from stats. */
export function computeDamage(att, vic, atk, item) {
  let base = atk.dmg ?? 0;
  if (atk.weapon && item) base = item.def.dmg * (atk.dmgMul || 1);
  const strMul = 0.65 + (att.stats.str / 100) * 0.75;
  const tghRed = 1 - Math.min(0.32, (vic.stats.tgh / 100) * 0.32);
  const tired = att.stamina < CONFIG.stamina.exhaustedThreshold ? 0.6 : 1;
  const energy = att.energy < 15 ? 0.8 : 1;
  const hooch = att.drunk > 0 ? 1.15 : 1;
  return base * strMul * tghRed * tired * energy * hooch * (0.9 + Math.random() * 0.2);
}

/** Candidates for a strike, best first. */
export function strikeTargets(c, atk, chars) {
  const out = [];
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  const reach = atk.range + (c.held?.def.reach || 0);
  for (const o of chars) {
    if (o === c || o.state === 'ko' && !atk.ground) continue;
    if (o.isDown !== !!atk.ground && !(atk.ground && o.state === 'getup')) {
      if (!(atk.ground && o.isDown)) continue;
    }
    if (o.state === 'thrown') continue;
    if (o.grapple && o.grapple.partner === c && !atk.grapple) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
    if (d > reach + o.radius) continue;
    const ang = Math.abs(angleDiff(c.yaw, yawTo(dx, dz)));
    if (ang > atk.arc / 2 + (d < 0.6 ? 0.8 : 0)) continue;
    out.push({ o, d, score: d + ang * 0.6 });
    void fx; void fz;
  }
  out.sort((a, b) => a.score - b.score);
  return out;
}

/** Called when an attack reaches its hit frame. Returns number of characters hit. */
export function resolveAttack(game, c, act) {
  const atk = act.atk;
  if (atk.grapple) {
    const v = c.grapple && c.grapple.partner;
    if (!v) return 0;
    applyHit(game, c, v, atk, null, Math.sin(c.yaw), Math.cos(c.yaw));
    if (v.hp <= 0 || v.state === 'down') c.endGrapple('broken');
    return 1;
  }
  const targets = strikeTargets(c, atk, game.characters);
  const maxHits = atk.weapon ? (c.held && c.held.def.carry === 'twoHand' ? 3 : 2) : 1;
  let n = 0;
  for (const { o } of targets.slice(0, maxHits)) {
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz) || 1;
    applyHit(game, c, o, atk, c.held, dx / d, dz / d);
    n++;
  }
  if (n === 0) game.events.emit('whiff', { c, atk });
  return n;
}

export function applyHit(game, att, vic, atk, item, dirX, dirZ) {
  const dmg = computeDamage(att, vic, atk, item);
  const result = vic.takeHit(att, {
    dmg, poise: atk.poise, dirX, dirZ, heavy: !!atk.heavy, guardBreak: !!atk.guardBreak, knock: !!atk.knock,
    push: atk.push || 0, ground: !!atk.ground, weapon: !!atk.weapon, attack: atk,
  });
  if (atk.weapon && item && result !== 'dodged') {
    item.durability -= result === 'blocked' ? 2 : 1;
    if (item.durability <= 0 && item.def.durability < 900) game.breakItem(item, att);
  }
  if (result !== 'dodged') {
    const stop = atk.heavy ? 0.085 : 0.055;
    att.hitstop = Math.max(att.hitstop, stop); vic.hitstop = Math.max(vic.hitstop, stop);
  }
  game.events.emit('hit', { att, vic, atk, dmg, result, item });
  return result;
}

/** Grab check at the grab frame. */
export function tryGrapple(game, c, target) {
  const cands = target ? [target] : game.characters;
  let best = null, bestD = Infinity;
  for (const o of cands) {
    if (o === c || o.isDown || o.state === 'grapple' || o.state === 'grappled' || o.state === 'spot' || o.iframes > 0) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
    if (d > CONFIG.combat.grabRange + o.radius) continue;
    if (Math.abs(angleDiff(c.yaw, yawTo(dx, dz))) > 0.75) continue;
    if (d < bestD) { bestD = d; best = o; }
  }
  if (!best) { game.events.emit('grabMiss', { c }); return false; }
  // Strikes beat grabs: a target in the active part of an attack shrugs it off.
  if (best.act && best.act.type === 'attack' && best.act.t >= best.act.atk.hitAt - 0.08 && best.act.t <= best.act.atk.hitAt + 0.05) {
    game.events.emit('grabMiss', { c, countered: best }); return false;
  }
  c.beginGrapple(best);
  game.events.emit('grab', { att: c, vic: best });
  return true;
}

export function throwFromGrapple(game, c, dirX, dirZ) {
  const v = c.grapple && c.grapple.partner;
  if (!v) return;
  c.endGrapple('throw');
  const strength = clamp(0.75 + (c.stats.str - v.stats.str) / 120, 0.55, 1.25);
  v.launch(dirX * 6.8 * strength, 3.4, dirZ * 6.8 * strength, c);
  game.events.emit('throw', { att: c, vic: v });
}
