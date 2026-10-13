"""Reusable geometry snippets shared by weapon designs."""
from ccmodel import Part

ALL_CHARMS = ["calibercraft:charm_creeper", "calibercraft:charm_diamond", "calibercraft:charm_dogtag"]


def picatinny(p: Part, y, z0, z1, width=1.6, x=8.0, role="detail", top=True):
    """Picatinny rail along z. y = base surface (rail grows up if top else down). Returns rail surface y."""
    h, tooth = 0.5, 0.3
    if top:
        p.box((x - width / 2, y, z0), (x + width / 2, y + h, z1), role)
        z = z0 + 0.35
        while z + 0.5 <= z1 - 0.2:
            p.box((x - width / 2 - 0.1, y + h, z), (x + width / 2 + 0.1, y + h + tooth, z + 0.5), role)
            z += 1.0
        return y + h + tooth
    p.box((x - width / 2, y - h, z0), (x + width / 2, y, z1), role)
    z = z0 + 0.35
    while z + 0.5 <= z1 - 0.2:
        p.box((x - width / 2 - 0.1, y - h - tooth, z), (x + width / 2 + 0.1, y - h, z + 0.5), role)
        z += 1.0
    return y - h - tooth


def side_slots(p: Part, x_left, x_right, y0, y1, zs, length=1.6, role="detail"):
    """Recessed-looking M-LOK style slots on both sides (thin darker plates)."""
    for z in zs:
        p.box((x_right, y0, z), (x_right + 0.05, y1, z + length), role, faces=("east",))
        p.box((x_left - 0.05, y0, z), (x_left, y1, z + length), role, faces=("west",))


def accent_strip(p: Part, x_left, x_right, y0, y1, z0, z1):
    """Thin accent strips on both sides; they glow on emissive skins."""
    p.box((x_right, y0, z0), (x_right + 0.08, y1, z1), "accent", glow=True)
    p.box((x_left - 0.08, y0, z0), (x_left, y1, z1), "accent", glow=True)
