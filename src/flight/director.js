// STUB — replaced by the flight director. Keeps the aircraft parked at the gate.
import { createFlightState, PHASES } from './state.js';
import { AIRCRAFT } from '../core/constants.js';
import { DEPARTURE, gateById } from '../world/layout.js';
export async function init(app) {
  const state = createFlightState();
  const g = gateById(DEPARTURE, DEPARTURE.ownGate);
  state.position.set(g.x, AIRCRAFT.groundHeight, g.z);
  state.altitude = AIRCRAFT.groundHeight; state.altitudeAGL = AIRCRAFT.groundHeight;
  app.addUpdate((dt) => { if (!app.paused) { state.simTime += dt; state.phaseTime += dt; } }, 10, 'flight');
  return { stub: true, state, phases: PHASES, skipTo() {}, restart() {}, beginDeparture() {}, beginDescent() {}, timeline: () => [] };
}
