// Port of p_sight.c: REJECT lookup plus BSP line-of-sight traversal.

function divlineSide(x, y, node) {
  if (!node.dx) {
    if (x === node.x) return 2;
    if (x <= node.x) return node.dy > 0 ? 1 : 0;
    return node.dy < 0 ? 1 : 0;
  }
  if (!node.dy) {
    if (y === node.y) return 2;
    if (y <= node.y) return node.dx < 0 ? 1 : 0;
    return node.dx > 0 ? 1 : 0;
  }
  const left = node.dy * (x - node.x);
  const right = (y - node.y) * node.dx;
  if (right < left) return 0;
  if (left === right) return 2;
  return 1;
}

function interceptVector2(v2, v1) {
  const den = v1.dy * v2.dx - v1.dx * v2.dy;
  if (den === 0) return 0;
  const num = (v1.x - v2.x) * v1.dy + (v2.y - v1.y) * v1.dx;
  return num / den;
}

const st = {
  strace: { x: 0, y: 0, dx: 0, dy: 0 },
  t2x: 0, t2y: 0, zstart: 0, topslope: 0, bottomslope: 0,
};

function crossSubsector(w, num) {
  const level = w.level;
  const sub = level.subsectors[num];
  if (!sub) return true;
  const divl = { x: 0, y: 0, dx: 0, dy: 0 };
  for (let i = 0; i < sub.numsegs; i++) {
    const seg = level.segs[sub.firstseg + i];
    const line = seg.linedef;
    if (!line || line.validcount === w.validcount) continue;
    line.validcount = w.validcount;
    const v1 = line.v1, v2 = line.v2;
    let s1 = divlineSide(v1.x, v1.y, st.strace);
    let s2 = divlineSide(v2.x, v2.y, st.strace);
    if (s1 === s2) continue;
    divl.x = v1.x; divl.y = v1.y; divl.dx = v2.x - v1.x; divl.dy = v2.y - v1.y;
    s1 = divlineSide(st.strace.x, st.strace.y, divl);
    s2 = divlineSide(st.t2x, st.t2y, divl);
    if (s1 === s2) continue;
    if (!line.backsector) return false;
    const front = seg.frontsector, back = seg.backsector || line.backsector;
    if (!front || !back) return false;
    if (front.floorheight === back.floorheight && front.ceilingheight === back.ceilingheight) continue;
    const opentop = Math.min(front.ceilingheight, back.ceilingheight);
    const openbottom = Math.max(front.floorheight, back.floorheight);
    if (openbottom >= opentop) return false;
    const frac = interceptVector2(st.strace, divl);
    if (frac <= 0) continue;
    if (front.floorheight !== back.floorheight) {
      const slope = (openbottom - st.zstart) / frac;
      if (slope > st.bottomslope) st.bottomslope = slope;
    }
    if (front.ceilingheight !== back.ceilingheight) {
      const slope = (opentop - st.zstart) / frac;
      if (slope < st.topslope) st.topslope = slope;
    }
    if (st.topslope <= st.bottomslope) return false;
  }
  return true;
}

function crossBSPNode(w, bspnum) {
  if (bspnum & 0x8000) {
    if (bspnum === 0xffff) return crossSubsector(w, 0);
    return crossSubsector(w, bspnum & 0x7fff);
  }
  const bsp = w.level.nodes[bspnum];
  let side = divlineSide(st.strace.x, st.strace.y, bsp);
  if (side === 2) side = 0;
  if (!crossBSPNode(w, bsp.children[side])) return false;
  if (side === divlineSide(st.t2x, st.t2y, bsp)) return true;
  return crossBSPNode(w, bsp.children[side ^ 1]);
}

export function checkSight(w, t1, t2) {
  const level = w.level;
  const s1 = t1.subsector.sector.index;
  const s2 = t2.subsector.sector.index;
  const pnum = s1 * level.sectors.length + s2;
  if (level.reject[pnum >> 3] & (1 << (pnum & 7))) return false;
  return sightTrace(w, t1.x, t1.y, t1.z + t1.height - t1.height / 4, t2.x, t2.y, t2.z, t2.z + t2.height);
}

// Line of sight between a point and a vertical span, ignoring REJECT.
export function sightTrace(w, x1, y1, z1, x2, y2, zbot, ztop) {
  if (!w.level.nodes.length) return true;
  w.validcount++;
  st.zstart = z1;
  st.topslope = ztop - z1;
  st.bottomslope = zbot - z1;
  st.strace.x = x1;
  st.strace.y = y1;
  st.strace.dx = x2 - x1;
  st.strace.dy = y2 - y1;
  st.t2x = x2;
  st.t2y = y2;
  if (st.strace.dx === 0 && st.strace.dy === 0) return true;
  return crossBSPNode(w, w.level.nodes.length - 1);
}
