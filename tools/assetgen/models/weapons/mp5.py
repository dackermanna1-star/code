"""MP5 Tactical - roller-delayed 9mm SMG look: slim stamped receiver, cocking tube, curved magazine.

Layout (model units): bore axis at x=8, y=8; muzzle toward -z. The stamped receiver spans z -3.5..7.5,
the cocking tube runs forward above the barrel to the hooded front sight (z -12.4), the slimline
handguard covers the barrel below it. The polymer trigger group + grip hang under the rear half and
the retractable stock slides on two rails behind the end cap (z 7.5).
"""
import math

from ccmodel import Weapon
from weapons.common import ALL_CHARMS, accent_strip, picatinny

NS = "calibercraft"

TUBE_Y = 9.55  # cocking tube axis height
GRIP_ANGLE = -16.0
GRIP_ORIGIN = (8.0, 5.1, 4.0)
GRIP_ROT = {"origin": GRIP_ORIGIN, "axis": "x", "angle": GRIP_ANGLE}
MAG_Z0, MAG_Z1 = -2.1, -0.2  # magazine fore/aft extent at the top
WELL_Y = 4.7


def rot_pt(rot, y, z, x=8.0):
    a = math.radians(rot["angle"])
    oy, oz = rot["origin"][1], rot["origin"][2]
    dy, dz = y - oy, z - oz
    return (round(x, 3), round(oy + dy * math.cos(a) - dz * math.sin(a), 3),
            round(oz + dy * math.sin(a) + dz * math.cos(a), 3))


def curved_mag(m, x0, x1, z0, z1, top, segments, role="mag", plate=True):
    """Magazine curving forward: segments = [(length, cumulative_angle_deg), ...] from the top down.
    Each segment is rotated about the bottom-centre of the previous one. Returns the bottom centre."""
    y, zc = top, (z0 + z1) / 2
    half = (z1 - z0) / 2
    prev_ang = 0.0
    for i, (length, ang) in enumerate(segments):
        rot = None if ang == 0 else {"origin": (8, y, zc), "axis": "x", "angle": ang}
        ext = 0.3 if i > 0 else 0.0  # overlap into the previous segment so the bend has no wedge gap
        m.box((x0, y - length, zc - half), (x1, y + ext, zc + half), role, rot=rot)
        if i == 0:
            m.box((x0 - 0.04, y - length + 0.4, zc - half + 0.25), (x1 + 0.04, y - 0.6, zc - half + 0.5), role)  # rib
        a = math.radians(ang)
        y, zc = y - length * math.cos(a), zc - length * math.sin(a)
        prev_ang = ang
    if plate:
        rot = {"origin": (8, y, zc), "axis": "x", "angle": prev_ang}
        m.box((x0 - 0.12, y - 0.45, zc - half - 0.2), (x1 + 0.12, y + 0.02, zc + half + 0.2), "detail", rot=rot)
    return y, zc


def build():
    w = Weapon("mp5", "smg")
    w.standard = {"receiver": "parkerized", "furniture": "black_polymer", "metal": "dark_steel",
                  "detail": "dark_steel", "mag": "dark_steel", "accent": "gunmetal"}

    body = w.part("body")
    # ---------------------------------------------------------------- stamped receiver
    body.box((6.75, 6.3, -3.5), (9.25, 9.7, 7.5), "receiver")
    body.box((7.05, 9.7, -3.5), (8.95, 10.25, 7.5), "receiver")  # rounded top
    body.box((7.4, 10.25, -3.5), (8.6, 10.4, 7.5), "receiver")
    for x0, x1 in ((9.25, 9.3), (6.7, 6.75)):  # stamped reinforcement ribs
        body.box((x0, 8.85, -3.2), (x1, 9.15, 7.2), "receiver")
        body.box((x0, 6.55, 1.2), (x1, 6.8, 7.2), "receiver")
    body.box((6.6, 6.0, 7.5), (9.4, 10.1, 8.0), "detail")  # end cap
    body.box((7.5, 6.5, 8.0), (8.5, 7.1, 8.4), "detail")  # end-cap sling loop
    body.box((7.75, 5.9, 8.0), (8.25, 6.5, 8.4), "detail")
    # ejection port (right) with the bolt visible
    body.box((9.25, 7.85, -2.9), (9.31, 9.25, -0.4), "detail", faces=("east",))
    body.box((9.31, 8.1, -2.4), (9.35, 9.0, -0.9), "metal", faces=("east",))
    # cocking tube + charging slot with the "slap" notch (left)
    body.octo_rod(8, TUBE_Y, -12.0, -3.5, 1.5, "receiver")
    body.box((7.2, TUBE_Y - 0.4, -12.6), (8.8, TUBE_Y + 0.4, -12.0), "receiver")  # tube cap
    body.box((7.18, TUBE_Y - 0.25, -10.4), (7.25, TUBE_Y + 0.25, -5.6), "detail", faces=("west",))  # slot
    body.box((7.18, TUBE_Y + 0.25, -6.1), (7.25, TUBE_Y + 0.75, -5.6), "detail", faces=("west",))  # notch
    body.box((7.5, 8.6, -4.2), (8.5, 9.0, -3.5), "receiver")  # tube / receiver web
    # hooded front sight
    body.box((7.3, 10.2, -12.6), (8.7, 10.45, -11.4), "receiver")  # sight base
    body.box((6.95, 10.2, -12.45), (7.3, 12.35, -11.55), "receiver")  # hood ring (sides)
    body.box((8.7, 10.2, -12.45), (9.05, 12.35, -11.55), "receiver")
    body.box((6.95, 12.35, -12.45), (9.05, 12.7, -11.55), "receiver")  # hood top
    body.box((7.85, 10.45, -12.15), (8.15, 11.6, -11.85), "detail")  # front post
    body.box((7.25, 8.6, -12.5), (8.75, 10.2, -11.5), "receiver")  # sight block around the barrel
    # rotary drum diopter (rear)
    body.box((7.3, 10.3, 4.6), (8.7, 11.0, 6.8), "receiver")  # drum base
    body.box((6.75, 10.95, 5.15), (9.25, 12.25, 6.35), "detail")  # drum
    body.box((6.75, 11.2, 4.9), (9.25, 12.0, 6.6), "detail")
    body.box((9.25, 11.35, 5.5), (9.4, 11.85, 6.0), "metal")  # drum axle caps
    body.box((6.6, 11.35, 5.5), (6.75, 11.85, 6.0), "metal")
    body.box((7.75, 11.4, 6.6), (8.25, 11.8, 6.65), "metal", faces=("south",))  # aperture ring
    # claw mount rail (B&T style) between the sights
    for z in (-1.4, 2.6):
        for x0, x1 in ((6.85, 7.25), (8.75, 9.15)):
            body.box((x0, 9.75, z), (x1, 10.5, z + 0.8), "detail")  # claws
    body.box((7.1, 10.4, -1.6), (8.9, 10.5, 3.6), "detail")  # mount bridge
    rail_top = picatinny(body, 10.5, -1.6, 3.6, width=1.5)
    # magazine well + paddle release
    body.box((6.85, WELL_Y, MAG_Z0 - 0.35), (9.15, 6.3, MAG_Z1 + 0.35), "receiver")
    body.box((6.8, WELL_Y - 0.25, MAG_Z0 - 0.45), (9.2, WELL_Y, MAG_Z1 + 0.45), "detail")  # well lip
    body.box((7.5, 4.3, MAG_Z1 + 0.45), (8.5, 5.3, MAG_Z1 + 0.85), "detail")  # paddle
    body.box((9.15, 5.4, MAG_Z1 - 0.2), (9.4, 5.9, MAG_Z1 + 0.3), "detail")  # push button
    # polymer trigger group + grip
    body.box((6.95, 5.1, 0.8), (9.05, 6.3, 7.4), "furniture")
    body.box((7.0, 5.6, 0.6), (9.0, 6.3, 0.8), "furniture")
    body.box((7.55, 3.4, 0.85), (8.45, 5.1, 1.35), "furniture")  # guard front
    body.box((7.55, 3.0, 0.85), (8.45, 3.45, 4.5), "furniture")  # guard bottom
    body.box((7.75, 3.6, 2.0), (8.25, 5.15, 2.45), "metal",
             rot={"origin": (8, 5.1, 2.2), "axis": "x", "angle": -12})  # trigger
    body.box((6.6, 5.45, 4.6), (6.95, 6.05, 5.8), "detail")  # selector (left)
    body.box((6.65, 5.55, 5.7), (6.95, 5.95, 6.5), "detail",
             rot={"origin": (6.8, 5.75, 5.2), "axis": "x", "angle": -25})
    body.box((9.05, 5.45, 4.8), (9.3, 6.05, 5.6), "detail")  # selector (right)
    for z in (1.4, 6.6):  # push pins
        body.box((9.25, 6.75, z), (9.33, 7.15, z + 0.4), "metal")
        body.box((6.67, 6.75, z), (6.75, 7.15, z + 0.4), "metal")
    body.box((6.95, 0.5, 4.0), (9.05, 5.2, 6.4), "furniture", rot=GRIP_ROT)  # grip
    for y in (1.5, 2.6, 3.7):  # finger grooves
        body.box((7.0, y, 3.65), (9.0, y + 0.7, 4.05), "furniture", rot=GRIP_ROT)
    body.box((6.9, 0.2, 3.9), (9.1, 0.6, 6.55), "detail", rot=GRIP_ROT)  # grip base
    for x0, x1 in ((9.05, 9.1), (6.9, 6.95)):
        body.box((x0, 1.2, 4.5), (x1, 4.5, 6.0), "furniture", rot=GRIP_ROT)  # textured panel

    # ---------------------------------------------------------------- slimline handguard (with short rails)
    body.box((6.85, 6.4, -10.6), (9.15, 9.3, -3.5), "furniture")
    body.box((7.1, 6.15, -10.4), (8.9, 6.4, -3.7), "furniture")  # rounded belly
    body.box((7.0, 9.3, -10.5), (9.0, 9.55, -3.6), "furniture")  # wraps the tube
    body.box((6.75, 6.3, -10.75), (9.25, 9.6, -10.55), "detail")  # front cap
    for z in (-9.6, -8.2, -6.8, -5.4):  # finger grooves
        body.box((9.15, 6.8, z), (9.2, 8.9, z + 0.6), "detail", faces=("east",))
        body.box((6.8, 6.8, z), (6.85, 8.9, z + 0.6), "detail", faces=("west",))
    accent_strip(body, 6.85, 9.15, 9.0, 9.15, -10.2, -4.0)
    rail_bot = picatinny(body, 6.15, -9.6, -4.6, width=1.4, top=False)
    body.box((9.15, 7.0, -9.4), (9.35, 8.4, -6.6), "detail")  # right side rail section
    z = -9.25
    while z + 0.5 <= -6.7:
        body.box((9.35, 6.9, z), (9.5, 8.5, z + 0.5), "detail")
        z += 1.0

    # ---------------------------------------------------------------- charging handle (front-left, angled)
    ch = w.part("charging_handle", animated=True)
    ch.box((6.9, TUBE_Y - 0.2, -10.2), (7.25, TUBE_Y + 0.2, -9.5), "detail")
    crot = {"origin": (6.9, TUBE_Y, -9.85), "axis": "z", "angle": -20}
    ch.box((5.6, TUBE_Y - 0.22, -10.15), (6.9, TUBE_Y + 0.22, -9.55), "detail", rot=crot)  # lever
    ch.box((5.15, TUBE_Y - 0.1, -10.3), (5.75, TUBE_Y + 0.75, -9.4), "detail", rot=crot)  # knob

    # ---------------------------------------------------------------- barrels (three-lug muzzle)
    def barrel(vid, tip, d=1.05):
        b = w.variant("barrel", vid)
        b.octo_rod(8, 8, tip + 1.1, -3.5, d, "metal")
        b.octo_rod(8, 8, tip, tip + 1.25, d + 0.35, "metal")  # three-lug adaptor
        for (x, y) in ((8, 8 + (d + 0.35) / 2), (8 - (d + 0.35) / 2 * 0.87, 8 - (d + 0.35) / 4),
                       (8 + (d + 0.35) / 2 * 0.87, 8 - (d + 0.35) / 4)):
            b.cbox((x, y, tip + 0.95), (0.35, 0.35, 0.5), "detail")  # lugs
        b.octo_rod(8, 8, tip - 0.05, tip + 0.3, d + 0.15, "detail")  # crown / thread cap
        w.muzzle_by_barrel[vid] = (8, 8, tip)
        return b

    barrel("default", -14.8)
    barrel(f"{NS}:short_barrel", -13.3)
    pb = barrel(f"{NS}:precision_barrel", -17.6, d=1.2)
    for z in (-16.0, -15.0, -14.0):  # fluting / heat rings on the long barrel
        pb.octo_rod(8, 8, z, z + 0.3, 1.38, "detail")

    # ---------------------------------------------------------------- stocks
    def stock_rails(s, z1, x_off=1.35):
        for x in (8 - x_off, 8 + x_off):
            s.box((x - 0.2, 8.6, 8.0), (x + 0.2, 9.0, z1), "metal")  # sliding rails
        return s

    s = stock_rails(w.variant("stock", "default"), 16.4)  # retractable stock
    s.box((6.5, 4.6, 16.4), (9.5, 10.0, 17.0), "detail")  # butt plate frame
    s.box((6.6, 4.4, 17.0), (9.4, 10.2, 17.6), "furniture")  # rubber pad
    s.box((6.6, 8.4, 15.6), (9.4, 9.2, 16.4), "detail")  # rail yoke
    s.box((7.6, 5.0, 15.9), (8.4, 8.4, 16.4), "detail")  # butt web
    s.box((7.7, 9.9, 8.0), (8.3, 10.15, 8.6), "metal")  # release latch
    s = w.variant("stock", f"{NS}:lightweight_stock")  # single-strut folding stock
    s.box((7.6, 8.4, 8.0), (8.4, 9.2, 15.8), "metal")
    s.box((7.2, 8.3, 8.0), (8.8, 9.3, 8.8), "detail")  # hinge
    s.box((7.4, 5.2, 15.8), (8.6, 9.8, 16.5), "furniture")  # small butt
    s.box((7.5, 5.6, 9.0), (8.5, 6.2, 15.8), "metal",
          rot={"origin": (8, 6.2, 15.8), "axis": "x", "angle": 18})  # brace
    s = w.variant("stock", f"{NS}:precision_stock")  # fixed polymer stock
    s.box((6.9, 7.4, 8.0), (9.1, 10.0, 16.8), "furniture")  # comb
    s.box((7.0, 3.6, 10.5), (9.0, 7.6, 16.8), "furniture",
          rot={"origin": (8, 7.6, 16.8), "axis": "x", "angle": 18})  # sloped belly
    s.box((7.0, 5.0, 13.6), (9.0, 7.6, 16.8), "furniture")
    s.box((6.8, 4.2, 16.8), (9.2, 10.2, 17.5), "detail")  # butt pad
    s.box((6.85, 8.0, 9.5), (6.9, 9.4, 15.6), "accent")  # side inlays
    s.box((9.1, 8.0, 9.5), (9.15, 9.4, 15.6), "accent")

    # ---------------------------------------------------------------- magazines (curved)
    segs_std = [(2.4, 0), (1.6, 9), (1.6, 18), (1.4, 27)]
    segs_ext = [(2.4, 0), (1.6, 8), (1.6, 15), (1.6, 22), (1.6, 29)]

    def mp5_mag(vid, segs):
        m = w.variant("magazine", vid)
        top = 6.25
        bottom = curved_mag(m, 7.35, 8.65, MAG_Z0, MAG_Z1, top, segs)
        m.box((7.65, top, MAG_Z0 + 0.3), (8.35, top + 0.3, MAG_Z1 - 0.4), "brass")  # top round
        return m, bottom

    mp5_mag("default", segs_std)
    mp5_mag(f"{NS}:extended_mag", segs_ext)
    q, _ = mp5_mag(f"{NS}:quick_mag", segs_std)
    # coupled spare magazine (side-by-side clamp), its top sitting just below the magwell
    spare_top = WELL_Y - 0.4
    curved_mag(q, 5.85, 7.15, MAG_Z0, MAG_Z1, spare_top, [(1.8, 0), (1.6, 9), (1.6, 18), (1.4, 27)])
    q.box((5.95, spare_top, MAG_Z0 + 0.3), (7.05, spare_top + 0.3, MAG_Z1 - 0.4), "brass")
    q.box((5.7, 2.6, MAG_Z0 - 0.15), (8.8, 3.6, MAG_Z1 + 0.15), "detail")  # coupler clamp
    q.box((8.8, 2.8, MAG_Z1 - 0.8), (9.0, 3.4, MAG_Z1 - 0.3), "metal")  # clamp screw

    # ---------------------------------------------------------------- metadata
    mz = round((MAG_Z0 + MAG_Z1) / 2, 3)
    w.anim = {
        "magazine": {"pivot": [8, 6.25, mz], "style": "drop"},
        "charging_handle": {"travel": [0, 0, 3.5]},
    }
    w.points = {
        "grip": rot_pt(GRIP_ROT, 2.8, 5.2),
        "support": (8, 6.6, -7.2),
        "ejection": (9.3, 8.55, -1.65),
        "mag_well": (8, WELL_Y - 0.25, mz),
    }
    w.iron_sight_y = 11.6
    w.iron_sight_z = 5.75
    w.mounts = {
        "optic": (8, rail_top, 1.0),
        "grip": (8, rail_bot, -7.1),
        "tactical": (9.5, 7.7, -7.9),
        "charm": (8, 5.9, 8.2),
    }
    w.slots = {
        "optic": [f"{NS}:red_dot", f"{NS}:holo_sight"],
        "muzzle": [f"{NS}:suppressor", f"{NS}:compensator", f"{NS}:flash_hider"],
        "grip": [f"{NS}:vertical_grip", f"{NS}:angled_grip", f"{NS}:ergonomic_grip"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
