"""Vector-9 - futuristic compact 9mm SMG with a stacked, angular receiver.

Layout (model units): bore axis at x=8, y=8; muzzle toward -z. The upper receiver spans z -11..5 with
a full-length top rail. The deep lower housing hangs below the front half with a raked nose; the
straight Glock-style magazine drops out of its bottom just ahead of the trigger guard. The pistol grip
sits behind the guard and the stock adaptor at z 5..6.2 carries the stock variants.
"""
import math

from ccmodel import Weapon
from weapons.common import ALL_CHARMS, accent_strip, picatinny

NS = "calibercraft"

GRIP_ANGLE = -17.0
GRIP_ORIGIN = (8.0, 5.0, 0.7)
GRIP_ROT = {"origin": GRIP_ORIGIN, "axis": "x", "angle": GRIP_ANGLE}
NOSE_ROT = {"origin": (8.0, 7.0, -8.6), "axis": "x", "angle": -38}  # raked front of the lower housing
MAG_Z0, MAG_Z1 = -5.6, -3.4  # magazine fore/aft extent
WELL_Y = 3.6  # bottom of the magazine well


def rot_pt(rot, y, z, x=8.0):
    a = math.radians(rot["angle"])
    oy, oz = rot["origin"][1], rot["origin"][2]
    dy, dz = y - oy, z - oz
    return (round(x, 3), round(oy + dy * math.cos(a) - dz * math.sin(a), 3),
            round(oz + dy * math.sin(a) + dz * math.cos(a), 3))


def build():
    w = Weapon("vector9", "smg")
    w.standard = {"receiver": "black_polymer", "furniture": "black_polymer", "metal": "dark_steel",
                  "detail": "black_anodized", "mag": "black_polymer", "accent": "grey_polymer"}

    body = w.part("body")
    # ---------------------------------------------------------------- upper receiver
    body.box((6.5, 7.0, -11.0), (9.5, 9.6, 5.0), "receiver")
    body.box((6.7, 7.4, -11.4), (9.3, 9.4, -11.0), "receiver")  # nose cap
    body.box((6.45, 6.95, -11.05), (9.55, 7.15, 5.05), "detail")  # upper/lower seam
    rail_top = picatinny(body, 9.6, -10.9, 4.9, width=1.7)
    for x0, x1 in ((9.5, 9.55), (6.45, 6.5)):  # recessed side panels on the upper
        for (z0, z1) in ((-10.3, -6.8), (-6.2, -3.4)):
            body.box((x0, 7.6, z0), (x1, 9.1, z1), "accent")
    accent_strip(body, 6.5, 9.5, 9.15, 9.3, -10.6, -0.6)
    # ejection port (right) with the bolt face visible
    body.box((9.5, 7.6, -2.2), (9.56, 8.9, 0.6), "detail", faces=("east",))
    body.box((9.56, 7.85, -1.6), (9.6, 8.6, 0.0), "metal", faces=("east",))
    body.box((9.5, 7.35, 0.7), (9.75, 7.65, 1.4), "detail")  # brass deflector bump
    # left-side charging handle slot
    body.box((6.42, 8.35, -8.6), (6.5, 8.85, -3.0), "detail", faces=("west",))
    # right side accessory rail (front)
    body.box((9.5, 7.75, -10.7), (9.8, 8.85, -7.4), "detail")
    z = -10.5
    while z + 0.5 <= -7.5:
        body.box((9.8, 7.65, z), (10.0, 8.95, z + 0.5), "detail")
        z += 1.0
    # bottom rail under the upper's nose (for foregrips)
    rail_bot = picatinny(body, 7.0, -10.9, -8.2, width=1.6, top=False)

    # ---------------------------------------------------------------- lower housing ("stacked" block)
    body.box((6.6, WELL_Y, -5.95), (9.4, 7.0, -2.6), "receiver")  # magazine / mechanism housing
    body.box((6.6, 2.6, -8.6), (9.4, 7.0, -5.6), "receiver", rot=NOSE_ROT)  # raked nose
    body.box((6.55, 2.6, -8.65), (9.45, 3.3, -8.4), "detail", rot=NOSE_ROT)  # nose bumper
    body.box((6.7, 5.0, -2.6), (9.3, 7.0, 5.0), "receiver")  # trigger housing / rear lower
    body.box((6.75, 4.6, 2.6), (9.25, 5.05, 5.0), "receiver")  # rear lower lip
    for x0, x1 in ((9.4, 9.45), (6.55, 6.6)):  # angular grey insert panels on the housing
        body.box((x0, 4.2, -5.5), (x1, 6.5, -2.9), "accent")
    body.box((9.4, 3.0, -8.0), (9.45, 6.95, -7.7), "detail", rot=NOSE_ROT, faces=("east",))  # chevron
    body.box((6.55, 3.0, -8.0), (6.6, 6.95, -7.7), "detail", rot=NOSE_ROT, faces=("west",))
    body.box((6.5, WELL_Y - 0.35, MAG_Z0 - 0.35), (9.5, WELL_Y, MAG_Z1 + 0.4), "detail")  # mag well lip
    body.box((9.4, 4.0, MAG_Z1 + 0.6), (9.7, 4.6, MAG_Z1 + 1.2), "detail")  # mag release (right)
    body.box((6.3, 4.0, MAG_Z1 + 0.6), (6.6, 4.6, MAG_Z1 + 1.2), "detail")  # mag release (left)
    for z in (-6.0, -1.2, 2.2, 4.2):  # pins
        body.box((9.3, 6.2, z), (9.42, 6.55, z + 0.35), "metal")
        body.box((6.58, 6.2, z), (6.7, 6.55, z + 0.35), "metal")
    # ambidextrous selector + bolt release
    body.box((9.3, 6.3, 1.3), (9.6, 6.9, 2.4), "detail")
    body.box((6.4, 6.3, 1.3), (6.7, 6.9, 2.4), "detail")
    body.box((6.4, 6.35, -0.3), (6.7, 6.85, 0.6), "detail")
    # angular trigger guard
    body.box((7.55, 3.6, -2.7), (8.45, 4.1, 1.3), "receiver")  # bottom (from the mag well to the grip)
    body.box((7.6, 3.9, -2.75), (8.4, 4.3, -2.55), "detail")  # guard / housing joint
    body.box((7.75, 3.95, -1.1), (8.25, 5.05, -0.65), "metal",
             rot={"origin": (8, 5.0, -0.85), "axis": "x", "angle": -10})  # trigger
    # pistol grip with texture panels and folding grip safety
    body.box((6.95, 0.9, 0.7), (9.05, 5.3, 2.95), "furniture", rot=GRIP_ROT)
    body.box((6.9, 0.6, 0.6), (9.1, 1.0, 3.1), "detail", rot=GRIP_ROT)  # grip cap
    body.box((7.0, 1.5, 0.4), (9.0, 4.4, 0.75), "furniture", rot=GRIP_ROT)  # finger swell
    for x0, x1 in ((9.05, 9.1), (6.9, 6.95)):
        body.box((x0, 1.4, 1.05), (x1, 4.3, 2.6), "accent", rot=GRIP_ROT)  # stippled panel
    body.box((7.4, 2.5, 2.95), (8.6, 4.7, 3.3), "detail", rot=GRIP_ROT)  # grip safety paddle
    body.box((7.6, 4.7, 2.9), (8.4, 5.0, 3.25), "metal", rot=GRIP_ROT)  # safety hinge
    # flip-up sights
    body.box((7.2, rail_top, -10.7), (8.8, rail_top + 0.45, -9.6), "detail")
    body.box((7.85, rail_top + 0.45, -10.4), (8.15, rail_top + 1.65, -10.0), "detail")  # front post
    body.box((7.3, rail_top + 0.45, -10.45), (7.55, rail_top + 1.5, -9.95), "detail")  # ears
    body.box((8.45, rail_top + 0.45, -10.45), (8.7, rail_top + 1.5, -9.95), "detail")
    body.box((7.2, rail_top, 3.0), (8.8, rail_top + 0.45, 4.2), "detail")  # rear base
    body.box((7.35, rail_top + 0.45, 3.4), (7.7, rail_top + 1.9, 3.75), "detail")  # aperture frame
    body.box((8.3, rail_top + 0.45, 3.4), (8.65, rail_top + 1.9, 3.75), "detail")
    body.box((7.35, rail_top + 1.6, 3.4), (8.65, rail_top + 1.9, 3.75), "detail")
    body.box((7.35, rail_top + 0.45, 3.4), (8.65, rail_top + 1.15, 3.75), "detail")
    # stock adaptor + hinge
    body.box((7.0, 6.4, 5.0), (9.0, 9.3, 6.2), "receiver")
    body.box((9.0, 6.6, 5.2), (9.3, 7.6, 6.0), "metal")  # hinge knuckle (right)
    body.box((7.3, 5.9, 5.3), (8.7, 6.4, 5.9), "detail")  # sling / charm loop

    # ---------------------------------------------------------------- charging handle (left, reciprocates)
    ch = w.part("charging_handle", animated=True)
    ch.box((6.2, 8.4, -8.5), (6.45, 8.8, -7.4), "detail")
    ch.box((5.6, 8.25, -8.4), (6.2, 8.95, -7.5), "detail")  # knob
    ch.box((5.5, 8.35, -8.3), (5.6, 8.85, -7.6), "metal")

    # ---------------------------------------------------------------- barrels
    def barrel(vid, tip, shroud=None):
        b = w.variant("barrel", vid)
        b.octo_rod(8, 8, tip + 0.6, -11.4, 1.15, "metal")
        b.octo_rod(8, 8, tip, tip + 0.7, 1.45, "detail")  # thread protector
        b.box((7.3, 7.3, -11.75), (8.7, 8.7, -11.4), "detail")  # barrel nut
        if shroud:
            z0 = shroud
            b.box((6.9, 6.9, z0), (9.1, 9.1, -11.4), "receiver")  # square shroud
            b.box((7.1, 9.1, z0 + 0.2), (8.9, 9.35, -11.6), "receiver")  # top ridge
            z = z0 + 0.6
            while z + 0.9 < -11.8:
                for x0, x1 in ((9.1, 9.15), (6.85, 6.9)):
                    b.box((x0, 7.5, z), (x1, 8.5, z + 0.9), "detail")  # vent slots
                b.box((7.5, 6.85, z), (8.5, 6.9, z + 0.9), "detail")
                z += 1.4
            b.box((6.8, 6.8, z0 - 0.3), (9.2, 9.2, z0), "detail")  # shroud end cap
        w.muzzle_by_barrel[vid] = (8, 8, tip)
        return b

    barrel("default", -13.4)
    barrel(f"{NS}:short_barrel", -12.0)
    barrel(f"{NS}:precision_barrel", -17.9, shroud=-17.0)

    # ---------------------------------------------------------------- stocks
    s = w.variant("stock", "default")  # folding skeleton stock
    s.box((7.2, 8.4, 6.2), (8.8, 9.3, 13.6), "furniture")  # top strut
    s.box((7.2, 5.9, 6.2), (8.8, 6.7, 13.4), "furniture",
          rot={"origin": (8, 6.7, 6.2), "axis": "x", "angle": 10})  # lower strut (angled)
    s.box((7.05, 6.4, 6.2), (8.95, 9.3, 7.4), "furniture")  # hinge block
    s.box((7.1, 4.6, 13.0), (8.9, 9.6, 14.0), "furniture")  # butt frame
    s.box((7.0, 4.4, 14.0), (9.0, 9.8, 14.5), "detail")  # rubber pad
    s.box((7.25, 8.9, 9.0), (8.75, 9.8, 12.4), "furniture")  # cheek rest
    s.box((7.3, 6.0, 10.2), (8.7, 8.4, 10.9), "furniture")  # web strut
    s.box((8.8, 8.6, 7.6), (8.85, 9.1, 12.8), "accent")  # grey inlay line (right)
    s.box((7.15, 8.6, 7.6), (7.2, 9.1, 12.8), "accent")
    s = w.variant("stock", f"{NS}:lightweight_stock")  # minimalist strut stock
    s.box((7.4, 8.3, 6.2), (8.6, 9.1, 13.4), "furniture")
    s.box((7.4, 6.4, 6.2), (8.6, 7.1, 13.2), "furniture",
          rot={"origin": (8, 7.1, 6.2), "axis": "x", "angle": 9})
    s.box((7.3, 5.0, 12.8), (8.7, 9.3, 13.5), "furniture")
    s.box((7.2, 4.8, 13.5), (8.8, 9.5, 13.9), "detail")
    s.box((7.5, 6.4, 6.2), (8.5, 9.1, 6.9), "metal")  # adaptor collar
    s = w.variant("stock", f"{NS}:precision_stock")  # adjustable solid stock
    s.box((7.0, 5.6, 6.2), (9.0, 9.2, 13.8), "furniture")
    s.box((7.1, 4.4, 9.5), (8.9, 5.7, 13.8), "furniture",
          rot={"origin": (8, 5.6, 13.8), "axis": "x", "angle": 16})  # lower toe
    s.box((7.15, 9.2, 8.2), (8.85, 10.1, 12.6), "furniture")  # cheek riser
    s.box((7.7, 9.0, 8.8), (8.3, 9.25, 9.4), "metal")
    s.box((7.7, 9.0, 11.4), (8.3, 9.25, 12.0), "metal")
    s.box((6.9, 3.8, 13.8), (9.1, 9.6, 14.6), "detail")  # recoil pad
    s.box((8.95, 6.4, 7.0), (9.05, 8.6, 12.6), "accent")  # side panels
    s.box((6.95, 6.4, 7.0), (7.05, 8.6, 12.6), "accent")

    # ---------------------------------------------------------------- magazines (straight, in front of the guard)
    def glock_mag(m, bottom, base_extra=0.0):
        m.box((7.25, bottom, MAG_Z0), (8.75, 6.6, MAG_Z1), "mag")
        m.box((7.55, 6.6, MAG_Z0 + 0.3), (8.45, 6.9, MAG_Z1 - 0.5), "brass")  # top round
        m.box((7.15, bottom - 0.45 - base_extra, MAG_Z0 - 0.15), (8.85, bottom, MAG_Z1 + 0.2), "mag")  # base plate
        m.box((8.75, bottom + 0.4, MAG_Z1 - 0.6), (8.8, WELL_Y - 0.4, MAG_Z1 - 0.3), "detail", faces=("east",))  # witness
        m.box((7.2, bottom + 0.4, MAG_Z1 - 0.6), (7.25, WELL_Y - 0.4, MAG_Z1 - 0.3), "detail", faces=("west",))
        return m

    glock_mag(w.variant("magazine", "default"), 1.2)
    ext = glock_mag(w.variant("magazine", f"{NS}:extended_mag"), -2.6)
    for y in (-1.6, -0.2, 1.2):  # ribs on the long stick mag
        ext.box((7.2, y, MAG_Z0 + 0.2), (8.8, y + 0.3, MAG_Z1 - 0.2), "mag")
    q = glock_mag(w.variant("magazine", f"{NS}:quick_mag"), 1.2, base_extra=0.25)
    q.box((7.0, 0.35, MAG_Z0 - 0.35), (9.0, 0.6, MAG_Z1 + 0.35), "detail")  # flared base
    q.box((7.7, -0.65, MAG_Z0 + 0.7), (8.3, 0.35, MAG_Z1 - 0.7), "shell")  # pull tab
    q.box((7.55, -0.95, MAG_Z0 + 0.55), (8.45, -0.6, MAG_Z1 - 0.55), "shell")

    # ---------------------------------------------------------------- metadata
    mz = (MAG_Z0 + MAG_Z1) / 2
    w.anim = {
        "magazine": {"pivot": [8, 6.6, mz], "style": "drop"},
        "charging_handle": {"travel": [0, 0, 4.0]},
    }
    w.points = {
        "grip": rot_pt(GRIP_ROT, 2.8, 1.9),
        "support": (8, 5.2, -9.4),
        "ejection": (9.55, 8.25, -0.8),
        "mag_well": (8, WELL_Y, mz),
    }
    w.iron_sight_y = round(rail_top + 1.4, 3)
    w.iron_sight_z = 3.55
    w.mounts = {
        "optic": (8, rail_top, -0.6),
        "grip": (8, rail_bot, -9.55),
        "tactical": (9.8, 8.3, -9.1),
        "charm": (8, 5.9, 5.6),
    }
    w.slots = {
        "optic": [f"{NS}:red_dot", f"{NS}:holo_sight"],
        "muzzle": [f"{NS}:suppressor", f"{NS}:compensator", f"{NS}:flash_hider"],
        "grip": [f"{NS}:vertical_grip", f"{NS}:angled_grip", f"{NS}:ergonomic_grip"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
