# Level-2 military ballistic helmet: PASGT-style shell with a woodland camouflage cloth cover, cover rim fold,
# elastic band with cat-eye strips, and a chin strap. Origin = head centre (Head bone + (0, 0.100, 0)).
import math
from mathutils import Vector, noise
from gkit import sweep, MM, catmull, apply_mods
from _wear import Shell, solidify, orient_out, strap_on_shell, head_r, chin_strap

OUT = 'gear'
TEX = 1024
MS = 2.0
DECIMATE = 0.55
META = dict(kind='helmet', level=2, attach_bone='Head', attach_offset_m=[0.0, 0.1, 0.008],
            notes='origin = head centre (rest pose root-space (0, 1.687, 0.008)); +Z = face forward')


def rim(th):
    return -24.0 + 22.0 * math.cos(math.radians(th)) + 14.0 * math.cos(math.radians(2 * th))


def flare(th, e):
    # PASGT skirt flares out near the rim at the sides/back, brim at the front
    r = rim(th)
    t = max(0.0, 1.0 - (e - r) / 26.0)
    side = 0.5 + 0.5 * (1 - math.cos(math.radians(th))) * 0.5
    return 0.10 * t * t * (0.55 + 0.45 * side)


def build(g):
    sh = Shell(cf=6, cu=6, af=134, as_=120, au=146, al=118, k=0.10, flare=flare, rim=rim)
    print('CLEARANCE', sh.clearance(12.0))
    # covered shell: wrinkled cloth on top of the steel/kevlar shell
    me = orient_out(sh.surface(nu=96, nv=30))
    for v in me.vertices:
        q = v.co * 38.0
        n = noise.noise(q) * 0.0012 + noise.noise(q * 2.7) * 0.0005
        d = v.co - Vector((sh.cf * MM, sh.cu * MM, 0))
        v.co += d.normalized() * n
    g.mesh('shell', solidify(me, 10.0), 'camo_wood', 'body')
    # cover fold around the rim
    path = sh.rim_path(160, off=-4.0, de=0.0)
    prof = [(math.cos(2 * math.pi * k / 10) * 3.4 * MM, math.sin(2 * math.pi * k / 10) * 6.0 * MM) for k in range(10)]
    g.mesh('fold', sweep(path + [path[0]], prof, closed_path=False, cap=False), 'camo_wood', 'body')
    # elastic band (olive) with two cat-eye reflective strips at the back
    band = strap_on_shell(sh, 0, 360, lambda th: 12.0 + 4.0 * math.cos(math.radians(th)), 9.0, 1.2, 2.2, n=120)
    g.mesh('band', band, 'webbing_od', 'body')
    for th in (160, 200):
        g.mesh(f'cateye{th}', strap_on_shell(sh, th - 6, th + 6, lambda t: 12.0 + 4.0 * math.cos(math.radians(t)), 3.0, 3.6, 0.6, n=6),
               'paint_yel', 'body')
    # chin strap with buckles at the shell
    a_l, a_r = chin_strap(g, sh, 'webbing_od')
    for i, a in enumerate((a_l, a_r)):
        g.box(f'buckle{i}', a[0] - 9, a[0] + 9, a[1] - 3, a[1] + 14, 3.0, 'zinc', s=a[2] * 0.97, r=1.5)
    g.set_origin(0, 0)
