// Level 5 — night-time factory yard: harpoon turrets on catwalks, an electrified tunnel,
// glass walls to crash through, and a shuttle platform over a pit while under fire.
export default {
  id: 'L05',
  name: 'Harpoon Alley',
  blurb: 'Decommissioned whaling plant. The turrets did not get the memo.',
  theme: 'industrial',
  difficulty: 3,
  seed: 5,
  build(B) {
    const c = B.course(-15, 0);
    c.flat(35); // .. 20
    B.start(-6);
    B.sign(5, 'HARPOON TURRETS\nKEEP MOVING', { style: 'warning' });

    // turret on a catwalk, crates for cover
    B.add('crate', { x: 28 });
    B.add('crate', { x: 28.85 });
    B.add('crate', { x: 28.42, y: 0.8 });
    B.rect(40, 5.6, 53, 6.2, 'metal');
    B.add('harpoon', { x: 47, y: 6.2, facing: -1, range: 24, cooldown: 2.2, delay: 0.6 });
    c.flat(30); // .. 50
    c.hill(10, 1.4); // .. 60
    B.tooth(46.5, 7.4);
    c.flat(10); // .. 70

    // electrified tunnel
    B.sign(66, 'HIGH VOLTAGE\nTIME IT', { style: 'warning' });
    B.rect(72, 3.6, 102, 7.5, 'metal');
    [78, 86, 94].forEach((x, i) => B.add('zapper', { x, h: 3.6, period: 2.6, onFor: 1.1, offset: i * 0.85 }));
    c.flat(36); // .. 106
    B.clear(70, 104);
    B.checkpoint(109);
    c.flat(10); // .. 116

    // boost through glass, two turrets
    B.add('boost', { x: 121, w: 6 });
    B.add('glass', { x: 131 });
    B.add('glass', { x: 137 });
    B.add('harpoon', { x: 147, facing: -1, range: 26, cooldown: 2.0, delay: 0.2 });
    B.rect(150, 6.4, 160, 7.0, 'metal');
    B.add('harpoon', { x: 155, y: 7.0, facing: -1, range: 26, cooldown: 2.6, delay: 1.2 });
    c.flat(42); // .. 158
    c.ramp(8, 2.0);
    B.pit(c, 9, 3, { rise: 1.0 });
    B.tooth(c.x - 4.5, 4.2);
    c.flat(12);

    // shuttle platform under fire
    B.sign(c.x - 6, 'ALL ABOARD', {});
    const p0 = c.x;
    B.pit(c, 18, 7);
    B.add('platform', { x: p0 + 2.15, y: -0.175, w: 4, h: 0.35, path: [[p0 + 15.95, -0.175]], speed: 2.6, wait: 1.0 });
    B.add('harpoon', { x: p0 + 26, facing: -1, range: 30, cooldown: 2.8, delay: 1.5 });
    B.tooth(p0 + 9, 1.8);
    c.flat(10);
    B.add('crate', { x: c.x - 4 });
    c.flat(8);
    B.checkpoint(c.x - 4);

    // final dash: zappers in the open + a turret behind you
    c.flat(6);
    B.add('zapper', { x: c.x + 3, h: 2.4, period: 2.0, onFor: 0.9 });
    c.ramp(5, 1.0).landing(7, 1.0);
    B.add('harpoon', { x: c.x + 18, facing: -1, range: 24, cooldown: 2.0, delay: 0 });
    B.add('barrel', { x: c.x + 6 });
    c.flat(34);
    B.finish(c.x - 10);
    c.flat(10).wall(7);
  },
};
