// Level 9 — automated factory floor: conveyor belts under crushers, saws on tracks,
// electrified gates, a collapsing gantry over a saw pit, mines on the line, and turrets.
export default {
  id: 'L09',
  name: 'Assembly Line',
  blurb: 'Fully automated since 1998. Health & safety was the first thing automated away.',
  theme: 'industrial',
  difficulty: 4,
  seed: 9,
  build(B) {
    const c = B.course(-15, 0);
    c.flat(32); // .. 17
    B.start(-6);
    B.sign(3, 'ASSEMBLY LINE 9\nNO STOPPING ON THE BELT');

    // conveyor belt under a crusher row
    B.rect(22, 8.6, 52, 9.3, 'metal');
    B.add('boost', { x: 37, w: 26, power: 12, max: 9, h: 1.2 });
    [27, 33, 39, 45].forEach((x, i) =>
      B.add('crusher', { x, y: 5.6, w: 2.4, h: 1.2, travel: 4.7, rod: 2.6, waitUp: 1.2, waitDown: 0.4, offset: i * 0.55 })
    );
    c.flat(40); // .. 57
    B.clear(20, 55);
    B.tooth(36, 10.4);

    // saws riding a track along the floor
    B.sign(59, 'SAWS ON RAILS', { style: 'warning' });
    c.flat(6);
    const s0 = c.x;
    B.add('saw', { x: s0 + 2, y: 0.8, r: 0.8, path: [[s0 + 20, 0.8]], speed: 5.5, wait: 0.1 });
    c.ramp(4, 0.9).landing(6, 0.9);
    c.flat(6);
    c.ramp(4, 0.9).landing(6, 0.9);
    B.add('saw', { x: s0 + 24, y: 4.5, r: 0.85, path: [[s0 + 24, 0.85]], speed: 7, wait: 0.5 });
    c.flat(8);

    // electric gates & glass
    B.add('zapper', { x: c.x + 2, h: 3.2, period: 2.2, onFor: 1.0 });
    B.add('glass', { x: c.x + 6 });
    B.add('zapper', { x: c.x + 10, h: 3.2, period: 2.2, onFor: 1.0, offset: 1.1 });
    c.flat(14);
    B.checkpoint(c.x - 2);
    c.flat(6);

    // collapsing gantry over a saw pit
    B.sign(c.x - 4, "DON'T STOP.\nDON'T LOOK DOWN.", { style: 'warning' });
    const g0 = c.here();
    B.pit(c, 18, 5, { spikes: false });
    for (let i = 0; i < 6; i++) B.add('collapse', { x: g0.x + 1.55 + i * 3, y: g0.y - 0.2, w: 3, delay: 0.32 });
    for (let i = 0; i < 4; i++) B.add('saw', { x: g0.x + 2.5 + i * 4.3, y: g0.y - 5 + 0.2, r: 1.0, mount: false });
    B.add('harpoon', { x: g0.x + 30, facing: -1, range: 28, cooldown: 2.4, delay: 0.8 });
    B.tooth(g0.x + 9, g0.y + 2.4);
    c.flat(10);

    // mines on the belt
    B.add('boost', { x: c.x + 10, w: 18, power: 10, max: 8, h: 1.2 });
    c.flat(4);
    for (let i = 0; i < 3; i++) {
      c.ramp(3.5, 0.7);
      const lip = c.x;
      c.landing(5, 0.7);
      B.add('mine', { x: lip + 1.8, align: true });
    }
    c.flat(8);
    B.add('barrel', { x: c.x - 3 });
    B.add('barrel', { x: c.x - 2.38 });
    c.flat(6);
    B.checkpoint(c.x - 2);

    // final press & leap
    c.flat(4);
    B.rect(c.x + 1, 7.2, c.x + 9, 7.8, 'metal');
    B.add('crusher', { x: c.x + 5, y: 4.5, w: 3.2, h: 1.4, travel: 3.6, rod: 1.8, waitUp: 1.0, waitDown: 0.3 });
    c.flat(12);
    B.add('boost', { x: c.x + 3, w: 5 });
    c.flat(6);
    c.ramp(7, 1.8);
    const lip = c.here();
    B.pit(c, 12, 4, { spikes: true, rise: 2.8 });
    B.tooth(lip.x + 6, lip.y + 3.4);
    B.add('harpoon', { x: c.x + 22, facing: -1, range: 24, cooldown: 2.0 });
    c.flat(30);
    B.finish(c.x - 12);
    c.flat(10).wall(7);
  },
};
