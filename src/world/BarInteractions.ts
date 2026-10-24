import * as THREE from 'three';
import { ctx } from '../game/ctx';
import { events } from '../game/events';
import { RAPIER } from '../physics/Physics';
import type { LevelInfo } from './BarLevel';
import type { Interactables } from '../player/Interaction';
import type { WeaponSystem } from '../weapons/Weapons';
import type { Player } from '../player/Player';
import type { Prop } from './Props';
import type { Combatant } from '../game/Combat';
import { pick, rand } from '../core/math';

const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function sfx(name: string, pos: THREE.Vector3 | null, volume = 1, pitch = 1): void {
  ctx.services.audio?.play?.(name, pos, { volume, pitch });
}

/** Staff and nearby patrons take offence at vandalism. */
function provoke(by: Combatant, pos: THREE.Vector3, radius: number, anger: number, bark?: string): void {
  const ai = ctx.services.ai;
  if (!ai || ai.peaceful) return;
  for (const b of ai.brains) {
    if (!b.ch.alive || b.ch.position.distanceTo(pos) > radius) continue;
    const staff = !!b.workKind;
    b.addAnger(by, anger * (staff ? 1.6 : 0.6));
    if (bark && staff && Math.random() < 0.6) b.bark(bark);
  }
  events.emit('noise', { pos: pos.clone(), radius, kind: 'shout', source: by });
}

/**
 * Hooks up the bar's interactive fixtures for one round: jukebox (change songs,
 * smash it), beer taps (pour a pint), the till, arcade cabinets and pinball.
 */
export function setupBarInteractions(level: LevelInfo, it: Interactables, weapons: WeaponSystem): void {
  // ------------------------------------------------------------------ jukebox
  const juke = level.jukebox;
  const jukeOwner = ctx.physics.ownerOf(juke.collider);
  const damageJukebox = (amount: number, point: THREE.Vector3, dir: THREE.Vector3, by: Combatant | null) => {
    if (juke.broken) {
      ctx.fx.sparkBurst(point, dir.clone().negate(), 6, 0xffd080);
      sfx('juke_kick', juke.pos, 0.8);
      return;
    }
    juke.health -= amount;
    ctx.fx.sparkBurst(point, dir.clone().negate(), 4 + Math.floor(amount / 6), 0xffc060);
    ctx.services.music?.bump?.();
    if (by) provoke(by, juke.pos, 9, 0.6, pick(['Hey! Not the jukebox!', 'That thing was vintage!']));
    if (juke.health <= 0) {
      juke.broken = true;
      ctx.services.music?.smash?.();
      sfx('juke_smash', juke.pos, 1.2);
      _v.copy(juke.pos).setY(1.0);
      ctx.fx.sparkBurst(_v, dir.clone().negate(), 40, 0xffd080);
      ctx.fx.debris(_v, dir.clone().negate(), 22, 0xffd8a0, 'glass', 0.025, 3.5);
      ctx.fx.debris(_v, dir.clone().negate(), 10, 0x5a1010, 'splinter', 0.04, 3);
      ctx.fx.dust(_v, 8, 0x6a5a4a);
      // the glowing front dies
      juke.mesh.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && m.emissiveIntensity !== undefined) m.emissiveIntensity = 0.04;
      });
      juke.mesh.rotation.z = 0.06;
      juke.mesh.position.x += 0.04;
      if (by) {
        provoke(by, juke.pos, 18, 1.2, 'The music! You killed the music!');
        if (by.isPlayer) ctx.player.stats.objectsBroken++;
      }
      events.emit('impact', { pos: _v.clone(), normal: dir.clone().negate(), material: 'glass', strength: 1.5, otherMaterial: 'break' as any });
    }
  };
  if (jukeOwner) {
    jukeOwner.onMeleeHit = (dmg, point, dir, by) => damageJukebox(dmg, point, dir, by);
    jukeOwner.onContactForce = (ev) => {
      if (ev.impulse < 25) return;
      const thrower = ctx.props.propOf(ev.other)?.thrownBy ?? null;
      damageJukebox(Math.min(60, ev.impulse * 0.35), ev.point, ev.dir, thrower);
    };
    juke.collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    juke.collider.setContactForceEventThreshold(120);
  }
  it.add(juke.collider, {
    get label() {
      return juke.broken ? 'Kick the jukebox' : 'Change the song';
    },
    use: (p: Player) => {
      if (juke.broken) {
        // a good whack sometimes brings it sputtering back for a few bars
        sfx('juke_kick', juke.pos);
        ctx.services.music?.sputter?.();
        return true;
      }
      ctx.services.music?.nextSong?.();
      sfx('juke_select', juke.pos, 0.8);
      events.emit('noise', { pos: juke.pos.clone(), radius: 6, kind: 'music', source: p });
      return true;
    },
  });

  // ------------------------------------------------------------------ beer taps
  for (const tap of level.taps) {
    const col = ctx.physics.addStaticBox({ x: tap.x - 0.12, y: tap.y + 0.27, z: tap.z }, { x: 0.12, y: 0.2, z: 0.42 }, 'metal');
    let lastPour = -10;
    it.add(col, {
      label: 'Pour a pint',
      enabled: () => !ctx.player.weapon && !ctx.player.grabbed && !ctx.player.carryingBody,
      use: (p: Player) => {
        const now = ctx.time.elapsed;
        if (now - lastPour < 1.2) return false;
        lastPour = now;
        const pint: Prop = ctx.props.spawn('pint', _v.set(tap.x + 0.15, tap.y + 0.02, tap.z + rand(-0.2, 0.2)), 0);
        pint.full = true;
        sfx('pour', tap, 0.9);
        weapons.playerPickUp(p, pint);
        // pouring yourself a free one annoys the bartender (during the brawl)
        if (ctx.services.ai?.brawlStarted) provoke(p, tap, 7, 0.3);
        return true;
      },
    });
  }

  // ------------------------------------------------------------------ props with a use action
  it.onProp('register', (prop, p) => {
    if (prop.usedAt > 0) {
      sfx('register', prop.position(_v), 0.6, 0.8);
      return;
    }
    prop.usedAt = ctx.time.elapsed;
    const pos = prop.position(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, 0));
    sfx('register', pos, 1);
    // cash everywhere
    for (let i = 0; i < 26; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(1.5, 3.5), rand(-1, 1));
      ctx.fx.particles.spawn('debris', pos, v, { size: rand(0.03, 0.05), color: pick([0x7fb069, 0x9ccf7f, 0x5f8f4f, 0xd8d0a0]), life: rand(8, 14), bounce: 0.1, spin: 12, drag: 3, gravity: 4 });
    }
    p.addAdrenaline(15);
    provoke(p, pos, 12, 1.4, pick(["Hands off the till!", 'Thief!', "That's the night's takings!"]));
    ctx.services.ai?.startBrawl?.();
  });

  const playCabinet = (prop: Prop, p: Player, kind: 'arcade' | 'pinball') => {
    const now = ctx.time.elapsed;
    if (now - prop.usedAt < 2) return;
    prop.usedAt = now;
    const pos = prop.position(new THREE.Vector3()).add(new THREE.Vector3(0, 1.2, 0));
    sfx(kind === 'arcade' ? 'arcade' : 'pinball', pos, 0.9);
    ctx.fx.sparkBurst(pos, UP, 10, kind === 'arcade' ? 0x60f0ff : 0xffe060);
    // a quick game takes the edge off
    p.heal(3);
    events.emit('noise', { pos, radius: 5, kind: 'music', source: p });
  };
  it.onProp('arcade', (prop, p) => playCabinet(prop, p, 'arcade'));
  it.onProp('pinball', (prop, p) => playCabinet(prop, p, 'pinball'));
}
