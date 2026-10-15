# Vertical foregrip (polymer, 30 mm, 116 mm) with a cross-screw rail clamp. Origin = rail contact (top of clamp),
# grip hangs down (-Y). grip_support = palm centre.
from gkit import rot_s
from _optics import under_clamp, clamp_screw

OUT = 'attachments'
TEX = 512
META = dict(kind='grip', type='vertical', mount='bottom rail')


def build(g):
    under_clamp(g, -22, 22)
    clamp_screw(g, 0, 'xs')
    prof = [(-6, 0), (-6, 14.5), (-11, 16.6), (-20, 16.2), (-34, 15.3), (-46, 15.9), (-58, 15.3), (-70, 15.9), (-82, 15.3),
            (-94, 15.9), (-104, 16.4), (-110, 17.0), (-114, 16.6), (-116.5, 14.0), (-117.5, 8.0), (-117.8, 0)]
    g.lathe('grip', prof, 'poly', f=0, u=0, axis='u', segs=40, M=rot_s(-4, 0, 0))
    g.lathe('cap_ring', [(-109, 16.9), (-110.5, 17.4), (-112, 16.9)], 'poly!', f=0, u=0, axis='u', segs=40, M=rot_s(-4, 0, 0))
    g.empty('grip_support', -4, -60)
    g.set_origin(0, 0)
