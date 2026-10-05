// The 2008 build HopperBins you got in your own place: Grab (drag a brick,
// R to rotate it, T to tilt it), Clone ("Copy") and Hammer ("Delete").
// HopperBins are not held in the hand; the mouse does the work.
import * as THREE from 'three';
import * as CANNON from '../vendor/cannon-es.js';
import { Tool } from './Tools.js';
import { TOOL_ICONS } from './icons.js';
import { sounds } from './Sound.js';

const isLocked = (part) => !part || part.locked || Math.max(part.size.x, part.size.y, part.size.z) > 150;

/** Copy the properties a place file would store. */
export function partProps(part) {
  return {
    name: part.name, shape: part.shape, size: part.size.toArray(), position: part.position.toArray(),
    quaternion: part.quaternion.clone(), color: part.color, anchored: part.anchored, transparency: part.transparency,
    reflectance: part.reflectance, surfaces: { ...part.surfaces }, tags: [...part.tags],
  };
}

class HopperBin extends Tool {
  constructor(game, name) { super(game, { name }); this.hopperBin = true; }
  rayFromMouse(ignore) {
    const g = this.game;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(g.camera.firstPerson ? new THREE.Vector2() : g.mouseNDC, g.world.camera);
    const from = ray.ray.origin.clone();
    return g.world.raycast(from, from.clone().addScaledVector(ray.ray.direction, 1000), { ignore });
  }
}

export class GrabTool extends HopperBin {
  constructor(game) {
    super(game, 'Grab');
    this.cursor = 'arrow';
    this._move = () => this.drag();
    this._up = () => this.drop();
    this._key = (e) => this.key(e);
  }
  get icon() { return TOOL_ICONS.Grab(); }
  onEquipped(ch) {
    if (!ch.isLocal) return;
    window.addEventListener('mousemove', this._move);
    window.addEventListener('mouseup', this._up);
    window.addEventListener('keydown', this._key);
  }
  onUnequipped() {
    this.drop();
    window.removeEventListener('mousemove', this._move);
    window.removeEventListener('mouseup', this._up);
    window.removeEventListener('keydown', this._key);
  }
  onActivated(ch, target, hit) {
    const part = hit?.part;
    if (isLocked(part)) return;
    this.part = part;
    this.wasAnchored = part.anchored;
    // hold it still while dragging
    if (part.body) { part.body.velocity.set(0, 0, 0); part.body.angularVelocity.set(0, 0, 0); part.body.type = CANNON.Body.STATIC; }
    sounds.play('click', null, 0.5);
  }
  drag() {
    const part = this.part;
    if (!part) return;
    const hit = this.rayFromMouse(new Set([part.body]));
    if (!hit) return;
    // sit the brick on whatever the mouse is over, snapped to the stud grid
    const box = new THREE.Box3().setFromObject(part.mesh);
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const p = hit.point.clone();
    const n = hit.normal;
    p.x += n.x * half.x; p.y += n.y * half.y; p.z += n.z * half.z;
    p.x = Math.round(p.x); p.z = Math.round(p.z);
    p.y = Math.round(p.y * 10) / 10;
    part.setPosition(p.x, p.y, p.z);
  }
  key(e) {
    if (!this.part || this.game.gui?.chatFocused) return;
    const k = e.key.toLowerCase();
    const q = new THREE.Quaternion();
    if (k === 'r') q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    else if (k === 't') q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    else return;
    this.part.setQuaternion(q.multiply(this.part.quaternion));
    this.drag();
  }
  drop() {
    const part = this.part;
    if (!part) return;
    this.part = null;
    if (part.body && !this.wasAnchored) { part.body.type = CANNON.Body.DYNAMIC; part.body.wakeUp(); }
    sounds.play('click', null, 0.4);
  }
}

export class CloneTool extends HopperBin {
  constructor(game) { super(game, 'Clone'); this.cursor = 'arrow'; }
  get icon() { return TOOL_ICONS.Clone(); }
  onActivated(ch, target, hit) {
    const part = hit?.part;
    if (isLocked(part)) return;
    const props = partProps(part);
    props.position[1] += part.size.y;
    const copy = this.world.add(props);
    for (const d of part.decals || []) copy.addDecal(d.face, d.texture);
    copy.decals = part.decals;
    sounds.play('click', null, 0.6);
    return copy;
  }
}

export class HammerTool extends HopperBin {
  constructor(game) { super(game, 'Delete'); this.cursor = 'arrow'; }
  get icon() { return TOOL_ICONS.Hammer(); }
  onActivated(ch, target, hit) {
    const part = hit?.part;
    if (isLocked(part)) return;
    sounds.play('clank', part.position, 0.7);
    this.world.remove(part);
  }
}

export const BUILD_TOOLS = { Grab: GrabTool, Clone: CloneTool, Delete: HammerTool };
