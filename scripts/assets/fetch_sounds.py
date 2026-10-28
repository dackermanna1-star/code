#!/usr/bin/env python3
"""Fetch CC0 sound packs (Kenney + OpenGameArt) and convert them for the game.

Every kept file becomes public/assets/sounds/<pack>/<name>.ogg :
OGG Vorbis, mono, 44.1 kHz, quality 5, leading (and trailing) silence trimmed relative to the
peak, optionally capped in length with a short fade-out, peak-normalised to -1 dBFS (checked on
the decoded result and re-encoded if the codec overshoots).
public/assets/sounds/manifest.json lists {file, pack, category, durationSec, source, license, url}.

Usage (from the repo root; archives are untrusted data and stay outside the repo):
    python3 -I scripts/assets/fetch_sounds.py [--work /tmp/claude-0/assets-work] [--list] [--only p1,p2]
--list only downloads/extracts and prints what each pack contains (ffprobe stats + category).

Requirements: ffmpeg/ffprobe (with libvorbis) on PATH, numpy, and `py7zr` (pip) for the .7z packs.
"""
import argparse
import http.cookiejar
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT_DIR = os.path.join(REPO, "public", "assets", "sounds")
AUDIO_EXT = (".wav", ".ogg", ".mp3", ".flac", ".aif", ".aiff")
CC0 = "CC0 1.0 Universal (public domain)"
UA = {"User-Agent": "Mozilla/5.0 (asset-fetch for a CC0 game project)"}

# --------------------------------------------------------------------------------------
# Packs. `files` are direct downloads (archives or single audio files); `kenney` is the
# kenney.nl asset slug (the page hands out a fresh signed zip link).
# `rules` = ordered (regex on lower-cased source filename, category or None=skip).
# The first matching rule wins; files matching no rule are skipped.
# --------------------------------------------------------------------------------------
PACKS = []


def pack(**kw):
    kw.setdefault("license", CC0)
    PACKS.append(kw)


# ------------------------------------------------------------------------------ helpers


class Net:
    def __init__(self):
        self.cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj))

    def get(self, url, headers=None, timeout=300):
        req = urllib.request.Request(url, headers={**UA, **(headers or {})})
        with self.op.open(req, timeout=timeout) as r:
            return r.read()

    def download(self, url, dest, headers=None):
        if os.path.exists(dest):
            return dest
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        data = self.get(url, headers)
        with open(dest + ".part", "wb") as f:
            f.write(data)
        os.replace(dest + ".part", dest)
        return dest

    def kenney_zip(self, slug, dest):
        if os.path.exists(dest):
            return dest
        page = "https://kenney.nl/assets/%s" % slug
        self.get(page)  # session cookie
        dl_id = ("assets/%s" % slug).encode().hex()
        info = json.loads(self.get("https://kenney.nl/download-link/%s" % dl_id, {"Referer": page}))
        if not info.get("url"):
            raise RuntimeError("no kenney download url for %s: %r" % (slug, info))
        return self.download(info["url"], dest, {"Referer": page})


def _safe_member(name):
    n = name.replace("\\", "/")
    if n.startswith("/") or re.match(r"^[A-Za-z]:", n) or any(p == ".." for p in n.split("/")):
        return None
    if "__MACOSX" in n or os.path.basename(n).startswith("._"):
        return None
    return n if n.lower().endswith(AUDIO_EXT) else None


def extract_audio(archive, out_dir):
    """Extract only audio members (sanitised, flattened names) into out_dir."""
    os.makedirs(out_dir, exist_ok=True)
    low = archive.lower()

    def target(member):
        flat = re.sub(r"[^A-Za-z0-9._-]+", "_", member.replace("\\", "/").strip("/").replace("/", "__"))
        return os.path.join(out_dir, flat)

    if low.endswith(AUDIO_EXT):
        shutil.copyfile(archive, os.path.join(out_dir, re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.basename(archive))))
    elif low.endswith(".zip"):
        with zipfile.ZipFile(archive) as z:
            for info in z.infolist():
                m = _safe_member(info.filename)
                if not m or info.is_dir():
                    continue
                if info.file_size > 200 * 1024 * 1024:
                    raise RuntimeError("member too large: %s" % m)
                with z.open(info) as src, open(target(m), "wb") as dst:
                    shutil.copyfileobj(src, dst)
    elif low.endswith(".7z"):
        import py7zr  # noqa: needs `pip install py7zr`
        with py7zr.SevenZipFile(archive, "r") as z:
            names = [n for n in z.getnames() if _safe_member(n)]
            tmp = out_dir + ".tmp7z"
            shutil.rmtree(tmp, ignore_errors=True)
            os.makedirs(tmp)
            z.extract(path=tmp, targets=names)
        for n in names:
            src = os.path.join(tmp, n)
            if os.path.isfile(src) and os.path.realpath(src).startswith(os.path.realpath(tmp) + os.sep):
                shutil.move(src, target(n))
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        raise RuntimeError("unknown archive type: %s" % archive)


def ffprobe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "format=duration:stream=sample_rate,channels,codec_name",
                          "-of", "json", path], capture_output=True, text=True)
    if out.returncode:
        return None
    j = json.loads(out.stdout)
    st = (j.get("streams") or [{}])[0]
    return dict(duration=float(j.get("format", {}).get("duration") or 0), rate=int(st.get("sample_rate") or 0),
                channels=int(st.get("channels") or 0), codec=st.get("codec_name"))


def max_volume_db(path, pre_filter):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", pre_filter + ",volumedetect",
                          "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"max_volume:\s*(-?[\d.]+|-inf) dB", out.stderr)
    if not m or m.group(1) == "-inf":
        return None
    return float(m.group(1))


def convert(src, dst, max_len=None):
    """Mono 44.1k, trim leading (and trailing) silence relative to the peak, optional length
    cap with fade-out, peak-normalise to -1 dBFS (verified on the decoded result), Vorbis q5."""
    base = "aformat=channel_layouts=mono,aresample=44100"
    src_peak = max_volume_db(src, base)
    if src_peak is None:
        return False
    start_thr = min(-40.0, src_peak - 40.0)  # onset = first sound within 40 dB of the peak
    end_thr = src_peak - 55.0
    pre = (base + ",silenceremove=start_periods=1:start_threshold=%.1fdB:start_silence=0.005"
           ",areverse,silenceremove=start_periods=1:start_threshold=%.1fdB:start_silence=0.05,areverse"
           % (start_thr, end_thr))
    if max_len:
        pre += ",atrim=0:%g,afade=t=out:st=%g:d=%g" % (max_len, max(max_len - 0.3, 0), 0.3)
    peak = max_volume_db(src, pre)
    if peak is None:
        return False
    gain = -1.0 - peak
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    best = None  # (score, peak, encoded bytes)
    for _ in range(6):  # lossy coding shifts transient peaks: re-encode until the decoded peak is ~-1 dBFS
        r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-af",
                            pre + ",volume=%.2fdB" % gain, "-ac", "1", "-ar", "44100", "-c:a", "libvorbis",
                            "-q:a", "5", "-map_metadata", "-1", dst], capture_output=True, text=True)
        if r.returncode:
            print("ffmpeg failed:", src, r.stderr[-300:])
            return False
        p = decoded_peak_db(dst)
        if p is None:
            return True
        score = abs(p + 1.0) + (10.0 if p > -0.5 else 0.0)  # never prefer a result hotter than -0.5 dBFS
        if best is None or score < best[0]:
            best = (score, p, open(dst, "rb").read())
        if abs(p + 1.0) <= 0.3:
            return True
        gain -= (p + 1.0) * 0.9
    with open(dst, "wb") as f:  # keep the closest attempt
        f.write(best[2])
    return True


def decoded_peak_db(path):
    import numpy as np
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-f", "f32le", "-"], capture_output=True)
    x = np.frombuffer(r.stdout, np.float32)
    if not len(x):
        return None
    m = float(np.abs(x).max())
    return 20 * np.log10(m) if m > 0 else None


def out_name(pack_id, src_name, rename):
    base = os.path.splitext(src_name)[0]
    for pat, rep in rename:
        base = re.sub(pat, rep, base)
    base = re.sub(r"[^a-z0-9]+", "_", base.lower()).strip("_")
    return base


# --------------------------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", default="/tmp/claude-0/assets-work")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    only = set(filter(None, args.only.split(",")))
    net = Net()
    rows = []
    for p in PACKS:
        if only and p["id"] not in only:
            continue
        src_dir = os.path.join(args.work, "snd_src", p["id"])
        if not (os.path.isdir(src_dir) and os.listdir(src_dir)):
            archives = []
            if p.get("kenney"):
                archives.append(net.kenney_zip(p["kenney"], os.path.join(args.work, "snd_dl", p["id"] + ".zip")))
            for u in p.get("files", []):
                fn = re.sub(r"[^A-Za-z0-9._-]+", "_", urllib.parse.unquote(u.rsplit("/", 1)[1]))
                archives.append(net.download(u, os.path.join(args.work, "snd_dl", p["id"], fn)))
            for a in archives:
                extract_audio(a, src_dir)
        files = sorted(os.listdir(src_dir))
        if args.list:
            print("== %s (%d files)  %s" % (p["id"], len(files), p["url"]))
            for f in files:
                info = ffprobe(os.path.join(src_dir, f)) or {}
                cat = categorize(p, f)[0]
                print("   %-60s %6.2fs %5dHz ch%d %-9s -> %s" % (f, info.get("duration", 0), info.get("rate", 0),
                                                              info.get("channels", 0), info.get("codec"), cat))
            continue
        used = set()
        for f in files:
            cat, max_len = categorize(p, f)
            if not cat:
                continue
            info = ffprobe(os.path.join(src_dir, f))
            if not info or info["duration"] < 0.05 or info["rate"] < 11025:
                print("skip junk:", p["id"], f, info)
                continue
            name = out_name(p["id"], f, p.get("rename", []))
            while name in used:
                name += "_b"
            used.add(name)
            rel = "%s/%s.ogg" % (p["id"], name)
            dst = os.path.join(OUT_DIR, rel)
            if not convert(os.path.join(src_dir, f), dst, max_len):
                continue
            dur = (ffprobe(dst) or {}).get("duration", 0)
            rows.append(dict(file=rel, pack=p["id"], category=cat, durationSec=round(dur, 3),
                             source="%s (%s)" % (p["title"], p["author"]), license=p["license"], url=p["url"]))
        print("%-18s kept %d" % (p["id"], sum(1 for r in rows if r["pack"] == p["id"])))
    if args.list:
        return
    mpath = os.path.join(OUT_DIR, "manifest.json")
    if only and os.path.exists(mpath):
        old = [r for r in json.load(open(mpath)) if r["pack"] not in only]
        rows = old + rows
    rows.sort(key=lambda r: (r["pack"], r["file"]))
    with open(mpath, "w") as f:
        json.dump(rows, f, indent=2)
        f.write("\n")
    print("wrote %s (%d sounds)" % (mpath, len(rows)))


def categorize(p, fname):
    """First matching rule wins -> (category or None, max_len or None)."""
    low = fname.lower()
    for rule in p.get("rules", []):
        pat, cat = rule[0], rule[1]
        if re.search(pat, low):
            return cat, (rule[2] if len(rule) > 2 else p.get("max_len"))
    return None, None


# ------------------------------------------------------------------------------- packs
OGA = "https://opengameart.org/content/"
FILES = "https://opengameart.org/sites/default/files/"

pack(id="kenney_impact", title="Impact Sounds", author="Kenney", kenney="impact-sounds",
     url="https://kenney.nl/assets/impact-sounds", rename=[(r"^Audio__", "")],
     rules=[(r"footstep_carpet", "footstep_carpet"), (r"footstep_concrete", "footstep_concrete"),
            (r"footstep_wood", "footstep_wood"), (r"footstep_(grass|snow)", None),
            (r"impactbell|impactmetal|impacttin", "impact_metal"), (r"impactglass", "impact_glass"),
            (r"impactmining", "impact_concrete"), (r"impactplank|impactwood", "impact_wood"),
            # 'plate' and 'generic light' are dull, non-ringing hollow knocks -> used for plastic
            (r"impactplate|impactgeneric", "impact_plastic"), (r"impactpunch", "punch"),
            (r"impactsoft", "impact_soft")])
pack(id="kenney_rpg", title="RPG Audio", author="Kenney", kenney="rpg-audio",
     url="https://kenney.nl/assets/rpg-audio", rename=[(r"^Audio__", "")],
     rules=[(r"preview", None), (r"belthandle|cloth|handlesmallleather", "cloth"),
            (r"bookplace|dropleather", "impact_soft"), (r"chop", "impact_wood"), (r"creak", "creak"),
            (r"door|metallatch", "door"), (r"footstep", "footstep_carpet"), (r"metalpot", "impact_metal"),
            (r"metalclick|book(flip|open|close)", "misc")])
pack(id="oga_breaking", title="75 CC0 breaking / falling / hit sfx", author="rubberduck",
     url=OGA + "75-cc0-breaking-falling-hit-sfx", files=[FILES + "sfx_breaking_and_falling.zip"],
     rules=[(r"glass_(breaking|falling)", "glass_break"), (r"glass_hit", "impact_glass"),
            (r"metal_(hit|falling)", "impact_metal"), (r"wood_breaking", "wood_break"),
            (r"wood_(hit|falling)", "impact_wood"), (r"rock_hit", "impact_concrete"),
            (r"rock_(breaking|falling)|bfh1_breaking|bfh1_falling", "debris"), (r"bfh1_(hit|misc)", "misc")])
pack(id="oga_wood_metal", title="100 CC0 metal and wood SFX", author="rubberduck",
     url=OGA + "100-cc0-metal-and-wood-sfx", files=[FILES + "100-CC0-wood-metal-SFX.zip"],
     rules=[(r"door_open|lock_open|metal_(open|close|slam)|wood_close", "door"), (r"^hammer_", "impact_metal"),
            (r"metal_(falling|hit|sheet)", "impact_metal"), (r"^misc_|^tools_", "misc"),
            (r"wood_(breaking|cracking)", "wood_break"), (r"wood_(falling|hammer|hit|misc|slam)", "impact_wood"),
            (r"wood_squeak", "creak")])
pack(id="oga_wood_crack", title="35 wooden cracks/hits/destructions", author="qubodup",
     url=OGA + "35-wooden-crackshitsdestructions",
     files=[FILES + "independent_nu_ljudbank-wood_crack_hit_destruction.7z"], max_len=3.5,
     rename=[(r"^wood_impact__", ""), (r"\.mp3$", "")],
     rules=[(r"crack\d", "wood_break"), (r"impactwood", "impact_wood")])
pack(id="oga_glass", title="Glass Break", author="TinyWorlds", url=OGA + "glass-break",
     files=[FILES + "glass_breaking.wav"], rules=[(r".", "glass_break")])
pack(id="oga_ice_shatter", title="Ice breaking/shattering", author="IgnasD", url=OGA + "ice-breakingshattering",
     files=[FILES + "IceShatters_0.zip"], rename=[(r"^IceShatters__LedasLuzta", "ice_shatter_")],
     rules=[(r".", "glass_break")])
pack(id="oga_doors", title="Door Open, Door Close Set", author="qubodup", url=OGA + "door-open-door-close-set",
     files=[FILES + "qubodup-DoorSet.7z"], rename=[(r"^.*qubodup-", "")],
     rules=[(r"__ogg__", None), (r"door(open|close)", "door")])
pack(id="oga_door2", title="Door open, door close", author="qubodup", url=OGA + "door-open-door-close",
     files=[FILES + "door.7z"], rename=[(r"^door__", "")], rules=[(r".", "door")])
pack(id="oga_steps", title="Different steps on wood, stone, leaves, gravel and mud", author="TinyWorlds",
     url=OGA + "different-steps-on-wood-stone-leaves-gravel-and-mud", files=[FILES + "%5Bkdd%5DDifferentSteps_0.zip"],
     rules=[(r"wood", "footstep_wood"), (r"stone", "footstep_concrete")])
pack(id="oga_footsteps", title="Footsteps", author="GboxMikeFozzy", url=OGA + "footsteps-0",
     files=[FILES + "0%d-footstep%s.ogg" % (i, "_0" if i == 1 else "") for i in range(1, 7)],
     rules=[(r".", "footstep_concrete")])  # gritty hard-floor steps
pack(id="oga_water", title="40 CC0 water / splash / slime SFX", author="rubberduck",
     url=OGA + "40-cc0-water-splash-slime-sfx", files=[FILES + "water-splash-slime-sfx.zip"],
     rules=[(r"loop_water|loop_rain|splash_", "water")])
pack(id="oga_splash", title="6 Short water splashes", author="qubodup", url=OGA + "6-short-water-splashes",
     files=[FILES + "ezwa-water_splash.7z"], rename=[(r"^ezwa-water_splash__", "")], rules=[(r".", "water")])
pack(id="oga_spark", title="Electricity Sound Effects", author="BMacZero", url=OGA + "electricity-sound-effects-0",
     files=[FILES + "spark.wav", FILES + "continuousspark.wav"], rules=[(r".", "electric")])
pack(id="oga_buzz", title="Electric Buzz", author="themightyglider", url=OGA + "electric-buzz",
     files=[FILES + "buzz_0.ogg"], rules=[(r".", "electric")])
pack(id="oga_breaker", title="SFX - Circuit breaker", author="CleytonKauffman", url=OGA + "sfx-circuit-breaker",
     files=[FILES + "Circuit%20Breaker.zip"], rename=[(r"^.*__", "")], rules=[(r".", "electric")])
pack(id="oga_electricity", title="Electricity Game Sound Pack", author="faxcorp",
     url=OGA + "electricity-game-sound-pack",
     files=[FILES + "crackleelectricityloop.wav", FILES + "snaploop.wav"],
     rules=[(r"crackle|snaploop", "electric")])
pack(id="oga_cave_in", title="Cave In", author="StarNinjas", url=OGA + "cave-in",
     files=[FILES + "cave_in_-_starninjas_0.ogg"], rules=[(r".", "debris")])
pack(id="oga_crunch", title="5 break, crunch impacts", author="qubodup", url=OGA + "5-break-crunch-impacts",
     files=[FILES + "independent_nu_ljudbank-break_crunch_impact.7z"], rename=[(r"^impcrunch__", ""), (r"\.mp3$", "")],
     rules=[(r".", "debris")])
pack(id="oga_impact", title="Impact", author="qubodup", url=OGA + "impact", files=[FILES + "qubodupImpact.7z"],
     rename=[(r"^qubodupImpact__qubodup", "")],
     rules=[(r"\.ogg$", None), (r"meat", "punch"), (r"metal", "impact_metal"), (r"stone", "impact_concrete"),
            (r"wood", "impact_wood")])
pack(id="oga_creak", title="Tree Creaking", author="AntumDeluge", url=OGA + "tree-creaking",
     files=[FILES + "tree_creak.flac"], rules=[(r".", "creak")])
pack(id="oga_hinge", title="Creaky Door Hinge Spooky", author="w.forster.1@gmail.com",
     url=OGA + "creaky-door-hinge-spooky", files=[FILES + "creaky_door_hinge.wav"], rules=[(r".", "creak")])
pack(id="oga_metal_hits", title="Metal Impact Sounds", author="BMacZero", url=OGA + "metal-impact-sounds",
     files=[FILES + f for f in ("bing1.wav", "bong1.wav", "clink1_0.wav", "clink2.wav", "clink3.wav",
                                "thud2.wav", "thud3.wav")], rules=[(r".", "impact_metal")])
pack(id="oga_100sfx", title="100 CC0 SFX", author="rubberduck", url=OGA + "100-cc0-sfx",
     files=[FILES + "100-CC0-SFX_0.zip"],
     rules=[(r"^dishes", "impact_ceramic"), (r"^door|microwave_door|^slam_", "door"), (r"^glass_", "impact_glass"),
            (r"^metal_|^pot_", "impact_metal"), (r"^wooden_0", "impact_wood"), (r"^splash_|^toilet_", "water"),
            (r"^hit_|^paper_|^switch_|^tools_", "misc")])
pack(id="oga_100sfx2", title="100 CC0 SFX #2", author="rubberduck", url=OGA + "100-cc0-sfx-2",
     files=[FILES + "sfx_100_v2.zip"], rename=[(r"^sfx100v2_", "")],
     rules=[(r"_door_|lock_open", "door"), (r"footstep_wood", "footstep_wood"), (r"_glass_", "impact_glass"),
            (r"loop_water", "water"), (r"_metal_", "impact_metal"), (r"_stones_", "debris"),
            (r"_wood_", "impact_wood"), (r"_hit_0|_switch_", "misc")])
pack(id="oga_wood_metal2", title="Wood and Metal Sound Effects: Volume 2", author="Ogrebane",
     url=OGA + "wood-and-metal-sound-effects-volume-2", files=[FILES + "wood_and_metal_vol.2_0.zip"],
     rename=[(r"^wood_and_metal_vol\.2__", "")], rules=[(r"metal\d", "impact_metal"), (r"wood\d", "impact_wood")])
pack(id="oga_owlish", title="Sound Effects Pack", author="OwlishMedia", url=OGA + "sound-effects-pack",
     files=[FILES + "Owlish%20Media%20Sound%20Effects.zip"], rename=[(r"^.*__owlstorm__", "")],
     rules=[(r"blanket-movement-[2346]", "cloth"), (r"hard-footstep", "footstep_tile"),
            (r"footsteps__step\d\.wav", "footstep_wood"), (r"toasterstep", "impact_metal"),
            (r"clamour", "debris"), (r"impacts__slap", "punch"), (r"impacts__fruit", "impact_soft"),
            (r"impacts__(hit|tap)|impacts__scrape[12]|paper__(crumples|pageturn1)", "misc"),
            (r"water__spray-bottle", "water", 6.0), (r"water__tap-water", "water", 8.0),
            (r"ambience__earthquake", "debris", 8.0)])
pack(id="oga_owlish2", title="202 More Sound Effects", author="OwlishMedia", url=OGA + "202-more-sound-effects",
     files=[FILES + "MoreSounds.zip"], rules=[(r"cloth__cloth_0", "cloth")])
pack(id="oga_lego", title="Lego Bricks", author="zq", url=OGA + "lego-bricks", files=[FILES + "bricks_3.zip"],
     rename=[(r"^bricks__", "plastic_")], rules=[(r".", "impact_plastic")])

if __name__ == "__main__":
    main()
