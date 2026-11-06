// In-page helpers for controlled zombie AI tests: find a flat open area and build test structures.
// Loaded by dev/qa-zombies-ai.cjs via page.addScriptTag-like eval.
window.qaArena = (() => {
  const g = window.game, w = g.world;
  const SOLID = window.__SOLID;
  const B = window.__B;
  function flat(x0, z0, n) {
    const h = w.roofY(x0, z0);
    for (let x = x0; x < x0 + n; x++) for (let z = z0; z < z0 + n; z++) {
      if (w.roofY(x, z) !== h) return -1;
      if (!SOLID[w.get(x, h, z)]) return -1;
    }
    return h;
  }
  function find(n = 40, cx = 512, cz = 512) {
    for (let r = 0; r < 450; r += 8) for (let a = 0; a < 6.28; a += 0.25) {
      const x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r);
      if (x < 20 || z < 20 || x > 1000 - n || z > 1000 - n) continue;
      const h = flat(x, z, n);
      if (h > 0 && !(g.vehicles?.colliders || []).some((c) => c.x > x - 8 && c.x < x + n + 8 && c.z > z - 8 && c.z < z + n + 8)) return { x, z, y: h + 1 };
    }
    return null;
  }
  let A = null;
  const api = {
    get A() { return A; },
    setup(n = 40) { A = find(n); return A; },
    set(x, y, z, name, meta = 0) { w.setBlock(A.x + x, A.y + y, A.z + z, B[name], meta); },
    box(x0, y0, z0, x1, y1, z1, name) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) api.set(x, y, z, name); },
    clear(x0, y0, z0, x1, y1, z1) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) w.setBlock(A.x + x, A.y + y, A.z + z, 0, 0); },
    // hollow room with walls, floor stays ground, flat roof. door: {side:'z0'|'z1'|'x0'|'x1', at, kind}
    room(x0, z0, x1, z1, h = 3, o = {}) {
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        for (let y = 0; y < h; y++) api.set(x, y, z, edge ? (o.wall || 'wall_white') : 'air');
        if (o.roof !== false) api.set(x, h, z, o.roofBlock || 'planks_oak');
      }
    },
    door(x, z, facing, kind = 'door_wood', o = {}) {
      const X = A.x + x, Y = A.y, Z = A.z + z;
      w.setBlock(X, Y, Z, 0); w.setBlock(X, Y + 1, Z, 0);
      w.placeDoor(X, Y, Z, facing, kind, o);
      const d = w.getDoor(X, Y, Z); w.syncDoor(d);
      return d;
    },
    tp(x, y, z, yaw = 0) { window.qa.tp(A.x + x, A.y + y, A.z + z, yaw, 0); },
    z(x, y, z, variant = 'walker', o = {}) { const zb = g.zombies.spawn(A.x + x, A.y + y, A.z + z, { variant, ...o }); if (o.yaw !== undefined) zb.yaw = o.yaw; if (o.state) zb.setState(o.state); return zb; },
    rel(zb) { return { x: +(zb.x - A.x).toFixed(2), y: +(zb.y - A.y).toFixed(2), z: +(zb.z - A.z).toFixed(2) }; },
    wipe(n = 40, h = 8) { api.clear(0, 0, 0, n - 1, h, n - 1); },
  };
  return api;
})();
