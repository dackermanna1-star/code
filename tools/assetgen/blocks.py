"""Block textures, block models, blockstates and item model definitions."""
import numpy as np
from PIL import Image

from .common import ASSETS, fbm, hex_rgb, path, save_rgba, write_json


def _tex(base_rgb, lum):
    out = np.ones(lum.shape + (4,))
    for i in range(3):
        out[..., i] = np.clip(base_rgb[i] * lum, 0, 1)
    return out


def scorched_earth():
    rng = np.random.default_rng(7)
    n = fbm(16, rng, octaves=3, base=4)
    lum = 0.75 + 0.5 * n + rng.normal(0, 0.06, (16, 16))
    tex = _tex(hex_rgb("#2d2622"), lum)
    speck = rng.random((16, 16))
    tex[speck > 0.93] = [*hex_rgb("#5f5954"), 1.0]
    tex[speck < 0.06] = [*hex_rgb("#141110"), 1.0]
    ember = (speck > 0.985)
    tex[ember] = [*hex_rgb("#6e2a12"), 1.0]
    save_rgba("textures/block/scorched_earth.png", tex)


def _voronoi_cracks(size, rng, cells):
    pts = rng.random((cells, 2)) * size
    yy, xx = np.mgrid[0:size, 0:size] + 0.5
    d = []
    for dx in (-size, 0, size):
        for dy in (-size, 0, size):
            d.append(np.sqrt((xx[..., None] - (pts[:, 0] + dx)) ** 2 + (yy[..., None] - (pts[:, 1] + dy)) ** 2))
    dist = np.sort(np.concatenate(d, axis=2), axis=2)
    return dist[..., 1] - dist[..., 0]


def charred_log():
    rng = np.random.default_rng(11)
    edge = _voronoi_cracks(16, rng, 7)
    crack = edge < 0.9
    lum = 0.8 + 0.35 * fbm(16, rng, octaves=2, base=4) + rng.normal(0, 0.05, (16, 16))
    tex = _tex(hex_rgb("#2a2724"), lum)
    tex[crack] = [*hex_rgb("#0e0d0c"), 1.0]
    glow = crack & (rng.random((16, 16)) > 0.93)
    tex[glow] = [*hex_rgb("#7a2c10"), 1.0]
    save_rgba("textures/block/charred_log.png", tex)

    yy, xx = np.mgrid[0:16, 0:16] + 0.5
    r = np.sqrt((xx - 8) ** 2 + (yy - 8) ** 2)
    rings = 0.85 + 0.15 * np.sin(r * 2.2) + rng.normal(0, 0.05, (16, 16))
    top = _tex(hex_rgb("#3a332d"), rings)
    bark = (np.abs(xx - 8) > 6.5) | (np.abs(yy - 8) > 6.5)
    top[bark] = [*hex_rgb("#191715"), 1.0]
    top[(r < 1.6)] = [*hex_rgb("#211d1a"), 1.0]
    save_rgba("textures/block/charred_log_top.png", top)


def ash():
    rng = np.random.default_rng(13)
    lum = 0.9 + 0.2 * fbm(16, rng, octaves=3, base=4) + rng.normal(0, 0.05, (16, 16))
    tex = _tex(hex_rgb("#a29e98"), lum)
    speck = rng.random((16, 16))
    tex[speck > 0.92] = [*hex_rgb("#5c5853"), 1.0]
    tex[speck < 0.05] = [*hex_rgb("#d4d1cc"), 1.0]
    save_rgba("textures/block/ash_layer.png", tex)


def block_models():
    write_json("models/block/scorched_earth.json", {"parent": "minecraft:block/cube_all", "textures": {"all": "ordnance:block/scorched_earth"}})
    write_json("models/block/charred_log.json", {
        "parent": "minecraft:block/cube_column",
        "textures": {"end": "ordnance:block/charred_log_top", "side": "ordnance:block/charred_log"},
    })
    write_json("models/block/charred_log_horizontal.json", {
        "parent": "minecraft:block/cube_column_horizontal",
        "textures": {"end": "ordnance:block/charred_log_top", "side": "ordnance:block/charred_log"},
    })
    write_json("models/block/ash_layer.json", {
        "parent": "minecraft:block/thin_block",
        "textures": {"particle": "ordnance:block/ash_layer", "ash": "ordnance:block/ash_layer"},
        "elements": [{
            "from": [0, 0, 0], "to": [16, 1, 16],
            "faces": {
                "down": {"uv": [0, 0, 16, 16], "texture": "#ash", "cullface": "down"},
                "up": {"uv": [0, 0, 16, 16], "texture": "#ash"},
                "north": {"uv": [0, 15, 16, 16], "texture": "#ash", "cullface": "north"},
                "south": {"uv": [0, 15, 16, 16], "texture": "#ash", "cullface": "south"},
                "west": {"uv": [0, 15, 16, 16], "texture": "#ash", "cullface": "west"},
                "east": {"uv": [0, 15, 16, 16], "texture": "#ash", "cullface": "east"},
            },
        }],
    })

    write_json("blockstates/scorched_earth.json", {"variants": {"": [
        {"model": "ordnance:block/scorched_earth"}, {"model": "ordnance:block/scorched_earth", "y": 90},
        {"model": "ordnance:block/scorched_earth", "y": 180}, {"model": "ordnance:block/scorched_earth", "y": 270},
    ]}})
    write_json("blockstates/charred_log.json", {"variants": {
        "axis=x": {"model": "ordnance:block/charred_log_horizontal", "x": 90, "y": 90},
        "axis=y": {"model": "ordnance:block/charred_log"},
        "axis=z": {"model": "ordnance:block/charred_log_horizontal", "x": 90},
    }})
    write_json("blockstates/ash_layer.json", {"variants": {"": {"model": "ordnance:block/ash_layer"}}})
    # Burning fuel reuses the vanilla floor fire models.
    write_json("blockstates/burning_fuel.json", {"multipart": [{"apply": [
        {"model": "minecraft:block/fire_floor0"}, {"model": "minecraft:block/fire_floor1"},
    ]}]})


ITEMS_3D = [
    "frag_grenade", "incendiary_grenade", "smoke_grenade", "pg7v_rocket", "tbg7v_rocket", "grenade_launcher",
    "grenade_40mm_he", "grenade_40mm_incendiary", "grenade_40mm_smoke", "flamethrower", "fuel_canister",
    "strike_designator", "hypersonic_missile", "explosive_charge",
]


def item_definitions():
    def model(ref):
        return {"type": "minecraft:model", "model": ref}

    for name in ITEMS_3D:
        write_json(f"items/{name}.json", {"model": model(f"ordnance:item/{name}")})
    # The RPG shows the warhead in the tube only while loaded. Its magazine defaults to empty, so "changed from the
    # default" means "loaded".
    write_json("items/rpg7.json", {"model": {
        "type": "minecraft:condition",
        "property": "minecraft:has_component",
        "component": "ordnance:magazine",
        "ignore_default": True,
        "on_true": model("ordnance:item/rpg7_loaded"),
        "on_false": model("ordnance:item/rpg7"),
    }})
    for block in ("scorched_earth", "ash_layer", "charred_log"):
        write_json(f"items/{block}.json", {"model": model(f"ordnance:block/{block}")})


def icon():
    """128x128 mod icon: a stylised detonation over scorched ground."""
    size = 128
    rng = np.random.default_rng(99)
    yy, xx = np.mgrid[0:size, 0:size] / size
    img = np.zeros((size, size, 4))
    sky = np.stack([0.10 + 0.25 * (1 - yy), 0.08 + 0.12 * (1 - yy), 0.10 + 0.05 * (1 - yy)], axis=-1)
    img[..., :3] = sky
    img[..., 3] = 1.0
    r = np.sqrt((xx - 0.5) ** 2 + ((yy - 0.55) * 1.15) ** 2)
    n = fbm(size, rng, octaves=5, base=4)
    fire = np.clip(1.0 - r / (0.36 + 0.12 * n), 0, 1)
    core = np.clip(1.0 - r / 0.16, 0, 1)
    for i, (a, b) in enumerate(((1.0, 1.0), (0.55, 0.95), (0.12, 0.85))):
        img[..., i] = np.clip(img[..., i] * (1 - fire) + fire * a + core * (b - a) * 0.8, 0, 1)
    ground = yy > 0.82 + 0.03 * np.sin(xx * 9)
    img[ground, :3] = np.array(hex_rgb("#1d1916")) * (0.8 + 0.4 * n[ground, None])
    ring = np.abs(r - 0.44) < 0.012
    img[ring & ~ground, :3] = np.clip(img[ring & ~ground, :3] + 0.25, 0, 1)
    Image.fromarray((img * 255).astype(np.uint8), "RGBA").save(path(ASSETS, "icon.png"))


def generate():
    scorched_earth()
    charred_log()
    ash()
    block_models()
    item_definitions()
    icon()
