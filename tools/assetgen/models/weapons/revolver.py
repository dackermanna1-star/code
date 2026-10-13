"""Heavy Revolver - big-bore .44 double-action revolver (large frame, fluted six-shot cylinder).

Layout (model units): bore axis at x=8, y=8; muzzle toward -z. The frame front post ends at
z=-4.7 where the barrel variants start; cylinder window z -3.85..0, cylinder axis (8, 6.75).
The crane hinge sits in the frame at the front-bottom-left of the window; the grip is tilted back
24 degrees (GRIP_ROT) with a steel backstrap and wooden finger-groove stocks.
"""
import math

from ccmodel import Weapon
from weapons.common import ALL_CHARMS

NS = "calibercraft"

CYL_X, CYL_Y = 8.0, 6.75  # cylinder axis
CYL_A = 1.75  # cylinder inradius (dodecagon)
CYL_Z0, CYL_Z1 = -3.7, -0.3
CHAMBER_R = 1.25  # top chamber lines up with the bore (6.75 + 1.25 = 8)
CRANE_PIVOT = (7.1, 5.0, -3.85)

GRIP_ANGLE = -24.0
GRIP_ORIGIN = (8.0, 4.3, 1.1)
GRIP_ROT = {"origin": GRIP_ORIGIN, "axis": "x", "angle": GRIP_ANGLE}


def grip_pt(y, z, x=8.0):
    a = math.radians(GRIP_ANGLE)
    dy, dz = y - GRIP_ORIGIN[1], z - GRIP_ORIGIN[2]
    return (round(x, 3), round(GRIP_ORIGIN[1] + dy * math.cos(a) - dz * math.sin(a), 3),
            round(GRIP_ORIGIN[2] + dy * math.sin(a) + dz * math.cos(a), 3))


def zrot(cx, cy, z, angle):
    return {"origin": (cx, cy, z), "axis": "z", "angle": angle}


def dodeca(p, cx, cy, z0, z1, a, role, **kw):
    """Exact 12-sided prism along z (inradius a) built from six slabs (rotations stay within 30 deg)."""
    h = a * math.tan(math.radians(15))
    zc = (z0 + z1) / 2
    for ang in (0, 30, -30):
        r = zrot(cx, cy, zc, ang) if ang else None
        p.box((cx - a, cy - h, z0), (cx + a, cy + h, z1), role, rot=r, **kw)
        p.box((cx - h, cy - a, z0), (cx + h, cy + a, z1), role, rot=r, **kw)


def octa(p, cx, cy, z0, z1, a, role, **kw):
    """Exact octagonal prism along z (inradius a)."""
    h = a * math.tan(math.radians(22.5))
    zc = (z0 + z1) / 2
    p.box((cx - a, cy - h, z0), (cx + a, cy + h, z1), role, **kw)
    p.box((cx - h, cy - a, z0), (cx + h, cy + a, z1), role, **kw)
    p.box((cx - a, cy - h, z0), (cx + a, cy + h, z1), role, rot=zrot(cx, cy, zc, 45), **kw)
    p.box((cx - a, cy - h, z0), (cx + a, cy + h, z1), role, rot=zrot(cx, cy, zc, -45), **kw)


def low_rail(p, y, z0, z1, width=1.5, x=8.0, role="detail"):
    """Low-profile picatinny section (top). Returns the rail surface height."""
    p.box((x - width / 2, y, z0), (x + width / 2, y + 0.3, z1), role)
    z = z0 + 0.3
    while z + 0.5 <= z1 - 0.15:
        p.box((x - width / 2 - 0.1, y + 0.3, z), (x + width / 2 + 0.1, y + 0.55, z + 0.5), role)
        z += 1.0
    return y + 0.55


def build():
    w = Weapon("revolver", "revolver")
    w.standard = {"receiver": "stainless", "furniture": "dark_walnut", "metal": "stainless",
                  "detail": "dark_steel", "accent": "gunmetal"}

    body = w.part("body")
    # ---------------------------------------------------------------- frame
    body.box((6.75, 4.3, -4.7), (9.25, 9.4, -3.85), "receiver")  # front post (crane seat)
    body.box((7.0, 9.4, -4.7), (9.0, 9.6, -3.85), "receiver")
    body.box((6.95, 8.65, -3.85), (9.05, 9.6, 0.0), "receiver")  # top strap
    body.box((6.75, 4.3, -3.85), (9.25, 4.85, 0.0), "receiver")  # frame bottom under the cylinder
    body.box((6.75, 4.3, 0.0), (9.25, 9.6, 0.9), "receiver")  # recoil shield
    body.box((7.1, 4.3, 0.9), (8.9, 8.55, 2.3), "receiver")  # hammer housing
    body.box((7.1, 8.55, 0.9), (7.62, 9.15, 1.8), "receiver")  # hammer slot flanks
    body.box((8.38, 8.55, 0.9), (8.9, 9.15, 1.8), "receiver")
    body.box((7.1, 3.55, -1.7), (8.9, 4.3, 1.4), "receiver")  # trigger housing
    # side plate outline + screws (right), thumb latch (left)
    body.box((9.25, 4.6, 0.15), (9.3, 8.9, 0.7), "detail", faces=("east",))
    for (y, z) in ((5.2, -3.4), (8.0, 0.45), (5.0, 0.45)):
        body.box((9.25, y, z), (9.32, y + 0.3, z + 0.3), "metal")
    body.box((8.9, 6.1, 1.35), (8.96, 6.4, 1.65), "metal", faces=("east",))  # hammer pin
    body.box((7.04, 6.1, 1.35), (7.1, 6.4, 1.65), "metal", faces=("west",))
    body.box((6.45, 6.85, 0.25), (6.75, 7.55, 1.6), "detail")  # cylinder release latch
    for z in (0.45, 0.85, 1.25):
        body.box((6.38, 6.9, z), (6.45, 7.5, z + 0.18), "detail")
    body.box((8.6, 4.85, -0.25), (9.0, 5.05, 0.0), "metal")  # cylinder stop
    # glow strips along the top strap flanks
    body.box((9.05, 9.0, -3.6), (9.12, 9.15, -0.3), "accent", glow=True)
    body.box((6.88, 9.0, -3.6), (6.95, 9.15, -0.3), "accent", glow=True)
    # optics rail on the top strap + adjustable rear sight
    rail_top = low_rail(body, 9.6, -3.75, -0.75, width=1.5)
    body.box((7.3, 9.6, -0.6), (8.7, 9.95, 0.95), "detail")  # rear sight base
    body.box((7.2, 9.95, 0.35), (7.8, 10.5, 0.85), "detail")  # rear blade ears (notch between)
    body.box((8.2, 9.95, 0.35), (8.8, 10.5, 0.85), "detail")
    body.box((7.8, 9.95, 0.35), (8.2, 10.2, 0.85), "detail")
    body.box((8.8, 9.7, -0.2), (9.0, 9.9, 0.1), "metal")  # windage screw
    # trigger guard (round-backed) + wide double-action trigger
    body.box((7.6, 3.0, -1.65), (8.4, 4.3, -1.2), "receiver")  # front
    body.box((7.6, 2.6, -1.45), (8.4, 3.05, 1.75), "receiver")  # bottom
    body.box((7.6, 2.8, -1.6), (8.4, 3.3, -1.1), "receiver")  # rounded corner fill
    tr = {"origin": (8.0, 4.3, -0.15), "axis": "x", "angle": -16}
    body.box((7.7, 3.05, -0.45), (8.3, 4.35, 0.1), "detail", rot=tr)
    body.box((7.65, 2.95, -0.25), (8.35, 3.45, 0.35), "detail", rot=tr)  # trigger toe

    # ---------------------------------------------------------------- grip (tilted)
    body.box((7.35, -0.1, 1.1), (8.65, 6.6, 3.95), "receiver", rot=GRIP_ROT)  # grip frame + tang
    body.box((7.45, -0.25, 3.9), (8.55, 6.7, 4.25), "receiver", rot=GRIP_ROT)  # exposed backstrap
    body.box((7.2, 5.4, 2.2), (8.8, 6.75, 4.1), "receiver", rot=GRIP_ROT)  # frame hump flanks
    body.box((6.85, -0.4, 0.95), (9.15, 4.25, 3.95), "furniture", rot=GRIP_ROT)  # wooden stocks
    for y in (0.2, 1.4, 2.6):  # finger grooves (front)
        body.box((6.95, y, 0.6), (9.05, y + 0.75, 1.0), "furniture", rot=GRIP_ROT)
    body.box((6.9, -0.7, 1.1), (9.1, -0.35, 4.1), "furniture", rot=GRIP_ROT)  # butt toe
    for xs, face in (((9.15, 9.2), "east"), ((6.8, 6.85), "west")):
        x0, x1 = xs
        body.box((x0, 0.15, 1.55), (x1, 3.0, 3.6), "furniture", rot=GRIP_ROT, faces=(face,))  # checkered panel
        xm0, xm1 = (x1, x1 + 0.06) if face == "east" else (x0 - 0.06, x0)
        for y in (0.55, 1.15, 1.75, 2.35):
            body.box((xm0, y, 1.7), (xm1, y + 0.12, 3.45), "detail", rot=GRIP_ROT, faces=(face,))
        body.box((xm0, 3.25, 2.2), (xm1, 3.9, 2.85), "accent", rot=GRIP_ROT)  # medallion
        body.box((xm0, 1.3, 3.65), (xm1, 1.6, 3.9), "metal", rot=GRIP_ROT)  # grip screw
    body.box((7.75, -1.0, 3.2), (8.25, -0.6, 3.9), "metal", rot=GRIP_ROT)  # lanyard ring

    # ---------------------------------------------------------------- cylinder (animated: swings out left)
    cyl = w.part("cylinder", animated=True)
    dodeca(cyl, CYL_X, CYL_Y, CYL_Z0, CYL_Z1, CYL_A, "metal")
    zc = (CYL_Z0 + CYL_Z1) / 2
    fz0, fz1 = CYL_Z0 + 0.55, CYL_Z1 - 0.7
    a = CYL_A
    # flutes between the chambers (0, 60, 120, 180, 240, 300 deg) as darker inset strips
    cyl.box((CYL_X + a, CYL_Y - 0.28, fz0), (CYL_X + a + 0.05, CYL_Y + 0.28, fz1), "detail")
    cyl.box((CYL_X - a - 0.05, CYL_Y - 0.28, fz0), (CYL_X - a, CYL_Y + 0.28, fz1), "detail")
    for (sy, ang) in ((1, -30), (1, 30), (-1, -30), (-1, 30)):
        y0 = CYL_Y + sy * a
        cyl.box((CYL_X - 0.28, min(y0, y0 + sy * 0.05), fz0), (CYL_X + 0.28, max(y0, y0 + sy * 0.05), fz1),
                "detail", rot=zrot(CYL_X, CYL_Y, zc, ang))
    # chambers: brass case heads + primers at the rear, dark chamber mouths at the front
    for k in range(6):
        phi = math.radians(90 + 60 * k)
        cx, cy = CYL_X + CHAMBER_R * math.cos(phi), CYL_Y + CHAMBER_R * math.sin(phi)
        cyl.cbox((cx, cy, CYL_Z1 + 0.075), (0.78, 0.78, 0.15), "brass")  # case rim
        cyl.cbox((cx, cy, CYL_Z1 + 0.175), (0.3, 0.3, 0.05), "metal")  # primer
        cyl.cbox((cx, cy, CYL_Z0 - 0.025), (0.62, 0.62, 0.05), "detail")  # chamber mouth
        # cylinder stop notches on the outer surface near the rear
        if k in (1, 2, 4, 5):
            ang = 30 if k in (2, 4) else -30
            ox = CYL_X + (a if k in (4, 5) else -a)
            sgn = 1 if k in (4, 5) else -1
            cyl.box((min(ox, ox + sgn * 0.05), CYL_Y - 0.2, CYL_Z1 - 0.55),
                    (max(ox, ox + sgn * 0.05), CYL_Y + 0.2, CYL_Z1 - 0.2), "detail",
                    rot=zrot(CYL_X, CYL_Y, zc, ang))
    cyl.cbox((CYL_X, CYL_Y, CYL_Z1 + 0.05), (0.9, 0.9, 0.1), "metal")  # extractor star
    cyl.cbox((CYL_X, CYL_Y, CYL_Z0 - 0.08), (1.1, 1.1, 0.1), "metal")  # front hub
    cyl.rod(CYL_X, CYL_Y, -7.3, CYL_Z0, 0.45, "metal")  # ejector rod
    cyl.rod(CYL_X, CYL_Y, -7.35, -6.85, 0.62, "metal")  # knurled rod head
    # crane (yoke) plate in front of the cylinder down to the hinge
    cyl.box((6.85, 4.95, -3.84), (8.35, 7.15, -3.72), "receiver")
    cyl.rod(CRANE_PIVOT[0], CRANE_PIVOT[1] + 0.1, -3.84, -3.35, 0.5, "receiver")  # hinge knuckle

    # ---------------------------------------------------------------- hammer (animated)
    hm = w.part("hammer", animated=True)
    hm.box((7.65, 6.6, 1.0), (8.35, 9.3, 1.75), "detail")
    hrot = {"origin": (8.0, 9.2, 1.4), "axis": "x", "angle": -30}
    hm.box((7.65, 8.9, 1.2), (8.35, 9.75, 2.75), "detail", rot=hrot)  # spur
    hm.box((7.6, 9.75, 1.7), (8.4, 9.85, 2.7), "metal", rot=hrot)  # spur checkering
    hm.box((7.85, 8.9, 0.85), (8.15, 9.15, 1.0), "metal")  # firing pin nose

    # ---------------------------------------------------------------- barrels
    def barrel(vid, length, lug_to, vent_rib=False, ports=False):
        tip = -4.7 - length
        b = w.variant("barrel", vid)
        octa(b, 8, 8, tip + 0.05, -4.7, 0.8, "metal")
        b.box((7.4, 7.4, tip), (8.6, 8.6, tip + 0.05), "detail", faces=("north",))  # crown
        b.box((7.75, 7.75, tip - 0.03), (8.25, 8.25, tip), "detail", faces=("north",))  # bore
        # underlug / ejector rod shroud
        lz0 = tip + 0.65 if lug_to is None else lug_to
        b.box((7.3, 6.1, lz0), (8.7, 7.55, -4.7), "metal")
        b.box((7.45, 5.95, lz0 + 0.25), (8.55, 6.15, -4.75), "metal")  # rounded underside
        b.box((7.3, 6.15, lz0 - 0.5), (8.7, 7.45, lz0), "metal",
              rot={"origin": (8, 7.45, lz0), "axis": "x", "angle": -35})  # tapered nose
        # top rib
        if vent_rib:
            b.box((7.6, 8.5, tip + 0.3), (8.4, 8.9, -4.7), "metal")
            z = tip + 0.6
            while z + 0.5 < -5.0:
                b.box((7.6, 8.9, z), (8.4, 9.1, z + 0.5), "metal")  # rib posts
                z += 1.0
            b.box((7.4, 9.1, tip + 0.3), (8.6, 9.4, -4.7), "metal")  # sight plane
            b.box((7.55, 9.4, tip + 0.4), (8.45, 9.43, -4.8), "detail")  # matte strip
        else:
            b.box((7.45, 8.5, tip + 0.2), (8.55, 9.35, -4.7), "metal")
            b.box((7.6, 9.35, tip + 0.3), (8.4, 9.38, -4.8), "detail")  # matte strip
        # ramp front sight with a red insert
        sz = tip + 0.35
        b.box((7.8, 9.3, sz), (8.2, 10.35, sz + 0.9), "detail")
        b.box((7.8, 9.0, sz + 0.55), (8.2, 9.9, sz + 1.6), "detail",
              rot={"origin": (8, 9.3, sz + 0.9), "axis": "x", "angle": 35})  # ramp
        b.box((7.85, 9.75, sz + 0.9), (8.15, 10.2, sz + 0.95), "shell", faces=("south",))  # red insert
        if ports:
            for z in (tip + 1.4, tip + 2.3):
                b.box((7.7, 9.38, z), (8.3, 9.42, z + 0.5), "detail")
        w.muzzle_by_barrel[vid] = (8, 8, tip)
        return b

    barrel("default", 6.0, -8.25)
    barrel(f"{NS}:short_barrel", 3.0, None)
    barrel(f"{NS}:precision_barrel", 9.0, None, vent_rib=True, ports=True)

    # ---------------------------------------------------------------- metadata
    w.anim = {
        "cylinder": {"pivot": list(CRANE_PIVOT), "swing_deg": -75,
                     "spin_center": [CYL_X, CYL_Y, round((CYL_Z0 + CYL_Z1) / 2, 3)], "chambers": 6},
        "hammer": {"pivot": [8, 7.2, 1.4], "cock_deg": -35},
    }
    w.points = {
        "grip": grip_pt(2.0, 2.5),
        "support": grip_pt(1.0, 2.0, x=6.6),
        "ejection": (CYL_X, CYL_Y, CYL_Z1),
    }
    w.iron_sight_y = 10.3
    w.iron_sight_z = 0.6
    w.mounts = {
        "optic": (8, rail_top, -2.25),
        "tactical": (8.7, 6.8, -5.6),  # right flank of the ejector shroud / underlug
        "charm": grip_pt(-1.0, 3.55),
    }
    w.slots = {
        "optic": [f"{NS}:red_dot", f"{NS}:acog_scope"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
