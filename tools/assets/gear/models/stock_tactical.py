# Collapsible tactical stock (CTR-style) on a buffer tube. Origin = receiver end plate on the buffer-tube axis
# (attach point); the stock extends to -Z. 'buttpad' empty = rear contact point.
from gkit import rot_s, rot_f

OUT = 'attachments'
TEX = 512
META = dict(kind='stock', type='tactical')


def build(g):
    # buffer tube + castle nut + end plate
    g.lathe('tube', [(0, 0), (0, 14.8), (-1, 15.6), (-176, 15.6), (-178, 14.4), (-178, 0)], 'anod', segs=40)
    g.lathe('nut', [(-2, 0), (-2, 17.6), (-10, 17.6), (-11, 16.4), (-11, 0)], 'park', segs=40)
    for i in range(3):
        g.box(f'notch{i}', -11.5, -6.0, 16.6, 19, 3.2, 'park!', M=rot_f(i * 120 + 30, 0, 0))
    g.side('plate', [(-1, -22, 2), (-0.5, 16, 2), (-12, 18, 2), (-13, -18, 2)], 30.0, 'park', bevel=1.2)
    g.lathe('sling_cup', [(14, 0), (14, 6.5), (20, 6.5), (20, 0)], 'park', f=-6, u=-16, axis='s', segs=20)
    # stock body (side outline), cheek weld top line, lock lever under the tube
    side = [(-92, 20, 6), (-206, 24, 10), (-210, -48, 6), (-198, -62, 8), (-176, -62, 10), (-138, -24, 16), (-104, -18, 8), (-92, -14, 6)]
    body = g.side('body', side, 46.0, 'poly', bevel=6.0, bres=3, taper=[(-92, 0.72), (-150, 0.95), (-210, 1.0)])
    cut = [g.side('lightening', [(-150, -30, 6), (-185, -30, 6), (-188, -50, 6), (-178, -54, 6)], 60.0, 'poly', bevel=0.0)]
    g.subtract(body, cut)
    g.side('lever', [(-110, -20, 2), (-170, -22, 3), (-170, -27, 3), (-112, -28, 3)], 18.0, 'poly', bevel=1.5)
    g.side('pad', [(-206, 24, 6), (-216, 22, 6), (-219, -60, 6), (-208, -64, 6)], 49.0, 'rubber', bevel=4.0, bres=2)
    for i in range(6):
        u = 14 - i * 13
        g.box(f'pad_rib{i}', -220, -217.5, u - 2, u + 2, 44.0, 'rubber!', r=1.0)
    g.lathe('qd_cup', [(-25, 0), (-25, 7.5), (-22, 7.5), (-22, 0)], 'park', f=-196, u=-46, axis='s', segs=20)
    g.empty('buttpad', -219, -18)
    g.empty('cheek', -160, 24)
    g.set_origin(0, 0)
