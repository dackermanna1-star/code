/**
 * Serialisable locations for bookmarks, the discovery catalogue and autosave.
 * A location names the star system (by its deterministic id) and the frame
 * body, so it can be restored exactly even though systems are generated on
 * demand and discarded when the camera leaves them.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { UPos } from '../core/upos';
import type { FrameKind } from './frame';
import type { World } from './world';
import type { Cosmos } from './cosmos';
import type { StarField } from '../render/starfield';

export interface SavedLocation {
  systemId: string | null;
  kind: FrameKind;
  bodyId: string | null;
  local: [number, number, number];
  upos: ReturnType<UPos['toJSON']>;
  orient: [number, number, number, number];
  time: number;
}

export function captureLocation(world: World, cosmos: Cosmos): SavedLocation {
  const v = world.view;
  return {
    systemId: cosmos.activeRef?.id ?? null,
    kind: v.body ? v.kind : 'universe',
    bodyId: v.body?.id ?? null,
    local: [v.local.x, v.local.y, v.local.z],
    upos: v.toUPos(new UPos()).toJSON(),
    orient: [v.orient.x, v.orient.y, v.orient.z, v.orient.w],
    time: world.time,
  };
}

/**
 * Move the view to a saved location. The system is (re)built from its id
 * first so that body-relative frames resolve. Returns false if the location
 * refers to something that no longer exists (e.g. a different universe seed).
 */
export function restoreLocation(world: World, cosmos: Cosmos, field: StarField, loc: SavedLocation, restoreTime = false): boolean {
  if (restoreTime) world.time = loc.time;
  const view = world.view;
  const target = UPos.fromJSON(loc.upos);
  view.rebase('universe', null);
  view.upos.copy(target);
  // settle the galaxy / star-field state for the new position
  cosmos.update(world, target, field, 0);
  if (loc.systemId) {
    const ref = cosmos.refById(loc.systemId);
    if (!ref) return false;
    cosmos.activate(world, ref);
    const sys = world.system;
    if (!sys) return false;
    sys.update(world.time);
    const body = loc.bodyId ? sys.byId.get(loc.bodyId) : undefined;
    if (body && loc.kind !== 'universe') {
      view.kind = loc.kind;
      view.body = body;
      view.local.set(...loc.local);
      view.orient.set(...loc.orient);
      return true;
    }
  } else if (cosmos.activeRef) {
    cosmos.activate(world, null);
  }
  view.rebase('universe', null);
  view.upos.copy(target);
  view.orient.set(...loc.orient);
  return true;
}

/** Camera orientation looking along `dir` with `up` as the vertical reference. */
export function lookRotation(dir: Vector3, up: Vector3, out = new Quaternion()): Quaternion {
  const u = Math.abs(dir.clone().normalize().dot(up)) > 0.999 ? new Vector3(1, 0, 0) : up;
  return out.setFromRotationMatrix(new Matrix4().lookAt(new Vector3(), dir, u));
}
