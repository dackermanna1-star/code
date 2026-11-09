// Level 3 — construction site: a row of crushers, falling I-beams, a goods lift up to the
// rooftops, a wrecking ball, collapsing scaffold boards and a moving platform over a pit.
export default {
  id: 'L03',
  name: 'Hard Hat Area',
  blurb: 'Hard hats mandatory. You do not have one. Proceed anyway.',
  theme: 'construction',
  difficulty: 2,
  seed: 3,
  build(B) {
    const c = B.course(-15, 0);
    c.flat(32); // .. 17
    B.start(-6);
    B.sign(4, 'HARD HAT AREA\nNO HARD HAT? NO PROBLEM');
    B.deco('cone', 9);
    B.deco('cone', 10.2);

    // crusher row under a girder
    B.sign(14, 'CRUSHERS:\nWATCH THE RHYTHM', { style: 'warning' });
    c.flat(28); // 17 .. 45
    B.rect(19, 9.2, 41, 9.9, 'metal');
    [22.5, 29.5, 36.5].forEach((x, i) => B.add('crusher', { x, y: 5.7, w: 2.6, h: 1.3, travel: 4.7, offset: 0.4 + i * 0.9, rod: 3, waitUp: 1.5 }));
    B.tooth(29.5, 10.6);
    B.clear(17, 45);

    // falling beams
    B.sign(47, 'FALLING OBJECTS', { style: 'warning' });
    c.flat(22); // 45 .. 67
    B.add('drop', { kind: 'beam', x: 55, y: 11, trigger: 47.5, angle: 0.12, ropeTop: 18 });
    B.add('drop', { kind: 'beam', x: 61, y: 12, trigger: 51, angle: -0.18, ropeTop: 18 });
    B.add('drop', { kind: 'safe', x: 65, y: 13, trigger: 57, ropeTop: 18 });
    B.tooth(58, 3.2);

    // goods lift up to the roof
    c.flat(3); // .. 70
    const shaft = c.x;
    c.drop(0.4).flat(3.8).wall(0.4); // .. 73.9
    B.sign(shaft - 3, 'LIFT ↑\nWAIT FOR IT');
    B.add('platform', { x: shaft + 1.95, y: -0.175, w: 3.6, h: 0.35, path: [[shaft + 1.95, 5 - 0.175]], speed: 2.3, wait: 1.4 });
    const b1 = c.x;
    // building 1
    B.rect(b1, 0, b1 + 17, 5, 'concrete');
    B.add('wrecking', { x: b1 + 10, y: 12.5, len: 6, amp: 1.05, period: 3.4 });
    B.tooth(b1 + 10, 7.4);
    // scaffold boards over the gap
    B.add('collapse', { x: b1 + 18.5, y: 4.8, w: 3, delay: 0.5 });
    B.add('collapse', { x: b1 + 21.5, y: 4.8, w: 3, delay: 0.5 });
    B.add('spikes', { x: b1 + 20, y: 0, w: 5.8 });
    // building 2 with a ramp down the far side
    const b2 = b1 + 23;
    B.block([[b2, 0], [b2 + 36, 0], [b2 + 16, 5], [b2, 5]], 'concrete');
    B.add('glass', { x: b2 + 5, y: 5 });
    B.add('glass', { x: b2 + 10, y: 5 });
    B.add('crate', { x: b2 + 13, y: 5 });

    const after = b2 + 36; // ~133
    c.flat(after - c.x); // ground continues under the buildings
    B.clear(shaft - 1, after);
    c.flat(8);
    B.checkpoint(after + 4);

    // trench hop
    c.flat(4);
    c.ramp(6, 1.3);
    B.pit(c, 6, 2.6, { rise: 1.3 });
    c.flat(10);

    // moving platform over a deep pit
    B.sign(c.x - 6, 'ALL ABOARD');
    const p0 = c.x;
    B.pit(c, 14, 6);
    B.add('platform', { x: p0 + 2.15, y: -0.175, w: 4, h: 0.35, path: [[p0 + 11.95, -0.175]], speed: 2.2, wait: 1.2 });
    c.flat(16);
    B.add('barrel', { x: c.x - 6 });
    c.flat(22);
    B.finish(c.x - 12);
    c.flat(12).wall(6);
  },
};
