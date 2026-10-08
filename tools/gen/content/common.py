"""Shared helpers for the content emitters (W1): ids/block refs, JSON writing, texture rendering, tags, Java caps.

Nothing in here knows about specific dimensions; the emitters (blocks.py, items.py, worldgen.py, features.py,
sky_art.py) all go through a :class:`Ctx` so output paths, lang and tag accumulation stay in one place.
"""
from __future__ import annotations

import hashlib
import inspect
import json
import os
import re
import sys
from collections import defaultdict

from .dsl import Tex

NS = "portalgun"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
JAVA_MAIN = os.path.join(ROOT, "src", "main", "java")


def warn(msg):
    print(f"  [content] WARNING: {msg}", file=sys.stderr)


# --------------------------------------------------------------------------------------------- ids / block refs
_REF_RE = re.compile(r"^(?P<id>[a-z0-9_.\-]+(?::[a-z0-9_./\-]+)?)(?:\[(?P<props>[^\]]*)\])?$")


def full_id(ref: str) -> str:
    """'sporemoss' -> 'portalgun:sporemoss'; 'minecraft:stone' stays; strips any [props]."""
    m = _REF_RE.match(ref.strip())
    if not m:
        raise ValueError(f"bad block/item ref {ref!r}")
    i = m.group("id")
    return i if ":" in i else f"{NS}:{i}"


def ref_props(ref: str) -> dict:
    m = _REF_RE.match(ref.strip())
    if not m or not m.group("props"):
        return {}
    out = {}
    for kv in m.group("props").split(","):
        if "=" in kv:
            k, v = kv.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def path_of(ref: str) -> str:
    return full_id(ref).split(":", 1)[1]


# Vanilla blocks whose default state is wrong/unsafe for world generation.
_VANILLA_STATE_FIX = {
    "minecraft:water": {"level": "0"},
    "minecraft:lava": {"level": "0"},
}


def state(ref: str, **props) -> dict:
    """Block ref -> vanilla BlockState codec dict {"Name":..., "Properties":{...}}."""
    fid = full_id(ref)
    p = dict(_VANILLA_STATE_FIX.get(fid, {}))
    p.update(ref_props(ref))
    p.update({k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in props.items()})
    s = {"Name": fid}
    if p:
        s["Properties"] = p
    return s


def simple_provider(ref: str) -> dict:
    return {"type": "minecraft:simple_state_provider", "state": state(ref)}


def weighted_provider(entries) -> dict:
    """entries: list[(ref, weight)] (or a single ref string) -> BlockStateProvider."""
    if isinstance(entries, str):
        return simple_provider(entries)
    entries = [(r, w) for r, w in entries if w > 0]
    if len(entries) == 1:
        return simple_provider(entries[0][0])
    return {"type": "minecraft:weighted_state_provider",
            "entries": [{"data": state(r), "weight": int(w)} for r, w in entries]}


def int_provider(v):
    """int or (min,max) -> IntProvider JSON."""
    if isinstance(v, (tuple, list)):
        a, b = int(v[0]), int(v[1])
        if a == b:
            return a
        return {"type": "minecraft:uniform", "min_inclusive": min(a, b), "max_inclusive": max(a, b)}
    return int(v)


def hex_rgb(c: str) -> str:
    """'#rgb'/'#rrggbb'/'#aarrggbb' -> '#rrggbb'."""
    h = c.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    if len(h) == 8:
        h = h[2:]
    if len(h) != 6:
        raise ValueError(f"bad colour {c!r}")
    return "#" + h.lower()


def hex_argb(c: str, default_alpha="ff") -> str:
    h = c.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    if len(h) == 6:
        h = default_alpha + h
    if len(h) != 8:
        raise ValueError(f"bad colour {c!r}")
    return "#" + h.lower()


def rgb_int(c: str) -> int:
    return int(hex_rgb(c)[1:], 16)


def rgb_tuple(c: str):
    h = hex_rgb(c)[1:]
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix_hex(a: str, b: str, t: float) -> str:
    ra, rb = rgb_tuple(a), rgb_tuple(b)
    return "#" + "".join("%02x" % int(round(ra[i] + (rb[i] - ra[i]) * t)) for i in range(3))


def scale_hex(a: str, k: float) -> str:
    r = rgb_tuple(a)
    return "#" + "".join("%02x" % max(0, min(255, int(round(v * k)))) for v in r)


def stable_hash(s: str, mod: int = 2 ** 31) -> int:
    return int(hashlib.md5(s.encode("utf-8")).hexdigest()[:12], 16) % mod


def title_case(s: str) -> str:
    return " ".join(w.capitalize() for w in s.replace("_", " ").split())


# --------------------------------------------------------------------------------------------- JSON writing
def write_json(path: str, obj, compact=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, separators=(",", ":"))
        else:
            json.dump(obj, f, indent=2)
        f.write("\n")


# --------------------------------------------------------------------------------------------- textures
_TEX_MODULES = None


def tex_modules():
    """(gen.textures or None, gen.content.textures_extra)."""
    global _TEX_MODULES
    if _TEX_MODULES is None:
        try:
            from gen import textures as T  # noqa
        except Exception as e:  # being written concurrently by another team
            warn(f"gen.textures unavailable ({e}); using fallbacks only")
            T = None
        from . import textures_extra as X
        _TEX_MODULES = (T, X)
    return _TEX_MODULES


def tex_fn(name: str):
    T, X = tex_modules()
    fn = getattr(T, name, None) if T is not None else None
    if fn is None or name.startswith("_"):
        fn = getattr(X, name, None)
    return fn


def _accepts(fn, kw):
    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):
        return False
    return kw in sig.parameters or any(p.kind == p.VAR_KEYWORD for p in sig.parameters.values())


def render_tex(t, _depth=0):
    """Render a Tex -> list of PIL frames (len 1 for static). Nested Tex args are rendered (first frame)."""
    from PIL import Image
    if isinstance(t, Image.Image):
        return [t.convert("RGBA")]
    if not isinstance(t, Tex):
        raise TypeError(f"not a texture spec: {t!r}")
    fn = tex_fn(t.fn)
    if fn is None:
        raise KeyError(f"unknown texture generator {t.fn!r}")

    def conv(a):
        if isinstance(a, Tex):
            return render_tex(a, _depth + 1)[0]
        if isinstance(a, list):
            return [conv(x) for x in a]
        return a

    args = [conv(a) for a in t.args]
    kwargs = {k: conv(v) for k, v in t.kwargs.items()}
    if t.frames > 0 and _accepts(fn, "frames") and "frames" not in kwargs:
        kwargs["frames"] = t.frames
    try:
        out = fn(*args, **kwargs)
    except Exception:
        from . import textures_extra as X
        alt = getattr(X, t.fn, None)
        if alt is None or alt is fn:
            raise
        out = alt(*args, **kwargs)
    if isinstance(out, (list, tuple)):
        frames = [f.convert("RGBA") for f in out]
    else:
        frames = [out.convert("RGBA")]
    if t.frames > 0 and len(frames) == 1:
        from . import textures_extra as X
        frames = X.pulse_frames(frames[0], t.frames)
    return frames


def tint_image(img, hexcol):
    """Multiply an RGBA image by a colour (keeps alpha)."""
    import numpy as np
    from PIL import Image
    a = np.asarray(img.convert("RGBA"), dtype=float).copy()
    c = np.array(rgb_tuple(hexcol), dtype=float) / 255.0
    a[..., :3] *= c
    return Image.fromarray(np.clip(a, 0, 255).astype("uint8"), "RGBA")


def save_frames(frames, path, frametime=2, interpolate=False):
    """Save a static png, or a vertical animation strip + .mcmeta."""
    from PIL import Image
    os.makedirs(os.path.dirname(path), exist_ok=True)
    meta_path = path + ".mcmeta"
    if len(frames) == 1:
        frames[0].save(path)
        if os.path.exists(meta_path):
            os.remove(meta_path)
        return
    w, h = frames[0].size
    strip = Image.new("RGBA", (w, h * len(frames)), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        if f.size != (w, h):
            f = f.resize((w, h), Image.NEAREST)
        strip.paste(f, (0, i * h))
    strip.save(path)
    with open(meta_path, "w") as fh:
        json.dump({"animation": {"frametime": int(max(1, frametime)), "interpolate": bool(interpolate)}}, fh, indent=2)


# --------------------------------------------------------------------------------------------- Java capabilities
_CAPS = None

ALL_JAVA_FEATURES = ("giant_plant", "boulder", "spire", "crystal_cluster", "structure", "tree")
ALL_JAVA_DFS = ("coord", "sine", "terrace", "cell_shapes", "cell_pillars", "craters", "cells")


def java_caps():
    """Which portalgun:* worldgen types the Java side registers (W2 implements them concurrently).

    Emitting a type that is not registered is FATAL for the world load, so we only use what we can find.
    Override with env PORTALGUN_JAVA_TYPES=all|none|comma,list.
    """
    global _CAPS
    if _CAPS is not None:
        return _CAPS
    env = os.environ.get("PORTALGUN_JAVA_TYPES")
    names = set()
    if env:
        if env == "all":
            names = set(ALL_JAVA_FEATURES) | set(ALL_JAVA_DFS)
        elif env != "none":
            names = {s.strip() for s in env.split(",") if s.strip()}
    else:
        texts = []
        for sub in ("dev/portalgun/world", "dev/portalgun/registry"):
            d = os.path.join(JAVA_MAIN, sub)
            for dp, _, fns in os.walk(d):
                for fn in fns:
                    if fn.endswith(".java"):
                        try:
                            with open(os.path.join(dp, fn), encoding="utf-8") as f:
                                texts.append(f.read())
                        except OSError:
                            pass
        blob = "\n".join(texts)
        for n in ALL_JAVA_FEATURES + ALL_JAVA_DFS:
            if re.search(r'"(?:portalgun:)?' + re.escape(n) + r'"', blob):
                names.add(n)
    _CAPS = names
    return names


def has_java(name: str) -> bool:
    return name in java_caps()


_JAVA_TEXT = None


def java_text():
    """Concatenated W2/C Java sources (blocks, world, registry, creature) for capability sniffing."""
    global _JAVA_TEXT
    if _JAVA_TEXT is None:
        parts = []
        for sub in ("dev/portalgun/block", "dev/portalgun/world", "dev/portalgun/registry", "dev/portalgun/creature"):
            d = os.path.join(JAVA_MAIN, sub)
            for dp, _, fns in os.walk(d):
                for fn in fns:
                    if fn.endswith(".java"):
                        try:
                            with open(os.path.join(dp, fn), encoding="utf-8") as f:
                                parts.append(f.read())
                        except OSError:
                            pass
        _JAVA_TEXT = "\n".join(parts)
    return _JAVA_TEXT


def java_registers_creatures() -> bool:
    """True when module C's Java registers entity types from the content spec (biome spawners referencing an
    unregistered entity would make the whole world fail to load)."""
    env = os.environ.get("PORTALGUN_CREATURE_SPAWNS")
    if env is not None:
        return env == "1"
    parts = []
    for sub in ("dev/portalgun/creature", "dev/portalgun/registry/ModCreatures.java"):
        pth = os.path.join(JAVA_MAIN, sub)
        files = [pth] if pth.endswith(".java") else [os.path.join(dp, f) for dp, _, fs in os.walk(pth) for f in fs if f.endswith(".java")]
        for fp in files:
            try:
                with open(fp, encoding="utf-8") as f:
                    parts.append(f.read())
            except OSError:
                pass
    t = "\n".join(parts)
    return "ENTITY_TYPE" in t and "creatures" in t


def java_multiface_vines() -> bool:
    """True when W2's vine block is a MultifaceSpreadeableBlock (required by minecraft:multiface_growth)."""
    env = os.environ.get("PORTALGUN_MULTIFACE")
    if env is not None:
        return env == "1"
    t = java_text()
    return "MultifaceSpreadeableBlock" in t or "GlowLichenBlock" in t


# --------------------------------------------------------------------------------------------- context
class Tags:
    """Accumulates tag entries across all dimensions; written once at the end of build()."""

    def __init__(self):
        self.entries = defaultdict(list)   # (registry, "ns:path") -> [values]

    def add(self, registry: str, tag: str, value: str):
        key = (registry, tag)
        if value not in self.entries[key]:
            self.entries[key].append(value)

    def write(self, res_dir: str):
        for (registry, tag), values in sorted(self.entries.items()):
            ns, path = tag.split(":", 1)
            p = os.path.join(res_dir, "data", ns, "tags", registry, path + ".json")
            write_json(p, {"replace": False, "values": values})


class Ctx:
    """Everything an emitter needs while generating one dimension."""

    def __init__(self, res_dir, lang, sound_table, tags, dim=None):
        self.res = res_dir
        self.lang = lang
        self.sound_table = sound_table or {}
        self.tags = tags
        self.dim = dim
        self.blocks = {b.id: b for b in dim.blocks} if dim else {}
        self.items = {i.id: i for i in dim.items} if dim else {}

    # paths
    def data(self, *parts, ns=NS):
        return os.path.join(self.res, "data", ns, *parts)

    def assets(self, *parts, ns=NS):
        return os.path.join(self.res, "assets", ns, *parts)

    def block(self, ref):
        """The dsl.Block for a ref of this dimension (or any registered portalgun block), else None."""
        fid = full_id(ref)
        if fid.startswith(NS + ":"):
            return self.blocks.get(fid.split(":", 1)[1]) or GLOBAL_BLOCKS.get(fid.split(":", 1)[1])
        return None

    def kind(self, ref):
        b = self.block(ref)
        return b.kind if b else None

    def has_sound(self, event):
        return event in self.sound_table


GLOBAL_BLOCKS = {}   # id -> dsl.Block across all dimensions being built (filled by build())
