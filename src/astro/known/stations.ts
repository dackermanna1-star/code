/**
 * Crewed orbital stations of the Known Universe on their real orbits
 * (two-body Kepler about Earth's equator; J2 nodal precession and drag are
 * ignored). Like the real ones they fly in LVLH attitude: +X along track
 * (ram), +Y zenith, +Z = X × Y. Port positions follow the real layouts
 * approximately; the models are simplified.
 */
import { Body, type StationInfo } from '../body';
import { G } from '../../core/constants';

const DEG = Math.PI / 180;

export const ISS_INFO: StationInfo = {
  model: 'iss',
  span: 109,
  operator: 'NASA · Roscosmos · ESA · JAXA · CSA',
  crew: 7,
  launched: 1998,
  mass: 4.2e5,
  notes: 'Largest structure humans have put in orbit: a 109 m truss carrying eight solar array wings, with pressurised modules along the flight direction.',
  ports: [
    { name: 'IDA-2 · Harmony forward', pos: [12.4, 0, 0], dir: [1, 0, 0], up: [0, 1, 0] },
    { name: 'IDA-3 · Harmony zenith', pos: [6, 4.7, 0], dir: [0, 1, 0], up: [1, 0, 0] },
    { name: 'Rassvet nadir (MRM-1)', pos: [-18.5, -7.2, 0], dir: [0, -1, 0], up: [1, 0, 0] },
    { name: 'Zvezda aft', pos: [-38.8, 0, 0], dir: [-1, 0, 0], up: [0, 1, 0] },
  ],
};

export const TIANGONG_INFO: StationInfo = {
  model: 'tiangong',
  span: 56,
  operator: 'CMSA',
  crew: 3,
  launched: 2021,
  mass: 1.0e5,
  notes: 'T-shaped station: the Tianhe core with the Wentian and Mengtian laboratory modules on its node.',
  ports: [
    { name: 'Tianhe forward', pos: [14.6, 0, 0], dir: [1, 0, 0], up: [0, 1, 0] },
    { name: 'Tianhe nadir', pos: [11.8, -2.9, 0], dir: [0, -1, 0], up: [1, 0, 0] },
    { name: 'Tianhe aft', pos: [-9.9, 0, 0], dir: [-1, 0, 0], up: [0, 1, 0] },
  ],
};

/** Add the stations as children of Earth (before the StarSystem is assembled). */
export function addStations(earth: Body) {
  const prefix = earth.id.slice(0, earth.id.lastIndexOf('/'));
  const refQ = { x: earth.poleQ.x, y: earth.poleQ.y, z: earth.poleQ.z, w: earth.poleQ.w };
  const mk = (id: string, name: string, altKm: number, e: number, iDeg: number, nodeDeg: number, M0Deg: number, info: StationInfo) => {
    const a = earth.radius + altKm * 1e3;
    const b = new Body(`${prefix}/${id}`, name, 'station', earth, info.mass, info.span / 2,
      { a, e, i: iDeg * DEG, node: nodeDeg * DEG, peri: 0, M0: M0Deg * DEG, epoch: 0, mu: G * (earth.mass + info.mass), refQ },
      { period: 0, tilt: 0, tiltAzimuth: 0, phase0: 0, locked: false }, undefined, undefined, true);
    b.station = info;
    return b;
  };
  mk('iss', 'International Space Station', 417, 0.0004, 51.64, 120, 0, ISS_INFO);
  mk('tiangong', 'Tiangong', 385, 0.0006, 41.47, 250, 140, TIANGONG_INFO);
}
