"""Sound effects (mono, 44.1 kHz OGG).  Every sound is synthesised from scratch.

Loops (blue_loop, void_ambient, shrine_ambient, domain/clash) are built
*circularly*: all tones have an integer number of cycles per loop, noise is
filtered with circular FFTs, events wrap around and reverb is a circular
convolution - so the last sample flows into the first with no seam at all.
"""
from __future__ import annotations

import math
import sys

import numpy as np

import dsp as D
from dsp import ns, tvec, SR, PI

SND = D.Path(__file__).resolve().parents[2] / "src/main/resources/assets/jjkshowdown/sounds"


def R(seed):
    return np.random.default_rng(seed)


def unit(x):
    m = np.max(np.abs(x))
    return x / m if m > 0 else x


def rms_norm(x, target=0.2):
    r = np.sqrt(np.mean(x ** 2))
    return x * (target / r) if r > 0 else x


# =========================================================== building blocks
def bp_sweep(x, f0, f1, q, d, circular=False, curve=None):
    def H(f, t):
        u = np.clip(t / d, 0, 1) if curve is None else curve(t)
        fc = f0 * (f1 / f0) ** u
        return D.H_bp(fc, q)(f)
    return D.tv_filter(x, H, circular=circular)


def lp_sweep(x, f0, f1, d, order=2, curve=None):
    def H(f, t):
        u = np.clip(t / d, 0, 1) if curve is None else curve(t)
        fc = f0 * (f1 / f0) ** u
        return D.H_lp(fc, order)(f)
    return D.tv_filter(x, H)


def whoosh(d, f0, f1, q, r, pts, slope=-2.0):
    n = ns(d)
    y = bp_sweep(D.colored(n, r, slope), f0, f1, q, d)
    return unit(y) * D.env_pts(n, [(p * d, v) for p, v in pts])


def thump(d, f0, f1, tau_p, tau_a, click=0.25, r=None):
    n = ns(d)
    t = tvec(n)
    f = f1 + (f0 - f1) * np.exp(-t / tau_p)
    y = D.sine(f) * np.exp(-t / tau_a) * np.clip(t / 0.0015, 0, 1)
    if click and r is not None:
        c = D.highpass(D.white(n, r), 1500) * np.exp(-t / 0.003)
        y = y + click * unit(c)
    return y


def metal(f0, d, r, ratios=(1.0, 2.32, 4.25, 6.63, 9.38, 12.1), decay=0.35, beat=0.004, tilt=0.6):
    n = ns(d)
    t = tvec(n)
    y = np.zeros(n)
    for i, ratio in enumerate(ratios):
        f = f0 * ratio * (1 + r.uniform(-0.003, 0.003))
        if f > 19000:
            continue
        amp = 1 / (1 + i * tilt)
        tau = decay / (1 + i * 0.45)
        y += amp * (D.sine(f, n, r.random()) + 0.6 * D.sine(f * (1 + beat), n, r.random())) * np.exp(-t / tau)
    return y * np.clip(t / 0.0008, 0, 1)


def env_times(r, count, env_fn, d):
    """Sample `count` event times distributed like env_fn over [0, d]."""
    grid = np.linspace(0, d, 2000)
    w = np.maximum(env_fn(grid), 0) + 1e-9
    cdf = np.cumsum(w)
    cdf /= cdf[-1]
    return np.interp(r.random(count), cdf, grid)


def crackle(d, r, count, env_fn, f_lo=1500, f_hi=9000, grain=0.0015, circular=False):
    n = ns(d)
    y = np.zeros(n)
    times = env_times(r, count, env_fn, d) if not circular else r.uniform(0, d, count)
    g = ns(grain)
    gt = np.arange(g) / g
    for tm in times:
        burst = r.standard_normal(g) * np.exp(-gt * 4) * r.uniform(0.3, 1.0)
        D.place(y, burst, int(tm * SR), circular=circular)
    y = D.filt(y, D.H_mul(D.H_hp(f_lo, 2), D.H_lp(f_hi, 2)), circular=circular)
    return unit(y)


def debris(d, r, count, env_fn, bands=((250, 2.0), (700, 3.0), (1800, 4.0), (4200, 5.0))):
    n = ns(d)
    out = np.zeros(n)
    for (fc, q) in bands:
        y = np.zeros(n)
        times = env_times(r, count // len(bands), env_fn, d)
        for tm in times:
            L = ns(r.uniform(0.003, 0.02))
            burst = r.standard_normal(L) * np.exp(-np.arange(L) / (L * 0.3)) * r.uniform(0.2, 1.0)
            D.place(y, burst, int(tm * SR))
        out += D.bandpass(y, fc, q) * (1.0 if fc < 1000 else 0.7)
    return unit(out)


def bell(f0, d, r, ratio=3.5, index0=3.0, tau=1.2):
    n = ns(d)
    t = tvec(n)
    idx = index0 * np.exp(-t / (tau * 0.25))
    y = D.fm(f0, f0 * ratio, idx, n) * np.exp(-t / tau)
    for k, (mult, a, tf) in enumerate([(2.0, 0.35, 0.6), (2.76, 0.25, 0.4), (5.4, 0.12, 0.22), (8.93, 0.06, 0.12)]):
        if f0 * mult < 18000:
            y += a * D.sine(f0 * mult, n, r.random()) * np.exp(-t / (tau * tf))
    return y * np.clip(t / 0.002, 0, 1)


FORMANTS = {
    "a": [(730, 90, 1.0), (1090, 100, 0.5), (2440, 130, 0.22), (3400, 220, 0.08)],
    "o": [(570, 80, 1.0), (840, 90, 0.45), (2410, 130, 0.16), (3400, 220, 0.06)],
    "u": [(320, 70, 1.0), (870, 90, 0.3), (2240, 130, 0.1)],
    "e": [(530, 80, 1.0), (1840, 110, 0.4), (2480, 140, 0.25), (3500, 220, 0.08)],
    "i": [(290, 70, 1.0), (2290, 120, 0.35), (3010, 160, 0.25)],
}


def formant_H(vowel, shift=1.0):
    def H(f):
        out = 0.03
        for F, B, g in FORMANTS[vowel]:
            F2 = F * shift
            out = out + g * D.H_bp(F2, F2 / B)(f)
        return out
    return H


def formant_morph_H(v0, v1, d, shift=1.0, circular_period=None):
    def H(f, t):
        u = (0.5 - 0.5 * math.cos(2 * PI * t / circular_period)) if circular_period else np.clip(t / d, 0, 1)
        return (1 - u) * formant_H(v0, shift)(f) + u * formant_H(v1, shift)(f)
    return H


def voice_stack(notes, n, r, voices=4, vib=0.005, detune_c=10, breath=0.04, src="saw", period=None):
    t = tvec(n)
    y = np.zeros(n)
    for f0 in notes:
        for v in range(voices):
            det = 2 ** (r.uniform(-detune_c, detune_c) / 1200)
            vr = r.uniform(4.6, 5.8)
            if period:  # keep loops periodic: vibrato rate and pitch on the loop grid
                vr = max(1, round(vr * period)) / period
                fbase = round(f0 * det * period) / period
            else:
                fbase = f0 * det
            fv = fbase * (1 + vib * np.sin(2 * PI * vr * t + r.uniform(0, 2 * PI)))
            y += (D.saw(fv, ph0=r.random()) if src == "saw" else D.pulse(fv, duty=0.3, ph0=r.random()))
    if breath:
        y += breath * D.white(n, r) * np.sqrt(len(notes) * voices)
    return y / max(1, len(notes) * voices) ** 0.5


def choir(notes, d, r, vowel="a", shift=1.0, voices=4, vib=0.006):
    n = ns(d)
    y = voice_stack(notes, n, r, voices, vib)
    return D.filt(y, formant_H(vowel, shift))


def taiko(f0, d, r, hard=1.0):
    n = ns(d)
    t = tvec(n)
    f = f0 * (1 + 0.6 * np.exp(-t / 0.018))
    body = D.sine(f) * np.exp(-t / 0.38) + 0.45 * D.sine(f * 1.59) * np.exp(-t / 0.13) \
        + 0.25 * D.sine(f * 2.31) * np.exp(-t / 0.07)
    slap = unit(D.bandpass(D.white(n, r), 900, 0.7)) * np.exp(-t / 0.01) * 0.55 * hard
    thud = unit(D.lowpass(D.white(n, r), 260)) * np.exp(-t / 0.045) * 0.5
    y = (body + slap + thud) * np.clip(t / 0.001, 0, 1)
    return D.drive(y * 1.2, 1.4)


def brass(freqs, d, r, cut_lo=350, cut_hi=2600, swell=0.35, attack=0.06, release=0.4, voices=2):
    n = ns(d)
    t = tvec(n)
    y = np.zeros(n)
    for f0 in freqs:
        for v in range(voices):
            det = 2 ** (r.uniform(-9, 9) / 1200)
            y += D.saw(f0 * det * (1 + 0.003 * np.sin(2 * PI * 5.0 * t + r.random() * 6)), ph0=r.random())
    cut = lambda tt: cut_lo + (cut_hi - cut_lo) * (1 - np.exp(-tt / swell)) * np.exp(-np.maximum(tt - swell * 2, 0) / 1.5)
    y = D.tv_filter(y, lambda f, tt: D.H_lp(cut(tt), 2)(f))
    env = np.clip(t / attack, 0, 1) * np.clip((d - t) / release, 0, 1)
    return y * env / max(1, len(freqs) * voices) ** 0.5


def fire(d, r, cut=1400, flicker=7.0, pops=40):
    n = ns(d)
    t = tvec(n)
    base = D.lowpass(D.colored(n, r, -4.0), cut, 2)
    am = D.lowpass(D.white(n, r), flicker, 2)
    am = 0.65 + 0.35 * unit(am)
    y = unit(base) * am
    if pops:
        y += 0.5 * crackle(d, r, pops, lambda tt: np.ones_like(tt), 1800, 7000, grain=0.002)
    return y


def sub_rumble(d, r, cut=90, circular=False):
    n = ns(d)
    return unit(D.lowpass(D.colored(n, r, -6.0), cut, 3, circular=circular))


def finalize(x, fin=0.002, fout=0.03, hp=25):
    x = D.highpass(x, hp, 2)
    x = x - np.mean(x)
    return D.fade(x, fin, fout)


def finalize_loop(x, hp=25):
    x = D.highpass(x, hp, 2, circular=True)
    return x - np.mean(x)


def roomify(x, rt60, wet, bright=0.5, predelay=0.012, seed=5):
    return D.add_reverb(x, rt60=rt60, wet=wet, predelay=predelay, bright=bright, seed=seed)


# ===================================================================== GOJO
def infinity_on():
    d = 0.8
    n = ns(d)
    t = tvec(n)
    r = R(101)
    y = np.zeros(n)
    base = [1318.5, 1760.0, 2217.5, 2637.0, 3322.4, 3520.0, 4434.9, 5274.0]
    for i, f in enumerate(base):
        on = r.uniform(0.0, 0.28)
        rise = 2 ** ((t / d) * 5 / 12)
        fv = f * rise * (1 + 0.004 * np.sin(2 * PI * r.uniform(6, 9) * t + r.random() * 6))
        env = np.clip((t - on) / 0.12, 0, 1) * np.exp(-np.maximum(t - on, 0) / 0.9)
        y += D.sine(fv, ph0=r.random()) * env / (1 + 0.25 * i)
    air = bp_sweep(D.white(n, r), 1200, 9000, 2.5, d)
    y = unit(y) + 0.22 * unit(air) * D.env_pts(n, [(0, 0), (0.35, 1), (0.8, 0.2)])
    y *= D.env_pts(n, [(0, 0), (0.06, 0.7), (0.5, 1.0), (0.8, 0.0)])
    y = roomify(y, 1.0, 0.35, bright=0.9)
    return finalize(y, 0.004, 0.08)


def infinity_off():
    d = 0.6
    n = ns(d)
    t = tvec(n)
    r = R(102)
    y = np.zeros(n)
    base = [5274.0, 4434.9, 3520.0, 2637.0, 2217.5, 1760.0]
    for i, f in enumerate(base):
        on = r.uniform(0.0, 0.12)
        fall = 2 ** (-(t / d) * 7 / 12)
        fv = f * fall * (1 + 0.004 * np.sin(2 * PI * 7 * t + r.random() * 6))
        env = np.clip((t - on) / 0.02, 0, 1) * np.exp(-np.maximum(t - on, 0) / 0.28)
        y += D.sine(fv, ph0=r.random()) * env / (1 + 0.2 * i)
    air = bp_sweep(D.white(n, r), 8000, 1500, 2.5, d)
    y = unit(y) + 0.2 * unit(air) * D.env_pts(n, [(0, 0.8), (0.3, 0.4), (0.6, 0)])
    y = roomify(y, 0.8, 0.3, bright=0.9)
    return finalize(y, 0.002, 0.08)


def infinity_block():
    d = 0.4
    n = ns(d)
    t = tvec(n)
    r = R(103)
    warble = 1 + 0.006 * np.sin(2 * PI * 13 * t)
    glass = np.zeros(n)
    for i, (ratio, a, tau) in enumerate([(1.0, 1.0, 0.25), (2.71, 0.6, 0.16), (5.12, 0.35, 0.09), (8.3, 0.2, 0.05)]):
        glass += a * D.sine(2600 * ratio * warble, ph0=r.random()) * np.exp(-t / tau)
    tick = unit(D.highpass(D.white(n, r), 4000)) * np.exp(-t / 0.002)
    stop = thump(d, 220, 120, 0.01, 0.03)
    y = unit(glass) * 0.8 + 0.35 * tick + 0.35 * stop
    y = roomify(y, 0.5, 0.18, bright=0.9)
    return finalize(y, 0.0005, 0.05)


def blue_cast():
    d = 1.0
    n = ns(d)
    t = tvec(n)
    r = R(104)
    # reverse-envelope suck: noise sweeping down while getting louder
    suck = bp_sweep(D.colored(n, r, -1.5), 5000, 260, 1.8, 0.78)
    suck = unit(suck) * D.env_pts(n, [(0, 0), (0.55, 0.45), (0.76, 1.0), (0.8, 0.0)]) ** 1.5
    whine = D.sine(D.glide(1800, 200, n)) * D.env_pts(n, [(0, 0), (0.6, 0.25), (0.78, 0.4), (0.8, 0)])
    imp = np.zeros(n)
    D.place(imp, thump(0.22, 120, 34, 0.04, 0.12, 0.2, r), ns(0.78))
    sub = np.zeros(n)
    sd = ns(0.22)
    D.place(sub, D.sine(D.glide(70, 30, sd)) * np.exp(-tvec(sd) / 0.09), ns(0.78))
    y = suck * 0.75 + whine * 0.3 + imp * 0.9 + sub * 0.6
    y = D.drive(y, 1.3)
    y = roomify(y, 0.7, 0.2)
    return finalize(y, 0.005, 0.05)


def blue_loop():
    d = 2.0
    n = ns(d)
    t = tvec(n)
    r = R(105)
    drone = D.sine(55.0, n) + 0.6 * D.sine(55.5, n, 0.3) + 0.35 * D.sine(110.0, n, 0.1) + 0.15 * D.sine(165.0, n)
    swirl_lfo = lambda tt: np.sin(2 * PI * tt / 0.5)
    nz = D.colored(n, r, -1.0)
    swirl = D.tv_filter(nz, lambda f, tt: D.H_bp(700 * 2 ** (1.4 * swirl_lfo(tt)), 4.0)(f), circular=True)
    swirl2 = D.tv_filter(nz[::-1].copy(), lambda f, tt: D.H_bp(2600 * 2 ** (0.9 * np.sin(2 * PI * tt / 1.0 + 1.3)), 6.0)(f),
                         circular=True)
    whistle = D.sine(880.0 * (1 + 0.01 * np.sin(2 * PI * 2.0 * t)), n) + 0.5 * D.sine(1320.0 * (1 + 0.01 * np.sin(2 * PI * 2.0 * t + 1)), n)
    am = 0.75 + 0.25 * np.sin(2 * PI * 2.0 * t)
    y = unit(drone) * 0.55 + unit(swirl) * 0.45 * am + unit(swirl2) * 0.18 + unit(whistle) * 0.08 * am
    y = D.drive(y, 1.2)
    y = D.add_reverb(y, rt60=0.8, wet=0.25, circular=True, seed=9)
    return finalize_loop(y)


def red_charge():
    d = 1.2
    n = ns(d)
    t = tvec(n)
    r = R(106)
    f = D.glide(180, 1600, n)
    vib_rate = 5 + 25 * (t / d)
    vib = 1 + (0.004 + 0.02 * (t / d)) * np.sin(2 * PI * np.cumsum(vib_rate) / SR)
    tone = D.saw(f * vib) * 0.6 + D.pulse(f * 1.5 * vib, duty=0.3) * 0.3
    tone = D.tv_filter(tone, lambda ff, tt: D.H_lp(400 + 6000 * (tt / d) ** 1.5, 2)(ff))
    cr = crackle(d, r, 160, lambda tt: (tt / d) ** 2.2, 2000, 9000)
    hum = D.sine(D.glide(60, 120, n)) * 0.4
    env = D.env_pts(n, [(0, 0), (0.15, 0.25), (1.0, 1.0), (1.15, 1.0), (1.2, 0.0)])
    y = (unit(tone) * 0.6 + cr * 0.3 + hum) * env
    y = D.drive(y * 1.2, 1.4)
    y = roomify(y, 0.6, 0.15)
    return finalize(y, 0.01, 0.04)


def red_fire():
    d = 0.7
    n = ns(d)
    t = tvec(n)
    r = R(107)
    zap = D.fm(D.glide(3200, 180, ns(0.16)), 90, 3.0)
    zap = np.concatenate([zap, np.zeros(n - len(zap))]) * np.exp(-t / 0.09)
    burst = unit(D.highpass(D.white(n, r), 1200)) * np.exp(-t / 0.035)
    punch = thump(d, 160, 50, 0.03, 0.12, 0.35, r)
    cr = crackle(d, r, 70, lambda tt: np.exp(-tt / 0.15), 2500, 9000)
    y = zap * 0.55 + burst * 0.5 + punch * 0.9 + cr * 0.25
    y = D.drive(y * 1.3, 1.5)
    y = roomify(y, 0.9, 0.2)
    return finalize(y, 0.0005, 0.08)


def red_impact():
    d = 2.0
    n = ns(d)
    t = tvec(n)
    r = R(108)
    sub = D.sine(30 + 45 * np.exp(-t / 0.12)) * np.exp(-t / 0.75)
    body = unit(D.lowpass(D.colored(n, r, -2), 900, 2)) * np.exp(-t / 0.25)
    crack = unit(D.highpass(D.white(n, r), 2500)) * np.exp(-t / 0.012)
    deb = debris(d, r, 900, lambda tt: np.exp(-tt / 0.45) * (tt > 0.03))
    rumble = sub_rumble(d, r, 70) * np.exp(-t / 0.9)
    y = sub * 1.0 + body * 0.6 + crack * 0.45 + deb * 0.3 + rumble * 0.5
    y = D.drive(y * 1.6, 2.0)
    y = roomify(y, 1.8, 0.28, bright=0.4)
    y = D.limiter(y / np.max(np.abs(y)), -3)
    return finalize(y, 0.0005, 0.3)


def purple_charge():
    d = 3.0
    n = ns(d)
    t = tvec(n)
    r = R(109)
    u = t / d
    meet = 330.0
    f_hi = meet * (1300 / meet) ** (1 - u) ** 1.6
    f_lo = meet * (90 / meet) ** (1 - u) ** 1.6
    det = 1 + 0.004 * u
    hi = D.saw(f_hi) * 0.5 + D.sine(f_hi * 2) * 0.3
    lo = D.saw(f_lo * det) * 0.6 + D.pulse(f_lo * 0.5, duty=0.4) * 0.3
    tones = D.tv_filter(hi + lo, lambda ff, tt: D.H_lp(500 + 5000 * (tt / d) ** 1.3, 2)(ff))
    trem = 1 + 0.25 * u * np.sin(2 * PI * (4 + 14 * u) * t)
    swell = D.lowpass(D.colored(n, r, -2), 3000) * u ** 2
    rumble = sub_rumble(d, r, 80) * u ** 1.5
    cr = crackle(d, r, 300, lambda tt: (tt / d) ** 3, 2500, 10000)
    env = D.env_pts(n, [(0, 0), (0.3, 0.3), (2.85, 1.0), (3.0, 0.85)])
    y = (unit(tones) * 0.7 * trem + unit(swell) * 0.3 + rumble * 0.6 + cr * 0.22) * env
    y = D.drive(y * (1 + 1.5 * u), 1.6)
    y = roomify(y, 1.0, 0.18)
    return finalize(y, 0.01, 0.05)


def purple_fire():
    d = 3.5
    n = ns(d)
    t = tvec(n)
    r = R(110)
    crack = unit(D.highpass(D.white(n, r), 1800)) * np.exp(-t / 0.02)
    sub = D.sine(24 + 40 * np.exp(-t / 0.25)) * np.exp(-t / 1.4)
    roar_src = D.drive(D.colored(n, r, -2.5) * 2.5, 2.0)
    roar = lp_sweep(roar_src, 5000, 250, 2.8)
    roar = unit(roar) * D.env_pts(n, [(0, 0), (0.03, 1), (0.6, 0.8), (3.0, 0.15), (3.5, 0)])
    tear_nz = D.bandpass(D.white(n, r), 2200, 1.2)
    tear_am = (D.lowpass(D.white(n, r), 60) > 0).astype(float)
    tear = unit(tear_nz * D.lowpass(tear_am, 300)) * D.env_pts(n, [(0, 0), (0.05, 1), (1.2, 0.5), (2.2, 0)])
    sweep = bp_sweep(D.white(n, r), 6000, 300, 2.0, 2.0)
    sweep = unit(sweep) * D.env_pts(n, [(0, 0.8), (1.5, 0.4), (2.5, 0)])
    hum = D.saw(D.glide(330, 55, n)) * D.env_pts(n, [(0, 0.5), (2.0, 0.2), (3.0, 0)])
    hum = D.lowpass(hum, 1200)
    y = crack * 0.5 + sub * 1.0 + roar * 0.75 + tear * 0.35 + sweep * 0.3 + unit(hum) * 0.25
    y = D.drive(y * 1.8, 2.2)
    y = roomify(y, 2.6, 0.32, bright=0.4)
    y = D.limiter(y / np.max(np.abs(y)), -2.5)
    return finalize(y, 0.0005, 0.5)


def blink():
    d = 0.35
    n = ns(d)
    t = tvec(n)
    r = R(111)
    chirp_n = ns(0.07)
    chirp = D.sine(D.glide(380, 3200, chirp_n)) * np.hanning(chirp_n)
    chirp = np.concatenate([chirp, np.zeros(n - chirp_n)])
    pop = thump(d, 900, 300, 0.005, 0.012, 0.6, r)
    air = whoosh(d, 6000, 1500, 1.5, r, [(0, 0), (0.08, 1), (0.6, 0)])
    zip_ = D.sine(D.glide(5000, 1500, n)) * np.exp(-t / 0.03) * 0.3
    y = chirp * 0.7 + pop * 0.5 + air * 0.4 + zip_
    y = roomify(y, 0.4, 0.15, bright=0.8)
    return finalize(y, 0.0005, 0.06)


def void_activate():
    d = 4.0
    n = ns(d)
    t = tvec(n)
    r = R(112)
    hit = 2.5
    # deep resonant swell
    swell_env = D.env_pts(n, [(0, 0), (hit - 0.05, 1.0), (hit, 0.7), (d, 0.0)])
    drone = D.lowpass(D.sine(36.71, n) + 0.7 * D.sine(73.42, n) + 0.25 * D.saw(36.71 * 1.003, n) + 0.3 * D.sine(110.0, n), 400)
    # reversed cymbal: noise with rising envelope, brightening
    cym_n = ns(2.0)
    cym = D.highpass(D.white(cym_n, r), 3000) * (np.linspace(0, 1, cym_n) ** 3)
    cym = D.tv_filter(cym, lambda f, tt: D.H_lp(2000 + 12000 * (tt / 2.0) ** 2, 2)(f))
    cym_full = np.zeros(n)
    D.place(cym_full, cym, ns(hit - 2.0))
    # chord hit at 2.5 s: bells + choir, D lydian-ish (D F# A C# E)
    chord = [587.33, 739.99, 880.0, 1108.73, 1318.51]
    bells = np.zeros(n)
    for i, f in enumerate(chord):
        b = bell(f, d - hit, r, ratio=3.5, index0=2.0, tau=1.3)
        D.place(bells, b, ns(hit + 0.004 * i), 1 / (1 + 0.15 * i))
    ch = choir([146.83, 220.0, 293.66, 369.99, 440.0], d - hit + 0.3, r, "a", voices=4)
    ch = ch * D.env_pts(len(ch), [(0, 0), (0.25, 1.0), (1.0, 0.8), (d - hit + 0.3, 0)])
    choir_full = np.zeros(n)
    D.place(choir_full, ch, ns(hit - 0.15))
    impact = np.zeros(n)
    D.place(impact, thump(1.2, 90, 30, 0.05, 0.4, 0.3, r), ns(hit))
    # shimmering tail
    sh = np.zeros(n)
    for i in range(40):
        f = r.uniform(2000, 7000)
        on = r.uniform(hit, d - 0.3)
        L = ns(r.uniform(0.2, 0.8))
        ping = D.sine(f, L, r.random()) * np.exp(-tvec(L) / (L / SR * 0.3))
        D.place(sh, ping, ns(on), r.uniform(0.2, 0.6))
    y = unit(drone) * swell_env * 0.6 + unit(cym_full) * 0.45 + unit(bells) * 0.7 + unit(choir_full) * 0.45 \
        + impact * 0.8 + unit(sh) * 0.25
    y = D.drive(y * 1.1, 1.2)
    y = D.add_reverb(y, rt60=3.2, wet=0.45, predelay=0.03, bright=0.7, seed=12)
    return finalize(y, 0.01, 0.6)


def void_ambient():
    d = 6.0
    n = ns(d)
    t = tvec(n)
    r = R(113)
    q = lambda f: round(f * d) / d                     # snap to loop grid
    chord = [q(f) for f in (73.42, 110.0, 146.83, 220.0, 277.18, 329.63, 440.0)]
    pad = np.zeros(n)
    for i, f in enumerate(chord):
        lfo = 0.6 + 0.4 * np.sin(2 * PI * (1 + i % 3) * t / d + i)
        pad += (D.sine(f, n, r.random()) + 0.3 * D.sine(q(f * 2.003), n, r.random())) * lfo / (1 + 0.15 * i)
    pad = D.lowpass(pad, 2500, circular=True)
    # glassy twinkles that wrap around the loop
    tw = np.zeros(n)
    for i in range(55):
        f = r.choice([1760.0, 2217.46, 2637.02, 3520.0, 4434.92, 5274.04]) * (1 + r.uniform(-0.002, 0.002))
        L = ns(r.uniform(0.3, 1.2))
        ping = D.sine(f, L, r.random()) * np.exp(-tvec(L) / (L / SR * 0.35)) * np.clip(tvec(L) / 0.01, 0, 1)
        D.place(tw, ping, int(r.uniform(0, n)), r.uniform(0.1, 0.5), circular=True)
    wind = D.tv_filter(D.colored(n, r, -1.5), lambda f, tt: D.H_bp(900 * 2 ** (1.2 * np.sin(2 * PI * tt / d)), 2.5)(f),
                       circular=True)
    sub = D.sine(q(36.71), n) * (0.7 + 0.3 * np.sin(2 * PI * t / d))
    y = unit(pad) * 0.6 + unit(tw) * 0.3 + unit(wind) * 0.15 + sub * 0.3
    y = D.add_reverb(y, rt60=3.0, wet=0.5, circular=True, bright=0.7, seed=13)
    return finalize_loop(y)


# =================================================================== SUKUNA
def shing(d, r, f0=3400, decay=0.25, bright=1.0):
    n = ns(d)
    t = tvec(n)
    hiss = unit(D.highpass(D.white(n, r), 3500 if bright else 2000)) * np.exp(-t / 0.05) * np.clip(t / 0.004, 0, 1)
    swish = whoosh(d, 1800, 9000, 2.0, r, [(0, 0), (0.08, 1), (0.25, 0)])
    ring = metal(f0, d, r, ratios=(1.0, 1.47, 2.09, 2.56, 3.39), decay=decay, beat=0.002, tilt=0.4)
    ring *= np.exp(-t / decay)
    fdrop = unit(ring)
    return hiss * 0.6 + swish * 0.35 + fdrop * 0.45


def dismantle():
    d = 0.45
    r = R(201)
    y = shing(d, r, 3600, 0.22)
    y = roomify(y, 0.5, 0.15, bright=0.9)
    return finalize(y, 0.0005, 0.06)


def dismantle_barrage():
    d = 1.2
    n = ns(d)
    r = R(202)
    y = np.zeros(n)
    times = np.sort(np.concatenate([[0.0], r.uniform(0.02, 0.95, 13)]))
    for i, tm in enumerate(times):
        s = shing(0.25, r, r.uniform(2800, 4800), r.uniform(0.06, 0.14))
        D.place(y, s, ns(tm), r.uniform(0.45, 1.0))
    bed = whoosh(d, 1200, 4000, 1.0, r, [(0, 0), (0.1, 1), (0.8, 0.7), (1.0, 0)])
    y = unit(y) + bed * 0.15
    y = roomify(y, 0.6, 0.18, bright=0.8)
    return finalize(y, 0.0005, 0.08)


def cleave():
    d = 0.8
    n = ns(d)
    t = tvec(n)
    r = R(203)
    y = np.zeros(n)
    for i, tm in enumerate((0.0, 0.11, 0.24)):
        L = ns(0.4)
        tl = tvec(L)
        chop = thump(0.4, 180, 55, 0.02, 0.07, 0.0) * 0.9
        crunch = unit(D.bandpass(D.white(L, r), 1500, 0.9)) * np.exp(-tl / 0.03)
        crunch = D.drive(crunch * 3, 2.5)
        bone = crackle(0.4, r, 25, lambda tt: np.exp(-tt / 0.03), 1200, 6000) * 0.5
        hiss = unit(D.highpass(D.white(L, r), 3000)) * np.exp(-tl / 0.02) * 0.4
        D.place(y, chop + crunch * 0.55 + bone + hiss, ns(tm), 1.0 if i < 2 else 1.25)
    ring = metal(1900, d, r, ratios=(1.0, 1.52, 2.21, 3.07), decay=0.2) * 0.25
    D.place(y, ring[:n - ns(0.24)], ns(0.24))
    y = D.drive(y * 1.3, 1.6)
    y = roomify(y, 0.7, 0.18)
    return finalize(y, 0.0005, 0.08)


def fuga_charge():
    d = 2.0
    n = ns(d)
    t = tvec(n)
    r = R(204)
    u = t / d
    f = fire(d, r, cut=900, pops=0)
    f = D.tv_filter(f, lambda ff, tt: D.H_lp(500 + 5500 * (tt / d) ** 1.4, 2)(ff))
    pops = crackle(d, r, 260, lambda tt: 0.2 + (tt / d) ** 2, 1500, 7000, grain=0.0025)
    riser = D.saw(D.glide(80, 420, n)) * 0.5 + D.saw(D.glide(80.6, 423, n)) * 0.5
    riser = D.tv_filter(riser, lambda ff, tt: D.H_lp(200 + 2500 * (tt / d) ** 2, 2)(ff))
    rumble = sub_rumble(d, r, 90)
    env = D.env_pts(n, [(0, 0), (0.2, 0.25), (1.9, 1.0), (2.0, 0.8)])
    y = (unit(f) * 0.7 + pops * 0.35 + unit(riser) * 0.3 + rumble * 0.5) * env
    y = D.drive(y * 1.4, 1.5)
    y = roomify(y, 0.8, 0.15)
    return finalize(y, 0.01, 0.04)


def fuga_fire():
    d = 1.0
    n = ns(d)
    t = tvec(n)
    r = R(205)
    launch = whoosh(d, 600, 5000, 1.2, r, [(0, 0), (0.06, 1), (0.3, 0.6), (1.0, 0)], slope=-3)
    roar = unit(D.lowpass(D.colored(n, r, -3), 1800)) * D.env_pts(n, [(0, 0), (0.03, 1), (0.5, 0.4), (1, 0)])
    punch = thump(d, 140, 45, 0.03, 0.15, 0.3, r)
    pops = crackle(d, r, 90, lambda tt: np.exp(-tt / 0.25), 1500, 8000, grain=0.002)
    y = launch * 0.6 + roar * 0.6 + punch * 0.7 + pops * 0.3
    y = D.drive(y * 1.4, 1.6)
    y = roomify(y, 0.9, 0.18)
    return finalize(y, 0.0005, 0.1)


def fuga_explode():
    d = 3.0
    n = ns(d)
    t = tvec(n)
    r = R(206)
    boom = D.sine(28 + 50 * np.exp(-t / 0.15)) * np.exp(-t / 0.9)
    blast = unit(D.lowpass(D.colored(n, r, -2), 2500)) * np.exp(-t / 0.35)
    body = fire(d, r, cut=1200, pops=0) * D.env_pts(n, [(0, 0), (0.05, 1), (1.0, 0.6), (3.0, 0)])
    pops = crackle(d, r, 400, lambda tt: np.exp(-tt / 0.9) * (tt > 0.05), 1200, 7000, grain=0.003)
    crack = unit(D.highpass(D.white(n, r), 2000)) * np.exp(-t / 0.015)
    y = boom * 1.0 + blast * 0.6 + unit(body) * 0.5 + pops * 0.35 + crack * 0.4
    y = D.drive(y * 1.7, 2.0)
    y = roomify(y, 2.2, 0.3, bright=0.45)
    y = D.limiter(y / np.max(np.abs(y)), -2.5)
    return finalize(y, 0.0005, 0.4)


def world_slash_charge():
    d = 3.0
    n = ns(d)
    t = tvec(n)
    r = R(207)
    u = t / d
    drone = D.saw(55.0 * (1 + 0.002 * np.sin(2 * PI * 0.5 * t)), n) + D.saw(82.41, n) * 0.6
    drone = D.lowpass(drone, 600)
    diss = np.zeros(n)
    for i, (f, start) in enumerate([(58.27, 0.5), (116.54, 1.0), (233.08, 1.6), (466.16, 2.1), (987.77, 2.5)]):
        e = np.clip((t - start) / 0.6, 0, 1)
        fb = f * 2 ** (0.4 * u / 12)
        diss += D.saw(fb * (1 + 0.003 * np.sin(2 * PI * 6 * t))) * e / (1 + 0.3 * i)
    diss = D.tv_filter(diss, lambda ff, tt: D.H_lp(300 + 3000 * (tt / d) ** 2, 2)(ff))
    trem = 1 + 0.3 * u * np.sin(2 * PI * (2 + 10 * u ** 2) * t)
    whine = D.sine(D.glide(1500, 4200, n)) * np.clip((t - 2.0) / 0.9, 0, 1) * 0.25
    rumble = sub_rumble(d, r, 70)
    env = D.env_pts(n, [(0, 0), (0.6, 0.45), (2.9, 1.0), (3.0, 0.9)])
    y = (unit(drone) * 0.55 + unit(diss) * 0.4 * trem + whine + rumble * 0.4) * env
    y = D.drive(y * 1.3, 1.4)
    y = roomify(y, 1.6, 0.25, bright=0.5)
    return finalize(y, 0.02, 0.05)


def world_slash():
    d = 2.5
    n = ns(d)
    t = tvec(n)
    r = R(208)
    snap = unit(D.highpass(D.white(n, r), 7000, 4)) * np.exp(-t / 0.006)
    click = np.zeros(n)
    click[:ns(0.0006)] = np.hanning(ns(0.0006) * 2)[ns(0.0006):] * 1.0
    chirp_n = ns(0.12)
    chirp = D.sine(D.glide(14000, 6000, chirp_n)) * np.exp(-tvec(chirp_n) / 0.04)
    chirp = np.concatenate([chirp, np.zeros(n - chirp_n)])
    ring = metal(5200, d, r, ratios=(1.0, 1.31, 1.73, 2.4), decay=0.35, tilt=0.3)
    tear = unit(D.bandpass(D.white(n, r), 3500, 1.0)) * (D.lowpass(D.white(n, r), 90) > 0.0) \
        * D.env_pts(n, [(0, 0), (0.02, 1), (0.4, 0.4), (0.8, 0)])
    rumble = sub_rumble(d, r, 60) * D.env_pts(n, [(0, 0), (0.05, 1.0), (2.5, 0)]) ** 1.5
    sub = D.sine(22 + 35 * np.exp(-t / 0.3)) * D.env_pts(n, [(0, 0), (0.03, 1), (2.4, 0)])
    y = snap * 0.6 + click * 0.5 + chirp * 0.5 + unit(ring) * 0.35 + D.lowpass(tear, 9000) * 0.25 \
        + rumble * 0.75 + sub * 0.65
    y = D.drive(y * 1.4, 1.6)
    y = roomify(y, 2.0, 0.28, bright=0.6)
    y = D.limiter(y / np.max(np.abs(y)), -2)
    return finalize(y, 0.0002, 0.35)


def shrine_activate():
    d = 4.0
    n = ns(d)
    t = tvec(n)
    r = R(209)
    y = np.zeros(n)
    for tm, f0, g in ((0.0, 62, 1.0), (0.55, 58, 0.85), (1.1, 62, 0.9), (1.42, 55, 1.0), (2.6, 50, 1.1)):
        D.place(y, taiko(f0, 1.4, r, 1.0), ns(tm), g)
    # dissonant low brass chord (C, Db, Gb, Ab)
    br = brass([65.41, 69.30, 92.50, 103.83, 130.81], 2.6, r, cut_lo=200, cut_hi=1500, swell=0.6, attack=0.25,
               release=0.6, voices=2)
    D.place(y, unit(br) * 0.8, ns(1.4))
    # bone crack
    crk_n = ns(0.3)
    crk = crackle(0.3, r, 40, lambda tt: np.exp(-tt / 0.02), 800, 5000, grain=0.004)
    crk += unit(D.bandpass(D.white(crk_n, r), 1800, 2.0)) * np.exp(-tvec(crk_n) / 0.015)
    D.place(y, D.drive(crk * 2, 2), ns(2.25), 0.6)
    rumble = sub_rumble(d, r, 80) * D.env_pts(n, [(0, 0.3), (1.4, 0.6), (2.8, 1.0), (4.0, 0)])
    y = unit(y) + rumble * 0.45
    y = D.drive(y * 1.2, 1.3)
    y = roomify(y, 2.2, 0.3, bright=0.4)
    y = D.limiter(y / np.max(np.abs(y)), -2.5)
    return finalize(y, 0.0005, 0.4)


def shrine_ambient():
    d = 6.0
    n = ns(d)
    t = tvec(n)
    r = R(210)
    q = lambda f: round(f * d) / d
    rumble = sub_rumble(d, r, 110, circular=True) * (0.75 + 0.25 * np.sin(2 * PI * t / 3.0))
    drone = D.sine(q(55.0), n) + 0.5 * D.sine(q(58.27), n) + 0.3 * D.saw(q(41.2), n)
    drone = D.lowpass(drone, 300, circular=True)
    slices = np.zeros(n)
    for i in range(7):
        s = shing(0.3, r, r.uniform(2400, 4200), r.uniform(0.05, 0.12))
        D.place(slices, s, int(r.uniform(0, n)), r.uniform(0.35, 1.0), circular=True)
    slices = D.lowpass(slices, 4500, circular=True)
    drips = crackle(d, r, 30, None, 300, 1500, grain=0.006, circular=True)
    y = rumble * 0.55 + unit(drone) * 0.35 + unit(slices) * 0.3 + drips * 0.08
    y = D.add_reverb(y, rt60=2.4, wet=0.45, circular=True, bright=0.35, seed=21)
    return finalize_loop(y)


def shrine_slash():
    d = 0.3
    r = R(211)
    y = shing(d, r, 2900, 0.1)
    y += 0.5 * thump(d, 200, 90, 0.01, 0.04)
    y = roomify(y, 0.4, 0.12)
    return finalize(y, 0.0005, 0.05)


def amplification_on():
    d = 0.7
    n = ns(d)
    t = tvec(n)
    r = R(212)
    pulse = thump(d, 75, 38, 0.06, 0.22, 0.0)
    whump = unit(D.lowpass(D.colored(n, r, -3), 280)) * D.env_pts(n, [(0, 0), (0.04, 1), (0.5, 0.1), (0.7, 0)])
    dark = D.saw(D.glide(55, 41, n)) * D.env_pts(n, [(0, 0), (0.12, 0.6), (0.7, 0)])
    y = pulse * 0.9 + whump * 0.5 + D.lowpass(dark, 400) * 0.4
    y = D.lowpass(y, 900)
    y = D.drive(y * 1.4, 1.5)
    y = roomify(y, 0.6, 0.2, bright=0.2)
    return finalize(y, 0.002, 0.08)


# =================================================================== COMBAT
def punch(d, f0, f1, tau, crunch, seed, sub=0.0):
    n = ns(d)
    t = tvec(n)
    r = R(seed)
    body = thump(d, f0, f1, 0.012, tau, 0.4, r)
    snap = unit(D.bandpass(D.white(n, r), 2200, 0.8)) * np.exp(-t / 0.012)
    cr = unit(D.bandpass(D.white(n, r), 900, 1.2)) * np.exp(-t / 0.03)
    y = body + snap * 0.35 + cr * crunch
    if sub:
        y += sub * D.sine(D.glide(70, 40, n)) * np.exp(-t / 0.12)
    y = D.drive(y * 1.5, 1.8)
    return y


def punch_light():
    y = punch(0.2, 190, 80, 0.035, 0.25, 301)
    y = roomify(y, 0.3, 0.08)
    return finalize(y, 0.0003, 0.04)


def punch_heavy():
    y = punch(0.35, 140, 48, 0.11, 0.45, 302, sub=0.5)
    y = roomify(y, 0.45, 0.12)
    return finalize(y, 0.0003, 0.06)


def combo_finisher():
    d = 0.6
    n = ns(d)
    r = R(303)
    wh = whoosh(0.2, 700, 3500, 1.4, r, [(0, 0), (0.7, 1), (1.0, 0.2)])
    y = np.zeros(n)
    D.place(y, wh, 0, 0.55)
    D.place(y, punch(0.48, 150, 42, 0.15, 0.6, 304, sub=0.8), ns(0.12), 1.0)
    y = roomify(y, 0.8, 0.2)
    return finalize(y, 0.003, 0.1)


def black_flash():
    d = 1.2
    n = ns(d)
    t = tvec(n)
    r = R(305)
    sparks = crackle(d, r, 900, lambda tt: np.exp(-tt / 0.18), 2500, 12000, grain=0.001)
    sizzle = D.fm(D.glide(2400, 900, n), 333, 6.0) * np.exp(-t / 0.12)
    zap = D.highpass(D.saw(D.glide(1200, 80, n)) * np.exp(-t / 0.08), 400)
    bass = D.sine(30 + 55 * np.exp(-t / 0.07)) * np.exp(-t / 0.45)
    crack = unit(D.highpass(D.white(n, r), 1500)) * np.exp(-t / 0.01)
    y = sparks * 0.4 + unit(sizzle) * 0.3 + unit(zap) * 0.25 + bass * 1.0 + crack * 0.5
    # brief heavy distortion at the hit
    dist_amt = 1 + 6 * np.exp(-t / 0.1)
    y = np.tanh(y * dist_amt * 1.2) / np.tanh(1.2)
    y = roomify(y, 1.1, 0.22, bright=0.6)
    y = D.limiter(y / np.max(np.abs(y)), -2)
    return finalize(y, 0.0003, 0.2)


def dodge():
    d = 0.3
    r = R(306)
    y = whoosh(d, 500, 2800, 1.3, r, [(0, 0), (0.35, 1), (1.0, 0)])
    y2 = whoosh(d, 2800, 1200, 2.0, r, [(0, 0), (0.5, 0.6), (1.0, 0)])
    y = y + 0.4 * y2
    return finalize(y, 0.002, 0.04)


def block():
    d = 0.3
    n = ns(d)
    t = tvec(n)
    r = R(307)
    th = thump(d, 160, 85, 0.015, 0.06, 0.15, r)
    muff = unit(D.lowpass(D.white(n, r), 700)) * np.exp(-t / 0.035)
    y = th + muff * 0.5
    y = D.lowpass(y, 2500)
    y = roomify(y, 0.35, 0.1)
    return finalize(y, 0.0005, 0.05)


def parry():
    d = 0.6
    n = ns(d)
    t = tvec(n)
    r = R(308)
    clang = metal(880, d, r, ratios=(1.0, 2.41, 2.98, 4.56, 6.12, 8.7), decay=0.45, beat=0.006, tilt=0.5)
    hit = unit(D.highpass(D.white(n, r), 2500)) * np.exp(-t / 0.006)
    body = thump(d, 300, 180, 0.01, 0.03)
    y = unit(clang) * 0.8 + hit * 0.45 + body * 0.3
    y = roomify(y, 0.9, 0.2, bright=0.8)
    return finalize(y, 0.0003, 0.1)


def counter():
    d = 0.5
    n = ns(d)
    r = R(309)
    y = np.zeros(n)
    D.place(y, whoosh(0.1, 1500, 5000, 1.5, r, [(0, 0), (0.8, 1), (1, 0)]), 0, 0.4)
    D.place(y, punch(0.42, 220, 55, 0.1, 0.5, 310, sub=0.6), ns(0.06))
    crack = unit(D.highpass(D.white(ns(0.05), r), 3000)) * np.exp(-tvec(ns(0.05)) / 0.006)
    D.place(y, crack, ns(0.06), 0.6)
    y = roomify(y, 0.5, 0.14)
    return finalize(y, 0.002, 0.06)


def double_jump():
    d = 0.35
    n = ns(d)
    t = tvec(n)
    r = R(311)
    puff = bp_sweep(D.colored(n, r, -2), 400, 1600, 1.2, 0.12)
    puff = unit(puff) * np.exp(-t / 0.07) * np.clip(t / 0.005, 0, 1)
    low = thump(d, 120, 60, 0.02, 0.06, 0.0)
    y = puff * 0.8 + low * 0.5
    y = roomify(y, 0.4, 0.12)
    return finalize(y, 0.001, 0.06)


def slam():
    d = 1.2
    n = ns(d)
    t = tvec(n)
    r = R(312)
    boom = D.sine(32 + 60 * np.exp(-t / 0.08)) * np.exp(-t / 0.4)
    body = unit(D.lowpass(D.colored(n, r, -2), 700)) * np.exp(-t / 0.15)
    crack = unit(D.bandpass(D.white(n, r), 1200, 0.8)) * np.exp(-t / 0.02)
    deb = debris(d, r, 700, lambda tt: np.exp(-tt / 0.3) * (tt > 0.02),
                 bands=((180, 2.0), (450, 2.5), (1100, 3.0), (2600, 4.0)))
    y = boom * 1.0 + body * 0.5 + crack * 0.4 + deb * 0.35
    y = D.drive(y * 1.6, 1.8)
    y = roomify(y, 1.0, 0.18, bright=0.4)
    y = D.limiter(y / np.max(np.abs(y)), -2)
    return finalize(y, 0.0005, 0.2)


def finisher():
    d = 1.5
    n = ns(d)
    t = tvec(n)
    r = R(313)
    crack = unit(D.highpass(D.white(n, r), 2000)) * np.exp(-t / 0.012)
    punchy = punch(d, 160, 45, 0.18, 0.6, 314)
    sub = D.sine(26 + 50 * np.exp(-t / 0.12)) * np.exp(-t / 0.6)
    sheen = metal(1200, d, r, decay=0.5) * 0.15
    y = crack * 0.45 + punchy * 0.8 + sub * 0.9 + sheen
    y = D.drive(y * 1.3, 1.5)
    y = D.add_reverb(y, rt60=2.2, wet=0.42, predelay=0.02, bright=0.5, seed=31)
    y = D.limiter(y / np.max(np.abs(y)), -2)
    return finalize(y, 0.0005, 0.35)


def rct():
    d = 1.0
    n = ns(d)
    t = tvec(n)
    r = R(315)
    chord = [523.25, 659.25, 783.99, 1046.5]
    pad = np.zeros(n)
    for i, f in enumerate(chord):
        pad += D.sine(f * (1 + 0.003 * np.sin(2 * PI * 5 * t + i)), ph0=r.random()) / (1 + 0.2 * i)
    pad *= D.env_pts(n, [(0, 0), (0.35, 1), (0.7, 0.7), (1.0, 0)])
    sparkle = np.zeros(n)
    for i in range(18):
        f = r.uniform(2500, 6500)
        L = ns(r.uniform(0.08, 0.3))
        ping = D.sine(f, L) * np.exp(-tvec(L) / (L / SR * 0.3))
        D.place(sparkle, ping, ns(r.uniform(0.05, 0.75)), r.uniform(0.2, 0.6))
    air = whoosh(d, 800, 5000, 1.5, r, [(0, 0), (0.5, 1), (1, 0)])
    y = unit(pad) * 0.6 + unit(sparkle) * 0.25 + air * 0.15
    y = roomify(y, 1.4, 0.35, bright=0.8)
    return finalize(y, 0.01, 0.12)


# =================================================================== DOMAIN
def clash():
    d = 3.0
    n = ns(d)
    t = tvec(n)
    r = R(401)
    q = lambda f: round(f * d) / d
    blue = D.saw(q(220.0), n) + D.saw(q(220.0 * 1.5), n) * 0.5
    red = D.saw(q(233.33), n) + D.pulse(q(155.67), n, 0.35) * 0.6
    tones = D.lowpass(blue * 0.6 + red * 0.6, 1800, circular=True)
    grind_mod = np.zeros(n)
    for k, a in ((7, 0.5), (11, 0.3), (19, 0.25), (29, 0.2), (41, 0.15)):
        grind_mod += a * np.sin(2 * PI * k * t / d + r.uniform(0, 6))
    grind = D.bandpass(D.white(n, r), 1300, 1.5, circular=True) * (0.6 + 0.4 * np.tanh(3 * grind_mod))
    cr = crackle(d, r, 260, None, 2500, 10000, grain=0.0012, circular=True)
    sub = D.sine(q(41.0), n) * (0.7 + 0.3 * np.sin(2 * PI * 2 * t / d))
    surge = 0.75 + 0.25 * np.sin(2 * PI * 3 * t / d)
    y = (unit(tones) * 0.5 + unit(grind) * 0.4 + cr * 0.25 + sub * 0.4) * surge
    y = D.drive(y * 1.6, 1.8)
    y = D.add_reverb(y, rt60=1.0, wet=0.2, circular=True, seed=41)
    return finalize_loop(y)


def shatter():
    d = 2.0
    n = ns(d)
    t = tvec(n)
    r = R(402)
    glass = np.zeros(n)
    for i in range(230):
        on = env_times(r, 1, lambda tt: np.exp(-tt / 0.35), 1.6)[0]
        f = r.uniform(2200, 9500)
        L = ns(r.uniform(0.03, 0.25))
        ping = (D.sine(f, L, r.random()) + 0.5 * D.sine(f * 2.37, L, r.random())) * np.exp(-tvec(L) / (L / SR * 0.25))
        D.place(glass, ping, ns(on), r.uniform(0.1, 1.0))
    burst = unit(D.highpass(D.white(n, r), 2500)) * np.exp(-t / 0.05)
    boom = D.sine(30 + 55 * np.exp(-t / 0.1)) * np.exp(-t / 0.5)
    y = unit(glass) * 0.6 + burst * 0.45 + boom * 0.8
    y = D.drive(y * 1.2, 1.3)
    y = roomify(y, 1.6, 0.3, bright=0.8)
    y = D.limiter(y / np.max(np.abs(y)), -2)
    return finalize(y, 0.0005, 0.3)


def barrier_form():
    d = 1.5
    n = ns(d)
    t = tvec(n)
    r = R(403)
    rise = whoosh(d, 300, 6000, 1.2, r, [(0, 0), (0.75, 1), (0.82, 0.3), (1.0, 0)])
    pad = np.zeros(n)
    for f in (146.83, 220.0, 293.66, 440.0):
        pad += D.saw(f * 2 ** (np.clip(t / 1.2, 0, 1) * 2 / 12) * 0.9439, ph0=r.random())
    pad = D.tv_filter(pad, lambda ff, tt: D.H_lp(300 + 3000 * np.clip(tt / 1.2, 0, 1) ** 2, 2)(ff))
    pad *= D.env_pts(n, [(0, 0), (1.15, 1.0), (1.25, 0.5), (1.5, 0)])
    lock = np.zeros(n)
    D.place(lock, thump(0.3, 200, 70, 0.01, 0.07, 0.4, r), ns(1.2))
    D.place(lock, metal(1400, 0.3, r, decay=0.12) * 0.4, ns(1.2))
    y = rise * 0.6 + unit(pad) * 0.35 + lock * 0.8
    y = roomify(y, 0.9, 0.2)
    return finalize(y, 0.005, 0.12)


def clash_win():
    d = 1.5
    n = ns(d)
    t = tvec(n)
    r = R(404)
    chord = [130.81, 196.0, 261.63, 329.63, 392.0, 523.25]
    br = brass(chord, d, r, cut_lo=300, cut_hi=4500, swell=0.35, attack=0.12, release=0.5, voices=2)
    boom = thump(d, 90, 32, 0.05, 0.5, 0.2, r)
    sh = np.zeros(n)
    for i in range(24):
        f = r.uniform(2500, 7500)
        L = ns(r.uniform(0.1, 0.5))
        D.place(sh, D.sine(f, L) * np.exp(-tvec(L) / (L / SR * 0.3)), ns(r.uniform(0.1, 1.2)), r.uniform(0.2, 0.6))
    riser = whoosh(d, 400, 4000, 1.0, r, [(0, 0.2), (0.2, 1.0), (1.0, 0)])
    y = unit(br) * 0.7 + boom * 0.6 + unit(sh) * 0.2 + riser * 0.25
    y = D.drive(y * 1.2, 1.3)
    y = roomify(y, 1.5, 0.3, bright=0.7)
    return finalize(y, 0.003, 0.2)


# ======================================================================= UI
def ping(f, d, r, tau=0.12, tri_mix=0.4):
    n = ns(d)
    t = tvec(n)
    y = (D.sine(f, n) * (1 - tri_mix) + D.tri(f, n) * tri_mix * 0.6 + 0.25 * D.sine(2 * f, n)) * np.exp(-t / tau)
    return y * np.clip(t / 0.002, 0, 1)


def qte_prompt():
    d = 0.4
    n = ns(d)
    r = R(501)
    y = np.zeros(n)
    D.place(y, ping(1318.5, 0.25, r, 0.06), 0)
    D.place(y, ping(1760.0, 0.3, r, 0.09), ns(0.09))
    y = roomify(y, 0.4, 0.15, bright=0.8)
    return finalize(y, 0.001, 0.05)


def qte_success():
    d = 0.6
    n = ns(d)
    r = R(502)
    y = np.zeros(n)
    for i, f in enumerate((1046.5, 1318.5, 1568.0, 2093.0)):
        D.place(y, bell(f, d - 0.05 * i, r, ratio=2.0, index0=1.2, tau=0.35), ns(0.05 * i), 1 / (1 + 0.15 * i))
    y = roomify(y, 0.8, 0.25, bright=0.9)
    return finalize(y, 0.001, 0.1)


def qte_fail():
    d = 0.6
    n = ns(d)
    t = tvec(n)
    r = R(503)
    f = D.glide(116, 92, n)
    buzz = D.pulse(f, duty=0.4) * 0.6 + D.saw(f * 1.006) * 0.4
    buzz = D.lowpass(buzz, 1200) * (0.8 + 0.2 * np.sin(2 * PI * 18 * t))
    buzz *= D.env_pts(n, [(0, 0), (0.01, 1), (0.4, 0.7), (0.6, 0)])
    y = D.drive(buzz * 1.5, 1.4)
    return finalize(y, 0.002, 0.05)


def select():
    d = 0.5
    n = ns(d)
    r = R(504)
    wh = whoosh(0.3, 900, 4500, 1.4, r, [(0, 0), (0.6, 1), (1, 0)])
    y = np.zeros(n)
    D.place(y, wh, 0, 0.5)
    D.place(y, bell(1318.5, 0.42, r, ratio=2.0, index0=1.5, tau=0.25), ns(0.08), 0.8)
    y = roomify(y, 0.7, 0.25, bright=0.9)
    return finalize(y, 0.002, 0.08)


def level_up():
    d = 1.0
    n = ns(d)
    r = R(505)
    y = np.zeros(n)
    notes = (523.25, 659.25, 783.99, 1046.5, 1318.5)
    for i, f in enumerate(notes):
        D.place(y, bell(f, d - 0.11 * i, r, ratio=2.0, index0=1.4, tau=0.3 + 0.08 * i), ns(0.11 * i), 0.9)
    sh = np.zeros(n)
    for i in range(14):
        L = ns(0.2)
        D.place(sh, D.sine(r.uniform(3000, 7000), L) * np.exp(-tvec(L) / 0.05), ns(r.uniform(0.45, 0.85)), 0.3)
    y = unit(y) + unit(sh) * 0.15
    y = roomify(y, 1.0, 0.3, bright=0.9)
    return finalize(y, 0.001, 0.12)


def cinematic_hit():
    d = 1.5
    n = ns(d)
    t = tvec(n)
    r = R(506)
    boom = D.sine(28 + 55 * np.exp(-t / 0.1)) * np.exp(-t / 0.7)
    body = unit(D.lowpass(D.colored(n, r, -2), 1500)) * np.exp(-t / 0.2)
    crack = unit(D.highpass(D.white(n, r), 2500)) * np.exp(-t / 0.01)
    sheen = unit(metal(700, d, r, decay=0.6)) * 0.25
    y = boom + body * 0.5 + crack * 0.4 + sheen
    y = D.drive(y * 1.4, 1.6)
    y = D.add_reverb(y, rt60=2.4, wet=0.45, predelay=0.02, bright=0.5, seed=61)
    y = D.limiter(y / np.max(np.abs(y)), -2)
    return finalize(y, 0.0005, 0.35)


SOUNDS = {
    "gojo/infinity_on": (infinity_on, False), "gojo/infinity_off": (infinity_off, False),
    "gojo/infinity_block": (infinity_block, False), "gojo/blue_cast": (blue_cast, False),
    "gojo/blue_loop": (blue_loop, True), "gojo/red_charge": (red_charge, False),
    "gojo/red_fire": (red_fire, False), "gojo/red_impact": (red_impact, False),
    "gojo/purple_charge": (purple_charge, False), "gojo/purple_fire": (purple_fire, False),
    "gojo/blink": (blink, False), "gojo/void_activate": (void_activate, False),
    "gojo/void_ambient": (void_ambient, True),
    "sukuna/dismantle": (dismantle, False), "sukuna/dismantle_barrage": (dismantle_barrage, False),
    "sukuna/cleave": (cleave, False), "sukuna/fuga_charge": (fuga_charge, False),
    "sukuna/fuga_fire": (fuga_fire, False), "sukuna/fuga_explode": (fuga_explode, False),
    "sukuna/world_slash_charge": (world_slash_charge, False), "sukuna/world_slash": (world_slash, False),
    "sukuna/shrine_activate": (shrine_activate, False), "sukuna/shrine_ambient": (shrine_ambient, True),
    "sukuna/shrine_slash": (shrine_slash, False), "sukuna/amplification_on": (amplification_on, False),
    "combat/punch_light": (punch_light, False), "combat/punch_heavy": (punch_heavy, False),
    "combat/combo_finisher": (combo_finisher, False), "combat/black_flash": (black_flash, False),
    "combat/dodge": (dodge, False), "combat/block": (block, False), "combat/parry": (parry, False),
    "combat/counter": (counter, False), "combat/double_jump": (double_jump, False),
    "combat/slam": (slam, False), "combat/finisher": (finisher, False), "combat/rct": (rct, False),
    "domain/clash": (clash, True), "domain/shatter": (shatter, False),
    "domain/barrier_form": (barrier_form, False), "domain/clash_win": (clash_win, False),
    "ui/qte_prompt": (qte_prompt, False), "ui/qte_success": (qte_success, False),
    "ui/qte_fail": (qte_fail, False), "ui/select": (select, False), "ui/level_up": (level_up, False),
    "ui/cinematic_hit": (cinematic_hit, False),
}


HUGE, HEAVY, MED, UI, LOOP = -9.5, -11.0, -13.0, -14.5, -14.0
TARGETS = {
    "gojo/red_impact": HUGE, "gojo/purple_fire": HUGE, "sukuna/fuga_explode": HUGE, "sukuna/world_slash": HUGE,
    "combat/slam": HUGE, "combat/finisher": HUGE, "ui/cinematic_hit": HUGE, "domain/shatter": HUGE,
    "combat/black_flash": HUGE, "sukuna/shrine_activate": HUGE, "gojo/void_activate": HUGE,
    "combat/punch_heavy": HEAVY, "combat/combo_finisher": HEAVY, "combat/counter": HEAVY, "sukuna/cleave": HEAVY,
    "gojo/red_fire": HEAVY, "sukuna/fuga_fire": HEAVY, "combat/parry": HEAVY, "gojo/blue_cast": HEAVY,
    "domain/clash_win": HEAVY, "gojo/purple_charge": HEAVY, "sukuna/world_slash_charge": HEAVY,
    "sukuna/fuga_charge": HEAVY, "gojo/red_charge": HEAVY, "sukuna/dismantle_barrage": HEAVY,
    "combat/punch_light": MED, "sukuna/dismantle": MED - 1.0, "sukuna/shrine_slash": MED, "combat/block": MED,
    "combat/dodge": MED, "combat/double_jump": MED, "gojo/blink": MED, "gojo/infinity_block": MED,
    "sukuna/amplification_on": MED, "domain/barrier_form": MED, "combat/rct": MED, "gojo/infinity_on": MED,
    "gojo/infinity_off": MED,
    "ui/qte_prompt": UI, "ui/qte_success": UI, "ui/qte_fail": UI, "ui/select": UI, "ui/level_up": UI,
    "gojo/blue_loop": LOOP, "gojo/void_ambient": LOOP, "sukuna/shrine_ambient": LOOP, "domain/clash": LOOP,
}


def punchify(x, fc=120.0, sat=2.2, low_mix=0.7):
    """Saturate the sub band (harmonics carry the weight on small speakers) and lower its peaks."""
    low = D.lowpass(x, fc, 2)
    high = x - low
    pk = np.max(np.abs(low)) + 1e-9
    low_s = D.drive(low / pk, sat) * pk * low_mix
    return high + low_s


PUNCHIFY = {"gojo/red_impact", "gojo/purple_fire", "sukuna/fuga_explode", "sukuna/world_slash", "combat/slam",
            "combat/finisher", "ui/cinematic_hit", "domain/shatter", "combat/black_flash", "gojo/void_activate",
            "combat/punch_heavy", "combat/combo_finisher", "combat/counter", "gojo/red_fire", "sukuna/fuga_fire",
            "gojo/blue_cast", "combat/punch_light", "combat/block", "sukuna/amplification_on"}


def main(only=None):
    for name, (fn, loop) in SOUNDS.items():
        if only and not any(o in name for o in only):
            continue
        x = fn()
        if name in PUNCHIFY:
            x = punchify(x)
            x = D.fade(x, 0.0, 0.02)
        sat = not loop and not name.startswith("ui/q") and name not in ("ui/select", "ui/level_up")
        x = D.loudness_to(x, TARGETS[name], ceiling_db=-1.5, circular=loop, saturate=sat,
                          max_total=11.0 if TARGETS[name] <= HUGE else 8.0)
        # residual DC cleanup (only if needed; loudness_to already high-passes after saturation)
        if abs(np.mean(x)) > 4e-4:
            x = D.highpass(x, 15, 2, circular=loop)
            if np.max(np.abs(x)) > D.db(-1.5):
                x = D.normalize(x, -1.5)
        if loop:
            x = x - np.mean(x)
        else:
            x = D.fade(x, 0.001, 0.01)
        path, peak = D.write_ogg_checked(x, SND / f"{name}.ogg", peak_db=-1.0)
        print(f"{name:32s} {len(x) / SR:6.2f}s  peak {peak:6.2f} dBFS  Mmax {D.momentary_max(x):6.1f}")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
