// =============================================================================
// STOP BAYS — where exactly the coach stops at each stop (pure, importable by
// any module: stations, traffic, player...). The coach ORIGIN (deck centreline
// at mid-length) stands at route distance `s` with lateral offset `lat`
// (+ = right of travel, route.js convention), heading along the route.
// The front door is on the right at bus-local z = -5.78 (centre), the mid door
// at z = +0.89; doors open onto the kerb on the right.
//
// Intermediate stops are lay-bys to the right of the carriageway: the coach
// leaves the lane `taperIn` m before the stop, stands at `lat`, and rejoins
// the lane `taperOut` m after it. The stations module should pave the lay-by
// at road height between s - taperIn and s + taperOut.
//
// If the stations module exposes its own bay (app.stations.bayPose(id) ->
// {s, lat} or {x, z}), the trip director uses that instead (resolved at
// app:ready), so the two always agree.
// =============================================================================

export const BAY_DEFS = {
  'cedar-bay': { name: 'Bay 4', at: 'start', ds: 0, lat: 1.75, kneel: true, midDoor: true, taperOut: 40 },
  ridgefield: { name: 'Ridgefield shelter', ds: 0, lat: 4.85, kneel: true, midDoor: false, taperIn: 60, taperOut: 50 },
  'hollow-pass': { name: 'Coach bay', ds: 0, lat: 5.6, kneel: true, midDoor: true, taperIn: 85, taperOut: 70, engineOff: true },
  'port-solano': { name: 'Bay 11', at: 'end', ds: 0, lat: 1.75, kneel: true, midDoor: true, taperIn: 30 },
};

/** Front-door centre in bus-local coordinates (x right, z forward negative). */
export const FRONT_DOOR_LOCAL = { x: 1.275, y: -0.42, z: -5.78 };
export const MID_DOOR_LOCAL = { x: 1.275, y: -1.32, z: 0.89 };

/**
 * Pose of the coach at a stop: { id, s, lat, x, y (road surface), z, heading (deg), door: {x, z} (world, front door) }.
 * `route` = getRoute() (or app.route).
 */
export function bayPose(route, stopId, out = {}) {
  const stop = route.stops.find((st) => st.id === stopId);
  const def = BAY_DEFS[stopId] || { ds: 0, lat: 1.75 };
  if (!stop) return null;
  let s = stop.s + (def.ds || 0);
  if (def.at === 'start') s = 0;
  if (def.at === 'end') s = route.length;
  const p = route.pointAt(s, def.lat, {});
  const h = p.heading * Math.PI / 180;
  // forward = (sin h, -cos h), right = (cos h, sin h)
  const fx = Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = Math.sin(h);
  out.id = stopId; out.s = s; out.lat = def.lat;
  out.x = p.x; out.y = p.y; out.z = p.z; out.heading = p.heading;
  out.door = { x: p.x + rx * FRONT_DOOR_LOCAL.x - fx * FRONT_DOOR_LOCAL.z, z: p.z + rz * FRONT_DOOR_LOCAL.x - fz * FRONT_DOOR_LOCAL.z };
  out.def = def;
  return out;
}
