"""Client item definitions (assets/laptopcraft/items/<id>.json) and flat icon models.

Hats: flat pixel-art icon in the GUI, the 3D model everywhere else (head, hand, ground, item frame, shelf).
Garments: flat icon everywhere (they are painted onto the body by their equipment asset when worn).
"""
from garments import HOODIE_UNDYED
from lib import NS, write_json

HATS = [
    "top_hat", "cowboy_hat", "baseball_cap", "snapback_cap", "beanie", "party_hat", "chef_hat", "wizard_hat",
    "golden_crown", "flower_crown", "pirate_hat", "viking_helmet", "propeller_cap", "sunglasses", "nerd_glasses",
    "headphones",
]
GARMENTS = [
    "hoodie", "creeper_tee", "emerald_tee", "denim_jacket", "tuxedo_jacket", "hawaiian_shirt", "jeans", "cargo_shorts",
    "sweatpants", "sneakers", "cowboy_boots", "bunny_slippers",
]


def flat_model(model_name, layers):
    write_json({"parent": "minecraft:item/generated",
                "textures": {"layer%d" % i: NS + ":item/clothing/" + tex for i, tex in enumerate(layers)}},
               "models", "item", "clothing", model_name + ".json")


def build():
    for hat in HATS:
        flat_model(hat + "_icon", [hat])
        write_json({
            "model": {
                "type": "minecraft:select",
                "property": "minecraft:display_context",
                "cases": [{"when": "gui", "model": {"type": "minecraft:model", "model": NS + ":item/clothing/" + hat + "_icon"}}],
                "fallback": {"type": "minecraft:model", "model": NS + ":item/clothing/" + hat},
            }
        }, "items", hat + ".json")

    for g in GARMENTS:
        if g == "hoodie":
            flat_model(g, [g, g + "_overlay"])
            write_json({"model": {"type": "minecraft:model", "model": NS + ":item/clothing/" + g,
                                  "tints": [{"type": "minecraft:dye", "default": HOODIE_UNDYED - 0x1000000}]}},
                       "items", g + ".json")
        else:
            flat_model(g, [g])
            write_json({"model": {"type": "minecraft:model", "model": NS + ":item/clothing/" + g}}, "items", g + ".json")
