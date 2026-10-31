"""Verify every deliverable: existence, format, dimensions, channels, levels, loops.

Exit code 0 only if everything passes.  Prints a full report.
"""
from __future__ import annotations

import json
import subprocess
import sys

import numpy as np
from PIL import Image

import dsp as D
import manifest as M
import texlib as T
from gen_skins import PARTS, rects

A = T.ASSETS
fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL:", msg)


def skin_regions():
    base, over = np.zeros((64, 64), bool), np.zeros((64, 64), bool)
    for name, (u, v, w, h, d) in PARTS.items():
        is_over = name in ("hat", "jacket", "rsleeve", "lsleeve", "rpants", "lpants")
        for (x, y, fw, fh) in rects(u, v, w, h, d).values():
            (over if is_over else base)[y:y + fh, x:x + fw] = True
    return base, over


def check_textures():
    print("== textures")
    base_m, over_m = skin_regions()
    for rel, (w, h) in sorted(M.TEXTURES.items()):
        p = A / rel
        if not p.exists():
            fail(f"missing {rel}")
            continue
        with open(p, "rb") as fh:
            if fh.read(8) != b"\x89PNG\r\n\x1a\n":
                fail(f"not a PNG: {rel}")
                continue
        im = Image.open(p)
        im.load()
        if im.mode != "RGBA":
            fail(f"{rel}: mode {im.mode} (expected RGBA)")
        if im.size != (w, h):
            fail(f"{rel}: size {im.size} expected {(w, h)}")
        a = np.array(im.convert("RGBA"))
        dirty = int(((a[..., 3] == 0) & (a[..., :3].sum(-1) > 0)).sum())
        if dirty:
            fail(f"{rel}: {dirty} transparent pixels with non-zero RGB")
        note = ""
        if rel in ("textures/entity/gojo.png", "textures/entity/sukuna.png", "textures/entity/sukuna_heian.png"):
            if not (a[base_m, 3] == 255).all():
                fail(f"{rel}: base layer not fully opaque")
            unused = ~(base_m | over_m)
            if (a[unused, 3] != 0).any():
                fail(f"{rel}: unused skin area not transparent")
            if not np.isin(a[over_m, 3], (0, 255)).all():
                fail(f"{rel}: overlay has partial alpha")
            note = f" base-opaque ok, overlay px={int((a[over_m, 3] > 0).sum())}"
        if rel.endswith(("_eyes.png", "_markings.png")):
            nz = a[..., 3] > 0
            basefile = rel.replace("_eyes", "").replace("_markings", "")
            b = np.array(Image.open(A / basefile).convert("RGBA"))
            if (b[nz, 3] == 0).any():
                fail(f"{rel}: emissive pixel over a transparent base pixel (misaligned)")
            note = f" emissive px={int(nz.sum())}"
        if rel.startswith("textures/block/"):
            if (a[..., 3] != 255).any():
                fail(f"{rel}: block texture not opaque")
        print(f"  ok {rel:58s} {w}x{h}{note}")
    for rel, (ft, interp, frames) in M.MCMETA.items():
        p = A / rel
        if not p.exists():
            fail(f"missing {rel}")
            continue
        j = json.loads(p.read_text())
        an = j.get("animation", {})
        if an.get("frametime") != ft or an.get("interpolate") is not interp:
            fail(f"{rel}: wrong animation params {an}")
        png = A / rel[:-len(".mcmeta")]
        hh = Image.open(png).size[1]
        if hh != frames * 16:
            fail(f"{rel}: strip height {hh} != {frames}*16")
        print(f"  ok {rel:58s} frametime={ft} interpolate={interp} frames={frames}")


def ffprobe(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                          "stream=codec_name,sample_rate,channels:format=format_name", "-of", "json", str(p)],
                         capture_output=True, text=True)
    if out.returncode != 0:
        return None
    return json.loads(out.stdout)


def check_sounds():
    print("== sounds")
    from analyze_audio import centroid, loop_seam
    for rel, (ch, nominal, loop) in sorted(M.SOUNDS.items()):
        p = A / rel
        if not p.exists():
            fail(f"missing {rel}")
            continue
        info = ffprobe(p)
        if not info or not info.get("streams"):
            fail(f"{rel}: ffprobe cannot read")
            continue
        st = info["streams"][0]
        if st["codec_name"] != "vorbis":
            fail(f"{rel}: codec {st['codec_name']}")
        if int(st["sample_rate"]) != 44100:
            fail(f"{rel}: sample rate {st['sample_rate']}")
        if int(st["channels"]) != ch:
            fail(f"{rel}: channels {st['channels']} expected {ch}")
        if "ogg" not in info["format"]["format_name"]:
            fail(f"{rel}: container {info['format']['format_name']}")
        x, sr, chans = D.decode(p)
        dur = len(x) / sr
        peak = D.to_db(np.max(np.abs(x)))
        dc = np.abs(np.mean(x, axis=0)).max()
        clip = int((np.abs(x) >= 0.999).sum())
        cen = centroid(x)
        extra = ""
        if peak > -1.0:
            fail(f"{rel}: peak {peak:.2f} dBFS > -1")
        if dc > 1e-3:
            fail(f"{rel}: DC offset {dc:.5f}")
        if clip:
            fail(f"{rel}: {clip} clipped samples")
        if nominal is not None:
            tol = 3.5 if nominal > 30 else max(0.03, nominal * 0.1)
            if abs(dur - nominal) > tol:
                fail(f"{rel}: duration {dur:.2f}s vs nominal {nominal}s")
        elif not (0.5 < dur < 8.0):
            fail(f"{rel}: voice duration {dur:.2f}s out of range")
        if loop:
            step, spike = loop_seam(x)
            extra += f" seam(step/local99={step:.2f}, hf={spike:+.1f}dB)"
            if step > 1.5 or spike > 3.0:
                fail(f"{rel}: loop seam suspicious ({step:.2f}, {spike:+.1f} dB)")
        if ch == 2:
            lu = D.lufs(x)
            corr = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1])
            extra += f" LUFS={lu:.1f} LRcorr={corr:.2f}"
            if abs(lu + 14) > 1.0:
                fail(f"{rel}: loudness {lu:.1f} LUFS (target -14)")
        print(f"  ok {rel:42s} ch={chans} {dur:6.2f}s peak={peak:6.2f}dBFS dc={dc:.5f} centroid={cen:6.0f}Hz{extra}")


def check_strays():
    print("== stray files")
    expected = set(M.TEXTURES) | set(M.MCMETA) | set(M.SOUNDS)
    for root in ("textures", "sounds"):
        for p in sorted((A / root).rglob("*")):
            if p.is_file():
                rel = str(p.relative_to(A))
                if rel not in expected:
                    print(f"  WARN: {rel} is not produced by assetgen (created elsewhere, left untouched)")
    print(f"  {len(M.TEXTURES)} textures, {len(M.MCMETA)} mcmeta, {len(M.SOUNDS)} sounds expected")


if __name__ == "__main__":
    check_textures()
    check_sounds()
    check_strays()
    print()
    if fails:
        print(f"{len(fails)} FAILURES")
        for f in fails:
            print(" -", f)
        sys.exit(1)
    print("ALL CHECKS PASSED")
