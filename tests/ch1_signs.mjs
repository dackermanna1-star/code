// Chapter 1 diagnostics: for every sign/graffiti quad (captured at build time) report the
// distance to the nearest solid surface in front of / behind it (floating or z-fighting check).
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level, out = [];
    L.root.traverse((m) => {
      // sign quads: canvas-textured quads (PlaneGeometry + back child, or one 8-vertex double-sided quad)
      if (!m.isMesh || !(m.material?.map?.image instanceof HTMLCanvasElement)) return;
      const pc = m.geometry.attributes.position.count;
      if (!(pc === 4 || pc === 8) || m.parent?.isMesh) return;
      const p = m.position, ry = m.rotation.y;
      const nx = Math.sin(ry), nz = Math.cos(ry);
      // (raycast returns a shared hit object: copy t before the next cast)
      const fh = L.col.raycast(p.x, p.y, p.z, nx, 0, nz, 3, 1), f = fh ? { t: fh.t } : null;
      const bh = L.col.raycast(p.x, p.y, p.z, -nx, 0, -nz, 3, 1), b = bh ? { t: bh.t } : null;
      // glow light of this sign (placed 0.5 m off the quad): which side, and is that side open?
      let lside = '';
      for (const l of L.lights) {
        const dx = l.x - p.x, dz = l.z - p.z;
        if (Math.abs(l.y - p.y) < 0.01 && Math.abs(Math.hypot(dx, dz) - 0.5) < 0.01) {
          const side = dx * nx + dz * nz > 0 ? 'front' : 'back';
          const open = side === 'front' ? (f ? f.t : 3) : (b ? b.t : 3);
          lside = ` LIGHT ${side} (open ${open.toFixed(2)} m${open < 0.4 ? ' WRONG SIDE' : ''})`;
        }
      }
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox, w = +(bb.max.x - bb.min.x).toFixed(2), h = +(bb.max.y - bb.min.y).toFixed(2);
      // also probe the four corners behind the quad for the nearest wall
      const txt = m.material.map?.userData?.text || m.material.map?.name || '';
      const d = Math.min(f ? f.t : 9, b ? b.t : 9);
      out.push(`${d < 0.015 ? 'COPLANAR ' : d > 0.2 && d < 9 ? 'GAP ' : d === 9 ? 'FREE ' : ''}(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) ry${ry.toFixed(2)} ${w}x${h} front ${f ? f.t.toFixed(3) : '-'} back ${b ? b.t.toFixed(3) : '-'}${lside} ${txt}`);
    });
    return out;
  });
  console.log(r.join('\n'));
};
