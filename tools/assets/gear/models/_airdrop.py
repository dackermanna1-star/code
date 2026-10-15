"""airdrop crate (CDS-style plywood crate on a skid with cargo straps); used by airdrop_crate and airdrop_crate_chute.
Origin = bottom centre of the skid on the ground; front = +Z."""
import math
from gkit import rot_f, rot_s, rot_u, torus_mesh, T

W = 1200.0       # crate width (s) and depth (f)
H = 980.0        # crate height above the skid
SK = 120.0       # skid height


def crate(g, group='crate'):
    side = g.decal_kind('ply_od', 'stencil', g.work + '/labels/airdrop_side.png', weather=0.5)
    # skid: plywood deck + three runners
    g.box('deck', -W / 2 - 30, W / 2 + 30, SK - 22, SK, W + 60, 'plywood', group=group, r=6, bevel=2.0)
    for s in (-W / 2 + 60, 0.0, W / 2 - 60):
        g.box(f'runner{s}', -W / 2 - 30, W / 2 + 30, 0, SK - 22, 100, 'plywood', group=group, s=s, r=4, bevel=2.0)
    # crate body (painted plywood), stencils on front/back
    body = g.box('body', -W / 2, W / 2, SK, SK + H, W, side, group=group, r=8, bevel=3.0)
    g.decal_uv(body, 'su', (-330, SK + 535, 330, SK + 865), facing=(1, 0, 0), min_dot=0.6)
    g.decal_uv(body, 'su-', (-330, SK + 535, 330, SK + 865), facing=(-1, 0, 0), min_dot=0.6)
    # battens: horizontal + vertical framing boards on every side
    for k, (a, kind) in enumerate(((0, 'ply_od'), (90, 'ply_od'), (180, 'ply_od'), (270, 'ply_od'))):
        M = rot_u(a, 0, 0)
        for u in (SK + 60, SK + H - 60):
            g.box(f'bh{k}{u}', W / 2, W / 2 + 22, u - 45, u + 45, W - 40, kind, group=group, r=4, bevel=2.0, M=M)
        for s in (-W / 2 + 70, W / 2 - 70):
            g.box(f'bv{k}{s}', W / 2, W / 2 + 22, SK + 105, SK + H - 105, 90, kind, group=group, s=s, r=4, bevel=2.0, M=M)
        g.box(f'bm{k}', W / 2, W / 2 + 16, SK + H / 2 - 40, SK + H / 2 + 40, W - 200, kind, group=group, r=4, bevel=2.0, M=M)
        # steel corner angles
        g.side(f'corner{k}', [(W / 2 - 4, SK + 4), (W / 2 + 28, SK + 4), (W / 2 + 28, SK + H - 4), (W / 2 - 4, SK + H - 4)], 8.0, 'paint_green!',
               group=group, s=W / 2 + 24, bevel=1.5, M=M)
        g.side(f'cornerb{k}', [(W / 2 - 44, SK + 4), (W / 2 + 28, SK + 4), (W / 2 + 28, SK + H - 4), (W / 2 - 44, SK + H - 4)], 8.0, 'paint_green!',
               group=group, s=W / 2 + 27, bevel=1.5, M=M @ rot_u(0, 0, 0))
    # top arrow stencil
    arrow = g.decal_kind('ply_od', 'arrow', g.work + '/labels/airdrop_arrow.png', weather=0.5)
    top = g.box('top', -W / 2 + 120, W / 2 - 120, SK + H, SK + H + 18, W - 240, arrow, group=group, r=4, bevel=2.0)
    g.decal_uv(top, 'fs', (-250, -250, 250, 250), facing=(0, 1, 0), min_dot=0.6)
    # cargo straps: two each way over the top, down the sides, under the deck edge
    for k, s in enumerate((-300.0, 300.0)):
        for j, a in enumerate((0, 90)):
            M = rot_u(a, 0, 0)
            g.side(f'strap{k}{j}', [(W / 2 + 24, SK - 18, 1), (W / 2 + 40, SK - 18, 1), (W / 2 + 40, SK + H + 30, 12), (-W / 2 - 40, SK + H + 30, 12),
                                   (-W / 2 - 40, SK - 18, 1), (-W / 2 - 24, SK - 18, 1), (-W / 2 - 24, SK + H + 22, 6), (W / 2 + 24, SK + H + 22, 6)],
                   48.0, 'webbing_yel', group=group, s=s, bevel=0.8, M=M)
            g.box(f'buckle{k}{j}', W / 2 + 36, W / 2 + 50, SK + 300, SK + 380, 62, 'zinc', group=group, s=s, r=4, M=M)
    # lifting rings at the top centre (parachute clevis attaches here)
    g.mesh('ring', torus_mesh(55.0, 7.0, seg=32, ring=8), 'zinc', group, M=T(0, SK + H + 92, 0))
    g.box('clevis', -30, 30, SK + H + 30, SK + H + 45, 60, 'zinc', group=group, r=4)
    g.empty('chute_attach', 0, SK + H + 140)
    g.empty('smoke', W / 2 + 60, SK + 40, -W / 2 - 60)
