# Adrenaline syringe: 20 ml clear barrel with yellow liquid, black stopper, plunger and finger flange, printed label,
# orange needle cap. Lies on the ground along +Z (needle forward). Origin = bottom centre on the ground.
OUT = 'items'
TEX = 512
META = dict(kind='boost', type='adrenaline', notes="'glass' (alpha) and 'liquid' nodes are separate plain materials")


def build(g):
    R = 10.0
    u = R + 2.0
    g.lathe('barrel', [(-55, 9.0), (-55, R), (52, R), (56, 8.0), (60, 4.0), (60, 2.5)], '=glass_clear', group='glass', u=u, segs=32,
            cap0=False, cap1=False)
    g.lathe('liquid', [(-30, 0), (-30, 9.1), (51, 9.1), (55, 7.2), (59, 3.0), (59, 0)], '=liquid_yel', group='liquid', u=u, segs=28)
    g.lathe('stopper', [(-42, 0), (-42, 9.0), (-38, 9.2), (-34, 9.0), (-30, 9.2), (-30, 0)], 'rubber', u=u, segs=28)
    g.lathe('rod', [(-118, 0), (-118, 13.5), (-114, 13.5), (-113, 4.0), (-42, 4.0), (-42, 0)], 'plastic_wht', u=u, segs=24)
    g.box('rodfin0', -112, -42, u - 0.8, u + 0.8, 14.0, 'plastic_wht')
    g.box('rodfin1', -112, -42, u - 7, u + 7, 1.6, 'plastic_wht')
    g.front('flange', [(-24, -6, 6), (24, -6, 6), (24, 6, 6), (-24, 6, 6)], -59, -55, 'plastic_wht', u=u, bevel=0.8)
    lbl = g.decal_kind('card_print', 'syr', g.work + '/labels/syringe.png', rough=0.55)
    lab = g.lathe('label', [(-20, R + 0.25), (40, R + 0.25)], lbl, u=u, segs=32, cap0=False, cap1=False, a0=-110, a1=110)
    g.decal_uv(lab, ('cylf', u, 0), (-20, -110, 40, 110))
    g.lathe('hub', [(60, 0), (60, 4.5), (70, 3.5), (70, 0)], 'plastic_wht', u=u, segs=20)
    g.lathe('cap', [(68, 0), (68, 4.6), (104, 3.4), (106, 2.0), (106, 0)], 'plastic_org', u=u, segs=20)
    g.set_origin(0, 0)
