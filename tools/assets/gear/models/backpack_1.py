# Level-1 backpack: ~20 l urban daypack (grey cordura), rounded top, zipped main compartment and front pocket,
# grab handle, padded harness with sternum strap. Origin = upper-back attach point, root-space (0, 1.40, -0.185).
from _pack import Pack, OY, OZ

OUT = 'gear'
TEX = 1024
MS = 2.5
DECIMATE = 0.6
DECIMATE_MIN = 400
META = dict(kind='backpack', level=1, attach_bone='Spine2', attach_offset_m=[0.0, 0.079, -0.165], origin_root_space_m=[0.0, OY, OZ],
            capacity_l=20, notes='pack front face at z = -0.185 so it clears the thickest vest (vest_3)')


def build(g):
    pk = Pack(g, 'cordura_gry', 'webbing_blk')
    W, H, D = 0.29, 0.43, 0.15
    yb = 1.03
    body = pk.box('main', W, H, D, 0.0, yb + H / 2, OZ, puff=0.018, seed=1, taper_top=0.18)
    pk.box('backpad', W * 0.86, H * 0.82, 0.034, 0.0, yb + H / 2, OZ + 0.024, kind='cordura_blk', puff=0.006, seed=2)
    fz = OZ - D
    pocket = pk.box('pocket', W * 0.78, 0.2, 0.05, 0.0, yb + 0.12, fz + 0.012, kind='cordura_gry', puff=0.01, seed=3)
    pk.box('bottom', W * 0.98, 0.05, D * 0.98, 0.0, yb + 0.02, OZ, kind='cordura_blk', puff=0.004, seed=4, subd=1)
    # zips: main compartment arc over the top and down the sides; pocket arc
    zz = fz - 0.02
    arc = [(-0.135, yb + 0.12, zz), (-0.14, yb + 0.3, zz), (-0.105, yb + 0.41, zz), (0.0, yb + 0.445, zz), (0.105, yb + 0.41, zz),
           (0.14, yb + 0.3, zz), (0.135, yb + 0.12, zz)]
    pk.zip_loop('zip_main', body, arc, closed=False)
    pa = [(-0.1, yb + 0.04, fz - 0.05), (-0.1, yb + 0.17, fz - 0.05), (0.0, yb + 0.21, fz - 0.05), (0.1, yb + 0.17, fz - 0.05), (0.1, yb + 0.04, fz - 0.05)]
    pk.zip_loop('zip_pocket', pocket, pa, closed=False)
    pk.grab_handle(yb + H - 0.005, OZ - 0.035)
    pk.harness(yb + H - 0.03, yb, W / 2)
    g.set_origin(0, 0)
