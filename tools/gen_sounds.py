#!/usr/bin/env python3
"""Procedural sound effects for the Julius Juukulius mod.

Every sound in the mod is synthesized here from plain math with numpy:
oscillators, filtered noise, additive inharmonic bells, formant "choir" voices,
granular crackles/bubbles/debris and a synthetic convolution reverb. Nothing is
sampled or copied from existing audio.

Each sound has its own fixed RNG seed, so re-running the script reproduces the
same audio; ffmpeg's bitexact flags additionally make the .ogg files
byte-identical between runs.

Usage:
    python3 -I tools/gen_sounds.py [--only NAME[,NAME...]] [--wav-dir DIR] [--no-verify]

Writes mono 44.1 kHz Ogg Vorbis files to
src/main/resources/assets/julius_juukulius/sounds/ and the matching sounds.json.
"""

import argparse
import json
import os
import subprocess
import sys
import time
import wave
import zlib

import numpy as np

SR = 44100
TAU = 2.0 * np.pi
GLOBAL_SEED = 0x4A554C49  # "JULI"

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(REPO, "src", "main", "resources", "assets", "julius_juukulius")
SOUNDS_DIR = os.path.join(ASSETS, "sounds")
SOUNDS_JSON = os.path.join(ASSETS, "sounds.json")
DEFAULT_WAV_DIR = "/tmp/claude-0/-home-user-code/9163ad26-0088-5c31-841c-ea92ea592bcb/scratchpad/sfx_wav"
NAMESPACE = "julius_juukulius"

FFMPEG = "/usr/bin/ffmpeg" if os.path.exists("/usr/bin/ffmpeg") else "ffmpeg"
FFPROBE = "/usr/bin/ffprobe" if os.path.exists("/usr/bin/ffprobe") else "ffprobe"

PEAK_DB = -1.0  # target peak of every file (dBFS)


# =============================================================================
# Basic helpers
# =============================================================================

def ns(sec):
    """Seconds -> samples."""
    return int(round(sec * SR))


def undb(d):
    return 10.0 ** (d / 20.0)


def todb(x):
    return 20.0 * np.log10(max(float(x), 1e-12))


def peak(x):
    return float(np.max(np.abs(x))) if len(x) else 0.0


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def norm(x, level=1.0):
    """Scale to a given peak."""
    p = peak(x)
    return x * (level / p) if p > 0 else x


def add(dst, src, at=0.0, gain=1.0):
    """Mix src into dst starting at time `at` (s); anything past the end is dropped."""
    i = ns(at)
    if i < 0:
        src = src[-i:]
        i = 0
    if i >= len(dst):
        return dst
    m = min(len(src), len(dst) - i)
    dst[i:i + m] += gain * src[:m]
    return dst


def phase_of(freq, n=None):
    """Running phase (radians) of an oscillator with (possibly time-varying) frequency."""
    f = np.asarray(freq, dtype=float)
    if f.ndim == 0:
        f = np.full(n, float(f))
    return TAU * np.concatenate(([0.0], np.cumsum(f[:-1]))) / SR


def sat(x, drive=1.5):
    """Soft saturation (tanh) of a peak-normalized copy; adds harmonics to low booms."""
    p = peak(x)
    if p == 0:
        return x
    return np.tanh(drive * x / p) / np.tanh(drive)


# ---- musical helpers ---------------------------------------------------------

def note(name):
    """'A4', 'C#6', 'Eb3' -> Hz (12-TET, A4 = 440 Hz)."""
    pc = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[name[0]]
    i = 1
    while name[i] in "#b":
        pc += 1 if name[i] == "#" else -1
        i += 1
    midi = 12 * (int(name[i:]) + 1) + pc
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def notes(*names):
    return [note(nm) for nm in names]


PENTA = (0, 2, 4, 7, 9)


def scale(root, steps, lo, hi):
    """All frequencies of a scale (root in Hz, semitone steps) inside [lo, hi]."""
    out = []
    for octv in range(-6, 8):
        for s in steps:
            f = root * 2.0 ** (octv + s / 12.0)
            if lo <= f <= hi:
                out.append(f)
    return sorted(out)


def pick_near(rng, freqs, center, spread_oct=0.35):
    """Pick a frequency from `freqs`, preferring those near `center` (log distance)."""
    fr = np.asarray(freqs)
    w = np.exp(-0.5 * (np.log2(fr / center) / spread_oct) ** 2) + 1e-6
    return float(rng.choice(fr, p=w / w.sum()))


# =============================================================================
# Envelopes & control curves
# =============================================================================

def _ease(u, s):
    if s == "lin":
        return u
    if s == "smooth":
        return u * u * (3.0 - 2.0 * u)
    if s == "in":
        return u * u
    if s == "out":
        return 1.0 - (1.0 - u) ** 2
    if s == "in3":
        return u ** 3
    if s == "out3":
        return 1.0 - (1.0 - u) ** 3
    return u ** float(s)


def curve(n, pts, shape="smooth", log=False):
    """Piecewise control curve sampled at n points.

    pts: [(t, value) or (t, value, shape)], shape (of the segment ending at that
    point) is 'lin', 'smooth', 'in', 'out', 'in3', 'out3' or a power. With log=True
    values are interpolated geometrically (for frequencies)."""
    ts = np.array([p[0] for p in pts], dtype=float)
    vs = np.array([float(p[1]) for p in pts])
    if log:
        vs = np.log(vs)
    if len(pts) == 1:
        out = np.full(n, vs[0])
        return np.exp(out) if log else out
    shapes = [p[2] if len(p) > 2 else shape for p in pts]
    t = np.arange(n) / SR
    seg = np.clip(np.searchsorted(ts, t, side="right") - 1, 0, len(ts) - 2)
    t0, t1 = ts[seg], ts[seg + 1]
    u = np.clip((t - t0) / np.maximum(t1 - t0, 1e-9), 0.0, 1.0)
    w = np.empty_like(u)
    for s_i in range(len(ts) - 1):
        m = seg == s_i
        if m.any():
            w[m] = _ease(u[m], shapes[s_i + 1])
    out = vs[seg] + (vs[seg + 1] - vs[seg]) * w
    return np.exp(out) if log else out


def attack_ramp(m, sec):
    r = np.ones(m)
    k = ns(sec)
    if k > 0:
        k2 = min(k, m)
        r[:k2] = np.sin(0.5 * np.pi * np.arange(k2) / k) ** 2
    return r


def release_ramp(m, sec):
    r = np.ones(m)
    k = min(ns(sec), m)
    if k > 0:
        r[m - k:] = np.cos(0.5 * np.pi * (np.arange(k) + 1) / k) ** 2
    return r


def perc(n, attack, tau, t0=0.0):
    """Percussive envelope: smooth attack then exponential decay, starting at t0."""
    t = np.arange(n) / SR - t0
    out = np.zeros(n)
    on = t >= 0
    ta = t[on]
    a = np.sin(0.5 * np.pi * np.clip(ta / attack, 0.0, 1.0)) ** 2 if attack > 0 else 1.0
    out[on] = a * np.exp(-np.maximum(ta - attack, 0.0) / tau)
    return out


def adsr(n, a, d, s, r, gate, attack_shape="smooth"):
    """Classic ADSR; `gate` is the release start (s)."""
    return curve(n, [(0.0, 0.0), (a, 1.0, attack_shape), (a + d, s, "out"),
                     (max(gate, a + d), s, "lin"), (max(gate, a + d) + r, 0.0, "out")])


# =============================================================================
# Noise sources
# =============================================================================

def white(n, rng):
    return rng.standard_normal(n)


def tilt_noise(n, rng, slope_db_oct):
    """Noise with a spectral slope (dB/octave), unit std, sub-45 Hz removed."""
    m = n + 4096
    X = np.fft.rfft(rng.standard_normal(m))
    f = np.fft.rfftfreq(m, 1.0 / SR)
    f[0] = 1.0
    X *= (f / 1000.0) ** (slope_db_oct / 6.0206) / np.sqrt(1.0 + (45.0 / f) ** 8)
    y = np.fft.irfft(X, m)[:n]
    return y / (np.std(y) + 1e-12)


def pink(n, rng):
    return tilt_noise(n, rng, -3.0)


def brown(n, rng):
    return tilt_noise(n, rng, -6.0)


def smooth_noise(n, rng, rate):
    """Zero-mean, unit-std random modulation band-limited to ~`rate` Hz."""
    m = n + ns(0.5)
    X = np.fft.rfft(rng.standard_normal(m))
    f = np.fft.rfftfreq(m, 1.0 / SR)
    X /= np.sqrt(1.0 + (f / rate) ** 4)
    y = np.fft.irfft(X, m)[:n]
    return y / (np.std(y) + 1e-12)


# =============================================================================
# Filters
# =============================================================================

def bq_coefs(kind, fc, q=0.70710678):
    """RBJ audio-EQ-cookbook low/high-pass biquad coefficients (b0, b1, b2, a1, a2)."""
    fc = min(max(fc, 5.0), 0.49 * SR)
    w0 = TAU * fc / SR
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2.0 * q)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
    else:
        raise ValueError(kind)
    a = [1 + al, -2 * cw, 1 - al]
    return b[0] / a[0], b[1] / a[0], b[2] / a[0], a[1] / a[0], a[2] / a[0]


def biquad(x, kind, fc, q=0.70710678):
    """Causal biquad (transposed direct form II)."""
    b0, b1, b2, a1, a2 = bq_coefs(kind, fc, q)
    out = [0.0] * len(x)
    z1 = z2 = 0.0
    for i, xi in enumerate(np.asarray(x, dtype=float).tolist()):
        yi = b0 * xi + z1
        z1 = b1 * xi - a1 * yi + z2
        z2 = b2 * xi - a2 * yi
        out[i] = yi
    return np.array(out)


_BUTTER4_Q = (0.54119610, 1.30656296)


def hpf(x, fc, order=2):
    if order == 2:
        return biquad(x, "hp", fc)
    for q in _BUTTER4_Q:
        x = biquad(x, "hp", fc, q)
    return x


def lpf(x, fc, order=2):
    if order == 2:
        return biquad(x, "lp", fc)
    for q in _BUTTER4_Q:
        x = biquad(x, "lp", fc, q)
    return x


def svf(x, fc, q=0.707, mode="bp"):
    """Zero-delay-feedback state-variable filter with per-sample cutoff/Q.

    mode 'bp' is normalized to unity gain at the centre frequency."""
    n = len(x)
    fc = np.clip(np.broadcast_to(np.asarray(fc, dtype=float), (n,)), 10.0, 0.45 * SR)
    k = 1.0 / np.broadcast_to(np.asarray(q, dtype=float), (n,))
    g = np.tan(np.pi * fc / SR)
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    lp = [0.0] * n
    bp = [0.0] * n
    ic1 = ic2 = 0.0
    for i, (xi, c1, c2, c3) in enumerate(zip(np.asarray(x, dtype=float).tolist(),
                                             a1.tolist(), a2.tolist(), a3.tolist())):
        v3 = xi - ic2
        v1 = c1 * ic1 + c2 * v3
        v2 = ic2 + c2 * ic1 + c3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        bp[i] = v1
        lp[i] = v2
    lp = np.array(lp)
    bp = np.array(bp)
    if mode == "lp":
        return lp
    if mode == "bp":
        return bp * k
    if mode == "hp":
        return np.asarray(x) - k * bp - lp
    raise ValueError(mode)


def fft_filter(x, resp):
    """Zero-phase filtering with an arbitrary magnitude response resp(f_hz)."""
    n = len(x)
    pad = min(max(n // 2, 4096), ns(0.5))
    N = ((n + pad + 1023) // 1024) * 1024
    X = np.fft.rfft(x, N)
    f = np.fft.rfftfreq(N, 1.0 / SR)
    return np.fft.irfft(X * resp(f), N)[:n]


def bw_lp(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))


def bw_hp(f, fc, order=2):
    return 1.0 / np.sqrt(1.0 + (fc / np.maximum(f, 1e-3)) ** (2 * order))


def band(x, lo, hi, order=2):
    return fft_filter(x, lambda f: bw_hp(f, lo, order) * bw_lp(f, hi, order))


def lp_fft(x, fc, order=2):
    return fft_filter(x, lambda f: bw_lp(f, fc, order))


def hp_fft(x, fc, order=2):
    return fft_filter(x, lambda f: bw_hp(f, fc, order))


def mod_delay(x, delay_s):
    """Read x through a (time-varying) fractional delay line."""
    n = len(x)
    pos = np.arange(n) - np.asarray(delay_s) * SR
    return np.interp(pos, np.arange(n), x, left=0.0, right=0.0)


def flanger(x, rate=0.5, d0=0.002, depth=0.0015, mix=0.6, phase0=0.0):
    t = np.arange(len(x)) / SR
    d = d0 + depth * np.sin(TAU * rate * t + phase0)
    return (x + mix * mod_delay(x, d)) / (1.0 + mix)


# =============================================================================
# Reverb (convolution with a synthetic, exponentially decaying noise impulse)
# =============================================================================

def convolve(x, h):
    n = len(x) + len(h) - 1
    N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(h, N), N)[:n]


def make_ir(seed, rt60=1.0, hf=0.4, predelay=0.01, length=None, early=7, er_level=0.35):
    """Synthetic room impulse: noise split in octave bands, each decaying with its
    own RT60 (high bands decay faster: rt60 * hf at 16 kHz), plus a few early
    reflections. Normalized to unit energy."""
    rng = np.random.default_rng(seed)
    length = length or min(max(rt60 * 1.15, 0.3), 3.0)
    n = ns(length)
    t = np.arange(n) / SR
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1.0 / SR)
    lf = np.log2(np.maximum(f, 20.0))
    centers = np.log2([125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0])
    tail = np.zeros(n)
    for i, c in enumerate(centers):
        w = np.clip(1.0 - np.abs(lf - c), 0.0, 1.0)
        if i == 0:
            w[lf <= c] = 1.0
        if i == len(centers) - 1:
            w[lf >= c] = 1.0
        rt = rt60 * (1.0 + (hf - 1.0) * i / (len(centers) - 1))
        tail += np.fft.irfft(X * w, n) * np.exp(-6.9078 * t / rt)
    tail *= 1.0 - np.exp(-t / 0.006)  # diffuse build-up instead of a hard onset
    tail /= np.sqrt(np.sum(tail ** 2))
    er = np.zeros(n)
    for _ in range(early):
        d = rng.uniform(0.003, 0.04)
        er[ns(d)] += rng.choice([-1.0, 1.0]) * rng.uniform(0.4, 1.0) * np.exp(-d / 0.03)
    er = lp_fft(er, 6000.0, 1)
    er *= er_level / (np.sqrt(np.sum(er ** 2)) + 1e-12)
    ir = np.concatenate([np.zeros(ns(predelay)), tail + er])
    return ir / np.sqrt(np.sum(ir ** 2))


_IR_PRESETS = {
    "room": dict(rt60=0.35, hf=0.45, predelay=0.003),
    "small": dict(rt60=0.6, hf=0.4, predelay=0.006),
    "hall": dict(rt60=1.2, hf=0.35, predelay=0.012),
    "bright": dict(rt60=1.0, hf=0.65, predelay=0.01),
    "big": dict(rt60=1.8, hf=0.4, predelay=0.018),
    "dark": dict(rt60=0.9, hf=0.22, predelay=0.012),
}
_IR_CACHE = {}


def ir(name):
    if name not in _IR_CACHE:
        _IR_CACHE[name] = make_ir(zlib.crc32(("ir:" + name).encode()) ^ GLOBAL_SEED, **_IR_PRESETS[name])
    return _IR_CACHE[name]


def reverb(x, preset="room", wet=0.2, dry=1.0):
    """Mix in a convolution reverb; the tail is kept inside the buffer length."""
    return dry * x + wet * convolve(x, ir(preset))[:len(x)]


# =============================================================================
# Tonal building blocks
# =============================================================================

def add_partial(dst, t0, f, tau, amp, rng, attack=0.001, twin=0.0, beat=5.0,
                glide_cents=0.0, glide_tau=0.15, prompt=0.0):
    """Add one exponentially decaying sine partial (optionally with a detuned twin
    for a slow shimmer, and an optional pitch glide in cents). `prompt` is the share
    of the amplitude that dies away quickly after the strike (two-stage bell decay)."""
    n = len(dst)
    i0 = ns(t0)
    if i0 >= n or f >= 0.46 * SR or amp == 0:
        return
    m = min(n - i0, ns(tau * 8.0) + 1)
    t = np.arange(m) / SR
    env = np.exp(-t / tau)
    if prompt:
        env = (1.0 - prompt) * env + prompt * np.exp(-t / min(0.03, 0.25 * tau))
    env *= amp * attack_ramp(m, attack)
    if glide_cents:
        ph = phase_of(f * 2.0 ** (glide_cents / 1200.0 * (1.0 - np.exp(-t / glide_tau))))
    else:
        ph = TAU * f * t
    s = np.sin(ph + rng.uniform(0, TAU))
    if twin:
        s = (s + twin * np.sin(ph * (1.0 + beat / f) + rng.uniform(0, TAU))) / (1.0 + twin)
    dst[i0:i0 + m] += env * s


# (ratio, relative amplitude, relative decay time)
CELESTA = [(1.0, 1.0, 1.0), (2.0, 0.22, 0.5), (3.0, 0.06, 0.35), (4.0, 0.05, 0.25), (5.43, 0.035, 0.08)]
GLASS = [(1.0, 1.0, 1.0), (2.01, 0.28, 0.6), (2.76, 0.10, 0.25), (4.03, 0.07, 0.3), (5.40, 0.035, 0.12)]
CRYSTAL = [(1.0, 1.0, 1.0), (2.0, 0.12, 0.45), (2.76, 0.07, 0.18), (4.07, 0.035, 0.12)]
SOFT_BELL = [(1.0, 1.0, 1.0), (2.0, 0.16, 0.55), (3.0, 0.04, 0.4), (4.1, 0.02, 0.2)]
SELECT_BELL = [(1.0, 1.0, 1.0), (2.0, 0.25, 0.6), (3.0, 0.08, 0.4), (4.2, 0.05, 0.2)]
DARK_BELL = [(0.5, 0.3, 1.3), (1.0, 1.0, 1.0), (1.19, 0.35, 0.8), (1.5, 0.22, 0.6),
             (2.0, 0.35, 0.5), (2.51, 0.12, 0.3), (3.01, 0.08, 0.25)]


def add_strike(dst, t0, fc, amp, rng, tau=0.0025, q=0.9):
    """Short band-passed noise tick: the mallet/strike transient of a bell or bar."""
    n = len(dst)
    i0 = ns(t0)
    m = min(n - i0, ns(tau * 8.0) + 1)
    if i0 >= n or m < 16 or amp == 0:
        return
    b = svf(rng.standard_normal(m + 64), min(fc, 0.4 * SR), q, "bp")[64:]
    b *= 0.33 / (np.std(b) + 1e-12)
    dst[i0:i0 + m] += amp * b * perc(m, 0.0003, tau)


def add_bell(dst, t0, f0, tau, amp, rng, partials=GLASS, attack=0.0015, twin=0.5,
             beat=(1.5, 4.0), glide_cents=0.0, glide_tau=0.15, bright=1.0, strike=0.0, prompt=0.0):
    """Additive bell: each partial decays at its own rate; `bright` tilts the upper partials,
    `strike` adds a mallet tick (relative level), `prompt` a fast initial decay stage."""
    if strike:
        add_strike(dst, t0, min(f0 * 3.0, 9000.0), amp * strike, rng)
    for ratio, a, rt in partials:
        f = f0 * ratio
        if f > 0.42 * SR:
            continue
        g = a * (bright ** np.log2(ratio) if ratio > 1.0 else 1.0)
        add_partial(dst, t0, f, tau * rt, amp * g, rng, attack, twin,
                    rng.uniform(*beat) * np.sqrt(ratio), glide_cents, glide_tau, prompt)


def saw_voice(n, freq, cutoff, rng, q=0.75):
    """Band-limited sawtooth (additive) through a 2-pole low-pass applied per
    harmonic, so the (time-varying) filter needs no recursion and never aliases."""
    f = np.asarray(freq, dtype=float)
    f = np.full(n, float(f)) if f.ndim == 0 else f
    c = np.asarray(cutoff, dtype=float)
    c = np.full(n, float(c)) if c.ndim == 0 else c
    ph = phase_of(f) + rng.uniform(0, TAU)
    kmax = max(1, int(min(0.45 * SR / f.max(), 7.0 * c.max() / f.min())))
    out = np.zeros(n)
    for k in range(1, kmax + 1):
        r = k * f / c
        g = 1.0 / np.sqrt((1.0 - r * r) ** 2 + (r / q) ** 2)
        out += (g / k) * np.sin(k * ph)
    return out * (2.0 / np.pi)


def pad(n, freqs, cutoff, rng, detune=7.0, voices=3, q=0.75, drift=3.0):
    """Detuned-saw pad: `voices` saws per note spread over +-detune cents with slow drift."""
    out = np.zeros(n)
    for f0 in freqs:
        for v in range(voices):
            c = 0.0 if voices == 1 else detune * (2.0 * v / (voices - 1) - 1.0)
            cents = c + rng.uniform(-1.5, 1.5) + drift * smooth_noise(n, rng, 0.8) * 0.5
            out += saw_voice(n, np.asarray(f0) * 2.0 ** (cents / 1200.0), cutoff, rng, q)
    return out


def tone_stack(n, freq, rng, amps=(1.0, 0.3, 0.12), bright=None):
    """Sine plus a few harmonics; `bright` (array/scalar) scales the harmonics."""
    ph = phase_of(freq, n) + rng.uniform(0, TAU)
    out = np.zeros(n)
    for k, a in enumerate(amps, start=1):
        g = a if (k == 1 or bright is None) else a * bright ** (k - 1)
        out += g * np.sin(k * ph + (rng.uniform(0, TAU) if k > 1 else 0.0))
    return out


# "ah" vowel formants (Hz, bandwidth, gain) for the choir pads
AH_HIGH = [(800, 160, 1.0), (1150, 180, 0.5), (2900, 220, 0.22), (3900, 260, 0.1), (4950, 300, 0.04)]
AH_LOW = [(650, 150, 1.0), (1080, 170, 0.55), (2650, 200, 0.22), (2900, 220, 0.15), (3300, 250, 0.08)]


def formant_mag(f, formants, floor=0.04):
    g = np.full(np.shape(f), floor, dtype=float)
    for F, B, a in formants:
        g = g + a / (1.0 + ((f - F) / (0.5 * B)) ** 2)
    return g


def choir_voice(n, f0, rng, formants, vib_cents=16.0, tilt=0.8, fmax=6000.0):
    """One sung 'ah': harmonic source shaped by vowel formants, delayed vibrato, drift."""
    t = np.arange(n) / SR
    vr = rng.uniform(4.8, 5.9)
    vib = vib_cents * np.sin(TAU * vr * t + rng.uniform(0, TAU)) * (1.0 - np.exp(-t / 0.5))
    drift = 4.0 * smooth_noise(n, rng, 1.2)
    f = np.asarray(f0, dtype=float) * 2.0 ** ((vib + drift) / 1200.0)
    f = np.full(n, float(f)) if f.ndim == 0 else f
    ph = phase_of(f) + rng.uniform(0, TAU)
    kmax = max(1, int(min(fmax, 0.45 * SR) / f.max()))
    tl = np.asarray(tilt, dtype=float)
    out = np.zeros(n)
    for k in range(1, kmax + 1):
        out += formant_mag(k * f, formants) * k ** (-tl) * np.sin(k * ph)
    return out


def choir(n, lines, rng, formants=AH_HIGH, voices=3, detune=9.0, vib_cents=16.0, tilt=0.8,
          breath_db=-30.0):
    """Small ensemble: every line (scalar Hz or per-sample pitch array) is sung by
    `voices` slightly detuned singers; a whisper of formant-filtered breath noise."""
    out = np.zeros(n)
    for f0 in lines:
        for v in range(voices):
            cents = detune * (2.0 * v / max(voices - 1, 1) - 1.0) + rng.uniform(-2.0, 2.0)
            out += choir_voice(n, np.asarray(f0) * 2.0 ** (cents / 1200.0), rng, formants,
                               vib_cents, tilt)
    out = norm(out)
    if breath_db is not None:
        b = fft_filter(white(n, rng), lambda f: formant_mag(f, formants, 0.0) * bw_hp(f, 400.0))
        out = out + undb(breath_db) * norm(b)
    return out


# =============================================================================
# Granular textures: sparkles, glitter, crackle, bubbles, debris
# =============================================================================

def event_times(rng, rate_pts, t0, t1):
    """Poisson event times in [t0, t1) with a piecewise-linear rate (events / s)."""
    rmax = max(p[1] for p in rate_pts)
    if rmax <= 0:
        return np.array([])
    xs = [p[0] for p in rate_pts]
    ys = [p[1] for p in rate_pts]
    out = []
    t = t0
    while True:
        t += rng.exponential(1.0 / rmax)
        if t >= t1:
            break
        if rng.random() < np.interp(t, xs, ys) / rmax:
            out.append(t)
    return np.array(out)


def sparkles(n, rng, rate_pts, freqs, center_pts=None, tau=(0.03, 0.07), amp_pts=None,
             spread_oct=0.4, t_range=None):
    """Musical sparkle pings (sines with a detuned twin) quantized to `freqs`.
    center_pts moves the preferred pitch over time (rising/falling sparkles)."""
    out = np.zeros(n)
    t_lo, t_hi = t_range or (0.0, n / SR)
    for t0 in event_times(rng, rate_pts, t_lo, t_hi):
        if center_pts:
            c = float(np.exp(np.interp(t0, [p[0] for p in center_pts], np.log([p[1] for p in center_pts]))))
            f = pick_near(rng, freqs, c, spread_oct)
        else:
            f = float(rng.choice(freqs))
        a = rng.uniform(0.35, 1.0)
        if amp_pts:
            a *= float(np.interp(t0, [p[0] for p in amp_pts], [p[1] for p in amp_pts]))
        add_partial(out, t0, f * 2.0 ** (rng.uniform(-6, 6) / 1200.0), rng.uniform(*tau), a, rng,
                    attack=0.0015, twin=0.5, beat=rng.uniform(4.0, 9.0))
    return out


def glitter(n, rng, rate_pts, lo=5000.0, hi=10000.0, tau=(0.004, 0.014)):
    """Tiny, very short random high pings: a noisy 'sparkle dust'."""
    out = np.zeros(n)
    for t0 in event_times(rng, rate_pts, 0.0, n / SR):
        f = float(np.exp(rng.uniform(np.log(lo), np.log(hi))))
        add_partial(out, t0, f, rng.uniform(*tau), rng.uniform(0.2, 1.0), rng, attack=0.0008)
    return out


def crackle(n, rng, rate_pts, lo=2000.0, hi=6000.0, pops=0.3):
    """Fire crackle: sparse random clicks (heavy-tailed amplitudes) band-passed lo..hi,
    plus a few softer lower 'pops'."""
    hi_imp = np.zeros(n)
    lo_imp = np.zeros(n)
    for t0 in event_times(rng, rate_pts, 0.0, n / SR):
        i = ns(t0)
        L = int(rng.integers(3, 30))
        if i + L >= n:
            continue
        a = min(rng.pareto(2.5) + 0.3, 2.0) * rng.choice([-1.0, 1.0])
        hi_imp[i:i + L] += a * rng.standard_normal(L) * np.exp(-np.arange(L) / (L / 3.0))
        if rng.random() < pops:
            L2 = int(rng.integers(25, 90))
            if i + L2 < n:
                lo_imp[i:i + L2] += 0.6 * a * rng.standard_normal(L2) * np.exp(-np.arange(L2) / (L2 / 3.0))
    return band(hi_imp, lo, hi) + 0.5 * band(lo_imp, 700.0, 2000.0)


def add_bloop(dst, t0, f_start, f_end, dur, amp, rng, decay=0.5, attack=0.003):
    """Bubble 'bloop': short sine with a fast upward pitch glide."""
    n = len(dst)
    i0 = ns(t0)
    if i0 >= n:
        return
    m = min(n - i0, ns(dur))
    if m < 16:
        return
    t = np.arange(m) / SR
    u = t / dur
    f = f_start * (f_end / f_start) ** (1.0 - (1.0 - u) ** 2)
    env = attack_ramp(m, attack) * np.exp(-t / (dur * decay)) * release_ramp(m, 0.004)
    dst[i0:i0 + m] += amp * env * np.sin(phase_of(f))


def bubbles(n, rng, rate_pts, f_lo, f_hi, dur=(0.006, 0.02), rise=(1.5, 2.6)):
    out = np.zeros(n)
    for t0 in event_times(rng, rate_pts, 0.0, n / SR):
        fs = float(np.exp(rng.uniform(np.log(f_lo), np.log(f_hi))))
        add_bloop(out, t0, fs, fs * rng.uniform(*rise), rng.uniform(*dur), rng.uniform(0.2, 1.0), rng)
    return out


def add_grain(dst, t0, rng, fc, q, dur, amp):
    """Short band-passed noise burst (a bit of debris / grit)."""
    n = len(dst)
    i0 = ns(t0)
    m = min(n - i0, ns(dur * 7.0))
    if i0 >= n or m < 16:
        return
    g = svf(rng.standard_normal(m), fc, q, "bp") * perc(m, 0.0005, dur)
    dst[i0:i0 + m] += amp * g


def stone_crack(rng, amp=1.0, body_f=None):
    """Sharp stone crack: broadband click + resonant mid-band body + low thud + grit."""
    m = ns(0.2)
    t = np.arange(m) / SR
    click = hpf(white(m, rng), 900.0) * perc(m, 0.0002, 0.0013)
    bf = body_f or rng.uniform(480.0, 1100.0)
    body = svf(white(m, rng), bf, 2.2, "bp") * perc(m, 0.0004, 0.022)
    body2 = svf(white(m, rng), bf * rng.uniform(1.6, 2.3), 1.6, "bp") * perc(m, 0.0003, 0.012)
    thud = np.sin(phase_of(90.0 + 70.0 * np.exp(-t / 0.012))) * perc(m, 0.001, 0.035)
    grit = np.zeros(m)
    for _ in range(8):
        add_grain(grit, rng.uniform(0.004, 0.07), rng, rng.uniform(900, 3500), 1.5,
                  rng.uniform(0.002, 0.006), rng.uniform(0.3, 1.0))
    seg = (norm(click) + undb(-3) * norm(body) + undb(-8) * norm(body2) + undb(-6) * norm(thud)
           + undb(-13) * norm(grit))
    return amp * seg


# =============================================================================
# Sound designs
# =============================================================================

A_PENTA_HI = scale(note("A4"), PENTA, 4000.0, 7000.0)


def _blade_sparkle(rng, n, t_from, count, level_db, lo=4000.0, hi=7000.0,
                   spacing=(0.016, 0.03), tau=(0.03, 0.05)):
    """A few very quiet high partials (4-7 kHz) on the tail of a blade movement."""
    sp = np.zeros(n)
    choices = scale(note("A4"), PENTA, lo, hi)
    t = t_from
    for _ in range(count):
        add_partial(sp, t, float(rng.choice(choices)), rng.uniform(*tau), rng.uniform(0.6, 1.0), rng,
                    attack=0.0015, twin=0.5, beat=rng.uniform(5.0, 9.0))
        t += rng.uniform(*spacing)
    return undb(level_db) * norm(sp)


def swing_core(rng, dur, f0, f1, f2, t_peak, q=1.6, air_db=-10.0, body_db=-12.0):
    """Light blade whoosh: noise through a swept 4th-order band-pass (rise/fall of the
    centre frequency follows the blade speed), an airy high layer and a soft body."""
    n = ns(dur)
    t_end = dur - 0.01
    amp = curve(n, [(0.0, 0.0), (0.45 * t_peak, 0.2, "in"), (t_peak, 1.0, "in"),
                    (t_peak + 0.4 * (t_end - t_peak), 0.3, "out"), (t_end, 0.0, "smooth")])
    fc = curve(n, [(0.0, f0), (t_peak, f1), (t_end, f2)], log=True)
    swish = svf(svf(white(n, rng), fc, q, "bp"), fc, q, "bp")
    air = svf(white(n, rng), np.minimum(fc * 1.6, 14000.0), 0.7, "hp")
    body = svf(pink(n, rng), fc * 0.5, 1.2, "bp")
    return norm(swish * amp) + undb(air_db) * norm(air * amp) + undb(body_db) * norm(body * amp)


def make_swing(dur, f0, f1, f2, t_peak, q, sparkle_db=-23.0, sparkles_n=3):
    def fn(rng):
        n = ns(dur)
        x = swing_core(rng, dur, f0, f1, f2, t_peak, q)
        x = x + _blade_sparkle(rng, n, t_peak * 0.95, sparkles_n, sparkle_db)
        return reverb(x, "room", 0.12)
    return fn


def snd_swing_3(rng):
    dur = 0.42
    n = ns(dur)
    x = swing_core(rng, dur, 450.0, 2200.0, 900.0, 0.15, q=1.3, air_db=-8.0, body_db=-7.0)
    x = x + 0.6 * swing_core(rng, dur, 800.0, 3300.0, 1400.0, 0.14, q=1.8, air_db=-14.0, body_db=-40.0)
    chord = np.zeros(n)
    for i, nm in enumerate(["A5", "C#6", "E6", "B6", "C#7", "E7"]):
        add_bell(chord, 0.105 + 0.013 * i, note(nm), 0.17, 1.0 - 0.07 * i, rng, GLASS,
                 attack=0.002, twin=0.6, beat=(3.0, 7.0))
    x = norm(x) + undb(-8) * norm(chord)
    return reverb(x, "bright", 0.16)


def snd_heavy_swing(rng):
    dur = 0.46
    n = ns(dur)
    t_peak, t_end = 0.27, 0.44
    amp = curve(n, [(0.0, 0.0), (0.13, 0.12, "in"), (t_peak, 1.0, "in"), (0.35, 0.35, "out"),
                    (t_end, 0.0, "smooth")])
    fc = curve(n, [(0.0, 300.0), (t_peak, 1500.0), (t_end, 650.0)], log=True)
    main = svf(svf(white(n, rng), fc, 1.3, "bp"), fc, 1.3, "bp")
    low = svf(pink(n, rng), fc * 0.5, 0.9, "bp")
    air = svf(white(n, rng), fc * 2.0, 0.7, "hp")
    x = norm(main * amp) + undb(-5) * norm(low * amp) + undb(-12) * norm(air * amp)
    t = np.arange(n) / SR
    tt = np.maximum(t - 0.30, 0.0)
    thump = np.sin(phase_of(55.0 + 35.0 * np.exp(-tt / 0.025))) * perc(n, 0.004, 0.045, 0.30)
    x = x + undb(-9) * sat(thump, 1.8)
    x = x + _blade_sparkle(rng, n, 0.29, 2, -23.0)
    return reverb(x, "room", 0.12)


def blade_ring(rng, n, t0, base, tau, cluster=8, low=0.22):
    """Metallic ring: a few longer 'blade' modes over a dense, quickly damped inharmonic
    cluster (the clash), each mode with a slightly detuned twin for beating."""
    ring = np.zeros(n)
    for r, a, tr in ((1.0, 1.0, 1.0), (1.37, 0.7, 0.8), (1.93, 0.5, 0.6), (0.47, low, 0.8)):
        add_partial(ring, t0, base * r * (1.0 + rng.uniform(-0.015, 0.015)), tau * tr * rng.uniform(0.9, 1.1),
                    a * rng.uniform(0.85, 1.15), rng, attack=0.0004, twin=0.55, beat=rng.uniform(4.0, 12.0))
    for _ in range(cluster):
        f = float(np.exp(rng.uniform(np.log(base * 0.9), np.log(min(base * 2.9, 7500.0)))))
        add_partial(ring, t0, f, rng.uniform(0.01, 0.03), rng.uniform(0.15, 0.45), rng, attack=0.0003)
    return ring


def make_hit(base, thump_hz, ring_tau, click_db=-3.0):
    def fn(rng):
        dur = 0.26
        n = ns(dur)
        t0 = 0.003
        t = np.arange(n) / SR
        click = hpf(white(n, rng), 2500.0) * perc(n, 0.0002, 0.0012, t0)
        shk = svf(white(n, rng), 4200.0, 0.9, "bp") * perc(n, 0.0004, 0.01, t0)
        ring = blade_ring(rng, n, t0, base, ring_tau)
        fth = thump_hz * (1.0 + 0.5 * np.exp(-np.maximum(t - t0, 0.0) / 0.01))
        body = np.sin(phase_of(fth)) * perc(n, 0.0008, 0.02, t0)
        lowb = lpf(white(n, rng), 500.0) * perc(n, 0.0005, 0.008, t0)
        shim = np.zeros(n)
        for k in range(2):
            add_partial(shim, t0 + 0.006 + 0.022 * k, float(rng.choice(scale(note("A4"), PENTA, 4500, 6800))),
                        0.06, 1.0, rng, attack=0.002, twin=0.6, beat=6.0)
        x = (undb(click_db) * norm(click) + undb(-7) * norm(shk) + norm(ring) + undb(-10) * norm(body)
             + undb(-16) * norm(lowb) + undb(-22) * norm(shim))
        return reverb(x, "room", 0.12)
    return fn


def snd_heavy_hit(rng):
    dur = 0.62
    n = ns(dur)
    t0 = 0.003
    t = np.arange(n) / SR
    tt = np.maximum(t - t0, 0.0)
    boom = sat(np.sin(phase_of(45.0 + 45.0 * np.exp(-tt / 0.06))) * perc(n, 0.002, 0.12, t0), 1.8)
    punch = np.sin(phase_of(85.0 + 70.0 * np.exp(-tt / 0.015))) * perc(n, 0.001, 0.04, t0)
    crack = hpf(white(n, rng), 1500.0) * perc(n, 0.0002, 0.0025, t0)
    crack2 = svf(white(n, rng), 2400.0, 0.7, "bp") * perc(n, 0.0005, 0.02, t0)
    ring = blade_ring(rng, n, t0, 1650.0, 0.13, cluster=10, low=0.35)
    rum = band(brown(n, rng), 60.0, 250.0) * perc(n, 0.012, 0.12, t0)
    grit = band(white(n, rng), 300.0, 900.0) * perc(n, 0.004, 0.06, t0)
    shim = sparkles(n, rng, [(0.0, 12.0), (0.3, 6.0)], A_PENTA_HI, tau=(0.04, 0.07), t_range=(0.01, 0.3))
    x = (norm(boom) + undb(-5) * norm(punch) + undb(-3) * norm(crack) + undb(-6) * norm(crack2)
         + undb(-6) * norm(ring) + undb(-10) * norm(rum) + undb(-16) * norm(grit) + undb(-24) * norm(shim))
    return reverb(x, "small", 0.18)


def snd_charge(rng):
    dur = 1.6
    n = ns(dur)
    t = np.arange(n) / SR
    u = t / dur
    rise = curve(n, [(0.0, 0.0), (dur, 1.0, 1.7)])
    bend = 2.0 ** (curve(n, [(0.0, -7.0), (dur * 0.97, 0.0, 1.5)]) / 12.0)
    bright = curve(n, [(0.0, 0.15), (dur, 1.0, 1.3)])
    vdepth = curve(n, [(0.0, 3.0), (dur, 12.0, 1.5)])
    vrate = curve(n, [(0.0, 4.5), (dur, 8.5)])
    vib = vdepth * np.sin(phase_of(vrate))
    tone = np.zeros(n)
    for nm in ["A4", "E5", "A5", "C#6", "E6"]:
        for cents, vs in ((-7.0, 1.0), (0.0, -1.0), (7.0, 0.7)):
            f = note(nm) * bend * 2.0 ** ((cents + vs * vib) / 1200.0)
            tone += tone_stack(n, f, rng, (1.0, 0.35, 0.18, 0.08), bright)
    trem_rate = curve(n, [(0.0, 5.0), (dur, 16.0, 1.5)])
    trem = 1.0 - 0.25 * u * (0.5 + 0.5 * np.sin(phase_of(trem_rate)))
    fc = curve(n, [(0.0, 700.0), (dur, 7500.0, 1.4)], log=True)
    noise = svf(white(n, rng), fc, 0.9, "bp") * curve(n, [(0.0, 0.0), (dur, 1.0, 2.2)])
    sp = sparkles(n, rng, [(0.0, 3.0), (0.6, 8.0), (1.2, 25.0), (1.6, 45.0)],
                  scale(note("A4"), PENTA, 2000.0, 7000.0),
                  center_pts=[(0.0, 2500.0), (dur, 6000.0)], tau=(0.03, 0.06),
                  amp_pts=[(0.0, 0.3), (dur, 1.0)], t_range=(0.1, dur - 0.03))
    x = norm(tone * rise) * trem + undb(-8) * norm(noise) + undb(-14) * norm(sp)
    return reverb(x, "bright", 0.2)


def snd_charge_ready(rng):
    dur = 0.62
    n = ns(dur)
    x = np.zeros(n)
    for i, (nm, tau, a) in enumerate([("E6", 0.12, 0.8), ("A6", 0.14, 0.9), ("C#7", 0.26, 1.0)]):
        add_bell(x, 0.004 + 0.058 * i, note(nm), tau, a, rng, CRYSTAL, attack=0.001, twin=0.5,
                 beat=(2.5, 5.0), strike=1.3, prompt=0.3)
    add_bell(x, 0.004 + 0.116, note("C#6"), 0.2, 0.3, rng, CELESTA, attack=0.002)
    gl = glitter(n, rng, [(0.1, 30.0), (0.4, 10.0), (0.6, 0.0)], lo=6000.0, hi=10000.0)
    x = norm(x) + undb(-26) * norm(gl)
    return reverb(x, "bright", 0.25)


def snd_wave_release(rng):
    dur = 0.82
    n = ns(dur)
    t0 = 0.004
    amp = curve(n, [(0.0, 0.0), (0.05, 1.0, "in"), (0.25, 0.55, "out"), (0.75, 0.0, "smooth")])
    fc = curve(n, [(0.0, 6000.0), (0.08, 4500.0), (0.7, 450.0, "out")], log=True)
    w1 = svf(white(n, rng), fc, 1.1, "bp")
    w2 = svf(pink(n, rng), fc * 0.5, 0.8, "bp")
    w3 = svf(white(n, rng), np.minimum(fc * 1.5, 15000.0), 0.7, "hp")
    whoosh = norm(w1 * amp) + undb(-5) * norm(w2 * amp) + undb(-10) * norm(w3 * amp)
    t = np.arange(n) / SR
    tt = np.maximum(t - t0, 0.0)
    wh = sat(np.sin(phase_of(65.0 + 55.0 * np.exp(-tt / 0.05))) * perc(n, 0.005, 0.08, t0), 1.5)
    gl = np.zeros(n)
    for i, nm in enumerate(["E7", "C#7", "A6", "E6", "C#6", "A5"]):
        add_bell(gl, 0.015 + 0.045 * i, note(nm), 0.3, 1.0 - 0.05 * i, rng, GLASS, attack=0.003,
                 twin=0.6, beat=(3.0, 6.0), glide_cents=-45.0, glide_tau=0.25)
    x = whoosh + undb(-12) * norm(wh) + undb(-7) * norm(gl)
    return reverb(x, "hall", 0.2)


def snd_spirit_summon(rng):
    dur = 0.92
    n = ns(dur)
    arp = np.zeros(n)
    for i, nm in enumerate(["A5", "B5", "C#6", "E6", "F#6", "A6"]):
        add_bell(arp, 0.004 + 0.068 * i, note(nm), 0.22 + 0.015 * i, 0.75 + 0.05 * i, rng, CELESTA,
                 attack=0.002, twin=0.45, beat=(2.0, 4.5), strike=1.1, prompt=0.4)
    swell = curve(n, [(0.0, 0.0), (0.35, 1.0), (0.9, 0.0)])
    air = svf(white(n, rng), 7000.0, 0.7, "bp") * swell
    gl = glitter(n, rng, [(0.05, 10.0), (0.4, 40.0), (0.9, 10.0)], lo=5000.0, hi=10000.0)
    x = norm(arp) + undb(-24) * norm(air) + undb(-20) * norm(gl)
    return reverb(x, "hall", 0.28)


def snd_spirit_dismiss(rng):
    dur = 0.72
    n = ns(dur)
    arp = np.zeros(n)
    for i, nm in enumerate(["A6", "F#6", "E6", "C#6", "B5", "A5"]):
        add_bell(arp, 0.006 + 0.055 * i, note(nm), 0.17, 0.84 ** i, rng, CELESTA, attack=0.004,
                 twin=0.5, beat=(1.5, 3.5), bright=0.7, strike=1.2, prompt=0.4)
    fc = curve(n, [(0.0, 7000.0), (0.6, 3000.0)], log=True)
    sh = svf(white(n, rng), fc, 0.8, "bp") * curve(n, [(0.0, 0.0), (0.04, 1.0), (0.6, 0.0, "out")])
    sp = sparkles(n, rng, [(0.0, 25.0), (0.5, 6.0)], scale(note("A4"), PENTA, 2500.0, 8000.0),
                  center_pts=[(0.0, 7000.0), (0.5, 2800.0)], tau=(0.02, 0.05),
                  amp_pts=[(0.0, 1.0), (0.5, 0.3)], t_range=(0.0, 0.5))
    x = norm(arp) + undb(-24) * norm(sh) + undb(-18) * norm(sp)
    return reverb(x, "hall", 0.3)


def snd_spirit_select(rng):
    dur = 0.26
    n = ns(dur)
    b = np.zeros(n)
    add_bell(b, 0.004, note("A5"), 0.06, 1.0, rng, SELECT_BELL, attack=0.002, twin=0.45, beat=(4.0, 6.0),
             strike=1.3, prompt=0.35)
    gl = svf(white(n, rng), 8000.0, 1.0, "bp") * perc(n, 0.004, 0.04, 0.004)
    x = norm(b) + undb(-26) * norm(gl)
    return reverb(x, "room", 0.15)


def snd_transform(rng):
    dur = 1.82
    n = ns(dur)
    hit = 1.24
    # swelling Esus4 pad (heavily low-passed detuned saws, slow attack)
    n1 = ns(hit + 0.08)
    cut1 = curve(n1, [(0.0, 260.0), (hit, 1700.0, 1.6)], log=True)
    p1 = pad(n1, notes("E3", "B3", "E4", "A4"), cut1, rng, detune=8.0)
    p1 *= curve(n1, [(0.0, 0.0), (hit - 0.02, 1.0, 1.8), (hit + 0.07, 0.0, "smooth")])
    # resolving A major pad
    n2 = n - ns(hit - 0.012)
    cut2 = curve(n2, [(0.0, 2600.0), (0.55, 900.0, "out")], log=True)
    p2 = pad(n2, notes("A3", "E4", "A4", "C#5"), cut2, rng, detune=8.0)
    p2 *= curve(n2, [(0.0, 0.0), (0.02, 1.0), (0.25, 0.55, "out"), (n2 / SR - 0.01, 0.0, "out")])
    pads = np.zeros(n)
    add(pads, p1, 0.0)
    add(pads, p2, hit - 0.012)
    # rising sparkles + riser noise leading into the hit
    sp = sparkles(n, rng, [(0.3, 3.0), (0.8, 12.0), (hit, 32.0)],
                  scale(note("E4"), PENTA, 1800.0, 7500.0),
                  center_pts=[(0.3, 2000.0), (hit, 6000.0)], tau=(0.03, 0.06),
                  amp_pts=[(0.3, 0.3), (hit, 1.0)], t_range=(0.3, hit))
    fc = curve(n, [(0.0, 1000.0), (hit, 8000.0, 1.5)], log=True)
    riser = svf(white(n, rng), fc, 0.8, "bp") * curve(n, [(0.0, 0.0), (0.5, 0.0), (hit, 1.0, 2.0),
                                                          (hit + 0.04, 0.0, "out")])
    # bright resolving major chord with bell shimmer
    bells = np.zeros(n)
    for i, nm in enumerate(["A5", "C#6", "E6", "A6", "C#7", "E7"]):
        add_bell(bells, hit + 0.008 * i, note(nm), 0.6 - 0.04 * i, 1.0 - 0.08 * i, rng, GLASS,
                 attack=0.002, twin=0.6, beat=(2.0, 5.0))
    flash = hpf(white(n, rng), 3000.0) * perc(n, 0.001, 0.025, hit)
    tt = np.maximum(np.arange(n) / SR - hit, 0.0)
    whomp = np.sin(phase_of(60.0 + 50.0 * np.exp(-tt / 0.05))) * perc(n, 0.004, 0.09, hit)
    x = (undb(-3) * norm(pads) + undb(-17) * norm(sp) + undb(-12) * norm(riser) + norm(bells)
         + undb(-12) * norm(flash) + undb(-16) * norm(whomp))
    return reverb(x, "hall", 0.28)


def snd_revert(rng):
    dur = 0.92
    n = ns(dur)
    bend = 2.0 ** (curve(n, [(0.0, 0.0), (dur, -2.0, "in")]) / 12.0)
    cut = curve(n, [(0.0, 1500.0), (dur, 280.0, "out")], log=True)
    p = pad(n, [f * bend for f in notes("A3", "E4", "A4", "C#5")], cut, rng, detune=8.0)
    p *= curve(n, [(0.0, 0.0), (0.05, 1.0), (dur - 0.02, 0.0, "out")])
    sh = np.zeros(n)
    for i, nm in enumerate(["C#7", "A6", "E6", "C#6"]):
        add_bell(sh, 0.02 + 0.1 * i, note(nm), 0.3, 0.9 - 0.12 * i, rng, GLASS, attack=0.008,
                 twin=0.6, beat=(2.0, 4.0), glide_cents=-30.0, glide_tau=0.3, bright=0.7)
    sp = sparkles(n, rng, [(0.0, 20.0), (0.7, 4.0)], scale(note("A4"), PENTA, 2000.0, 8000.0),
                  center_pts=[(0.0, 7000.0), (0.7, 2200.0)], tau=(0.03, 0.06),
                  amp_pts=[(0.0, 1.0), (0.7, 0.3)], t_range=(0.0, 0.7))
    x = undb(-1.5) * norm(p) + undb(-6) * norm(sh) + undb(-17) * norm(sp)
    return reverb(x, "hall", 0.3)


def snd_fire_cast(rng):
    dur = 0.52
    n = ns(dur)
    t0 = 0.004
    amp = curve(n, [(0.0, 0.0), (t0, 0.0), (0.035, 1.0, "in"), (0.12, 0.55, "out"), (0.5, 0.0, "smooth")])
    fc = curve(n, [(0.0, 250.0), (0.045, 2600.0, "in"), (0.16, 950.0), (0.5, 420.0)], log=True)
    roar = hp_fft(svf(pink(n, rng), fc, 0.9, "lp"), 110.0)
    mid = svf(white(n, rng), fc * 0.8, 1.2, "bp")
    flick = 1.0 + 0.25 * smooth_noise(n, rng, 18.0)
    fw = (norm(roar * amp) + undb(-5) * norm(mid * amp)) * flick
    t = np.arange(n) / SR
    tt = np.maximum(t - t0, 0.0)
    fb = 75.0 + 45.0 * np.exp(-(((tt - 0.03) / 0.03) ** 2))
    body = sat(np.sin(phase_of(fb)) * perc(n, 0.02, 0.06, t0), 1.4)
    cr = crackle(n, rng, [(0.0, 0.0), (0.04, 80.0), (0.2, 50.0), (0.5, 20.0)])
    x = fw + undb(-9) * norm(body) + undb(-5) * norm(cr)
    return reverb(x, "room", 0.12)


def snd_fire_explode(rng):
    dur = 0.92
    n = ns(dur)
    t0 = 0.004
    t = np.arange(n) / SR
    tt = np.maximum(t - t0, 0.0)
    thump = sat(np.sin(phase_of(48.0 + 40.0 * np.exp(-tt / 0.07))) * perc(n, 0.006, 0.13, t0), 2.0)
    fc = curve(n, [(0.0, 4500.0), (0.06, 3000.0), (0.3, 900.0, "out"), (0.9, 350.0)], log=True)
    burst = hp_fft(svf(pink(n, rng), fc, 0.75, "lp"), 70.0) * perc(n, 0.008, 0.16, t0)
    rfc = curve(n, [(0.0, 900.0), (0.9, 380.0)], log=True)
    roar = (svf(pink(n, rng), rfc, 1.0, "bp") * curve(n, [(0.0, 0.0), (0.03, 1.0), (0.9, 0.0, "out")])
            * (1.0 + 0.3 * smooth_noise(n, rng, 12.0)))
    cr = crackle(n, rng, [(0.0, 0.0), (0.03, 160.0), (0.3, 70.0), (0.9, 15.0)])
    glow = np.zeros(n)
    for nm in ("A5", "E6"):
        glow += tone_stack(n, note(nm), rng, (1.0, 0.1))
    glow *= curve(n, [(0.0, 0.0), (0.12, 1.0), (0.85, 0.0, "out")])
    x = (norm(thump) + norm(burst) + undb(-8) * norm(roar) + undb(-5) * norm(cr)
         + undb(-26) * norm(glow))
    return reverb(x, "small", 0.22)


def snd_water_cast(rng):
    dur = 0.62
    n = ns(dur)
    bl = np.zeros(n)
    t = 0.004
    k = 0
    while t < 0.45:
        a = 1.0 if k == 0 else rng.uniform(0.35, 0.9)
        add_bloop(bl, t, rng.uniform(280.0, 420.0), rng.uniform(900.0, 1300.0),
                  rng.uniform(0.04, 0.07), a, rng, decay=0.33, attack=0.006)
        t += rng.uniform(0.04, 0.075)
        k += 1
    fc = curve(n, [(0.0, 500.0), (0.25, 2300.0), (0.6, 1100.0)], log=True)
    stream = (svf(white(n, rng), fc, 1.3, "bp")
              * curve(n, [(0.0, 0.0), (0.08, 1.0), (0.35, 0.7), (0.6, 0.0)])
              * (1.0 + 0.35 * smooth_noise(n, rng, 14.0)))
    fizz = bubbles(n, rng, [(0.0, 20.0), (0.2, 45.0), (0.6, 10.0)], 1500.0, 4000.0)
    x = norm(bl) + undb(-7) * norm(stream) + undb(-15) * norm(fizz)
    return reverb(x, "small", 0.15)


def snd_water_heal(rng):
    dur = 1.12
    n = ns(dur)
    ch = np.zeros(n)
    for i, (nm, a) in enumerate(zip(["D5", "A5", "D6", "F#6", "A6"], [0.4, 0.7, 0.9, 0.85, 0.75])):
        add_bell(ch, 0.006 + 0.035 * i, note(nm), 0.45, a, rng, SOFT_BELL, attack=0.006, twin=0.6,
                 beat=(1.2, 2.8), strike=0.35, prompt=0.3)
    add_bell(ch, 0.30, note("D7"), 0.3, 0.25, rng, CRYSTAL, attack=0.004)
    fizz = bubbles(n, rng, [(0.0, 10.0), (0.2, 35.0), (1.1, 10.0)], 1800.0, 5000.0)
    flow_fc = 3500.0 * 2.0 ** (0.5 * smooth_noise(n, rng, 3.0))
    flow = svf(white(n, rng), flow_fc, 1.5, "bp") * curve(n, [(0.0, 0.0), (0.15, 1.0), (0.7, 0.6), (1.1, 0.0)])
    x = norm(ch) + undb(-18) * norm(fizz) + undb(-22) * norm(flow)
    return reverb(x, "hall", 0.3)


def snd_wind_cast(rng):
    dur = 0.72
    n = ns(dur)
    amp = curve(n, [(0.0, 0.0), (0.17, 1.0, "in"), (0.3, 0.75), (0.7, 0.0, "out")])
    fc = curve(n, [(0.0, 420.0), (0.2, 2100.0), (0.42, 1200.0), (0.7, 650.0)], log=True)
    turb = 1.0 + 0.28 * smooth_noise(n, rng, 11.0)
    body = svf(pink(n, rng), fc, 0.8, "bp")
    bnd = svf(white(n, rng), fc * 0.9, 2.2, "bp")
    air = svf(white(n, rng), np.minimum(fc * 2.5, 14000.0), 0.7, "hp")
    low = hp_fft(svf(pink(n, rng), fc * 0.6, 0.7, "lp"), 90.0)
    x = (norm(body * amp) + undb(-4) * norm(bnd * amp) + undb(-12) * norm(air * amp)
         + undb(-9) * norm(low * amp)) * turb
    return reverb(x, "room", 0.1)


def snd_dash(rng):
    dur = 0.36
    n = ns(dur)
    tp = 0.12
    amp = curve(n, [(0.0, 0.0), (tp, 1.0, "in3"), (0.2, 0.4, "out"), (0.34, 0.0)])
    fc = curve(n, [(0.0, 3600.0), (0.08, 3000.0), (0.17, 900.0), (0.34, 450.0)], log=True)
    w1 = svf(white(n, rng), fc, 1.4, "bp")
    w2 = svf(white(n, rng), fc * 1.03, 4.0, "bp")
    w3 = svf(pink(n, rng), fc * 0.5, 0.8, "bp")
    x = norm(w1 * amp) + undb(-9) * norm(w2 * amp) + undb(-7) * norm(w3 * amp)
    return reverb(x, "room", 0.08)


def snd_earth_cast(rng):
    dur = 0.82
    n = ns(dur)
    rum = band(brown(n, rng), 60.0, 200.0) + undb(-12) * norm(band(white(n, rng), 200.0, 500.0))
    env = curve(n, [(0.0, 0.0), (0.22, 1.0), (0.55, 0.8), (0.8, 0.0, "out")]) * (1.0 + 0.3 * smooth_noise(n, rng, 8.0))
    x = undb(-4) * norm(rum * env)
    for tc, a in ((0.21, 0.75), (0.37, 0.9), (0.54, 1.0)):
        add(x, stone_crack(rng, a), tc)
    return reverb(x, "room", 0.12)


def snd_earth_shatter(rng):
    dur = 1.02
    n = ns(dur)
    t0 = 0.004
    t = np.arange(n) / SR
    tt = np.maximum(t - t0, 0.0)
    boom = sat(np.sin(phase_of(45.0 + 40.0 * np.exp(-tt / 0.08))) * perc(n, 0.004, 0.16, t0), 2.2)
    punch = np.sin(phase_of(90.0 + 60.0 * np.exp(-tt / 0.02))) * perc(n, 0.001, 0.05, t0)
    thump = lpf(white(n, rng), 300.0, 4) * perc(n, 0.002, 0.04, t0)
    crack = (norm(hpf(white(n, rng), 700.0) * perc(n, 0.0002, 0.0025, t0))
             + undb(-3) * norm(svf(white(n, rng), 750.0, 1.8, "bp") * perc(n, 0.0005, 0.04, t0)))
    debris = np.zeros(n)
    for _ in range(150):
        tg = t0 + 0.008 + rng.exponential(0.25)
        if tg > 0.95:
            continue
        a = rng.uniform(0.25, 1.0) * np.exp(-(tg - t0) / 0.4)
        if rng.random() < 0.25:
            add_partial(debris, tg, rng.uniform(1500.0, 4500.0), rng.uniform(0.004, 0.01), 0.6 * a, rng)
        else:
            add_grain(debris, tg, rng, float(np.exp(rng.uniform(np.log(300.0), np.log(3500.0)))),
                      rng.uniform(1.0, 3.0), rng.uniform(0.004, 0.03), a)
    rumble = band(brown(n, rng), 55.0, 200.0) * perc(n, 0.02, 0.25, t0)
    x = (undb(-2) * norm(boom) + undb(-5) * norm(punch) + undb(-5) * norm(thump) + undb(-3) * norm(crack)
         + norm(debris) + undb(-9) * norm(rumble))
    return reverb(x, "small", 0.2)


def snd_yang_cast(rng):
    dur = 0.72
    n = ns(dur)
    t0 = 0.004
    chord = np.zeros(n)
    for i, (nm, a) in enumerate(zip(["E6", "G#6", "B6", "E7"], [1.0, 0.85, 0.8, 0.45])):
        add_bell(chord, t0 + 0.004 * i, note(nm), 0.32, a, rng, GLASS, attack=0.006, twin=0.7, beat=(4.0, 8.0))
    glow = np.zeros(n)
    for nm in ("E6", "B6"):
        for c in (-6.0, 6.0):
            glow += np.sin(phase_of(note(nm) * 2.0 ** (c / 1200.0), n) + rng.uniform(0, TAU))
    glow *= curve(n, [(0.0, 0.0), (0.03, 1.0), (0.7, 0.0, "out")])
    flash = hpf(white(n, rng), 2500.0) * perc(n, 0.001, 0.014, t0)
    sw = svf(white(n, rng), curve(n, [(0.0, 10000.0), (0.08, 3500.0)], log=True), 1.0, "bp") * perc(n, 0.002, 0.03, t0)
    x = norm(chord) + undb(-4) * norm(flash) + undb(-10) * norm(sw) + undb(-10) * norm(glow)
    return reverb(x, "bright", 0.3)


def snd_yang_buff(rng):
    dur = 0.92
    n = ns(dur)
    step = curve(n, [(0.0, 0.0), (0.32, 0.0), (0.40, 7.0), (dur, 7.0)])
    ratio = 2.0 ** (step / 12.0)
    amp = curve(n, [(0.0, 0.0), (0.45, 1.0, "in3"), (0.53, 0.72, "out"), (0.9, 0.0, "out")])
    cut = 500.0 + 2000.0 * amp ** 1.2
    p = pad(n, [220.0 * ratio, 440.0 * ratio], cut, rng, detune=6.0, q=0.9)
    sp = sparkles(n, rng, [(0.3, 18.0), (0.9, 10.0)], scale(note("E4"), PENTA, 3000.0, 7000.0),
                  tau=(0.03, 0.06), t_range=(0.3, 0.85))
    x = norm(p * amp) + undb(-15) * norm(sp)
    return reverb(x, "hall", 0.25)


def snd_yin_cast(rng):
    dur = 0.72
    n = ns(dur)
    tp = 0.52
    sw = curve(n, [(0.0, 0.0), (tp, 1.0, 3.0), (tp + 0.16, 0.0, "out")])
    fc = curve(n, [(0.0, 120.0), (tp, 520.0, "in"), (dur, 180.0)], log=True)
    whoosh = svf(pink(n, rng), fc, 1.1, "bp")
    drone = pad(n, notes("D3", "Eb3"), 600.0, rng, detune=4.0, voices=2) + undb(-8) * norm(
        pad(n, notes("D4", "Eb4"), 900.0, rng, detune=4.0, voices=1))
    # reversed reverb of a dark hit: swells into the release point
    m = ns(0.7)
    hitx = np.zeros(m)
    add_bell(hitx, 0.0, note("D4"), 0.25, 1.0, rng, DARK_BELL)
    add_bell(hitx, 0.0, note("Eb5"), 0.2, 0.5, rng, DARK_BELL)
    hitx += 0.5 * norm(lpf(white(m, rng), 1500.0) * perc(m, 0.001, 0.03))
    rev = convolve(hitx, ir("dark"))[:m][::-1]
    rev_track = np.zeros(n)
    add(rev_track, rev, tp - len(rev) / SR)
    tt = np.maximum(np.arange(n) / SR - tp, 0.0)
    whomp = np.sin(phase_of(58.0 + 25.0 * np.exp(-tt / 0.04))) * perc(n, 0.003, 0.06, tp)
    x = (norm(whoosh * sw) + undb(-5) * norm(drone * sw) + undb(-6) * norm(rev_track)
         + undb(-12) * norm(whomp))
    return reverb(x, "dark", 0.15)


def snd_yin_seal(rng):
    dur = 0.82
    n = ns(dur)
    t = np.arange(n) / SR
    env = curve(n, [(0.0, 0.0), (0.04, 1.0), (0.5, 0.8), (0.72, 0.0, "out")])
    pulse = 0.55 + 0.45 * np.sin(TAU * 13.0 * t)
    th = pad(n, notes("D2", "D3"), 380.0, rng, voices=2, detune=5.0)
    ch = np.zeros(n)
    for i, nm in enumerate(["Eb5", "D5", "Bb4", "A4"]):
        add_bell(ch, 0.03 + 0.085 * i, note(nm), 0.2, 1.0 - 0.12 * i, rng, DARK_BELL, attack=0.002,
                 twin=0.5, beat=(1.5, 4.0), bright=0.6, strike=1.5, prompt=0.4)
    ch = lpf(ch, 2600.0)
    lock = np.zeros(n)
    tl = 0.6
    lock += hpf(white(n, rng), 1500.0) * perc(n, 0.0002, 0.0009, tl)
    lock += 0.5 * hpf(white(n, rng), 1500.0) * perc(n, 0.0002, 0.0007, tl + 0.022)
    add_partial(lock, tl, 2350.0, 0.007, 0.8, rng)
    add_partial(lock, tl, 3410.0, 0.004, 0.5, rng)
    add_partial(lock, tl + 0.022, 2900.0, 0.004, 0.35, rng)
    ttl = np.maximum(t - tl, 0.0)
    lock += 0.7 * np.sin(phase_of(170.0 + 80.0 * np.exp(-ttl / 0.005))) * perc(n, 0.001, 0.016, tl)
    lock = lpf(lock, 4500.0)
    x = undb(-9) * norm(th * env * pulse) + norm(ch) + undb(-3) * norm(lock)
    return reverb(x, "dark", 0.22)


def snd_el_fura(rng):
    dur = 0.82
    n = ns(dur)
    t0 = 0.004
    t = np.arange(n) / SR
    tt = np.maximum(t - t0, 0.0)
    boom_n = hp_fft(svf(pink(n, rng), 850.0, 0.8, "lp"), 60.0) * perc(n, 0.0015, 0.028, t0)
    thump = sat(np.sin(phase_of(60.0 + 45.0 * np.exp(-tt / 0.03))) * perc(n, 0.0015, 0.045, t0), 1.6)
    snap = hpf(white(n, rng), 1800.0) * perc(n, 0.0002, 0.002, t0)
    gamp = curve(n, [(0.0, 0.0), (0.02, 0.0), (0.09, 1.0, "in"), (0.3, 0.5, "out"), (0.8, 0.0)])
    gfc = curve(n, [(0.0, 1900.0), (0.1, 1700.0), (0.75, 420.0, "out")], log=True)
    g1 = svf(white(n, rng), gfc, 1.0, "bp")
    g2 = svf(pink(n, rng), gfc * 0.6, 0.8, "bp")
    turb = 1.0 + 0.22 * smooth_noise(n, rng, 13.0)
    gust = (norm(g1 * gamp) + undb(-3) * norm(g2 * gamp)) * turb
    x = undb(-1) * norm(boom_n) + undb(-5) * norm(thump) + undb(-8) * norm(snap) + norm(gust)
    return reverb(x, "small", 0.12)


def snd_ul_gora(rng):
    dur = 2.25
    n = ns(dur)
    env = curve(n, [(0.0, 0.0), (0.35, 1.0), (1.5, 1.0), (dur - 0.02, 0.0, "out")])
    srate = curve(n, [(0.0, 5.0), (0.9, 8.0), (dur, 6.0)])
    sph = phase_of(srate)
    lfo = np.sin(sph)
    fc = 750.0 * 2.0 ** (0.75 * lfo) * curve(n, [(0.0, 0.8), (1.0, 1.25), (dur, 0.9)])
    bandn = svf(pink(n, rng), fc, 1.3, "bp") * (0.62 + 0.38 * np.sin(sph + 0.6))
    roar = hp_fft(svf(brown(n, rng), 320.0, 0.7, "lp"), 70.0) * (0.8 + 0.2 * np.sin(sph + np.pi))
    wfc = curve(n, [(0.0, 380.0), (1.1, 1150.0), (dur, 480.0)], log=True) * 2.0 ** (0.06 * lfo)
    wind = svf(white(n, rng), wfc, 5.0, "bp")
    cr = crackle(n, rng, [(0.0, 30.0), (0.3, 110.0), (1.6, 130.0), (dur, 40.0)])
    cr *= np.sqrt(env)  # crackles fade in/out with the storm, lingering a little longer
    x = (norm(bandn) + undb(-4) * norm(roar) + undb(-5) * norm(wind)) * env + undb(-3) * norm(cr)
    return reverb(x, "small", 0.18)


def snd_clauzeria_charge(rng):
    dur = 1.32
    n = ns(dur)
    t = np.arange(n) / SR
    tones = np.zeros(n)
    pings = np.zeros(n)
    for i, (nm, rate) in enumerate(zip(["A3", "E4", "A4", "C#5", "E5", "B5"],
                                       [3.1, 3.9, 4.6, 5.4, 6.3, 7.2])):
        te = 0.004 + 0.13 * i
        f0 = note(nm)
        e = curve(n, [(0.0, 0.0), (te, 0.0), (te + 0.14, 1.0), (dur, 1.0)])
        v = np.zeros(n)
        for c in (-6.0, 0.0, 6.0):
            v += tone_stack(n, f0 * 2.0 ** (c / 1200.0), rng, (1.0, 0.3, 0.12, 0.05))
        trem = 1.0 - 0.35 * (0.5 + 0.5 * np.sin(TAU * rate * t + rng.uniform(0, TAU)))
        tones += v * e * trem * (0.9 if i == 0 else 1.0)
        fp = f0 * 4.0
        while fp > 4500.0:
            fp /= 2.0
        add_bell(pings, te, fp, 0.25, 1.0, rng, CELESTA, attack=0.002, twin=0.5, strike=0.6)
    build = curve(n, [(0.0, 0.25), (dur, 1.0, 1.8)])
    mix = (norm(tones) + undb(-9) * norm(pings)) * build
    mix = flanger(mix, rate=0.7, d0=0.0025, depth=0.0018, mix=0.6)
    fc = curve(n, [(0.0, 900.0), (dur, 6500.0, 1.4)], log=True)
    riser = svf(white(n, rng), fc, 0.9, "bp") * curve(n, [(0.0, 0.0), (dur, 1.0, 2.0)])
    sp = sparkles(n, rng, [(0.2, 4.0), (dur, 30.0)], scale(note("A4"), PENTA, 2500.0, 7500.0),
                  tau=(0.03, 0.06), amp_pts=[(0.0, 0.3), (dur, 1.0)], t_range=(0.2, dur - 0.04))
    x = norm(mix) + undb(-12) * norm(riser) + undb(-16) * norm(sp)
    return reverb(x, "bright", 0.22)


def snd_clauzeria_burst(rng):
    dur = 1.42
    n = ns(dur)
    t0 = 0.004
    t = np.arange(n) / SR
    tt = np.maximum(t - t0, 0.0)
    bells = np.zeros(n)
    for i, nm in enumerate(["A4", "C#5", "E5", "A5", "C#6", "E6", "A6"]):
        add_bell(bells, t0 + 0.006 * i, note(nm), 0.8 - 0.04 * i, 1.0 - 0.05 * i, rng, GLASS,
                 attack=0.002, twin=0.6, beat=(2.0, 5.0), strike=0.4)
    cut = curve(n, [(0.0, 3500.0), (0.6, 700.0, "out")], log=True)
    bright_pad = pad(n, notes("A3", "E4", "A4", "C#5", "E5"), cut, rng, detune=9.0) * perc(n, 0.006, 0.45, t0)
    wfc = curve(n, [(0.0, 7000.0), (0.7, 380.0, "out")], log=True)
    whoosh = svf(white(n, rng), wfc, 0.9, "bp") * curve(
        n, [(0.0, 0.0), (0.025, 1.0, "in"), (0.18, 0.5, "out"), (0.9, 0.0)])
    boom = sat(np.sin(phase_of(46.0 + 38.0 * np.exp(-tt / 0.07))) * perc(n, 0.003, 0.14, t0), 2.0)
    punch = np.sin(phase_of(90.0 + 60.0 * np.exp(-tt / 0.02))) * perc(n, 0.001, 0.05, t0)
    flash = hpf(white(n, rng), 3000.0) * perc(n, 0.0008, 0.015, t0)
    sp = sparkles(n, rng, [(0.05, 45.0), (0.6, 20.0), (1.4, 4.0)], scale(note("A4"), PENTA, 2500.0, 8000.0),
                  tau=(0.03, 0.08), amp_pts=[(0.0, 1.0), (1.4, 0.3)], t_range=(0.03, 1.35))
    x = (norm(bells) + undb(-5) * norm(bright_pad) + undb(-5) * norm(whoosh) + undb(-5) * norm(boom)
         + undb(-8) * norm(punch) + undb(-6) * norm(flash) + undb(-14) * norm(sp))
    return reverb(x, "big", 0.3)


def snd_barrier(rng):
    dur = 0.82
    n = ns(dur)
    env = adsr(n, 0.11, 0.19, 0.75, 0.5, 0.3)  # soft swell, settle, fade
    glass = np.zeros(n)
    for nm, a in (("E6", 1.0), ("B6", 0.7), ("E7", 0.25)):
        f0 = note(nm)
        for ratio, pa in ((1.0, 1.0), (2.71, 0.22), (5.12, 0.06)):
            f = f0 * ratio
            if f > 9000.0:
                continue
            for c in (-1.0, 1.0):
                beat = rng.uniform(1.5, 3.0) * c
                glass += a * pa * np.sin(phase_of(f + beat, n) + rng.uniform(0, TAU))
    hum = tone_stack(n, note("E4") * curve(n, [(0.0, 0.97), (0.3, 1.0)]), rng, (1.0, 0.2))
    flick = np.clip(1.0 + 0.6 * smooth_noise(n, rng, 25.0), 0.0, None)
    glit = svf(white(n, rng), 7500.0, 2.0, "bp") * flick
    x = norm(glass * env) + undb(-26) * norm(hum * env) + undb(-20) * norm(glit * env)
    return reverb(x, "bright", 0.3)


def snd_ultimate_activate(rng):
    dur = 2.82
    n = ns(dur)
    t0 = 0.004
    res = 1.9  # resolution point
    t = np.arange(n) / SR
    tt = np.maximum(t - t0, 0.0)
    boom = sat(np.sin(phase_of(44.0 + 34.0 * np.exp(-tt / 0.1))) * perc(n, 0.004, 0.18, t0), 2.0)
    punch = np.sin(phase_of(85.0 + 55.0 * np.exp(-tt / 0.02))) * perc(n, 0.002, 0.06, t0)
    thump = lpf(white(n, rng), 250.0, 4) * perc(n, 0.003, 0.06, t0)

    def line(n1, n2, n3):  # IV -> V -> I voice with short portamento
        return 2.0 ** (curve(n, [(0.0, n1), (0.92, n1), (1.0, n2), (res - 0.04, n2), (res + 0.03, n3)]) / 12.0)

    # semitone offsets from A4: D3 E3 A2 / D4 E4 E4 / F#4 G#4 A4 / A4 B4 C#5
    lines = [440.0 * line(-19, -17, -24), 440.0 * line(-7, -5, -5),
             440.0 * line(-3, -1, 0), 440.0 * line(0, 2, 4)]
    swell = curve(n, [(0.0, 0.0), (0.15, 0.0), (0.95, 0.55, "in"), (res, 1.0, "in"), (res + 0.35, 0.9),
                      (dur - 0.02, 0.0, "out")])
    tilt = curve(n, [(0.0, 1.3), (res, 0.75), (dur, 1.0)])
    ch = choir(n, lines[:2], rng, AH_LOW, voices=3, tilt=tilt) + choir(n, lines[2:], rng, AH_HIGH, voices=3, tilt=tilt)
    ch *= swell
    desc = choir(n, [note("E5")], rng, AH_HIGH, voices=2, tilt=0.9) * curve(
        n, [(0.0, 0.0), (res, 0.0), (res + 0.15, 1.0), (dur - 0.02, 0.0, "out")])
    sp = sparkles(n, rng, [(0.6, 2.0), (1.3, 14.0), (res, 35.0), (res + 0.3, 20.0), (dur, 3.0)],
                  scale(note("A4"), PENTA, 1800.0, 8000.0),
                  center_pts=[(0.6, 2200.0), (res, 6000.0), (dur, 3500.0)], tau=(0.03, 0.07),
                  amp_pts=[(0.6, 0.3), (res, 1.0), (dur, 0.4)], t_range=(0.6, dur - 0.05))
    fc = curve(n, [(0.0, 1000.0), (res, 8000.0, 1.5)], log=True)
    riser = svf(white(n, rng), fc, 0.8, "bp") * curve(n, [(0.0, 0.0), (1.2, 0.0), (res, 1.0, 2.0),
                                                          (res + 0.05, 0.0, "out")])
    bells = np.zeros(n)
    for i, nm in enumerate(["A5", "C#6", "E6", "A6", "C#7", "E7"]):
        add_bell(bells, res + 0.01 * i, note(nm), 0.7 - 0.05 * i, 1.0 - 0.08 * i, rng, GLASS,
                 attack=0.002, twin=0.6, beat=(2.0, 5.0), strike=0.4)
    n2 = n - ns(res)
    cut = curve(n2, [(0.0, 3000.0), (0.8, 700.0, "out")], log=True)
    brill = pad(n2, notes("A3", "E4", "A4", "C#5", "E5"), cut, rng, detune=9.0) * perc(n2, 0.01, 0.4)
    brill_track = np.zeros(n)
    add(brill_track, brill, res)
    flash = hpf(white(n, rng), 3000.0) * perc(n, 0.001, 0.03, res)
    tr = np.maximum(t - res, 0.0)
    whomp = np.sin(phase_of(60.0 + 50.0 * np.exp(-tr / 0.05))) * perc(n, 0.004, 0.1, res)
    x = (undb(-1) * norm(boom) + undb(-6) * norm(punch) + undb(-6) * norm(thump) + undb(-3) * norm(ch)
         + undb(-12) * norm(desc) + undb(-16) * norm(sp) + undb(-13) * norm(riser) + undb(-1) * norm(bells)
         + undb(-8) * norm(brill_track) + undb(-12) * norm(flash) + undb(-14) * norm(whomp))
    return reverb(x, "big", 0.3)


def snd_ultimate_end(rng):
    dur = 1.32
    n = ns(dur)
    bend = 2.0 ** (curve(n, [(0.0, 0.0), (dur, -1.5, "in")]) / 12.0)
    cut = curve(n, [(0.0, 1900.0), (dur, 250.0, "out")], log=True)
    p = pad(n, [f * bend for f in notes("A3", "E4", "A4", "C#5", "E5")], cut, rng, detune=8.0)
    p *= curve(n, [(0.0, 0.0), (0.06, 1.0), (dur - 0.02, 0.0, "out")])
    desc = np.zeros(n)
    for i, nm in enumerate(["E7", "C#7", "A6", "E6", "C#6", "A5"]):
        add_bell(desc, 0.02 + 0.13 * i, note(nm), 0.28, 0.7 - 0.05 * i, rng, GLASS, attack=0.004,
                 twin=0.6, beat=(2.0, 4.0), glide_cents=-25.0, glide_tau=0.3, bright=0.8, strike=0.5,
                 prompt=0.35)
    sp = sparkles(n, rng, [(0.0, 30.0), (1.1, 5.0)], scale(note("A4"), PENTA, 1400.0, 8000.0),
                  center_pts=[(0.0, 6000.0), (1.1, 1500.0)], tau=(0.03, 0.07),
                  amp_pts=[(0.0, 1.0), (1.1, 0.3)], t_range=(0.0, 1.1))
    x = undb(-11) * norm(p) + norm(desc) + undb(-14) * norm(sp)
    return reverb(x, "big", 0.35)


def snd_denied(rng):
    dur = 0.185
    n = ns(dur)
    x = np.zeros(n)
    for t0, f, d, a in ((0.004, note("E4"), 0.07, 1.0), (0.088, note("B3"), 0.09, 0.85)):
        m = ns(d)
        tm = np.arange(m) / SR
        env = a * attack_ramp(m, 0.008) * np.exp(-tm / 0.014) * release_ramp(m, 0.01)
        ph = TAU * f * tm
        add(x, (np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)) * env, t0)
    x = lpf(x, 1600.0)
    return reverb(x, "room", 0.06)


def snd_cushion(rng):
    dur = 0.42
    n = ns(dur)
    t0 = 0.004
    amp = curve(n, [(0.0, 0.0), (0.03, 1.0), (0.12, 0.45, "out"), (0.4, 0.0)])
    fc = curve(n, [(0.0, 300.0), (0.05, 1400.0), (0.38, 380.0)], log=True)
    w = svf(pink(n, rng), fc, 0.7, "bp")
    b = svf(white(n, rng), fc * 1.6, 1.0, "bp")
    low = hp_fft(svf(pink(n, rng), fc * 0.5, 0.7, "lp"), 90.0)
    tt = np.maximum(np.arange(n) / SR - t0, 0.0)
    thud = np.sin(phase_of(85.0 + 20.0 * np.exp(-tt / 0.03))) * perc(n, 0.004, 0.04, t0)
    x = (norm(w * amp) + undb(-12) * norm(b * amp) + undb(-8) * norm(low * amp) + undb(-16) * norm(thud))
    return reverb(x, "room", 0.08)


# =============================================================================
# Catalogue: event key -> files; each file -> (designer, mastering options)
# =============================================================================

# master options: fade_out (s), target RMS (dBFS) and the most limiting allowed (dB)
SPECS = {
    "sword/swing_1a": (make_swing(0.22, 700.0, 2600.0, 1200.0, 0.085, 2.0), dict(fade_out=0.02, rms=-17.0, limit=4.0)),
    "sword/swing_1b": (make_swing(0.23, 650.0, 2450.0, 1100.0, 0.095, 1.7), dict(fade_out=0.02, rms=-17.0, limit=4.0)),
    "sword/swing_2a": (make_swing(0.20, 900.0, 3000.0, 1500.0, 0.07, 2.2), dict(fade_out=0.02, rms=-17.0, limit=4.0)),
    "sword/swing_2b": (make_swing(0.19, 950.0, 3200.0, 1600.0, 0.065, 2.0), dict(fade_out=0.02, rms=-17.0, limit=4.0)),
    "sword/swing_3": (snd_swing_3, dict(fade_out=0.06, rms=-17.0, limit=4.0)),
    "sword/heavy_swing": (snd_heavy_swing, dict(fade_out=0.03, rms=-17.0, limit=4.0)),
    "sword/hit_a": (make_hit(2500.0, 120.0, 0.08), dict(fade_out=0.03, rms=-17.0, limit=6.0)),
    "sword/hit_b": (make_hit(2850.0, 128.0, 0.085, click_db=-6.0), dict(fade_out=0.03, rms=-17.0, limit=6.0)),
    "sword/hit_c": (make_hit(2250.0, 115.0, 0.085), dict(fade_out=0.03, rms=-17.0, limit=6.0)),
    "sword/heavy_hit": (snd_heavy_hit, dict(fade_out=0.06, rms=-16.0, limit=5.0)),
    "sword/charge": (snd_charge, dict(fade_out=0.045, rms=-17.0, limit=2.0)),
    "sword/charge_ready": (snd_charge_ready, dict(fade_out=0.08, rms=-18.0, limit=2.0)),
    "sword/wave_release": (snd_wave_release, dict(fade_out=0.08, rms=-16.0, limit=4.0)),
    "spirit/summon": (snd_spirit_summon, dict(fade_out=0.12, rms=-18.0, limit=2.0)),
    "spirit/dismiss": (snd_spirit_dismiss, dict(fade_out=0.1, rms=-19.0, limit=2.0)),
    "spirit/select": (snd_spirit_select, dict(fade_out=0.04, rms=-17.0, limit=2.0)),
    "transform": (snd_transform, dict(fade_out=0.15, rms=-17.0, limit=3.0)),
    "revert": (snd_revert, dict(fade_out=0.1, rms=-19.0, limit=2.0)),
    "art/fire_cast": (snd_fire_cast, dict(fade_out=0.05, rms=-16.0, limit=4.0)),
    "art/fire_explode": (snd_fire_explode, dict(fade_out=0.1, rms=-15.0, limit=5.0)),
    "art/water_cast": (snd_water_cast, dict(fade_out=0.06, rms=-16.0, limit=3.0)),
    "art/water_heal": (snd_water_heal, dict(fade_out=0.12, rms=-18.0, limit=2.0)),
    "art/wind_cast": (snd_wind_cast, dict(fade_out=0.05, rms=-16.0, limit=3.0)),
    "art/dash": (snd_dash, dict(fade_out=0.03, rms=-16.0, limit=5.0)),
    "art/earth_cast": (snd_earth_cast, dict(fade_out=0.06, rms=-16.0, limit=4.0)),
    "art/earth_shatter": (snd_earth_shatter, dict(fade_out=0.1, rms=-15.0, limit=5.0)),
    "art/yang_cast": (snd_yang_cast, dict(fade_out=0.08, rms=-16.0, limit=3.0)),
    "art/yang_buff": (snd_yang_buff, dict(fade_out=0.08, rms=-17.0, limit=2.0)),
    "art/yin_cast": (snd_yin_cast, dict(fade_out=0.05, rms=-17.0, limit=3.0)),
    "art/yin_seal": (snd_yin_seal, dict(fade_out=0.08, rms=-17.0, limit=3.0)),
    "el_fura": (snd_el_fura, dict(fade_out=0.06, rms=-15.0, limit=4.0)),
    "ul_gora": (snd_ul_gora, dict(fade_out=0.15, rms=-16.0, limit=3.0)),
    "al_clauzeria_charge": (snd_clauzeria_charge, dict(fade_out=0.05, rms=-17.0, limit=2.0)),
    "al_clauzeria_burst": (snd_clauzeria_burst, dict(fade_out=0.15, rms=-15.0, limit=4.0)),
    "barrier": (snd_barrier, dict(fade_out=0.08, rms=-18.0, limit=2.0)),
    "ultimate/activate": (snd_ultimate_activate, dict(fade_out=0.2, rms=-17.0, limit=3.0)),
    "ultimate/end": (snd_ultimate_end, dict(fade_out=0.15, rms=-19.0, limit=2.0)),
    "ability/denied": (snd_denied, dict(fade_out=0.015, rms=-18.0, limit=2.0)),
    "cushion": (snd_cushion, dict(fade_out=0.05, rms=-18.0, limit=3.0)),
}

EVENTS = [
    ("sword.swing_1", ["sword/swing_1a", "sword/swing_1b"]),
    ("sword.swing_2", ["sword/swing_2a", "sword/swing_2b"]),
    ("sword.swing_3", ["sword/swing_3"]),
    ("sword.heavy_swing", ["sword/heavy_swing"]),
    ("sword.hit", ["sword/hit_a", "sword/hit_b", "sword/hit_c"]),
    ("sword.heavy_hit", ["sword/heavy_hit"]),
    ("sword.charge", ["sword/charge"]),
    ("sword.charge_ready", ["sword/charge_ready"]),
    ("sword.wave_release", ["sword/wave_release"]),
    ("spirit.summon", ["spirit/summon"]),
    ("spirit.dismiss", ["spirit/dismiss"]),
    ("spirit.select", ["spirit/select"]),
    ("transform", ["transform"]),
    ("revert", ["revert"]),
    ("art.fire_cast", ["art/fire_cast"]),
    ("art.fire_explode", ["art/fire_explode"]),
    ("art.water_cast", ["art/water_cast"]),
    ("art.water_heal", ["art/water_heal"]),
    ("art.wind_cast", ["art/wind_cast"]),
    ("art.dash", ["art/dash"]),
    ("art.earth_cast", ["art/earth_cast"]),
    ("art.earth_shatter", ["art/earth_shatter"]),
    ("art.yang_cast", ["art/yang_cast"]),
    ("art.yang_buff", ["art/yang_buff"]),
    ("art.yin_cast", ["art/yin_cast"]),
    ("art.yin_seal", ["art/yin_seal"]),
    ("el_fura", ["el_fura"]),
    ("ul_gora", ["ul_gora"]),
    ("al_clauzeria_charge", ["al_clauzeria_charge"]),
    ("al_clauzeria_burst", ["al_clauzeria_burst"]),
    ("barrier", ["barrier"]),
    ("ultimate.activate", ["ultimate/activate"]),
    ("ultimate.end", ["ultimate/end"]),
    ("ability.denied", ["ability/denied"]),
    ("cushion", ["cushion"]),
]


# =============================================================================
# Mastering, encoding, verification
# =============================================================================

def limiter(x, ceiling=1.0, look=0.0015, release=0.06):
    """Look-ahead brick-wall limiter with a smooth gain curve (|out| <= ceiling)."""
    n = len(x)
    L = max(1, ns(look))
    req = np.minimum(1.0, ceiling / np.maximum(np.abs(x), 1e-12))
    padded = np.concatenate([np.ones(L), req, np.ones(L)])
    m = np.lib.stride_tricks.sliding_window_view(padded, 2 * L + 1).min(axis=1)
    coef = np.exp(-1.0 / (release * SR))
    g = m.tolist()
    cur = 1.0
    for i, v in enumerate(g):
        cur = 1.0 - (1.0 - cur) * coef
        if v < cur:
            cur = v
        g[i] = cur
    g = np.array(g)
    gp = np.concatenate([np.full(L, g[0]), g, np.full(L, g[-1])])
    smooth = np.convolve(gp, np.ones(2 * L + 1) / (2 * L + 1), mode="valid")
    return x * smooth


def apply_fades(x, fade_in, fade_out):
    x = x.copy()
    a = min(ns(fade_in), len(x))
    b = min(ns(fade_out), len(x))
    if a > 0:
        x[:a] *= np.sin(0.5 * np.pi * np.arange(a) / a) ** 2
    if b > 0:
        x[len(x) - b:] *= np.cos(0.5 * np.pi * (np.arange(b) + 1) / b) ** 2
    return x


def master(x, fade_in=0.004, fade_out=0.03, rms=None, limit=0.0, hp=38.0):
    """DC removal, 4th-order 38 Hz high-pass, optional limiting toward a target RMS,
    click-free fades and peak normalization to PEAK_DB."""
    x = np.asarray(x, dtype=float)
    x = x - np.mean(x)
    x = hpf(x, hp, order=4)
    x = norm(x)
    if rms is not None and limit > 0:
        cur = todb(np.sqrt(np.mean(x ** 2)))
        if cur < rms:
            x = limiter(x * undb(min(rms - cur, limit)), 1.0)
    x = apply_fades(x, max(fade_in, 0.003), max(fade_out, 0.01))
    return norm(x, undb(PEAK_DB))


def write_wav24(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = np.clip(np.round(x * 8388607.0), -8388608, 8388607).astype("<i4")
    data = pcm.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(data)


def encode(wav, ogg):
    os.makedirs(os.path.dirname(ogg), exist_ok=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", str(SR),
                    "-c:a", "libvorbis", "-q:a", "5",
                    # bitexact: fixed stream serial / no version tag -> byte-identical re-runs
                    "-fflags", "+bitexact", "-flags:a", "+bitexact", ogg], check=True)


def decode(path):
    out = subprocess.run([FFMPEG, "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1",
                          "-ar", str(SR), "-"], check=True, capture_output=True).stdout
    return np.frombuffer(out, dtype="<f4").astype(float)


def probe(path):
    out = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "a:0", "-show_entries",
                          "stream=codec_name,channels,sample_rate:format=duration", "-of", "json", path],
                         check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    return s["codec_name"], int(s["channels"]), int(s["sample_rate"]), float(j["format"]["duration"])


def render(rel, wav_dir):
    fn, opts = SPECS[rel]
    seed = (zlib.crc32(rel.encode()) ^ GLOBAL_SEED) & 0xFFFFFFFF
    x = master(fn(np.random.default_rng(seed)), **opts)
    wav = os.path.join(wav_dir, rel + ".wav")
    ogg = os.path.join(SOUNDS_DIR, rel + ".ogg")
    # Lossy coding moves the peak a little (and not monotonically with the input gain),
    # so trim the gain until the *decoded* file peaks at PEAK_DB: a few correction steps,
    # then a small grid around the estimate; keep the closest attempt. The WAV itself
    # never exceeds -0.1 dBFS.
    tried = {}

    def attempt(gain_db):
        gain_db = round(min(gain_db, -0.1 - PEAK_DB), 2)
        if gain_db not in tried:
            write_wav24(wav, x * undb(gain_db))
            encode(wav, ogg)
            tried[gain_db] = PEAK_DB - todb(peak(decode(ogg)))
        return gain_db, tried[gain_db]

    g, err = attempt(0.0)
    for _ in range(3):
        if abs(err) <= 0.1:
            break
        g, err = attempt(g + err)
    if abs(err) > 0.1:
        for d in (-0.3, -0.2, -0.1, 0.1, 0.2, 0.3):
            if abs(attempt(g + d)[1]) <= 0.1:
                break
    best = min(tried, key=lambda k: abs(tried[k]))
    if best != list(tried)[-1]:
        write_wav24(wav, x * undb(best))
        encode(wav, ogg)
    return ogg


def write_sounds_json():
    data = {}
    for key, files in EVENTS:
        data[key] = {"sounds": [NAMESPACE + ":" + f for f in files],
                     "subtitle": "subtitles." + NAMESPACE + "." + key}
    with open(SOUNDS_JSON, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")


def verify():
    print()
    hdr = "%-32s %6s %8s %8s %8s %7s %8s %6s  %s" % ("file (sounds/...)", "dur s", "peak dB", "rms dB",
                                                       "maxST dB", "<40Hz%", "DC", "KB", "ffprobe")
    print(hdr)
    print("-" * len(hdr))
    ok_all = True
    total = 0
    for key, files in EVENTS:
        for rel in files:
            path = os.path.join(SOUNDS_DIR, rel + ".ogg")
            codec, ch, rate, dur = probe(path)
            y = decode(path)
            pk = todb(peak(y))
            r = todb(rms(y))
            w = ns(0.1)
            st = max(todb(rms(y[i:i + w])) for i in range(0, max(1, len(y) - w + 1), ns(0.01)))
            spec = np.abs(np.fft.rfft(y)) ** 2
            fr = np.fft.rfftfreq(len(y), 1.0 / SR)
            sub = 100.0 * spec[fr < 40.0].sum() / max(spec.sum(), 1e-20)
            size = os.path.getsize(path)
            total += size
            good = (codec == "vorbis" and ch == 1 and rate == SR and -1.5 < pk < -0.5 and sub < 1.0)
            dc = float(np.mean(y))
            good &= abs(dc) < 1e-3
            ok_all &= good
            print("%-32s %6.3f %8.2f %8.2f %8.2f %7.3f %8.5f %6.1f  %s/%dch/%d %s" % (
                rel + ".ogg", dur, pk, r, st, sub, dc, size / 1024.0, codec, ch, rate,
                "OK" if good else "CHECK"))
    print("-" * len(hdr))
    print("peak/rms: decoded .ogg (dBFS); maxST: loudest 100 ms window; <40Hz%: share of energy below 40 Hz")
    print("total size: %.1f KB in %d files" % (total / 1024.0, sum(len(f) for _, f in EVENTS)))
    return ok_all


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="comma-separated relative paths to (re)generate")
    ap.add_argument("--wav-dir", default=DEFAULT_WAV_DIR, help="where intermediate WAVs go")
    ap.add_argument("--no-verify", action="store_true")
    args = ap.parse_args()
    wav_dir = os.path.abspath(args.wav_dir)
    if os.path.commonpath([wav_dir, REPO]) == REPO:
        sys.exit("refusing to write intermediate WAVs inside the repository: " + wav_dir)
    names = list(SPECS) if not args.only else [s.strip() for s in args.only.split(",") if s.strip()]
    for rel in names:
        if rel not in SPECS:
            sys.exit("unknown sound: " + rel)
    started = time.time()
    for rel in names:
        t = time.time()
        render(rel, wav_dir)
        print("rendered %-28s %.2fs" % (rel, time.time() - t), flush=True)
    write_sounds_json()
    print("wrote %s (%d events) in %.1fs" % (os.path.relpath(SOUNDS_JSON, REPO), len(EVENTS),
                                             time.time() - started))
    if not args.no_verify:
        if not verify():
            sys.exit("some files are out of spec (see CHECK rows)")


if __name__ == "__main__":
    main()
