"""Semi-Automatic Shotgun - magazine-fed 12 gauge on a long-stroke rotating-bolt receiver (original design).

Layout (model units): bore axis x=8, y=8, muzzle toward -z. Receiver z 0..12 with railed dust cover,
ejection port + reciprocating charging handle on the right, flared magazine well z 0.9..6.4, ribbed
polymer handguard z -11.8..-0.6 with side/bottom rails, gas block + front sight at z -13.2..-11.8.
Folding tube stock (variant) hinges at z 13.
"""
import math

from ccmodel import Part, Weapon
from weapons.common import ALL_CHARMS, accent_strip, picatinny

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
    """Voxel-style round section along x (drums, hubs): a plus shape plus an inner square."""
    r = d / 2
    p.box((x0, y - 0.45 * r, z - r), (x1, y + 0.45 * r, z + r), role)
    p.box((x0, y - r, z - 0.45 * r), (x1, y + r, z + 0.45 * r), role)
    p.box((x0, y - 0.76 * r, z - 0.76 * r), (x1, y + 0.76 * r, z + 0.76 * r), role)


def slope_fill(p: Part, x0, x1, z0, y0, z1, y1, role, band=1.2):
    """Fill below y0 down to the line (z0,y0)->(z1,y1) (y1 < y0) with a vertical rear edge at z1.
    A rotated band follows the slope; its tilted rear end overhangs z1 by band*sin(angle), so put a
    butt pad there. Stepped fill boxes cover the rest."""
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


def box_mag(m: Part, x0, x1, bottom, curve, shell=True, windows=True, lower=True):
    """12 gauge double-stack box magazine (top at y=5.0, z 1.3..5.9)."""
    m.box((x0, -0.15 if lower else 0.4, 1.3), (x1, 5.0, 5.9), "mag")
    m.box((x0 - 0.05, 2.3, 1.35), (x1 + 0.05, 2.65, 5.85), "mag")  # stiffening ridge
    if lower:  # curved lower body + floor plate (the drum replaces these)
        m.box((x0 + 0.02, bottom, 1.3), (x1 - 0.02, 0.4, 5.9), "mag", rot=curve)
        m.box((x0 - 0.1, bottom - 0.5, 1.15), (x1 + 0.1, bottom, 6.05), "detail", rot=curve)  # floor plate
        m.box((x0 - 0.05, bottom + 0.9, 1.35), (x1 + 0.05, bottom + 1.25, 5.85), "mag", rot=curve)
    m.box(((x0 + x1) / 2 - 0.45, 3.9, 0.95), ((x0 + x1) / 2 + 0.45, 4.9, 1.3), "mag")  # front catch lug
    m.box(((x0 + x1) / 2 - 0.4, 3.0, 5.9), ((x0 + x1) / 2 + 0.4, 3.6, 6.15), "detail")  # rear lock notch
    if windows:  # round-count witness holes showing red shells
        for y in (0.9, 3.0):
            m.box((x1, y, 3.0), (x1 + 0.05, y + 0.45, 4.6), "shell", faces=("east",))
    if shell:  # top shell resting on the feed lips
        cx = (x0 + x1) / 2
        m.octo_rod(cx, 5.55, 1.6, 4.9, 1.1, "shell")
        m.octo_rod(cx, 5.55, 4.9, 5.6, 1.16, "brass")
        m.box((x0 + 0.15, 5.0, 1.4), (x0 + 0.45, 5.4, 5.6), "mag")  # feed lips
        m.box((x1 - 0.45, 5.0, 1.4), (x1 - 0.15, 5.4, 5.6), "mag")


def build():
    w = Weapon("auto_shotgun", "shotgun")
    w.standard = {"receiver": "black_anodized", "furniture": "black_polymer", "metal": "dark_steel",
                  "detail": "dark_steel", "mag": "black_polymer", "accent": "gunmetal"}

    body = w.part("body")
    # ---- Receiver with a real ejection port on the right
    body.box((6.7, 5.2, 0.0), (8.8, 8.4, 12.0), "receiver")
    body.box((8.8, 5.2, 0.0), (9.3, 7.0, 12.0), "receiver")
    body.box((8.8, 7.0, 0.0), (9.3, 8.4, 3.4), "receiver")
    body.box((8.8, 7.0, 7.6), (9.3, 8.4, 12.0), "receiver")
    body.box((8.8, 7.15, 3.4), (8.85, 8.3, 7.6), "metal", faces=("east",))  # bolt carrier
    body.box((8.85, 7.45, 3.6), (8.9, 8.0, 4.6), "detail", faces=("east",))  # bolt head
    body.box((9.3, 7.55, 3.4), (9.38, 7.65, 11.2), "detail")  # charging slot lip
    # dust cover with rail
    body.box((6.6, 8.4, 0.9), (9.4, 9.4, 12.0), "receiver")
    body.box((6.9, 9.4, 0.9), (9.1, 9.7, 12.0), "receiver")
    body.box((7.4, 8.6, 12.0), (8.6, 9.2, 12.4), "detail")  # dust cover button
    rail_top = picatinny(body, 9.7, 2.2, 11.6)
    for z in (1.4, 11.3):  # dust cover rivets
        body.box((9.4, 8.7, z), (9.47, 9.1, z + 0.4), "detail")
        body.box((6.53, 8.7, z), (6.6, 9.1, z + 0.4), "detail")
    # rear sight block on the front trunnion
    body.box((6.85, 8.4, -0.6), (9.15, 9.9, 0.9), "receiver")
    body.box((7.25, 9.9, -0.2), (8.75, 10.3, 0.7), "detail")
    body.box((7.25, 10.3, 0.1), (7.75, 10.95, 0.5), "detail")  # rear notch
    body.box((8.25, 10.3, 0.1), (8.75, 10.95, 0.5), "detail")
    # rivets / pins / trunnion detail on both sides
    for x0, x1 in ((9.3, 9.37), (6.63, 6.7)):
        for (y, z) in ((5.7, 0.4), (5.7, 1.4), (6.4, 8.3), (6.4, 10.9), (5.7, 11.4)):
            body.box((x0, y, z), (x1, y + 0.4, z + 0.4), "detail")
    # AK-style safety lever over the rear of the slot
    body.box((9.3, 6.25, 7.9), (9.45, 6.85, 11.5), "detail")
    body.box((9.3, 5.55, 7.9), (9.45, 6.25, 8.6), "detail")  # finger tab
    body.box((9.45, 6.35, 10.9), (9.55, 6.75, 11.3), "metal")  # pivot
    accent_strip(body, 6.7, 9.3, 5.45, 5.65, 0.4, 11.6)
    # magazine well, release, trigger guard
    body.box((6.6, 3.7, 0.9), (9.4, 5.2, 6.4), "receiver")
    body.box((6.45, 3.3, 0.7), (9.55, 3.8, 6.6), "detail")  # flared lip
    body.box((7.5, 2.9, 6.6), (8.5, 4.9, 7.0), "detail")  # paddle release
    body.box((7.6, 2.3, 7.0), (8.4, 2.7, 10.6), "detail")  # guard
    body.box((7.6, 2.7, 7.0), (8.4, 5.2, 7.4), "detail")
    body.box((7.8, 3.0, 8.3), (8.2, 5.2, 8.7), "metal",
             rot={"origin": (8, 5.2, 8.5), "axis": "x", "angle": -14})  # trigger
    # pistol grip
    grip_rot = {"origin": (8, 5.2, 11.0), "axis": "x", "angle": -20}
    body.box((6.9, -1.2, 9.8), (9.1, 5.2, 12.3), "furniture", rot=grip_rot)
    body.box((6.85, -0.6, 9.75), (9.15, 3.9, 10.2), "furniture", rot=grip_rot)  # finger ridge
    body.box((6.8, -1.6, 9.7), (9.2, -1.2, 12.4), "detail", rot=grip_rot)  # grip cap
    body.box((9.1, 0.0, 10.6), (9.15, 3.8, 11.9), "detail", faces=("east",), rot=grip_rot)  # texture
    body.box((6.85, 0.0, 10.6), (6.9, 3.8, 11.9), "detail", faces=("west",), rot=grip_rot)
    # rear trunnion / folding hinge
    body.box((6.8, 5.0, 12.0), (9.2, 8.6, 13.0), "detail")
    body.box((9.2, 6.0, 12.2), (9.45, 7.6, 12.8), "metal")  # hinge pin head
    body.box((9.2, 4.8, 12.3), (9.6, 5.3, 12.9), "detail")  # sling loop (charm)

    # ---- Handguard: ribbed polymer lower, vented upper over the gas tube
    hz0, hz1 = -11.8, -0.6
    body.box((6.6, 5.2, hz1), (9.4, 9.0, 0.0), "detail")  # retainer
    body.box((6.4, 5.5, hz0), (9.6, 9.0, hz1), "furniture")
    body.box((6.6, 5.3, hz0 + 0.2), (9.4, 5.5, hz1 - 0.2), "furniture")
    z = hz0 + 0.6
    while z + 0.45 <= hz1 - 0.4:  # vertical ribs on the lower half
        body.box((6.3, 5.4, z), (9.7, 6.9, z + 0.45), "furniture")
        z += 0.9
    for right in (True, False):
        surface = side_rail(body, 9.6 if right else 6.4, 7.85, -10.6, -2.0, right=right)
        if right:
            tac_x = surface
    grip_y = picatinny(body, 5.3, -10.0, -3.0, width=1.4, top=False)
    body.box((6.7, 9.0, hz0 + 1.0), (9.3, 10.1, hz1), "furniture")  # upper handguard
    body.box((6.9, 10.1, hz0 + 1.0), (9.1, 10.3, hz1), "furniture")
    for z in (-9.6, -7.4, -5.2, -3.0):  # vents
        body.box((9.3, 9.3, z), (9.35, 9.8, z + 1.4), "detail", faces=("east",))
        body.box((6.65, 9.3, z), (6.7, 9.8, z + 1.4), "detail", faces=("west",))
    # gas tube, gas block, front sight, regulator
    body.box((7.45, 9.15, -12.6), (8.55, 10.0, hz0 + 1.0), "metal")
    body.box((7.0, 6.9, -13.3), (9.0, 10.2, -11.9), "metal")
    body.box((7.3, 6.5, -13.3), (8.7, 6.9, -12.3), "metal")  # bayonet lug / block skirt
    body.box((7.2, 10.2, -13.3), (8.8, 10.55, -12.2), "detail")
    body.box((7.15, 10.55, -13.2), (7.45, 11.6, -12.4), "detail")  # hood ears
    body.box((8.55, 10.55, -13.2), (8.85, 11.6, -12.4), "detail")
    body.box((7.85, 10.55, -12.95), (8.15, 11.2, -12.65), "detail")  # post
    body.box((6.45, 8.9, -13.0), (7.0, 9.8, -12.2), "detail")  # gas regulator
    body.box((6.25, 9.1, -12.8), (6.45, 9.6, -12.4), "metal")

    # ---- Charging handle (right side, rides back along the port)
    ch = w.part("charging_handle", animated=True)
    ch.box((9.3, 7.5, 2.45), (9.75, 8.15, 3.15), "metal")  # stem
    ch.box((9.75, 7.3, 2.35), (10.75, 8.35, 3.25), "detail")  # knob
    ch.box((10.75, 7.45, 2.45), (11.0, 8.2, 3.15), "detail")

    # ---- Barrels
    def barrel(vid, z_tip):
        b = w.variant("barrel", vid)
        b.octo_rod(8, 8, z_tip + 0.05, -0.6, 1.6, "metal")
        b.octo_rod(8, 8, z_tip, z_tip + 0.9, 1.85, "detail")  # thread protector
        b.box((7.9, 8.85, z_tip + 0.95), (8.1, 8.95, -13.4), "detail", faces=("up",))  # top flat
        w.muzzle_by_barrel[vid] = (8, 8, z_tip)
        return b

    barrel("default", -18.5)
    barrel(f"{NS}:short_barrel", -14.4)

    # ---- Magazines (drop straight down)
    curve = {"origin": (8, 0.4, 3.6), "axis": "x", "angle": 11}
    box_mag(w.variant("magazine", "default"), 6.85, 9.15, -3.4, curve)
    d = w.variant("magazine", f"{NS}:extended_mag")  # 12-round drum
    box_mag(d, 6.85, 9.15, 0.4, curve, windows=False, lower=False)
    x_round(d, -2.2, 3.6, 6.2, 9.8, 7.2, "mag")
    x_round(d, -2.2, 3.6, 9.8, 9.9, 5.6, "detail")  # drum faces
    x_round(d, -2.2, 3.6, 6.1, 6.2, 5.6, "detail")
    x_round(d, -2.2, 3.6, 9.9, 10.3, 1.6, "metal")  # winding key hub
    d.box((10.3, -2.5, 2.0), (10.6, -1.9, 5.2), "metal")  # winding key
    d.box((9.8, 0.4, 3.2), (9.85, 1.0, 4.0), "shell", faces=("east",))  # loaded indicator
    q = w.variant("magazine", f"{NS}:quick_mag")
    box_mag(q, 6.85, 9.15, -3.4, curve)
    q.box((4.45, -0.6, 1.3), (6.75, 3.6, 5.9), "mag")  # coupled spare (offset lower)
    q.box((4.45, -4.2, 1.3), (6.75, -0.6, 5.9), "mag", rot=curve)
    q.box((4.35, -4.7, 1.15), (6.85, -4.2, 6.05), "detail", rot=curve)
    q.octo_rod(5.6, 4.15, 1.6, 4.9, 1.1, "shell")
    q.octo_rod(5.6, 4.15, 4.9, 5.6, 1.16, "brass")
    q.box((4.3, -0.2, 1.1), (9.3, 1.0, 6.1), "detail")  # coupler clamp
    q.box((9.3, 0.1, 3.0), (9.6, 0.7, 4.4), "metal")  # clamp bolt
    q.box((7.6, -5.5, 3.1), (8.4, -4.1, 3.9), "shell", rot=curve)  # pull tab

    # ---- Stocks
    s = w.variant("stock", "default")  # folding tube stock
    s.box((7.0, 5.1, 13.0), (9.0, 8.6, 13.8), "detail")  # hinge knuckle
    s.octo_rod(8, 7.9, 13.8, 21.6, 1.0, "metal")  # top tube
    s.box((7.5, 5.15, 13.4), (8.5, 6.05, 22.4), "metal",
          rot={"origin": (8, 5.6, 13.4), "axis": "x", "angle": 20})  # lower tube
    s.box((7.15, 7.05, 15.0), (8.85, 8.75, 19.8), "furniture")  # cheek wrap
    s.box((7.1, 6.95, 15.4), (8.9, 7.05, 19.4), "detail")  # wrap strap
    s.box((6.9, 1.7, 21.4), (9.1, 8.7, 22.3), "furniture")  # butt plate
    s.box((6.85, 1.5, 22.3), (9.15, 8.9, 22.8), "detail")  # rubber pad
    s.box((9.0, 7.5, 13.9), (9.4, 8.3, 14.7), "metal")  # lock button
    s = w.variant("stock", f"{NS}:lightweight_stock")  # minimal skeleton
    s.box((7.0, 5.1, 13.0), (9.0, 8.6, 13.8), "detail")
    s.box((7.4, 7.6, 13.8), (8.6, 8.4, 21.8), "furniture")
    s.box((7.4, 4.3, 13.6), (8.6, 5.1, 21.2), "furniture",
          rot={"origin": (8, 5.1, 13.6), "axis": "x", "angle": 14})
    s.box((7.4, 2.4, 21.0), (8.6, 8.4, 21.8), "furniture")
    s.box((7.2, 2.2, 21.8), (8.8, 8.6, 22.3), "detail")
    s = w.variant("stock", f"{NS}:precision_stock")  # solid adjustable
    s.box((7.0, 5.1, 13.0), (9.0, 8.6, 13.8), "detail")
    s.box((6.9, 4.4, 13.8), (9.1, 8.4, 21.6), "furniture")
    slope_fill(s, 6.9, 9.1, 13.8, 4.4, 21.6, 1.4, "furniture")
    s.box((7.6, 1.8, 19.4), (8.4, 2.6, 20.6), "metal")  # sling cup
    s.box((7.1, 9.0, 15.0), (8.9, 9.9, 20.4), "furniture")  # cheek riser
    for z in (15.8, 19.0):
        s.box((7.7, 8.4, z), (8.3, 9.0, z + 0.5), "metal")
    s.box((9.1, 6.0, 15.0), (9.15, 7.6, 20.0), "detail", faces=("east",))  # texture panel
    s.box((6.85, 6.0, 15.0), (6.9, 7.6, 20.0), "detail", faces=("west",))
    s.box((6.8, 1.0, 21.6), (9.2, 9.0, 22.6), "detail")  # pad

    w.anim = {
        "magazine": {"pivot": [8, 5.0, 3.6], "style": "drop"},
        "charging_handle": {"travel": [0, 0, 4.6]},
    }
    w.points = {
        "grip": (8, 1.9, 11.6),
        "support": (8, 6.2, -6.5),
        "ejection": (9.3, 7.7, 5.5),
        "mag_well": (8, 3.3, 3.6),
    }
    w.iron_sight_y = 10.85
    w.iron_sight_z = 0.3
    w.mounts = {
        "optic": (8, rail_top, 7.0),
        "grip": (8, grip_y, -6.5),
        "tactical": (tac_x, 7.85, -5.6),
        "charm": (9.4, 4.8, 12.6),
    }
    w.slots = {
        "optic": [f"{NS}:red_dot", f"{NS}:holo_sight"],
        "muzzle": [f"{NS}:suppressor", f"{NS}:shotgun_choke", f"{NS}:muzzle_brake"],
        "grip": [f"{NS}:vertical_grip", f"{NS}:angled_grip"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
