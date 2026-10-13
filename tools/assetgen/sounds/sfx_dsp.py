"""DSP primitives for the CaliberCraft procedural sound generator.

Everything here is plain numpy + scipy.signal. All randomness comes from a caller-supplied
``numpy.random.Generator`` so every sound is reproducible from its seed.
"""
from __future__ import annotations

import numpy as np
from scipy import signal

SR = 44100
TWO_PI = 2.0 * np.pi


# --------------------------------------------------------------------------------------------
# basic helpers
# --------------------------------------------------------------------------------------------
def ns(sec: float) -> int:
    """Seconds -> sample count (at least 1)."""
    return max(1, int(round(sec * SR)))


def tvec(n: int) -> np.ndarray:
    return np.arange(n) / SR


def db2lin(db: float) -> float:
    return float(10.0 ** (db / 20.0))


def lin2db(x: float) -> float:
    return float(20.0 * np.log10(max(abs(x), 1e-12)))


def peak(x: np.ndarray) -> float:
    return float(np.max(np.abs(x))) if len(x) else 0.0


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def normalize(x: np.ndarray, target: float = 1.0) -> np.ndarray:
    p = peak(x)
    return x * (target / p) if p > 0 else x


def fit(x: np.ndarray, n: int) -> np.ndarray:
    """Pad with zeros or crop to exactly n samples."""
    if len(x) >= n:
        return x[:n].copy()
    return np.concatenate([x, np.zeros(n - len(x))])


def place(dst: np.ndarray, src: np.ndarray, at: float, gain: float = 1.0) -> np.ndarray:
    """Mix ``src`` into ``dst`` starting at time ``at`` (seconds). Clipped to dst bounds."""
    i = int(round(at * SR))
    if i < 0:
        src = src[-i:]
        i = 0
    if i >= len(dst) or len(src) == 0:
        return dst
    m = min(len(src), len(dst) - i)
    dst[i:i + m] += gain * src[:m]
    return dst


def delay(x: np.ndarray, sec: float) -> np.ndarray:
    d = int(round(sec * SR))
    if d <= 0:
        return x.copy()
    return np.concatenate([np.zeros(d), x])[:len(x)]


# --------------------------------------------------------------------------------------------
# noise
# --------------------------------------------------------------------------------------------
def white(rng: np.random.Generator, n: int) -> np.ndarray:
    return rng.standard_normal(n)


def colored(rng: np.random.Generator, n: int, slope_db_oct: float = -3.0) -> np.ndarray:
    """Noise with a spectral slope (dB/octave): -3 = pink, -6 = brown."""
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1.0 / SR)
    f[0] = f[1] if n > 1 else 1.0
    spec *= (f / 1000.0) ** (slope_db_oct / 6.0206)
    y = np.fft.irfft(spec, n)
    return y / (rms(y) + 1e-12)


def crackle(rng: np.random.Generator, n: int, rate: float, smooth: float = 0.0) -> np.ndarray:
    """Sparse random impulses (Poisson, ``rate`` per second) with heavy-tailed amplitudes."""
    y = np.zeros(n)
    k = rng.poisson(rate * n / SR)
    if k:
        pos = rng.integers(0, n, k)
        amp = rng.standard_normal(k) * (1.0 + rng.pareto(3.0, k))
        np.add.at(y, pos, amp)
    if smooth > 0:
        a = np.exp(-1.0 / (smooth * SR))
        y = signal.lfilter([1.0 - a], [1.0, -a], y)
    return y


# --------------------------------------------------------------------------------------------
# filters
# --------------------------------------------------------------------------------------------
def _cf(f: float) -> float:
    return float(np.clip(f, 10.0, SR * 0.49))


def lp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, _cf(fc), "lowpass", fs=SR, output="sos"), x)


def hp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, _cf(fc), "highpass", fs=SR, output="sos"), x)


def bp(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    lo, hi = _cf(lo), _cf(hi)
    if hi <= lo * 1.05:
        hi = min(lo * 1.05, SR * 0.49)
    return signal.sosfilt(signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x)


def _rbj(kind: str, f0: float, q: float, gain_db: float):
    w0 = TWO_PI * _cf(f0) / SR
    cw, sw = np.cos(w0), np.sin(w0)
    A = 10.0 ** (gain_db / 40.0)
    if kind in ("lowshelf", "highshelf"):
        alpha = sw / 2.0 * np.sqrt(2.0)
    else:
        alpha = sw / (2.0 * q)
    if kind == "bandpass":  # constant 0 dB peak gain
        b = [alpha, 0.0, -alpha]
        a = [1 + alpha, -2 * cw, 1 - alpha]
    elif kind == "peak":
        b = [1 + alpha * A, -2 * cw, 1 - alpha * A]
        a = [1 + alpha / A, -2 * cw, 1 - alpha / A]
    elif kind == "lowshelf":
        sa = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) - (A - 1) * cw + sa), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sa)]
        a = [(A + 1) + (A - 1) * cw + sa, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sa]
    elif kind == "highshelf":
        sa = 2 * np.sqrt(A) * alpha
        b = [A * ((A + 1) + (A - 1) * cw + sa), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sa)]
        a = [(A + 1) - (A - 1) * cw + sa, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sa]
    else:
        raise ValueError(kind)
    return np.array(b) / a[0], np.array(a) / a[0]


def eq(x: np.ndarray, kind: str, f0: float, q: float = 0.707, gain_db: float = 0.0) -> np.ndarray:
    b, a = _rbj(kind, f0, q, gain_db)
    return signal.lfilter(b, a, x)


def reso(x: np.ndarray, f0: float, q: float) -> np.ndarray:
    """Resonant band-pass (0 dB at f0)."""
    return eq(x, "bandpass", f0, q)


def svf(x: np.ndarray, fc, q, mode: str = "bp") -> np.ndarray:
    """Time-varying TPT state-variable filter. ``fc``/``q`` may be scalars or per-sample arrays.

    mode: 'bp' (unity peak gain), 'lp' or 'hp'.
    """
    x = np.asarray(x, dtype=float)
    n = len(x)
    fc = np.clip(np.broadcast_to(np.asarray(fc, dtype=float), (n,)), 10.0, SR * 0.45)
    q = np.broadcast_to(np.asarray(q, dtype=float), (n,))
    g = np.tan(np.pi * fc / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    xs, A1, A2, A3 = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    lpl = [0.0] * n
    bpl = [0.0] * n
    ic1 = ic2 = 0.0
    for i in range(n):
        v3 = xs[i] - ic2
        v1 = A1[i] * ic1 + A2[i] * v3
        v2 = ic2 + A2[i] * ic1 + A3[i] * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        bpl[i] = v1
        lpl[i] = v2
    bpo = np.array(bpl)
    lpo = np.array(lpl)
    if mode == "bp":
        return bpo * k
    if mode == "lp":
        return lpo
    if mode == "hp":
        return x - k * bpo - lpo
    raise ValueError(mode)


# --------------------------------------------------------------------------------------------
# envelopes & oscillators
# --------------------------------------------------------------------------------------------
def env_exp(n: int, tau: float, attack: float = 0.0002, delay_s: float = 0.0) -> np.ndarray:
    """Exponential decay with a smooth exponential attack. Zero before ``delay_s``."""
    t = tvec(n) - delay_s
    tp = np.maximum(t, 0.0)
    e = np.exp(-tp / max(tau, 1e-6))
    if attack > 0:
        e = e * (1.0 - np.exp(-tp / attack))
    e[t < 0] = 0.0
    return e


def env_pts(n: int, pts) -> np.ndarray:
    """Piecewise-linear envelope through (time, value) points."""
    ts = [p[0] for p in pts]
    vs = [p[1] for p in pts]
    return np.interp(tvec(n), ts, vs)


def env_swell(n: int, start: float, attack: float, hold: float, release: float, curve: float = 2.0) -> np.ndarray:
    """Smooth (sin^curve) rise, hold, smooth fall."""
    t = tvec(n) - start
    e = np.zeros(n)
    a = (t >= 0) & (t < attack)
    e[a] = np.sin(0.5 * np.pi * t[a] / max(attack, 1e-6)) ** curve
    h = (t >= attack) & (t < attack + hold)
    e[h] = 1.0
    r = (t >= attack + hold) & (t < attack + hold + release)
    e[r] = np.cos(0.5 * np.pi * (t[r] - attack - hold) / max(release, 1e-6)) ** curve
    return e


def osc(freq, phase: float = 0.0) -> np.ndarray:
    """Sine oscillator following a per-sample frequency array."""
    freq = np.asarray(freq, dtype=float)
    return np.sin(phase + TWO_PI * np.cumsum(freq) / SR)


def sweep_exp(n: int, f0: float, f1: float, tau: float) -> np.ndarray:
    """Exponential glide from f0 towards f1 with time constant tau."""
    return f1 + (f0 - f1) * np.exp(-tvec(n) / max(tau, 1e-6))


def taper(y: np.ndarray, frac: float = 0.15, min_s: float = 0.01) -> np.ndarray:
    """In-place cosine fade over the end of a generated component (prevents truncation clicks)."""
    n = len(y)
    tap = min(max(ns(min_s), int(n * frac)), n // 2)
    if tap > 1:
        y[-tap:] *= np.cos(0.5 * np.pi * np.arange(1, tap + 1) / tap) ** 2
    return y


def fade(x: np.ndarray, fin: float = 0.003, fout: float = 0.03) -> np.ndarray:
    y = x.copy()
    a = min(ns(fin), len(y))
    if a > 1:
        y[:a] *= np.sin(0.5 * np.pi * np.arange(a) / a) ** 2
    b = min(ns(fout), len(y))
    if b > 1:
        y[-b:] *= np.cos(0.5 * np.pi * np.arange(1, b + 1) / b) ** 2
    return y


# --------------------------------------------------------------------------------------------
# modal synthesis
# --------------------------------------------------------------------------------------------
def resonators(exc: np.ndarray, freqs, decays, amps) -> np.ndarray:
    """Bank of 2-pole resonators; an impulse at exc[0] yields sum a*exp(-t/d)*sin(2*pi*f*t)."""
    out = np.zeros(len(exc))
    for f, d, a in zip(freqs, decays, amps):
        if f <= 20.0 or f >= SR * 0.46 or a == 0:
            continue
        w = TWO_PI * f / SR
        r = np.exp(-1.0 / (max(d, 1e-5) * SR))
        out += signal.lfilter([a * np.sin(w)], [1.0, -2.0 * r * np.cos(w), r * r], exc)
    return out


def modal(n: int, freqs, decays, amps, exc: np.ndarray | None = None) -> np.ndarray:
    """Impulse-excited (or ``exc``-excited) modal bank of length n."""
    if exc is None:
        exc = np.zeros(n)
        exc[0] = 1.0
    else:
        exc = fit(exc, n)
    y = resonators(exc, freqs, decays, amps)
    tap = min(max(ns(0.01), n // 8), n // 2)  # taper the buffer end so truncated rings never click
    if tap > 1:
        y[-tap:] *= np.cos(0.5 * np.pi * np.arange(1, tap + 1) / tap) ** 2
    return y


# --------------------------------------------------------------------------------------------
# space
# --------------------------------------------------------------------------------------------
def convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    return signal.fftconvolve(x, ir)[:len(x)]


def make_ir(rng: np.random.Generator, rt60: float, dur: float | None = None, predelay: float = 0.0,
            hf: float = 0.45, lf: float = 1.2, lp_hz: float = 8000.0, buildup: float = 0.008,
            early=(), early_lp: float = 3000.0, early_smear: float = 0.008) -> np.ndarray:
    """Synthetic decaying-noise impulse response with frequency dependent decay.

    early: iterable of (time_s, gain_relative_to_diffuse_peak) discrete reflections, each
    smeared with a short decaying noise grain and low-passed (outdoor 'slap' echoes).
    """
    dur = dur if dur else rt60 * 1.05
    n = ns(dur)
    t = tvec(n)
    w = white(rng, n)
    lo = lp(w, 500.0, 2)
    hi = hp(w, 3500.0, 2)
    mid = w - lo - hi

    def dec(r):
        return np.exp(-6.9078 * t / max(r, 1e-3))

    ir = lo * dec(rt60 * lf) + mid * dec(rt60) + hi * dec(rt60 * hf)
    ir *= 1.0 - np.exp(-t / max(buildup, 1e-4))
    if lp_hz:
        ir = lp(ir, lp_hz, 2)
    pk = peak(ir)
    for et, eg in early:
        gl = ns(early_smear * 4)
        grain = lp(white(rng, gl), early_lp, 2) * env_exp(gl, early_smear, 0.0004)
        grain = normalize(grain)
        place(ir, grain, et, eg * pk)
    tap = min(ns(0.05), n // 4)
    if tap > 1:
        ir[-tap:] *= np.cos(0.5 * np.pi * np.arange(1, tap + 1) / tap) ** 2
    if predelay > 0:
        ir = np.concatenate([np.zeros(ns(predelay)), ir])
    return ir / (np.sqrt(np.sum(ir ** 2)) + 1e-12)


def rolling_ir(rng: np.random.Generator, dur: float, rt60: float, first: float = 0.07, swell: float = 0.35,
               taps: int = 60, lp_start: float = 1800.0, lp_end: float = 350.0, diffuse: float = 0.5,
               slaps=()) -> np.ndarray:
    """Long 'rolling' outdoor echo IR (terrain reflections) for distant gunfire / big tails.

    Discrete smeared echoes whose density/level swells up around ``swell`` seconds and then decays,
    over a diffuse decaying floor; high frequencies die away over time.
    """
    n = ns(dur)
    t = tvec(n)
    ir = np.zeros(n)
    decay = np.exp(-6.9078 * t / max(rt60, 1e-3))
    shape = (np.maximum(t - first, 0) / swell) * np.exp(1.0 - np.maximum(t - first, 0) / swell)
    shape = np.maximum(shape, 0.0)
    envl = shape * decay
    # discrete taps: sample their times from the envelope itself
    cdf = np.cumsum(envl)
    if cdf[-1] > 0:
        cdf /= cdf[-1]
        times = np.interp(rng.uniform(0, 1, taps), cdf, t)
        for tt in times:
            g = np.interp(tt, t, envl) * rng.uniform(0.25, 1.0) * rng.choice([-1.0, 1.0])
            gl = ns(rng.uniform(0.006, 0.03))
            grain = white(rng, gl) * env_exp(gl, gl / SR / 3.0, 0.0008)
            place(ir, normalize(grain), tt, g)
    for st, sg in slaps:
        gl = ns(0.05)
        grain = normalize(lp(white(rng, gl), 2500.0, 2) * env_exp(gl, 0.012, 0.0008))
        place(ir, grain, st, sg * peak(envl))
    floor = white(rng, n) * envl * diffuse
    ir = ir + floor
    # progressive damping: highs fade sooner than lows
    lo = lp(ir, lp_end, 2)
    hi = lp(ir, lp_start, 2) - lo
    ir = lo + hi * np.exp(-t / max(rt60 * 0.25, 0.05))
    tap = min(ns(0.1), n // 4)
    ir[-tap:] *= np.cos(0.5 * np.pi * np.arange(1, tap + 1) / tap) ** 2
    return ir / (np.sqrt(np.sum(ir ** 2)) + 1e-12)


def add_space(dry: np.ndarray, ir: np.ndarray, rel_peak: float, src: np.ndarray | None = None) -> np.ndarray:
    """Convolve (src or dry) with ir and scale the wet so its peak is rel_peak * peak(dry)."""
    wet = convolve(dry if src is None else src, ir)
    pw = peak(wet)
    if pw <= 0:
        return dry.copy()
    return dry + wet * (rel_peak * peak(dry) / pw)


# --------------------------------------------------------------------------------------------
# dynamics & finishing
# --------------------------------------------------------------------------------------------
def softclip(x: np.ndarray, drive: float = 1.0) -> np.ndarray:
    """tanh saturation for a signal normalised to ~1 (output peak stays ~1)."""
    if drive <= 0.01:
        return x
    return np.tanh(drive * x) / np.tanh(drive)


def asym_clip(x: np.ndarray, drive: float, bias: float = 0.15) -> np.ndarray:
    """Asymmetric saturation (adds even harmonics, 'harsh'); DC removed afterwards by caller."""
    y = np.tanh(drive * (x + bias)) - np.tanh(drive * bias)
    return y / (peak(y) + 1e-12)


def finish(x: np.ndarray, peak_db: float, length: float | None = None, fin: float = 0.003,
           fout: float = 0.03, hp_hz: float = 22.0) -> np.ndarray:
    """DC/rumble high-pass, crop, click-free fades, peak normalisation."""
    if length is not None:
        x = fit(x, ns(length))
    x = hp(x, hp_hz, 2)
    x = fade(x, fin, fout)
    return normalize(x, db2lin(peak_db))
