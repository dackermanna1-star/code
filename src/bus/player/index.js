// STUB — replaced by the bus player module. Minimal mouse-look + WASD + debug poses.
import * as THREE from 'three';
import { SEAT } from '../core/constants.js';
export async function init(app) {
  const cam = app.camera;
  let yaw = 0, pitch = 0, seat = null;
  const pos = new THREE.Vector3(0, 0, -4.2);
  const d = app.debug;
  if (d.pos) pos.set(d.pos[0], 0, d.pos[2]);
  if (d.look) { yaw = d.look[0] * Math.PI / 180; pitch = d.look[1] * Math.PI / 180; }
  app.events.on('app:ready', () => { if (d.seat && app.seats?.byId) seat = app.seats.byId(d.seat) || null; });
  app.addUpdate((dt) => {
    if (app.input.mode === 'play') {
      const md = app.input.consumeMouseDelta();
      yaw -= md.dx * 0.0022; pitch = Math.max(-1.4, Math.min(1.4, pitch - md.dy * 0.0022));
      if (!seat) {
        const f = app.input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']), s = app.input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
        pos.add(new THREE.Vector3(s, 0, -f).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(1.3 * dt));
        app.colliders.resolve(pos, 0.2);
      }
    }
    if (seat) cam.position.copy(seat.eye); else cam.position.set(pos.x, d.pos ? d.pos[1] : SEAT.standingEyeHeight, pos.z);
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    app.interactions.update(cam);
  }, 50, 'player');
  return { stub: true, sit(id) { seat = app.seats.byId(id) || null; }, stand() { seat = null; }, get seat() { return seat?.id || null; } };
}
