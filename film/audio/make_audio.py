"""Procedural soundtrack + sound design for the film (pure numpy/scipy, no samples).

Reads build/events/*.json (footsteps, hits, arrows, thunder ... written while the animation is built)
and writes build/audio/film_audio.wav (48 kHz stereo).  All music is original and generated here.
"""
import glob
import json
import os
import sys

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
from mcfilm import timeline as tl  # noqa: E402

SR = 48000
DUR = tl.total_frames() / tl.FPS
N = int(DUR * SR) + SR
rng = np.random.default_rng(7)

MUSIC = np.zeros((2, N), np.float32)
SFX = np.zeros((2, N), np.float32)
AMB = np.zeros((2, N), np.float32)

T = lambda sid: tl.start_time(sid)


# ====================================================================== dsp helpers
def tvec(d):
    return np.arange(int(d * SR)) / SR


def sos(kind, f, order=2):
    nyq = SR / 2
    if kind == "band":
        return signal.butter(order, [max(10, f[0]) / nyq, min(f[1], nyq * 0.95) / nyq], btype="band", output="sos")
    return signal.butter(order, min(f, nyq * 0.95) / nyq, btype=kind, output="sos")


def lp(x, f, o=2):
    return signal.sosfilt(sos("low", f, o), x)


def hp(x, f, o=2):
    return signal.sosfilt(sos("high", f, o), x)


def bp(x, f0, f1, o=2):
    return signal.sosfilt(sos("band", (f0, f1), o), x)


def noise(d):
    return rng.standard_normal(int(d * SR))


def env(n, a=0.01, d=0.1, s=0.7, r=0.2, total=None):
    n = int(n)
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([np.linspace(0, 1, max(1, a_n)), np.linspace(1, s, max(1, d_n)), np.full(s_n, s),
                        np.linspace(s, 0, max(1, r_n))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def expdec(n, tau):
    return np.exp(-np.arange(int(n)) / SR / tau)


def mixs(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def put(buf, t0, sig, pan=0.0, gain=1.0):
    if isinstance(sig, (list, tuple)):
        sig = mixs(*sig)
    i = int(t0 * SR)
    if i >= buf.shape[1] or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[:buf.shape[1] - i]
    l = np.cos((pan + 1) * np.pi / 4) * gain
    r = np.sin((pan + 1) * np.pi / 4) * gain
    buf[0, i:i + len(sig)] += (sig * l).astype(np.float32)
    buf[1, i:i + len(sig)] += (sig * r).astype(np.float32)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def saw(f, t, harm=None):
    """Band-limited saw by additive synthesis (f may be an array for vibrato)."""
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(f, t.shape)) / SR
    f0 = float(np.max(f))
    nh = harm or max(1, int(min(16000, SR / 2.2) / f0))
    out = np.zeros_like(t)
    for k in range(1, nh + 1):
        out += np.sin(k * ph) / k
    return out * 0.6


def sine(f, t):
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(f, t.shape)) / SR
    return np.sin(ph)


def reverb(x, secs=3.0, seed=1, damp=4000):
    r = np.random.default_rng(seed)
    n = int(secs * SR)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / SR / (secs / 6.0))
    ir = lp(ir, damp)
    ir[:int(0.012 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    return signal.fftconvolve(x, ir)[:len(x)]


# ====================================================================== instruments
def piano(m, dur=2.5, vel=0.6, bright=1.0):
    f = mtof(m)
    t = tvec(dur)
    out = np.zeros_like(t)
    for k in range(1, 9):
        fk = f * k * (1 + 0.0004 * k * k)
        if fk > 18000:
            break
        a = (1.0 / k ** (1.2 / bright)) * np.exp(-t * (1.1 + 0.55 * k) * (m / 60.0))
        out += a * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28))
    att = np.minimum(1, t / 0.004)
    ham = lp(noise(dur), 3000) * np.exp(-t * 60) * 0.05
    rel = np.minimum(1, (dur - t) / 0.3)
    return (out * att + ham) * rel * vel * 0.35


def bell(m, dur=4.0, vel=0.5):
    f = mtof(m)
    t = tvec(dur)
    ratios = [1, 2.76, 5.4, 8.93, 2.0]
    amps = [1, 0.5, 0.25, 0.12, 0.3]
    out = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * (0.8 + r * 0.4)) for r, a in zip(ratios, amps))
    return out * np.minimum(1, t / 0.002) * vel * 0.25


def pad(midis, dur, bright=1800, vel=0.4, attack=2.0, release=2.0, detune=0.12, vib=0.0):
    t = tvec(dur)
    out = np.zeros_like(t)
    for m in midis:
        for d in (-detune, 0, detune):
            f = mtof(m + d) * (1 + vib * 0.003 * np.sin(2 * np.pi * 5.2 * t + rng.uniform(0, 6)))
            out += saw(f, t, harm=min(24, int(bright * 2 / mtof(m)) + 2))
    out = lp(out, bright, 2)
    e = env(len(t), attack, 0.5, 1.0, release)
    return out * e * vel / (len(midis) * 3) * 1.2


def choir(midis, dur, vel=0.4, attack=2.5, release=3.0, vowel="a"):
    t = tvec(dur)
    out = np.zeros_like(t)
    for m in midis:
        for d in (-0.08, 0.0, 0.09):
            f = mtof(m + d) * (1 + 0.004 * np.sin(2 * np.pi * (4.5 + rng.uniform(0, 1)) * t + rng.uniform(0, 6)))
            out += saw(f, t, harm=min(30, int(5000 / mtof(m))))
    forms = {"a": [(700, 1100), (1100, 1400), (2400, 2700)], "o": [(400, 600), (700, 950), (2300, 2600)],
             "u": [(250, 400), (600, 800), (2200, 2500)]}[vowel]
    y = sum(bp(out, a, b, 2) * g for (a, b), g in zip(forms, (1.0, 0.6, 0.25)))
    e = env(len(t), attack, 0.5, 1.0, release)
    return y * e * vel / (len(midis) * 3) * 2.5


def strings(m, dur, vel=0.4, attack=0.6, release=1.2, bright=2600):
    t = tvec(dur)
    f = mtof(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.8))
    y = saw(f, t, harm=min(40, int(bright * 2 / mtof(m))))
    y = lp(y, bright)
    return y * env(len(t), attack, 0.3, 0.9, release) * vel * 0.5


def pluck(m, dur=0.5, vel=0.5, cutoff=1800):
    t = tvec(dur)
    y = saw(mtof(m), t, harm=12) * np.exp(-t * 7)
    return lp(y, cutoff) * vel * 0.6


def taiko(vel=1.0, pitch=70, dur=0.9):
    t = tvec(dur)
    f = pitch * (1 + 1.2 * np.exp(-t * 30))
    body = sine(f, t) * np.exp(-t * 5.5)
    skin = lp(noise(dur), 900) * np.exp(-t * 28) * 0.5
    return (body + skin) * vel * 0.8


def sub_drone(m, dur, vel=0.3, attack=3, release=3):
    t = tvec(dur)
    f = mtof(m)
    y = sine(f, t) + 0.35 * sine(f * 2.003, t) + 0.15 * sine(f * 3.01, t)
    return y * env(len(t), attack, 0.5, 1, release) * vel


def heartbeat(vel=0.6):
    a = taiko(vel * 0.8, 50, 0.4)
    b = taiko(vel * 0.5, 46, 0.4)
    out = np.zeros(int(0.7 * SR))
    out[:len(a)] += a
    i = int(0.22 * SR)
    out[i:i + len(b)] += b[:len(out) - i]
    return lp(out, 300)


# ====================================================================== MUSIC
CH = {  # chord tones (midi)
    "Dmaj9": [50, 57, 61, 64, 66], "Bm7": [47, 54, 57, 62, 66], "Gmaj7": [43, 50, 54, 59, 62],
    "A6sus": [45, 52, 54, 59, 64], "G": [43, 50, 55, 59, 62], "D/F#": [42, 50, 57, 62, 66],
    "Em7": [40, 47, 55, 59, 62], "Cadd9": [36, 48, 55, 62, 64], "D": [38, 50, 57, 62, 66],
    "Gm": [43, 50, 55, 58, 62], "Eb": [39, 51, 55, 58, 63], "Dm": [38, 50, 53, 57, 62], "Bb": [34, 46, 53, 58, 62],
    "Bm": [35, 47, 54, 59, 62], "A": [33, 45, 52, 57, 61], "F#m": [42, 49, 54, 57, 61],
}
PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81]


def melody_walk(seed, n, scale, start=3):
    r = np.random.default_rng(seed)
    i = start
    out = []
    for _ in range(n):
        i = int(np.clip(i + r.choice([-2, -1, -1, 0, 1, 1, 2]), 0, len(scale) - 1))
        out.append(scale[i])
    return out


def compose():
    # ---------------------------------------------------------------- 1. Dawn (0-35)
    prog = ["Dmaj9", "Bm7", "Gmaj7", "A6sus"]
    t = 0.5
    k = 0
    while t < 35:
        c = CH[prog[k % 4]]
        put(MUSIC, t, pad(c, 5.6, bright=1400, vel=0.33, attack=2.2, release=2.5), pan=0.0)
        put(MUSIC, t, sub_drone(c[0] - 12, 5.6, vel=0.12, attack=2, release=2))
        t += 4.5
        k += 1
    mel = melody_walk(3, 40, PENTA, 3)
    times = [4.0, 5.6, 6.4, 9.0, 10.2, 11.0, 12.8, 14.6, 15.4, 17.5, 19.0, 20.2, 21.0, 22.6, 24.2, 25.0, 26.8,
             28.0, 29.6, 30.4, 32.0, 33.3]
    for i, tt in enumerate(times):
        put(MUSIC, tt, piano(mel[i], 3.2, vel=0.5 if i % 3 else 0.62), pan=0.15 * np.sin(i))
    # spawn pop shimmer
    pop = T("A2") + 1.62
    for j, m in enumerate([74, 78, 81, 86, 90]):
        put(MUSIC, pop + j * 0.06, bell(m, 4.0, 0.35), pan=-0.4 + 0.2 * j)
    # crane reveal swell
    put(MUSIC, T("A5"), choir([62, 66, 69, 74], 9.0, vel=0.35, attack=4.0, release=3.0), pan=0)

    # ---------------------------------------------------------------- 2. Journey (35-75)
    t0 = T("B1")
    beat = 60 / 84.0
    prog2 = ["G", "D/F#", "Em7", "Cadd9", "G", "D", "Cadd9", "D"]
    t = t0
    k = 0
    tl_end = T("B7")
    while t < tl_end - 0.1:
        c = CH[prog2[k % len(prog2)]]
        bar = beat * 4
        put(MUSIC, t, pad(c, bar + 1.5, bright=2000, vel=0.26, attack=0.8, release=1.5))
        put(MUSIC, t, strings(c[0], bar + 0.5, vel=0.22, attack=0.4))
        arp = [c[1] + 12, c[2] + 12, c[3] + 12, c[4] + 12, c[3] + 12, c[2] + 12, c[3] + 12, c[4] + 12]
        for j, m in enumerate(arp):
            put(MUSIC, t + j * beat / 2, piano(m, 1.6, vel=0.32 + 0.06 * (j % 4 == 0)), pan=0.3 * np.sin(j))
        if T("B2") <= t < T("B6"):
            for j in range(8):
                sh = hp(noise(0.06), 6000) * np.exp(-tvec(0.06) * 60) * (0.07 if j % 2 else 0.12)
                put(MUSIC, t + j * beat / 2, sh, pan=0.4)
            put(MUSIC, t, taiko(0.25, 90, 0.6), pan=0)
            put(MUSIC, t + 2 * beat, taiko(0.18, 90, 0.6), pan=0)
        t += bar
        k += 1
    # sword chime
    put(MUSIC, T("B5") + 3.0, bell(81, 3.0, 0.45), pan=0.2)
    put(MUSIC, T("B5") + 3.08, bell(88, 3.0, 0.3), pan=0.3)
    # time-lapse swell
    put(MUSIC, T("B6"), strings(62, 7.5, vel=0.25, attack=3) + strings(69, 7.5, vel=0.2, attack=3.5), pan=-0.1)
    # dusk turns dark
    put(MUSIC, T("B7"), pad(CH["Gm"], 4.0, bright=1100, vel=0.3, attack=0.6, release=2.0))
    put(MUSIC, T("B8"), pad(CH["Eb"], 4.0, bright=800, vel=0.3, attack=0.5, release=3.0))
    put(MUSIC, T("B8"), sub_drone(26, 8.0, vel=0.25, attack=1.5, release=4))

    # ---------------------------------------------------------------- 3. Perils (75-120)
    tn = T("C1")
    put(MUSIC, tn, sub_drone(26, T("C3") - tn + 1, vel=0.25, attack=2, release=1))
    for k in range(int(T("C3") - tn)):
        put(MUSIC, tn + k * 1.0 + 0.5, heartbeat(0.35 + 0.05 * k), pan=0)
    cl = pad([74, 75, 80], T("C3") - tn, bright=5000, vel=0.08, attack=3, release=0.5, detune=0.3, vib=2)
    put(MUSIC, tn, cl, pan=0.3)
    put(MUSIC, T("C2") + 1.8, strings(38, 1.6, vel=0.5, attack=0.02, release=0.8, bright=1500) +
        strings(39, 1.6, vel=0.4, attack=0.02, release=0.8, bright=1500))
    # chase: drums + ostinato
    tc = T("C3")
    te = T("C8")
    bpm = 140
    b = 60 / bpm
    ost = [38, 38, 41, 38, 40, 38, 36, 38]
    i = 0
    t = tc
    while t < te - 0.05:
        pat = i % 16
        if pat in (0, 3, 6, 8, 10, 11, 14):
            put(MUSIC, t, taiko(0.75 if pat in (0, 8) else 0.45, 62 if pat in (0, 8) else 78), pan=-0.1 if pat % 2 else 0.1)
        put(MUSIC, t, pluck(ost[i % 8] + 12, 0.25, 0.32, cutoff=1400), pan=-0.2)
        put(MUSIC, t, pluck(ost[i % 8], 0.25, 0.32, cutoff=900), pan=0.2)
        if i % 8 == 0:
            ch_ = [CH["Dm"], CH["Bb"], CH["Gm"], CH["A"]][(i // 8) % 4]
            put(MUSIC, t, strings(ch_[2] + 12, b * 8, vel=0.18, attack=0.1) + strings(ch_[3] + 12, b * 8, vel=0.14, attack=0.1))
        t += b / 2 if pat % 2 else b / 2
        i += 1
    # cave
    tv = T("C8")
    put(MUSIC, tv, sub_drone(33, T("C10") - tv + 2, vel=0.22, attack=1.0, release=2))
    put(MUSIC, tv, pad([57, 64, 65], T("C10") - tv, bright=900, vel=0.15, attack=2, release=2, detune=0.2))
    for j, tt in enumerate(np.arange(tv + 1.0, T("C9"), 1.7)):
        put(MUSIC, tt, bell([69, 72, 76, 74, 81][j % 5], 3.0, 0.15), pan=np.sin(j) * 0.6)
    tdm = T("C9") + 3.0
    for j, m in enumerate([74, 78, 81, 85, 86]):
        put(MUSIC, tdm + j * 0.12, bell(m, 4.0, 0.3), pan=-0.5 + 0.25 * j)
    put(MUSIC, tdm, choir([62, 69, 74, 78], 4.0, vel=0.22, attack=0.8, release=2))
    tr = T("C10")
    for j in range(24):
        tt = tr + j * (0.28 - j * 0.006)
        if tt > tr + 4.6:
            break
        put(MUSIC, tt, pluck(38, 0.2, 0.35 + j * 0.02, cutoff=700), pan=0)
    put(MUSIC, tr + 1.75, taiko(1.0, 55, 1.5), pan=0)
    put(MUSIC, tr + 1.75, strings(50, 1.5, 0.45, attack=0.01) + strings(51, 1.5, 0.35, attack=0.01))

    # ---------------------------------------------------------------- 4. Long journey (120-160)
    tj = T("D1")
    put(MUSIC, tj, choir([50, 57, 62, 66, 69], 7.0, vel=0.35, attack=1.5, release=4))
    put(MUSIC, tj, strings(74, 6.0, 0.22, attack=2.0) + strings(78, 6.0, 0.18, attack=2.5))
    beat = 60 / 70.0
    prog4 = ["Bm", "G", "D", "A"]
    t = tj + 5.0
    k = 0
    theme = [71, 73, 74, 78, 76, 74, 73, 69, 71, 74, 76, 73, 74, 71, 69, 66]
    tend = T("D10") + 5.0
    while t < tend:
        c = CH[prog4[k % 4]]
        bar = beat * 4
        prog_u = (t - tj) / (tend - tj)
        thin = 1.0 if t < T("D8") else 0.45
        put(MUSIC, t, pad(c, bar + 1.0, bright=1600 + 1200 * prog_u * thin, vel=0.22 * thin, attack=0.8, release=1.2))
        put(MUSIC, t, strings(c[0], bar + 0.4, vel=0.26 * thin, attack=0.3))
        put(MUSIC, t, sub_drone(c[0] - 12, bar, vel=0.14 * thin, attack=0.3, release=0.6))
        if t < T("D8"):
            for j in range(4):
                put(MUSIC, t + j * beat, taiko(0.42 if j % 2 == 0 else 0.25, 66), pan=0)
            m1, m2 = theme[(2 * k) % len(theme)], theme[(2 * k + 1) % len(theme)]
            put(MUSIC, t, strings(m1, beat * 2.1, 0.3, attack=0.25, bright=3000), pan=0.1)
            put(MUSIC, t + beat * 2, strings(m2, beat * 2.1, 0.3, attack=0.25, bright=3000), pan=0.1)
            if prog_u > 0.3:
                put(MUSIC, t, choir([c[2] + 12, c[3] + 12], bar + 0.5, vel=0.16, attack=1.0, release=1.0, vowel="o"))
        else:
            put(MUSIC, t + beat * 2, piano(theme[k % len(theme)] - 12, 3.0, 0.3), pan=0)
        t += bar
        k += 1
    # first distortions (detuned, wobbling)
    td = T("D10")
    t_ = tvec(6.0)
    wob = sine(mtof(62) * (1 + 0.02 * np.sin(2 * np.pi * 0.7 * t_)), t_) * env(len(t_), 2, 0.5, 1, 2) * 0.12
    put(MUSIC, td, wob, pan=-0.5)

    # ---------------------------------------------------------------- 5. Breaking (160-200)
    tb = T("E1")
    te5 = T("F1")
    put(MUSIC, tb, sub_drone(26, te5 - tb, vel=0.22, attack=3, release=1))
    for k, tt in enumerate(np.arange(tb, te5 - 2, 6.0)):
        c1 = [50, 57, 63, 68] if k % 2 == 0 else [49, 56, 62, 67]
        p1 = pad(c1, 7.5, bright=1200 + 150 * k, vel=0.2, attack=2.5, release=2.5, detune=0.35)
        rev = pad([c1[2] + 12], 3.0, bright=3000, vel=0.25, attack=2.9, release=0.05)
        put(MUSIC, tt, p1, pan=0.2 * np.sin(k))
        put(MUSIC, tt + 3.0, rev, pan=-0.4)
    # glitch stutters
    for j in range(14):
        tt = tb + 2 + j * 2.3 + rng.uniform(0, 0.8)
        g = bell(rng.choice([86, 87, 93]), 0.12, 0.3)
        seq = np.concatenate([g[:int(0.03 * SR)]] * int(rng.integers(3, 8)))
        put(MUSIC, tt, seq, pan=rng.uniform(-0.8, 0.8))
    # build to the wall
    tw = T("E3")
    t_ = tvec(te5 - tw)
    riser = saw(mtof(38) * (1 + 0.5 * (t_ / t_[-1]) ** 2), t_, harm=20)
    riser = lp(riser, 600) * (t_ / t_[-1]) ** 2 * 0.16
    put(MUSIC, tw, riser)
    trv = T("E5")
    put(MUSIC, trv, choir([38, 45, 50, 57, 62], te5 - trv + 6, vel=0.4, attack=6, release=5, vowel="o"))
    for j in range(int((te5 - trv) / 1.0)):
        put(MUSIC, trv + j * 1.0, taiko(0.2 + 0.05 * j, 48, 1.2), pan=0)

    # ---------------------------------------------------------------- 6. Far Lands (200-260)
    tf = T("F1")
    tsil = T("F6") + 4.0
    lyd = [[38, 50, 57, 64, 68, 73], [40, 52, 59, 64, 68, 71], [35, 47, 54, 61, 66, 68], [38, 50, 57, 62, 69, 76]]
    for k, tt in enumerate(np.arange(tf, tsil - 4, 8.0)):
        c = lyd[k % 4]
        put(MUSIC, tt, choir(c[1:], 11.0, vel=0.32, attack=4, release=5, vowel="a" if k % 2 else "o"), pan=0)
        put(MUSIC, tt, pad(c, 11.0, bright=2200, vel=0.2, attack=4, release=5, detune=0.15))
        put(MUSIC, tt, sub_drone(c[0] - 12, 11.0, vel=0.22, attack=3, release=4))
        put(MUSIC, tt + 2.0, bell(c[-1] + 12, 6.0, 0.18), pan=0.5 * np.sin(k))
    put(MUSIC, T("F3") + 1.0, strings(81, 7.0, 0.2, attack=3, release=3) + strings(88, 7.0, 0.12, attack=4, release=3))
    t_ = tvec(10.0)
    put(MUSIC, tsil, sine(mtof(93), t_) * env(len(t_), 2, 1, 1, 5) * 0.03, pan=0.3)

    # ---------------------------------------------------------------- 7. Ending (260-286)
    tg = T("G1")
    put(MUSIC, tg, sub_drone(26, 20, vel=0.25, attack=4, release=6))
    put(MUSIC, tg + 3.6, pad([38, 45, 51], 9.0, bright=600, vel=0.3, attack=1.0, release=5, detune=0.25))
    motif = [74, 72, 69, 70, 69, 65, 67, 62]
    for j, m in enumerate(motif):
        put(MUSIC, T("G2") + 0.5 + j * 1.3, piano(m, 4.0, 0.36, bright=0.8), pan=0.2 * np.sin(j))
    put(MUSIC, T("G3"), choir([50, 57, 64, 69], 9.0, vel=0.3, attack=3, release=4, vowel="u"))
    tt = T("G4")
    put(MUSIC, tt + 0.3, sub_drone(26, 5.5, vel=0.35, attack=0.1, release=4))
    put(MUSIC, tt + 0.8, bell(81, 5.0, 0.3), pan=0.3)
    put(MUSIC, tt + 1.6, bell(76, 4.5, 0.22), pan=-0.3)


# ====================================================================== SFX
def step_sound(surface, vol=1.0, gait="walk"):
    d = 0.11
    n = noise(d) * np.exp(-tvec(d) * (45 if gait != "run" else 35))
    if surface in ("grass", "path"):
        s = lp(n, 1800) * 0.7 + bp(n, 2500, 5000) * 0.2
    elif surface == "stone":
        s = bp(n, 300, 2500) * 0.8 + sine(140, tvec(d)) * np.exp(-tvec(d) * 50) * 0.4
    elif surface == "sand":
        s = bp(n, 800, 6000) * 0.45
    elif surface == "snow":
        g = np.repeat(rng.standard_normal(int(d * SR / 30)), 30)[:len(n)]
        s = bp(g * np.exp(-tvec(d) * 30)[:len(g)], 400, 3000) * 0.9
    elif surface == "gravel":
        s = bp(n * (rng.random(len(n)) < 0.25), 900, 6000) * 1.2
    else:
        s = lp(n, 1500)
    g = {"run": 1.3, "tired": 0.75, "sneak": 0.5, "trudge": 0.9}.get(gait, 1.0)
    return s * vol * g * 0.33


def whoosh(d=0.35, f0=300, f1=2500, vol=0.6):
    t = tvec(d)
    n = noise(d)
    out = np.zeros_like(n)
    seg_n = 8
    L = len(n) // seg_n
    for i in range(seg_n):
        fc = f0 + (f1 - f0) * i / seg_n
        out[i * L:(i + 1) * L] = bp(n, fc * 0.7, fc * 1.4)[i * L:(i + 1) * L]
    return out * np.sin(np.pi * t / d) ** 2 * vol


def thud(f=80, d=0.4, vol=0.8):
    t = tvec(d)
    return (sine(f * (1 + np.exp(-t * 25)), t) * np.exp(-t * 12) + lp(noise(d), 600) * np.exp(-t * 30) * 0.5) * vol


def groan(dur=1.3, f=95, vol=0.5):
    t = tvec(dur)
    f_t = f * (1 + 0.15 * np.sin(2 * np.pi * 1.2 * t) - 0.12 * t / dur) * (1 + 0.02 * rng.standard_normal(len(t)).cumsum() / 400)
    y = saw(f_t, t, harm=30)
    y = bp(y, 300, 900) + bp(y, 1000, 1500) * 0.5
    return y * env(len(t), 0.15, 0.2, 0.8, 0.5) * vol


def thunder(dist=0.3, d=6.0):
    t = tvec(d)
    n = noise(d)
    crack = hp(n, 1500) * np.exp(-t * 18) * (1 - dist) * 0.8
    body = lp(n, 180 + 200 * (1 - dist)) * np.exp(-t * (0.7 + dist)) * (1 + 0.5 * np.sin(2 * np.pi * 3 * t)) * 2.2
    att = np.minimum(1, t / (0.02 + dist * 0.4))
    return (crack + body) * att


def chirp(f0=3200, d=0.12):
    t = tvec(d)
    f = f0 * (1 + 0.4 * np.sin(np.pi * t / d)) + 300 * np.sin(2 * np.pi * 40 * t)
    return sine(f, t) * np.sin(np.pi * t / d) ** 2 * 0.2


def sfx_for(e):
    k = e["kind"]
    t = e["t"]
    if k == "step":
        vol = e.get("vol", 1.0)
        if e.get("who", "steve") == "steve":
            put(SFX, t, step_sound(e.get("surface", "grass"), vol, e.get("gait", "walk")), pan=rng.uniform(-0.1, 0.1))
    elif k in ("hop", "jump"):
        put(SFX, t, [step_sound("stone", 0.8), whoosh(0.25, 200, 900, 0.15)], pan=0)
    elif k == "land":
        put(SFX, t, [thud(90, 0.3, 0.35), step_sound(e.get("surface", "stone"), 1.2)], pan=0)
    elif k == "spawn_shimmer":
        for j in range(18):
            put(SFX, t + j * 0.08, bell(84 + (j * 5) % 14, 0.8, 0.12), pan=np.sin(j) * 0.7)
    elif k == "spawn_pop":
        put(SFX, t, [thud(60, 0.8, 0.5), lp(noise(0.6), 1200) * np.exp(-tvec(0.6) * 8) * 0.3])
    elif k == "sword_get":
        put(SFX, t, step_sound("stone", 0.6))
    elif k == "zombie_groan":
        put(SFX, t, groan(1.4, rng.uniform(85, 110), 0.55 * (1 - e.get("dist", 0.5) * 0.7)), pan=-0.3)
    elif k == "zombie_death":
        put(SFX, t, [groan(0.9, 70, 0.5), lp(noise(0.9), 2000) * np.exp(-tvec(0.9) * 4) * 0.25], pan=-0.2)
    elif k == "skeleton_rattle":
        for j in range(10):
            put(SFX, t + j * 0.045 + rng.uniform(0, 0.02), bp(noise(0.02), 1500, 5000) * 0.6, pan=0.3)
    elif k == "bow_draw":
        d = 0.8
        put(SFX, t, bp(noise(d), 300, 1200) * np.linspace(0, 1, int(d * SR)) * 0.15, pan=0.3)
    elif k == "arrow_shoot":
        tt = tvec(0.4)
        tw = sine(170 * (1 + 0.02 * np.exp(-tt * 40)), tt) * np.exp(-tt * 9) * 0.35
        put(SFX, t, [tw, whoosh(0.3, 800, 3000, 0.25)], pan=0.3)
    elif k == "arrow_whoosh":
        put(SFX, t, whoosh(0.4, 600, 4000, 0.5), pan=0.6)
    elif k == "arrow_thunk":
        put(SFX, t, [thud(220, 0.25, 0.6), bp(noise(0.08), 800, 3000) * np.exp(-tvec(0.08) * 50) * 0.6], pan=0.1)
    elif k == "sword_swing":
        put(SFX, t, whoosh(0.28, 400, 3500, 0.5), pan=0.1)
    elif k == "hit":
        put(SFX, t, [thud(110, 0.35, 0.75), bp(noise(0.12), 600, 4000) * np.exp(-tvec(0.12) * 35) * 0.7], pan=-0.1)
    elif k == "thunder":
        put(SFX, t, thunder(e.get("dist", 0.3)), pan=rng.uniform(-0.4, 0.4), gain=0.75)
    elif k == "drip":
        tt = tvec(1.2)
        dr = sine(1800 * np.exp(-tt * 20) + 700, tt) * np.exp(-tt * 18) * 0.25
        put(SFX, t, [dr, 0.3 * np.pad(dr, (int(0.21 * SR), 0))], pan=rng.uniform(-0.6, 0.6))
    elif k == "cave_growl":
        put(SFX, t, lp(noise(3.0), 120) * env(3 * SR, 1, 0.5, 0.7, 1.2) * 1.2, pan=0.5)
    elif k == "diamond_shimmer":
        for j in range(6):
            put(SFX, t + j * 0.15, bell(93 + j % 3 * 2, 1.5, 0.12), pan=0.4)
    elif k == "rumble_short":
        put(SFX, t, lp(noise(1.6), 140) * env(1.6 * SR, 0.1, 0.3, 0.8, 0.8) * 1.6)
    elif k == "gravel_fall":
        for j in range(16):
            put(SFX, t + j * 0.05 + rng.uniform(0, 0.03), bp(noise(0.05), 700, 5000) * np.exp(-tvec(0.05) * 40) * 0.7,
                pan=rng.uniform(-0.3, 0.3))
    elif k == "lava_splash":
        put(SFX, t, [thud(55, 0.8, 0.5), hp(noise(1.2), 2000) * np.exp(-tvec(1.2) * 3) * 0.2])
    elif k == "exhale":
        put(SFX, t, bp(noise(0.9), 300, 1800) * env(0.9 * SR, 0.1, 0.2, 0.6, 0.5) * 0.18)
    elif k == "void_hum":
        tt = tvec(5)
        put(SFX, t, (sine(55, tt) + sine(56.3, tt)) * env(len(tt), 1.5, 0.5, 1, 2) * 0.18)
    elif k == "wind_gust":
        put(SFX, t, bp(noise(3.5), 200, 1200) * env(3.5 * SR, 1.2, 0.5, 0.6, 1.5) * 0.5, pan=-0.4)
    elif k == "rumble_long":
        tt = tvec(5.5)
        r = lp(noise(5.5), 90) * env(len(tt), 0.6, 1, 0.8, 2.5) * 3.0 + sine(32, tt) * env(len(tt), 1, 1, 0.7, 2.5) * 0.3
        put(SFX, t, r)
    elif k == "distant_thud":
        put(SFX, t, [lp(thud(38, 2.5, 0.9), 200), 0.4 * np.pad(lp(thud(38, 2.5, 0.5), 150), (int(0.35 * SR), 0))],
            pan=0.2)


# ====================================================================== ambience
def bed(t0, t1, kind, vol=1.0):
    d = t1 - t0
    if d <= 0:
        return
    n = noise(d)
    tt = tvec(d)
    fade = np.minimum(1, np.minimum(tt / 0.6, (d - tt) / 0.6))
    slow = 0.7 + 0.3 * np.sin(2 * np.pi * 0.11 * tt + rng.uniform(0, 6)) * np.sin(2 * np.pi * 0.037 * tt)
    if kind == "wind":
        y = bp(n, 150, 900) * slow * 0.25
    elif kind == "wind_strong":
        y = (bp(n, 120, 1500) * 0.5 + hp(n, 3000) * 0.08) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 0.23 * tt))) * 0.6
    elif kind == "river":
        y = (bp(n, 400, 3000) * 0.35 + lp(n, 300) * 0.25) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.5 * tt))
    elif kind == "rain":
        drops = (rng.random(len(n)) < 0.003) * rng.standard_normal(len(n))
        y = hp(n, 1500) * 0.22 + bp(drops, 2000, 8000) * 2.0 + lp(n, 200) * 0.15
    elif kind == "cave":
        y = lp(n, 200) * 0.25 + bp(n, 60, 120) * 0.2
    elif kind == "lava":
        pops = (rng.random(len(n)) < 0.0004) * 1.0
        y = lp(n, 250) * 0.35 + lp(signal.lfilter([1], [1, -0.995], pops), 400) * 0.6
    elif kind == "hot":
        y = bp(n, 100, 600) * slow * 0.18 + hp(n, 5000) * 0.015
    elif kind == "insects":
        y = bp(n, 4000, 7000) * (0.5 + 0.5 * np.sin(2 * np.pi * 18 * tt) ** 2) * 0.12 + bp(n, 200, 700) * 0.1
    elif kind == "eerie":
        y = bp(n, 80, 400) * slow * 0.3 + (sine(41, tt) + sine(41.7, tt)) * 0.05
    elif kind == "deep":
        y = lp(n, 160) * slow * 0.35 + bp(n, 300, 900) * 0.06
    else:
        y = np.zeros_like(n)
    y = y * fade * vol
    l = y
    r = np.roll(y, int(0.013 * SR))
    i = int(t0 * SR)
    m = min(len(y), AMB.shape[1] - i)
    AMB[0, i:i + m] += l[:m].astype(np.float32)
    AMB[1, i:i + m] += r[:m].astype(np.float32)


def birds(t0, t1, rate=1.2):
    t = t0 + rng.exponential(1 / rate)
    while t < t1:
        f0 = rng.uniform(2500, 4800)
        for j in range(int(rng.integers(1, 5))):
            put(AMB, t + j * rng.uniform(0.09, 0.16), chirp(f0 * rng.uniform(0.9, 1.1), rng.uniform(0.06, 0.14)),
                pan=rng.uniform(-0.8, 0.8), gain=rng.uniform(0.3, 0.8))
        t += rng.exponential(1 / rate)


def crickets(t0, t1):
    t = t0
    while t < t1:
        f = rng.uniform(4200, 5200)
        for j in range(3):
            tt = tvec(0.03)
            put(AMB, t + j * 0.05, sine(f, tt) * np.sin(np.pi * tt / 0.03) * 0.05, pan=rng.uniform(-0.9, 0.9))
        t += rng.uniform(0.25, 0.7)


def villager_hmm(t):
    tt = tvec(0.5)
    f = 160 * (1 + 0.25 * np.sin(np.pi * tt / 0.5)) * (1 if rng.random() < 0.5 else 0.85)
    y = bp(saw(f, tt, harm=20), 250, 1100) * np.sin(np.pi * tt / 0.5) * 0.25
    put(AMB, t, y, pan=rng.uniform(-0.6, 0.6))


def ambience():
    S = lambda s: T(s)
    E = lambda s: T(s) + dict((a, d) for a, _, d, _ in tl.SHOTS)[s]
    bed(0, S("B1"), "wind", 0.6)
    birds(0.5, S("B1"), 1.1)
    bed(S("B1"), S("B2"), "wind", 0.8)
    birds(S("B1"), S("B2"), 2.2)
    bed(S("B2") - 0.3, E("B2") + 0.3, "river", 1.0)
    bed(S("B3"), S("B7"), "wind", 0.7)
    birds(S("B3"), S("B6"), 0.9)
    for tt in (S("B4") + 1.0, S("B4") + 3.6, S("B5") + 0.8, S("B5") + 3.8):
        villager_hmm(tt)
    bed(S("B7"), S("C6") + 4.4, "wind", 0.9)
    crickets(S("B8"), S("C6") + 4.4)
    bed(S("C6") + 4.2, S("C8"), "rain", 1.0)
    bed(S("C6") + 4.2, S("C8"), "wind_strong", 0.6)
    bed(S("C8"), S("C10"), "cave", 1.0)
    bed(S("C10"), S("D1"), "lava", 1.0)
    bed(S("D1"), S("D2"), "wind", 1.0)
    bed(S("D2"), S("D4"), "wind_strong", 1.1)
    bed(S("D4"), S("D6"), "hot", 1.2)
    bed(S("D6"), S("D8"), "insects", 1.0)
    birds(S("D6"), S("D8"), 1.5)
    bed(S("D8"), S("E1"), "wind", 0.9)
    bed(S("E1"), S("F1"), "eerie", 1.0)
    bed(S("F1"), S("G4") + 3, "deep", 1.0)


# ====================================================================== mix
def main():
    events = []
    for f in sorted(glob.glob(os.path.join(ROOT, "build", "events", "*.json"))):
        events += json.load(open(f))
    print(f"[audio] {len(events)} events")
    compose()
    print("[audio] music composed")
    for e in events:
        sfx_for(e)
    ambience()
    print("[audio] sfx + ambience done")
    m = np.stack([reverb(MUSIC[0], 3.2, 1), reverb(MUSIC[1], 3.2, 2)]) * 0.45 + MUSIC * 0.75
    s = SFX + 0.25 * np.stack([reverb(SFX[0], 1.4, 3, 3000), reverb(SFX[1], 1.4, 4, 3000)])
    # cave sections get extra echo on sfx
    c0, c1 = int(T("C8") * SR), int(T("D1") * SR)
    for chn in range(2):
        seg_ = SFX[chn, c0:c1]
        s[chn, c0:c1] += 0.5 * reverb(seg_, 2.5, 5 + chn, 2500)
    a = AMB
    # silence moment: duck everything except a whisper of wind
    sil0, sil1 = T("F6") + 4.0, T("G1")
    tt = np.arange(N) / SR
    duck = 1 - 0.85 * np.clip((tt - sil0) / 1.5, 0, 1) * np.clip((sil1 + 0.5 - tt) / 1.5, 0, 1)
    mgain = np.ones(N)
    for (t0, t1, g) in ((T("E5"), T("F1"), 1.2), (T("F1"), T("F6") + 4.0, 1.45), (T("D1"), T("D8"), 1.15)):
        i0, i1 = int(t0 * SR), int(t1 * SR)
        ramp = int(1.5 * SR)
        w = np.ones(i1 - i0) * g
        w[:ramp] = np.linspace(1, g, ramp)
        w[-ramp:] = np.linspace(g, 1, ramp)
        mgain[i0:i1] = w
    mix = m * 0.9 * mgain + s * 1.0 + a * 0.8 * duck
    # fade in / out
    mix *= np.clip(tt / 1.5, 0, 1) * np.clip((DUR - tt) / 1.0, 0, 1)
    rms = np.sqrt(np.mean(mix ** 2))
    target = 10 ** (-17.0 / 20)
    mix = mix * (target / rms)
    mix = np.tanh(mix * 1.2) / 1.2
    mix *= 0.97 / max(0.97, np.max(np.abs(mix)))
    out = (mix[:, :int(DUR * SR)].T * 32767).astype(np.int16)
    os.makedirs(os.path.join(ROOT, "build", "audio"), exist_ok=True)
    from scipy.io import wavfile
    path = os.path.join(ROOT, "build", "audio", "film_audio.wav")
    wavfile.write(path, SR, out)
    print(f"[audio] wrote {path} ({DUR:.1f}s)")


if __name__ == "__main__":
    main()
