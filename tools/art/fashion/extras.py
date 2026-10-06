"""Misc fashion assets: the sunglasses camera overlay and the vanilla dyeable tag entry."""
import numpy as np
from PIL import Image

from lib import DATA, write_json, write_png


def sunglasses_overlay(w=256, h=256):
    """Full-screen tint drawn while wearing the aviators (first person): darker plum at the top fading to a
    warm amber at the bottom, like the gradient lenses, plus a soft vignette."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    v = y / (h - 1)
    u = x / (w - 1)
    top = np.array([42, 30, 70], np.float32)
    bottom = np.array([150, 80, 40], np.float32)
    rgb = top[None, None, :] * (1 - v[..., None]) + bottom[None, None, :] * v[..., None]
    alpha = 92 - 62 * v                                   # 92 at the top, 30 at the bottom
    d = np.sqrt(((u - 0.5) / 0.5) ** 2 + ((v - 0.5) / 0.5) ** 2) / np.sqrt(2)
    alpha += np.clip(d - 0.55, 0, 1) * 220                # vignette towards the corners
    alpha = np.clip(alpha, 0, 200)
    img = np.dstack([rgb, alpha]).round().astype(np.uint8)
    return Image.fromarray(img, "RGBA")


def build():
    write_png(sunglasses_overlay(), "textures", "misc", "clothing", "sunglasses_overlay.png")
    # vanilla dye crafting (ArmorDyeRecipe) and the dyed-colour tooltip work for anything in #minecraft:dyeable
    write_json({"replace": False, "values": ["laptopcraft:hoodie"]}, "minecraft", "tags", "item", "dyeable.json", base=DATA)
