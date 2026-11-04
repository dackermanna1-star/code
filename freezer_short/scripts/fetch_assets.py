"""Download the CC0 assets used in the film from Poly Haven (polyhaven.com, CC0).
Usage: python3 fetch_assets.py /opt/assets/polyhaven"""
import json, os, sys, urllib.request, concurrent.futures as cf
OUT = sys.argv[1]
MODELS = ["steel_frame_shelves_01", "steel_frame_shelves_02", "steel_frame_shelves_03", "worn_metal_rack",
          "cardboard_box_01", "plastic_crate_01", "plastic_crate_03", "industrial_pastic_container",
          "mounted_fluorescent_lights", "modular_industrial_pipes_01", "exterior_aircon_unit",
          "korean_fire_extinguisher_01", "security_camera_01", "WetFloorSign_01", "crowbar_01",
          "hand_truck", "wooden_crate_01", "long_life_food", "russian_food_cans_01", "trashbag",
          "medical_box", "utility_box_01", "fire_alarm", "plastic_container",
          "modular_airduct_rectangular_01", "industrial_wall_lamp", "rubber_boots"]
TEXTURES = ["box_profile_metal_sheet", "factory_wall", "concrete_floor_worn_001", "anti_slip_concrete",
            "metal_plate", "metal_plate_02", "snow_02", "snow_floor", "corrugated_iron_02"]
def get(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0: return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "freezer-short-asset-fetch/1.0"})
    with urllib.request.urlopen(req) as r, open(dst, "wb") as f: f.write(r.read())
def files(aid):
    req = urllib.request.Request("https://api.polyhaven.com/files/" + aid, headers={"User-Agent": "freezer-short-asset-fetch/1.0"})
    return json.load(urllib.request.urlopen(req))
jobs = []
for m in MODELS:
    b = files(m)["blend"]["2k"]["blend"]
    d = os.path.join(OUT, "models", m)
    jobs.append((b["url"], os.path.join(d, os.path.basename(b["url"]))))
    for rel, inc in b.get("include", {}).items(): jobs.append((inc["url"], os.path.join(d, rel)))
for t in TEXTURES:
    f = files(t); d = os.path.join(OUT, "textures", t)
    for key, fname in [("Diffuse", "diff"), ("nor_gl", "nor_gl"), ("Rough", "rough"), ("Displacement", "disp"), ("AO", "ao"), ("Metal", "metal")]:
        if key in f and "2k" in f[key]:
            fmt = "jpg" if "jpg" in f[key]["2k"] else "png"
            u = f[key]["2k"][fmt]["url"]; jobs.append((u, os.path.join(d, f"{t}_{fname}_2k.{fmt}")))
with cf.ThreadPoolExecutor(8) as ex:
    list(ex.map(lambda j: get(*j), jobs))
print("downloaded", len(jobs), "files")
