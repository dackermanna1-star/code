"""Pump-Action Shotgun - classic tube-fed 12 gauge slide action (original design).

Layout (model units): bore axis x=8, y=8, muzzle toward -z. Receiver z 0..8.6 (loading port underneath,
ejection port on the right), magazine tube under the barrel (axis y=6.35) ending in the barrel lug at
z -11.9, walnut buttstock (variant) behind z 8.6. The ribbed forend (`pump`) rides on the tube.
"""
import math

from ccmodel import Part, Weapon
from weapons.common import ALL_CHARMS, accent_strip, picatinny

NS = "calibercraft"
TUBE_Y = 6.35  # magazine tube axis
TUBE_D = 1.5
TUBE_END = -11.9  # front of the fixed tube (barrel lug face)


def _shell(p: Part, cx, cy, z_front, length=2.7, d=1.3):
    """A 12 gauge shell lying along z, nose toward -z, brass head at the rear."""
    head = 0.85
    p.octo_rod(cx, cy, z_front, z_front + length - head, d, "shell")
    p.octo_rod(cx, cy, z_front + length - head, z_front + length - 0.12, d + 0.04, "brass")
    p.octo_rod(cx, cy, z_front + length - 0.12, z_front + length, d + 0.22, "brass")  # rim
    p.box((cx - d * 0.3, cy - d * 0.3, z_front - 0.05), (cx + d * 0.3, cy + d * 0.3, z_front), "shell")  # crimp
    return p


def build():
    w = Weapon("pump_shotgun", "shotgun")
    w.standard = {"receiver": "blued_steel", "furniture": "walnut_wood", "metal": "blued_steel",
                  "detail": "dark_steel", "accent": "gunmetal"}

    body = w.part("body")
    # ---- Receiver: built around a real (recessed) ejection port on the right and loading port below
    body.box((6.6, 5.3, 0.0), (8.9, 9.1, 8.6), "receiver")  # core
    body.box((8.9, 5.3, 0.0), (9.4, 7.1, 8.6), "receiver")  # right wall below port
    body.box((8.9, 8.9, 0.0), (9.4, 9.1, 8.6), "receiver")  # right wall above port
    body.box((8.9, 7.1, 0.0), (9.4, 8.9, 1.0), "receiver")  # port front
    body.box((8.9, 7.1, 4.6), (9.4, 8.9, 8.6), "receiver")  # port rear
    body.box((6.6, 4.8, 0.0), (7.0, 5.3, 8.6), "receiver")  # loading port rails
    body.box((8.9, 4.8, 0.0), (9.4, 5.3, 8.6), "receiver")
    body.box((7.0, 4.8, 0.0), (8.9, 5.3, 1.0), "receiver")  # loading port front
    body.box((7.0, 4.8, 5.2), (8.9, 5.3, 8.6), "receiver")  # loading port rear
    body.box((6.85, 9.1, 0.0), (9.15, 9.45, 8.6), "receiver")  # rounded top
    body.box((6.75, 5.0, 8.6), (9.25, 9.2, 9.0), "receiver")  # rear face / stock seat
    # bolt + extractor seen through the ejection port, shell lifter seen through the loading port
    body.box((8.9, 7.35, 1.0), (8.95, 8.65, 4.6), "metal", faces=("east",))
    body.box((8.95, 7.75, 1.0), (9.0, 8.25, 1.6), "detail", faces=("east", "south"))
    body.box((7.15, 5.2, 1.3), (8.75, 5.25, 4.9), "metal", faces=("down",))
    body.box((7.6, 5.15, 4.2), (8.3, 5.2, 4.9), "detail", faces=("down",))  # lifter tongue
    # top rail with a small fixed rear notch
    rail_top = picatinny(body, 9.45, 0.6, 8.2)
    body.box((7.2, rail_top, 7.5), (7.65, rail_top + 0.55, 8.15), "detail")
    body.box((8.35, rail_top, 7.5), (8.8, rail_top + 0.55, 8.15), "detail")
    # pins, roll-mark panel, accent line
    for x0, x1 in ((9.4, 9.48), (6.52, 6.6)):
        for z in (5.9, 7.9):
            body.box((x0, 5.55, z), (x1, 6.05, z + 0.5), "detail")
    body.box((6.55, 7.2, 2.0), (6.6, 8.5, 6.6), "accent")  # engraved roll-mark panel (left)
    body.box((6.5, 7.45, 2.3), (6.55, 8.25, 4.6), "detail")
    accent_strip(body, 6.6, 9.4, 6.55, 6.75, 0.4, 8.2)
    # ---- Trigger group
    body.box((7.0, 3.9, 5.4), (9.0, 4.8, 8.6), "detail")  # trigger plate
    body.box((7.6, 2.0, 5.5), (8.4, 2.4, 8.4), "detail")  # guard bottom
    body.box((7.6, 2.4, 5.5), (8.4, 3.9, 5.9), "detail")  # guard front
    body.box((7.6, 2.4, 8.0), (8.4, 3.9, 8.4), "detail")  # guard rear
    body.box((7.8, 2.7, 6.6), (8.2, 3.9, 7.0), "metal",
             rot={"origin": (8, 3.9, 6.8), "axis": "x", "angle": -14})  # trigger
    body.box((6.8, 3.95, 7.4), (9.2, 4.4, 7.85), "metal")  # cross-bolt safety
    body.box((6.75, 4.0, 5.6), (7.0, 4.45, 6.7), "metal")  # action release (left)
    # ---- Magazine tube + barrel lug (all barrels reach past the lug)
    body.octo_rod(8, TUBE_Y, TUBE_END, 0.0, TUBE_D, "metal")
    body.octo_rod(8, TUBE_Y, -0.45, 0.0, 1.85, "detail")  # tube nut at the receiver
    body.octo_rod(8, 8, -0.6, 0.0, 2.0, "metal")  # barrel collar
    body.box((7.2, 5.4, TUBE_END), (8.8, 7.4, -11.0), "metal")  # barrel lug ring
    body.box((7.5, 7.3, TUBE_END), (8.5, 7.6, -11.0), "metal")
    body.box((8.8, 5.85, -12.1), (9.35, 7.35, -10.8), "detail")  # side rail block (tactical)
    for z in (-11.95, -11.25):
        body.box((9.35, 5.75, z), (9.6, 7.45, z + 0.4), "detail")
    body.box((7.75, 4.85, -11.75), (8.25, 5.4, -11.15), "detail")  # sling stud

    # ---- Pump (animated): ribbed wooden forend + action bars
    pump = w.part("pump", animated=True)
    zf, zr = -10.6, -4.4
    pump.box((6.75, 4.95, zf + 0.3), (9.25, 7.2, zr - 0.3), "furniture")  # belly around the tube
    pump.box((6.75, 7.2, zf + 0.3), (7.1, 8.05, zr - 0.3), "furniture")  # wings beside the barrel
    pump.box((8.9, 7.2, zf + 0.3), (9.25, 8.05, zr - 0.3), "furniture")
    z = zf + 0.8
    while z + 0.4 <= zr - 0.6:  # corn-cob ribs
        pump.box((6.6, 4.8, z), (9.4, 7.0, z + 0.4), "furniture")
        pump.box((6.6, 7.0, z), (7.1, 8.2, z + 0.4), "furniture")
        pump.box((8.9, 7.0, z), (9.4, 8.2, z + 0.4), "furniture")
        z += 0.8
    for z0 in (zf, zr - 0.45):  # end flares
        pump.box((6.55, 4.7, z0), (9.45, 7.15, z0 + 0.45), "furniture")
        pump.box((6.55, 7.15, z0), (7.1, 8.2, z0 + 0.45), "furniture")
        pump.box((8.9, 7.15, z0), (9.45, 8.2, z0 + 0.45), "furniture")
    pump.octo_rod(8, TUBE_Y, zf - 0.3, zf, 1.75, "metal")  # slide tube nut
    pump.box((6.85, 5.95, zr), (7.1, 6.45, -0.2), "metal")  # action bars
    pump.box((8.9, 5.95, zr), (9.15, 6.45, -0.2), "metal")

    # ---- Loose shell for shell-by-shell loading (first person only), modelled at the loading port
    shell = w.part("shell", animated=True, in_world=False)
    shell_to = (8.0, 4.25, 3.1)
    _shell(shell, shell_to[0], shell_to[1], shell_to[2] - 1.35)

    # ---- Barrels
    def barrel(vid, z_tip, rib=False):
        b = w.variant("barrel", vid)
        b.octo_rod(8, 8, z_tip, -0.6, 1.5, "metal")
        b.octo_rod(8, 8, z_tip, z_tip + 0.45, 1.62, "detail")  # crown
        if rib:  # ventilated rib with posts, ported muzzle
            b.box((7.6, 9.55, z_tip + 0.3), (8.4, 9.8, -0.9), "detail")
            z = z_tip + 0.8
            while z < -1.2:
                b.box((7.8, 8.6, z), (8.2, 9.55, z + 0.35), "detail")
                z += 1.6
            for z in (z_tip + 0.9, z_tip + 1.7, z_tip + 2.5):
                b.box((7.7, 8.75, z), (8.3, 8.8, z + 0.45), "detail", faces=("up",))
            b.box((7.8, 9.8, z_tip + 0.35), (8.2, 10.1, z_tip + 0.9), "detail")
            b.box((7.8, 10.1, z_tip + 0.4), (8.2, 10.5, z_tip + 0.8), "brass")  # bead
        else:
            b.box((7.75, 8.6, z_tip + 0.35), (8.25, 10.1, z_tip + 1.4), "detail",
                  rot={"origin": (8, 8.6, z_tip + 1.4), "axis": "x", "angle": -8})  # sight ramp
            b.box((7.8, 10.05, z_tip + 0.45), (8.2, 10.45, z_tip + 0.85), "brass")  # bead
        w.muzzle_by_barrel[vid] = (8, 8, z_tip)
        return b

    barrel("default", -18.0)
    barrel(f"{NS}:short_barrel", -12.6)
    barrel(f"{NS}:precision_barrel", -21.5, rib=True)

    # ---- Magazine tube front (static variants: the tube does not drop out)
    m = w.variant("magazine", "default")
    m.octo_rod(8, TUBE_Y, TUBE_END - 0.6, TUBE_END, 1.8, "metal")  # flush tube cap
    m.octo_rod(8, TUBE_Y, TUBE_END - 0.75, TUBE_END - 0.6, 1.2, "detail")
    m = w.variant("magazine", f"{NS}:extended_mag")
    ext_end = -17.3
    m.octo_rod(8, TUBE_Y, TUBE_END - 0.5, TUBE_END, 1.85, "detail")  # coupling
    m.octo_rod(8, TUBE_Y, ext_end, TUBE_END - 0.5, TUBE_D, "metal")
    m.octo_rod(8, TUBE_Y, ext_end - 0.55, ext_end, 1.8, "metal")  # end cap
    m.box((7.0, 5.35, -16.4), (9.0, 7.35, -15.6), "detail")  # barrel clamp
    m.box((7.0, 7.35, -16.4), (7.25, 8.95, -15.6), "detail")
    m.box((8.75, 7.35, -16.4), (9.0, 8.95, -15.6), "detail")
    m.box((7.0, 8.95, -16.4), (9.0, 9.1, -15.6), "detail")
    m.box((9.0, 5.9, -16.3), (9.3, 6.6, -15.7), "metal")  # clamp screw

    # ---- Stocks (all share the wrist position so the right hand sits the same on each)
    def wedge_stock(s, comb_drop=2.5, toe=(21.2, 0.8), width=2.4, extra_comb=False):
        """Sporting stock: narrow wrist, comb sloping slightly down, belly line falling to the toe."""
        x0, x1 = 8 - width / 2, 8 + width / 2
        s.box((6.8, 3.9, 9.0), (9.2, 9.15, 10.0), "furniture")  # head (matches receiver + trigger plate)
        s.box((7.05, 4.4, 9.8), (8.95, 8.95, 13.5), "furniture",
              rot={"origin": (8, 8.95, 9.8), "axis": "x", "angle": 3})  # wrist
        s.box((x0, 5.2, 13.0), (x1, 8.85, toe[0]), "furniture",
              rot={"origin": (8, 8.85, 13.0), "axis": "x", "angle": comb_drop})  # comb / upper butt
        dz, dy = toe[0] - 12.8, 4.6 - toe[1]
        ang = math.degrees(math.atan2(dy, dz))
        # belly band: its bottom edge is the toe line; the band is thin so its tilted rear edge stays
        # hidden inside the butt pad
        s.box((x0 + 0.05, 4.6, 12.8), (x1 - 0.05, 6.4, 12.8 + math.hypot(dz, dy)), "furniture",
              rot={"origin": (8, 4.6, 12.8), "axis": "x", "angle": ang})
        y_c = 2.7
        z_c = 12.8 + (4.6 - y_c) * dz / dy
        s.box((x0 + 0.1, y_c, z_c), (x1 - 0.1, 5.4, toe[0]), "furniture")  # heel fill
        return x0, x1

    s = w.variant("stock", "default")  # walnut sporting stock
    x0, x1 = wedge_stock(s)
    s.box((x0 - 0.15, 0.45, 21.2), (x1 + 0.15, 8.6, 21.95), "detail")  # recoil pad
    s.box((x0 - 0.1, 0.45, 21.15), (x1 + 0.1, 8.6, 21.2), "accent")  # white-line spacer
    s.box((7.7, 1.7, 18.6), (8.3, 2.35, 19.2), "detail")  # sling stud
    s = w.variant("stock", f"{NS}:lightweight_stock")  # skeletal synthetic
    s.box((6.8, 3.9, 9.0), (9.2, 9.15, 10.0), "furniture")
    s.box((7.1, 4.4, 9.8), (8.9, 8.95, 12.8), "furniture",
          rot={"origin": (8, 8.95, 9.8), "axis": "x", "angle": 3})
    s.box((7.25, 7.7, 12.0), (8.75, 8.85, 20.9), "furniture",
          rot={"origin": (8, 8.85, 12.0), "axis": "x", "angle": 2})  # top strut
    s.box((7.25, 3.4, 12.2), (8.75, 4.6, 20.9), "furniture",
          rot={"origin": (8, 4.6, 12.2), "axis": "x", "angle": 20})  # lower strut
    s.box((7.25, 1.0, 20.1), (8.75, 8.6, 21.0), "furniture")  # rear upright
    s.box((7.35, 2.9, 15.6), (8.65, 7.9, 16.5), "furniture")  # web brace
    s.box((7.05, 0.9, 21.0), (8.95, 8.8, 21.6), "detail")  # pad
    s = w.variant("stock", f"{NS}:precision_stock")  # monte-carlo stock, adjustable comb
    x0, x1 = wedge_stock(s, comb_drop=1.0, toe=(21.6, 0.6), width=2.5)
    s.box((7.1, 8.95, 14.4), (8.9, 9.95, 19.8), "furniture")  # adjustable comb
    for z in (15.2, 18.4):
        s.box((7.7, 8.6, z), (8.3, 8.95, z + 0.5), "metal")
    s.box((6.6, 7.4, 16.6), (6.75, 8.1, 17.4), "metal")  # comb lock knob
    s.box((6.75, 0.4, 21.6), (9.25, 8.7, 22.0), "metal")  # LOP spacer
    s.box((6.7, 0.2, 22.0), (9.3, 8.9, 22.9), "detail")  # thick pad
    s.box((7.65, 0.95, 20.2), (8.35, 1.55, 21.3), "detail")  # rear sling stud

    w.anim = {
        "pump": {"travel": [0, 0, 4.3]},
        "shell": {"from": [10.6, 1.4, 3.6], "to": list(shell_to)},
    }
    w.static_variant_slots = {"magazine"}
    w.points = {
        "grip": (8, 5.9, 11.6),
        "support": (8, 5.6, -7.5),
        "ejection": (9.4, 8.0, 2.8),
        "mag_well": (8, 4.8, 3.1),  # loading port
    }
    w.iron_sight_y = 10.3
    w.iron_sight_z = 7.8
    w.mounts = {
        "optic": (8, rail_top, 4.4),
        "tactical": (9.6, 6.6, -11.45),
        "charm": (8, 4.85, -11.45),
    }
    w.slots = {
        "optic": [f"{NS}:red_dot", f"{NS}:holo_sight"],
        "muzzle": [f"{NS}:suppressor", f"{NS}:shotgun_choke"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
