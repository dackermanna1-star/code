// Chapter 1 diagnostics: for every sign/graffiti quad (captured at build time) report the
// distance to the nearest solid surface in front of / behind it (floating or z-fighting check).
export default async ({ page, evalg, wait }) => {
  await page.goto((process.env.TEST_URL || 'http://localhost:5180/') + '?autostart=0');
  for (let i = 0; i < 90; i++) { await wait(1000); if ((await evalg(() => window.session?.state)) === 'playing') break; }
  const r = await evalg(() => {
    const g = window.game, L = g.level, out = [];
    // sign quads: meshes with a PlaneGeometry and a child mesh (the back face)
    L.root.traverse((m) => {
      if (!m.isMesh || m.geometry?.type !== 'PlaneGeometry' || m.children.length !== 1) return;
      const p = m.position, ry = m.rotation.y;
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const f = L.col.raycast(p.x, p.y, p.z, nx, 0, nz, 3, 1), b = L.col.raycast(p.x, p.y, p.z, -nx, 0, -nz, 3, 1);
      const w = m.geometry.parameters.width, h = m.geometry.parameters.height;
      // also probe the four corners behind the quad for the nearest wall
      const txt = m.material.map?.userData?.text || m.material.map?.name || '';
      const d = Math.min(f ? f.t : 9, b ? b.t : 9);
      out.push(`${d < 0.015 ? 'COPLANAR ' : d > 0.2 && d < 9 ? 'GAP ' : d === 9 ? 'FREE ' : ''}(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) ry${ry.toFixed(2)} ${w}x${h} front ${f ? f.t.toFixed(3) : '-'} back ${b ? b.t.toFixed(3) : '-'} ${txt}`);
    });
    return out;
  });
  console.log(r.join('\n'));
};
