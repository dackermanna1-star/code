# Descending airdrop: the supply crate under a round cargo parachute (7.5 m, 20 red/white gores, apex vent,
# scalloped skirt) with 20 suspension lines to the crate's lifting ring.
# Nodes: 'crate' (mesh), 'canopy' (mesh, double-sided), 'lines' (mesh); empties 'chute_attach', 'smoke'.
import math
from mathutils import Vector
from gkit import grid_surface, sweep, MM
from _airdrop import crate, SK, H
import gkit

OUT = 'items'
TEX = 1024
MS = 8.0
DOUBLE_SIDED = True
META = dict(kind='airdrop', variant='parachute', canopy_diameter_m=7.5)
gkit.KINDS['ply_od'] = dict(gkit.KINDS['plywood'], base='#4c5136', var='#454a30', rough=0.75, wear='#9a8a62', wear_amt=0.9, wear_rough=0.7)
gkit.KINDS['webbing_yel'] = dict(gkit.KINDS['webbing_od'], base='#c8901a', var='#b88418', wear='#d8a848')
gkit.KINDS['nylon_red'] = dict(gkit.KINDS['nylon_white'], base='#a8201a', var='#981c16')

NG = 20
RC = 3750.0          # canopy radius (mm)
HC = 2400.0          # canopy height (apex above skirt)
SKIRT = SK + H + 4600.0   # skirt height above ground


def build(g):
    crate(g)
    # canopy gores: inflated dome, each gore bulging between radial seams, scalloped skirt
    for k in range(NG):
        a0 = 2 * math.pi * k / NG; a1 = 2 * math.pi * (k + 1) / NG
        def fn(a, b, a0=a0, a1=a1):
            ang = a0 + (a1 - a0) * a
            t = 0.06 + 0.94 * b                       # 0 = apex vent, 1 = skirt
            bulge = 1.0 + 0.06 * math.sin(math.pi * a)
            r = RC * math.sin(t * math.pi / 2 * 0.98) * bulge
            y = SKIRT + HC * math.cos(t * math.pi / 2) * (1.0 + 0.04 * math.sin(math.pi * a))
            if b > 0.97:
                y += 120 * math.sin(math.pi * a) * (b - 0.97) / 0.03
            return (r * math.cos(ang) * MM, y * MM, r * math.sin(ang) * MM)
        g.mesh(f'gore{k}', grid_surface(fn, 6, 22), 'nylon_red' if k % 2 == 0 else 'nylon_white', 'canopy')
    # suspension lines from every seam at the skirt to the lifting ring
    conf = Vector((0.0, (SK + H + 140) * MM, 0.0))
    for k in range(NG):
        ang = 2 * math.pi * k / NG
        r = RC * math.sin(0.98 * math.pi / 2)
        p = Vector((r * math.cos(ang) * MM, (SKIRT + HC * math.cos(0.98 * math.pi / 2)) * MM, r * math.sin(ang) * MM))
        prof = [(math.cos(2 * math.pi * j / 5) * 0.004, math.sin(2 * math.pi * j / 5) * 0.004) for j in range(5)]
        g.mesh(f'line{k}', sweep([p, conf], prof), '=line', 'lines')
    g.empty('canopy_center', 0, SKIRT + HC * 0.5)
    g.set_origin(0, 0)
