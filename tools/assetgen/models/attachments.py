"""
Attachment geometry in *mount-local* coordinates. The generator translates each attachment to the
mount point declared by the weapon. Conventions (x right, y up, muzzle toward -z):

* optic    : origin = centre of the top rail surface; body sits at y >= 0, centred on x = 0.
             `sight_height` = height of the eye line above the rail.
* muzzle   : origin = bore axis at the muzzle tip; device extends toward -z over `length`.
* grip     : origin = centre of the bottom rail surface; grip hangs toward -y.
* tactical : origin = centre of the right-hand side rail surface; device extends toward +x.
* charm    : origin = hanging point; charm dangles toward -y.

Barrels, stocks and magazines are weapon-specific *variants* (see weapons/*.py); the shapes here are
only the stand-alone item models for those attachment items.
"""
from ccmodel import Attachment, Part
from skins import tex

BLK = tex("black_anodized")
STEEL = tex("dark_steel")
GUNMETAL = tex("gunmetal")
GLASS = tex("glass_lens")
RED = tex("glow_red")
AMBER = tex("glow_amber")
GREEN = tex("glow_green")
RUBBER = tex("rubber")
POLY = tex("black_polymer")
STAINLESS = tex("stainless")
BRASS = tex("brass")
GREEN_PLASTIC = tex("green_plastic")
TAN = tex("tan_polymer")


def _p(name):
    return Part(name)


def t(part, frm, to, texture, **kw):
    part.box(frm, to, "detail", texture=texture, **kw)


def rail_clamp(p, z0, z1, w=2.0, h=0.7):
    t(p, (-w / 2, 0, z0), (w / 2, h, z1), BLK)
    t(p, (-w / 2 - 0.25, 0, z0 + 0.2), (-w / 2, 0.45, z1 - 0.2), STEEL)  # clamp bolt side
    t(p, (w / 2, 0.15, z0 + 0.6), (w / 2 + 0.35, 0.55, z0 + 1.0), STEEL)  # thumb screw


def tube(p, y, z0, z1, d, texture, x=0.0, **kw):
    """Octagon-ish tube along z."""
    t(p, (x - d / 2, y - d / 2, z0), (x + d / 2, y + d / 2, z1), texture, **kw)
    r = d * 0.42
    p.box((x - r, y - r, z0), (x + r, y + r, z1), "detail", texture=texture,
          rot={"origin": (x, y, (z0 + z1) / 2), "axis": "z", "angle": 45}, **kw)


# ---------------------------------------------------------------- optics
def red_dot():
    p = _p("red_dot")
    rail_clamp(p, -1.6, 1.6, 2.0, 0.8)
    t(p, (-0.6, 0.8, -1.0), (0.6, 1.3, 1.0), BLK)  # riser
    tube(p, 2.3, -2.2, 2.2, 2.4, BLK)
    t(p, (-0.95, 1.35, -2.05), (0.95, 3.25, -2.0), GLASS, faces=("north", "south"))
    t(p, (-0.95, 1.35, 2.0), (0.95, 3.25, 2.05), GLASS, faces=("north", "south"))
    t(p, (-0.18, 2.12, 1.4), (0.18, 2.48, 1.6), RED, emission=15)  # emitter dot
    t(p, (1.15, 2.0, -0.6), (1.6, 2.7, 0.6), BLK)  # brightness turret
    t(p, (-0.5, 3.4, -0.5), (0.5, 3.75, 0.5), BLK)  # top turret
    return Attachment("calibercraft:red_dot", "optic", p, sight_height=2.3)


def holo_sight():
    p = _p("holo_sight")
    rail_clamp(p, -2.6, 2.6, 2.4, 0.9)
    t(p, (-1.3, 0.9, -1.0), (1.3, 1.5, 2.6), BLK)  # battery body
    t(p, (-1.3, 0.9, -2.6), (-1.0, 3.7, -0.4), BLK)  # left hood pillar
    t(p, (1.0, 0.9, -2.6), (1.3, 3.7, -0.4), BLK)  # right hood pillar
    t(p, (-1.3, 3.4, -2.6), (1.3, 3.7, -0.4), BLK)  # hood top
    t(p, (-1.0, 1.5, -1.6), (1.0, 3.4, -1.5), GLASS, faces=("north", "south"))
    t(p, (-1.0, 1.5, -0.5), (1.0, 3.4, -0.4), GLASS, faces=("north", "south"))
    t(p, (-0.7, 1.5, 0.6), (0.7, 1.9, 2.2), STEEL)  # control buttons
    return Attachment("calibercraft:holo_sight", "optic", p, sight_height=2.4)


def acog_scope():
    p = _p("acog_scope")
    rail_clamp(p, -1.8, 1.8, 2.2, 0.8)
    t(p, (-0.8, 0.8, -1.4), (0.8, 1.4, 1.4), BLK)
    tube(p, 2.5, -2.6, 2.0, 2.2, BLK)
    tube(p, 2.5, -4.4, -2.6, 2.9, BLK)  # objective bell
    tube(p, 2.5, 2.0, 3.6, 2.6, BLK)  # eyepiece
    t(p, (-1.1, 1.4, -4.45), (1.1, 3.6, -4.4), GLASS, faces=("north",))
    t(p, (-1.0, 1.5, 3.6), (1.0, 3.5, 3.65), GLASS, faces=("south",))
    t(p, (-0.35, 3.6, -1.6), (0.35, 4.1, 0.8), STEEL)  # backup sight rail
    t(p, (-0.15, 4.1, 0.4), (0.15, 4.5, 0.7), AMBER, emission=12)  # fibre optic
    t(p, (1.1, 2.1, -0.6), (1.5, 2.9, 0.6), BLK)  # windage turret
    return Attachment("calibercraft:acog_scope", "optic", p, sight_height=2.5)


def sniper_scope():
    p = _p("sniper_scope")
    for z in (-3.2, 2.2):
        t(p, (-1.1, 0, z - 0.7), (1.1, 0.9, z + 0.7), BLK)  # ring base
        t(p, (-1.25, 0.9, z - 0.55), (1.25, 4.4, z + 0.55), STEEL)  # ring
    tube(p, 3.0, -4.6, 4.2, 1.9, BLK)
    tube(p, 3.0, -8.0, -4.6, 3.3, BLK)  # objective bell
    t(p, (-1.4, 1.6, -5.6), (1.4, 4.4, -4.4), BLK)  # bell taper
    tube(p, 3.0, 4.2, 7.2, 2.7, BLK)  # eyepiece
    t(p, (-1.3, 1.7, -8.05), (1.3, 4.3, -8.0), GLASS, faces=("north",))
    t(p, (-1.1, 1.9, 7.2), (1.1, 4.1, 7.25), GLASS, faces=("south",))
    t(p, (-0.7, 4.0, -0.7), (0.7, 5.2, 0.7), STEEL)  # elevation turret
    t(p, (-0.75, 5.0, -0.75), (0.75, 5.3, 0.75), BLK)
    t(p, (1.0, 2.3, -0.7), (2.2, 3.7, 0.7), STEEL)  # windage turret
    t(p, (-2.0, 2.4, -0.6), (-1.0, 3.6, 0.6), BLK)  # parallax knob
    return Attachment("calibercraft:sniper_scope", "optic", p, sight_height=3.0)


# ---------------------------------------------------------------- muzzle devices
def suppressor():
    p = _p("suppressor")
    tube(p, 0, -1.0, 0.0, 1.5, STEEL)  # thread adaptor
    tube(p, 0, -9.0, -1.0, 2.4, BLK)
    tube(p, 0, -9.3, -9.0, 1.8, STEEL)  # end cap
    t(p, (-1.25, -0.2, -7.6), (1.25, 0.2, -2.4), GUNMETAL)  # side flats detail
    return Attachment("calibercraft:suppressor", "muzzle", p, length=9.3)


def compensator():
    p = _p("compensator")
    tube(p, 0, -3.0, 0.0, 1.7, STEEL)
    for z in (-2.6, -1.6):
        t(p, (-0.5, 0.6, z), (0.5, 0.9, z + 0.6), BLK)  # top ports
    t(p, (-0.9, -0.3, -2.8), (0.9, 0.3, -0.4), GUNMETAL)
    return Attachment("calibercraft:compensator", "muzzle", p, length=3.0)


def muzzle_brake():
    p = _p("muzzle_brake")
    t(p, (-1.3, -0.8, -3.6), (1.3, 0.8, 0.0), STEEL)
    for z in (-3.2, -2.1, -1.0):
        t(p, (-1.35, -0.45, z), (1.35, 0.45, z + 0.6), BLK)  # side baffles (darker ports)
    t(p, (-0.5, 0.8, -3.4), (0.5, 0.95, -0.4), BLK)
    return Attachment("calibercraft:muzzle_brake", "muzzle", p, length=3.6)


def flash_hider():
    p = _p("flash_hider")
    tube(p, 0, -1.0, 0.0, 1.5, STEEL)
    for (x, y) in ((0, 0.6), (0, -0.6), (0.6, 0), (-0.6, 0)):
        t(p, (x - 0.25, y - 0.25, -3.0), (x + 0.25, y + 0.25, -1.0), STEEL)
    return Attachment("calibercraft:flash_hider", "muzzle", p, length=3.0)


def shotgun_choke():
    p = _p("shotgun_choke")
    tube(p, 0, -2.6, 0.0, 2.0, STEEL)
    tube(p, 0, -1.6, -1.0, 2.3, GUNMETAL)  # knurled ring
    t(p, (-0.5, 0.95, -2.4), (0.5, 1.1, -0.2), BLK)
    return Attachment("calibercraft:shotgun_choke", "muzzle", p, length=2.6)


# ---------------------------------------------------------------- underbarrel
def vertical_grip():
    p = _p("vertical_grip")
    t(p, (-0.9, -0.7, -1.4), (0.9, 0.0, 1.4), BLK)
    t(p, (-0.8, -5.6, -0.9), (0.8, -0.7, 0.9), POLY)
    t(p, (-0.85, -5.0, -0.95), (0.85, -1.4, 0.95), RUBBER)
    t(p, (-0.9, -6.0, -1.0), (0.9, -5.5, 1.0), BLK)
    return Attachment("calibercraft:vertical_grip", "grip", p)


def angled_grip():
    p = _p("angled_grip")
    t(p, (-0.9, -0.6, -2.8), (0.9, 0.0, 2.2), BLK)
    t(p, (-0.85, -2.6, -2.6), (0.85, -0.6, 1.0), POLY,
      rot={"origin": (0, -0.6, 1.0), "axis": "x", "angle": -28})
    t(p, (-0.8, -2.0, -2.4), (0.8, -0.8, -1.0), RUBBER,
      rot={"origin": (0, -0.6, 1.0), "axis": "x", "angle": -28})
    return Attachment("calibercraft:angled_grip", "grip", p)


def ergonomic_grip():
    p = _p("ergonomic_grip")
    t(p, (-0.9, -0.6, -1.6), (0.9, 0.0, 1.6), BLK)
    t(p, (-0.8, -2.4, -0.8), (0.8, -0.6, 1.2), RUBBER,
      rot={"origin": (0, -0.6, 0), "axis": "x", "angle": 18})
    t(p, (-0.85, -1.3, -1.4), (0.85, -0.6, -0.6), POLY)
    return Attachment("calibercraft:ergonomic_grip", "grip", p)


def bipod():
    p = _p("bipod")
    t(p, (-1.0, -1.0, -1.0), (1.0, 0.0, 1.2), BLK)
    t(p, (-1.3, -1.5, -0.8), (1.3, -0.9, 0.8), STEEL)  # leg hinge
    for x in (-0.85, 0.85):
        t(p, (x - 0.3, -1.6, -9.0), (x + 0.3, -1.0, -0.6), BLK)  # folded legs
        t(p, (x - 0.38, -1.7, -9.6), (x + 0.38, -0.9, -8.6), RUBBER)  # feet
    return Attachment("calibercraft:bipod", "grip", p)


# ---------------------------------------------------------------- tactical / charms
def laser_sight():
    p = _p("laser_sight")
    t(p, (0.0, -0.7, -1.2), (0.5, 0.7, 1.2), BLK)  # rail clamp
    t(p, (0.5, -0.9, -2.6), (2.0, 0.9, 1.6), BLK)
    t(p, (0.9, -0.5, -2.75), (1.6, 0.2, -2.6), RED, emission=15)  # emitter
    t(p, (0.9, 0.3, -2.7), (1.6, 0.7, -2.6), GLASS)
    t(p, (2.0, -0.4, -0.6), (2.3, 0.4, 0.6), STEEL)  # activation switch
    return Attachment("calibercraft:laser_sight", "tactical", p)


def charm_creeper():
    p = _p("charm_creeper")
    t(p, (-0.12, -1.6, -0.12), (0.12, 0.0, 0.12), STEEL)  # chain
    t(p, (-0.75, -3.1, -0.75), (0.75, -1.6, 0.75), GREEN_PLASTIC)
    for (x0, x1) in ((-0.55, -0.15), (0.15, 0.55)):
        t(p, (x0, -2.25, 0.75), (x1, -1.85, 0.8), POLY)  # eyes
    t(p, (-0.2, -2.85, 0.75), (0.2, -2.25, 0.8), POLY)  # mouth
    return Attachment("calibercraft:charm_creeper", "charm", p)


def charm_diamond():
    p = _p("charm_diamond")
    t(p, (-0.12, -1.4, -0.12), (0.12, 0.0, 0.12), STAINLESS)
    t(p, (-0.6, -2.6, -0.6), (0.6, -1.4, 0.6), GLASS,
      rot={"origin": (0, -2.0, 0), "x": 35, "y": 45, "z": 0}, emission=6)
    return Attachment("calibercraft:charm_diamond", "charm", p)


def charm_dogtag():
    p = _p("charm_dogtag")
    t(p, (-0.1, -1.2, -0.1), (0.1, 0.0, 0.1), STAINLESS)
    t(p, (-0.55, -2.6, -0.06), (0.55, -1.2, 0.06), STAINLESS)
    t(p, (-0.45, -2.9, 0.08), (0.65, -1.5, 0.18), STAINLESS,
      rot={"origin": (0, -1.5, 0), "axis": "z", "angle": -12})
    return Attachment("calibercraft:charm_dogtag", "charm", p)


# ---------------------------------------------------------------- generic variant items (icons only)
def short_barrel():
    p = _p("short_barrel")
    tube(p, 0, -3.0, 3.0, 1.4, STEEL)
    t(p, (-0.9, -0.9, 1.0), (0.9, 0.9, 2.2), BLK)
    return Attachment("calibercraft:short_barrel", "barrel", p)


def precision_barrel():
    p = _p("precision_barrel")
    tube(p, 0, -7.0, 7.0, 1.7, STEEL)
    for y in (0.86, -0.86):
        t(p, (-0.3, y - 0.05, -5.5), (0.3, y + 0.05, 5.0), BLK)  # flutes
    tube(p, 0, 7.0, 8.0, 2.2, GUNMETAL)
    return Attachment("calibercraft:precision_barrel", "barrel", p)


def heavy_barrel():
    p = _p("heavy_barrel")
    tube(p, 0, -6.0, 6.0, 2.4, STEEL)
    t(p, (-1.4, -1.4, 3.5), (1.4, 1.4, 5.0), BLK)
    return Attachment("calibercraft:heavy_barrel", "barrel", p)


def lightweight_stock():
    p = _p("lightweight_stock")
    t(p, (-0.8, 1.0, -4.0), (0.8, 2.0, 4.0), POLY)
    t(p, (-0.8, -2.5, 3.0), (0.8, 2.0, 4.0), POLY)
    t(p, (-0.8, -2.5, -4.0), (0.8, -1.6, 4.0), POLY,
      rot={"origin": (0, -2.0, -4.0), "axis": "x", "angle": 12})
    t(p, (-0.9, -3.0, 3.8), (0.9, 2.4, 4.4), RUBBER)
    return Attachment("calibercraft:lightweight_stock", "stock", p)


def precision_stock():
    p = _p("precision_stock")
    t(p, (-0.9, -2.5, -4.0), (0.9, 2.0, 4.0), TAN)
    t(p, (-0.8, 2.0, -1.5), (0.8, 3.0, 3.0), TAN)  # cheek riser
    t(p, (-0.3, 1.6, -1.0), (0.3, 2.2, 2.0), STEEL)  # riser post
    t(p, (-1.0, -3.0, 4.0), (1.0, 2.6, 4.7), RUBBER)
    t(p, (-0.5, -4.0, 2.0), (0.5, -2.5, 3.0), STEEL)  # monopod knob
    return Attachment("calibercraft:precision_stock", "stock", p)


def extended_mag():
    p = _p("extended_mag")
    t(p, (-0.9, -3.0, -1.4), (0.9, 3.0, 1.4), POLY)
    t(p, (-0.9, -9.0, -1.4), (0.9, -3.0, 1.4), POLY,
      rot={"origin": (0, -3.0, 0), "axis": "x", "angle": 14})
    t(p, (-0.7, 3.0, -1.1), (0.7, 3.4, 0.9), BRASS)
    return Attachment("calibercraft:extended_mag", "magazine", p)


def quick_mag():
    p = _p("quick_mag")
    for x in (-1.0, 1.0):
        t(p, (x - 0.85, -4.0, -1.4), (x + 0.85, 3.0, 1.4), POLY)
        t(p, (x - 0.65, 3.0, -1.1), (x + 0.65, 3.4, 0.9), BRASS)
    t(p, (-1.9, -1.0, -1.5), (1.9, 0.2, 1.5), tex("black_polymer"))  # coupler
    t(p, (-0.4, -5.2, -0.5), (0.4, -4.0, 0.5), tex("red_plastic"))  # pull tab
    return Attachment("calibercraft:quick_mag", "magazine", p)


ALL = [red_dot, holo_sight, acog_scope, sniper_scope,
       suppressor, compensator, muzzle_brake, flash_hider, shotgun_choke,
       vertical_grip, angled_grip, ergonomic_grip, bipod,
       laser_sight, charm_creeper, charm_diamond, charm_dogtag,
       short_barrel, precision_barrel, heavy_barrel, lightweight_stock, precision_stock,
       extended_mag, quick_mag]


def build_all():
    return {a.id: a for a in (f() for f in ALL)}
