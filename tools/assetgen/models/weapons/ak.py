"""AK-Style Rifle - stamped receiver, ribbed dust cover, wood furniture and a rock-in banana magazine.

Layout (model units): bore axis at x=8, y=8; muzzle toward -z. Receiver z -4..10 (dust cover on
top, rail section for optics), rear sight block z -6..-3.8, wooden handguards z -14.7..-6, gas tube
above the barrel at y 9.7 into the gas block at z -17.6..-16. Barrel variants carry the front sight
tower. The magazine rocks in around the front lug at its front-top edge (z = MAG_Z0).
"""
import copy
import math

from ccmodel import Part, Weapon
from weapons.common import ALL_CHARMS, accent_strip, picatinny

NS = "calibercraft"

GAS_Y = 9.7
GRIP_ANGLE = -20.0
GRIP_ORIGIN = (8.0, 5.6, 7.2)
GRIP_ROT = {"origin": GRIP_ORIGIN, "axis": "x", "angle": GRIP_ANGLE}
STOCK_ROT = {"origin": (8.0, 9.2, 10.0), "axis": "x", "angle": 8}  # drop toward the butt
MAG_Z0, MAG_Z1 = 1.0, 3.6
MAG_TOP = 6.4


def rot_pt(rot, y, z, x=8.0):
    a = math.radians(rot["angle"])
    oy, oz = rot["origin"][1], rot["origin"][2]
    dy, dz = y - oy, z - oz
    return (round(x, 3), round(oy + dy * math.cos(a) - dz * math.sin(a), 3),
            round(oz + dy * math.sin(a) + dz * math.cos(a), 3))


def banana(m, x0, x1, segs, ribs=True):
    """Curved magazine body from MAG_TOP downward; each segment rotates about the previous bottom centre."""
    y, zc = MAG_TOP, (MAG_Z0 + MAG_Z1) / 2
    half = (MAG_Z1 - MAG_Z0) / 2
    ang = 0.0
    for i, (length, ang) in enumerate(segs):
        rot = None if ang == 0 else {"origin": (8, y, zc), "axis": "x", "angle": ang}
        ext = 0.35 if i > 0 else 0.0
        m.box((x0, y - length, zc - half), (x1, y + ext, zc + half), "mag", rot=rot)
        if ribs:  # pressed reinforcement ribs on both flanks
            m.box((x1, y - length + 0.25, zc - 0.25), (x1 + 0.06, y - 0.1, zc + 0.25), "mag", rot=rot)
            m.box((x0 - 0.06, y - length + 0.25, zc - 0.25), (x0, y - 0.1, zc + 0.25), "mag", rot=rot)
        a = math.radians(ang)
        y, zc = y - length * math.cos(a), zc - length * math.sin(a)
    rot = {"origin": (8, y, zc), "axis": "x", "angle": ang}
    m.box((x0 - 0.12, y - 0.4, zc - half - 0.15), (x1 + 0.12, y + 0.05, zc + half + 0.2), "detail", rot=rot)  # floor plate
    # front hook lug, rear catch lug, top cartridge
    m.box((x0 + 0.2, MAG_TOP - 0.7, MAG_Z0 - 0.3), (x1 - 0.2, MAG_TOP, MAG_Z0), "mag")
    m.box((x0 + 0.3, MAG_TOP - 1.0, MAG_Z1), (x1 - 0.3, MAG_TOP - 0.5, MAG_Z1 + 0.25), "mag")
    m.box((7.55, MAG_TOP, MAG_Z0 + 0.4), (8.45, MAG_TOP + 0.3, MAG_Z1 - 0.5), "brass")
    return y, zc


def centre_z(segs, y_query):
    """z of the banana magazine's centre line at height y_query (linear along each segment)."""
    y, zc = MAG_TOP, (MAG_Z0 + MAG_Z1) / 2
    for length, ang in segs:
        a = math.radians(ang)
        y1, z1 = y - length * math.cos(a), zc - length * math.sin(a)
        if y1 <= y_query <= y:
            t = (y - y_query) / (y - y1)
            return zc + (z1 - zc) * t
        y, zc = y1, z1
    return zc


def build():
    w = Weapon("ak", "rifle")
    w.standard = {"receiver": "blued_steel", "furniture": "walnut_wood", "metal": "blued_steel",
                  "detail": "dark_steel", "mag": "dark_steel", "accent": "gunmetal"}

    body = w.part("body")
    # ---------------------------------------------------------------- stamped receiver
    body.box((6.7, 5.6, -4.0), (9.3, 9.2, 10.0), "receiver")
    body.box((6.65, 5.5, -4.0), (9.35, 5.75, 10.0), "receiver")  # bottom flange
    for x0, x1, face in ((9.3, 9.36, "east"), (6.64, 6.7, "west")):
        for (y, z) in ((6.2, -3.4), (8.5, -3.4), (6.2, -2.5), (8.5, -2.5), (6.4, 8.9), (8.4, 9.3), (6.9, 9.6)):
            body.box((x0, y, z), (x1, y + 0.3, z + 0.3), "metal", faces=(face, "up", "down", "north", "south"))  # rivets
        body.box((x0, 6.0, 1.5), (x1, 6.9, 3.1), "detail", faces=(face,))  # magazine guide dimple
        for z in (5.4, 7.6):  # trigger / hammer pin bushings
            body.box((x0, 6.6, z), (x1, 7.0, z + 0.4), "metal", faces=(face,))
    # ribbed dust cover + rail
    body.box((6.85, 9.2, -3.6), (9.15, 9.9, 10.0), "receiver")
    body.box((7.2, 9.9, -3.6), (8.8, 10.15, 10.0), "receiver")
    for z in (-2.9, 8.2, 9.2):
        body.box((7.05, 9.9, z), (8.95, 10.2, z + 0.35), "receiver")  # stamped cross ribs
    body.box((7.7, 8.9, 10.0), (8.3, 9.5, 10.35), "detail")  # recoil spring guide button
    rail_top = picatinny(body, 10.15, 0.0, 7.4, width=1.5)
    # ejection port + selector lever (right side)
    body.box((9.3, 8.0, -1.6), (9.36, 9.15, 3.1), "detail", faces=("east",))
    body.box((9.36, 8.85, 2.0), (9.5, 9.15, 8.3), "detail")  # long safety lever
    body.box((9.36, 7.9, 7.5), (9.55, 9.15, 8.3), "detail")  # lever finger tab
    body.box((9.36, 8.75, 7.7), (9.46, 9.0, 8.1), "metal")  # lever pivot
    # rear sight block + tangent leaf
    body.box((7.0, 8.4, -6.0), (9.0, 10.3, -3.8), "receiver")
    body.box((7.15, 10.3, -5.6), (8.85, 10.55, -3.9), "detail")  # leaf base
    body.box((7.2, 10.55, -5.5), (8.8, 10.75, -4.0), "detail")  # leaf
    body.box((7.2, 10.75, -4.35), (7.8, 11.45, -4.0), "detail")  # notch ears
    body.box((8.2, 10.75, -4.35), (8.8, 11.45, -4.0), "detail")
    body.box((7.8, 10.75, -4.35), (8.2, 11.1, -4.0), "detail")
    body.box((8.85, 10.45, -5.2), (9.05, 10.8, -4.5), "metal")  # range slider
    # magazine well opening, mag catch, trigger guard, trigger
    body.box((6.9, 5.3, MAG_Z0 - 0.3), (9.1, 5.6, MAG_Z1 + 0.3), "detail")
    body.box((7.55, 4.5, MAG_Z1 + 0.35), (8.45, 5.5, MAG_Z1 + 0.75), "detail")  # mag catch paddle
    body.box((7.6, 3.75, MAG_Z1 + 0.75), (8.4, 5.5, MAG_Z1 + 1.1), "receiver")  # guard front
    body.box((7.6, 3.6, MAG_Z1 + 0.75), (8.4, 3.95, 8.3), "receiver")  # guard bottom
    body.box((7.75, 4.2, 5.6), (8.25, 5.6, 6.05), "metal",
             rot={"origin": (8, 5.6, 5.8), "axis": "x", "angle": -12})  # trigger
    # wooden pistol grip
    body.box((6.95, 0.6, 7.2), (9.05, 5.7, 9.4), "furniture", rot=GRIP_ROT)
    body.box((7.0, 0.3, 7.1), (9.0, 0.7, 9.6), "furniture", rot=GRIP_ROT)  # flared heel
    body.box((7.35, 1.4, 6.95), (8.65, 4.4, 7.25), "furniture", rot=GRIP_ROT)  # front swell
    for x0, x1 in ((9.05, 9.1), (6.9, 6.95)):
        for y in (1.2, 1.8, 2.4, 3.0, 3.6):
            body.box((x0, y, 7.5), (x1, y + 0.18, 9.1), "detail", rot=GRIP_ROT)  # grip grooves
    body.box((7.7, 0.3, 7.8), (8.3, 0.35, 8.8), "metal", rot=GRIP_ROT, faces=("down",))  # grip screw

    # ---------------------------------------------------------------- gas system + wood handguards
    body.octo_rod(8, GAS_Y, -16.0, -6.0, 1.0, "receiver")  # gas tube
    body.box((7.3, 7.2, -17.6), (8.7, 10.3, -16.0), "receiver")  # gas block
    body.box((7.4, 8.4, -17.9), (8.6, 9.3, -17.6), "receiver",
             rot={"origin": (8, 8.4, -17.6), "axis": "x", "angle": -40})  # angled gas port
    body.box((7.6, 6.5, -17.4), (8.4, 7.2, -16.4), "detail")  # sling swivel lug
    body.box((7.75, 5.8, -17.2), (8.25, 6.5, -16.6), "detail")
    body.box((7.15, 9.1, -14.0), (8.85, 10.45, -6.4), "furniture")  # upper handguard
    body.box((7.35, 10.45, -13.8), (8.65, 10.6, -6.6), "furniture")
    for x0, x1 in ((8.85, 8.9), (7.1, 7.15)):
        body.box((x0, 9.45, -12.6), (x1, 9.95, -10.6), "detail")  # vent slots
        body.box((x0, 9.45, -9.6), (x1, 9.95, -7.6), "detail")
    body.box((7.1, 9.0, -6.4), (8.9, 10.5, -6.0), "metal")  # upper handguard retainer
    body.box((6.6, 6.1, -14.2), (9.4, 9.0, -6.4), "furniture")  # lower handguard
    body.box((6.8, 5.85, -13.9), (9.2, 6.1, -6.6), "furniture")  # rounded belly
    for x0, x1 in ((9.4, 9.5), (6.5, 6.6)):
        body.box((x0, 6.5, -12.2), (x1, 8.3, -8.0), "furniture")  # palm swells
    body.box((6.5, 6.0, -14.7), (9.5, 9.15, -14.2), "metal")  # front ferrule
    body.box((6.5, 6.0, -6.4), (9.5, 9.15, -6.0), "metal")  # rear retainer
    body.box((6.6, 8.4, -6.0), (9.4, 9.0, -4.0), "receiver")  # front trunnion top
    accent_strip(body, 6.6, 9.4, 8.55, 8.7, -13.8, -6.8)
    # modern add-on rails: short bottom rail + right side rail on the lower handguard
    rail_bot = picatinny(body, 5.85, -13.0, -8.4, width=1.4, top=False)
    body.box((9.5, 6.9, -12.6), (9.75, 8.3, -9.4), "detail")
    z = -12.45
    while z + 0.5 <= -9.5:
        body.box((9.75, 6.8, z), (9.9, 8.4, z + 0.5), "detail")
        z += 1.0

    body.box((6.85, 5.6, 10.0), (9.15, 9.2, 10.6), "detail")  # rear trunnion / stock tang

    # ---------------------------------------------------------------- charging handle (right side of the carrier)
    ch = w.part("charging_handle", animated=True)
    ch.box((9.2, 8.2, -1.3), (9.34, 9.05, 2.6), "metal", faces=("east", "up", "down", "north", "south"))  # carrier
    ch.box((9.3, 8.35, -1.25), (10.0, 8.85, -0.55), "metal")  # handle stem
    ch.box((10.0, 8.25, -1.35), (10.6, 8.95, -0.45), "metal")  # knob

    # ---------------------------------------------------------------- barrels (front sight tower lives on the barrel)
    def front_sight(b, z0, z1, y_base=9.3):
        b.box((7.3, 7.2, z0), (8.7, y_base, z1), "receiver")  # sight block
        b.box((7.0, y_base, z0 + 0.15), (7.35, 11.75, z1 - 0.3), "receiver")  # protective ears
        b.box((8.65, y_base, z0 + 0.15), (9.0, 11.75, z1 - 0.3), "receiver")
        b.box((7.85, y_base, z0 + 0.45), (8.15, 11.45, z0 + 0.75), "detail")  # post
        b.box((7.6, 6.6, z0 + 0.2), (8.4, 7.2, z1 - 0.2), "detail")  # bayonet lug / rod catch

    def barrel(vid, tip, d=1.2, sight_at=None, krink=False):
        b = w.variant("barrel", vid)
        if sight_at is not None:
            b.rod(8, 6.75, sight_at + 0.6, -14.7, 0.35, "metal")  # cleaning rod
        b.octo_rod(8, 8, tip + 0.9, -4.0, d, "metal")
        b.octo_rod(8, 8, tip, tip + 1.0, d + 0.3, "detail")  # thread protector
        b.box((8.0 + (d + 0.3) / 2, 7.85, tip + 1.0), (8.0 + (d + 0.3) / 2 + 0.15, 8.15, tip + 1.6), "metal")  # detent
        if sight_at is not None:
            front_sight(b, sight_at, sight_at + 1.6)
        if krink:  # sight tower combined with the gas block
            b.box((7.0, 10.3, -17.4), (7.35, 11.75, -16.3), "receiver")
            b.box((8.65, 10.3, -17.4), (9.0, 11.75, -16.3), "receiver")
            b.box((7.85, 10.3, -17.1), (8.15, 11.45, -16.8), "detail")
        w.muzzle_by_barrel[vid] = (8, 8, tip)
        return b

    barrel("default", -24.0, sight_at=-22.9)
    barrel(f"{NS}:short_barrel", -19.6, krink=True)
    hb = barrel(f"{NS}:heavy_barrel", -26.6, d=1.6, sight_at=-25.5)
    hb.box((7.0, 6.8, -21.0), (9.0, 9.0, -20.2), "detail")  # bipod clamp ring
    hb.box((7.4, 6.2, -20.9), (8.6, 6.8, -20.3), "detail")

    # ---------------------------------------------------------------- stock variants
    s = w.variant("stock", "default")  # classic dropped wooden stock
    s.box((6.9, 5.6, 10.6), (9.1, 9.2, 20.0), "furniture", rot=STOCK_ROT)
    s.box((6.95, 5.6, 10.6), (9.05, 7.4, 19.85), "furniture",
          rot={"origin": (8, 5.6, 10.6), "axis": "x", "angle": 12})  # deepening belly line
    s.box((6.8, 4.75, 19.9), (9.2, 9.3, 20.4), "detail", rot=STOCK_ROT)  # steel butt plate
    s.box((6.8, 5.6, 16.6), (6.9, 6.6, 17.8), "metal", rot=STOCK_ROT)  # sling loop (left)
    s.box((9.1, 6.4, 19.0), (9.15, 9.0, 19.9), "detail", rot=STOCK_ROT)  # butt-plate screw strap
    s = w.variant("stock", f"{NS}:lightweight_stock")  # skeleton side-folder
    s.box((7.3, 8.3, 10.6), (8.7, 9.1, 19.4), "metal")  # top tube
    s.box((7.3, 5.4, 10.6), (8.7, 6.0, 19.4), "metal",
          rot={"origin": (8, 6.0, 10.6), "axis": "x", "angle": 6})  # lower tube
    s.box((7.2, 4.0, 19.0), (8.8, 9.3, 19.8), "metal")  # butt frame
    s.box((7.1, 3.8, 19.8), (8.9, 9.5, 20.2), "detail")
    s.box((7.2, 5.6, 10.6), (8.8, 9.2, 11.4), "detail")  # hinge block
    s.box((8.8, 6.2, 10.8), (9.2, 7.4, 11.2), "metal")  # hinge pin
    s = w.variant("stock", f"{NS}:precision_stock")  # adjustable polymer-look stock (wood furniture role)
    s.box((7.5, 7.4, 10.6), (8.5, 8.6, 14.0), "metal")  # buffer tube adaptor
    s.box((6.9, 5.2, 13.0), (9.1, 9.4, 20.0), "furniture")
    s.box((7.0, 3.6, 15.6), (9.0, 5.4, 20.0), "furniture",
          rot={"origin": (8, 5.4, 20.0), "axis": "x", "angle": 12})
    s.box((7.05, 9.4, 14.2), (8.95, 10.3, 18.6), "furniture")  # cheek riser
    s.box((7.7, 9.1, 14.8), (8.3, 9.45, 15.4), "metal")
    s.box((7.7, 9.1, 17.4), (8.3, 9.45, 18.0), "metal")
    s.box((6.8, 3.0, 20.0), (9.2, 9.6, 20.6), "detail")  # recoil pad
    s.box((7.6, 4.6, 13.4), (8.4, 5.2, 14.4), "detail")  # adjustment latch

    # ---------------------------------------------------------------- magazines (rock-in banana)
    segs = [(2.3, 0), (1.9, 9), (1.9, 18), (1.9, 27), (1.6, 35)]
    banana(w.variant("magazine", "default"), 7.25, 8.75, segs)
    banana(w.variant("magazine", f"{NS}:extended_mag"), 7.25, 8.75,
           [(2.3, 0), (1.9, 7), (1.9, 14), (1.9, 21), (1.9, 28), (1.9, 35), (1.5, 41)])
    q = w.variant("magazine", f"{NS}:quick_mag")
    banana(q, 7.25, 8.75, segs)
    # jungle style: a spare magazine taped alongside, upside down (mirrored in y), feed lips down
    spare = Part("spare")
    banana(spare, 7.25, 8.75, segs, ribs=False)
    cy = 1.25
    for bx in spare.boxes:
        nb = copy.deepcopy(bx)
        nb.frm = (bx.frm[0] - 1.6, 2 * cy - bx.to[1], bx.frm[2])
        nb.to = (bx.to[0] - 1.6, 2 * cy - bx.frm[1], bx.to[2])
        if bx.rot is not None:
            o = bx.rot["origin"]
            nb.rot = {"origin": (o[0] - 1.6, 2 * cy - o[1], o[2]), "axis": "x", "angle": -bx.rot["angle"]}
        q.boxes.append(nb)
    half = (MAG_Z1 - MAG_Z0) / 2
    for yt in (2.2, 0.2):  # tape wraps around both magazines where they cross
        zs = [centre_z(segs, yt), centre_z(segs, 2 * cy - yt)]
        q.box((5.55, yt - 0.35, min(zs) - half - 0.12), (8.9, yt + 0.35, max(zs) + half + 0.12), "detail")

    # ---------------------------------------------------------------- metadata
    w.anim = {
        "magazine": {"pivot": [8, MAG_TOP, MAG_Z0], "style": "rock"},
        "charging_handle": {"travel": [0, 0, 4.5]},
    }
    w.points = {
        "grip": rot_pt(GRIP_ROT, 3.0, 8.3),
        "support": (8, 6.4, -10.2),
        "ejection": (9.35, 8.6, 0.8),
        "mag_well": (8, 5.3, (MAG_Z0 + MAG_Z1) / 2),
    }
    w.iron_sight_y = 11.3
    w.iron_sight_z = -4.2
    w.mounts = {
        "optic": (8, rail_top, 3.8),
        "grip": (8, rail_bot, -10.7),
        "tactical": (9.9, 7.6, -11.0),
        "charm": (8, 5.8, -16.9),  # front sling swivel under the gas block
    }
    w.slots = {
        "optic": [f"{NS}:red_dot", f"{NS}:holo_sight", f"{NS}:acog_scope"],
        "muzzle": [f"{NS}:suppressor", f"{NS}:compensator", f"{NS}:muzzle_brake"],
        "grip": [f"{NS}:vertical_grip", f"{NS}:angled_grip"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
