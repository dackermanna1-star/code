"""Item assets + ItemSpec entries (materials and foods described by dsl.Item)."""
from __future__ import annotations

from .common import NS, render_tex, save_frames, warn, write_json


def emit_item(ctx, it):
    try:
        frames = render_tex(it.icon)
    except Exception as e:
        warn(f"item {it.id}: icon failed ({e}); using fallback icon")
        from .textures_extra import item_icon
        frames = [item_icon("gem", ["#444444", "#888888", "#cccccc"], it.id)]
    save_frames(frames, ctx.assets("textures", "item", it.id + ".png"), getattr(it.icon, "frametime", 2))
    write_json(ctx.assets("models", "item", it.id + ".json"),
               {"parent": "minecraft:item/generated", "textures": {"layer0": f"{NS}:item/{it.id}"}})
    write_json(ctx.assets("items", it.id + ".json"), {"model": {"type": "minecraft:model", "model": f"{NS}:item/{it.id}"}})
    ctx.lang[f"item.{NS}.{it.id}"] = it.name
    if it.lore:
        ctx.lang[f"item.{NS}.{it.id}.lore"] = it.lore
    spec = {"id": it.id, "name": it.name, "kind": it.kind, "stack": int(it.stack), "rarity": it.rarity,
            "glint": bool(it.glint), "dimension": ctx.dim.id if ctx.dim else None}
    if it.lore:
        spec["lore"] = it.lore
    if it.food is not None:
        f = it.food
        spec["food"] = {"nutrition": int(f.nutrition), "saturation": float(f.saturation), "always": bool(f.always),
                        "fast": bool(f.fast),
                        "effects": [{"id": e.id, "duration": int(round(e.seconds * 20)), "amplifier": int(e.amplifier),
                                     "chance": float(e.chance)} for e in f.effects]}
        ctx.tags.add("item", f"{NS}:foods", f"{NS}:{it.id}")
    return spec
