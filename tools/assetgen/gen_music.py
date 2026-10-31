"""Music loops (stereo, 44.1 kHz OGG, ~-14 LUFS, peak <= -1 dBFS).

A tiny circular sequencer: every note is rendered once and *added modulo the loop
length*, so tails that run past the end land at the start.  Reverb and delays are
circular too, and sustained drones use an integer number of cycles per loop.  The
result is mathematically periodic, i.e. the loop point is seamless by construction.
"""
from __future__ import annotations

import math
import sys

import numpy as np

import dsp as D
import gen_sfx as S
from dsp import ns, tvec, SR, PI

OUT = S.SND / "music"


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


# ============================================================ mixer
class Mix:
    def __init__(self, n):
        self.n = n
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((self.n, 2))
        return self.buses[name]

    def add(self, name, sig, at, gain=1.0, pan=0.0):
        """Mono or stereo signal added circularly at sample `at` with constant-power pan."""
        b = self.bus(name)
        if sig.ndim == 1:
            a = (pan + 1) * PI / 4
            st = np.stack([sig * math.cos(a), sig * math.sin(a)], axis=1) * math.sqrt(2)
        else:
            st = sig
        idx = (np.arange(len(st)) + int(at)) % self.n
        np.add.at(b, idx, st * gain)

    def add_full(self, name, st, gain=1.0):
        self.bus(name)[:] += st * gain


def circ_delay_pingpong(x, d_samps, fb=0.4, taps=5, wet=0.35):
    """Stereo ping-pong delay (circular)."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    out = np.zeros((len(m), 2))
    for k in range(1, taps + 1):
        tap = np.roll(m, k * d_samps) * (fb ** (k - 1))
        ch = (k - 1) % 2
        out[:, ch] += tap
    return (x if x.ndim == 2 else np.stack([m, m], 1)) + out * wet


def duck_env(n, hits, depth_db=4.0, release=0.18):
    """Sidechain-style ducking envelope from hit sample positions (circular)."""
    env = np.ones(n)
    L = ns(release * 2.5)
    shape = 1 - (1 - D.db(-depth_db)) * np.exp(-tvec(L) / release)
    shape[:ns(0.004)] = np.linspace(1, shape[ns(0.004)], ns(0.004))
    for h in hits:
        idx = (np.arange(L) + h) % n
        env[idx] = np.minimum(env[idx], shape)
    return env


def master(mix_st, target_lufs=-14.0, name=""):
    x = D.highpass(mix_st, 28, 2, circular=True)
    # gentle glue compression on tiled copies (keeps periodicity)
    n = len(x)
    tiled = np.concatenate([x, x, x], axis=0)
    tiled = D.compress(tiled, thresh_db=-16, ratio=2.0, attack=0.01, release=0.15)
    x = tiled[n:2 * n]
    x = D.normalize(x, -6)
    for _ in range(8):
        l = D.lufs(x)
        g = target_lufs - l
        if abs(g) < 0.1:
            break
        x = x * D.db(g)
        if np.max(np.abs(x)) > D.db(-1.6):
            x = D.limiter_circular(x, -1.6, lookahead=0.004, release=0.12)
    x = x - x.mean(axis=0, keepdims=True)
    return x


# ============================================================ instruments
_cache = {}


def add_saw_note(f, n, k_max=40, base_decay=2.0, bright_decay=18.0, odd=0.0, attack=0.002, release=0.02,
                 detune_c=0.0, phase=0.0):
    """Band-limited additive saw/square with per-harmonic decay (built-in 'filter envelope')."""
    t = tvec(n)
    K = int(min(k_max, (SR * 0.45) / f))
    k = np.arange(1, K + 1)[:, None]
    amp = (1.0 / k) * np.where((k % 2 == 0), 1.0 - odd, 1.0)
    dec = base_decay + bright_decay * (k - 1) / max(1, K)
    ff = f * 2 ** (detune_c / 1200)
    y = (amp * np.exp(-dec * t[None, :]) * np.sin(2 * PI * ff * k * t[None, :] + phase * k)).sum(axis=0)
    env = np.clip(t / attack, 0, 1) * np.clip((n / SR - t) / release, 0, 1)
    return y * env


def kick(vel=1.0, seed=0):
    key = ("kick", round(vel, 2), seed)
    if key in _cache:
        return _cache[key]
    d = 0.42
    n = ns(d)
    t = tvec(n)
    r = np.random.default_rng(seed)
    f = 46 + 130 * np.exp(-t / 0.028)
    y = D.sine(f) * np.exp(-t / 0.22)
    click = S.unit(D.highpass(r.standard_normal(n), 2500)) * np.exp(-t / 0.0025) * 0.35
    y = D.drive((y + click) * 1.6, 1.5) * vel
    _cache[key] = y
    return y


def snare(vel=1.0, seed=1, tail=0.14):
    key = ("snare", round(vel, 2), seed, tail)
    if key in _cache:
        return _cache[key]
    d = 0.45
    n = ns(d)
    t = tvec(n)
    r = np.random.default_rng(seed)
    tone = D.sine(D.glide(240, 175, n)) * np.exp(-t / 0.05)
    nz = S.unit(D.filt(r.standard_normal(n), D.H_mul(D.H_hp(1200, 2), D.H_lp(9000, 2)))) * np.exp(-t / tail)
    clap = np.zeros(n)
    for off in (0.0, 0.009, 0.019):
        L = ns(0.012)
        D.place(clap, r.standard_normal(L) * np.exp(-np.arange(L) / (L * 0.3)), ns(off))
    clap = D.bandpass(clap, 1600, 1.2)
    y = (tone * 0.6 + nz * 0.7 + S.unit(clap) * 0.4) * vel
    y = D.drive(y * 1.3, 1.3)
    _cache[key] = y
    return y


def hat(open_=False, vel=1.0, seed=2):
    key = ("hat", open_, round(vel, 2), seed)
    if key in _cache:
        return _cache[key]
    d = 0.3 if open_ else 0.08
    n = ns(d)
    t = tvec(n)
    r = np.random.default_rng(seed)
    nz = D.highpass(r.standard_normal(n), 7000, 3)
    metal = sum(D.sine(f, n, r.random()) for f in (6120, 7350, 8810, 10120)) * 0.15
    y = (S.unit(nz) + metal) * np.exp(-t / (0.12 if open_ else 0.018)) * vel
    _cache[key] = y
    return y


def crash(seed=3):
    d = 2.2
    n = ns(d)
    t = tvec(n)
    r = np.random.default_rng(seed)
    nz = S.unit(D.highpass(r.standard_normal(n), 3500, 2)) * np.exp(-t / 0.7)
    m = S.metal(450, d, r, ratios=(1, 1.83, 2.74, 3.6, 4.9, 6.3, 8.1), decay=0.8, tilt=0.2) * 0.2
    return (nz + m) * np.clip(t / 0.002, 0, 1)


def riser(d, seed=4):
    n = ns(d)
    t = tvec(n)
    r = np.random.default_rng(seed)
    nz = S.bp_sweep(r.standard_normal(n), 300, 8000, 1.5, d)
    tone = D.saw(D.glide(110, 880, n)) * 0.3
    tone = D.lowpass(tone, 3000)
    return (S.unit(nz) * 0.7 + S.unit(tone) * 0.3) * (t / d) ** 2


# ================================================================= GOJO
def battle_gojo():
    bpm = 140
    beat = ns(60 / bpm)          # 18900 samples
    s16 = beat // 4
    bar = beat * 4
    bars = 44
    n = bar * bars
    r = np.random.default_rng(7)
    mx = Mix(n)
    prog = [(38, "m"), (34, "M"), (41, "M"), (36, "M"), (38, "m"), (34, "M"), (31, "m"), (33, "M")]  # Dm Bb F C Dm Bb Gm A

    def chord(root, q):
        return [root, root + (3 if q == "m" else 4), root + 7]

    # section map: (start_bar, end_bar, name)
    def sect(b):
        if b < 8:
            return "A"
        if b < 16:
            return "B"
        if b < 24:
            return "C"
        if b < 32:
            return "D"
        if b < 40:
            return "E"
        return "T"

    kicks = []
    melody = [
        [(0, 1.5, 81), (1.5, 0.5, 79), (2, 1, 77), (3, 1, 74)],
        [(0, 1.5, 82), (1.5, 0.5, 81), (2, 2, 77)],
        [(0, 1, 84), (1, 0.5, 82), (1.5, 0.5, 81), (2, 1, 79), (3, 1, 81)],
        [(0, 3, 79), (3, 0.5, 77), (3.5, 0.5, 79)],
        [(0, 1.5, 81), (1.5, 0.5, 79), (2, 1, 77), (3, 1, 86)],
        [(0, 1.5, 86), (1.5, 0.5, 84), (2, 2, 82)],
        [(0, 1, 82), (1, 1, 81), (2, 1, 79), (3, 1, 82)],
        [(0, 2, 85), (2, 1, 81), (3, 1, 76)],
    ]
    bass_pat = [0, 0, 12, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 0, 12, 10]
    bass_vel = [1.0, 0.6, 0.85, 0.6, 0.9, 0.7, 0.6, 0.75, 1.0, 0.75, 0.6, 0.7, 0.9, 0.6, 0.8, 0.7]
    for b in range(bars):
        sc = sect(b)
        root, q = prog[b % 8]
        tones = chord(root, q)
        b0 = b * bar
        # ---------------- drums
        if sc in ("A", "B", "D", "T"):
            for k in range(4):
                if sc == "T" and b >= 42 and k % 2 == 1:
                    continue
                mx.add("drums", kick(1.0 if k == 0 else 0.92), b0 + k * beat, 0.9)
                kicks.append(b0 + k * beat)
        if sc == "E":
            for st in (0, 6, 10):
                mx.add("drums", kick(1.0), b0 + st * s16, 0.9)
                kicks.append(b0 + st * s16)
        if sc in ("A", "B", "D", "E"):
            for k in (1, 3):
                mx.add("drums", snare(1.0), b0 + k * beat, 0.55 if sc != "E" else 0.6, 0.05)
        if sc in ("A", "B", "D", "E", "C"):
            for st in range(16):
                if sc == "C" and st % 2 == 0:
                    continue
                v = 0.55 if st % 4 == 2 else (0.3 if st % 2 else 0.22)
                o = (st == 14 and b % 2 == 1)
                mx.add("drums", hat(o, v, seed=st), b0 + st * s16, 0.45, 0.5 if st % 2 else -0.4)
        # fills / rolls
        if b % 8 == 7 and sc in ("A", "B", "D", "E"):
            for st in range(12, 16):
                mx.add("drums", snare(0.5 + 0.12 * (st - 12), seed=10 + st, tail=0.08), b0 + st * s16, 0.4, -0.1)
        if b in (22, 23, 40, 41, 42, 43):
            div = 8 if b in (22, 40, 41) else 16
            step = bar // div
            for i in range(div):
                prog_v = (i / div) * (0.5 if b in (22, 40) else 1.0) + (0.4 if b in (23, 42, 43) else 0.2)
                mx.add("drums", snare(min(1.0, prog_v), seed=40 + i, tail=0.07), b0 + i * step, 0.42, 0.0)
        if b in (0, 8, 24, 32):
            mx.add("fx", crash(), b0, 0.35, -0.3)
        if b == 40:
            mx.add("fx", riser(4 * 60 / bpm * 4), b0, 0.25, 0.0)
        # ---------------- bass ostinato
        bass_gain = 0.55 if sc != "C" else 0.32
        for st in range(16):
            if sc == "C" and st % 4 != 0:
                continue
            m = root + bass_pat[st] - 12 * (0 if root < 36 else 1)
            f = midi(m)
            vel = bass_vel[st]
            note = add_saw_note(f, s16 - 60, k_max=36, base_decay=6, bright_decay=40 * (1.2 - vel * 0.4),
                                odd=0.35, release=0.012)
            sub = D.sine(f, s16 - 60) * np.clip(tvec(s16 - 60) / 0.003, 0, 1) * np.clip((s16 - 60 - np.arange(s16 - 60)) / 300, 0, 1)
            mx.add("bass", (note * 0.8 + sub * 0.5) * vel, b0 + st * s16, bass_gain)
        # ---------------- arp (16ths, up/down across two octaves)
        if sc != "T" or b < 42:
            base = tones[0] + 24 if tones[0] + 24 < 64 else tones[0] + 12
            pool = [base, base + (tones[1] - tones[0]), base + 7, base + 12, base + 12 + (tones[1] - tones[0]),
                    base + 19, base + 24, base + 19]
            pool = pool + pool[::-1][1:-1]
            for st in range(16):
                m = pool[st % len(pool)]
                f = midi(m)
                v = 0.8 if st % 4 == 0 else 0.55
                nl = s16 * 2
                a1 = add_saw_note(f, nl, k_max=24, base_decay=9, bright_decay=55, odd=0.6, detune_c=-6, release=0.01)
                a2 = add_saw_note(f, nl, k_max=24, base_decay=9, bright_decay=55, odd=0.6, detune_c=6, release=0.01)
                g = 0.2 if sc in ("A", "C", "E") else 0.17
                if sc == "C":
                    g = 0.22
                mx.add("arpL", a1 * v, b0 + st * s16, g, -0.6)
                mx.add("arpR", a2 * v, b0 + st * s16, g, 0.6)
        # ---------------- lead melody (sections B, D)
        if sc in ("B", "D"):
            for (bt, dur, m) in melody[b % 8]:
                L = int(dur * beat) - 200
                f = midi(m)
                vib = 1 + 0.004 * np.sin(2 * PI * 5.5 * tvec(L)) * np.clip(tvec(L) / 0.25, 0, 1)
                lead = D.saw(f * vib, L) * 0.6 + D.pulse(f * 2 ** (7 / 1200) * vib, L, 0.45) * 0.4
                lead = D.lowpass(lead, 4200 if sc == "D" else 3000)
                env = np.clip(tvec(L) / 0.01, 0, 1) * np.clip((L - np.arange(L)) / 900, 0, 1) * \
                    (0.8 + 0.2 * np.exp(-tvec(L) / 0.15))
                mx.add("lead", lead * env, b0 + int(bt * beat), 0.24 if sc == "B" else 0.3, 0.1)
                if sc == "D":
                    lead_hi = D.sine(2 * f * vib, L) * env * 0.25
                    mx.add("lead", lead_hi, b0 + int(bt * beat), 0.3, -0.2)
        # ---------------- pad + choir swells
        pad_notes = [midi(m) for m in (tones[0], tones[0] + 7, tones[0] + 12, tones[1] + 12, tones[2] + 12)]
        for side in (-0.8, 0.8):          # independent L/R stacks => wide pad
            pv = S.voice_stack(pad_notes, bar + ns(0.6), r, voices=2, vib=0.003, detune_c=12, breath=0.0)
            pv = D.lowpass(pv, 1800 if sc != "C" else 1200)
            pe = np.clip(tvec(len(pv)) / 0.25, 0, 1) * np.clip((len(pv) - np.arange(len(pv))) / ns(0.6), 0, 1)
            mx.add("pad", pv * pe, b0, (0.22 if sc != "C" else 0.3) * 0.75, side)
        if sc in ("B", "C", "D", "E", "T"):
            ch_notes = [midi(m) for m in (tones[0] + 12, tones[2] + 12, tones[0] + 24, tones[1] + 24)]
            for side in (-0.7, 0.7):
                cv = S.voice_stack(ch_notes, bar + ns(0.8), r, voices=3, vib=0.006, detune_c=14, breath=0.03)
                ce = (np.clip(tvec(len(cv)) / (bar / SR * 0.7), 0, 1) ** 1.5) * \
                    np.clip((len(cv) - np.arange(len(cv))) / ns(0.8), 0, 1)
                mx.add("choir", cv * ce, b0, (0.3 if sc in ("C", "D") else 0.22) * 0.75, side)
        # ---------------- orchestral stabs in E
        if sc == "E":
            for st in (0, 6, 10):
                stab_notes = [midi(m) for m in (tones[0] - 12, tones[0], tones[2], tones[0] + 12, tones[1] + 12)]
                L = ns(0.35)
                for side, dc in ((-0.5, -7), (0.5, 7)):
                    stab = sum(add_saw_note(f, L, k_max=30, base_decay=4, bright_decay=22, release=0.05, detune_c=dc)
                               for f in stab_notes)
                    mx.add("stabs", stab, b0 + st * s16, 0.12, side)
    # ---------------- processing per bus
    choir = D.filt(mx.bus("choir"), S.formant_H("a", 1.0), circular=True)
    mx.buses["choir"] = choir
    duck = duck_env(n, kicks, 5.0, 0.16)[:, None]
    mx.buses["bass"] *= duck
    mx.buses["pad"] *= duck
    arps = mx.bus("arpL") + mx.bus("arpR")
    arps = circ_delay_pingpong(arps, int(beat * 0.75), fb=0.45, taps=4, wet=0.4)
    lead = circ_delay_pingpong(mx.bus("lead"), beat // 2 * 3, fb=0.35, taps=3, wet=0.3)
    drums = mx.bus("drums")
    wet_send = arps * 0.3 + lead * 0.5 + mx.bus("pad") * 0.5 + choir * 0.7 + drums * 0.08 + mx.bus("fx") * 0.4 \
        + mx.bus("stabs") * 0.5
    ir = D.reverb_ir(2.2, predelay=0.02, bright=0.6, rng=np.random.default_rng(11), stereo=True)
    verb = D.convolve(wet_send, ir, circular=True)
    mixed = drums * 1.0 + mx.bus("bass") * 1.0 + arps * 0.9 + lead * 1.0 + mx.bus("pad") * 0.8 + choir * 0.9 \
        + mx.bus("fx") * 0.7 + mx.bus("stabs") * 1.0 + verb * 0.36
    return master(mixed, -14.0, "battle_gojo")


# ================================================================= SUKUNA
def shime(vel=1.0, seed=5):
    key = ("shime", round(vel, 2), seed)
    if key in _cache:
        return _cache[key]
    d = 0.25
    n = ns(d)
    t = tvec(n)
    r = np.random.default_rng(seed)
    y = D.sine(D.glide(420, 330, n)) * np.exp(-t / 0.06) + 0.5 * D.sine(660, n) * np.exp(-t / 0.03)
    y += S.unit(D.bandpass(r.standard_normal(n), 2500, 1.0)) * np.exp(-t / 0.008) * 0.6
    y = y * vel
    _cache[key] = y
    return y


def kachi(vel=1.0, seed=6):
    d = 0.08
    n = ns(d)
    t = tvec(n)
    r = np.random.default_rng(seed)
    y = S.unit(D.bandpass(r.standard_normal(n), 3200, 3.0)) * np.exp(-t / 0.01)
    y += D.sine(1900, n) * np.exp(-t / 0.015) * 0.5
    return y * vel


def shamisen(f, dur, seed=0, vel=1.0):
    r = np.random.default_rng(seed)
    y = D.karplus(f, dur, decay=0.9965, rng=r, bright=0.95, pick=0.06)
    n = len(y)
    t = tvec(n)
    click = S.unit(D.highpass(r.standard_normal(n), 2500)) * np.exp(-t / 0.003) * 0.35
    y = y + click
    y = D.drive(y * 1.6, 1.4)              # sawari-like buzz
    y = D.filt(y, D.H_mul(D.H_peak(2800, 1.5, 4), D.H_hp(150, 2)))
    env = np.clip((dur - t) / 0.03, 0, 1)
    return y * env * vel


def battle_sukuna():
    bpm = 120
    beat = ns(60 / bpm)        # 22050
    s16 = beat // 4
    bar = beat * 4
    bars = 38
    n = bar * bars
    r = np.random.default_rng(17)
    mx = Mix(n)
    # E "in" scale melody (E F A B C), 4-bar phrase + variation
    phr = [
        [(0, .5, 76), (.5, .5, 76), (1, .5, 77), (1.5, .5, 76), (2, 1, 72), (3, .5, 71), (3.5, .5, 69)],
        [(0, 1.5, 71), (1.5, .5, 72), (2, .5, 71), (2.5, .5, 69), (3, 1, 65)],
        [(0, .5, 64), (.5, .5, 65), (1, .5, 69), (1.5, .5, 71), (2, .5, 72), (2.5, .5, 76), (3, 1, 77)],
        [(0, 1.5, 76), (1.5, .25, 77), (1.75, .25, 76), (2, .5, 72), (2.5, .5, 71), (3, .5, 69), (3.5, .5, 71)],
    ]
    phr2 = [
        [(0, .5, 81), (.5, .5, 81), (1, .5, 83), (1.5, .5, 81), (2, 1, 77), (3, .5, 76), (3.5, .5, 77)],
        [(0, 1, 76), (1, .5, 72), (1.5, .5, 71), (2, 1, 69), (3, .5, 71), (3.5, .5, 72)],
        [(0, .25, 76), (.25, .25, 77), (.5, .5, 76), (1, .5, 72), (1.5, .5, 71), (2, 2, 64)],
        [(0, .5, 65), (.5, .5, 64), (1, .5, 65), (1.5, .5, 69), (2, 1, 71), (3, 1, 76)],
    ]
    stabs = [[40, 47, 52, 53], [41, 48, 53, 56], [38, 45, 50, 51], [40, 46, 52, 53]]   # E(b2) Fm D(b2) E(tritone)

    def sect(b):
        if b < 8:
            return "I"
        if b < 16:
            return "G"
        if b < 24:
            return "X"
        if b < 32:
            return "B"
        return "C"

    hits = []
    for b in range(bars):
        sc = sect(b)
        b0 = b * bar
        # ------------- taiko ensemble
        if sc == "I":
            for st, v in ((0, 1.0), (10, 0.7)) if b % 2 == 0 else ((0, 0.9),):
                mx.add("taiko", S.taiko(52, 1.2, r, 1.0), b0 + st * s16, 0.8 * v, -0.1)
                hits.append(b0 + st * s16)
            if b in (6, 7):
                for st in range(0, 16, 2 if b == 6 else 1):
                    mx.add("taiko", shime(0.4 + st / 30, seed=st), b0 + st * s16, 0.35, 0.3)
        if sc in ("G", "X", "C"):
            for st, v in ((0, 1.0), (10, 0.85)) + (((6, 0.6),) if sc != "G" else ()):
                mx.add("taiko", S.taiko(50, 1.2, r, 1.0), b0 + st * s16, 0.85 * v, -0.15)
                hits.append(b0 + st * s16)
            mid = [(0, 1.0), (4, .8), (6, .55), (7, .6), (8, .9), (12, .8), (14, .55), (15, .6)]
            for st, v in mid:
                mx.add("taiko", S.taiko(98, 0.6, r, 0.8), b0 + st * s16, 0.38 * v, 0.25)
            if sc in ("X", "C"):
                for st in range(16):
                    if st % 4 == 0:
                        continue
                    mx.add("taiko", shime(0.45 if st % 2 else 0.3, seed=st), b0 + st * s16, 0.3, 0.45)
            for st in (2, 6, 10, 14):
                mx.add("taiko", kachi(0.6, seed=st), b0 + st * s16, 0.22, -0.5)
        if sc == "B":
            for st, v in ((0, 1.0), (3, 0.5)):          # heartbeat
                mx.add("taiko", S.taiko(46, 1.0, r, 0.6), b0 + st * s16, 0.75 * v, 0.0)
                hits.append(b0 + st * s16)
        if sc == "C" and b % 2 == 1:
            for st in range(8, 16):                        # don-doko rolls
                mx.add("taiko", S.taiko(90, 0.5, r, 0.9), b0 + st * s16, 0.3 + 0.03 * (st - 8), 0.1)
        if b == 37:
            for st in range(0, 16):
                mx.add("taiko", S.taiko(60 + (st % 3) * 15, 0.6, r, 1.0), b0 + st * s16, 0.35 + st * 0.02,
                       (-0.3 if st % 2 else 0.3))
        # ------------- drones (rendered once below), brass stabs
        if sc in ("G", "X", "C") and b % 2 == 0:
            ch = stabs[(b // 2) % 4]
            L = ns(1.1)
            st_sig = sum(add_saw_note(midi(m), L, k_max=40, base_decay=1.5, bright_decay=10, release=0.25)
                         for m in ch)
            mx.add("brass", st_sig, b0, 0.18)
            if sc != "G":
                mx.add("brass", st_sig * 0.7, b0 + 10 * s16, 0.14)
        if sc == "I" and b % 4 == 0:
            ch = stabs[(b // 4) % 4]
            L = ns(3.5)
            sw = sum(add_saw_note(midi(m), L, k_max=30, base_decay=0.6, bright_decay=4, attack=0.6, release=1.0)
                     for m in ch)
            mx.add("brass", sw, b0, 0.13)
        # ------------- shamisen lead
        play = (sc in ("I",) and b >= 4) or sc in ("G", "X", "B", "C")
        if play:
            src = phr if sc in ("I", "G", "B") else phr2
            for (bt, dur, m) in src[b % 4]:
                L = ns(max(0.2, dur * 60 / bpm + 0.25))
                note = shamisen(midi(m), L / SR, seed=b * 16 + int(bt * 4))
                g = 0.3 if sc != "B" else 0.34
                mx.add("lead", note, b0 + int(bt * beat), g, 0.15)
                if sc == "X" and dur >= 1:      # tremolo picking on long notes
                    for k in range(1, int(dur * 4)):
                        tn = shamisen(midi(m), 0.2, seed=999 + k, vel=0.45)
                        mx.add("lead", tn, b0 + int(bt * beat) + k * s16, 0.25, 0.15)
            # octave-down second shamisen answering in C
            if sc == "C":
                for (bt, dur, m) in phr[b % 4]:
                    L = ns(max(0.2, dur * 60 / bpm + 0.2))
                    mx.add("lead2", shamisen(midi(m - 12), L / SR, seed=5000 + b * 16 + int(bt * 4), vel=0.8),
                           b0 + int(bt * beat), 0.24, -0.35)
    # ------------- continuous drones (integer cycles per loop) + low choir
    T = n / SR
    q = lambda f: round(f * T) / T
    t = tvec(n)
    drone = D.saw(q(41.2), n) * 0.6 + D.saw(q(41.2 * 1.003), n) * 0.5 + D.saw(q(61.74), n) * 0.35
    drone = D.lowpass(drone, 260, circular=True) * (0.8 + 0.2 * np.sin(2 * PI * 4 * t / T))
    # section-dependent drone level (smooth, periodic)
    lvl = np.interp(t, [0, 16 * 2, 24 * 2, 32 * 2, T], [0.7, 0.9, 1.0, 0.8, 0.7])
    mx.add_full("drone", np.stack([drone * lvl, np.roll(drone, ns(0.013)) * lvl], 1), 0.32)
    chant = S.voice_stack([q(82.41), q(123.47), q(87.31)], n, r, voices=3, vib=0.004, detune_c=10, breath=0.02,
                          period=T)
    chant = D.tv_filter(chant, S.formant_morph_H("o", "u", T, circular_period=T / 4), circular=True)
    cl = np.interp(t, [0, 16 * 2, 24 * 2, 32 * 2, T], [0.2, 0.6, 1.0, 0.5, 0.2])
    mx.add_full("drone", np.stack([chant * cl, np.roll(chant, ns(0.02)) * cl], 1), 0.2)
    duck = duck_env(n, hits, 3.0, 0.25)[:, None]
    taiko = mx.bus("taiko")
    lead = mx.bus("lead") + mx.bus("lead2")
    lead = circ_delay_pingpong(lead, beat * 3 // 4, fb=0.3, taps=3, wet=0.25)
    brass = mx.bus("brass")
    drone_b = mx.bus("drone") * duck
    send = taiko * 0.25 + lead * 0.35 + brass * 0.5 + drone_b * 0.3
    ir = D.reverb_ir(2.8, predelay=0.03, bright=0.4, rng=np.random.default_rng(21), stereo=True)
    verb = D.convolve(send, ir, circular=True)
    mixed = taiko * 1.0 + lead * 1.0 + brass * 1.0 + drone_b * 1.0 + verb * 0.3
    return master(mixed, -14.0, "battle_sukuna")


# ======================================================= UNLIMITED VOID
def unlimited_void():
    T = 45.0
    n = ns(T)
    r = np.random.default_rng(31)
    mx = Mix(n)
    t = tvec(n)
    q = lambda f: round(f * T) / T
    chords = [[38, 45, 50, 54, 57, 64], [35, 42, 47, 50, 54, 61], [31, 38, 43, 47, 54, 61], [33, 40, 45, 47, 52, 61]]
    seg = n // 4
    for i, ch in enumerate(chords):
        L = seg + ns(4.0)
        tl = tvec(L)
        pad = np.zeros(L)
        for j, m in enumerate(ch):
            f = midi(m)
            for v in range(3):
                det = 2 ** (r.uniform(-7, 7) / 1200)
                pad += (D.sine(f * det * (1 + 0.002 * np.sin(2 * PI * r.uniform(0.1, 0.3) * tl)), L, r.random())
                        + 0.35 * D.tri(f * 2 * det, L, r.random())) / (1 + 0.12 * j)
        env = np.clip(tl / 3.5, 0, 1) ** 1.5 * np.clip((L - np.arange(L)) / ns(4.0), 0, 1)
        pad = D.lowpass(pad, 2600) * env
        mx.add("pad", pad, i * seg - ns(2.0), 0.12, (-0.3 if i % 2 else 0.3))
        mx.add("pad", np.roll(pad, ns(0.017)), i * seg - ns(2.0), 0.12, (0.3 if i % 2 else -0.3))
    # slow bells, D major pentatonic
    pent = [74, 76, 78, 81, 83, 86, 88, 90, 93]
    times = np.arange(0.6, T, 2.8)
    for k, tm in enumerate(times):
        m = pent[(k * 3 + (k // 4)) % len(pent)]
        b = S.bell(midi(m), 5.0, r, ratio=3.5, index0=1.6, tau=2.2)
        mx.add("bells", b, ns(tm + r.uniform(-0.15, 0.15)), 0.16, r.uniform(-0.7, 0.7))
        if k % 3 == 1:
            b2 = S.bell(midi(m + 7), 4.0, r, ratio=2.0, index0=1.0, tau=1.6)
            mx.add("bells", b2, ns(tm + 0.7), 0.08, r.uniform(-0.8, 0.8))
    # shimmer twinkles
    for k in range(220):
        f = r.choice([2349.3, 2637.0, 2960.0, 3520.0, 3951.1, 4698.6, 5274.0, 5919.9])
        L = ns(r.uniform(0.4, 1.5))
        p = D.sine(f, L, r.random()) * np.exp(-tvec(L) / (L / SR * 0.3)) * np.clip(tvec(L) / 0.02, 0, 1)
        mx.add("shimmer", p, int(r.uniform(0, n)), r.uniform(0.01, 0.04), r.uniform(-1, 1))
    # cosmic wind + sub
    wind = D.tv_filter(D.colored(n, r, -1.0), lambda f, tt: D.H_bp(1400 * 2 ** (1.3 * np.sin(2 * PI * tt / (T / 3))), 3.0)(f),
                       circular=True)
    wind2 = np.roll(wind, ns(7.3))
    mx.add_full("wind", np.stack([wind, wind2], 1) * 0.02)
    sub = D.sine(q(36.71), n) * (0.75 + 0.25 * np.sin(2 * PI * 3 * t / T))
    mx.add_full("sub", np.stack([sub, sub], 1) * 0.1)
    send = mx.bus("pad") * 0.8 + mx.bus("bells") * 1.0 + mx.bus("shimmer") * 1.0 + mx.bus("wind") * 0.5
    ir = D.reverb_ir(6.0, length=7.5, predelay=0.04, bright=0.8, rng=np.random.default_rng(33), stereo=True)
    verb = D.convolve(send, ir, circular=True)
    mixed = mx.bus("pad") * 0.9 + mx.bus("bells") * 0.8 + mx.bus("shimmer") * 0.8 + mx.bus("wind") + mx.bus("sub") \
        + verb * 0.75
    return master(mixed, -14.0, "unlimited_void")


# ===================================================== MALEVOLENT SHRINE
def malevolent_shrine():
    bpm = 80
    beat = ns(60 / bpm)     # 33075
    bar = beat * 4
    bars = 15
    n = bar * bars
    T = n / SR
    r = np.random.default_rng(41)
    mx = Mix(n)
    t = tvec(n)
    q = lambda f: round(f * T) / T
    hits = []
    for b in range(bars):
        b0 = b * bar
        for bt, f0, v in ((0, 48, 1.0), (1.5, 52, 0.55), (2, 48, 0.9), (3.5, 56, 0.4)):
            mx.add("drums", S.taiko(f0, 1.6, r, 0.9), b0 + int(bt * beat), 0.85 * v, -0.05)
            hits.append(b0 + int(bt * beat))
        if b % 4 == 3:
            for k in range(8):
                mx.add("drums", S.taiko(70, 0.7, r, 1.0), b0 + int((2 + k * 0.25) * beat), 0.25 + 0.05 * k, 0.2)
        # slicing percussion on the off-beats, stronger slash at bar end
        for bt in (0.5, 1.5, 2.5, 3.5):
            s = S.shing(0.3, r, r.uniform(2600, 4200), r.uniform(0.05, 0.1))
            mx.add("slices", s, b0 + int(bt * beat), 0.16 + (0.08 if bt == 3.5 else 0), r.uniform(-0.7, 0.7))
        if b % 2 == 1:
            s = S.shing(0.45, r, 3000, 0.2)
            mx.add("slices", s, b0 + int(3.75 * beat), 0.3, r.uniform(-0.5, 0.5))
        if b % 5 == 2:
            crk = S.crackle(0.4, r, 30, lambda tt: np.exp(-tt / 0.05), 600, 4000, grain=0.004)
            mx.add("slices", crk, b0 + int(1.0 * beat), 0.2, -0.4)
    # chant: low male formant choir, vowel morph o -> a -> u cycling (periodic)
    chant = S.voice_stack([q(65.41), q(98.0), q(69.30)], n, r, voices=4, vib=0.005, detune_c=12, breath=0.03,
                          period=T)
    vowels = ["o", "a", "u", "o"]

    def H(f, tt):
        ph = (tt / (T / 3)) % 1.0 * 3
        i = int(ph)
        u = ph - i
        u = 0.5 - 0.5 * math.cos(PI * u)
        return (1 - u) * S.formant_H(vowels[i], 0.95)(f) + u * S.formant_H(vowels[i + 1], 0.95)(f)
    chant = D.tv_filter(chant, H, circular=True)
    chant2 = np.roll(chant, ns(0.023))
    swell = 0.7 + 0.3 * np.sin(2 * PI * 5 * t / T)
    mx.add_full("chant", np.stack([chant * swell, chant2 * swell], 1), 0.22)
    # dissonant low drones: C1 + F#1 (tritone) + Db2 cluster
    dr = D.saw(q(32.70), n) * 0.6 + D.saw(q(46.25), n) * 0.45 + D.saw(q(69.30) * 1.0, n) * 0.2
    dr = D.lowpass(dr, 220, circular=True) * (0.8 + 0.2 * np.sin(2 * PI * 3 * t / T + 1))
    mx.add_full("drone", np.stack([dr, np.roll(dr, ns(0.011))], 1), 0.3)
    duck = duck_env(n, hits, 3.5, 0.3)[:, None]
    drums = mx.bus("drums")
    slices = mx.bus("slices")
    chant_b = mx.bus("chant") * duck
    drone_b = mx.bus("drone") * duck
    send = drums * 0.3 + slices * 0.6 + chant_b * 0.6 + drone_b * 0.2
    ir = D.reverb_ir(3.6, predelay=0.035, bright=0.35, rng=np.random.default_rng(43), stereo=True)
    verb = D.convolve(send, ir, circular=True)
    mixed = drums * 1.0 + slices * 0.9 + chant_b * 1.0 + drone_b * 1.0 + verb * 0.35
    return master(mixed, -14.0, "malevolent_shrine")


TRACKS = {"battle_gojo": battle_gojo, "battle_sukuna": battle_sukuna, "unlimited_void": unlimited_void,
          "malevolent_shrine": malevolent_shrine}


def main(only=None):
    for name, fn in TRACKS.items():
        if only and name not in only:
            continue
        x = fn()
        path, peak = D.write_ogg_checked(x, OUT / f"{name}.ogg", peak_db=-1.0)
        print(f"{name:20s} {len(x) / SR:6.2f}s  LUFS {D.lufs(x):6.2f}  peak {peak:6.2f} dBFS")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
