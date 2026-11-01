import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorldData } from '../../src/world/worldData.js';

const world = new WorldData();
const inmate = { isStaff: false };
const guard = { isStaff: true };
for (const d of world.doors) {
  d.scheduledOpen = d.style === 'cell' && !d.cell.startsWith('H');
  d.authorize = (a) => !!(a && a.isStaff);
}

test('rooms, walls, doors and spots compile', () => {
  assert.ok(world.rooms.length > 40, 'rooms incl. cells');
  assert.ok(world.walls.length > 50, 'wall runs');
  assert.equal(world.doors.filter((d) => d.style === 'cell').length, 27);
  assert.ok(world.spots.length > 150, `spots: ${world.spots.length}`);
});

test('every spot approach point is walkable', () => {
  const bad = world.spots.filter((s) => !world.nav.walkableAt(s.ax, s.az, guard));
  assert.deepEqual(bad.map((s) => `${s.type}:${s.activity}@${s.ax.toFixed(1)},${s.az.toFixed(1)}`), []);
});

const P = {
  cellA01: [3.5, 12.5], cellB12: [72.5, 29.5], hall: [38, 30], mess: [21, 41.5], rec: [53, 40], library: [70, 40],
  laundry: [23, 60], showers: [6, 59], gym: [52, 57], yard: [40, 85], infirmary: [16, 7],
};
test('inmate can reach public areas from a cell', () => {
  for (const [name, [x, z]] of Object.entries(P)) {
    const path = world.nav.findPath(P.cellA01[0], P.cellA01[1], x, z, inmate);
    if (name === 'yard') continue; // gate is closed unless scheduled
    assert.ok(path, `path to ${name}`);
  }
});
test('yard gate blocks inmates when closed but not staff', () => {
  assert.equal(world.nav.findPath(38, 60, 40, 85, inmate), null);
  assert.ok(world.nav.findPath(38, 60, 40, 85, guard));
  world.doorById.get('d_yardgate').scheduledOpen = true;
  assert.ok(world.nav.findPath(38, 60, 40, 85, inmate));
});
test('staff areas are off-limits to inmates', () => {
  assert.equal(world.nav.findPath(38, 30, 54, 5, inmate), null, 'guard room');
  assert.ok(world.nav.findPath(38, 30, 54, 5, guard));
  assert.ok(world.nav.findPath(38, 30, 70, 7, guard), 'solitary corridor for staff');
});
test('locked cell door keeps an inmate in', () => {
  const d = world.doorById.get('d_cell_A01');
  d.scheduledOpen = false; d.locked = true;
  assert.equal(world.nav.findPath(3.5, 12.5, 38, 30, inmate), null);
  d.locked = false; d.scheduledOpen = true;
});
test('room lookup', () => {
  assert.equal(world.roomAt(3.5, 12.5).id, 'A01');
  assert.equal(world.roomAt(38, 30).id, 'hall');
  assert.equal(world.roomAt(40, 85).id, 'yard');
  assert.equal(world.roomAt(37.5, 105).id, 'noman');
});
test('fence cutting opens a route out', () => {
  world.doorById.get('d_yardgate').scheduledOpen = true;
  assert.equal(world.nav.findPath(37.5, 100, 37.5, 114, inmate), null);
  world.cutFence('f_inner'); world.cutFence('f_outer');
  assert.ok(world.nav.findPath(37.5, 100, 37.5, 114, inmate));
});
