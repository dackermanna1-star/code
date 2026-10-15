# Level-2 backpack: ~35 l military assault pack (olive cordura): MOLLE front, admin pocket, side compression straps,
# grab handle, padded harness with sternum strap. Origin = upper-back attach point, root-space (0, 1.40, -0.185).
from _pack import Pack, OY, OZ

OUT = 'gear'
TEX = 1024
MS = 2.5
DECIMATE = 0.6
DECIMATE_MIN = 400
META = dict(kind='backpack', level=2, attach_bone='Spine2', attach_offset_m=[0.0, 0.079, -0.165], origin_root_space_m=[0.0, OY, OZ],
            capacity_l=35)


def build(g):
    pk = Pack(g, 'cordura_od', 'webbing_od')
    W, H, D = 0.31, 0.50, 0.2
    yb = 1.0
    body = pk.box('main', W, H, D, 0.0, yb + H / 2, OZ, puff=0.016, seed=11, taper_top=0.08)
    pk.box('backpad', W * 0.86, H * 0.84, 0.036, 0.0, yb + H / 2, OZ + 0.026, kind='cordura_blk', puff=0.006, seed=12)
    fz = OZ - D
    pocket = pk.box('admin', W * 0.72, 0.22, 0.045, 0.0, yb + 0.33, fz + 0.01, puff=0.008, seed=13)
    pk.box('lid', W * 0.98, 0.07, D * 0.9, 0.0, yb + H - 0.02, OZ - 0.01, puff=0.006, seed=14, subd=1)
    # MOLLE rows on the lower front (lying on the fabric: strips snapped to the body)
    b = pk.b
    for k, y in enumerate((yb + 0.05, yb + 0.088, yb + 0.126, yb + 0.164)):
        for i in range(6):
            x0 = -0.114 + i * 0.038
            pts = [(x0 + 0.002, y, fz - 0.05), (x0 + 0.036, y, fz - 0.05)]
            from gkit import catmull
            from _pack import snap_path
            L = [pk.L(*p) for p in pts]
            P, N = snap_path(body, [L[0].lerp(L[1], t / 4) for t in range(5)], 0.0015)
            pk.webbing(f'molle{k}_{i}', P, 0.025, 0.0018, ups=[n for n in N])
    # zips
    zz = fz - 0.03
    arc = [(-0.15, yb + 0.1, zz), (-0.155, yb + 0.35, zz), (-0.12, yb + 0.47, zz), (0.0, yb + 0.5, zz), (0.12, yb + 0.47, zz),
           (0.155, yb + 0.35, zz), (0.15, yb + 0.1, zz)]
    pk.zip_loop('zip_main', body, arc, closed=False)
    pa = [(-0.1, yb + 0.25, fz - 0.06), (-0.1, yb + 0.43, fz - 0.06), (0.1, yb + 0.43, fz - 0.06), (0.1, yb + 0.25, fz - 0.06)]
    pk.zip_loop('zip_admin', pocket, pa, closed=False)
    # side compression straps with buckles
    for side in (1, -1):
        for k, y in enumerate((yb + 0.16, yb + 0.36)):
            x = side * (W / 2 + 0.03)
            pts = [(side * 0.12, y, OZ - 0.03), (x, y, OZ - D * 0.35), (x, y, OZ - D * 0.7), (side * 0.12, y, fz - 0.02)]
            from gkit import catmull
            from _pack import snap_path
            L = [pk.L(*p) for p in catmull(pts, n=5)]
            P, N = snap_path(body, L, 0.003)
            pk.webbing(f'comp{side}{k}', P, 0.02, 0.0025, ups=N)
            m = len(P) // 2
            pk.buckle_at(f'cbuckle{side}{k}', P[m] + N[m] * 0.004, N[m], w=0.028, h=0.022)
    pk.grab_handle(yb + H + 0.012, OZ - 0.045)
    pk.harness(yb + H - 0.04, yb, W / 2, width=0.065, thick=0.016)
    g.set_origin(0, 0)
