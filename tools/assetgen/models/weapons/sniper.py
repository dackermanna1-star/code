"""Bolt-Action Sniper Rifle - .338 long-range chassis rifle (original design).

Layout (model units): bore axis x=8, y=8, muzzle toward -z. Round-ish action z 0..9 with a real ejection
port on the right, one monolithic top rail z -13.6..9.2 over the M-LOK handguard (z -13.6..-0.4) and the
action, aluminium chassis with magazine well z 1.0..5.8, folding hinge at z 10.4..11.6 and the
adjustable stock (variant) behind it. The whole rifle (longest barrel + longest stock) stays within 48
units along z (-22 .. 24.2).
"""
import math

from ccmodel import Part, Weapon
from weapons.common import ALL_CHARMS, accent_strip, picatinny, side_slots

NS = "calibercraft"


def side_rail(p: Part, x, yc, z0, z1, right=True, role="detail"):
    """Short picatinny on a side face growing toward +x (right) or -x (left). Returns the rail surface x."""
    s = 1 if right else -1
    base, tooth = 0.45, 0.25
    xa, xb = sorted((x, x + s * base))
    p.box((xa, yc - 0.7, z0), (xb, yc + 0.7, z1), role)
    xc, xd = sorted((x + s * base, x + s * (base + tooth)))
    z = z0 + 0.3
    while z + 0.5 <= z1 - 0.2:
        p.box((xc, yc - 0.8, z), (xd, yc + 0.8, z + 0.5), role)
        z += 1.0
    return x + s * (base + tooth)


def x_round(p: Part, y, z, x0, x1, d, role):
    """Voxel-style round section along x (knobs): a plus shape plus an inner square."""
    r = d / 2
    p.box((x0, y - 0.45 * r, z - r), (x1, y + 0.45 * r, z + r), role)
    p.box((x0, y - r, z - 0.45 * r), (x1, y + r, z + 0.45 * r), role)
    p.box((x0, y - 0.76 * r, z - 0.76 * r), (x1, y + 0.76 * r, z + 0.76 * r), role)


def slope_fill(p: Part, x0, x1, z0, y0, z1, y1, role, band=1.2):
    """Fill below y0 down to the line (z0,y0)->(z1,y1) (y1 < y0) with a vertical rear edge at z1.
    The rotated band's tilted rear end overhangs z1 by band*sin(angle); a butt pad covers it."""
    dz, dy = z1 - z0, y0 - y1
    ang = math.atan2(dy, dz)
    p.box((x0 + 0.05, y0, z0), (x1 - 0.05, y0 + band, z0 + math.hypot(dz, dy)), role,
          rot={"origin": ((x0 + x1) / 2, y0, z0), "axis": "x", "angle": math.degrees(ang)})
    step = 0.9 * band / math.cos(ang)
    y_top = y0
    while y_top > y1 + 0.05:
        y_bot = max(y1, y_top - step)
        zb = z0 + (y0 - y_bot) / math.tan(ang)
        if zb >= z1 - 0.05:
            break
        p.box((x0, y_bot, zb), (x1, y_top, z1), role)
        y_top = y_bot


def build():
    w = Weapon("sniper", "sniper")
    w.standard = {"receiver": "parkerized", "furniture": "od_polymer", "metal": "dark_steel",
                  "detail": "black_anodized", "mag": "black_polymer", "accent": "gunmetal"}

    body = w.part("body")
    # ---- Action (chamfered round receiver) with an open ejection port on the right z 1.4..4.8
    body.box((6.95, 6.7, 0.0), (9.05, 7.3, 9.0), "receiver")  # floor
    body.box((6.95, 8.9, 0.0), (9.05, 9.4, 9.0), "receiver")  # roof
    body.box((6.75, 6.95, 0.0), (7.4, 9.15, 9.0), "receiver")  # left wall
    body.box((8.6, 6.95, 0.0), (9.25, 9.15, 1.4), "receiver")  # right wall: front of port
    body.box((8.6, 6.95, 4.8), (9.25, 9.15, 9.0), "receiver")  # rear of port
    body.box((8.6, 6.95, 1.4), (9.25, 7.3, 4.8), "receiver")  # below port
    body.box((8.6, 8.9, 1.4), (9.25, 9.15, 4.8), "receiver")  # above port
    body.box((6.9, 6.5, -0.45), (9.1, 9.3, 0.0), "detail")  # recoil lug
    body.box((9.25, 7.0, 7.2), (9.32, 7.3, 8.5), "detail", faces=("east",))  # bolt handle notch
    body.box((9.25, 7.05, 8.6), (9.55, 7.45, 9.0), "detail")  # safety
    body.box((6.55, 8.1, 7.8), (6.75, 8.6, 8.7), "detail")  # bolt release (left)
    for x0, x1 in ((9.25, 9.31), (6.69, 6.75)):  # action screws
        for z in (0.6, 8.2):
            body.box((x0, 7.75, z), (x1, 8.25, z + 0.5), "metal")
    # one-piece top rail over handguard and action
    rail_top = picatinny(body, 9.4, -11.6, 9.2)
    # ---- Chassis
    body.box((6.6, 5.0, -0.5), (9.4, 6.95, 10.4), "furniture")  # bedding block
    body.box((6.5, 6.6, 0.2), (6.75, 7.7, 8.8), "furniture")  # side cheeks hugging the action
    body.box((9.25, 6.6, 5.0), (9.5, 7.25, 8.8), "furniture")
    body.box((9.25, 6.6, 0.2), (9.5, 7.25, 1.3), "furniture")
    body.box((6.7, 2.8, 1.0), (9.3, 5.0, 5.8), "furniture")  # magazine well
    body.box((6.55, 2.4, 0.8), (9.45, 2.9, 6.0), "detail")  # flared lip
    body.box((7.5, 2.6, 5.8), (8.5, 4.6, 6.2), "detail")  # paddle release
    body.box((7.6, 2.4, 6.2), (8.4, 2.8, 9.4), "furniture")  # trigger guard
    body.box((7.6, 2.8, 9.0), (8.4, 5.0, 9.4), "furniture")
    body.box((7.85, 3.1, 7.2), (8.15, 5.0, 7.55), "metal")  # flat-faced trigger
    body.box((6.55, 4.2, 6.4), (6.6, 4.8, 8.8), "detail", faces=("west",))  # chassis lightening cuts
    body.box((9.4, 5.4, 6.4), (9.45, 6.4, 9.8), "detail", faces=("east",))
    body.box((6.55, 5.4, 6.4), (6.6, 6.4, 9.8), "detail", faces=("west",))
    # pistol grip (near vertical, with palm swell and texture)
    grip_rot = {"origin": (8, 5.0, 10.0), "axis": "x", "angle": -10}
    body.box((6.9, -1.5, 8.9), (9.1, 5.0, 11.2), "furniture", rot=grip_rot)
    body.box((6.8, 0.2, 9.6), (9.2, 3.4, 11.1), "furniture", rot=grip_rot)  # palm swell
    body.box((6.8, -1.9, 8.8), (9.2, -1.5, 11.3), "detail", rot=grip_rot)  # cap
    body.box((9.2, 0.6, 9.9), (9.25, 3.0, 10.9), "detail", faces=("east",), rot=grip_rot)
    body.box((6.75, 0.6, 9.9), (6.8, 3.0, 10.9), "detail", faces=("west",), rot=grip_rot)
    body.box((6.9, 4.4, 10.8), (9.1, 5.2, 12.0), "furniture", rot=grip_rot)  # thumb shelf / tang
    # folding hinge
    body.box((6.8, 4.2, 10.4), (9.2, 6.8, 11.6), "detail")
    body.octo_rod(9.35, 5.5, 10.5, 11.5, 0.5, "metal")  # hinge pin head
    # ---- Handguard (M-LOK) and front fittings
    hz0, hz1 = -11.6, -0.4
    body.box((6.5, 6.1, hz0), (9.5, 9.0, hz1), "furniture")
    body.box((6.75, 9.0, hz0), (9.25, 9.4, hz1), "furniture")  # chamfered top under the rail
    body.box((6.75, 5.75, hz0), (9.25, 6.1, hz1), "furniture")  # chamfered bottom
    body.box((6.65, 6.0, hz0 - 0.2), (9.35, 9.1, hz0), "detail")  # end cap
    side_slots(body, 6.5, 9.5, 6.75, 7.85, (-7.4, -5.0, -2.6), length=1.8)
    for z in (-6.8, -4.2, -1.6):  # bottom M-LOK slots
        body.box((7.4, 5.7, z), (8.6, 5.75, z + 1.6), "detail", faces=("down",))
    tac_x = side_rail(body, 9.5, 7.35, -11.2, -8.0)
    grip_y = picatinny(body, 5.75, -11.3, -8.1, width=1.4, top=False)
    for z in (-1.4, -0.8):  # clamp screws
        body.box((9.5, 6.4, z), (9.56, 6.8, z + 0.4), "metal")
        body.box((6.44, 6.4, z), (6.5, 6.8, z + 0.4), "metal")
    accent_strip(body, 6.5, 9.5, 8.45, 8.6, -11.2, -0.8)
    body.box((9.4, 5.0, -0.4), (9.8, 5.5, 0.2), "detail")  # QD sling cup (charm)

    # ---- Bolt (handle + knob + bolt body + shroud). Pivot on the bolt axis; lifts 60 deg then travels back.
    bh = w.part("bolt_handle", animated=True)
    bh.octo_rod(8, 8, 1.2, 9.0, 1.4, "metal")  # bolt body (seen through the port)
    bh.box((8.05, 7.55, 1.3), (8.72, 8.45, 2.0), "detail")  # extractor
    bh.box((7.6, 8.7, 2.4), (8.4, 8.85, 6.6), "metal")  # bolt flute (top)
    bh.octo_rod(8, 8, 9.0, 10.4, 2.0, "detail")  # shroud
    bh.box((7.7, 6.75, 9.6), (8.3, 7.15, 10.75), "metal")  # cocking piece
    bh.box((7.85, 7.15, 10.42), (8.15, 7.45, 10.5), "shell")  # cocked indicator
    stem_rot = {"origin": (8.4, 7.95, 7.9), "axis": "z", "angle": -35}
    bh.box((8.4, 7.65, 7.6), (10.6, 8.25, 8.2), "metal", rot=stem_rot)
    x_round(bh, 6.55, 7.9, 9.9, 11.3, 1.5, "detail")  # tactical knob
    x_round(bh, 6.55, 7.9, 11.3, 11.5, 1.1, "detail")

    # ---- Barrels (≈22 units ahead of the action)
    def barrel(vid, z_tip, d, fluted):
        b = w.variant("barrel", vid)
        b.octo_rod(8, 8, z_tip, hz1, d, "metal")
        b.octo_rod(8, 8, z_tip, z_tip + 0.7, d + 0.2, "detail")  # thread cap
        if fluted:
            r = d / 2
            z0, z1 = z_tip + 1.6, hz0 - 0.4
            b.box((7.75, 8 + r - 0.04, z0), (8.25, 8 + r + 0.02, z1), "detail")
            b.box((7.75, 8 - r - 0.02, z0), (8.25, 8 - r + 0.04, z1), "detail")
            b.box((8 + r - 0.04, 7.75, z0), (8 + r + 0.02, 8.25, z1), "detail")
            b.box((8 - r - 0.02, 7.75, z0), (8 - r + 0.04, 8.25, z1), "detail")
        w.muzzle_by_barrel[vid] = (8, 8, z_tip)
        return b

    barrel("default", -22.0, 1.45, True)
    barrel(f"{NS}:heavy_barrel", -22.0, 2.0, False)
    barrel(f"{NS}:short_barrel", -17.6, 1.55, False)

    # ---- Magazines (detachable box, .338 is long so the box is deep)
    def mag(m, bottom):
        m.box((7.05, bottom, 1.3), (8.95, 4.95, 5.5), "mag")
        m.box((6.95, bottom - 0.45, 1.2), (9.05, bottom, 5.6), "detail")  # floor plate
        m.box((7.0, bottom + 0.4, 1.35), (9.0, 4.4, 1.8), "mag")  # front spine
        if bottom < 0:
            m.box((7.0, bottom + 0.6, 2.7), (9.0, 2.1, 4.2), "mag")  # grip rib
        m.box((7.6, 3.4, 5.5), (8.4, 4.0, 5.75), "detail")  # catch notch
        m.box((7.35, 4.95, 1.55), (8.65, 5.35, 4.9), "mag")  # feed lips
        m.octo_rod(8, 5.55, 2.1, 5.2, 0.85, "brass")  # top round (case)
        m.octo_rod(8, 5.55, 1.45, 2.1, 0.6, "brass")  # bullet
        return m

    mag(w.variant("magazine", "default"), 0.6)
    mag(w.variant("magazine", f"{NS}:extended_mag"), -2.6)

    # ---- Stocks
    def butt(s, z0, pad=0.8, top=9.6, bottom=0.6):
        s.box((7.0, bottom, z0), (9.0, top, z0 + 0.9), "furniture")  # butt plate
        s.box((6.9, bottom - 0.2, z0 + 0.9), (9.1, top + 0.2, z0 + 0.9 + pad), "detail")  # recoil pad

    s = w.variant("stock", "default")  # adjustable chassis stock: triangular frame + cheek riser
    s.box((7.1, 4.9, 11.6), (8.9, 6.7, 22.0), "furniture")  # top beam (stays below the bolt path)
    s.box((7.15, 4.2, 11.6), (8.85, 4.9, 13.2), "furniture")  # hinge web
    dz, dy = 22.0 - 11.8, 4.2 - 1.2
    s.box((7.15, 4.2, 11.8), (8.85, 5.3, 11.8 + math.hypot(dz, dy)), "furniture",
          rot={"origin": (8, 4.2, 11.8), "axis": "x", "angle": math.degrees(math.atan2(dy, dz))})  # lower beam
    s.box((7.1, 0.9, 21.0), (8.9, 9.0, 22.0), "furniture")  # rear upright
    s.box((7.15, 6.7, 19.8), (8.85, 8.2, 22.0), "furniture")  # riser support
    s.box((7.65, 6.7, 16.6), (8.35, 8.2, 17.4), "metal")  # riser post
    s.box((7.2, 8.2, 15.8), (8.8, 9.7, 22.0), "furniture")  # cheek riser
    s.box((7.25, 9.7, 16.3), (8.75, 9.85, 21.6), "detail")  # cheek pad
    s.box((6.8, 7.2, 20.4), (7.15, 7.8, 21.2), "metal")  # riser lock knob
    s.box((8.9, 5.3, 13.4), (8.95, 6.3, 20.6), "detail", faces=("east",))  # beam groove
    s.box((7.05, 5.3, 13.4), (7.1, 6.3, 20.6), "detail", faces=("west",))
    s.box((7.55, 0.15, 21.1), (8.45, 0.9, 21.9), "metal")  # monopod knob
    s.box((7.75, -0.35, 21.2), (8.25, 0.15, 21.8), "detail")  # monopod foot
    butt(s, 22.0, pad=0.8, top=9.4, bottom=0.6)
    s.box((9.0, 2.2, 22.1), (9.3, 3.0, 22.7), "metal")  # LOP button

    s = w.variant("stock", f"{NS}:precision_stock")  # solid precision stock, adjustable comb + butt hook
    s.box((7.0, 4.2, 11.6), (9.0, 8.2, 22.8), "furniture")
    slope_fill(s, 7.0, 9.0, 11.6, 4.2, 22.8, 0.9, "furniture")
    s.box((7.1, 8.7, 15.6), (8.9, 9.9, 22.4), "furniture")  # comb
    for z in (16.6, 20.8):
        s.box((7.7, 8.2, z), (8.3, 8.7, z + 0.6), "metal")
    s.box((7.5, 0.3, 21.3), (8.5, 1.4, 22.5), "metal")  # monopod knob
    s.box((7.7, -0.2, 21.4), (8.3, 0.3, 22.4), "detail")
    for y in (5.0, 6.6):  # side grooves
        s.box((9.0, y, 13.4), (9.05, y + 0.45, 21.0), "detail", faces=("east",))
        s.box((6.95, y, 13.4), (7.0, y + 0.45, 21.0), "detail", faces=("west",))
    butt(s, 22.8, pad=1.0, top=9.4, bottom=0.4)

    s = w.variant("stock", f"{NS}:lightweight_stock")  # thin folding skeleton
    s.box((7.3, 5.2, 11.6), (8.7, 6.4, 22.6), "furniture")
    s.box((7.3, 2.6, 11.8), (8.7, 3.6, 22.4), "furniture",
          rot={"origin": (8, 4.4, 11.6), "axis": "x", "angle": 8})
    s.box((7.35, 3.0, 11.6), (8.65, 5.2, 12.6), "furniture")
    s.box((7.3, 6.4, 17.0), (8.7, 8.9, 18.0), "furniture")  # riser post
    s.box((7.3, 8.9, 16.0), (8.7, 9.7, 22.0), "furniture")  # cheek bar
    butt(s, 22.6, pad=0.6, top=9.4, bottom=1.4)

    w.anim = {
        "magazine": {"pivot": [8, 4.95, 3.4], "style": "drop"},
        "bolt_handle": {"pivot": [8, 8, 8], "lift_deg": 60, "travel": [0, 0, 5]},
    }
    w.points = {
        "grip": (8, 1.8, 10.4),
        "support": (8, 5.5, -6.0),
        "ejection": (9.25, 8.1, 3.1),
        "mag_well": (8, 2.4, 3.4),
    }
    w.iron_sight_y = 11.2  # no irons: a neutral eye line just above the rail
    w.iron_sight_z = 8.5
    w.mounts = {
        "optic": (8, rail_top, 2.8),
        "grip": (8, grip_y, -9.7),
        "tactical": (tac_x, 7.35, -9.6),
        "charm": (9.6, 5.0, -0.1),
    }
    w.slots = {
        "optic": [f"{NS}:sniper_scope", f"{NS}:acog_scope"],
        "muzzle": [f"{NS}:muzzle_brake", f"{NS}:suppressor"],
        "grip": [f"{NS}:bipod"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
