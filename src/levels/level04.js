// Level 4 — desert canyon: cannonballs rolling down a long climb, a minefield under
// falling rocks, a flimsy rope bridge, boulders rolling downhill, and a cliff-top finale.
export default {
  id: 'L04',
  name: "Dead Man's Gulch",
  blurb: 'The sign says "POP. 0". The sign is about to be accurate.',
  theme: 'canyon',
  difficulty: 2,
  seed: 4,
  build(B) {
    const c = B.course(-15, 4);
    c.flat(30); // .. 15
    B.start(-6);
    B.sign(3, "DEAD MAN'S GULCH\nPOP. 0");
    B.deco('skull', 9);
    c.landing(16, 4); // .. 31, y 0
    c.flat(10); // .. 41

    // A: cannonballs rolling down the climb
    B.sign(36, 'INCOMING!', { style: 'warning' });
    c.ease(36, 8); // .. 77, y 8
    c.flat(46); // .. 123
    B.add('cannon', { x: 116, angle: Math.PI + 0.1, speed: 15, interval: 2.3, delay: 0.4, range: 60 });
    B.add('crate', { x: 92, y: 8 });
    B.add('crate', { x: 92.9, y: 8 });
    B.tooth(100, 12.5);
    c.landing(20, 8); // .. 143, y 0
    c.flat(8); // .. 151

    // B: minefield with falling rocks
    B.sign(147, 'MINEFIELD', { style: 'warning' });
    for (let i = 0; i < 4; i++) {
      c.ramp(4.5, 0.85);
      const lip = c.x;
      c.landing(8, 0.85);
      B.add('mine', { x: lip + 2.4, align: true });
      if (i % 2 === 1) B.add('mine', { x: lip + 6.5, align: true });
      c.flat(3);
    }
    B.add('drop', { kind: 'rock', x: 166, y: 14, trigger: 156, ropeTop: 22 });
    B.add('drop', { kind: 'rock', x: 182, y: 15, trigger: 171, ropeTop: 22 });
    c.flat(10);
    B.checkpoint(c.x - 5);

    // C: flimsy rope bridge over a deep canyon
    c.flat(6);
    const k0 = c.here();
    B.sign(k0.x - 4, 'WEIGHT LIMIT:\nONE GOAT');
    B.pit(c, 22, 10);
    B.add('bridge', { x: k0.x, y: k0.y, x2: c.x, y2: c.y, planks: 22, strength: 8500 });
    B.tooth(k0.x + 11, k0.y + 3.2);
    c.flat(8);
    B.checkpoint(c.x - 4);

    // D: boulders rolling down the climb
    const slope0 = c.x;
    B.sign(slope0 - 3, 'ROCKFALL', { style: 'warning' });
    c.ease(30, 9);
    const top = c.here();
    c.flat(30);
    B.add('drop', { kind: 'rock', x: top.x + 1.5, y: top.y + 1.0, trigger: slope0 + 2, push: [-3, 0], ropeTop: top.y + 1.0 });
    B.add('drop', { kind: 'rock', x: top.x + 4, y: top.y + 1.0, trigger: slope0 + 10, push: [-4, 0], ropeTop: top.y + 1.0 });
    B.add('cannon', { x: top.x + 26, angle: Math.PI - 0.05, speed: 17, interval: 2.6, delay: 0.2, range: 40 });
    B.add('barrel', { x: top.x + 12 });
    B.add('barrel', { x: top.x + 12.62 });

    // E: cliff jump to the finish
    B.add('boost', { x: c.x - 4, y: top.y, w: 6 });
    c.ramp(6, 1.2);
    const lip = c.here();
    B.tooth(lip.x + 10, lip.y + 3.4);
    c.gap(16, -6);
    c.landing(24, 6);
    c.flat(30);
    B.finish(c.x - 14);
    c.flat(10).wall(8);
  },
};
