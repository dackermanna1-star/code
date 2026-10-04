/**
 * The "Portal Gun" item: registration, 3D model + icon, and its first-person placement (kept
 * free of game-system imports so debug pages can show it).
 */
import * as THREE from 'three';
import { registerItem } from '../items/registry';
import { registerToolModel } from '../../render/items/toolModels';
import { registerPainter } from '../../render/items/paint/index';
import { registerHandPose } from '../../render/items/hand';
import { portalGunParts, portalGunIcon, GUN_TO_ITEM, GUN_ITEM_SCALE } from './portalGunModel';

registerItem('portal_gun', {
  category: 'tools',
  displayName: 'Portal Gun',
  maxStack: 1,
  rarity: 'epic',
  visual: { kind: 'model', id: 'portal_gun', color: 0xeef0ee, color2: 0x1a1b1e },
});
registerToolModel('portal_gun', () => portalGunParts());
registerPainter('portal_gun', portalGunIcon);

const ITEM_TO_GUN = new THREE.Matrix4().extractRotation(GUN_TO_ITEM).transpose();
const _m = new THREE.Matrix4();
/** On-screen length of the device in first person (camera-space metres). */
const FP_SIZE = 0.5;

/**
 * First-person placement (camera space): low on the right, pointing at the crosshair, with a
 * recoil kick (`recoil` ≈ 0..0.3) and a slow idle drift (`time` s).
 */
export function gunHandPose(m: THREE.Matrix4, equip: number, recoil = 0, time = 0) {
  const sway = Math.sin(time * 1.1) * 0.004, bob = Math.sin(time * 2.2) * 0.003;
  const s = FP_SIZE / GUN_ITEM_SCALE;
  m.multiply(_m.makeTranslation(0.29 + sway, -0.255 + bob - equip * 0.45, -0.44 + recoil * 0.05))
    .multiply(_m.makeRotationY(0.26 - recoil * 0.08))
    .multiply(_m.makeRotationX(0.07 + recoil * 0.5))
    .multiply(_m.makeRotationZ(recoil * 0.1))
    .multiply(ITEM_TO_GUN)
    .multiply(_m.makeScale(s, s, s));
}

registerHandPose('portal_gun', (ps, o) => gunHandPose(ps.m, o.equip));
