#!/usr/bin/env python3
"""Print analysis tables for candidate source sounds (used to make the hard-coded
selections in build_audio.py; not needed to regenerate the library).

    python3 -I tools/audio/analyze_sources.py [--env] [--segments] [--split] [--pitch] <file-or-dir> ...

Columns: sr/ch/codec, duration, peak dBFS, clip fraction / longest clipped run,
noise floor, leading silence, active duration, attack (to envelope peak), rise
(-20 dB -> -3 dB on a 1 ms peak envelope), -30 dB decay time, spectral
centroid, low-band (<250 Hz) and high-band (>5 kHz) energy ratios, segment
count (silence detection) and, for stereo, L/R correlation.

  --env       coarse envelope sparkline (10 ms per character, re. peak)
  --segments  list the silence-detected segments of multi-sound files
  --split     analyse the channels of weakly correlated stereo files separately
              (some packs store two different takes in L and R)
  --pitch     rough F0 (YIN-style) of voiced frames, for vocals
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np  # noqa: E402

import audiolib as al  # noqa: E402

EXT = (".wav", ".ogg", ".mp3", ".flac", ".aif", ".aiff")


def iter_files(paths):
    for p in paths:
        if os.path.isdir(p):
            for dp, dn, fn in os.walk(p):
                dn.sort()
                for f in sorted(fn):
                    if f.lower().endswith(EXT):
                        yield os.path.join(dp, f)
        else:
            yield p


def env_string(x, step_ms=10, max_s=2.0):
    """Coarse envelope sparkline: one char per step_ms, levels relative to file peak."""
    env, _ = al.envelope(x, al.SR, win_ms=step_ms, hop_ms=step_ms)
    e = al.db(env) - al.db(env).max()
    chars = " .,:;-=+*#%@"
    out = []
    for v in e[: int(max_s * 1000 / step_ms)]:
        k = int(np.clip((v + 60) / 60 * (len(chars) - 1), 0, len(chars) - 1))
        out.append(chars[k])
    return "".join(out)


def report(f, args, info, x, clip, run, corr, tag, show_env, show_segs, show_pitch):
    st = al.analyze(x)
    segs = al.segments(x)
    name = os.path.relpath(f, os.path.commonpath(args) if len(args) > 1 else os.path.dirname(f)) + tag
    print(f"{name[-52:]:52s} {info['sr']:5d} {info['ch']:2d} {str(info['codec'])[:4]:4s} {st['dur']:6.2f} "
          f"{st['peak_db']:6.1f} {clip * 100:6.2f} {run:4d} {st['floor_db']:6.1f} {st['lead_ms']:5.0f} "
          f"{st['active']:5.2f} {st['attack_ms']:5.0f} {st['rise_ms']:4.0f} {st['decay30']:5.2f} {st['cent']:6.0f} "
          f"{st['low']:5.2f} {st['high']:5.2f} {len(segs):3d} {corr:>5s}")
    if show_env:
        print("     env:", env_string(x))
    if show_pitch:
        f0 = al.pitch_track(x)
        if len(f0):
            print(f"     f0: voiced {len(f0) * 10} ms, median {np.median(f0):.0f} Hz, p10 {np.percentile(f0, 10):.0f}, "
                  f"p90 {np.percentile(f0, 90):.0f}")
        else:
            print("     f0: unvoiced")
    if show_segs:
        for k, (a, b) in enumerate(segs):
            s = al.analyze(x[a:b])
            print(f"     seg {k:2d}: {a / al.SR:7.3f}-{b / al.SR:7.3f} ({(b - a) / al.SR:5.2f}s) pk {s['peak_db']:6.1f} "
                  f"att {s['attack_ms']:4.0f}ms rise {s['rise_ms']:3.0f} dec30 {s['decay30']:4.2f} "
                  f"cent {s['cent']:5.0f} low {s['low']:4.2f} hi {s['high']:4.2f}")


def main(argv):
    show_segs = show_env = split = show_pitch = False
    args = argv[1:]
    while args and args[0].startswith("--"):
        show_segs |= args[0] == "--segments"
        show_env |= args[0] == "--env"
        split |= args[0] == "--split"
        show_pitch |= args[0] == "--pitch"
        args = args[1:]
    print(f"{'file':52s} {'sr':>5s} ch {'cod':4s} {'dur':>6s} {'pk':>6s} {'clip%':>6s} {'run':>4s} {'floor':>6s} "
          f"{'lead':>5s} {'act':>5s} {'att':>5s} {'rise':>4s} {'dec30':>5s} {'cent':>6s} {'low':>5s} {'hi':>5s} seg "
          f"{'corr':>5s}")
    for f in iter_files(args):
        try:
            info = al.probe(f)
            xmc = al.decode(f)
        except Exception as e:  # report and keep going
            print(f"{f}: ERROR {e}")
            continue
        clip, run = al.clip_fraction(xmc)
        corr = ""
        if xmc.shape[1] == 2:
            a, b = xmc[:, 0], xmc[:, 1]
            den = np.sqrt((a * a).sum() * (b * b).sum())
            corr = f"{(a * b).sum() / den:5.2f}" if den > 0 else "  nan"
        variants = [("", xmc.mean(axis=1))]
        if split and xmc.shape[1] == 2 and corr and float(corr) < 0.5:
            variants = [(":L", xmc[:, 0]), (":R", xmc[:, 1])]
        for tag, x in variants:
            report(f, args, info, x, clip, run, corr, tag, show_env, show_segs, show_pitch)


if __name__ == "__main__":
    main(sys.argv)
