"""Geometry of the animals, in real proportions (16 px = 1 m, scaled down a little for the giants).

Generic animals use part names the Java animator understands: body, neck (holding the head) or
head, ear_l/ear_r, jaw, trunk1-3, tusks, horns and mane (both can be switched per variant),
wing_l/wing_r, tail/tail2/tail3, quadruped legs leg_fl/leg_fr/leg_hl/leg_hr or biped legs
leg_l/leg_r. Models for vanilla-derived animals keep the vanilla part names instead, so the
vanilla model classes and animations drive them.

Left is +x, the head points towards -z and the ground is at y = 24.
"""
from mobs.geom import Model


def legs(m, top, fx, fz, hx, hz, w, paw=None, hind_top=None, hind_w=None, d=None):
    """Four legs hanging from pivots at their tops, reaching the ground."""
    for name, x, z, t, lw in (('leg_fl', fx, fz, top, w), ('leg_fr', -fx, fz, top, w),
                              ('leg_hl', hx, hz, hind_top if hind_top is not None else top, hind_w or w),
                              ('leg_hr', -hx, hz, hind_top if hind_top is not None else top, hind_w or w)):
        leg = m.part(name, (x, t, z))
        n = int(round(24 - t))
        ld = d or lw
        leg.box(-lw / 2, 0, -ld / 2, lw, n, ld, tag='leg')
        if paw:
            pw, ph = paw
            leg.box(-pw / 2, n - ph, -ld / 2 - 1, pw, ph, ld + 1, tag='paw')


def ears(head, x, y, z, w, h, d, out=0.0, back=0.0):
    head.child('ear_l', (x, y, z), (back, 0, -out)).box(0, -h, -d / 2, w, h, d, tag='ear')
    head.child('ear_r', (-x, y, z), (back, 0, out)).box(-w, -h, -d / 2, w, h, d, tag='ear')


# ============================================================================ African savanna

def elephant():
    m = Model('elephant')
    body = m.part('body', (0, -6, 0))
    body.box(-12, -14, -20, 24, 24, 40)
    body.box(-10, -17, -19, 20, 3, 15, tag='withers')
    body.box(-10, -16, 6, 20, 2, 13, tag='rump')
    legs(m, 0, 7, -13, 7, 13, 9)
    head = m.part('head', (0, -15, -19))
    head.box(-8, -6, -12, 16, 17, 12)
    head.box(-7, -9, -11, 14, 3, 10, tag='dome')
    head.child('ear_l', (8, -4, -6), (0, 0.35, 0)).box(0, -6, 0, 1, 21, 16, tag='ear')
    head.child('ear_r', (-8, -4, -6), (0, -0.35, 0)).box(-1, -6, 0, 1, 21, 16, tag='ear')
    t1 = head.child('trunk1', (0, 9, -10), (0.05, 0, 0))
    t1.box(-3.5, 0, -3.5, 7, 10, 7, tag='trunk')
    t2 = t1.child('trunk2', (0, 10, 0), (-0.08, 0, 0))
    t2.box(-3, 0, -3, 6, 10, 6, tag='trunk')
    t3 = t2.child('trunk3', (0, 10, 0), (-0.3, 0, 0))
    t3.box(-2.5, 0, -2.5, 5, 8, 5, tag='trunk')
    tusks = head.child('tusks', (0, 8, -9), (0.9, 0, 0))
    tusks.box(-6.5, -1, -7, 2, 2, 7, tag='tusk')
    tusks.box(4.5, -1, -7, 2, 2, 7, tag='tusk')
    tips = tusks.child('tusk_tips', (0, 0, -6), (-1.25, 0, 0))
    tips.box(-6.5, -1, -7, 2, 2, 7, tag='tusk')
    tips.box(4.5, -1, -7, 2, 2, 7, tag='tusk')
    tail = m.part('tail', (0, -16, 20), (0.15, 0, 0))
    tail.box(-1, 0, -1, 2, 15, 2)
    tail.box(-1.5, 14, -1.5, 3, 4, 3, tag='tuft')
    m.eyes = ('head', (7.6, -1.5, -8.5), 1.4)
    return m


def giraffe():
    m = Model('giraffe')
    body = m.part('body', (0, -17, 0), (-0.12, 0, 0))
    body.box(-6.5, -7, -14, 13, 15, 28)
    legs(m, -12, 4, -10, 4, 10, 4, hind_top=-9)
    neck = m.part('neck', (0, -23, -11), (0.6, 0, 0))
    neck.box(-3.5, -16, -4.5, 7, 18, 9)
    neck.box(-2.5, -32, -3.5, 5, 17, 7)
    neck.box(-0.5, -31, 3.5, 1, 30, 2, tag='mane')
    head = neck.child('head', (0, -32, 0), (-0.2, 0, 0))
    head.box(-3, -4, -5, 6, 6, 7)
    head.box(-2, -2, -11, 4, 5, 6, tag='muzzle')
    head.box(-2.5, -7, -1, 1, 3, 1, tag='ossicone')
    head.box(1.5, -7, -1, 1, 3, 1, tag='ossicone')
    ears(head, 3, -2, 0, 4, 2, 1, out=0.3)
    tail = m.part('tail', (0, -21, 14), (0.12, 0, 0))
    tail.box(-0.5, 0, -0.5, 1, 18, 1)
    tail.box(-1, 16, -1, 2, 6, 2, tag='tuft')
    m.eyes = ('head', (3, -2, -4), 1.0)
    return m


def wildebeest():
    m = Model('wildebeest')
    body = m.part('body', (0, 6, 0), (-0.08, 0, 0))
    body.box(-5.5, -5, -12, 11, 11, 24)
    body.box(-5, -8, -12, 10, 4, 11, tag='hump')
    legs(m, 11, 3.5, -9, 3.5, 10, 3)
    neck = m.part('neck', (0, 0, -11), (0.35, 0, 0))
    neck.box(-3, -4, -8, 6, 9, 9)
    neck.box(-0.5, -6, -8, 1, 3, 10, tag='mane')
    neck.box(-1, 4, -7, 2, 5, 7, tag='beard')
    head = neck.child('head', (0, 0, -8), (0.55, 0, 0))
    head.box(-3, -3, -10, 6, 7, 10)
    head.box(-3.5, 0, -12, 7, 4, 3, tag='muzzle')
    horns = head.child('horns', (0, -3, -1), (-0.55, 0, 0))
    horns.box(2, -1, -1, 4, 2, 2, tag='horn')
    horns.box(5, -5, -1, 2, 4, 2, tag='horn')
    horns.box(-6, -1, -1, 4, 2, 2, tag='horn')
    horns.box(-7, -5, -1, 2, 4, 2, tag='horn')
    ears(head, 3, 0, -2, 3, 1, 2, out=0.6)
    tail = m.part('tail', (0, 2, 12), (0.3, 0, 0))
    tail.box(-0.5, 0, -0.5, 1, 12, 1)
    tail.box(-1, 9, -1, 2, 5, 2, tag='tuft')
    m.eyes = ('head', (3, -1, -5), 0.9)
    return m


def gazelle():
    m = Model('gazelle')
    body = m.part('body', (0, 12, 0))
    body.box(-3, -3, -7.5, 6, 6, 15)
    legs(m, 15, 2, -5, 2, 5.5, 2)
    neck = m.part('neck', (0, 10, -6.5), (0.35, 0, 0))
    neck.box(-1.5, -7, -2, 3, 8, 3)
    head = neck.child('head', (0, -7, -0.5), (-0.3, 0, 0))
    head.box(-1.5, -2, -5, 3, 3, 6)
    horns = head.child('horns', (0, -2, 0), (-0.35, 0, 0))
    horns.box(-1.25, -5, -0.5, 1, 5, 1, tag='horn')
    horns.box(0.25, -5, -0.5, 1, 5, 1, tag='horn')
    ears(head, 1, -1.5, 0.5, 2, 3, 1, out=0.7)
    tail = m.part('tail', (0, 10, 7.5), (0.3, 0, 0))
    tail.box(-0.5, 0, -0.5, 1, 3, 1)
    m.eyes = ('head', (1.5, -1, -2.5), 0.7)
    return m


def hippo():
    m = Model('hippo')
    body = m.part('body', (0, 8, 0))
    body.box(-11, -8, -19, 22, 18, 38)
    legs(m, 15, 7, -12, 7, 12, 7)
    head = m.part('head', (0, 4, -18))
    head.box(-7.5, -5, -10, 15, 9, 11)
    head.box(-8.5, -3, -19, 17, 7, 9, tag='snout')
    head.box(-6.5, -7, -9, 3, 2, 3, tag='eyebump')
    head.box(3.5, -7, -9, 3, 2, 3, tag='eyebump')
    head.box(-5, -4, -18, 10, 1, 4, tag='nostrils')
    ears(head, 5, -6, -4, 2, 2, 2, out=0.3)
    jaw = head.child('jaw', (0, 4, -7))
    jaw.box(-8, 0, -12, 16, 4, 13, tag='jaw')
    jaw.box(-6, -2, -11, 2, 2, 2, tag='tooth')
    jaw.box(4, -2, -11, 2, 2, 2, tag='tooth')
    tail = m.part('tail', (0, 3, 19), (0.4, 0, 0))
    tail.box(-1.5, 0, -0.5, 3, 5, 1)
    m.eyes = ('head', (5, -7.1, -7.5), 0.9)
    return m


def big_cat(name, body_y, body_w, body_h, body_l, leg_w, head_size, muzzle, tail, mane=False, ear=(2, 2, 1), tuft=False):
    m = Model(name)
    body = m.part('body', (0, body_y, 0))
    body.box(-body_w / 2, -body_h / 2, -body_l / 2, body_w, body_h, body_l)
    leg_top = body_y + body_h / 2 - 2
    legs(m, leg_top, body_w / 2 - leg_w / 2 + 0.25, -body_l / 2 + 4, body_w / 2 - leg_w / 2 + 0.25, body_l / 2 - 3.5, leg_w,
         paw=(leg_w + 1, 2))
    hw, hh, hd = head_size
    head = m.part('head', (0, body_y - body_h / 2 + 2, -body_l / 2 + 1))
    head.box(-hw / 2, -hh / 2 - 1, -hd, hw, hh, hd)
    mw, mh, md = muzzle
    head.box(-mw / 2, hh / 2 - 1 - mh, -hd - md, mw, mh, md, tag='muzzle')
    ew, eh, ed = ear
    ears(head, hw / 2 - ew - 0.25, -hh / 2 - 1, -hd / 2 + 1, ew, eh, ed)
    if mane:
        mn = head.child('mane')
        mn.box(-hw / 2 - 2.5, -hh / 2 - 3, -hd / 2 - 0.5, hw + 5, hh + 7, hd + 2, tag='mane')
        mn.box(-hw / 2 - 1, hh / 2, -hd / 2 + 1.5, hw + 2, 5, hd + 2, tag='mane')
    t1, t2, tw, a1, a2 = tail
    tl = m.part('tail', (0, body_y - body_h / 2 + 1.5, body_l / 2), (a1, 0, 0))
    tl.box(-tw / 2, 0, -tw / 2, tw, t1, tw)
    tl2 = tl.child('tail2', (0, t1, 0), (a2, 0, 0))
    tl2.box(-tw / 2, 0, -tw / 2, tw, t2, tw)
    if tuft:
        tl2.box(-tw / 2 - 0.5, t2 - 1, -tw / 2 - 0.5, tw + 1, 3, tw + 1, tag='tuft')
    m.eyes = ('head', (hw / 2, -1.5, -hd + 1.5), 0.8)
    return m


def lion():
    return big_cat('lion', 10, 10, 9, 26, 4, (8, 7, 7), (5, 4, 3), (10, 7, 2, 0.6, 0.3), mane=True, tuft=True)


def ostrich():
    m = Model('ostrich')
    body = m.part('body', (0, 1, 0), (-0.1, 0, 0))
    body.box(-4, -4, -6, 8, 8, 12)
    m.part('wing_l', (4, -2, -4), (0, 0.1, 0)).box(0, 0, 0, 1, 6, 10, tag='wing')
    m.part('wing_r', (-4, -2, -4), (0, -0.1, 0)).box(-1, 0, 0, 1, 6, 10, tag='wing')
    m.part('tail', (0, -2, 6), (-0.6, 0, 0)).box(-3, -1, 0, 6, 4, 5, tag='plume')
    neck = m.part('neck', (0, -1, -5), (0.12, 0, 0))
    neck.box(-1, -17, -1.5, 2, 18, 2)
    head = neck.child('head', (0, -17, -0.5), (-0.12, 0, 0))
    head.box(-1.5, -2, -3, 3, 2, 4)
    head.box(-1, -1, -6, 2, 1, 3, tag='beak')
    for name, x in (('leg_l', 2), ('leg_r', -2)):
        leg = m.part(name, (x, 5, 0))
        leg.box(-1.5, 0, -1.5, 3, 6, 3, tag='thigh')
        leg.box(-1, 6, -1, 2, 12, 2, tag='leg')
        leg.box(-1.5, 18, -3, 3, 1, 4, tag='foot')
    m.eyes = ('head', (1.5, -1.3, -1.5), 0.5)
    return m


def crocodilian(name, snout_w=5):
    m = Model(name)
    body = m.part('body', (0, 19.5, 0))
    body.box(-5, -3, -11, 10, 5, 22)
    for nm, x, z in (('leg_fl', 5.5, -7), ('leg_fr', -5.5, -7), ('leg_hl', 5.5, 8), ('leg_hr', -5.5, 8)):
        leg = m.part(nm, (x, 20, z))
        leg.box(-1.5, 0, -1.5, 3, 4, 3, tag='leg')
        leg.box(-2, 3, -3, 4, 1, 4, tag='paw')
    head = m.part('head', (0, 19, -11))
    head.box(-3.5, -2, -6, 7, 4, 6)
    head.box(-snout_w / 2, -1, -17, snout_w, 2, 11, tag='snout')
    head.box(-3.5, -3, -5, 2, 1, 2, tag='eyebump')
    head.box(1.5, -3, -5, 2, 1, 2, tag='eyebump')
    jaw = head.child('jaw', (0, 1, -2))
    jaw.box(-3, 0, -4, 6, 2, 4, tag='jaw')
    jaw.box(-snout_w / 2, 0, -15, snout_w, 1, 11, tag='jaw')
    tail = m.part('tail', (0, 18.5, 11))
    tail.box(-3.5, -2, 0, 7, 4, 9)
    tail2 = tail.child('tail2', (0, 0.5, 9))
    tail2.box(-2.5, -2, 0, 5, 3, 9)
    tail3 = tail2.child('tail3', (0, 0.5, 9))
    tail3.box(-1.5, -2, 0, 3, 2, 9)
    tail3.box(-0.5, -3, 0, 1, 1, 9, tag='crest')
    m.eyes = ('head', (2.5, -3.05, -4), 0.6)
    return m


def nile_crocodile():
    return crocodilian('nile_crocodile', 5)


# ============================================================================ Sahara

def fennec():
    """Vanilla fox layout (FoxModel parts) with the huge ears of the fennec."""
    m = Model('fennec')
    head = m.part('head', (-1, 17.5, -3))
    head.box(-2, -1.5, -4, 6, 5, 5)
    head.child('right_ear', (-1, -1.5, -1.5), (0, 0, -0.45)).box(-1.5, -5, -0.5, 3, 5, 1, tag='ear')
    head.child('left_ear', (3, -1.5, -1.5), (0, 0, 0.45)).box(-1.5, -5, -0.5, 3, 5, 1, tag='ear')
    head.child('nose', (0, 0, 0)).box(0, 1.5, -6.5, 2, 2, 3, tag='muzzle')
    body = m.part('body', (0, 17, -5), (1.5707964, 0, 0))
    body.box(-2.5, 3.999, -3, 5, 9, 5)
    body.child('tail', (-4, 13, -1), (-0.05235988, 0, 0)).box(2.5, 0, -1, 3, 8, 4, tag='tail')
    for name, x, z in (('right_hind_leg', -4.5, 6.5), ('left_hind_leg', -1.5, 6.5), ('right_front_leg', -4.5, 0), ('left_front_leg', -1.5, 0)):
        m.part(name, (x, 18.5, z)).box(2, 0.5, -1, 2, 5, 2, tag='leg')
    m.eyes = ('head', (4, 0.5, -3), 0.6)
    return m


def addax():
    m = Model('addax')
    body = m.part('body', (0, 9, 0))
    body.box(-4.5, -5, -10, 9, 10, 20)
    legs(m, 13, 3, -7, 3, 7.5, 3)
    neck = m.part('neck', (0, 6, -9), (0.4, 0, 0))
    neck.box(-2.5, -8, -2.5, 5, 10, 5)
    head = neck.child('head', (0, -8, -0.5), (-0.15, 0, 0))
    head.box(-2, -2, -7, 4, 4, 8)
    head.box(-2.5, -3, -2, 5, 2, 3, tag='forelock')
    horns = head.child('horns', (0, -2, 0), (-0.75, 0, 0))
    horns.box(-2.5, -7, -0.5, 1, 7, 1, tag='horn')
    horns.box(1.5, -7, -0.5, 1, 7, 1, tag='horn')
    tips = horns.child('horn_tips', (0, -7, 0), (-0.45, 0, 0))
    tips.box(-3.5, -7, -0.5, 1, 7, 1, tag='horn')
    tips.box(2.5, -7, -0.5, 1, 7, 1, tag='horn')
    ears(head, 1.5, -1.5, 0.5, 2, 3, 1, out=0.9)
    tail = m.part('tail', (0, 5, 10), (0.25, 0, 0))
    tail.box(-0.5, 0, -0.5, 1, 7, 1)
    tail.box(-1, 5, -1, 2, 4, 2, tag='tuft')
    m.eyes = ('head', (2, -0.5, -3.5), 0.8)
    return m


# ============================================================================ Amazon

def jaguar():
    return big_cat('jaguar', 14, 9, 8, 22, 4, (7, 7, 6), (4, 3, 2), (9, 8, 2, 0.8, 0.5))


def capybara():
    m = Model('capybara')
    body = m.part('body', (0, 15, 0))
    body.box(-4.5, -5, -9, 9, 10, 18)
    body.box(-4, -6, 0, 8, 2, 8, tag='rump')
    legs(m, 19, 2.5, -5.5, 2.5, 5.5, 3)
    head = m.part('head', (0, 12, -8.5), (0.25, 0, 0))
    head.box(-3, -3, -8, 6, 7, 9)
    ears(head, 1.5, -3, -1, 1, 1, 1)
    m.eyes = ('head', (3, -1.5, -3.5), 0.6)
    return m


def tapir():
    m = Model('tapir')
    body = m.part('body', (0, 11.5, 0))
    body.box(-6, -5.5, -13, 12, 11, 26)
    legs(m, 16, 3.5, -9, 3.5, 9.5, 4)
    head = m.part('head', (0, 9, -12), (0.35, 0, 0))
    head.box(-3.5, -4, -9, 7, 8, 10)
    head.box(-2, -1, -13, 4, 5, 4, tag='snout')
    head.box(-0.5, -6, -3, 1, 2, 9, tag='crest')
    ears(head, 3, -4, -1, 2, 3, 1, out=0.3)
    tail = m.part('tail', (0, 7, 13), (0.5, 0, 0))
    tail.box(-0.5, 0, -0.5, 1, 3, 1)
    m.eyes = ('head', (3.5, -1.5, -4.5), 0.6)
    return m


def toucan():
    """Vanilla parrot layout (ParrotModel parts) with the toco toucan's huge bill."""
    m = Model('toucan')
    m.part('body', (0, 16.5, -3), (0.4937, 0, 0)).box(-2, 0, -2, 4, 7, 4)
    m.part('tail', (0, 22, 1.5), (1.015, 0, 0)).box(-1.5, -1, -1, 3, 6, 1, tag='tail')
    m.part('left_wing', (2, 17, -2.8), (-0.6981, -3.1415927, 0)).box(-0.5, 0, -2, 1, 6, 4, tag='wing')
    m.part('right_wing', (-2, 17, -2.8), (-0.6981, -3.1415927, 0)).box(-0.5, 0, -2, 1, 6, 4, tag='wing')
    head = m.part('head', (0, 15.5, -2.8))
    head.box(-1.5, -2, -1.5, 3, 3, 3)
    head.child('head2', (0, -2, -1)).box(-1, -0.5, -1, 2, 1, 2)
    head.child('beak1', (0, -0.5, -1.5)).box(-1, -1.5, -6, 2, 2, 6, tag='bill')
    head.child('beak2', (0, -1.75, -2.45)).box(-0.5, 1.5, -4.5, 1, 1, 5, tag='bill_lower')
    head.child('feather', (0, -2.15, 0.15), (-0.2214, 0, 0)).box(0, -1, -1, 1, 1, 1, tag='hidden')
    m.part('left_leg', (1, 22, -1.05), (-0.0299, 0, 0)).box(-0.5, 0, -0.5, 1, 2, 1, tag='leg')
    m.part('right_leg', (-1, 22, -1.05), (-0.0299, 0, 0)).box(-0.5, 0, -0.5, 1, 2, 1, tag='leg')
    m.eyes = ('head', (1.5, -1, -0.5), 0.6)
    return m


def river_dolphin():
    """Vanilla dolphin layout (DolphinModel parts): the pink boto with its long beak and low ridge."""
    m = Model('river_dolphin')
    body = m.part('body', (0, 22, -5))
    body.box(-4, -7, 0, 8, 7, 13)
    body.child('back_fin', (0, 0, 0), (1.0471976, 0, 0)).box(-0.5, 0, 8, 1, 2, 6, tag='fin')
    body.child('left_fin', (2, -2, 4), (1.0471976, 0, 2.0943952)).box(-0.5, -5, 0, 1, 5, 8, tag='fin')
    body.child('right_fin', (-2, -2, 4), (1.0471976, 0, -2.0943952)).box(-0.5, -5, 0, 1, 5, 8, tag='fin')
    tail = body.child('tail', (0, -2.5, 11), (-0.10471976, 0, 0))
    tail.box(-2, -2.5, 0, 4, 5, 11)
    tail.child('tail_fin', (0, 0, 9)).box(-5, -0.5, 0, 10, 1, 6, tag='fin')
    head = body.child('head', (0, -4, -3))
    head.box(-4, -3, -3, 8, 7, 6)
    head.child('nose', (0, 0, 0)).box(-1, 2, -11, 2, 2, 8, tag='beak')
    m.eyes = ('head', (4, 1, -1), 0.6)
    return m


def black_caiman():
    return crocodilian('black_caiman', 6)


# ============================================================================ Mongolian steppe

def yak():
    m = Model('yak')
    body = m.part('body', (0, 6, 0))
    body.box(-8, -8, -15, 16, 16, 30)
    body.box(-6, -12, -14, 12, 5, 12, tag='hump')
    body.box(-8, 6, -14, 16, 9, 28, inflate=0.5, tag='skirt')
    legs(m, 14, 5, -10, 5, 10, 5)
    head = m.part('head', (0, 1, -15), (0.5, 0, 0))
    head.box(-4, -4, -8, 8, 8, 9)
    head.box(-4.5, -6, -4, 9, 3, 5, tag='forelock')
    horns = head.child('horns', (0, -3, -2), (-0.3, 0, 0))
    horns.box(3.5, -1, -1, 4, 2, 2, tag='horn')
    horns.box(6.5, -5, -1, 2, 4, 2, tag='horn')
    horns.box(-7.5, -1, -1, 4, 2, 2, tag='horn')
    horns.box(-8.5, -5, -1, 2, 4, 2, tag='horn')
    tail = m.part('tail', (0, -1, 15), (0.25, 0, 0))
    tail.box(-1.5, 0, -1.5, 3, 14, 3)
    m.eyes = ('head', (4, -1, -4), 0.9)
    return m


def saiga():
    m = Model('saiga')
    body = m.part('body', (0, 12.5, 0))
    body.box(-3.5, -4.5, -7.5, 7, 8, 15)
    legs(m, 16, 2, -5, 2, 5.5, 2)
    neck = m.part('neck', (0, 10, -7), (0.6, 0, 0))
    neck.box(-2, -4, -2, 4, 5, 4)
    head = neck.child('head', (0, -4, -1), (-0.3, 0, 0))
    head.box(-2, -2, -4, 4, 4, 5)
    head.box(-2, -1, -7, 4, 4, 3, tag='nose')
    horns = head.child('horns', (0, -2, -0.5), (-0.15, 0, 0))
    horns.box(-1.75, -6, -0.5, 1, 6, 1, tag='horn')
    horns.box(0.75, -6, -0.5, 1, 6, 1, tag='horn')
    ears(head, 1.5, -2, 0.5, 2, 2, 1, out=0.5)
    tail = m.part('tail', (0, 9, 7.5), (0.4, 0, 0))
    tail.box(-0.5, 0, -0.5, 1, 3, 1)
    m.eyes = ('head', (2, -0.5, -2.5), 0.7)
    return m


def snow_leopard():
    return big_cat('snow_leopard', 15.5, 8, 8, 20, 4, (6, 6, 5), (4, 3, 2), (10, 10, 3, 1.0, 0.6))


def marmot():
    m = Model('marmot')
    body = m.part('body', (0, 18, 0))
    body.box(-3.5, -4, -5, 7, 7, 10)
    legs(m, 21, 2, -3, 2, 3, 2)
    head = m.part('head', (0, 15.5, -5))
    head.box(-2.5, -2.5, -4, 5, 5, 5)
    ears(head, 1.5, -2.5, -1, 1, 1, 1)
    tail = m.part('tail', (0, 16, 5), (-0.5, 0, 0))
    tail.box(-1, -1, 0, 2, 2, 4)
    m.eyes = ('head', (2.5, -1, -2.5), 0.5)
    return m


def equine(name):
    """Vanilla horse layout (AbstractEquineModel parts)."""
    m = Model(name)
    body = m.part('body', (0, 11, 5))
    body.box(-5, -8, -17, 10, 10, 22, inflate=0.05)
    body.child('tail', (0, -5, 2), (0.5235988, 0, 0)).box(-1.5, 0, 0, 3, 14, 4, tag='tail')
    hp = m.part('head_parts', (0, 4, -12), (0.5235988, 0, 0))
    hp.box(-2, -6, -2, 4, 12, 7, tag='neck')
    head = hp.child('head', (0, 0, 0))
    head.box(-3, -11, -2, 6, 5, 7)
    head.child('left_ear', (0, 0, 0)).box(0.55, -13, 4, 2, 3, 1, inflate=-0.001, tag='ear')
    head.child('right_ear', (0, 0, 0)).box(-2.55, -13, 4, 2, 3, 1, inflate=-0.001, tag='ear')
    hp.child('mane', (0, 0, 0)).box(-1, -11, 5.01, 2, 16, 2, tag='mane')
    hp.child('upper_mouth', (0, 0, 0)).box(-2, -11, -7, 4, 5, 5, tag='muzzle')
    for nm, x, z, bx, bz in (('left_hind_leg', 4, 7, -3, -1), ('right_hind_leg', -4, 7, -1, -1),
                             ('left_front_leg', 4, -10, -3, -1.9), ('right_front_leg', -4, -10, -1, -1.9)):
        m.part(nm, (x, 14, z)).box(bx, -1.01, bz, 4, 11, 4, tag='leg')
    m.eyes = ('head', (3, -9, 1), 0.7)
    return m


def zebra():
    return equine('zebra')


def przewalski_horse():
    return equine('przewalski_horse')


def bactrian_camel():
    """Vanilla camel layout (CamelModel parts, so the camel animations apply) with two humps."""
    m = Model('bactrian_camel')
    body = m.part('body', (0, 4, 9.5))
    body.box(-7.5, -12, -23.5, 15, 12, 27)
    hump = body.child('hump', (0, -12, -10))
    hump.box(-4, -6, -9, 8, 6, 7, tag='hump')
    hump.box(-4, -6, 3, 8, 6, 7, tag='hump')
    body.child('tail', (0, -9, 3.5)).box(-1.5, 0, 0, 3, 14, 1, tag='tail')
    head = body.child('head', (0, -3, -19.5))
    head.box(-3.5, -7, -15, 7, 8, 19, tag='neck')
    head.box(-3.5, -21, -15, 7, 14, 7, tag='neck_up')
    head.box(-2.5, -21, -21, 5, 5, 6, tag='muzzle')
    head.child('left_ear', (2.5, -21, -9.5)).box(-0.5, 0.5, -1, 3, 1, 2, tag='ear')
    head.child('right_ear', (-2.5, -21, -9.5)).box(-2.5, 0.5, -1, 3, 1, 2, tag='ear')
    for nm, x, z in (('left_hind_leg', 4.9, 9.5), ('right_hind_leg', -4.9, 9.5), ('left_front_leg', 4.9, -10.5), ('right_front_leg', -4.9, -10.5)):
        m.part(nm, (x, 1, z)).box(-2.5, 2, -2.5, 5, 21, 5, tag='leg')
    m.eyes = ('head', (3.5, -18.5, -17), 0.7)
    return m


SHAPES = {
    'elephant': elephant, 'giraffe': giraffe, 'zebra': zebra, 'wildebeest': wildebeest, 'gazelle': gazelle, 'hippo': hippo,
    'lion': lion, 'ostrich': ostrich, 'nile_crocodile': nile_crocodile,
    'fennec': fennec, 'addax': addax,
    'jaguar': jaguar, 'capybara': capybara, 'tapir': tapir, 'toucan': toucan, 'river_dolphin': river_dolphin, 'black_caiman': black_caiman,
    'yak': yak, 'saiga': saiga, 'snow_leopard': snow_leopard, 'marmot': marmot, 'przewalski_horse': przewalski_horse,
    'bactrian_camel': bactrian_camel,
}
