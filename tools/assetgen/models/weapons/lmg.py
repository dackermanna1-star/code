"""LMG - belt-fed 5.56 light machine gun (original design).

Layout (model units): bore axis x=8, y=8, muzzle toward -z. Box receiver z 0..13 (x 6.2..9.8), feed cover
on top z 0.4..8.6 hinged at the front (rail for optics), ammo box hanging under the left of the receiver
with a short brass belt climbing into the feed tray, ribbed lower handguard + heat shield + carry
handle in front of the receiver, perforated barrel jacket and fixed gas tube up to the gas block at
z -14..-12.6. Stock (variant) behind z 13.
"""
import math

from ccmodel import Part, Weapon
from weapons.common import ALL_CHARMS, accent_strip, picatinny

NS = "calibercraft"
BOX_TOP = 5.0  # ammo box top (all box variants)
BOX_PIVOT = (6.2, BOX_TOP, 4.2)


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


def ammo_box(m: Part, x0, x1, bottom, z0, z1, quick=False):
    """Hard ammo box hanging under the receiver; belt exit at the top-left."""
    m.box((x0, bottom, z0), (x1, BOX_TOP - 0.5, z1), "mag")
    m.box((x0 - 0.1, BOX_TOP - 0.5, z0 - 0.1), (x1 + 0.1, BOX_TOP, z1 + 0.1), "mag")  # lid
    m.box((x0 + 1.5, BOX_TOP - 0.05, z0 + 0.4), (x1 - 0.2, BOX_TOP + 0.05, z1 - 0.4), "detail", faces=("up",))
    m.box((x0 - 0.05, bottom + 0.6, z0 + 0.5), (x0, BOX_TOP - 1.0, z1 - 0.5), "mag", faces=("west",))
    for y in (bottom + 1.2, (bottom + BOX_TOP) / 2):  # stiffening ribs
        m.box((x0 - 0.06, y, z0 - 0.06), (x1 + 0.06, y + 0.35, z1 + 0.06), "mag")
    m.box((x0 + 0.3, BOX_TOP - 0.1, z0 + 0.6), (x0 + 1.4, BOX_TOP + 0.25, z1 - 0.6), "detail")  # belt exit
    m.box((x1, BOX_TOP - 1.6, (z0 + z1) / 2 - 0.5), (x1 + 0.25, BOX_TOP - 0.6, (z0 + z1) / 2 + 0.5), "metal")
    m.box((x0 + 0.4, bottom - 0.3, z0 + 0.3), (x1 - 0.4, bottom, z1 - 0.3), "detail")  # base skid
    m.box(((x0 + x1) / 2 - 0.25, bottom + 1.8, z0 - 0.15), ((x0 + x1) / 2 + 0.25, BOX_TOP - 1.2, z0), "detail")
    if quick:  # quick-release latch and pull handle
        m.box((x1, BOX_TOP - 2.2, z0 + 0.8), (x1 + 0.3, BOX_TOP - 0.4, z0 + 1.4), "metal")  # latch
        for zp in (z0 + 1.5, z1 - 1.2):  # pull handle loop
            m.box((x1, BOX_TOP - 1.0, zp), (x1 + 0.45, BOX_TOP - 0.6, zp + 0.4), "detail")
        m.box((x1 + 0.45, BOX_TOP - 1.05, z0 + 0.6), (x1 + 0.75, BOX_TOP - 0.55, z1 - 0.6), "detail")
        m.box((x1 + 0.5, BOX_TOP - 2.0, z1 - 1.0), (x1 + 0.7, BOX_TOP - 1.05, z1 - 0.6), "shell")  # red tab
        m.box((x0 + 1.6, BOX_TOP + 0.05, (z0 + z1) / 2 - 1.2), (x1 - 0.6, BOX_TOP + 0.45, (z0 + z1) / 2 - 0.9), "detail")
        m.box((x0 + 1.6, BOX_TOP + 0.05, (z0 + z1) / 2 + 0.9), (x1 - 0.6, BOX_TOP + 0.45, (z0 + z1) / 2 + 1.2), "detail")
        m.box((x0 + 1.6, BOX_TOP + 0.45, (z0 + z1) / 2 - 1.2), (x1 - 0.6, BOX_TOP + 0.7, (z0 + z1) / 2 + 1.2), "detail")


def build():
    w = Weapon("lmg", "lmg")
    w.standard = {"receiver": "parkerized", "furniture": "black_polymer", "metal": "dark_steel",
                  "detail": "dark_steel", "mag": "od_polymer", "accent": "gunmetal"}

    body = w.part("body")
    # ---- Receiver (stamped box) with a recessed ejection port on the right z 5..9
    body.box((6.2, 5.4, 0.0), (9.3, 9.6, 13.0), "receiver")
    body.box((9.3, 5.4, 0.0), (9.8, 6.0, 13.0), "receiver")
    body.box((9.3, 7.4, 0.0), (9.8, 9.6, 13.0), "receiver")
    body.box((9.3, 6.0, 0.0), (9.8, 7.4, 5.0), "receiver")
    body.box((9.3, 6.0, 9.0), (9.8, 7.4, 13.0), "receiver")
    body.box((9.3, 6.15, 5.0), (9.35, 7.25, 9.0), "metal", faces=("east",))  # bolt
    body.box((9.8, 5.55, 5.0), (10.25, 5.85, 9.0), "detail",
             rot={"origin": (9.8, 5.85, 7.0), "axis": "z", "angle": -35})  # open dust cover
    body.box((9.8, 7.85, 1.3), (9.85, 8.15, 6.8), "detail", faces=("east",))  # charging slot
    for x0, x1 in ((9.8, 9.9), (6.1, 6.2)):  # stamped rib + rivets on both sides
        body.box((x0, 8.7, 0.4), (x1, 9.0, 12.6), "receiver")
        for z in (0.6, 10.0, 12.3):
            body.box((x0, 6.05, z), (x1, 6.4, z + 0.35), "detail")
    body.box((6.1, 6.6, 7.6), (6.2, 6.9, 12.6), "receiver")  # left lower rib
    accent_strip(body, 6.1, 9.9, 9.15, 9.3, 9.0, 12.6)
    # feed tray (visible with the cover open) and belt guide on the left
    body.box((6.4, 9.6, 2.4), (9.6, 9.65, 6.8), "metal", faces=("up",))
    body.box((6.4, 9.65, 2.4), (6.9, 9.95, 6.8), "detail")
    body.box((5.4, 8.1, 2.4), (6.2, 8.4, 6.8), "detail")  # feed tray lip (left)
    body.box((5.6, 8.4, 2.4), (6.2, 9.5, 2.7), "detail")
    body.box((5.6, 8.4, 6.5), (6.2, 9.5, 6.8), "detail")
    # front hinge block and rear top with rear sight
    body.box((6.0, 9.3, -0.3), (10.0, 10.2, 0.6), "detail")
    body.box((5.9, 9.75, -0.05), (10.1, 10.15, 0.35), "metal")  # hinge pin
    body.box((7.2, 9.6, 9.4), (8.8, 10.0, 11.2), "detail")  # rear sight base
    body.box((7.3, 10.0, 10.0), (7.7, 12.0, 10.4), "detail")
    body.box((8.3, 10.0, 10.0), (8.7, 12.0, 10.4), "detail")
    body.box((7.3, 11.7, 10.0), (8.7, 12.0, 10.4), "detail")
    body.box((7.3, 10.0, 10.0), (8.7, 11.2, 10.4), "detail")
    body.box((8.8, 9.7, 9.6), (9.4, 10.5, 10.8), "metal")  # elevation drum
    # trigger housing, guard, grip
    body.box((6.9, 4.6, 7.2), (9.1, 5.4, 12.8), "detail")
    body.box((7.6, 1.9, 7.6), (8.4, 2.3, 10.8), "detail")
    body.box((7.6, 2.3, 7.6), (8.4, 4.6, 8.0), "detail")
    body.box((7.8, 2.6, 8.7), (8.2, 4.6, 9.1), "metal",
             rot={"origin": (8, 4.6, 8.9), "axis": "x", "angle": -12})  # trigger
    body.box((6.7, 3.6, 10.6), (9.3, 4.1, 11.2), "metal")  # cross-bolt safety
    grip_rot = {"origin": (8, 4.6, 11.0), "axis": "x", "angle": -18}
    body.box((6.9, -1.4, 9.9), (9.1, 4.6, 12.3), "furniture", rot=grip_rot)
    body.box((6.85, -0.8, 9.85), (9.15, 3.4, 10.3), "furniture", rot=grip_rot)  # finger ridge
    body.box((6.8, -1.8, 9.8), (9.2, -1.4, 12.4), "detail", rot=grip_rot)
    body.box((9.1, -0.4, 10.6), (9.15, 3.2, 11.9), "detail", faces=("east",), rot=grip_rot)
    body.box((6.85, -0.4, 10.6), (6.9, 3.2, 11.9), "detail", faces=("west",), rot=grip_rot)
    # ammo box bracket under the left half
    body.box((5.5, BOX_TOP, 1.2), (8.6, 5.4, 7.4), "detail")
    body.box((5.5, 5.4, 6.0), (6.2, 6.2, 7.4), "detail")  # latch housing (left)
    body.box((10.1, 5.0, 12.9), (10.5, 5.6, 13.5), "detail")  # sling loop (charm)
    body.box((9.8, 5.2, 13.0), (10.1, 5.4, 13.4), "detail")
    # ---- Front end: ribbed lower handguard, heat shield, carry handle
    body.box((6.4, 5.0, -9.2), (9.6, 8.4, -0.2), "furniture")
    z = -8.8
    while z + 0.45 <= -0.6:
        body.box((6.3, 4.9, z), (9.7, 7.2, z + 0.45), "furniture")
        z += 0.9
    tac_x = side_rail(body, 9.7, 7.85, -7.6, -2.6)
    grip_y = picatinny(body, 4.9, -7.8, -2.2, width=1.4, top=False)
    body.box((6.6, 5.2, -0.2), (9.4, 8.6, 0.0), "detail")  # handguard retainer
    body.box((7.0, 8.95, -9.0), (9.0, 9.3, -0.3), "metal")  # heat shield
    z = -8.8
    while z + 0.4 <= -0.6:
        body.box((6.9, 9.3, z), (9.1, 9.55, z + 0.4), "metal")
        z += 0.9
    body.box((6.9, 8.6, -9.0), (7.0, 9.3, -0.3), "metal")  # shield skirts
    body.box((9.0, 8.6, -9.0), (9.1, 9.3, -0.3), "metal")
    body.box((7.6, 9.55, -6.9), (8.4, 10.3, -6.3), "detail")  # carry handle posts
    body.box((7.6, 9.55, -2.0), (8.4, 10.3, -1.4), "detail")
    body.box((7.45, 10.3, -7.1), (8.55, 11.0, -1.2), "furniture")  # carry handle
    body.box((7.4, 10.4, -6.0), (8.6, 10.9, -2.3), "detail")  # handle grip texture
    # perforated barrel jacket, gas tube, gas block, front sight
    jz0, jz1 = -12.6, -9.2
    body.octo_rod(8, 8, jz0, jz1, 2.3, "receiver")
    for z in (-12.1, -11.1, -10.1):
        body.box((9.11, 7.7, z), (9.2, 8.3, z + 0.5), "detail")  # vent holes
        body.box((6.8, 7.7, z), (6.89, 8.3, z + 0.5), "detail")
        body.box((7.7, 9.13, z), (8.3, 9.2, z + 0.5), "detail")
    body.octo_rod(8, 6.15, -14.0, -9.2, 0.9, "metal")  # gas tube
    body.box((7.0, 5.4, -14.0), (9.0, 9.2, -12.6), "metal")  # gas block
    body.box((6.4, 5.7, -13.7), (7.0, 6.6, -12.9), "detail")  # gas regulator
    body.box((7.3, 9.2, -13.9), (8.7, 9.8, -12.8), "detail")  # front sight base
    body.box((7.85, 9.8, -13.5), (8.15, 11.5, -13.2), "detail")  # post
    body.box((7.3, 9.8, -13.6), (7.55, 11.3, -13.1), "detail")  # ears
    body.box((8.45, 9.8, -13.6), (8.7, 11.3, -13.1), "detail")

    # ---- Feed cover (hinged at the front, rear lifts) with optics rail
    fc = w.part("feed_cover", animated=True)
    fc.box((6.1, 9.6, 0.4), (9.9, 10.5, 8.6), "receiver")
    fc.box((6.4, 10.5, 0.6), (9.6, 10.7, 8.4), "receiver")
    cover_rail = picatinny(fc, 10.7, 1.0, 8.2)
    fc.box((7.0, 9.9, 8.6), (9.0, 10.5, 9.2), "detail")  # latch
    fc.box((7.4, 10.0, 9.2), (8.6, 10.35, 9.5), "metal")
    fc.box((6.05, 9.65, 1.2), (6.1, 10.35, 7.8), "detail", faces=("west",))  # side pressings
    fc.box((9.9, 9.65, 1.2), (9.95, 10.35, 7.8), "detail", faces=("east",))
    fc.box((5.88, 9.7, -0.1), (6.0, 10.2, 0.9), "metal")  # hinge ears around the pin
    fc.box((10.0, 9.7, -0.1), (10.12, 10.2, 0.9), "metal")

    # ---- Belt: links of brass rounds rising from the box exit into the feed tray (moves with the box)
    belt = w.part("belt", animated=True)
    path = ((4.75, 5.4), (4.55, 6.1), (4.5, 6.85), (4.65, 7.6), (5.05, 8.25), (5.6, 8.8), (6.3, 9.2))
    for i, (x, y) in enumerate(path):
        nxt = path[min(i + 1, len(path) - 1)]
        prv = path[max(i - 1, 0)]
        ang = math.degrees(math.atan2(nxt[1] - prv[1], nxt[0] - prv[0]))
        belt.box((x - 0.27, y - 0.27, 3.4), (x + 0.27, y + 0.27, 5.6), "brass")  # case
        belt.box((x - 0.2, y - 0.2, 2.9), (x + 0.2, y + 0.2, 3.4), "brass")  # bullet
        belt.box((x - 0.31, y - 0.31, 5.55), (x + 0.31, y + 0.31, 5.7), "brass")  # rim
        for zl in (3.7, 4.9):  # links
            belt.box((x - 0.34, y - 0.34, zl), (x + 0.34, y + 0.34, zl + 0.32), "detail",
                     rot={"origin": (x, y, zl), "axis": "z", "angle": max(-45, min(45, ang - 90))})

    # ---- Charging handle (right side, front)
    ch = w.part("charging_handle", animated=True)
    ch.box((9.8, 7.75, 1.5), (10.4, 8.25, 2.5), "metal")
    ch.box((10.4, 7.5, 1.4), (11.4, 8.5, 2.6), "detail")
    ch.box((11.4, 7.65, 1.55), (11.6, 8.35, 2.45), "detail")

    # ---- Barrels
    def barrel(vid, z_tip, d):
        b = w.variant("barrel", vid)
        b.octo_rod(8, 8, z_tip + 0.05, -0.2, d, "metal")
        b.octo_rod(8, 8, z_tip, z_tip + 0.7, d + 0.2, "detail")
        w.muzzle_by_barrel[vid] = (8, 8, z_tip)
        return b

    barrel("default", -21.0, 1.6)
    barrel(f"{NS}:short_barrel", -15.4, 1.6)
    hb = barrel(f"{NS}:heavy_barrel", -22.0, 2.1)
    hb.box((7.7, 9.0, -21.0), (8.3, 9.1, -14.4), "detail", faces=("up",))

    # ---- Ammo boxes (drop straight down, pivot at the top centre)
    ammo_box(w.variant("magazine", "default"), 3.9, 8.5, 0.0, 1.4, 7.2)
    ammo_box(w.variant("magazine", f"{NS}:extended_mag"), 3.6, 8.6, -2.6, 1.0, 7.3)
    ammo_box(w.variant("magazine", f"{NS}:quick_mag"), 3.9, 8.5, 0.0, 1.4, 7.2, quick=True)

    # ---- Stocks
    s = w.variant("stock", "default")  # fixed skeletal stock with a centre web
    s.box((6.7, 5.6, 13.0), (9.3, 9.4, 14.2), "detail")  # buffer housing
    s.box((6.9, 7.7, 14.2), (9.1, 9.3, 22.0), "furniture")  # top beam
    dz, dy = 21.6 - 14.0, 5.6 - 2.0
    s.box((6.9, 5.6, 14.0), (9.1, 6.9, 14.0 + math.hypot(dz, dy)), "furniture",
          rot={"origin": (8, 5.6, 14.0), "axis": "x", "angle": math.degrees(math.atan2(dy, dz))})  # lower beam
    s.box((7.5, 4.0, 14.6), (8.5, 7.7, 20.6), "furniture")  # centre web
    s.box((6.9, 1.6, 20.6), (9.1, 9.3, 22.0), "furniture")  # butt
    s.box((6.8, 1.4, 22.0), (9.2, 9.6, 22.7), "detail")  # pad
    s.box((7.2, 9.3, 21.2), (8.8, 9.8, 22.6), "metal")  # shoulder rest (folded)
    s.box((9.1, 8.1, 15.0), (9.15, 8.9, 20.2), "detail", faces=("east",))
    s.box((6.85, 8.1, 15.0), (6.9, 8.9, 20.2), "detail", faces=("west",))
    s = w.variant("stock", f"{NS}:lightweight_stock")  # collapsible two-rod para stock
    s.box((6.7, 5.6, 13.0), (9.3, 9.4, 14.0), "detail")
    s.octo_rod(6.9, 8.6, 14.0, 21.0, 0.7, "metal")
    s.octo_rod(9.1, 8.6, 14.0, 21.0, 0.7, "metal")
    s.box((6.5, 5.6, 14.0), (9.5, 6.4, 15.2), "detail")  # release catch
    s.box((6.5, 3.0, 21.0), (9.5, 9.4, 21.8), "furniture")  # butt plate
    s.box((6.45, 2.8, 21.8), (9.55, 9.6, 22.3), "detail")

    w.anim = {
        "magazine": {"pivot": list(BOX_PIVOT), "style": "drop"},
        "feed_cover": {"pivot": [8, 10.0, 0.15], "open_deg": -70},
        "belt": {"follow": "magazine"},
        "charging_handle": {"travel": [0, 0, 4.0]},
    }
    w.points = {
        "grip": (8, 2.0, 11.7),
        "support": (8, 4.6, -5.0),
        "ejection": (9.8, 6.7, 7.0),
        "mag_well": BOX_PIVOT,
    }
    w.iron_sight_y = 11.45
    w.iron_sight_z = 10.2
    w.mounts = {
        "optic": (8, cover_rail, 4.6),  # on the (animated) feed cover rail
        "grip": (8, grip_y, -5.0),
        "tactical": (tac_x, 7.85, -5.0),
        "charm": (10.3, 5.0, 13.2),
    }
    w.slots = {
        "optic": [f"{NS}:red_dot", f"{NS}:holo_sight", f"{NS}:acog_scope"],
        "muzzle": [f"{NS}:flash_hider", f"{NS}:suppressor", f"{NS}:compensator"],
        "grip": [f"{NS}:bipod", f"{NS}:vertical_grip"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
