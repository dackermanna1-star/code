// STUB — replaced by the trip director + vehicle dynamics. Drives the route at a
// constant 15 m/s once the app starts (so other modules can be tested in motion).
// Debug: ?progress=0..1 places the bus at that fraction of the route (?paused=1 = parked).
import * as THREE from 'three';
import { createTripState, PHASES } from './state.js';
import { COACH } from '../core/constants.js';
export async function init(app) {
  const state = createTripState();
  const R = app.route;
  if (Number.isFinite(app.debug.progress)) state.s = app.debug.progress * R.length;
  const up = new THREE.Vector3(0, 1, 0), e = new THREE.Euler();
  const place = () => {
    const c = R.sample(state.s);
    const p = R.pointAt(state.s, 1.75);
    state.position.set(p.x, p.y - COACH.roadY, p.z);
    state.heading = c.heading;
    e.set(Math.atan(c.grade), -c.heading * Math.PI / 180, 0, 'YXZ');
    state.quaternion.setFromEuler(e);
    state.altitude = state.position.y;
    state.segment = c.seg;
    state.routeProgress = state.s / R.length;
    state.missionProgress = state.routeProgress;
  };
  place();
  app.addUpdate((dt) => {
    if (app.paused || !app.started || app.debug.paused) { state.speed = 0; return; }
    state.speed = 15;
    state.s = Math.min(R.length, state.s + state.speed * dt * app.timeScale);
    state.groundSpeed = state.speed;
    state.simTime += dt;
    place();
    const h = state.heading * Math.PI / 180;
    state.velocity.set(Math.sin(h) * state.speed, 0, -Math.cos(h) * state.speed);
  }, 10, 'trip');
  return { stub: true, state, phases: PHASES, skipTo() {}, restart() {}, timeline: () => [] };
}
