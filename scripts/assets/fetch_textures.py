#!/usr/bin/env python3
"""Fetch CC0 photo materials from ambientCG and bake them into 256x256 game textures.

Outputs (per entry in SPEC) into public/assets/textures/:
    <name>_albedo.jpg  sRGB colour, seamless
    <name>_normal.jpg  tangent-space normal, OpenGL convention (+Y up)
    <name>_rough.jpg   greyscale roughness
and public/assets/textures/manifest.json.

Usage (run from the repo root; downloads are untrusted data and live outside the repo):
    python3 -I scripts/assets/fetch_textures.py [--work /tmp/claude-0/assets-work]
                                                [--only name1,name2] [--probe out.png]
                                                [--try '{"name": "x", "src": "Wood095", "size": 1}']
--probe writes a preview sheet (albedo, 2x2 tiling, lit preview, normal, roughness) instead
of the output files; --try adds ad-hoc candidate entries to a probe.

Steps: download <ID>_1K-JPG.zip from ambientcg.com (cached in <work>/dl), extract only
the expected map images into a fresh <work>/src/<ID>/ directory, downscale with a
periodic (wrap-around) Lanczos filter (colour in linear light, normals as renormalised
vectors), rotate where the grain must run along U, apply light colour grading and
low-frequency flattening, and write the JPGs. Entries without a suitable photo source
are generated procedurally (see procedural_textures.py).
"""
import argparse
import json
import os
import re
import sys
import urllib.request
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import texlib as T  # noqa: E402
import procedural_textures as P  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT_DIR = os.path.join(REPO, "public", "assets", "textures")
SIZE = 256
SEAM_FIX_THRESHOLD = 1.2  # seam_score above which a wrap-edge correction is applied
ACG_LICENSE = "CC0 1.0 Universal (public domain)"

# --------------------------------------------------------------------------------------
# SPEC: one entry per game texture.
#   src        ambientCG asset id (None -> fully procedural, see `gen`)
#   rot        CCW quarter turns applied to the source (grain along U)
#   tint       albedo is meant to be multiplied by a vertex/instance colour
#   size       approx. real-world metres covered by one 256px tile
#   desat      0..1 desaturation (tintable textures are made neutral grey)
#   luma       target mean linear luminance of the albedo (None = keep)
#   color      target mean linear RGB of the albedo (None = keep)
#   flat       strength of large-scale brightness flattening (reduces visible tiling)
#   contrast   multiplier on luminance variation
#   nstr       normal-map strength multiplier
#   rough      (lo, hi) percentile remap of roughness, or a float for a constant
#   metal      metallic hint (extra manifest field, 0 or 1)
#   gen        src=None: generator P.<gen>(size); with a src: post-process P.post_<gen>()
#   ndetail    extra fine normal relief derived from the (high-passed) albedo luminance
#   sigma      flattening scale in px (default SIZE/10)
#   from_height  rebuild the albedo from the height map: color * (v + (1-v) * height)
#   note       free text copied into the manifest
# --------------------------------------------------------------------------------------
SPEC = [
    # ---- wood -------------------------------------------------------------------------
    dict(name="wood_oak", src="Wood095", size=1.0, color=(0.52, 0.36, 0.21), flat=0.6, nstr=2.0, ndetail=1.5,
         rough=(0.4, 0.65), note="light oak-like straight grain board (laminate floor / furniture), grain along U"),
    dict(name="wood_walnut", src="Wood067", size=1.0, color=(0.085, 0.04, 0.018), flat=0.5, nstr=1.4, ndetail=1.0,
         rough=(0.4, 0.65), note="dark walnut-like hardwood, grain along U"),
    dict(name="wood_pine", src="Wood046", rot=1, size=0.8, color=(0.62, 0.45, 0.24), flat=0.6, nstr=2.0,
         ndetail=1.5, rough=(0.65, 0.9), note="raw softwood lumber (pine/spruce), rotated so grain runs along U"),
    dict(name="wood_fiber", src="Wood061", size=0.4, color=(0.62, 0.48, 0.32), flat=0.6, nstr=2.5, contrast=1.3,
         rough=(0.75, 0.95), note="rough split light wood surface, fibres along U (fracture faces)"),
    dict(name="plywood", src="Wood094", size=1.2, color=(0.68, 0.52, 0.33), flat=0.6, nstr=1.5, ndetail=1.0, rough=(0.55, 0.8),
         note="light rotary-cut veneer face used as birch plywood"),
    dict(name="mdf", src=None, gen="mdf", size=0.5, note="procedural MDF fibreboard"),
    dict(name="particleboard", src="Chipboard004", size=0.5, flat=0.4, nstr=1.5, rough=(0.7, 0.95),
         note="chipboard flakes"),
    # ---- walls / ceilings -------------------------------------------------------------
    dict(name="paint_wall", src="PaintedPlaster017", tint=True, size=1.5, desat=1.0, luma=0.74, flat=0.9,
         contrast=0.6, nstr=1.0, rough=(0.8, 0.88), gen="orange_peel",
         note="painted plaster photo, neutralised for tinting, plus fine orange-peel roller relief"),
    dict(name="gypsum", src="Concrete003", size=0.3, desat=0.85, luma=0.62, color=None, flat=0.6, nstr=1.0,
         rough=(0.85, 1.0), gen="warm_white", note="porous chalky surface (photo of fine concrete, brightened) for broken drywall core"),
    dict(name="plaster_ceiling", src="Styrofoam005", size=0.8, desat=1.0, luma=0.78, flat=0.9, contrast=0.6,
         nstr=1.0, rough=(0.82, 0.95), note="fine bumpy white surface photo used as lightly stippled ceiling plaster"),
    # ---- concrete ---------------------------------------------------------------------
    dict(name="concrete", src="Concrete006", size=1.5, flat=0.7, nstr=0.6, rough=(0.7, 0.9),
         note="smooth cast-in-place concrete"),
    dict(name="concrete_broken", src="Concrete025", size=0.4, flat=0.4, nstr=2.0, rough=(0.8, 1.0),
         note="rough concrete with aggregate, for fracture faces"),
    # ---- tiles / ceramics -------------------------------------------------------------
    dict(name="tile_porcelain", src="Granite005A", size=0.6, desat=1.0, color=(0.5, 0.47, 0.42), flat=0.8,
         contrast=0.8, nstr=0.25, rough=(0.25, 0.4), note="fine speckled stone-look surface, neutral light grey/beige"),
    dict(name="tile_glazed_white", src="Porcelain001", size=0.3, flat=0.0, luma=0.78, nstr=1.0, rough=(0.04, 0.1),
         gen="glaze", note="glossy white glaze with very subtle tonal variation and waviness"),
    dict(name="grout", src="Concrete037", size=0.25, desat=0.7, luma=0.24, flat=0.6, nstr=1.5, rough=(0.85, 1.0),
         note="fine sanded cementitious grout"),
    dict(name="ceramic_glaze", src="Porcelain002", size=0.5, flat=0.0, luma=0.8, nstr=0.6, rough=(0.03, 0.08),
         note="smooth white porcelain glaze"),
    dict(name="ceramic_bisque", src="Paper002", size=0.2, desat=0.8, luma=0.66, flat=0.7, nstr=3.0,
         rough=(0.8, 0.95), gen="grain", note="porous off-white photo + sugary grain, unglazed ceramic body"),
    dict(name="granite", src="Granite002A", size=0.8, flat=0.5, nstr=0.3, rough=(0.15, 0.3), gen="granite_dark",
         note="salt-and-pepper granite photo inverted/darkened into dark speckled granite"),
    dict(name="marble", src="Marble001", size=1.0, flat=0.3, nstr=0.3, rough=(0.08, 0.2),
         note="white veined marble"),
    # ---- metals -----------------------------------------------------------------------
    dict(name="steel_brushed", src="Metal009", size=0.5, metal=1, luma=0.45, flat=0.5, nstr=1.0, rough=(0.25, 0.4),
         note="brushed stainless steel, brushing along U"),
    dict(name="metal_painted", src=None, gen="enamel", size=0.5, note="procedural white enamel paint"),
    dict(name="metal_raw", src="Metal041A", size=0.6, metal=1, luma=0.42, flat=0.6, nstr=1.0, rough=(0.35, 0.55),
         gen="spangle", note="raw steel photo + procedural galvanised zinc spangle"),
    dict(name="aluminum", src="Metal050B", size=0.5, metal=1, luma=0.6, flat=0.6, nstr=1.0, rough=(0.3, 0.42),
         gen="brushed", note="satin/anodised aluminium (photo + fine brushing along U)"),
    dict(name="copper", src="Metal035", rot=1, size=0.3, metal=1, color=(0.62, 0.3, 0.16), flat=0.5, nstr=1.0,
         rough=(0.25, 0.45), note="slightly tarnished copper, drawing streaks along U (pipe length)"),
    # ---- soft / misc ------------------------------------------------------------------
    dict(name="plastic", src="Plastic013A", tint=True, size=0.5, desat=1.0, luma=0.62, flat=0.8, nstr=1.0,
         rough=(0.45, 0.58), gen="stipple", note="matte moulded plastic with fine stipple, neutral"),
    dict(name="fabric_upholstery", src="Fabric031", tint=True, size=0.3, desat=1.0, luma=0.55, flat=0.8,
         nstr=1.5, rough=(0.85, 1.0), gen="weave", note="upholstery fabric photo + plain-weave thread relief, neutral"),
    dict(name="fabric_cotton", src="Fabric032", tint=True, size=0.3, desat=1.0, luma=0.7, flat=0.8,
         nstr=1.5, rough=(0.8, 0.95), note="cotton/wool cloth, neutral"),
    dict(name="carpet", src="Carpet016", tint=True, size=0.5, desat=1.0, luma=0.55, flat=0.8, nstr=2.2,
         ndetail=1.0, rough=(0.9, 1.0), note="short-pile wool carpet, neutral"),
    dict(name="leather", src="Leather037", size=0.4, flat=0.5, nstr=3.0, ndetail=1.5, rough=(0.4, 0.6),
         note="brown leather"),
    dict(name="foam", src="Sponge001", size=0.15, from_height=0.55, color=(0.78, 0.6, 0.2), flat=0.0, nstr=1.2,
         rough=(0.88, 1.0), note="yellow polyurethane foam: sponge pore relief, albedo rebuilt from its height map"),
    dict(name="insulation", src=None, gen="insulation", size=0.4, note="procedural pink fibreglass batt"),
    dict(name="paper", src="Paper001", size=0.3, luma=0.78, flat=0.7, nstr=1.0, rough=(0.75, 0.9), note="white paper"),
    dict(name="cardboard", src="Paper005", size=0.4, flat=0.6, nstr=1.0, rough=(0.8, 0.95), gen="flutes",
         note="kraft cardboard photo + faint corrugation flutes"),
    dict(name="rubber", src="Rubber004", size=0.4, desat=0.8, flat=0.5, nstr=0.8, rough=(0.75, 0.9),
         note="black rubber"),
    dict(name="soil", src="Ground048", size=0.6, flat=0.5, nstr=1.2, rough=(0.85, 1.0), note="dark potting soil"),
    dict(name="foliage", src=None, gen="foliage", size=0.15, note="procedural leaf surface with veins"),
    dict(name="wallpaper", src=None, gen="wallpaper", tint=True, size=0.6,
         note="procedural tone-on-tone damask (fleur + ogee trellis) on embossed paper; light, can be tinted"),
    dict(name="asphalt", src="Asphalt015", size=2.0, flat=0.5, nstr=1.0, rough=(0.8, 0.95), note="road asphalt"),
]

MAP_RE = re.compile(r"^(?P<id>[A-Za-z0-9]+)_1K-JPG_(?P<map>Color|NormalGL|NormalDX|Roughness|Metalness|"
                    r"AmbientOcclusion|Opacity|Displacement)\.(jpg|png)$")


# ------------------------------------------------------------------------------ fetch


def download(url, dest):
    if os.path.exists(dest):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "asset-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest + ".part", "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    os.replace(dest + ".part", dest)
    return dest


def safe_extract_maps(zpath, out_dir, asset_id):
    """Extract only flat map images named like <ID>_1K-JPG_<Map>.jpg into a fresh dir."""
    if os.path.isdir(out_dir) and os.listdir(out_dir):
        return out_dir
    os.makedirs(out_dir, exist_ok=True)
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            name = info.filename
            m = MAP_RE.match(name)
            if not m or m.group("id") != asset_id or "/" in name or "\\" in name:
                continue
            if info.file_size > 64 * 1024 * 1024:
                raise RuntimeError("suspiciously large member %s" % name)
            with z.open(info) as src, open(os.path.join(out_dir, m.group("map") + "." + m.group(3)), "wb") as dst:
                dst.write(src.read(64 * 1024 * 1024 + 1))
    return out_dir


def asset_info(work, asset_id):
    """ambientCG metadata (creation method, link) for the manifest; cached in <work>/info."""
    path = os.path.join(work, "info", asset_id + ".json")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        url = "https://ambientcg.com/api/v2/full_json?id=%s&include=displayData" % asset_id
        req = urllib.request.Request(url, headers={"User-Agent": "asset-fetch/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
        found = [a for a in data.get("foundAssets", []) if a.get("assetId") == asset_id]
        info = {"creationMethod": found[0].get("creationMethod") if found else None,
                "displayName": found[0].get("displayName") if found else asset_id}
        with open(path, "w") as f:
            json.dump(info, f)
    return json.load(open(path))


def fetch_asset(work, asset_id):
    url = "https://ambientcg.com/get?file=%s_1K-JPG.zip" % asset_id
    z = download(url, os.path.join(work, "dl", asset_id + ".zip"))
    return safe_extract_maps(z, os.path.join(work, "src", asset_id), asset_id)


# ---------------------------------------------------------------------------- process


def find_map(d, key):
    for ext in ("jpg", "png"):
        p = os.path.join(d, key + "." + ext)
        if os.path.exists(p):
            return p
    return None


def process_photo(d, e):
    """Load ambientCG maps from dir d and bake them per spec entry e at SIZE."""
    col = T.tile_near_square(T.load_rgb(find_map(d, "Color")))
    pn = find_map(d, "NormalGL")
    if pn:
        nrm = T.decode_normal(T.tile_near_square(T.load_rgb(pn)))
    else:
        pn = find_map(d, "NormalDX")
        nrm = T.decode_normal(T.tile_near_square(T.load_rgb(pn)), directx=True)
    pr = find_map(d, "Roughness")
    rough = T.tile_near_square(T.load_gray(pr)) if pr else None

    k = e.get("rot", 0)
    col = T.rot90_rgb(col, k)
    nrm = T.rot90_normal(nrm, k)
    if rough is not None:
        rough = T.rot90_rgb(rough, k)

    if e.get("from_height"):  # rebuild a clean albedo from the height map (source colour is unusable)
        ph = find_map(d, "Displacement")
        hgt = T.resize_wrap(T.rot90_rgb(T.tile_near_square(T.load_gray(ph)), k), SIZE)
        hgt = T.norm01(T.flatten_gray(hgt, SIZE / 10.0, 1.0))
        lo = e["from_height"]
        lin = np.asarray(e["color"], np.float32)[None, None, :] * (lo + (1 - lo) * hgt)[..., None]
        col = T.linear_to_srgb(np.clip(lin, 0, 1))
    else:
        col = T.resize_rgb_linear(col, SIZE)
    nrm = T.resize_normal(nrm, SIZE)
    rough = T.resize_wrap(rough, SIZE) if rough is not None else np.full((SIZE, SIZE), 0.7, np.float32)
    # clean up residual wrap-around discontinuities, only where the source actually has them
    if T.seam_score(col) > SEAM_FIX_THRESHOLD:
        col = np.clip(T.fix_seams(col), 0, 1)
    if max(T.seam_score(nrm[..., 0]), T.seam_score(nrm[..., 1])) > SEAM_FIX_THRESHOLD:
        nrm = T.normalize(T.fix_seams(nrm))
    if T.seam_score(rough) > SEAM_FIX_THRESHOLD:
        rough = np.clip(T.fix_seams(rough), 0, 1)
    return col, nrm, rough


def grade(col_srgb, nrm, rough, e):
    lin = T.srgb_to_linear(col_srgb)
    sigma = e.get("sigma", SIZE / 10.0)
    lin = T.flatten_lowfreq(lin, sigma, e.get("flat", 0.5))
    if e.get("desat"):
        lin = T.desaturate(lin, e["desat"])
    if e.get("contrast", 1.0) != 1.0:
        lin = T.contrast_luma(lin, e["contrast"])
    if e.get("color") is not None:
        lin = T.tint_to(lin, e["color"])
    if e.get("luma") is not None:
        lin = T.set_mean_luma(lin, e["luma"])
    nrm = T.normal_strength(nrm, e.get("nstr", 1.0))
    if e.get("ndetail"):  # add fine relief derived from the albedo (high-passed luminance)
        h = T.flatten_gray(T.luminance(lin), 3.0, 1.0)
        h = h / max(float(h.std()), 1e-4) * 0.05
        nrm = T.combine_normals(nrm, T.height_to_normal(h, e["ndetail"]))
    r = e.get("rough")
    if isinstance(r, (int, float)):
        rough = np.full_like(rough, float(r))
    elif r is not None:
        rough = T.flatten_gray(rough, sigma, 0.5)
        rough = T.remap(rough, r[0], r[1])
    return T.linear_to_srgb(lin), nrm, rough


def build_entry(work, e):
    if e.get("src"):
        d = fetch_asset(work, e["src"])
        col, nrm, rough = process_photo(d, e)
        col, nrm, rough = grade(col, nrm, rough, e)
        if e.get("gen"):
            col, nrm, rough = getattr(P, "post_" + e["gen"])(col, nrm, rough, SIZE)
    else:
        col, nrm, rough = getattr(P, e["gen"])(SIZE)
    return col, nrm, rough


def manifest_row(e, albedo_path, work):
    # average colour of the albedo as actually saved (decoded JPG), in linear light
    lin = T.srgb_to_linear(T.load_rgb(albedo_path)).reshape(-1, 3).mean(0)
    n = e["name"]
    row = dict(
        name=n,
        albedo="%s_albedo.jpg" % n,
        normal="%s_normal.jpg" % n,
        rough="%s_rough.jpg" % n,
        avgColor=[round(float(v), 4) for v in lin],
        tintable=bool(e.get("tint", False)),
        worldSizeMeters=e["size"],
        procedural=not bool(e.get("src")),
        metallic=float(e.get("metal", 0)),
    )
    if e.get("src"):
        info = asset_info(work, e["src"])
        method = info.get("creationMethod") or "unknown"
        row.update(source="ambientCG %s (%s)" % (e["src"], info.get("displayName") or e["src"]),
                   sourceMethod=method, license=ACG_LICENSE,
                   url="https://ambientcg.com/view?id=%s" % e["src"])
        note = e.get("note", "")
        if e.get("gen"):
            note += " (+ procedural post-process '%s')" % e["gen"]
    else:
        row.update(source="procedural: scripts/assets/procedural_textures.py %s()" % e["gen"],
                   sourceMethod="numpy procedural", license="CC0 1.0 Universal (generated for this project)",
                   url="")
        note = e.get("note", "")
    if row["metallic"]:
        note += "; albedo is the metal base colour (use metallic=1)"
    row["notes"] = note
    return row


def probe_sheet(results, out_path):
    """Preview sheet, one row per texture:
    albedo | albedo tiled 2x2 (half scale) | lit preview (normal + roughness) | normal | roughness."""
    from PIL import Image, ImageDraw
    cell = SIZE
    sheet = Image.new("RGB", (cell * 5, len(results) * (cell + 14)), (30, 30, 30))
    dr = ImageDraw.Draw(sheet)
    L = T.normalize(np.array([-0.45, 0.45, 0.77], np.float32))
    H = T.normalize(L + np.array([0, 0, 1.0], np.float32))

    def u8(a):
        return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))

    for i, (name, col, nrm, rough) in enumerate(results):
        y = i * (cell + 14)
        dr.text((4, y + 1), name, fill=(255, 255, 255))
        lin = T.srgb_to_linear(col)
        ndl = np.clip(np.sum(nrm * L, -1), 0, 1) / L[2]
        ndh = np.clip(np.sum(nrm * H, -1), 0, 1)
        shin = 2.0 + 200.0 * (1.0 - rough) ** 3
        spec = (ndh ** shin) * (1.0 - rough) ** 2 * 0.6
        lit = T.linear_to_srgb(np.clip(lin * (0.2 + 0.8 * ndl)[..., None] + spec[..., None], 0, 1))
        half = np.asarray(u8(col).resize((cell // 2, cell // 2), Image.LANCZOS))
        tiled = np.tile(half, (2, 2, 1))
        sheet.paste(u8(col), (0, y + 14))
        sheet.paste(Image.fromarray(tiled), (cell, y + 14))
        sheet.paste(u8(lit), (cell * 2, y + 14))
        sheet.paste(u8(T.encode_normal(nrm)), (cell * 3, y + 14))
        sheet.paste(u8(rough).convert("RGB"), (cell * 4, y + 14))
    sheet.save(out_path)
    print("probe sheet:", out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="/tmp/claude-0/assets-work")
    ap.add_argument("--only", default="")
    ap.add_argument("--probe", default="", help="write a preview sheet instead of the final files")
    ap.add_argument("--try", dest="trial", action="append", default=[],
                    help="probe-only extra entry as JSON, e.g. '{\"name\":\"x\",\"src\":\"Wood095\",\"size\":1}'")
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    entries = [e for e in SPEC if (not only or e["name"] in only)]
    if args.trial:
        entries = ([] if not only else entries) + [json.loads(t) for t in args.trial]
        if not args.probe:
            sys.exit("--try is only allowed together with --probe")
    os.makedirs(OUT_DIR, exist_ok=True)
    results, rows = [], []
    for e in entries:
        col, nrm, rough = build_entry(args.work, e)
        seam = max(T.seam_score(col), T.seam_score(rough))
        print("%-18s src=%-16s seam=%.2f mean=%s" % (e["name"], e.get("src") or "procedural", seam,
                                                      np.round(col.reshape(-1, 3).mean(0), 3)))
        if args.probe:
            results.append((e["name"], col, nrm, rough))
            continue
        n = e["name"]
        T.save_rgb(os.path.join(OUT_DIR, n + "_albedo.jpg"), col)
        T.save_rgb(os.path.join(OUT_DIR, n + "_normal.jpg"), T.encode_normal(nrm))
        T.save_gray(os.path.join(OUT_DIR, n + "_rough.jpg"), rough)
        rows.append(manifest_row(e, os.path.join(OUT_DIR, n + "_albedo.jpg"), args.work))
    if args.probe:
        probe_sheet(results, args.probe)
        return
    mpath = os.path.join(OUT_DIR, "manifest.json")
    if only and os.path.exists(mpath):  # merge partial rebuilds into the existing manifest
        old = {r["name"]: r for r in json.load(open(mpath))}
        old.update({r["name"]: r for r in rows})
        rows = [old[e["name"]] for e in SPEC if e["name"] in old]
    with open(mpath, "w") as f:
        json.dump(rows, f, indent=2)
        f.write("\n")
    print("wrote", mpath, len(rows), "entries")


if __name__ == "__main__":
    main()
