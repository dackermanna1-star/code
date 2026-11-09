// Level 2 — mines to hop, an explosive barrel pile, a seesaw, a rope bridge over a spike
// pit, and a boosted canyon jump.
export default {
  id: 'L02',
  name: 'Rolling Thunder',
  blurb: 'Farmer Dale reports "a few" landmines in the north field. He is bad at counting.',
  theme: 'meadow',
  difficulty: 1,
  seed: 2,
  build(B) {
    const c = B.course(-15, 0);
    c.flat(30); // .. 15
    B.start(-6);
    B.sign(5, 'LANDMINES:\nHOP OVER THEM');
    B.add('boost', { x: 11, w: 4, max: 13 });

    // three mine hops
    for (let i = 0; i < 3; i++) {
      c.ramp(5, 0.9);
      const lip = c.x;
      c.landing(9, 0.9);
      B.add('mine', { x: lip + 2.6, align: true });
      if (i === 2) B.tooth(lip + 4, 4.6);
      c.flat(5);
    }
    // x ~ 72
    c.flat(10);
    B.sign(c.x - 6, 'EXPLOSIVE.\nOBVIOUSLY.', { style: 'warning' });
    c.ramp(7, 1.5);
    const lip = c.x;
    c.landing(11, 1.5);
    for (let i = 0; i < 3; i++) B.add('barrel', { x: lip + 3 + i * 0.62, align: true });
    B.add('barrel', { x: lip + 3.31, y: B.groundY(lip + 3.31) + 0.86 });
    c.flat(14);

    // seesaw
    const sx = c.x + 6;
    B.sign(c.x + 1, 'SEESAW');
    B.add('seesaw', { x: sx, len: 7.5 });
    c.flat(16);
    B.add('crate', { x: c.x - 3 });
    c.flat(8);

    // rope bridge over a spike pit
    B.sign(c.x - 4, 'MIND THE GAP');
    const b0 = c.here();
    B.pit(c, 16, 5);
    B.add('bridge', { x: b0.x, y: b0.y, x2: c.x, y2: c.y, planks: 16, strength: 11000 });
    B.tooth(b0.x + 8, b0.y + 2.6);
    c.flat(12);
    B.checkpoint(c.x - 7);
    c.hill(14, 1.8).flat(6);

    // the big one
    B.sign(c.x - 2, 'BIG AIR!\nLEAN TO LAND');
    B.add('boost', { x: c.x + 4, w: 5 });
    c.flat(7);
    c.ramp(10, 2.4);
    const lip2 = c.here();
    B.tooth(lip2.x + 12, lip2.y + 3.4);
    c.gap(20, -3);
    c.landing(26, 4.5);
    c.flat(10);
    B.add('tire', { x: c.x - 4 });
    c.bumps(16, 2, 0.6);
    c.flat(26);
    B.finish(c.x - 12);
    c.flat(12).wall(6);
  },
};
