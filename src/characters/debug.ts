// Debug / automation helpers for the Characters module (window.__game.*).
import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import { registerDebug } from '../core/Debug';
import type { Perspective, Stance } from '../core/types';
import type { CharacterRegistry } from './CharacterRegistry';
import type { Character } from './Character';
import type { PlayerController } from './player/PlayerController';
import type { CameraRig } from './camera/CameraRig';
import { HitboxDebug } from './hitbox/HitboxDebug';

/** Ground height at x,z from physics (buildings/props) or terrain. */
export function groundY(ctx: GameContext, x: number, z: number): number {
  const hit = ctx.physics.groundBelow(new THREE.Vector3(x, 2000, z), 2500);
  return hit ? hit.point.y : ctx.world.getHeight(x, z);
}

export function installCharacterDebug(ctx: GameContext, registry: CharacterRegistry, controller: PlayerController, rig: CameraRig): void {
  const hitboxDebug = new HitboxDebug(ctx, registry);
  const player = () => ctx.player as Character | null;

  registerDebug('spawnPlayer', (x?: number, z?: number, yaw = 0) => {
    const px = x ?? ctx.world.size / 2;
    const pz = z ?? ctx.world.size / 2;
    if (ctx.player) registry.remove(ctx.player);
    const c = registry.spawn({ name: 'Player', teamId: 0, isPlayer: true, position: new THREE.Vector3(px, groundY(ctx, px, pz) + 0.05, pz), yaw });
    return c.id;
  });
  registerDebug('spawnBot', (x: number, z: number, yaw = 0, variant = 1) => {
    const c = registry.spawn({ name: `Bot${registry.list.length}`, teamId: 100 + registry.list.length, isPlayer: false, position: new THREE.Vector3(x, groundY(ctx, x, z) + 0.05, z), yaw, variant });
    return c.id;
  });
  registerDebug('teleport', (x: number, z: number, y?: number) => {
    const p = player();
    if (!p) return false;
    p.teleport(new THREE.Vector3(x, y ?? groundY(ctx, x, z) + 0.05, z));
    return true;
  });
  registerDebug('setLook', (yaw: number, pitch = 0) => {
    const p = player();
    if (!p) return;
    p.intent.yaw = yaw;
    p.intent.pitch = pitch;
  });
  registerDebug('setStance', (s: Stance) => player()?.requestStance(s) ?? false);
  registerDebug('setPerspective', (p: Perspective) => rig.setPerspective(p));
  registerDebug('skydive', (height = 600, x?: number, z?: number) => {
    const p = player();
    if (!p) return false;
    const px = x ?? p.position.x;
    const pz = z ?? p.position.z;
    p.teleport(new THREE.Vector3(px, groundY(ctx, px, pz) + height, pz));
    p.setMoveState('freefall');
    return true;
  });
  registerDebug('showHitboxes', (on = true) => hitboxDebug.setEnabled(on));
  registerDebug('playerState', () => {
    const p = player();
    if (!p) return null;
    return describe(p, controller);
  });
  registerDebug('characters', () => registry.list.map((c) => describe(c, controller)));
  registerDebug('charById', (id: number) => registry.byId(id));
  registerDebug('cameraState', () => ({
    mode: rig.mode,
    perspective: rig.perspective,
    zoom: rig.zoom,
    fovH: rig.fovH,
    adsBlend: rig.adsBlend,
    pos: ctx.camera.position.toArray().map((v) => +v.toFixed(3)),
  }));
}

function describe(c: Character, controller: PlayerController) {
  const r = (v: number) => +v.toFixed(3);
  return {
    id: c.id,
    name: c.name,
    pos: [r(c.position.x), r(c.position.y), r(c.position.z)],
    vel: [r(c.velocity.x), r(c.velocity.y), r(c.velocity.z)],
    hspeed: r(Math.hypot(c.velocity.x, c.velocity.z)),
    yaw: r(c.yaw),
    pitch: r(c.pitch),
    stance: c.stance,
    stanceHeight: r(c.stanceHeight),
    moveState: c.moveState,
    mode: c.mode,
    lifeState: c.lifeState,
    health: r(c.health),
    grounded: c.isGrounded,
    lean: r(c.lean),
    aiming: c.isAiming,
    ads: c.isADS,
    sprinting: c.isSprinting,
    breath: r(c.breath),
    action: c.action.kind,
    sky: c.mode === 'skydive' ? { ...c.sky } : null,
    focus: c.isPlayer ? controller.getFocusedInteractable()?.label(c) ?? null : null,
  };
}
