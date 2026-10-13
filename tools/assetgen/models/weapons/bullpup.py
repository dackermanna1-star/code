"""Bullpup Rifle - smooth polymer shell, magazine behind the grip, integrated butt.

Layout (model units): bore axis at x=8, y=8; muzzle toward -z. The shell runs from the nose at
z=-10.5 to the butt pad at z=17.2: forend z -10.5..-4 (bottom rail ahead of the full-hand trigger
guard), action z -4..6 (grip at z -3.6..-1.2, magazine well at z 0.6..3.4), stock z 6..16.5 with the
ejection port next to the cheek rest. A full-length top rail carries flip sights and optics.
"""
import math

from ccmodel import Weapon
from weapons.common import ALL_CHARMS, accent_strip, picatinny

NS = "calibercraft"

GRIP_ANGLE = -14.0
GRIP_ORIGIN = (8.0, 5.0, -3.6)
GRIP_ROT = {"origin": GRIP_ORIGIN, "axis": "x", "angle": GRIP_ANGLE}
MAG_Z0, MAG_Z1 = 0.8, 3.2
WELL_Y = 5.0
MAG_TOP = 6.6


def rot_pt(rot, y, z, x=8.0):
    a = math.radians(rot["angle"])
    oy, oz = rot["origin"][1], rot["origin"][2]
    dy, dz = y - oy, z - oz
    return (round(x, 3), round(oy + dy * math.cos(a) - dz * math.sin(a), 3),
            round(oz + dy * math.sin(a) + dz * math.cos(a), 3))


def curved_mag(m, x0, x1, top, segs, plate_role="detail"):
    y, zc = top, (MAG_Z0 + MAG_Z1) / 2
    half = (MAG_Z1 - MAG_Z0) / 2
    ang = 0.0
    for i, (length, ang) in enumerate(segs):
        rot = None if ang == 0 else {"origin": (8, y, zc), "axis": "x", "angle": ang}
        m.box((x0, y - length, zc - half), (x1, y + (0.3 if i else 0.0), zc + half), "mag", rot=rot)
        m.box((x1, y - length + 0.3, zc + half - 0.7), (x1 + 0.05, y - 0.2, zc + half - 0.35), "detail",
              rot=rot, faces=("east",))  # round-count window strip
        a = math.radians(ang)
        y, zc = y - length * math.cos(a), zc - length * math.sin(a)
    rot = {"origin": (8, y, zc), "axis": "x", "angle": ang}
    m.box((x0 - 0.15, y - 0.45, zc - half - 0.2), (x1 + 0.15, y + 0.05, zc + half + 0.2), plate_role, rot=rot)
    return y, zc


def build():
    w = Weapon("bullpup", "rifle")
    w.standard = {"receiver": "od_polymer", "furniture": "od_polymer", "metal": "dark_steel",
                  "detail": "black_polymer", "mag": "grey_polymer", "accent": "black_polymer"}

    body = w.part("body")
    # ---------------------------------------------------------------- polymer shell
    body.box((6.4, 6.4, -10.0), (9.6, 9.6, -4.0), "receiver")  # forend
    body.box((6.6, 6.8, -10.5), (9.4, 9.4, -10.0), "receiver")  # rounded nose
    body.box((6.4, 6.4, -10.5), (9.6, 7.6, -8.6), "receiver",
             rot={"origin": (8, 7.6, -10.5), "axis": "x", "angle": -30})  # chin sweeping into the rail
    body.box((6.4, 5.0, -6.0), (9.6, 9.6, 6.0), "receiver")  # action housing (trigger pack forward)
    body.box((6.4, 5.0, 6.0), (9.6, 9.6, 16.5), "receiver")  # stock section
    body.box((6.45, 3.2, 9.6), (9.55, 5.2, 16.5), "receiver")  # deep butt
    body.box((6.45, 5.0, 6.0), (9.55, 6.8, 10.0), "receiver",
             rot={"origin": (8, 5.0, 6.0), "axis": "x", "angle": 26.6})  # belly sweep behind the mag
    body.box((6.55, 9.6, 7.2), (9.45, 10.15, 15.6), "receiver")  # cheek rest
    body.box((6.7, 10.15, 7.6), (9.3, 10.3, 15.2), "receiver")
    body.box((6.3, 2.9, 16.5), (9.7, 10.4, 17.2), "detail")  # butt pad
    for x0, x1, face in ((9.6, 9.65, "east"), (6.35, 6.4, "west")):  # shell seam / panel lines
        body.box((x0, 6.95, -9.8), (x1, 7.1, 16.3), "detail", faces=(face,))
        for y in (3.9, 4.6, 5.3):  # rubberised butt ribs
            body.box((x0, y, 14.0), (x1, y + 0.35, 15.9), "accent", faces=(face,))
        body.box((x0, 7.9, 10.6), (x1, 8.9, 14.8), "accent", faces=(face,))  # cheek pad
    accent_strip(body, 6.4, 9.6, 6.6, 6.75, -9.6, -4.4)
    # ejection port by the cheek (right) + port cover (left) + brass deflector
    body.box((9.6, 7.5, 5.6), (9.66, 9.05, 8.6), "detail", faces=("east",))
    body.box((9.66, 7.75, 6.0), (9.7, 8.8, 8.0), "metal", faces=("east",))
    body.box((9.6, 7.6, 8.6), (10.0, 9.3, 9.4), "receiver")  # deflector hump
    body.box((6.32, 7.5, 5.6), (6.4, 9.05, 8.6), "detail", faces=("west",))  # closed port cover
    # top rail + flip sights
    rail_top = picatinny(body, 9.6, -10.2, 7.0, width=1.7)
    body.box((7.2, rail_top, -9.9), (8.8, rail_top + 0.45, -8.8), "detail")  # front sight
    body.box((7.85, rail_top + 0.45, -9.6), (8.15, rail_top + 1.6, -9.25), "detail")
    body.box((7.3, rail_top + 0.45, -9.65), (7.55, rail_top + 1.45, -9.2), "detail")
    body.box((8.45, rail_top + 0.45, -9.65), (8.7, rail_top + 1.45, -9.2), "detail")
    body.box((7.2, rail_top, 5.4), (8.8, rail_top + 0.45, 6.6), "detail")  # rear aperture
    body.box((7.35, rail_top + 0.45, 5.8), (7.7, rail_top + 1.85, 6.15), "detail")
    body.box((8.3, rail_top + 0.45, 5.8), (8.65, rail_top + 1.85, 6.15), "detail")
    body.box((7.35, rail_top + 1.55, 5.8), (8.65, rail_top + 1.85, 6.15), "detail")
    body.box((7.35, rail_top + 0.45, 5.8), (8.65, rail_top + 1.1, 6.15), "detail")
    # forend: bottom rail, right side rail, charging handle slot (left), barrel collar
    rail_bot = picatinny(body, 6.4, -10.0, -6.8, width=1.5, top=False)
    body.box((9.6, 7.3, -9.8), (9.8, 8.7, -6.9), "detail")
    z = -9.65
    while z + 0.5 <= -7.0:
        body.box((9.8, 7.2, z), (9.95, 8.8, z + 0.5), "detail")
        z += 1.0
    body.box((6.32, 8.75, -9.0), (6.4, 9.25, -2.6), "detail", faces=("west",))  # charging slot
    body.octo_rod(8, 8, -11.2, -10.5, 2.0, "detail")  # barrel locking collar
    body.box((9.0, 7.6, -11.0), (9.5, 8.4, -10.6), "metal")  # barrel latch button
    # full-hand trigger guard + trigger + cross-bolt safety
    body.box((7.5, 2.2, -6.4), (8.5, 6.45, -5.85), "furniture")  # front post
    body.box((7.5, 1.7, -6.3), (8.5, 2.25, -2.6), "furniture")  # bottom bar
    body.box((7.5, 1.85, -6.45), (8.5, 2.5, -6.05), "furniture")  # rounded corner
    body.box((7.75, 3.9, -5.0), (8.25, 5.05, -4.55), "metal",
             rot={"origin": (8, 5.0, -4.8), "axis": "x", "angle": -10})  # trigger
    body.box((9.6, 5.8, -3.2), (9.85, 6.4, -2.6), "detail")  # safety button (right)
    body.box((6.15, 5.8, -3.2), (6.4, 6.4, -2.6), "detail")  # safety button (left)
    # pistol grip
    body.box((6.95, 0.9, -3.6), (9.05, 5.1, -1.3), "furniture", rot=GRIP_ROT)
    body.box((7.0, 1.6, -3.9), (9.0, 4.4, -3.55), "furniture", rot=GRIP_ROT)  # finger swell
    body.box((6.9, 0.6, -3.7), (9.1, 1.0, -1.15), "detail", rot=GRIP_ROT)  # base
    for x0, x1 in ((9.05, 9.1), (6.9, 6.95)):
        body.box((x0, 1.4, -3.2), (x1, 4.4, -1.7), "accent", rot=GRIP_ROT)  # grip texture
    # magazine well + release, sling points
    body.box((6.9, WELL_Y - 0.3, MAG_Z0 - 0.35), (9.1, WELL_Y, MAG_Z1 + 0.35), "detail")
    body.box((7.5, 4.2, MAG_Z1 + 0.4), (8.5, 5.05, MAG_Z1 + 1.0), "detail")  # mag release paddle
    body.box((7.55, 2.5, 14.3), (8.45, 3.2, 15.1), "detail")  # rear sling loop
    body.box((5.95, 8.0, 15.2), (6.45, 8.8, 16.0), "detail")  # side sling loop (left)

    # ---------------------------------------------------------------- charging handle (left, forward)
    ch = w.part("charging_handle", animated=True)
    ch.box((6.15, 8.7, -8.6), (6.4, 9.3, -7.6), "detail")
    ch.box((5.55, 8.55, -8.5), (6.15, 9.45, -7.7), "detail")  # knob
    ch.box((5.45, 8.7, -8.4), (5.55, 9.3, -7.8), "metal")

    # ---------------------------------------------------------------- barrels
    def barrel(vid, tip, d=1.3, fluted=False):
        b = w.variant("barrel", vid)
        b.octo_rod(8, 8, tip + 0.9, -11.2, d, "metal")
        b.octo_rod(8, 8, tip, tip + 1.0, d + 0.3, "detail")  # thread protector
        b.octo_rod(8, 8, -12.6, -11.2, d + 0.5, "metal")  # gas block ring
        b.box((7.65, 7.0 - d * 0.1, -12.4), (8.35, 7.4 - d * 0.1, -11.4), "detail")  # gas port
        if fluted:
            for (y0, y1) in ((8 + d / 2 - 0.05, 8 + d / 2 + 0.03), (8 - d / 2 - 0.03, 8 - d / 2 + 0.05)):
                b.box((7.7, y0, tip + 1.6), (8.3, y1, -13.0), "detail")
            b.octo_rod(8, 8, tip + 1.0, tip + 1.4, d + 0.4, "detail")  # crown ring
        w.muzzle_by_barrel[vid] = (8, 8, tip)
        return b

    barrel("default", -18.0)
    barrel(f"{NS}:short_barrel", -14.6)
    barrel(f"{NS}:precision_barrel", -21.2, d=1.45, fluted=True)

    # ---------------------------------------------------------------- magazines (behind the grip)
    segs = [(2.6, 0), (2.2, 6), (2.2, 12)]
    m = w.variant("magazine", "default")
    curved_mag(m, 7.15, 8.85, MAG_TOP, segs)
    m.box((7.55, MAG_TOP, MAG_Z0 + 0.35), (8.45, MAG_TOP + 0.3, MAG_Z1 - 0.5), "brass")
    m = w.variant("magazine", f"{NS}:extended_mag")
    curved_mag(m, 7.15, 8.85, MAG_TOP, [(2.6, 0), (2.2, 5), (2.2, 10), (2.2, 15), (1.8, 20)])
    m.box((7.55, MAG_TOP, MAG_Z0 + 0.35), (8.45, MAG_TOP + 0.3, MAG_Z1 - 0.5), "brass")
    q = w.variant("magazine", f"{NS}:quick_mag")
    curved_mag(q, 7.15, 8.85, MAG_TOP, segs)
    q.box((7.55, MAG_TOP, MAG_Z0 + 0.35), (8.45, MAG_TOP + 0.3, MAG_Z1 - 0.5), "brass")
    spare_top = WELL_Y - 0.5
    curved_mag(q, 5.35, 7.05, spare_top, [(1.0, 0), (2.2, 6), (2.2, 12)])
    q.box((5.75, spare_top, MAG_Z0 + 0.35), (6.65, spare_top + 0.3, MAG_Z1 - 0.5), "brass")
    q.box((5.2, 2.2, MAG_Z0 - 0.2), (9.0, 3.3, MAG_Z1 + 0.2), "detail")  # coupler clamp
    q.box((7.7, 0.3, 1.5), (8.3, 0.8, 2.3), "shell",
          rot={"origin": (8, 0.8, 2.0), "axis": "x", "angle": 12})  # pull tab

    # ---------------------------------------------------------------- metadata
    mz = (MAG_Z0 + MAG_Z1) / 2
    w.anim = {
        "magazine": {"pivot": [8, MAG_TOP, mz], "style": "drop"},
        "charging_handle": {"travel": [0, 0, 4.5]},
    }
    w.points = {
        "grip": rot_pt(GRIP_ROT, 3.0, -2.4),
        "support": (8, 6.0, -8.4),
        "ejection": (9.65, 8.3, 7.1),
        "mag_well": (8, WELL_Y - 0.3, mz),
    }
    w.iron_sight_y = round(rail_top + 1.4, 3)
    w.iron_sight_z = 5.95
    w.mounts = {
        "optic": (8, rail_top, 1.4),
        "grip": (8, rail_bot, -8.4),
        "tactical": (9.95, 8.0, -8.3),
        "charm": (8, 2.5, 14.7),
    }
    w.slots = {
        "optic": [f"{NS}:red_dot", f"{NS}:holo_sight", f"{NS}:acog_scope"],
        "muzzle": [f"{NS}:suppressor", f"{NS}:compensator", f"{NS}:flash_hider"],
        "grip": [f"{NS}:vertical_grip", f"{NS}:angled_grip"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
