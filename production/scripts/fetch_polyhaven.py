"""Download CC0 assets from Poly Haven (https://polyhaven.com, CC0 licence)."""
import json, os, sys, urllib.request
OUT = "/opt/assets/polyhaven"
UA = {"User-Agent": "YamaguchiShortProduction/1.0"}
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
def files(aid):
    return json.loads(get(f"https://api.polyhaven.com/files/{aid}"))
def save(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(get(url))
HDRIS = ["qwantani_mid_morning_puresky", "kloofendal_48d_partly_cloudy_puresky", "qwantani_night_puresky",
         "qwantani_sunset_puresky", "kloofendal_28d_misty_puresky", "overcast_soil_puresky", "qwantani_dusk_2_puresky"]
TEX = ["japanese_cedar_planks", "hinoki_planks", "japanese_stone_wall", "grey_roof_tiles", "grey_roof_tiles_02",
       "old_planks_02", "plastered_wall", "raked_dirt", "gravel_floor", "burned_ground_01", "dark_planks",
       "old_wooden_floor_02", "raw_plank_wall", "green_metal_rust", "metal_plate", "concrete_wall_003",
       "brown_mud_dry", "grey_plaster", "rusty_metal_02", "rust_coarse_01", "painted_metal_02", "white_plaster_02",
       "beige_wall_001", "concrete_debris", "dirt", "plywood", "fine_grained_wood", "bamboo_wall"]
MODELS = sys.argv[1:] 
for h in HDRIS:
    f = files(h)["hdri"]["2k"]["hdr"]["url"]; save(f, f"{OUT}/hdri/{h}_2k.hdr"); print("hdri", h, flush=True)
for t in TEX:
    try:
        f = files(t)
    except Exception as e:
        print("missing", t, e); continue
    for m in ("Diffuse", "nor_gl", "Rough", "AO", "Displacement", "arm"):
        if m in f and "1k" in f[m]:
            fm = f[m]["1k"].get("jpg") or f[m]["1k"].get("png")
            save(fm["url"], f"{OUT}/tex/{t}/{t}_{m}_1k.{fm['url'].rsplit('.',1)[1]}")
    print("tex", t, flush=True)
for mname in MODELS:
    f = files(mname)
    g = f["gltf"]["1k"]["gltf"]
    d = f"{OUT}/models/{mname}"
    save(g["url"], f"{d}/{mname}.gltf")
    for rel, inc in g.get("include", {}).items():
        save(inc["url"], f"{d}/{rel}")
    print("model", mname, flush=True)
