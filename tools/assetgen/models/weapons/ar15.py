"""AR-15 Carbine - reference design for the modular rifle platform.

Layout (model units): bore axis at x=8, y=8; muzzle toward -z. Upper receiver spans z 0..10.5,
free-float handguard z -15..0, buffer tube/stock behind z 11.5.
"""
from ccmodel import Weapon
from weapons.common import ALL_CHARMS, accent_strip, picatinny, side_slots

NS = "calibercraft"


def build():
    w = Weapon("ar15", "rifle")
    w.standard = {"receiver": "black_anodized", "furniture": "black_polymer", "metal": "parkerized",
                  "detail": "dark_steel", "mag": "tan_polymer", "accent": "gunmetal"}

    body = w.part("body")
    # Upper receiver
    body.box((6.6, 7.0, 0.0), (9.4, 9.9, 10.5), "receiver")
    rail_top = picatinny(body, 9.9, 0.0, 10.5)
    body.box((9.4, 7.1, 2.8), (9.45, 9.2, 7.2), "detail", faces=("east",))  # ejection port frame
    body.box((9.4, 6.7, 2.9), (10.0, 7.05, 7.1), "detail",
             rot={"origin": (9.4, 7.05, 5.0), "axis": "z", "angle": -25})  # open dust cover
    body.box((9.25, 8.5, 7.4), (10.1, 9.6, 9.1), "receiver")  # forward assist housing
    body.box((10.1, 8.75, 7.6), (10.4, 9.35, 8.9), "detail")  # forward assist button
    body.box((9.35, 8.9, 6.9), (9.95, 9.8, 7.5), "receiver")  # brass deflector
    accent_strip(body, 6.6, 9.4, 7.25, 7.45, 0.6, 2.4)
    # Lower receiver
    body.box((6.75, 4.8, 1.0), (9.25, 7.0, 11.5), "receiver")
    body.box((6.7, 2.4, 2.0), (9.3, 4.8, 5.6), "receiver")  # magwell
    body.box((6.6, 2.0, 1.8), (9.4, 2.6, 5.8), "receiver")  # flared magwell lip
    body.box((9.25, 4.95, 5.0), (9.5, 5.6, 5.6), "detail")  # mag release
    body.box((6.5, 5.6, 9.4), (6.75, 6.4, 10.4), "detail")  # safety selector (left)
    body.box((9.25, 5.7, 9.6), (9.45, 6.3, 10.2), "detail")  # selector (right)
    body.box((7.6, 2.7, 6.0), (8.4, 3.1, 10.3), "detail")  # trigger guard bottom
    body.box((7.6, 3.1, 6.0), (8.4, 4.8, 6.4), "detail")  # trigger guard front post
    body.box((7.8, 3.3, 7.3), (8.2, 4.8, 7.7), "metal",
             rot={"origin": (8, 4.8, 7.5), "axis": "x", "angle": -12})  # trigger
    body.box((6.75, 3.4, 11.5), (9.25, 7.0, 12.0), "receiver")  # receiver tail
    # Pistol grip
    grip_rot = {"origin": (8, 4.8, 10.6), "axis": "x", "angle": -22}
    body.box((6.9, -1.6, 9.5), (9.1, 4.8, 12.0), "furniture", rot=grip_rot)
    body.box((6.85, -1.2, 9.45), (9.15, 3.6, 9.9), "furniture", rot=grip_rot)  # finger ridge
    body.box((6.8, -1.9, 9.4), (9.2, -1.5, 12.1), "detail", rot=grip_rot)  # grip cap
    # Buffer tube & castle nut
    body.octo_rod(8, 8.0, 11.5, 20.5, 1.7, "receiver")
    body.octo_rod(8, 8.0, 11.5, 12.3, 2.4, "detail")
    body.box((8.9, 6.7, 12.3), (9.2, 7.6, 13.1), "detail")  # sling loop
    # Handguard (free float)
    body.box((6.3, 6.2, -15.0), (9.7, 9.9, 0.0), "receiver")
    body.box((6.45, 6.0, -14.8), (9.55, 6.2, -0.2), "receiver")  # rounded underside
    picatinny(body, 9.9, -15.0, 0.0)
    picatinny(body, 6.0, -12.5, -3.5, width=1.4, top=False)
    side_slots(body, 6.3, 9.7, 7.1, 8.5, (-13.5, -10.5, -7.5, -4.5), length=2.0)
    accent_strip(body, 6.3, 9.7, 9.15, 9.4, -14.5, -0.5)
    body.box((6.2, 6.1, -0.6), (9.8, 10.0, 0.0), "detail")  # barrel nut ring
    # Iron sights (flip-up)
    body.box((7.2, rail_top, -14.6), (8.8, rail_top + 0.4, -13.4), "detail")
    body.box((7.85, rail_top + 0.4, -14.2), (8.15, 12.1, -13.9), "detail")  # front post
    body.box((7.35, rail_top + 0.4, -14.3), (7.6, 11.9, -13.8), "detail")
    body.box((8.4, rail_top + 0.4, -14.3), (8.65, 11.9, -13.8), "detail")
    body.box((7.2, rail_top, 8.9), (8.8, rail_top + 0.4, 10.2), "detail")  # rear sight base
    body.box((7.4, rail_top + 0.4, 9.35), (7.75, 12.4, 9.75), "detail")  # rear aperture frame
    body.box((8.25, rail_top + 0.4, 9.35), (8.6, 12.4, 9.75), "detail")
    body.box((7.4, 12.05, 9.35), (8.6, 12.4, 9.75), "detail")
    body.box((7.4, rail_top + 0.4, 9.35), (8.6, 11.5, 9.75), "detail")

    # Charging handle (pulled back +z during charging)
    ch = w.part("charging_handle", animated=True)
    ch.box((7.3, 9.05, 10.5), (8.7, 9.75, 11.6), "detail")
    ch.box((6.5, 9.05, 11.6), (9.5, 9.75, 12.2), "detail")
    ch.box((6.3, 9.0, 11.7), (6.6, 9.8, 12.2), "metal")  # latch

    # Bolt carrier visible in the ejection port (cycles on each shot)
    bolt = w.part("bolt", animated=True)
    bolt.box((9.3, 7.7, 3.2), (9.42, 9.0, 6.8), "metal", faces=("east", "up", "down", "north", "south"))
    bolt.box((9.42, 8.1, 4.4), (9.5, 8.6, 5.6), "detail", faces=("east",))  # bolt face detail

    # Barrels
    def barrel(vid, z_tip, d, fluted=False, protector=True):
        b = w.variant("barrel", vid)
        b.octo_rod(8, 8, z_tip, -15.0, d, "metal")
        if fluted:
            for (y0, y1) in ((8 + d / 2 - 0.05, 8 + d / 2 + 0.03), (8 - d / 2 - 0.03, 8 - d / 2 + 0.05)):
                b.box((7.7, y0, z_tip + 1.5), (8.3, y1, -16.0), "detail")
        if protector:
            b.octo_rod(8, 8, z_tip, z_tip + 0.8, d + 0.25, "detail")  # thread protector / crown
        w.muzzle_by_barrel[vid] = (8, 8, z_tip)
        return b

    barrel("default", -21.5, 1.25)
    barrel(f"{NS}:short_barrel", -17.0, 1.25)
    barrel(f"{NS}:precision_barrel", -26.0, 1.45, fluted=True)
    barrel(f"{NS}:heavy_barrel", -23.0, 1.85)

    # Stocks
    s = w.variant("stock", "default")  # M4 collapsible
    s.box((6.8, 6.4, 15.5), (9.2, 9.4, 22.5), "furniture")
    s.box((6.9, 3.4, 18.6), (9.1, 6.8, 22.5), "furniture",
          rot={"origin": (8, 6.8, 22.5), "axis": "x", "angle": 20})
    s.box((6.7, 3.0, 22.5), (9.3, 9.6, 23.3), "detail")  # butt pad
    s.box((7.6, 5.9, 16.0), (8.4, 6.4, 19.0), "detail")  # adjustment lever
    s.box((6.75, 8.4, 16.5), (9.25, 9.0, 21.5), "furniture")  # cheek weld ridge
    s = w.variant("stock", f"{NS}:lightweight_stock")  # skeleton stock
    s.box((7.3, 8.5, 15.5), (8.7, 9.4, 22.6), "furniture")
    s.box((7.3, 3.6, 21.8), (8.7, 9.4, 22.6), "furniture")
    s.box((7.4, 5.8, 15.6), (8.6, 6.5, 22.2), "furniture",
          rot={"origin": (8, 6.2, 15.6), "axis": "x", "angle": 20})
    s.box((7.1, 3.2, 22.6), (8.9, 9.6, 23.2), "detail")
    s = w.variant("stock", f"{NS}:precision_stock")
    s.box((6.8, 4.0, 15.5), (9.2, 9.0, 23.0), "furniture")
    s.box((7.0, 9.6, 16.5), (9.0, 10.4, 21.0), "furniture")  # cheek riser
    s.box((7.7, 9.0, 17.2), (8.3, 9.6, 17.8), "metal")
    s.box((7.7, 9.0, 19.8), (8.3, 9.6, 20.4), "metal")
    s.box((6.7, 3.0, 23.0), (9.3, 9.8, 23.8), "detail")
    s.box((7.5, 2.6, 20.5), (8.5, 4.0, 21.5), "metal")  # monopod knob

    # Magazines (animated: drop straight down)
    curve = {"origin": (8, -0.5, 3.8), "axis": "x", "angle": 12}

    def stanag(m, x0, x1, bottom):
        m.box((x0, -0.5, 2.2), (x1, 4.6, 5.4), "mag")
        m.box((x0, bottom, 2.2), (x1, -0.5, 5.4), "mag", rot=curve)
        m.box((x0 - 0.1, bottom - 0.5, 2.0), (x1 + 0.1, bottom, 5.6), "detail", rot=curve)  # floor plate
        m.box((x0 - 0.05, bottom + 0.8, 2.6), (x1 + 0.05, -1.0, 2.9), "mag", rot=curve)  # rib
        m.box(((x0 + x1) / 2 - 0.55, 4.6, 2.6), ((x0 + x1) / 2 + 0.55, 4.95, 5.0), "brass")  # top round

    stanag(w.variant("magazine", "default"), 6.95, 9.05, -5.5)
    stanag(w.variant("magazine", f"{NS}:extended_mag"), 6.95, 9.05, -9.0)
    q = w.variant("magazine", f"{NS}:quick_mag")
    stanag(q, 6.95, 9.05, -5.5)
    q.box((4.75, -2.5, 2.2), (6.85, 3.2, 5.4), "mag")  # coupled spare
    q.box((4.75, -5.6, 2.2), (6.85, -2.5, 5.4), "mag", rot=curve)
    q.box((4.6, -1.4, 2.0), (9.2, -0.2, 5.6), "detail")  # coupler clamp
    q.box((7.6, -7.3, 3.4), (8.4, -6.0, 4.2), "shell", rot=curve)  # pull tab

    w.anim = {
        "magazine": {"pivot": [8, 4.6, 3.8], "style": "drop"},
        "charging_handle": {"travel": [0, 0, 4.5]},
        "bolt": {"travel": [0, 0, 2.6]},
    }
    w.points = {
        "grip": (8, 1.6, 11.4),
        "support": (8, 5.4, -8.0),
        "ejection": (9.6, 8.4, 5.0),
        "mag_well": (8, 2.6, 3.8),
    }
    w.iron_sight_y = 11.8
    w.iron_sight_z = 9.5
    w.mounts = {
        "optic": (8, rail_top, 4.2),
        "grip": (8, 5.2, -8.0),
        "tactical": (9.7, 8.0, -10.0),
        "charm": (9.05, 6.7, 12.7),
    }
    w.slots = {
        "optic": [f"{NS}:red_dot", f"{NS}:holo_sight", f"{NS}:acog_scope", f"{NS}:sniper_scope"],
        "muzzle": [f"{NS}:suppressor", f"{NS}:compensator", f"{NS}:muzzle_brake", f"{NS}:flash_hider"],
        "grip": [f"{NS}:vertical_grip", f"{NS}:angled_grip", f"{NS}:ergonomic_grip", f"{NS}:bipod"],
        "tactical": [f"{NS}:laser_sight"],
        "charm": ALL_CHARMS,
    }
    return w
