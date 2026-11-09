// Level 7 — mountain downhill: ski jumps, a boulder avalanche, ice walls, icicle pits,
// snow-fort cannons and a final ski jump into the finish.
export default {
  id: 'L07',
  name: 'Avalanche Express',
  blurb: 'Downhill all the way. Your vehicle has no business on a ski slope. Neither do you.',
  theme: 'alpine',
  difficulty: 3,
  seed: 7,
  build(B) {
    const c = B.course(-15, 40);
    c.flat(25); // .. 10
    B.start(-6);
    B.sign(2, 'AVALANCHE EXPRESS\nNEXT STOP: BOTTOM');
    c.ease(36, -9); // .. 46, y 31
    B.add('boost', { x: 40, w: 6, max: 18 });

    // ski jump 1
    c.ramp(8, 1.4);
    const l1 = c.here();
    B.tooth(l1.x + 7, l1.y + 3);
    c.gap(10, -5);
    c.landing(22, 5); // y ~21
    c.flat(6);

    // avalanche: boulders released above and behind you
    B.sign(c.x - 3, 'AVALANCHE ZONE', { style: 'warning' });
    const a0 = c.x;
    c.ease(46, -10); // y ~11
    B.add('drop', { kind: 'rock', x: a0 + 6, y: 29, trigger: a0 + 2, push: [6, 0], ropeTop: 34 });
    B.add('drop', { kind: 'rock', x: a0 + 12, y: 30, trigger: a0 + 8, push: [8, 0], ropeTop: 34 });
    B.add('drop', { kind: 'rock', x: a0 + 22, y: 28, trigger: a0 + 18, push: [6, 0], ropeTop: 34 });
    B.add('glass', { x: a0 + 34, y: B.groundY(a0 + 34), h: 2.8 });
    c.flat(10);
    B.checkpoint(c.x - 6);

    // icicle pits
    c.ramp(6, 1.2);
    B.pit(c, 7, 3, { rise: 1.2 });
    c.flat(4);
    c.ramp(6, 1.4);
    B.pit(c, 9, 3, { rise: 1.4 });
    c.flat(6);
    c.ease(30, -6); // y ~5

    // snow fort with cannons firing uphill
    const f0 = c.x;
    c.flat(30);
    B.add('cannon', { x: f0 + 24, angle: Math.PI - 0.32, speed: 16, interval: 2.2, delay: 0.3, range: 40 });
    B.add('cannon', { x: f0 + 27, angle: Math.PI - 0.12, speed: 19, interval: 2.9, delay: 1.4, range: 40 });
    B.add('crate', { x: f0 + 9 });
    B.add('crate', { x: f0 + 9.85 });
    B.add('crate', { x: f0 + 9.42, y: B.groundY(f0 + 9.42) + 0.8 });
    B.add('glass', { x: f0 + 16, h: 2.6 });
    B.tooth(f0 + 9.4, B.groundY(f0) + 3.4);
    c.flat(6);
    B.checkpoint(c.x - 3);

    // final run & ski jump
    c.ease(30, -8); // y ~ -3
    B.add('boost', { x: c.x + 4, y: c.y, w: 6 });
    c.flat(8);
    c.ramp(10, 2.6);
    const lip = c.here();
    B.tooth(lip.x + 13, lip.y + 4.2);
    c.gap(22, -5);
    c.landing(30, 5);
    c.flat(30);
    B.finish(c.x - 16);
    B.deco('snowman', c.x - 8);
    c.flat(10).wall(7);
  },
};
