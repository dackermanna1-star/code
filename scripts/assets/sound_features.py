#!/usr/bin/env python3
"""Selection aid: classify ambiguous impact/footstep sounds by nearest labelled neighbours.

Usage: python3 -I scripts/assets/sound_features.py <work_dir>
Reads the extracted packs in <work_dir>/snd_src, computes a few acoustic features
(spectral centroid, high/low band ratios, decay time, spectral peakiness, flatness)
and prints, for each ambiguous file, the categories of its 5 nearest labelled sounds.
Only used to inform the hand-written categorisation rules in fetch_sounds.py.
"""
import os
import re
import subprocess
import sys

import numpy as np

SR = 22050


def decode(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-af", "highpass=f=40", "-ac", "1", "-ar", str(SR),
                        "-f", "f32le", "-"],
                       capture_output=True)
    return np.frombuffer(r.stdout, np.float32)


def features(x):
    if len(x) < SR // 50:
        return None
    x = x / (np.abs(x).max() + 1e-9)
    hop = SR // 100
    frames = len(x) // hop
    env = np.sqrt(np.array([np.mean(x[i * hop:(i + 1) * hop] ** 2) for i in range(frames)]) + 1e-12)
    env_db = 20 * np.log10(env / env.max())
    onset = int(np.argmax(env_db > -30))
    peak = int(np.argmax(env))
    after = np.where(env_db[peak:] < -20)[0]
    decay = (after[0] if len(after) else frames - peak) / 100.0
    seg = x[onset * hop: onset * hop + int(0.25 * SR)]
    if len(seg) < 256:
        seg = np.pad(seg, (0, 256 - len(seg)))
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) + 1e-9
    f = np.fft.rfftfreq(len(seg), 1 / SR)
    p = spec ** 2
    centroid = float((f * p).sum() / p.sum())
    hi = float(p[f > 4000].sum() / p.sum())
    lo = float(p[f < 300].sum() / p.sum())
    flat = float(np.exp(np.mean(np.log(spec))) / np.mean(spec))
    peaky = float(np.max(spec) / np.mean(spec))
    return np.array([np.log(centroid), hi, lo, np.log(decay + 0.02), np.log(peaky), flat], np.float32)


LABELS = [
    ("kenney_impact", r"impactwood|impactplank", "impact_wood"),
    ("kenney_impact", r"impactmetal|impacttin|impactbell", "impact_metal"),
    ("kenney_impact", r"impactglass", "impact_glass"),
    ("kenney_impact", r"impactsoft", "impact_soft"),
    ("kenney_impact", r"impactmining", "impact_concrete"),
    ("kenney_impact", r"impactpunch", "punch"),
    ("kenney_impact", r"footstep_wood", "footstep_wood"),
    ("kenney_impact", r"footstep_concrete", "footstep_concrete"),
    ("kenney_impact", r"footstep_carpet", "footstep_carpet"),
    ("oga_breaking", r"wood_hit", "impact_wood"),
    ("oga_breaking", r"metal_hit", "impact_metal"),
    ("oga_breaking", r"glass_hit", "impact_glass"),
    ("oga_breaking", r"rock_hit", "impact_concrete"),
    ("oga_wood_metal", r"^wood_hit", "impact_wood"),
    ("oga_wood_metal", r"^metal_hit", "impact_metal"),
    ("oga_100sfx", r"^dishes", "impact_ceramic"),
    ("oga_wood_metal2", r"metal\d", "impact_metal"),
    ("oga_wood_metal2", r"wood\d", "impact_wood"),
]

QUERIES = [
    ("kenney_impact", r"impactplate|impactgeneric"),
    ("kenney_rpg", r"footstep\d|chop|droplether|bookplace"),
    ("oga_breaking", r"bfh1_hit_|bfh1_misc"),
    ("oga_100sfx", r"^hit_|^glass_|^wooden_|^slam_|^pot_|^metal_"),
    ("oga_100sfx2", r"_hit_0|_glass_|footstep_0|_stones_|_wood_0|_metal_0"),
    ("oga_owlish", r"clamour|footsteps__step\d|hard-footstep|impacts__hit|impacts__tap|toaster"),
    ("oga_owlish2", r"kitchen"),
    ("oga_footsteps", r"."),
    ("oga_steps", r"."),
    ("oga_metal_hits", r"."),
    ("oga_lego", r"."),
]


def main():
    work = sys.argv[1]
    src = os.path.join(work, "snd_src")
    X, y, names = [], [], []
    for pack, pat, cat in LABELS:
        d = os.path.join(src, pack)
        for fn in sorted(os.listdir(d)):
            if re.search(pat, fn.lower().split("__")[-1]):
                ft = features(decode(os.path.join(d, fn)))
                if ft is not None:
                    X.append(ft)
                    y.append(cat)
                    names.append(pack + "/" + fn)
    X = np.array(X)
    mu, sd = X.mean(0), X.std(0) + 1e-6
    Xn = (X - mu) / sd
    # leave-one-out accuracy of the labelled set, as a sanity check
    ok = 0
    for i in range(len(Xn)):
        d = np.linalg.norm(Xn - Xn[i], axis=1)
        d[i] = 1e9
        nn = [y[j] for j in np.argsort(d)[:5]]
        ok += max(set(nn), key=nn.count) == y[i]
    print("labelled: %d, leave-one-out 5-NN accuracy %.2f" % (len(y), ok / len(y)))
    for pack, pat in QUERIES:
        d = os.path.join(src, pack)
        for fn in sorted(os.listdir(d)):
            if not re.search(pat, fn.lower().split("__")[-1] if "__" in fn else fn.lower()):
                continue
            ft = features(decode(os.path.join(d, fn)))
            if ft is None:
                continue
            dist = np.linalg.norm(Xn - (ft - mu) / sd, axis=1)
            nn = [y[j] for j in np.argsort(dist)[:5]]
            votes = sorted(set(nn), key=lambda c: -nn.count(c))
            print("%-16s %-48s -> %s" % (pack, fn[:48], ", ".join("%s:%d" % (c, nn.count(c)) for c in votes)))


if __name__ == "__main__":
    main()
