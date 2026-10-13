"""DMR - .308 semi-automatic marksman rifle on the large-frame rifle platform (original design).

Layout (model units): bore axis x=8, y=8, muzzle toward -z. Tall upper receiver z 0..11 with a real
ejection port, long free-float handguard z -17..0 sharing one continuous top rail with the upper,
deep .308 magazine well z 1.8..6.6, buffer tube behind z 12 carrying the adjustable precision stock
(variant). Longest barrel + longest stock stays within 48 units along z (-25.5 .. 22.5).
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
    w = Weapon("dmr", "rifle")
    w.standard = {"receiver": "black_anodized", "furniture": "tan_polymer", "metal": "parkerized",
                  "detail": "dark_steel", "mag": "black_polymer", "accent": "gunmetal"}

    body = w.part("body")
    # ---- Upper receiver (taller than the carbine) with a recessed ejection port z 3.0..7.6
    body.box((6.5, 7.0, 0.0), (9.0, 10.2, 11.0), "receiver")
    body.box((9.0, 7.0, 0.0), (9.5, 7.3, 11.0), "receiver")
    body.box((9.0, 9.4, 0.0), (9.5, 10.2, 11.0), "receiver")
    body.box((9.0, 7.3, 0.0), (9.5, 9.4, 3.0), "receiver")
    body.box((9.0, 7.3, 7.6), (9.5, 9.4, 11.0), "receiver")
    body.box((9.0, 7.6, 3.0), (9.05, 9.1, 7.6), "metal", faces=("east",))  # bolt carrier
    body.box((9.05, 8.1, 3.4), (9.1, 8.7, 4.6), "detail", faces=("east",))  # bolt head
    body.box((9.5, 6.75, 3.1), (10.05, 7.1, 7.5), "detail",
             rot={"origin": (9.5, 7.1, 5.3), "axis": "z", "angle": -25})  # open dust cover
    body.box((9.35, 8.55, 7.8), (10.3, 9.8, 9.7), "receiver")  # forward assist housing
    body.box((10.3, 8.85, 8.0), (10.6, 9.5, 9.5), "detail")  # forward assist button
    body.box((9.5, 9.0, 7.35), (10.1, 10.0, 7.85), "receiver")  # brass deflector
    rail_top = picatinny(body, 10.2, -17.0, 11.0)  # one continuous rail (handguard + upper)
    # ---- Lower receiver
    body.box((6.65, 4.4, 1.0), (9.35, 7.0, 12.0), "receiver")
    body.box((6.6, 1.6, 1.8), (9.4, 4.4, 6.6), "receiver")  # magwell
    body.box((6.45, 1.2, 1.6), (9.55, 1.8, 6.8), "receiver")  # flared lip
    body.box((9.4, 1.9, 2.1), (9.45, 4.1, 6.3), "detail", faces=("east",))  # magwell flutes
    body.box((6.55, 1.9, 2.1), (6.6, 4.1, 6.3), "detail", faces=("west",))
    body.box((9.35, 4.55, 6.0), (9.6, 5.25, 6.7), "detail")  # mag release
    body.box((6.4, 5.4, 6.2), (6.65, 6.6, 7.4), "detail")  # bolt catch (left)
    body.box((6.4, 5.3, 10.0), (6.65, 6.1, 11.2), "detail")  # selector (left)
    body.box((9.35, 5.45, 10.3), (9.55, 6.05, 10.9), "detail")  # selector (right)
    for x0, x1 in ((9.35, 9.42), (6.58, 6.65)):  # takedown + trigger pins
        for (y, z) in ((5.0, 1.4), (5.1, 7.6), (5.1, 8.8), (5.6, 11.3)):
            body.box((x0, y, z), (x1, y + 0.4, z + 0.4), "detail")
    body.box((7.6, 2.0, 6.8), (8.4, 2.4, 11.0), "detail")  # oversized trigger guard
    body.box((7.6, 2.4, 6.8), (8.4, 4.4, 7.2), "detail")
    body.box((7.8, 2.8, 8.1), (8.2, 4.4, 8.5), "metal",
             rot={"origin": (8, 4.4, 8.3), "axis": "x", "angle": -10})  # trigger
    body.box((6.65, 3.0, 12.0), (9.35, 7.0, 12.6), "receiver")  # receiver tail
    accent_strip(body, 6.65, 9.35, 6.55, 6.75, 1.4, 11.6)
    # ---- Precision pistol grip (steeper, with palm shelf)
    grip_rot = {"origin": (8, 4.4, 11.0), "axis": "x", "angle": -14}
    body.box((6.9, -2.2, 10.0), (9.1, 4.4, 12.5), "furniture", rot=grip_rot)
    body.box((6.85, -1.4, 9.95), (9.15, 3.4, 10.4), "furniture", rot=grip_rot)  # finger ridge
    body.box((6.8, -2.6, 9.9), (9.2, -2.2, 12.9), "furniture", rot=grip_rot)  # palm shelf
    body.box((9.1, -1.0, 10.8), (9.15, 3.0, 12.2), "detail", faces=("east",), rot=grip_rot)
    body.box((6.85, -1.0, 10.8), (6.9, 3.0, 12.2), "detail", faces=("west",), rot=grip_rot)
    # ---- Buffer tube, castle nut, QD end plate
    body.octo_rod(8, 8.3, 11.0, 21.0, 1.8, "receiver")
    body.octo_rod(8, 8.3, 12.0, 12.8, 2.5, "detail")
    body.box((9.0, 6.8, 12.1), (9.4, 7.7, 12.7), "detail")  # QD sling point on the end plate (charm)
    # ---- Free-float handguard (octagonal profile)
    hz0 = -17.0
    body.box((6.2, 6.3, hz0), (9.8, 9.9, 0.0), "receiver")
    body.box((6.5, 9.9, hz0), (9.5, 10.2, 0.0), "receiver")
    body.box((6.5, 6.0, hz0), (9.5, 6.3, 0.0), "receiver")
    body.box((6.3, 6.1, hz0 - 0.25), (9.7, 10.1, hz0), "detail")  # front ring
    body.box((6.1, 6.2, -0.7), (9.9, 10.15, -0.1), "detail")  # barrel nut ring
    side_slots(body, 6.2, 9.8, 7.0, 8.6, (-16.0, -11.8, -9.0, -6.2, -3.4), length=2.0)
    for z in (-6.0, -3.4):  # bottom slots
        body.box((7.4, 5.95, z), (8.6, 6.0, z + 1.8), "detail", faces=("down",))
    tac_x = side_rail(body, 9.8, 7.8, -14.4, -12.2)
    grip_y = picatinny(body, 6.0, -15.6, -7.6, width=1.4, top=False)
    accent_strip(body, 6.2, 9.8, 9.35, 9.5, -16.6, -0.9)
    body.box((9.8, 6.75, -1.6), (9.9, 7.25, -1.0), "metal")  # QD socket
    # ---- Flip-up iron sights
    body.box((7.2, rail_top, -16.6), (8.8, rail_top + 0.4, -15.4), "detail")
    body.box((7.85, rail_top + 0.4, -16.15), (8.15, 12.4, -15.85), "detail")  # front post
    body.box((7.35, rail_top + 0.4, -16.25), (7.6, 12.2, -15.75), "detail")
    body.box((8.4, rail_top + 0.4, -16.25), (8.65, 12.2, -15.75), "detail")
    body.box((7.2, rail_top, 9.2), (8.8, rail_top + 0.4, 10.6), "detail")  # rear sight base
    body.box((7.4, rail_top + 0.4, 9.7), (7.75, 12.75, 10.1), "detail")
    body.box((8.25, rail_top + 0.4, 9.7), (8.6, 12.75, 10.1), "detail")
    body.box((7.4, 12.4, 9.7), (8.6, 12.75, 10.1), "detail")
    body.box((7.4, rail_top + 0.4, 9.7), (8.6, 11.85, 10.1), "detail")
    body.box((8.8, rail_top + 0.1, 9.5), (9.15, rail_top + 0.5, 10.3), "metal")  # windage knob

    # ---- Charging handle
    ch = w.part("charging_handle", animated=True)
    ch.box((7.3, 9.4, 11.0), (8.7, 10.1, 12.2), "detail")
    ch.box((6.4, 9.4, 12.2), (9.6, 10.1, 12.85), "detail")
    ch.box((6.15, 9.35, 12.3), (6.5, 10.15, 12.95), "metal")  # extended latch

    # ---- Barrels
    def barrel(vid, z_tip, d, fluted=False):
        b = w.variant("barrel", vid)
        b.octo_rod(8, 8, z_tip + 0.05, hz0, d, "metal")
        b.octo_rod(8, 8, z_tip, z_tip + 0.8, d + 0.25, "detail")  # thread protector
        if fluted:
            r = d / 2
            z0, z1 = z_tip + 1.4, hz0 - 0.4
            b.box((7.75, 8 + r - 0.04, z0), (8.25, 8 + r + 0.02, z1), "detail")
            b.box((7.75, 8 - r - 0.02, z0), (8.25, 8 - r + 0.04, z1), "detail")
            b.box((8 + r - 0.04, 7.75, z0), (8 + r + 0.02, 8.25, z1), "detail")
            b.box((8 - r - 0.02, 7.75, z0), (8 - r + 0.04, 8.25, z1), "detail")
        w.muzzle_by_barrel[vid] = (8, 8, z_tip)
        return b

    barrel("default", -23.5, 1.45)
    barrel(f"{NS}:precision_barrel", -25.5, 1.6, fluted=True)
    barrel(f"{NS}:heavy_barrel", -24.5, 2.05)

    # ---- Magazines (20-round .308, nearly straight)
    curve = {"origin": (8, -0.6, 4.2), "axis": "x", "angle": 6}

    def mag308(m, x0, x1, bottom, top_round=True):
        m.box((x0, -0.9, 2.1), (x1, 4.3, 6.3), "mag")
        m.box((x0 + 0.02, bottom, 2.1), (x1 - 0.02, -0.6, 6.3), "mag", rot=curve)
        m.box((x0 - 0.1, bottom - 0.5, 1.9), (x1 + 0.1, bottom, 6.5), "detail", rot=curve)  # floor plate
        m.box((x0 - 0.05, -0.2, 2.5), (x1 + 0.05, 3.8, 2.85), "mag")  # front rib
        m.box((x0 - 0.05, bottom + 0.6, 5.6), (x1 + 0.05, -0.8, 5.95), "mag", rot=curve)  # rear rib
        m.box((x0 - 0.05, bottom + 0.9, 3.2), (x1 + 0.05, bottom + 1.6, 5.2), "mag", rot=curve)  # grip panel
        if top_round:
            cx = (x0 + x1) / 2
            m.octo_rod(cx, 4.65, 3.0, 6.0, 0.75, "brass")
            m.octo_rod(cx, 4.65, 2.4, 3.0, 0.55, "brass")

    mag308(w.variant("magazine", "default"), 6.85, 9.15, -4.6)
    mag308(w.variant("magazine", f"{NS}:extended_mag"), 6.85, 9.15, -8.6)
    q = w.variant("magazine", f"{NS}:quick_mag")
    mag308(q, 6.85, 9.15, -4.6)
    q.box((4.45, -2.7, 2.1), (6.75, 3.0, 6.3), "mag")  # coupled spare
    q.box((4.47, -6.4, 2.1), (6.73, -2.4, 6.3), "mag", rot=curve)
    q.box((4.35, -6.9, 1.9), (6.85, -6.4, 6.5), "detail", rot=curve)
    q.box((4.3, -1.6, 1.9), (9.3, -0.4, 6.5), "detail")  # coupler clamp
    q.box((7.6, -7.9, 3.8), (8.4, -6.6, 4.6), "shell", rot=curve)  # pull tab

    # ---- Stocks (slide over the buffer tube, z 13+)
    s = w.variant("stock", "default")  # precision-style adjustable
    s.box((6.8, 5.8, 13.6), (9.2, 9.3, 17.4), "furniture")  # nose (low: charging handle clears it)
    s.box((6.8, 5.8, 17.4), (9.2, 9.6, 21.4), "furniture")
    slope_fill(s, 6.8, 9.2, 13.6, 5.8, 21.4, 3.4, "furniture")
    s.box((7.0, 9.6, 17.4), (9.0, 10.6, 21.0), "furniture")  # cheek riser
    s.box((7.05, 10.6, 17.7), (8.95, 10.75, 20.7), "detail")  # riser pad
    s.octo_rod(8, 9.4, 16.8, 17.4, 2.2, "detail")  # riser adjustment wheel
    s.box((6.7, 3.0, 21.4), (9.3, 10.4, 22.0), "furniture")  # butt plate
    s.box((6.65, 2.8, 22.0), (9.35, 10.6, 22.5), "detail")  # pad
    s.box((7.2, 2.4, 21.5), (8.8, 3.0, 22.3), "detail")  # butt height slider
    s.box((7.55, 2.9, 19.0), (8.45, 4.1, 20.0), "metal")  # monopod knob
    s.box((7.7, 2.5, 19.1), (8.3, 2.9, 19.9), "detail")
    for y in (6.6, 8.0):  # side grooves
        s.box((9.2, y, 14.4), (9.25, y + 0.4, 20.8), "detail", faces=("east",))
        s.box((6.75, y, 14.4), (6.8, y + 0.4, 20.8), "detail", faces=("west",))
    s = w.variant("stock", f"{NS}:lightweight_stock")  # skeleton
    s.box((7.3, 8.45, 15.0), (8.7, 9.25, 22.0), "furniture")
    s.box((7.3, 3.4, 21.2), (8.7, 9.25, 22.0), "furniture")
    s.box((7.4, 5.6, 15.1), (8.6, 6.3, 21.6), "furniture",
          rot={"origin": (8, 6.0, 15.1), "axis": "x", "angle": 20})
    s.box((7.2, 7.2, 14.6), (8.8, 9.3, 16.0), "furniture")  # tube collar
    s.box((7.1, 3.2, 22.0), (8.9, 9.5, 22.5), "detail")
    s = w.variant("stock", f"{NS}:precision_stock")  # fixed rifle stock with tall comb
    s.box((6.8, 5.4, 12.8), (9.2, 9.3, 21.6), "furniture")
    slope_fill(s, 6.8, 9.2, 12.8, 5.4, 21.6, 1.8, "furniture")
    s.box((6.9, 9.3, 17.0), (9.1, 10.9, 21.6), "furniture")  # raised comb
    s.box((6.85, 10.2, 17.4), (6.9, 10.6, 21.2), "detail", faces=("west",))  # comb seam
    s.box((9.1, 10.2, 17.4), (9.15, 10.6, 21.2), "detail", faces=("east",))
    s.box((7.6, 1.9, 19.8), (8.4, 2.6, 20.6), "metal")  # sling swivel
    s.box((9.2, 6.4, 15.6), (9.25, 7.6, 20.4), "detail", faces=("east",))  # trap door
    s.box((6.75, 6.4, 15.6), (6.8, 7.6, 20.4), "detail", faces=("west",))
    s.box((6.7, 1.4, 21.6), (9.3, 11.0, 22.5), "detail")  # rubber pad

    w.anim = {
        "magazine": {"pivot": [8, 4.3, 4.2], "style": "drop"},
        "charging_handle": {"travel": [0, 0, 4.0]},
    }
    w.points = {
        "grip": (8, 1.2, 11.8),
        "support": (8, 5.6, -10.0),
        "ejection": (9.5, 8.4, 5.3),
        "mag_well": (8, 1.6, 4.2),
    }
    w.iron_sight_y = 12.1
    w.iron_sight_z = 9.9
    w.mounts = {
        "optic": (8, rail_top, 5.0),
        "grip": (8, grip_y, -10.5),
        "tactical": (tac_x, 7.8, -13.3),
        "charm": (9.2, 6.8, 12.4),
    }
    w.slots = {
        "optic": [f"{NS}:acog_scope", f"{NS}:red_dot", f"{NS}:holo_sight", f"{NS}:sniper_scope"],
        "muzzle": [f"{NS}:suppressor", f"{NS}:compensator", f"{NS}:muzzle_brake"],
        "grip": [f"{NS}:vertical_grip", f"{NS}:bipod"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
