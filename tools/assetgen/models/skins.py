"""Skin definitions: each skin binds material roles to material textures."""

NS = "calibercraft"
SKINS = ("standard", "matte_black", "desert_tan", "woodland", "arctic", "digital",
         "industrial", "worn", "neon", "energy")
EMISSIVE_SKINS = {"neon", "energy"}

# Roles a non-standard skin replaces with "<skin>_<role>" textures.
SKINNED_ROLES = ("receiver", "furniture", "mag", "accent")

# Per-skin choice for the bare-metal and detail roles (barrels stay metal on every finish).
SKIN_METAL = {
    "matte_black": ("dark_steel", "black_anodized"),
    "desert_tan": ("parkerized", "dark_steel"),
    "woodland": ("parkerized", "dark_steel"),
    "arctic": ("stainless", "gunmetal"),
    "digital": ("gunmetal", "dark_steel"),
    "industrial": ("stainless", "gunmetal"),
    "worn": ("dark_steel", "dark_steel"),
    "neon": ("black_anodized", "black_anodized"),
    "energy": ("dark_steel", "black_anodized"),
}

DEFAULT_STANDARD = {
    "receiver": "black_anodized",
    "furniture": "black_polymer",
    "metal": "dark_steel",
    "detail": "dark_steel",
    "accent": "gunmetal",
    "mag": "black_polymer",
    "brass": "brass",
    "shell": "red_plastic",
}


def tex(name):
    return f"{NS}:item/material/{name}"


def skin_textures(skin, weapon):
    """Return the texture map (role -> texture id) for a weapon in a given skin."""
    std = dict(DEFAULT_STANDARD)
    std.update(weapon.standard)
    if skin == "standard":
        m = std
    else:
        metal, detail = SKIN_METAL[skin]
        m = dict(std)
        for role in SKINNED_ROLES:
            m[role] = f"{skin}_{role}"
        m["metal"] = metal
        m["detail"] = detail
    out = {role: tex(name) for role, name in m.items()}
    out["particle"] = out["receiver"]
    return out
