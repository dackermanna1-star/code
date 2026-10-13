"""M9 Tactical - full-size 9mm service pistol (open-top slide, exposed barrel, railed dust cover).

Layout (model units): bore axis at x=8, y=8; muzzle toward -z (crown at z=-7.45). The slide spans
z -7.3..7.0 and rides on the frame top (y=6.9). The grip is tilted back 16 degrees; everything that
lives in the grip (panels, magazine) shares GRIP_ROT so it stays aligned.
"""
import math

from ccmodel import Weapon
from weapons.common import ALL_CHARMS, picatinny

NS = "calibercraft"

GRIP_ANGLE = -16.0
GRIP_ORIGIN = (8.0, 5.7, 2.2)
GRIP_ROT = {"origin": GRIP_ORIGIN, "axis": "x", "angle": GRIP_ANGLE}


def grip_pt(y, z, x=8.0):
    """Model-space position of a point given in grip-local (unrotated) coordinates."""
    a = math.radians(GRIP_ANGLE)
    dy, dz = y - GRIP_ORIGIN[1], z - GRIP_ORIGIN[2]
    return (round(x, 3), round(GRIP_ORIGIN[1] + dy * math.cos(a) - dz * math.sin(a), 3),
            round(GRIP_ORIGIN[2] + dy * math.sin(a) + dz * math.cos(a), 3))


def build():
    w = Weapon("m9", "pistol")
    w.standard = {"receiver": "black_anodized", "furniture": "black_polymer", "metal": "stainless",
                  "detail": "dark_steel", "mag": "dark_steel", "accent": "gunmetal"}

    body = w.part("body")
    # ---------------------------------------------------------------- frame
    body.box((7.0, 5.7, -5.9), (9.0, 6.9, 7.0), "receiver")  # dust cover + frame rails
    body.box((7.1, 5.85, -6.15), (8.9, 6.8, -5.9), "receiver")  # rounded dust cover nose
    picatinny(body, 5.7, -5.6, -2.75, width=1.5, top=False)  # accessory rail
    body.box((7.0, 5.3, 6.4), (9.0, 6.9, 7.45), "receiver")  # frame tang / backstrap top
    body.box((7.2, 5.6, 7.45), (8.8, 6.6, 7.75), "receiver")  # beavertail lip
    # trigger guard (squared, serrated front)
    body.box((7.55, 4.05, -2.8), (8.45, 5.7, -2.25), "receiver")  # front bow
    body.box((7.55, 3.55, -2.45), (8.45, 4.1, 2.9), "receiver")  # bottom
    body.box((7.55, 3.75, -2.75), (8.45, 4.15, -2.35), "receiver")  # rounded front-bottom corner
    for y in (4.25, 4.6, 4.95, 5.3):
        body.box((7.6, y, -2.8), (8.4, y + 0.15, -2.75), "detail", faces=("north",))  # serrations
    # trigger + trigger bar pin
    body.box((7.75, 4.55, -0.7), (8.25, 5.75, -0.25), "detail",
             rot={"origin": (8.0, 5.7, -0.45), "axis": "x", "angle": -14})
    body.box((9.0, 6.2, -0.75), (9.06, 6.5, -0.45), "metal", faces=("east",))  # trigger pin (right)
    body.box((6.94, 6.2, -0.75), (7.0, 6.5, -0.45), "metal", faces=("west",))
    body.box((9.0, 6.0, 6.6), (9.06, 6.3, 6.9), "metal", faces=("east",))  # hammer pin
    body.box((6.94, 6.0, 6.6), (7.0, 6.3, 6.9), "metal", faces=("west",))
    # left-side controls: slide stop, takedown lever; takedown button on the right
    body.box((6.78, 6.45, -0.6), (7.0, 6.88, 2.3), "detail")  # slide stop
    body.box((6.7, 6.1, 1.5), (7.0, 6.88, 2.3), "detail")  # slide stop thumb tab
    body.box((6.78, 6.05, -2.1), (7.0, 6.75, -1.2), "detail")  # takedown lever
    body.box((9.0, 6.15, -1.9), (9.12, 6.55, -1.45), "detail")  # takedown button
    # exposed hammer (rounded spur)
    hrot = {"origin": (8.0, 6.9, 7.3), "axis": "x", "angle": -18}
    body.box((7.62, 6.6, 6.95), (8.38, 8.55, 7.55), "detail", rot=hrot)
    body.box((7.62, 8.15, 7.15), (8.38, 8.75, 8.15), "detail", rot=hrot)  # spur
    body.box((7.58, 8.25, 7.95), (8.42, 8.65, 8.15), "metal", rot=hrot)  # spur checkering

    # ---------------------------------------------------------------- barrel (static; slide recoils over it)
    body.octo_rod(8, 8, -7.45, 1.1, 1.1, "metal")
    body.box((7.45, 7.45, -0.9), (8.55, 8.62, 1.15), "metal")  # chamber hood (ejection port)
    body.box((7.5, 7.05, 0.0), (8.5, 7.45, 1.1), "detail")  # locking block

    # ---------------------------------------------------------------- grip (tilted)
    body.box((7.05, -0.3, 2.2), (8.95, 5.8, 6.05), "receiver", rot=GRIP_ROT)  # grip frame
    body.box((7.15, -0.45, 2.3), (8.85, -0.3, 5.95), "detail", rot=GRIP_ROT)  # mag well rim
    for xs, face in (((8.95, 9.2), "east"), ((6.8, 7.05), "west")):
        x0, x1 = xs
        body.box((x0, 0.25, 2.55), (x1, 5.05, 5.75), "furniture", rot=GRIP_ROT)  # grip panel
        xo0, xo1 = (x1, x1 + 0.05) if face == "east" else (x0 - 0.05, x0)
        for y in (0.75, 1.35, 1.95, 2.55):
            body.box((xo0, y, 2.85), (xo1, y + 0.22, 5.45), "furniture", rot=GRIP_ROT)  # grip ribs
        body.box((xo0, 3.75, 3.65), (xo1, 4.45, 4.35), "detail", rot=GRIP_ROT)  # medallion
        body.box((xo0, 4.6, 4.95), (xo1, 4.85, 5.2), "metal", rot=GRIP_ROT)  # grip screw
        body.box((xo0, 0.4, 4.95), (xo1, 0.65, 5.2), "metal", rot=GRIP_ROT)
    body.box((7.15, 0.3, 1.95), (8.85, 4.9, 2.25), "receiver", rot=GRIP_ROT)  # front strap
    for y in (0.7, 1.3, 1.9, 2.5, 3.1, 3.7, 4.3):
        body.box((7.3, y, 1.9), (8.7, y + 0.25, 1.95), "detail", rot=GRIP_ROT, faces=("north",))
    body.box((6.55, 0.05, 5.3), (7.05, 0.65, 5.95), "detail", rot=GRIP_ROT)  # lanyard loop
    body.box((6.82, 4.2, 2.3), (7.05, 4.95, 3.0), "detail", rot=GRIP_ROT)  # mag release (left)

    # ---------------------------------------------------------------- slide (animated)
    sl = w.part("slide", animated=True)
    sl.box((6.95, 6.9, 1.15), (9.05, 9.3, 7.0), "receiver")  # rear block
    sl.box((7.1, 9.3, 1.3), (8.9, 9.45, 6.85), "receiver")  # crowned top
    sl.box((6.95, 6.9, -7.3), (9.05, 9.0, -6.5), "receiver")  # front ring (sight bridge)
    sl.box((7.4, 6.9, -6.5), (8.6, 7.3, -5.9), "receiver")  # nose floor
    sl.box((6.95, 6.9, -6.5), (7.4, 8.15, 1.15), "receiver")  # left wall (open-top cut)
    sl.box((8.6, 6.9, -6.5), (9.05, 8.15, -1.0), "receiver")  # right wall
    sl.box((8.6, 6.9, -1.0), (9.05, 7.45, 1.15), "receiver")  # ejection port sill
    sl.box((7.55, 6.95, -7.35), (8.45, 7.4, -7.3), "metal", faces=("north",))  # guide rod tip
    sl.box((9.05, 7.95, 1.2), (9.12, 8.45, 2.7), "detail")  # extractor
    sl.box((7.8, 9.0, -7.1), (8.2, 9.7, -6.55), "detail")  # front sight blade
    sl.box((7.88, 9.42, -7.12), (8.12, 9.6, -7.1), "accent", faces=("south",))  # front sight dot
    sl.box((7.15, 9.45, 5.95), (8.85, 9.6, 6.85), "detail")  # rear sight base
    sl.box((7.15, 9.6, 6.05), (7.7, 9.95, 6.8), "detail")  # rear sight ears
    sl.box((8.3, 9.6, 6.05), (8.85, 9.95, 6.8), "detail")
    sl.box((7.25, 9.45, 2.0), (8.75, 9.5, 4.7), "detail")  # optic-cut cover plate
    for z in (2.25, 4.2):
        sl.box((7.95 - 0.55, 9.5, z), (7.95 - 0.3, 9.53, z + 0.25), "metal")
        sl.box((8.3, 9.5, z), (8.55, 9.53, z + 0.25), "metal")
    z = 4.3
    while z < 6.5:  # rear cocking serrations
        sl.box((9.05, 7.15, z), (9.1, 8.95, z + 0.2), "detail", faces=("east", "up"))
        sl.box((6.9, 7.15, z), (6.95, 8.95, z + 0.2), "detail", faces=("west", "up"))
        z += 0.45
    for x0, x1 in ((9.05, 9.45), (6.55, 6.95)):  # ambidextrous safety / decocker
        sl.box((x0, 8.25, 5.5), (x1, 8.8, 6.75), "detail")
        sl.box((x0, 8.6, 6.15), (x1, 9.25, 6.75), "detail")
    # thin glow strip along the lower slide flanks
    sl.box((9.05, 7.15, 1.4), (9.12, 7.3, 4.1), "accent", glow=True)
    sl.box((6.88, 7.15, 1.4), (6.95, 7.3, 4.1), "accent", glow=True)

    # ---------------------------------------------------------------- barrels: fixed (no variants)
    w.muzzle_by_barrel["default"] = (8, 8, -7.45)

    # ---------------------------------------------------------------- magazines (follow the grip angle)
    def mag(vid, bottom, plate, flare=False):
        m = w.variant("magazine", vid)
        m.box((7.3, bottom, 2.6), (8.7, 5.45, 5.5), "mag", rot=GRIP_ROT)  # body
        m.box((7.25, 5.0, 2.75), (8.75, 5.45, 5.4), "mag", rot=GRIP_ROT)  # feed lips
        m.box((7.6, 5.45, 2.8), (8.4, 5.75, 4.9), "brass", rot=GRIP_ROT)  # top round
        for y in (1.2, 2.2, 3.2, 4.2):
            m.box((8.7, y, 4.95), (8.75, y + 0.3, 5.25), "detail", rot=GRIP_ROT, faces=("east",))  # witness holes
        x0, x1, z0, z1 = plate
        m.box((x0, bottom - 0.35, z0), (x1, bottom + 0.05, z1), "detail", rot=GRIP_ROT)  # base plate
        if flare:
            m.box((x0 - 0.1, bottom - 0.6, z0 - 0.15), (x1 + 0.1, bottom - 0.3, z1 + 0.1), "detail", rot=GRIP_ROT)
        return m

    mag("default", -0.25, (7.1, 8.9, 2.35, 5.85))
    ext = mag(f"{NS}:extended_mag", -2.55, (7.0, 9.0, 2.2, 5.95))
    ext.box((7.08, -2.55, 2.3), (8.92, -0.25, 5.85), "mag", rot=GRIP_ROT)  # +5 extension sleeve
    for y in (-2.0, -1.2):
        ext.box((8.92, y, 2.6), (8.97, y + 0.35, 5.6), "detail", rot=GRIP_ROT, faces=("east",))
        ext.box((7.03, y, 2.6), (7.08, y + 0.35, 5.6), "detail", rot=GRIP_ROT, faces=("west",))
    q = mag(f"{NS}:quick_mag", -0.25, (7.05, 8.95, 2.25, 5.95), flare=True)
    q.box((7.7, -1.85, 3.6), (8.3, -0.85, 4.3), "shell", rot=GRIP_ROT)  # bright pull tab
    q.box((7.55, -2.15, 3.45), (8.45, -1.8, 4.45), "shell", rot=GRIP_ROT)  # tab loop

    # ---------------------------------------------------------------- metadata
    w.anim = {
        "magazine": {"pivot": list(grip_pt(5.45, 4.05)), "style": "drop"},
        "slide": {"travel": [0, 0, 3]},
    }
    w.points = {
        "grip": grip_pt(2.7, 4.1),
        "support": grip_pt(1.6, 3.6, x=6.6),
        "ejection": (9.05, 8.35, 0.1),
        "mag_well": grip_pt(-0.3, 4.05),
    }
    w.iron_sight_y = 9.75
    w.iron_sight_z = 6.4
    w.mounts = {
        "optic": (8, 9.0, 3.3),  # milled optic cut: clamp sits 0.45 into the slide
        "tactical": (9.0, 6.2, -3.9),  # right flank of the railed dust cover
        "charm": grip_pt(0.2, 5.65, x=6.55),
    }
    w.slots = {
        "optic": [f"{NS}:red_dot"],
        "muzzle": [f"{NS}:suppressor", f"{NS}:compensator"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
